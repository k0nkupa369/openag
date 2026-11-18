# Composio-first proactive V1 research

Research date: 5 November 2026. Status: design research, not an implementation or live-provider acceptance result. Scope: Composio is the first supported proactive provider; the owner selects connected services/accounts, for example Outlook and Gmail while excluding GitHub. A selected source that breaks must alert the owner while other selected sources continue.

Owner clarification after research: select services, with all their connected accounts included and no account picker. Outlook and Gmail are examples, not an email-only V1 limit. The recommendations below to start with two email services and select individual accounts are superseded by the [current specification](../specs/proactive-composio-v1.md); the provider findings and compatibility limits remain relevant.

## Recommendation

Proceed with this direction, with a narrower promise: **check selected connected accounts using supported, reviewed reads**. Do not promise to run every read-looking tool, or inspect everything in a connected service. Service selection establishes where OpenAg may look; a defined check establishes what it actually inspects.

Use a simple owner flow: Composio → connected service/account checkboxes → a short description of each supported check → save. New connections start unchecked. Unsupported services can be shown as unavailable with a reason. For V1, Outlook and Gmail email checks are a coherent scope; calendar, contacts and arbitrary Composio services need separate read contracts before being offered as supported checks.

## Confirmed provider capabilities

| Finding | Implication |
| --- | --- |
| Composio groups service actions into toolkits; toolkit availability is separate from an authenticated connected account. Ordinary session discovery exposes meta tools rather than every app action. [Toolkits](https://docs.composio.dev/docs/toolkits) | Show services and accounts, rather than asking the owner to choose hundreds of raw API actions. |
| Developer sessions can list connected toolkits with `is_connected=True`; listings default to 20 and support cursor pagination. Positive toolkit lists restrict discovery and execution; omitting the list allows the catalog. [Configuring sessions](https://docs.composio.dev/docs/configuring-sessions) | Discovery must be complete and paginated. Save a positive selection; absence of a selection must mean no monitoring. |
| Users can hold several accounts for one toolkit. Explicit session account pins do not fall back to a different active account; unpinned selection is live and can include later connections. [Connected accounts](https://docs.composio.dev/docs/auth-configuration/connected-accounts), [Tool Router sessions](https://docs.composio.dev/kb/guide/mcp-tool-router-sessions) | Bind selection to stable account identity, not merely a Gmail label. A disconnected work mailbox must not silently become the personal mailbox. |
| Tool hints describe behavior, but Composio assigns them on a best-effort basis. [Tool hints](https://docs.composio.dev/docs/governance/tool-hints) | A remote `readOnlyHint` is discovery evidence, not sufficient action authority. |
| Composio recommends exact tool allowlists for known workflows; sandbox helpers have separate enablement and can be disabled. Provider OAuth scope and session restrictions are distinct controls. [Restricted sessions](https://docs.composio.dev/kb/guide/platform-session-tool-policies) | Approve exact read requests locally. Do not expose proxy, shell/workbench, connection changes, drafts or sends in background monitoring. |
| Gmail lists fetch, individual-message and history reads alongside send/delete actions. Outlook lists query, message and delta reads alongside write actions. [Gmail toolkit](https://docs.composio.dev/toolkits/gmail), [Outlook toolkit](https://docs.composio.dev/toolkits/outlook) | The selected service must map to a reviewed subset. Tool presence alone does not establish usable scopes or successful access. |

### Important surface distinction

OpenAg currently uses Composio Connect at `https://connect.composio.dev/mcp`. Official Connect documentation distinguishes this shared MCP connection from creating an SDK session, and recommends SDK/session endpoints for application builders. Connect exposes catalog search, schema retrieval, batch execution and a mixed connection-management tool with list/create/rename/remove operations. [Composio Connect](https://docs.composio.dev/docs/composio-connect)

Therefore the developer-session capabilities above establish that the product model is supported by Composio, **not** that OpenAg can call those APIs with its existing consumer OAuth token. Do not silently add a project API key or migrate owner connections. First verify the existing Connect contract for passive complete account listing, exact account selection and bounded read execution. If these are unavailable, present the integration decision explicitly before implementation. Narrow passive listing must not grant the whole mixed connection-management tool unattended authority.

## What OpenAg already has

The local implementation already contains the useful building blocks:

- [Heartbeat](../../apps/daemon/src/heartbeat.ts) schedules unattended checks and sends their verdict to the shared wake filter. The default prompt is generic and does not enumerate selected sources.
- [Wake filtering](../../apps/daemon/src/wake.ts) owns silent/digest/ping decisions, repeat suppression, urgency and notification budget. [Brief delivery](../../apps/daemon/src/brief.ts) assembles held items. Reuse these rather than create a parallel notification system.
- [Reviewed Composio contracts](../../apps/daemon/src/mcp/composio-contract.ts) already recognize exact `OUTLOOK_GET_PROFILE` and `OUTLOOK_QUERY_EMAILS` batch requests as reads, with bounded batch structure and no workbench synchronization. Gmail is absent from that reviewed set.
- [MCP execution](../../apps/daemon/src/mcp.ts) derives per-request permission effects from those contracts; [the runner](../../apps/daemon/src/runtimes/runner.ts) applies them before its unattended ceiling. Thus the earlier statement that every Composio execution is blocked in background was too broad: reviewed Outlook reads have a supported path, subject to active permissions. Generic multi-execution is still not blanket read authority.
- Composio result validation checks top-level and member failures, exact requested/returned batch matching and nested provider errors. Preserve that evidence rather than equating MCP success with a completed mailbox check.
- [Responsibilities](responsibilities.md) has scoped investigation concepts, but the normal daemon has no live investigation source and ACP investigations are unsupported. Reuse appropriate constraints; do not treat that subsystem as ready-made live Composio monitoring.

These are source observations, not fresh acceptance against the owner's mailboxes. The parent investigation separately verified installed Composio connection state and the retained heartbeat run.

## Smallest useful V1 contract

1. **Explicit source scope.** Store selected toolkit and account IDs. Enforce them in the daemon before each request and across every batch member. GitHub requests must fail before provider dispatch when it is unchecked, even if a model asks for them. Recheck selection after configuration changes; do not publish stale findings from a deselected source.
2. **A defined check per service.** Start with recent incoming email in the selected Outlook/Gmail account, a bounded lookback and owner-visible folder/label scope. Explain what counts as attention-worthy. “Composio selected” alone must not imply contacts, all folders, calendars or attachments are scanned. Default to metadata/snippets, fetching bounded message content only when the supported check requires it; no attachment download in V1.
3. **Daemon-owned reads.** Reuse the exact reviewed request mechanism, add only the Gmail operation(s) required by the check, validate arguments and prohibit unsupported flags/secondary execution routes. Message content is untrusted data and cannot expand source scope or action permissions. No connection consent, draft, send, label change, arbitrary code or proxy call during a check.
4. **Independent coverage.** Run each selected account independently with a time/page/item budget. One failed Outlook read must not stop Gmail. Persist last attempt and last successful coverage separately per account. Save cursors/watermarks only for coverage actually completed, with stable item deduplication. A page cap or partial result is incomplete coverage, not “nothing needs attention.” Initial bounded lookback is a stated product choice, not historical completeness.
5. **Stable scheduling.** Preserve due times across restarts; do not reset a one-hour interval at every daemon startup. Admit at most one due check after downtime rather than replay all missed model turns. Show next check and last actual outcome.
6. **Useful evidence.** Record selected account, observation time, exact supported check, bounded coverage, success/partial/failure and reason. Separate no new items, items examined with no alert, unable to inspect and never started. Retain source references for findings without copying unnecessary private contents into generic logs.

These are recommended acceptance requirements, not claims about existing behavior or provider guarantees.

## Broken selected connections must be visible

Connection metadata is not the same as successful scoped data access. Composio documents ACTIVE filtering, INACTIVE execution refusal, and deprecated refresh methods that no longer validate credentials. [Connected accounts](https://docs.composio.dev/docs/auth-configuration/connected-accounts)

Recommended behavior:

- A selected source that cannot be checked gets an actionable owner notice: needs sign-in, permission missing, provider unavailable, rate limited or unsupported. Preserve the last successful check time and say coverage is stale.
- Send one notice when a source enters a failure state; suppress repeated copies of the same incident. An explicit loss of coverage must not be reduced to a model's silent verdict. Define health-notice admission separately from the ordinary “is this content urgent?” verdict, while retaining delivery deduplication and notification limits. Record when a notification could not be delivered.
- Continue checking healthy selected sources. Retain the failing source's cursor; resume bounded reads after recovery without inventing historical coverage.
- Record recovery only after the actual supported read succeeds, optionally with one recovery notice. A reconnect button, ACTIVE flag or healthy generic profile alone does not certify the email check.
- An unselected source generates no proactive-monitoring reads or outage alerts. A total Composio outage should produce one grouped monitoring notice covering affected selected sources, not one repeated alert per tool.

Composio distinguishes its API throttling from provider-specific quotas; 429 handling uses `Retry-After`, and some provider quotas are shared under managed auth. Cache stable schemas and use bounded deferred retries rather than tight loops. Exact limits for the owner's Connect subscription remain unverified. [Rate limits](https://docs.composio.dev/reference/v3/rate-limits)

## Polling versus triggers

Composio also supports account-bound trigger instances and signed delivery. Its documentation distinguishes real-time Outlook events from Gmail polling; production delivery needs a configured webhook destination. [Triggers](https://docs.composio.dev/docs/triggers)

Keep scheduled outbound checks for V1. Triggers add provider setup, public delivery, signature/deduplication and lifecycle work, and do not remove the need for selected-account enforcement or health reporting. Revisit only when polling latency or cost justifies it. No trigger subscription was created during this research.

## Verification before implementation is called ready

- Capture the actual installed Connect schemas for safe account discovery and exact account routing; confirm whether consumer OAuth supports required inventory without developer-project credentials. Do not use the unrelated ChatGPT Composio connection as evidence for OpenAg's connection.
- Review complete Outlook/Gmail read schemas, query semantics, pagination and failure shapes. Public toolkit pages establish operation availability, not parameter compatibility. Time-window overlap, cursor expiry and partial-page handling still require provider-specific verification.
- Controlled acceptance must prove unchecked GitHub and wrong-account/mixed batches never dispatch; unknown tools cannot become reads; model/mail instructions cannot expand scope; mid-run deselection blocks further reads/publication; one account failure does not stop the other; notices dedupe and recovery requires a successful read; restart does not defer the next due check; page caps remain visibly incomplete.
- Use the repo's standalone verification scripts/build/type checks subject to the owner's no-unit/Jest rule. A later, separately scoped authorized live read should prove each selected mailbox/account, zero provider writes, failure visibility and retained evidence. Phone notification receipt needs its own acceptance.
- Update authoritative proactive/Composio help and bot knowledge when implementation changes behavior, and verify delivery. This research note deliberately does not rewrite current product help as if V1 already existed.

No product code, live settings, account connections, provider reads/writes, trigger subscriptions or notification tests were changed or run for this research. Exact consumer Connect inventory/account-routing compatibility and Outlook/Gmail query/pagination semantics remain implementation gates.
