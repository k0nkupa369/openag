import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { handbookVersion, loadKnowledge } from "./knowledge.js";

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function bundle(count: number) {
  const topics = Array.from({ length: count }, (_, i) => ({ slug: `t${i}`, title: `Topic ${i}`, summary: "Short.", sources: ["docs/openag.md"], body: "Body." }));
  const dir = mkdtempSync(join(tmpdir(), "openag-handbook-"));
  dirs.push(dir);
  const file = join(dir, "knowledge.json");
  writeFileSync(file, JSON.stringify({ version: handbookVersion(topics), topics }));
  return loadKnowledge(pathToFileURL(file));
}

describe("handbook capacity", () => {
  it("loads a handbook with 24 topics", () => {
    const k = bundle(24);
    expect(k.slugs()).toHaveLength(24);
    expect(k.load("t23").found).toBe(true);
  });

  it("refuses a handbook with 25 topics", () => {
    expect(bundle(25).load("t0")).toMatchObject({ found: false, unavailable: true });
  });
});
