import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { registerReflection } from "./reflection.js";
import { createRunner } from "./runtimes/runner.js";
import { defaultTools } from "./runtimes/tools.js";
import type { BotRuntime, TurnContext } from "./runtimes/types.js";
import { createScheduler } from "./scheduler.js";
import { setSetting } from "./settings.js";
import { resolveReviewed } from "./approvals.testkit.js";
import { createReflectionApplier } from "./reflection-apply.js";
import { REFLECTION_SKILL_ARCHIVE_TOOL, REFLECTION_SKILL_REVISE_TOOL } from "./reflection-schema.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createApprovals, type Approvals } from "./approvals.js";
import { createAuth } from "./auth.js";
import type { Computer } from "./computer.js";
import { commitMemory, ensureDataRepo } from "./datagit.js";
import { type Db, openDb } from "./db/index.js";
import { createGateway } from "./gateway.js";
import { createLedger, type Ledger } from "./ledger.js";
import { ensureMemoryFile } from "./memory.js";
import type { Pusher } from "./push.js";
import { addMember, createBot, createRoom } from "./rooms.js";
import { createSkillCatalogue, saveSkill } from "./skills.js";
import { createFirstPartyTools } from "./tools/firstparty.js";

const OWNER = "owner-token";
const h = (t: string) => ({ authorization: `Bearer ${t}`, "content-type": "application/json" });
const WORKFLOW = { slug: "weekly-review", name: "Weekly review", description: "Review the week", body: "1. List wins" };

let dir: string;
let db: Db;
let ledger: Ledger;
let approvals: Approvals;
let auth: ReturnType<typeof createAuth>;
let app: ReturnType<typeof createGateway>;
const saved = { ...process.env };

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "openag-curator-"));
  process.env.GIT_CONFIG_GLOBAL = "/dev/null";
  db = openDb(dir);
  createBot(db, { id: "boss", runtime: "api" });
  createRoom(db, { id: "main", leadBotId: "boss" });
  addMember(db, "main", "boss");
  ledger = createLedger(db);
  approvals = createApprovals(db, ledger);
  auth = createAuth({ db, ownerToken: OWNER });
  await ensureDataRepo(dir);
  ensureMemoryFile(dir, { id: "boss", name: "boss" });
  await commitMemory(dir, "init memory");
  app = createGateway({ db, ledger, approvals, auth, dispatch: () => undefined, deskDir: join(dir, "no-desk"), dataDir: dir });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  process.env = { ...saved };
  vi.restoreAllMocks();
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const tools = () =>
  createFirstPartyTools({ db, skills: createSkillCatalogue(db, dir), computer: {} as Computer, pusher: { status: () => ({ configured: false, enabled: false }) } as unknown as Pusher }).executors;
const usage = async () => ((await (await app.request("/bots/boss/skill-usage", { headers: h(OWNER) })).json()) as { usage: { id: string; loadCount: number; lastLoadedAt: number }[] }).usage;

describe("skill usage", () => {
  test("each successful skill_load counts once per agent and identity; a failed load counts nothing", async () => {
    saveSkill(dir, "boss", WORKFLOW);
    const exec = tools();
    const before = Date.now();
    await exec.skill_load!({ botId: "boss", dataDir: dir }, { slug: "weekly-review" });
    await exec.skill_load!({ botId: "boss", dataDir: dir }, { slug: "agent:boss:weekly-review" });
    await exec.skill_load!({ botId: "boss", dataDir: dir }, { slug: "missing" });
    const rows = await usage();
    expect(rows).toEqual([{ id: "agent:boss:weekly-review", loadCount: 2, lastLoadedAt: expect.any(Number) }]);
    expect(rows[0]!.lastLoadedAt).toBeGreaterThanOrEqual(before);
  });
});

const applier = () => createReflectionApplier({ ledger, approvals, dataDir: dir, skills: createSkillCatalogue(db, dir) });
const propose = (toolName: string, payload: unknown) =>
  approvals.request({ roomId: "main", botId: "boss", toolName, toolClass: "act-local", payload }).approvalId;
