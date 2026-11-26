# Release 0.8: history search, owner notes and skill curator

Status: draft specification, 25 November 2026. It describes desired behavior and claims no implementation or acceptance. The live ACP check for `history_search` passed on 26 November 2026 (see `docs/notes/history-search.md`). External publication is pending: no issue tracker or triage vocabulary is configured for this repo, and `origin` is public.

Ideas drawn from Hermes Agent (past-session search, `USER.md`, skill curator) and Letta (memory blocks shared by several agents). Prior local research: [hermes-memory-research.md](../notes/hermes-memory-research.md).

## Problem Statement

The owner talks to several agents across rooms and direct chats over weeks. Three things go wrong.

1. Nobody can find an old conversation. An agent asked "what did we decide about the backup mirror in October?" can only search its saved memory notes by vector similarity. The words that were actually said are not searchable. The owner has the same problem in the desk: the transcript loads earlier pages on request, but there is no way to search across conversations.
2. Every agent learns the owner separately. The owner's time zone, preferred tone, family names and standing preferences are saved in one agent's MEMORY.md and stay unknown to the others. The owner repeats themselves to each agent. The Profile setting holds only a display name and an image. It is explicitly not an instruction to agents.
3. Skills drift. Nightly reflection can draft new agent-owned skills, but it cannot see which skills are used, which fail, or which have gone stale. Unused skills keep taking space in the skill index, and skills that turned out wrong are never corrected.

The help handbook also has no room for new topics: all 16 slots are used, and the help index is near its 2 KB limit. Releases 0.9 and 0.10 each need a new topic.

## Solution

- **History search.** OpenAg indexes conversation messages for full-text search inside the existing database. Agents get a read-only `history_search` tool that covers only the conversations they belong to. The owner gets a search command in the desk that finds messages in every visible conversation and opens the conversation at the matching message.
- **Owner notes.** OpenAg keeps one installation-wide set of standing notes about the owner, separate from each agent's MEMORY.md. Every agent's prompt includes the capped head of the owner notes. The owner edits them in Settings → Profile. Nightly reflection can save new owner notes automatically, the same way it saves memory notes today, and the owner can remove any note.
- **Skill curator.** OpenAg records each time an agent loads a skill. Nightly reflection sees the usage summary and can propose revising or archiving an agent-owned skill. A proposal changes nothing until the owner accepts it in the conversation where it was delivered. Archived skills leave the index and can be restored.
- **Handbook capacity.** The handbook limits grow enough for the next two releases.

## User Stories

History search
1. As the owner, I want to ask an agent what we decided weeks ago, so that I don't have to scroll through old transcripts myself.
2. As an agent, I want to search past messages in the conversations I belong to, so that I can quote earlier decisions accurately instead of guessing.
3. As an agent, I want each result to include the conversation, the time and the speaker, so that I can cite where an answer came from.
4. As the owner, I want an agent's history search to exclude conversations it is not a member of, so that a direct chat with one agent stays private from the others.
5. As the owner, I want hidden system conversations (heartbeat, reflection, hook runs) excluded from agent search, so that unattended output never re-enters a model as if it were conversation.
6. As the owner, I want search results to be redacted text, so that a secret never comes back through search.
7. As the owner, I want a keyboard shortcut in the desk that opens a search box over all my conversations, so that I can find a message without remembering where it was.
8. As the owner, I want to select a result and land on that message in its conversation, with earlier and later context loaded around it, so that I can read the surrounding discussion.
9. As the owner, I want results grouped or labelled by conversation and sorted by relevance with recent results preferred, so that the likely match appears first.
10. As the owner, I want matched words highlighted in each snippet, so that I can see why a result matched.
11. As a Limited device user, I want search to show only the conversations my device can already open, so that search grants no new access.
12. As the owner, I want deleted history to disappear from search as well, so that a deletion stays a deletion.
13. As the owner, I want search to work on an existing installation without a manual reindex, so that months of earlier conversation are searchable after the upgrade.
14. As the owner, I want search to keep working when vector embeddings are unavailable, so that it does not depend on Ollama or an embedding key.
15. As an agent in an unattended turn, I want `history_search` to be available as an auto-allowed read, so that the heartbeat can check what was already discussed.
16. As the owner, I want an empty or unmatched search to say so plainly, so that I know the search ran.

