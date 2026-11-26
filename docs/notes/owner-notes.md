# Owner notes (release 0.8)

Owner notes are one installation-wide set of standing notes about the owner. Every agent sees them. They are separate from each agent's own `MEMORY.md` and from the Profile display name and image, which stay a display preference.

## Storage and prompt

- File: `$OPENAG_DATA/OWNER_NOTES.md`, hand-editable Markdown. It does not exist until the first note is saved.
- Writes never save a secret (see Writers) and go through the data repository's memory commit path (`commitMemory`, pathspec `OWNER_NOTES.md`).
- Prompt: every agent turn that includes MEMORY.md also includes the owner notes head as its own labelled section, placed before the agent's MEMORY.md head. ACP agents get it in the context block. API agents get it as the `owner_notes` data source. Investigation, read-check, bounded agent-request and guest Work turns get neither.
- Head cap: 500 tokens (about 2,000 characters; `OPENAG_OWNER_NOTES_TOKENS` overrides). MEMORY.md's head stays at 1,500 tokens. Longer files are truncated with a marker that says how much was left out.

## Writers

1. Owner or Full device: `PUT /owner-notes` replaces the whole file. The text is capped at 16 KB. Text containing a secret, or a redaction marker where one was, is refused with 400 `Owner notes cannot contain a secret. Remove it and save again.` and nothing is saved. The audit event (`owner_notes_edited` in `_system`) records the length only. The desk removes a single note by saving the text without it, the same way Saved memory works.
2. Nightly reflection: proposal kind `owner_note` (`{"kind":"owner_note","text":"one short fact"}`, at most 300 characters). It is saved automatically, without an approval, and dated like a memory note. It shares the run's `maxMemoryProposals` cap and the `memoryProposals` count with memory notes. Duplicates of existing owner notes or of the same batch are skipped. A note that would push the file past 16 KB is skipped too (not counted), never truncated.
No agent tool writes owner notes. Every agent reads them, so an agent tool that wrote them would let one agent put prompt text in front of every other agent (cross-agent prompt injection). An `owner_note_append` tool existed during development and was removed before release. An agent keeps its own notes with `memory_append`.

A note appended by reflection that contains a secret, or a redaction marker where a secret was, is refused rather than saved redacted, because the note would reach every prompt. `PUT /owner-notes` refuses one too (unlike `PUT /bots/:id/memory`, which redacts).

## Desk

Settings → Profile has an **Owner notes** section below Your profile. Each non-empty line of the file is shown as one note, without its Markdown bullet. Every device, Limited included, sees the full list. Owner and Full devices also get:

- **Remove** on each note. The desk reads the file again, drops that exact line and saves the rest, so a note that reflection saved after the page loaded is kept.
- **Edit notes**, which opens the whole file as text (one note per line) with **Save notes** and **Cancel**. After a save the desk reads the notes again; a refusal (for example a secret) is shown as an error and the draft is kept.
- A prompt head counter (`Prompt head: N of M tokens`), using `headTokens` and `headCap` from `GET /owner-notes` for the saved notes.

Limited devices see "Full access is required to change owner notes." and no Remove or Edit controls. With no file yet the section says "No owner notes yet".

## HTTP

`GET /owner-notes` works for any authenticated device, Limited included. It returns `{ text, maxBytes, headTokens, headCap }`, with `text` redacted and `""` when the file does not exist.

`PUT /owner-notes` with body `{ "text": string }` is owner/Full only (other devices get 403 `owner token required`). It returns `{ text }`, the text it wrote. A non-string `text` returns 400, as does text longer than 16 KB or text containing a secret. It returns 503 when the daemon has no data directory.

`owner-notes` is in the static route guard's `API_SEGMENTS`.

## Limits

- There is one owner and one block of notes. Per-agent subsets, several owners and per-device notes are out of scope.
- Removing a note does not erase past prompts, conversation or change history. It does not stop reflection from learning the fact again.
- Owner notes are remembered context. They can be outdated and never grant action permission.

Verification: `gateway.owner-notes.test.ts` (routes, access, secret refusal, length-only audit), `runtimes/memory.test.ts` (prompt order for ACP and API agents), `tools/owner-notes.test.ts` (no agent tool, MCP name or class writes owner notes), `reflection.test.ts` (automatic save, dedupe, secret refusal, shared cap, file size cap). Desk: `apps/desk/src/components/OwnerNotesSection.test.tsx` (Limited read-only list, empty state, single-note removal that keeps newer notes, whole-file edit showing the saved notes and prompt head, secret refusal keeping the draft, refusal shown as an error) and the `R08-owner-notes` states in `scripts/verify-rendered-acceptance.mjs` (empty, list, editing, Limited read-only at desktop and phone, light and dark).