const errors = () => ledger.list("main").filter((e) => e.type === "error").map((e) => (e.payload as { message: string }).message);
const listed = async (query = "") =>
  ((await (await app.request(`/bots/boss/skills${query}`, { headers: h(OWNER) })).json()) as { skills: { id: string }[] }).skills.map((s) => s.id);
const index = () => createSkillCatalogue(db, dir).index("boss");
async function accept(toolName: string, payload: unknown) {
  const a = applier();
  resolveReviewed(approvals, propose(toolName, payload), { kind: "accept" });
  await a.idle();
  a.dispose();
}
const ARCHIVE = { slug: "weekly-review", name: "Weekly review", reason: "Unused since August", baseVersion: 1 };

describe("nightly reflection as curator", () => {
  let turnHook: (ctx: TurnContext) => void = () => undefined;
  const fake: BotRuntime = { async runTurn(ctx) { turnHook(ctx); } };
  function setupLibrary() {
    const root = join(dir, "library");
    mkdirSync(join(root, "pdf"), { recursive: true });
    writeFileSync(join(root, "pdf", "SKILL.md"), "---\nname: PDF\ndescription: Read PDFs\n---\nSteps");
    const skills = createSkillCatalogue(db, dir, root);
    skills.setEnabled(true);
    skills.assign("boss", ["shared:pdf"]);
    return skills;
  }
  function register() {
    const skills = setupLibrary();
    const runner = createRunner({ db, ledger, approvals, dataDir: dir, runtimes: { api: fake, acp: fake }, tools: defaultTools, skills });
    setSetting(db, "reflection", { enabled: true, time: "03:30", botId: "boss", lookbackHours: 24, maxMemoryProposals: 5, maxSkillProposals: 5 });
    return { skills, reflection: registerReflection({ db, ledger, approvals, runner, scheduler: createScheduler({ now: () => new Date() }), tz: "UTC", dataDir: dir, skillsEnabled: true, skills }) };
  }
  const reply = (proposals: unknown[]) => (ctx: TurnContext) =>
    ctx.ledger.append(ctx.room.id, ctx.bot.id, "bot_output", { turnId: ctx.turnId, text: JSON.stringify({ proposals }) });
  const prompt = () => (ledger.list("_reflection").find((e) => e.type === "message")!.payload as { text: string }).text;
  const pending = () => (db.prepare("SELECT tool_name, payload_json FROM approvals WHERE status = 'pending' ORDER BY tool_name").all() as { tool_name: string; payload_json: string }[])
    .map((r) => ({ tool: r.tool_name, payload: JSON.parse(r.payload_json) }));
  const PROPOSALS = [
    { kind: "skill_revise", slug: "weekly-review", body: "1. List wins\n2. List misses", reason: "Misses were skipped" },
    { kind: "skill_archive", slug: "old-report", reason: "Never loaded" },
    { kind: "skill_revise", slug: "old-report", body: "blind rewrite", reason: "Body was not shown" },
    { kind: "skill_archive", slug: "pdf", reason: "Shared skills are report only" },
    { kind: "skill_archive", slug: "missing", reason: "No such skill" },
  ];

  test("the reflection prompt carries a usage summary and the current text of recently loaded agent skills", async () => {
    saveSkill(dir, "boss", WORKFLOW);
    saveSkill(dir, "boss", { slug: "old-report", name: "Old report", description: "Monthly report", body: "SECRET-FREE OLD BODY" });
    const { skills, reflection } = register();
    skills.recordLoad("boss", "agent:boss:weekly-review");
    skills.recordLoad("boss", "shared:pdf");
    await reflection.runNow(true);
    await reflection.idle();
    const text = prompt();
    expect(text).toMatch(/weekly-review .*loaded 1 time/);
    expect(text).toMatch(/old-report .*never loaded/);
    expect(text).toMatch(/shared:pdf .*report only/);
    expect(text).toContain("1. List wins");
    expect(text).not.toContain("SECRET-FREE OLD BODY");
  });

  test("revise and archive proposals for agent skills wait as approvals carrying the base version; others are dropped", async () => {
    saveSkill(dir, "boss", WORKFLOW);
    saveSkill(dir, "boss", { slug: "old-report", name: "Old report", description: "Monthly report", body: "Old body" });
    const { skills, reflection } = register();
    skills.recordLoad("boss", "agent:boss:weekly-review");
    turnHook = reply(PROPOSALS);
    await reflection.runNow(true);
    await reflection.idle();
    expect(pending()).toEqual([
      { tool: REFLECTION_SKILL_ARCHIVE_TOOL, payload: { slug: "old-report", name: "Old report", reason: "Never loaded", baseVersion: 1 } },
      { tool: REFLECTION_SKILL_REVISE_TOOL, payload: { slug: "weekly-review", name: "Weekly review", description: "Review the week", body: "1. List wins\n2. List misses", reason: "Misses were skipped", baseVersion: 1 } },
    ]);
    expect(existsSync(join(dir, "bots", "boss", "skills", "weekly-review", "SKILL.md"))).toBe(true);
    expect(readFileSync(join(dir, "bots", "boss", "skills", "weekly-review", "SKILL.md"), "utf8")).toContain("version: 1");

    // The next night repeats itself: a proposal already waiting for the owner is not proposed again.
    await reflection.runNow(true);
    await reflection.idle();
    expect(pending()).toHaveLength(2);
  });
});

