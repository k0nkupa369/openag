import { existsSync, readFileSync } from "node:fs";
import { commitMemoryOrThrow } from "./datagit.js";
import type { Approvals } from "./approvals.js";
import type { Db } from "./db/index.js";
import type { Ledger } from "./ledger.js";
import { appendMemoryNote, appendOwnerNote, memoryPath, ownerNoteRefusal, ownerNotesPath, readMemoryHead } from "./memory.js";
import { getDefaultRedactor } from "./redact.js";
import { ProposalsSchema, REFLECTION_SKILL_ARCHIVE_TOOL, REFLECTION_SKILL_REVISE_TOOL, REFLECTION_SKILL_TOOL } from "./reflection-schema.js";
import { getDefaultBotId } from "./defaultbot.js";
import { resolveDeliveryRoom } from "./delivery.js";
import { getBot, getRoom, addMember } from "./rooms.js";
import { loadSkill, type SkillCatalogue } from "./skills.js";
import { getSetting, localParts, type Reflection as ReflectionSetting } from "./settings.js";
import type { Scheduler } from "./scheduler.js";
import type { Runner } from "./runtimes/runner.js";
import { localDateKey } from "./wake.js";

/**
 * Nightly reflection. A scheduled UNATTENDED turn reads the bot's MEMORY.md and a digest of recent conversation, and
 * returns memory notes and optional skill drafts. The daemon saves validated memory notes automatically.
 * The isolated model turn has no tools. Skills still require acceptance through reflection-apply.ts.
 */

export const REFLECTION_ROOM_ID = "_reflection";
const SYSTEM_ROOM_ID = "_system";
/** The run is due from the setting's time for this many minutes; a later tick never starts it (no catch-up). */
export const REFLECTION_WINDOW_MINUTES = 120;
const DIGEST_CAP = 24_000;
const CLIP = 600;
const DIGEST_ROWS = 500;
const RECENT_RUNS = 10;

export const REFLECTION_INSTRUCTION =
  "Nightly reflection. Review the recent conversation digest and the current MEMORY.md below. Propose only durable facts worth keeping in MEMORY.md, one fact per proposal. Never include secrets, credentials or personal data that is not needed. Do not repeat anything already in MEMORY.md. A durable fact about the owner themselves that every agent should know (who they are, where they live, how they like to work) goes to the shared owner notes as {\"kind\":\"owner_note\",\"text\":\"one short fact\"} instead; do not repeat anything already in the owner notes. The daemon saves valid memory notes automatically; skill drafts require approval. Do not call tools; only return proposals.";
const SKILL_INSTRUCTION =
  'Also propose skills for repeatable workflows the user asked for more than once, as {"kind":"skill","slug":"lowercase-dashes","name":"...","description":"one line","body":"the steps"}.';
const CURATOR_INSTRUCTION =
  'You may also curate agent skills from the usage summary below: {"kind":"skill_revise","slug":"agent-skill-slug","body":"the complete replacement steps","reason":"one line"} only for a skill whose current text is shown and recent conversation shows it was wrong or incomplete, and {"kind":"skill_archive","slug":"agent-skill-slug","reason":"one line"} for a skill that is never or rarely loaded. Shared skills are report only. Every revision and archive waits for the owner.';
const USAGE_MAX_ENTRIES = 40;
const USAGE_MAX_CHARS = 3_000;
const SHOWN_BODIES_MAX_CHARS = 12_000;
const OFTEN_LOADS = 5;
const FORMAT_INSTRUCTION = (skills: boolean) =>
  `Reply with ONLY a JSON object, no other text: {"proposals":[{"kind":"memory_append","text":"one short fact"}]}${skills ? " (skill entries as described above may be added to the list)" : ""}. Reply {"proposals":[]} when nothing is worth keeping.`;

export interface StartResult {
  started: boolean;
  reason?: string;
}

export interface ReflectionRunRow {
  id: number;
  localDate: string;
  startedAt: number;
  finishedAt: number | null;
  status: string;
  memoryProposals: number;
  skillProposals: number;
}

export interface ReflectionStatus {
  setting: ReflectionSetting;
  running: boolean;
  runs: ReflectionRunRow[];
}

