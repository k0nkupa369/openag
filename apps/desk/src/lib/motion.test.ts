import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, test } from "vitest";

const root = join(import.meta.dirname, "..");
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(tsx?|css)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });

test("the house curve is defined once, as the --ease-house token", () => {
  const curve = /0\.23,\s*1,\s*0\.32,\s*1/g;
  const hits = files(root).flatMap((path) => (readFileSync(path, "utf8").match(curve) ?? []).map(() => relative(root, path)));
  expect(hits).toEqual(["styles.css"]);
  expect(readFileSync(join(root, "styles.css"), "utf8")).toMatch(/--ease-house:\s*cubic-bezier\(0\.23,\s*1,\s*0\.32,\s*1\)/);
});