Owner notes
17. As the owner, I want to tell one agent a fact about myself and have every agent know it, so that I stop repeating myself.
18. As the owner, I want to see and edit all owner notes in Settings → Profile, so that I control what agents believe about me.
19. As the owner, I want owner notes kept separate from each agent's own notes, so that agent-specific working notes don't leak into every prompt.
20. As the owner, I want nightly reflection to save new owner notes it learned, so that the notes stay current without manual upkeep.
21. As the owner, I want to remove a single owner note, so that a wrong or outdated fact stops influencing agents.
22. As the owner, I want owner notes refused when they contain secrets, so that a pasted key never enters every prompt.
23. As the owner, I want owner notes capped in size, so that they cannot crowd out the conversation in a prompt.
24. As a Limited device user, I want to view the owner notes but not change them, so that changes stay with the owner and Full devices.
25. Moved to Out of Scope (agent-written owner notes).
26. As the owner, I want the display name and image in Profile to stay a display preference, so that the existing meaning of Profile does not change.

Skill curator
27. As the owner, I want OpenAg to count how often each skill is loaded by each agent, so that reflection can tell useful skills from dead ones.
28. As the owner, I want reflection to propose a revised version of an agent-owned skill when recent conversations show it was wrong or incomplete, so that skills improve with use.
29. As the owner, I want reflection to propose archiving an agent-owned skill that has not been loaded for a long time, so that the skill index stays short.
30. As the owner, I want every revision or archive to wait for my decision, so that no instruction change happens without review.
31. As the owner, I want a revision proposal to show what changes compared with the current version, so that I can decide quickly.
32. As the owner, I want an accepted revision to create a new skill version, so that the previous version remains available.
33. As the owner, I want to restore an archived skill, so that archiving is never a loss.
34. As the owner, I want shared library skills only reported (never revised or archived) by the curator, so that the read-only library stays read-only.
35. As the owner, I want a stale proposal (the skill changed after the proposal was made) to be refused when I accept it, so that an old proposal never overwrites newer work.

Handbook
36. As the owner, I want the default bot to explain the new features, so that I can ask it how search and owner notes work.
37. As a maintainer, I want room for at least two more help topics, so that releases 0.9 and 0.10 can ship their help with the feature.

## Implementation Decisions