describe("skill_revise proposals", () => {
  const REVISE = { slug: "weekly-review", name: "Weekly review", description: "Review the week", body: "1. List wins\n2. List misses", reason: "Misses were skipped", baseVersion: 1 };
  const skillText = () => readFileSync(join(dir, "bots", "boss", "skills", "weekly-review", "SKILL.md"), "utf8");
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();

  test("an accepted revision is a new version and the previous version stays in history", async () => {
    saveSkill(dir, "boss", { ...WORKFLOW, triggers: ["weekly"] });
    await commitMemory(dir, "skill v1");
    await accept(REFLECTION_SKILL_REVISE_TOOL, REVISE);
    expect(errors()).toEqual([]);
    expect(skillText()).toContain("version: 2");
    expect(skillText()).toContain("2. List misses");
    expect(skillText()).toContain("triggers: weekly");
    expect(git("show", "HEAD~1:bots/boss/skills/weekly-review/SKILL.md")).toContain("version: 1");
    expect(git("log", "-1", "--format=%s")).toBe("skills: reflection revise weekly-review (boss)");
  });

  test("the owner may edit a revision before accepting; an archive proposal is not editable", async () => {
    saveSkill(dir, "boss", WORKFLOW);
    const a = applier();
    const id = propose(REFLECTION_SKILL_REVISE_TOOL, REVISE);
    expect(approvals.get(id)?.canEdit).toBe(true);
    expect(approvals.get(propose(REFLECTION_SKILL_ARCHIVE_TOOL, ARCHIVE))?.canEdit).toBe(false);
    resolveReviewed(approvals, id, { kind: "edit", payload: { ...REVISE, body: "1. Owner's steps" } });
    await a.idle();
    a.dispose();
    expect(skillText()).toContain("1. Owner's steps");
  });

  test("an edit cannot change the target skill, its base version or the reason; a stale edit is still refused", async () => {
    saveSkill(dir, "boss", WORKFLOW);
    saveSkill(dir, "boss", { ...WORKFLOW, slug: "other", name: "Other" });
    const id = propose(REFLECTION_SKILL_REVISE_TOOL, REVISE);
    expect(() => resolveReviewed(approvals, id, { kind: "edit", payload: { ...REVISE, slug: "other" } })).toThrow(/only the body/);
    expect(() => resolveReviewed(approvals, id, { kind: "edit", payload: { ...REVISE, baseVersion: 2 } })).toThrow(/only the body/);
    expect(() => resolveReviewed(approvals, id, { kind: "edit", payload: { ...REVISE, reason: "Different" } })).toThrow(/only the body/);
    expect(approvals.get(id)?.status).toBe("pending");
    saveSkill(dir, "boss", { ...WORKFLOW, body: "1. Newer work" });
    const a = applier();
    resolveReviewed(approvals, id, { kind: "edit", payload: { ...REVISE, name: "Renamed", body: "1. Owner's steps" } });
    await a.idle();
    a.dispose();
    expect(errors()).toEqual([expect.stringMatching(/changed after this proposal/)]);
    expect(skillText()).toContain("1. Newer work");
  });

  test("a stale revision is refused and the newer version stays", async () => {
    saveSkill(dir, "boss", WORKFLOW);
    const id = propose(REFLECTION_SKILL_REVISE_TOOL, REVISE);
    saveSkill(dir, "boss", { ...WORKFLOW, body: "1. Newer work" });
    const a = applier();
    resolveReviewed(approvals, id, { kind: "accept" });
    await a.idle();
    a.dispose();
    expect(errors()).toEqual([expect.stringMatching(/changed after this proposal/)]);
    expect(skillText()).toContain("1. Newer work");
    expect(skillText()).toContain("version: 2");
  });

  test("an archived skill is not revised", async () => {
    saveSkill(dir, "boss", WORKFLOW);
    await accept(REFLECTION_SKILL_ARCHIVE_TOOL, ARCHIVE);
    await accept(REFLECTION_SKILL_REVISE_TOOL, REVISE);
    expect(errors()).toEqual([expect.stringMatching(/archived/)]);
    expect(skillText()).toContain("version: 1");
  });
});

