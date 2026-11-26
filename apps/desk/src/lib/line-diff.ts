export type LineChange = { kind: "same" | "removed" | "added"; text: string };

/** Above this many line pairs the comparison is skipped (null) instead of stalling the page. */
const MAX_CELLS = 4_000_000;

/** Line-level diff by longest common subsequence; removed lines come before added ones in each changed run. Trailing newlines are not compared. */
export function lineDiff(before: string, after: string): LineChange[] | null {
  const a = before.replace(/\n+$/, "").split("\n"), b = after.replace(/\n+$/, "").split("\n");
  if (a.length * b.length > MAX_CELLS) return null;
  const width = b.length + 1;
  const lcs = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      lcs[i * width + j] = a[i] === b[j] ? lcs[(i + 1) * width + j + 1]! + 1 : Math.max(lcs[(i + 1) * width + j]!, lcs[i * width + j + 1]!);
  const out: LineChange[] = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { out.push({ kind: "same", text: a[i]! }); i++; j++; }
    else if (j >= b.length || (i < a.length && lcs[(i + 1) * width + j]! >= lcs[i * width + j + 1]!)) out.push({ kind: "removed", text: a[i++]! });
    else out.push({ kind: "added", text: b[j++]! });
  }
  return out;
}