History search
- Index: an SQLite FTS5 virtual table in the existing database, populated from the ledger's message events (the owner's messages and agent replies). It indexes the text already stored in the ledger, which has been redacted on append. It never indexes tool results, approvals, turn state or hidden rooms whose id starts with `_`.
- Maintenance: the index is kept in step with the ledger by database triggers on insert and delete. A numbered migration creates the table and backfills existing messages in one pass. The ledger stays append-only. Deletion of history (the owner's own deletes) removes matching index rows.
- Query: user input is parsed into a safe FTS5 query (quoted terms, optional prefix match). Raw FTS5 syntax from a model or a user is never passed through. Ranking is BM25 with a small boost for recent results. Results carry event id, room id, room title, actor, timestamp and a highlighted snippet. Snippets are capped and result count is bounded.
- Agent tool: `history_search`, a first-party tool wired through the shared first-party registry so the MCP list, API runtime and runner cannot drift. Its effect class is search, its permission is auto-allow, and it is offline-safe. The daemon computes the agent's member rooms at call time, so membership changes take effect immediately. Results are wrapped as untrusted data.
- Desk: a new authenticated read, `GET /history/search?q=&room=&before=`, with `history` added to the static route guard's API segments. It returns only rooms visible to the calling device, using the same visibility rule as `GET /rooms`. The desk search command opens the transcript at the result through the existing transcript cursors (`before`/`after` around the event id).
- No vectors: this is lexical search, independent of sqlite-vec and embeddings. Combining it with vector memory search is out of scope.

Owner notes
- Domain term: **Owner notes**, the installation-wide standing notes about the owner. They are distinct from Profile (display only) and from an agent's MEMORY.md. Add the term to GLOSSARY.md.
- Storage: one hand-editable Markdown file in the data directory with the same rules as MEMORY.md: capped size, a capped head included in the prompt, written through the existing memory commit path. A write that contains a secret is refused, never saved redacted; an appended note that would pass the size cap is refused, never truncated.
- Prompt: every agent's prompt includes the owner notes head as its own labelled section, before the agent's own MEMORY.md head. The owner notes cap is smaller than MEMORY.md's so the combined prompt cost stays bounded. Decision: turns that omit MEMORY.md (investigation, read check, bounded agent request, guest Work) omit owner notes too.
- Writers: (a) the owner or a Full device through `PUT /owner-notes` (16 KB cap, secrets refused, audited by length only); (b) nightly reflection, through a new proposal kind `owner_note` saved automatically with the same validation as `memory_append`. Decision: `GET /owner-notes` is readable by every device, Limited included; `PUT` is owner/Full only.
- Removal: Settings → Profile lists notes and removes one at a time, using the same mechanism as Saved memory.

Skill curator
- Usage record: a new table keyed by agent and source-qualified skill identity that holds a load count and the last-loaded time. It is updated when `skill_load` succeeds. Shared library skills are recorded under their source-qualified identity.
- Reflection input: the reflection turn receives a bounded per-agent usage summary (skills never loaded, loaded rarely, loaded often) next to the conversation material it already reads.
- Proposal kinds: `skill_revise` (an agent-owned skill slug, a full replacement body and a one-line reason, validated by the existing skill payload schema) and `skill_archive` (an agent-owned slug and a reason). Both are delivered as approvals in the delivery conversation, like skill drafts today. Each carries the skill version it was based on. Accepting checks that version and refuses a stale proposal.
- Archive state: archived agent-owned skills leave the prompt index and `skill_list` but stay on disk with their versions. The Skills page lists them and restores them. Shared library skills are never proposed for revision or archive.

Handbook capacity
- Raise the handbook's maximum topic count from 16 to 24 and raise the help index limit so that two more topics fit. Before raising the index limit, shorten existing summaries where possible. Decision: the help index limit stayed at 2048 because shortened summaries made room. The verification script's topic-count assertion follows the new bound.
- Update the existing `memory-skills` and `conversations` help topics for this release. No new topic is needed for 0.8.

## Testing Decisions

- Good tests here assert what a client or an agent can observe: what a search returns for a given ledger, what appears in a rendered prompt, what an accepted proposal changes on disk. They don't assert trigger SQL, ranking internals or helper functions.
- Seams, highest first:
  1. The gateway over HTTP (`GET /history/search`, `GET/PUT /owner-notes`) with a temp database. Prior art: the `gateway.*.test.ts` suites, such as `gateway.memory.test.ts` and `gateway.reflection.test.ts`.
  2. The runner with the in-process fake ACP agent and mocked Mastra models, for `history_search` membership scoping, unattended availability and the owner-notes prompt section. Prior art: runner and `prompt.test.ts`, `prompt.skills.test.ts`.
  3. The reflection apply path for the `owner_note`, `skill_revise` and `skill_archive` kinds, including stale refusal. Prior art: `reflection-apply.test.ts`, `reflection.skills.test.ts`.
- Required cases: a non-member agent gets no hit from another agent's direct chat; hidden `_` rooms never match; a redacted secret is not findable by its raw value; deleted history stops matching; the backfill makes pre-upgrade messages searchable; FTS5 operator characters in input cannot raise an error or widen the query; a Limited device sees only its visible rooms.
- Bot knowledge: `node scripts/verify-bot-knowledge.mjs` passes with the new limits and the updated topics.
- Live check: one real journey through each ACP adapter (Claude and Codex) that calls `history_search` twice in the same session and cites a result.

## Out of Scope

- Semantic or hybrid (vector plus lexical) conversation search.
- Searching tool results, attachments, receipts or Work records.
- Several owners or per-device owner notes.
- Agent-written owner notes (story 25, the `owner_note_append` tool). Removed before release: every agent reads owner notes, so an agent writer is a cross-agent prompt injection path.
- Automatic revision or archive of skills without approval.
- Curating shared library skills, and any public skill registry.
- Summarising old conversations into memory.

## Further Notes

- Owner notes are a lower-risk version of Letta's shared memory blocks: one block, owner-controlled, and shared by every agent rather than by a configurable subset.
- The usage table also gives the desk a "last used" column on the Skills page at little extra cost. That's optional for this release.
- Release order: 0.8 ships first because it is small and benefits every existing installation. The handbook capacity change belongs here because 0.9 and 0.10 depend on it.