export interface Reflection {
  /** force = a manual run: ignores `enabled` and uses a separate run key, so it never blocks the nightly run. */
  runNow(force?: boolean): Promise<StartResult>;
  status(): ReflectionStatus;
  /** Resolves when the run in flight (if any) has finished. */
  idle(): Promise<void>;
}

export interface ReflectionDeps {
  db: Db;
  ledger: Ledger;
  approvals: Pick<Approvals, "request">;
  runner: Runner;
  scheduler: Scheduler;
  /** IANA zone for the local date and the local time window. */
  tz: string;
  dataDir: string;
  /** Skill proposals are only requested and accepted when true (skills are OA-204). Default false. */
  skillsEnabled?: boolean;
  /** Skill curator (revise/archive proposals and the usage summary). Requires skillsEnabled. */
  skills?: SkillCatalogue;
  /** Clock; injectable for tests. */
  now?: () => Date;
}

/** Creates the hidden reflection room, or re-points it at `botId`. Members are exactly that bot. */
function ensureReflectionRoom(db: Db, botId: string): void {
  if (!getRoom(db, REFLECTION_ROOM_ID)) {
    db.prepare("INSERT INTO rooms (id, name, lead_bot_id, created_at) VALUES (?, ?, ?, ?)").run(
      REFLECTION_ROOM_ID,
      "reflection",
      botId,
      Date.now(),
    );
  } else {
    db.prepare("UPDATE rooms SET lead_bot_id = ? WHERE id = ?").run(botId, REFLECTION_ROOM_ID);
    db.prepare("DELETE FROM room_members WHERE room_id = ? AND bot_id <> ?").run(REFLECTION_ROOM_ID, botId);
  }
  addMember(db, REFLECTION_ROOM_ID, botId);
}

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max)}...` : s);

/**
 * The newest conversation lines from non-hidden rooms (ids starting with "_" are hidden), in chronological order,
 * capped at DIGEST_CAP characters. OpenAg's own wake pings and morning brief are left out so reflection reviews real
 * conversation. Text is redacted before it becomes part of a prompt.
 */
export function buildDigest(db: Db, sinceMs: number): string {
  const rows = db
    .prepare(
      `SELECT room_id, ts, actor, type, payload_json FROM events
       WHERE ts >= ? AND type IN ('message', 'bot_output') AND substr(room_id, 1, 1) <> '_'
         AND json_extract(payload_json, '$.source') IS NULL
         AND NOT (actor = 'primary' AND (json_extract(payload_json, '$.wake') = 1 OR json_extract(payload_json, '$.brief') = 1))
         AND (json_extract(payload_json, '$.turnId') IS NULL
              OR json_extract(payload_json, '$.turnId') NOT IN (SELECT id FROM turns WHERE json_extract(state_json, '$.source') IS NOT NULL))
       ORDER BY ts DESC, id DESC LIMIT ?`,
    )
    .all(sinceMs, DIGEST_ROWS) as { room_id: string; ts: number; actor: string; type: string; payload_json: string }[];
  const lines: string[] = [];
  let total = 0;
  for (const r of rows) {
    let text: unknown;
    try {
      text = (JSON.parse(r.payload_json) as { text?: unknown } | null)?.text;
    } catch {
      continue;
    }
    if (typeof text !== "string" || text.trim() === "") continue;
    const line = `${new Date(r.ts).toISOString()} ${r.room_id} ${r.actor} ${r.type}: ${clip(text.trim(), CLIP)}`;
    if (total + line.length + 1 > DIGEST_CAP) break; // newest lines win; the oldest are dropped
    lines.push(line);
    total += line.length + 1;
  }
  return getDefaultRedactor().redactString(lines.reverse().join("\n"));
}

export function buildReflectionPrompt(memoryHead: string, digest: string, skills: boolean, curator?: string): string {
  return [
    REFLECTION_INSTRUCTION,
    ...(skills ? [SKILL_INSTRUCTION] : []),
    ...(skills && curator ? [CURATOR_INSTRUCTION] : []),
    FORMAT_INSTRUCTION(skills),
    "",
    "Current MEMORY.md:",
    memoryHead.trim() || "(empty)",
    "",
    "Recent conversation digest (oldest first):",
    digest || "(nothing recent)",
    ...(skills && curator ? ["", curator] : []),
  ].join("\n");
}

/**
 * The curator's view of one agent's skills: a bounded usage line per active skill, then the full current text of agent
 * skills loaded since `sinceMs` (whole bodies only, newest first, within a cap). `shown` names the agent skills whose
 * text was included; only those may be revised, so a revision is never written blind.
 */
export function buildSkillUsageSummary(skills: SkillCatalogue, botId: string, sinceMs: number): { text: string; shown: Set<string> } {
  const usage = new Map(skills.usage(botId).map((u) => [u.id, u]));
  const entries = skills.list(botId).filter((s) => s.availability === "available");
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const lines: string[] = [];
  let used = 0;
  for (const s of entries.slice(0, USAGE_MAX_ENTRIES)) {
    const u = usage.get(s.id);
    const loads = !u ? "never loaded" : `${u.loadCount >= OFTEN_LOADS ? "often" : "rarely"} loaded ${u.loadCount} time${u.loadCount === 1 ? "" : "s"}, last ${day(u.lastLoadedAt)}`;
    const name = s.name.replace(/\s+/g, " ").slice(0, 80);
    const line = s.source === "agent" ? `- ${s.slug} (agent, version ${s.version}) "${name}": ${loads}` : `- ${s.id} (shared, report only) "${name}": ${loads}`;
    if (used + line.length + 1 > USAGE_MAX_CHARS) break;
    lines.push(line);
    used += line.length + 1;
  }
  if (entries.length > lines.length) lines.push(`(+${entries.length - lines.length} more skills not listed)`);
  const recent = entries
    .filter((s) => s.source === "agent" && (usage.get(s.id)?.lastLoadedAt ?? 0) >= sinceMs)
    .sort((a, b) => usage.get(b.id)!.lastLoadedAt - usage.get(a.id)!.lastLoadedAt);
  const shown = new Set<string>();
  const bodies: string[] = [];
  let budget = SHOWN_BODIES_MAX_CHARS;
  for (const s of recent) {
    const skill = skills.load(botId, s.id);
    if (!skill || skill.body.length > budget) continue;
    budget -= skill.body.length;
    shown.add(skill.slug);
    bodies.push(`--- ${skill.slug} (version ${skill.version})`, skill.body.trimEnd(), "--- end");
  }
  const text = [
    "Skill usage for this agent (skill_load counts):",
    lines.length ? lines.join("\n") : "(no skills)",
    ...(bodies.length ? ["", "Current text of agent skills loaded recently (only these may be revised):", ...bodies] : []),
  ].join("\n");
  return { text: getDefaultRedactor().redactString(text), shown };
}

type Extracted = { state: "empty" } | { state: "invalid" } | { state: "ok"; value: unknown };

/** Tolerant JSON extraction: the whole text, then fenced blocks (last first), then the outermost braces. */
export function extractJson(text: string): Extracted {
  const t = text.trim();
  if (t === "") return { state: "empty" };
  const tryParse = (s: string): Extracted | undefined => {
    try {
      return { state: "ok", value: JSON.parse(s) };
    } catch {
      return undefined;
    }
  };
  const whole = tryParse(t);
  if (whole) return whole;
  const fences = [...t.matchAll(/```[ \t]*(?:json)?[ \t]*\r?\n?([\s\S]*?)```/g)];
  for (let i = fences.length - 1; i >= 0; i--) {
    const hit = tryParse((fences[i]![1] ?? "").trim());
    if (hit) return hit;
  }
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first !== -1 && last > first) {
    const hit = tryParse(t.slice(first, last + 1));
    if (hit) return hit;
  }
  return { state: "invalid" };
}

/** Read retained proposals, never the conversation digest or a reconstructed saved-memory list. */
export function readReflectionDetail(db: Db, id: number) {
  const run = db.prepare("SELECT id FROM reflection_runs WHERE id = ?").get(id);
  if (!run) return undefined;
  const start = db.prepare(`SELECT id, json_extract(payload_json, '$.botId') AS botId FROM events
    WHERE room_id = '_system' AND type = 'reflection_started' AND json_extract(payload_json, '$.runId') = ? ORDER BY id LIMIT 1`).get(id) as { id: number; botId: string } | undefined;
  if (!start) return { botId: null, proposals: null };
  // Fail closed on missing boundaries; clock ties must never mix two runs.
  const end = db.prepare(`SELECT id FROM events WHERE room_id = '_system' AND id > ? AND
    type = 'reflection_finished' AND json_extract(payload_json, '$.runId') = ? ORDER BY id LIMIT 1`).get(start.id, id) as { id: number } | undefined;
  if (!end) return { botId: start.botId, proposals: null };
  const rows = db.prepare(`SELECT substr(json_extract(payload_json, '$.text'), 1, 64001) AS text FROM events
    WHERE room_id = '_reflection' AND actor = ? AND type = 'bot_output' AND id > ? AND id < ?
    ORDER BY id LIMIT 101`).all(start.botId, start.id, end.id) as { text: unknown }[];
  const text = rows.map(r => typeof r.text === "string" ? r.text : "").join("\n");
  if (rows.length > 100 || text.length > 64_000) return { botId: start.botId, proposals: null };
  const extracted = extractJson(text);
  const parsed = extracted.state === "ok" ? ProposalsSchema.safeParse(extracted.value) : null;
  return getDefaultRedactor().redact({ botId: start.botId, proposals: parsed?.success ? parsed.data.proposals : null });
}

/** Comparable form of a MEMORY line or proposal: no list marker, no date stamp, lower case, single spaces. */
export const normaliseMemoryText = (s: string) =>
  s
    .toLowerCase()
    .replace(/^\s*[-*]\s*/, "")
    .replace(/^\d{4}-\d{2}-\d{2}\s+/, "")
    .replace(/\s+/g, " ")
    .trim();

function noteLines(path: string): Set<string> {
  if (!existsSync(path)) return new Set();
  return new Set(readFileSync(path, "utf8").split(/\r?\n/).map(normaliseMemoryText).filter(Boolean));
}

export function registerReflection(deps: ReflectionDeps): Reflection {
  const { db, ledger, approvals, runner, scheduler, tz, dataDir } = deps;
  const skillsEnabled = deps.skillsEnabled === true;
  const clock = deps.now ?? (() => new Date());
  let current: Promise<void> | undefined;

  // A run left "running" by a previous process will never finish: mark it, so the status is honest.
  db.prepare("UPDATE reflection_runs SET status = 'interrupted', finished_at = ? WHERE status = 'running'").run(Date.now());

  /** Minutes since the configured time, or null when outside the window that follows it. */
  const sinceDue = (now: Date, time: string): number | null => {
    const [h, m] = time.split(":").map(Number);
    const target = (h ?? 0) * 60 + (m ?? 0);
    const delta = (localParts(now, tz).minutes - target + 1440) % 1440;
    return delta < REFLECTION_WINDOW_MINUTES ? delta : null;
  };
  const isDue = (now: Date, time: string): boolean => sinceDue(now, time) !== null;

  /** Inserts the run row. A UNIQUE conflict means this key already ran. Returns the row id, or undefined. */
  const claim = (key: string, startedAt: number): number | undefined => {
    try {
      const r = db
        .prepare("INSERT INTO reflection_runs (local_date, started_at, status) VALUES (?, ?, 'running')")
        .run(key, startedAt);
      return Number(r.lastInsertRowid);
    } catch (err) {
      if ((err as { code?: unknown }).code === "SQLITE_CONSTRAINT_UNIQUE") return undefined;
      throw err;
    }
  };

  const finishRun = (runId: number, status: string, memory: number, skill: number) => {
    db.prepare(
      "UPDATE reflection_runs SET status = ?, memory_proposals = ?, skill_proposals = ?, finished_at = ? WHERE id = ?",
    ).run(status, memory, skill, Date.now(), runId);
  };

  const appendSystem = (type: "reflection_started" | "reflection_finished", payload: unknown) => {
    try {
      ledger.append(SYSTEM_ROOM_ID, "scheduler", type, payload);
    } catch (err) {
      console.error("reflection ledger event failed:", err instanceof Error ? err.message : String(err));
    }
  };

  /** A curator proposal for this skill already waiting for the owner; the next night does not repeat it. */
  const pendingCuratorProposal = (botId: string, slug: string) =>
    db.prepare(`SELECT 1 FROM approvals WHERE status = 'pending' AND bot_id = ? AND tool_name IN (?, ?) AND json_extract(payload_json, '$.slug') = ? LIMIT 1`)
      .get(botId, REFLECTION_SKILL_REVISE_TOOL, REFLECTION_SKILL_ARCHIVE_TOOL, slug) !== undefined;

  async function execute(runId: number, key: string, botId: string): Promise<void> {
    let status = "failed";
    let memoryCount = 0;
    let skillCount = 0;
    appendSystem("reflection_started", { runId, localDate: key, botId });
    try {
      const bot = getBot(db, botId);
      if (!bot) throw new Error(`bot ${botId} not found`);
      ensureReflectionRoom(db, bot.id);
      const room = getRoom(db, REFLECTION_ROOM_ID);
      if (!room) throw new Error("reflection room missing");

      const setting = getSetting(db, "reflection");
      const digest = buildDigest(db, Date.now() - setting.lookbackHours * 3_600_000);
      const curator = skillsEnabled && deps.skills ? buildSkillUsageSummary(deps.skills, bot.id, Date.now() - setting.lookbackHours * 3_600_000) : undefined;
      const text = buildReflectionPrompt(readMemoryHead(dataDir, bot.id), digest, skillsEnabled, curator?.text);
      const message = ledger.append(REFLECTION_ROOM_ID, "scheduler", "message", { text, scheduled: true });

      const outputs: string[] = [];
      const unsubscribe = ledger.subscribe(REFLECTION_ROOM_ID, (event) => {
        const p = event.payload as { text?: unknown };
        if (event.type === "bot_output" && typeof p.text === "string") outputs.push(p.text);
        if (event.type === "turn_finished" && (event.payload as { status?: unknown } | null)?.status !== "finished") turnFailed = true;
      });
      let turnFailed = false;
      try {
        await runner.run(room, bot, message, undefined, { unattended: true, isolated: true });
      } finally {
        unsubscribe();
      }
      // A stalled or crashed turn is a failed run, not an empty night.
      if (turnFailed) throw new Error("reflection turn failed");

      const extracted = extractJson(outputs.join("\n"));
      if (extracted.state === "empty") {
        status = "empty";
      } else if (extracted.state === "invalid") {
        status = "invalid";
      } else {
        const parsed = ProposalsSchema.safeParse(extracted.value);
        if (!parsed.success) {
          status = "invalid";
        } else {
          const existing = noteLines(memoryPath(dataDir, bot.id));
          const existingOwner = noteLines(ownerNotesPath(dataDir));
          const seen = new Set<string>();
          for (const proposal of parsed.data.proposals) {
            if (proposal.kind === "memory_append" || proposal.kind === "owner_note") {
              const owner = proposal.kind === "owner_note";
              if (memoryCount >= setting.maxMemoryProposals) continue;
              const norm = normaliseMemoryText(proposal.text);
              const key = `${proposal.kind}:${norm}`;
              if ((owner ? existingOwner : existing).has(norm) || seen.has(key)) continue;
              // A secret or an over-cap owner note is skipped (it would reach every prompt or be truncated).
              if (owner && ownerNoteRefusal(dataDir, proposal.text)) continue;
              seen.add(key);
              if (owner) appendOwnerNote(dataDir, proposal.text);
              else appendMemoryNote(dataDir, bot.id, proposal.text);
              memoryCount++;
              try {
                await commitMemoryOrThrow(dataDir, owner ? `owner notes: reflection save (${bot.id})` : `memory: reflection save (${bot.id})`);
              } catch {
                throw new Error("reflection memory saved; history commit was not confirmed");
              }
            } else if (proposal.kind === "skill_revise" || proposal.kind === "skill_archive") {
              if (!curator || !deps.skills || skillCount >= setting.maxSkillProposals) continue;
              const norm = `skill:${proposal.slug}`;
              if (seen.has(norm)) continue;
              // Only an active agent-owned skill; a revision only of a skill whose text the model was shown.
              const current = deps.skills.load(bot.id, `agent:${bot.id}:${proposal.slug}`);
              if (!current || (proposal.kind === "skill_revise" && (!curator.shown.has(proposal.slug) || proposal.body === current.body))) continue;
              if (pendingCuratorProposal(bot.id, proposal.slug)) continue;
              seen.add(norm);
              skillCount++;
              const base = { slug: current.slug, name: current.name };
              approvals.request({
                roomId: resolveDeliveryRoom(db, ledger) ?? REFLECTION_ROOM_ID,
                botId: bot.id,
                toolName: proposal.kind === "skill_revise" ? REFLECTION_SKILL_REVISE_TOOL : REFLECTION_SKILL_ARCHIVE_TOOL,
                toolClass: "act-local",
                payload: proposal.kind === "skill_revise"
                  ? { ...base, description: current.description, body: proposal.body, reason: proposal.reason, baseVersion: current.version }
                  : { ...base, reason: proposal.reason, baseVersion: current.version },
              });
            } else {
              if (!skillsEnabled || skillCount >= setting.maxSkillProposals) continue;
              // Never propose over an existing skill: accepting would silently replace a trusted workflow.
              if (loadSkill(dataDir, bot.id, proposal.slug)) continue;
              const norm = `skill:${proposal.slug}`;
              if (seen.has(norm)) continue;
              seen.add(norm);
              skillCount++;
              approvals.request({
                roomId: resolveDeliveryRoom(db, ledger) ?? REFLECTION_ROOM_ID,
                botId: bot.id,
                toolName: REFLECTION_SKILL_TOOL,
                toolClass: "act-local",
                payload: {
                  slug: proposal.slug,
                  name: proposal.name,
                  description: proposal.description,
                  body: proposal.body,
                },
              });
            }
          }
          status = memoryCount + skillCount > 0 ? "finished" : "empty";
        }
      }
    } catch (err) {
      // Message only: a failing run must never leak turn content into the log.
      console.error("reflection run failed:", err instanceof Error ? err.message : String(err));
      status = "failed";
    }
    try {
      finishRun(runId, status, memoryCount, skillCount);
    } catch (err) {
      console.error("reflection finish failed:", err instanceof Error ? err.message : String(err));
    }
    appendSystem("reflection_finished", {
      runId,
      localDate: key,
      botId,
      status,
      memoryProposals: memoryCount,
      skillProposals: skillCount,
    });
  }

  /** Claims the run synchronously, then starts it in the background. Never throws. */
  function start(now: Date, force: boolean): StartResult {
    try {
      if (current) return { started: false, reason: "already running" };
      const setting = getSetting(db, "reflection");
      if (!force && !setting.enabled) return { started: false, reason: "disabled" };
      if (!force && !isDue(now, setting.time)) return { started: false, reason: "not due" };
      const botId = setting.botId ?? getDefaultBotId(db);
      if (!botId) return { started: false, reason: "no bot chosen and no default bot" };
      if (!getBot(db, botId)) return { started: false, reason: `bot ${botId} not found` };

      // The night is named by the local date the window STARTED on, so a 23:30 window that runs past midnight is still
      // one night (a plain "today" key would let 00:05 start a second run and then shift the schedule).
      const since = force ? 0 : (sinceDue(now, setting.time) ?? 0);
      const day = localDateKey(new Date(now.getTime() - since * 60_000), tz);
      const key = force ? `${day}#manual-${now.getTime()}` : day;
      const runId = claim(key, now.getTime());
      if (runId === undefined) return { started: false, reason: "already ran for this date" };

      const job = execute(runId, key, botId);
      current = job.finally(() => {
        current = undefined;
      });
      return { started: true };
    } catch (err) {
      console.error("reflection start failed:", err instanceof Error ? err.message : String(err));
      return { started: false, reason: "start failed" };
    }
  }

  scheduler.register({
    id: "reflection",
    schedule: { everyMs: () => 60_000 },
    shouldRun: (now) => {
      const s = getSetting(db, "reflection");
      return s.enabled && isDue(now, s.time);
    },
    run: async (now) => {
      const r = start(now, false);
      if (r.started && current) await current;
    },
  });

  return {
    runNow: async (force = false) => start(clock(), force),
    status() {
      const rows = db
        .prepare(
          "SELECT id, local_date, started_at, finished_at, status, memory_proposals, skill_proposals FROM reflection_runs ORDER BY id DESC LIMIT ?",
        )
        .all(RECENT_RUNS) as {
        id: number;
        local_date: string;
        started_at: number;
        finished_at: number | null;
        status: string;
        memory_proposals: number;
        skill_proposals: number;
      }[];
      return {
        setting: getSetting(db, "reflection"),
        running: current !== undefined,
        runs: rows.map((r) => ({
          id: r.id,
          localDate: r.local_date,
          startedAt: r.started_at,
          finishedAt: r.finished_at,
          status: r.status,
          memoryProposals: r.memory_proposals,
          skillProposals: r.skill_proposals,
        })),
      };
    },
    async idle() {
      await current;
    },
  };
}
