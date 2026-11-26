import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createApprovals } from "../approvals.js";
import { type Db, openDb } from "../db/index.js";
import { createLedger } from "../ledger.js";
import { appendMemoryNote, memoryPath, ownerNotesPath } from "../memory.js";
import { addMember, createBot, createRoom, getBot, getRoom } from "../rooms.js";
import { createRunner } from "./runner.js";
import { defaultTools } from "./tools.js";
import type { BotRuntime, TurnContext } from "./types.js";

let dir: string;
let db: Db;
const prompts: string[] = [];
let onTurn: (botId: string) => void = () => undefined;

const fake: BotRuntime = {
  async runTurn(ctx) {
    prompts.push(ctx.prompt);
    onTurn(ctx.bot.id);
    ctx.ledger.append(ctx.room.id, ctx.bot.id, "bot_output", { turnId: ctx.turnId, text: "ok" });
  },
};

const git = (args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "openag-runner-memory-"));
  db = openDb(dir);
  createBot(db, { id: "boss", runtime: "api" });
  createRoom(db, { id: "main", leadBotId: "boss" });
  addMember(db, "main", "boss");
  prompts.length = 0;
  onTurn = () => undefined;
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function setup() {
  const ledger = createLedger(db);
  const approvals = createApprovals(db, ledger);
  const runner = createRunner({ db, ledger, approvals, dataDir: dir, runtimes: { api: fake, acp: fake }, tools: defaultTools });
  const say = (text: string) => {
    const message = ledger.append("main", "user", "message", { text });
    return runner.run(getRoom(db, "main")!, getBot(db, "boss")!, message);
  };
  return { say };
}

describe("runner memory", () => {
  test("injects the MEMORY head, reflects hand edits, and commits only when MEMORY changed", async () => {
    const { say } = setup();

    await say("first");
    expect(prompts[0]).toContain("Your standing notes (MEMORY.md):");
    expect(prompts[0]).toContain("# Memory: boss");

    writeFileSync(memoryPath(dir, "boss"), "- hand edit marker\n");
    await say("second");
    expect(prompts[1]).toContain("- hand edit marker");
    expect(prompts[1]).not.toContain("Standing notes for this bot");

    const commitsBefore = git(["rev-list", "--count", "HEAD"]);
    await say("third, no memory change");
    expect(git(["rev-list", "--count", "HEAD"])).toBe(commitsBefore);

    onTurn = () => appendMemoryNote(dir, "boss", "learned something");
    await say("fourth, changes memory");
    expect(git(["log", "--format=%s"]).split("\n")[0]).toBe("memory: update after turn by boss");
    expect(git(["log", "--format=%an"]).split("\n")[0]).toBe("openagd");
  });

  test("every agent's context carries the owner notes head before its own MEMORY.md", async () => {
    createBot(db, { id: "coder", runtime: "acp" });
    addMember(db, "main", "coder");
    writeFileSync(ownerNotesPath(dir), "- 2026-11-01 Lives in Auckland\n");
    const hosted: NonNullable<TurnContext["hostedInput"]>[] = [];
    onTurn = () => undefined;
    const ledger = createLedger(db);
    const runner = createRunner({ db, ledger, approvals: createApprovals(db, ledger), dataDir: dir, tools: defaultTools,
      runtimes: { api: { async runTurn(ctx) { hosted.push(ctx.hostedInput!); } }, acp: fake } });
    const ask = (botId: string) => runner.run(getRoom(db, "main")!, getBot(db, botId)!, ledger.append("main", "user", "message", { text: "hi" }));

    await ask("coder");
    const prompt = prompts.at(-1)!;
    expect(prompt).toContain("Lives in Auckland");
    expect(prompt.indexOf("Lives in Auckland")).toBeLessThan(prompt.indexOf("Your standing notes (MEMORY.md):"));

    await ask("boss");
    const sources = hosted.at(-1)!.data.map((d) => d.source);
    expect(hosted.at(-1)!.data.find((d) => d.source === "owner_notes")?.content).toContain("Lives in Auckland");
    expect(sources.indexOf("owner_notes")).toBeLessThan(sources.indexOf("memory"));
  });
});