describe("skill_archive proposals", () => {
  test("an accepted archive removes the skill from the index and skill_list, keeps the file, and the owner can restore it", async () => {
    saveSkill(dir, "boss", WORKFLOW);
    await accept(REFLECTION_SKILL_ARCHIVE_TOOL, ARCHIVE);
    expect(errors()).toEqual([]);
    expect(index()).not.toContain("weekly-review");
    expect(await listed()).toEqual([]);
    const list = await tools().skill_list!({ botId: "boss", dataDir: dir }, { query: "", offset: 0, includeAvailable: false });
    expect((list as { skills: unknown[] }).skills).toEqual([]);
    await expect(tools().skill_load!({ botId: "boss", dataDir: dir }, { slug: "weekly-review" })).resolves.toEqual({ found: false });
    expect(existsSync(join(dir, "bots", "boss", "skills", "weekly-review", "SKILL.md"))).toBe(true);

    const archived = (await (await app.request("/bots/boss/skills?archived=1", { headers: h(OWNER) })).json()) as { skills: unknown[] };
    expect(archived.skills).toEqual([{ id: "agent:boss:weekly-review", slug: "weekly-review", name: "Weekly review", description: "Review the week",
      version: 1, reason: "Unused since August", archivedAt: expect.any(Number), loadCount: 0, lastLoadedAt: null }]);

    const phone = auth.createDevice("phone");
    expect((await app.request("/bots/boss/skills/weekly-review/restore", { method: "POST", headers: h(phone.token) })).status).toBe(403);
    expect((await app.request("/bots/boss/skills/weekly-review/restore", { method: "POST", headers: h(OWNER) })).status).toBe(200);
    expect(await listed()).toEqual(["agent:boss:weekly-review"]);
    expect(index()).toContain("weekly-review");
    expect((await app.request("/bots/boss/skills/weekly-review/restore", { method: "POST", headers: h(OWNER) })).status).toBe(404);
  });

  test("a stale archive (the skill changed after the proposal) is refused and changes nothing", async () => {
    saveSkill(dir, "boss", WORKFLOW);
    const id = propose(REFLECTION_SKILL_ARCHIVE_TOOL, ARCHIVE);
    saveSkill(dir, "boss", { ...WORKFLOW, body: "1. List wins\n2. Plan next week" });
    const a = applier();
    resolveReviewed(approvals, id, { kind: "accept" });
    await a.idle();
    a.dispose();
    expect(errors()).toEqual([expect.stringMatching(/changed after this proposal/)]);
    expect(await listed()).toEqual(["agent:boss:weekly-review"]);
  });

  test("saving a new version of an archived skill makes it active again", async () => {
    saveSkill(dir, "boss", WORKFLOW);
    await accept(REFLECTION_SKILL_ARCHIVE_TOOL, ARCHIVE);
    saveSkill(dir, "boss", WORKFLOW);
    expect(await listed()).toEqual(["agent:boss:weekly-review"]);
  });

  test("a shared library identity is never archived", async () => {
    await accept(REFLECTION_SKILL_ARCHIVE_TOOL, { ...ARCHIVE, slug: "shared:pdf" });
    expect(errors()).toEqual([expect.stringMatching(/invalid/)]);
  });
});
