import { existsSync, mkdirSync, readFileSync, appendFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDefaultRedactor } from "./redact.js";

export function memoryPath(dataDir: string, botId: string): string {
  return join(dataDir, "bots", botId, "MEMORY.md");
}

function template(name: string): string {
  return `# Memory: ${name}\n\nStanding notes for this bot. Edit by hand any time; the first ~1500 tokens are sent to the bot every turn, so keep it short.\n\n## Facts\n\n## Preferences\n`;
}

/** Creates the bot's MEMORY.md from the template if missing. Never overwrites. */
export function ensureMemoryFile(dataDir: string, bot: { id: string; name: string }): void {
  const path = memoryPath(dataDir, bot.id);
  if (existsSync(path)) return;
  mkdirSync(join(dataDir, "bots", bot.id), { recursive: true });
  try {
    writeFileSync(path, template(bot.name), { flag: "wx" });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
  }
}

/** Capped head of a notes file, read fresh each call. Redacted so a pasted secret never reaches a model. */
function readHead(path: string, maxTokens: number, label: string): string {
  if (!existsSync(path)) return "";
  const text = readFileSync(path, "utf8");
  const limit = maxTokens * 4;
  let out = text;
  if (Math.ceil(text.length / 4) > maxTokens) {
    const nl = text.lastIndexOf("\n", limit);
    const cut = nl > 0 ? nl : limit;
    const more = text.length - cut;
    out = `${text.slice(0, cut)}\n[... ${label} truncated: ${more} more characters. Shorten the file to include them ...]`;
  }
  return getDefaultRedactor().redactString(out);
}

export function readMemoryHead(
  dataDir: string,
  botId: string,
  maxTokens = Number(process.env.OPENAG_MEMORY_TOKENS) || 1500,
): string {
  return readHead(memoryPath(dataDir, botId), maxTokens, "MEMORY.md");
}

const noteLine = (note: string) =>
  `- ${new Date().toISOString().slice(0, 10)} ${getDefaultRedactor().redactString(note).replace(/[\r\n]+/g, " ").trim()}\n`;

/** Appends a dated, redacted, single-line note to MEMORY.md, creating the file if needed. */
export function appendMemoryNote(dataDir: string, botId: string, note: string): void {
  mkdirSync(join(dataDir, "bots", botId), { recursive: true });
  appendFileSync(memoryPath(dataDir, botId), noteLine(note));
}

export const MEMORY_MAX_BYTES = 16 * 1024;

/** Full MEMORY.md for the desk, redacted and capped. Empty string when the file does not exist yet. */
export function readMemoryFull(dataDir: string, botId: string): string {
  const path = memoryPath(dataDir, botId);
  if (!existsSync(path)) return "";
  return getDefaultRedactor().redactString(readFileSync(path, "utf8").slice(0, 4 * MEMORY_MAX_BYTES));
}

/** Replaces MEMORY.md with redacted text (the caller enforces the size cap). Returns what was written. */
export function writeMemoryFull(dataDir: string, bot: { id: string; name: string }, text: string): string {
  ensureMemoryFile(dataDir, bot);
  const clean = getDefaultRedactor().redactString(text);
  writeFileSync(memoryPath(dataDir, bot.id), clean);
  return clean;
}

/**
 * Owner notes: one installation-wide file of standing notes about the owner, included in every agent's prompt.
 * Same rules as MEMORY.md with a smaller prompt head, so the two together stay bounded.
 */
export const OWNER_NOTES_FILE = "OWNER_NOTES.md";
export const OWNER_NOTES_MAX_BYTES = 16 * 1024;
export const ownerNotesHeadCap = () => Number(process.env.OPENAG_OWNER_NOTES_TOKENS) || 500;

export function ownerNotesPath(dataDir: string): string {
  return join(dataDir, OWNER_NOTES_FILE);
}

export function readOwnerNotesHead(dataDir: string, maxTokens = ownerNotesHeadCap()): string {
  return readHead(ownerNotesPath(dataDir), maxTokens, OWNER_NOTES_FILE);
}

/** Full owner notes for the desk, redacted and capped. Empty string when the file does not exist yet. */
export function readOwnerNotesFull(dataDir: string): string {
  const path = ownerNotesPath(dataDir);
  if (!existsSync(path)) return "";
  return getDefaultRedactor().redactString(readFileSync(path, "utf8").slice(0, 4 * OWNER_NOTES_MAX_BYTES));
}

/** Replaces the owner notes with redacted text (the caller enforces the size cap). Returns what was written. */
export function writeOwnerNotesFull(dataDir: string, text: string): string {
  const clean = getDefaultRedactor().redactString(text);
  writeFileSync(ownerNotesPath(dataDir), clean);
  return clean;
}

/** True when the text carries a secret, or a redaction marker left where one was (model output is redacted upstream). */
export const containsSecret = (text: string) => text.includes("[REDACTED:") || getDefaultRedactor().redactString(text) !== text;

/**
 * Why a note cannot be appended, or null. A secret would reach every prompt, so it is refused rather than redacted;
 * a note that would push the file past its cap is refused rather than truncated.
 */
export function ownerNoteRefusal(dataDir: string, note: string): string | null {
  if (containsSecret(note)) return "owner note refused: it contains a secret";
  const path = ownerNotesPath(dataDir);
  const size = existsSync(path) ? statSync(path).size : 0;
  if (size + Buffer.byteLength(noteLine(note), "utf8") > OWNER_NOTES_MAX_BYTES) return "owner note refused: owner notes are full";
  return null;
}

/** Appends one dated note, or throws with the refusal reason. */
export function appendOwnerNote(dataDir: string, note: string): void {
  const refusal = ownerNoteRefusal(dataDir, note);
  if (refusal) throw new Error(refusal);
  appendFileSync(ownerNotesPath(dataDir), noteLine(note));
}
