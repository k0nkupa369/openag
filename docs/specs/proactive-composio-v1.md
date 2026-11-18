# Composio-first proactive checks

Status: owner-approved source implementation baseline and integration seam, 5 November 2026. The owner subsequently approved a searchable service picker using the existing hosted Composio connection; complete automatic service inventory is not promised. Implementation acceptance is recorded in the local ticket. External issue publication is unconfigured. Approval does not authorize deployment or production changes.

## Problem Statement

The owner enabled proactive checking and received no useful updates. The retained heartbeat checked OpenAg configuration and returned a silent verdict without inspecting connected services. A completed model turn therefore looked like monitoring even though no relevant source had been read. Daemon restarts also reset the hourly checking interval.

The owner expects OpenAg to inspect selected services through the existing Composio connection. They must be able to include Outlook and Gmail while excluding GitHub, without selecting individual accounts or understanding API tool names. If a selected account cannot be checked, the owner needs to know that coverage is missing rather than interpreting silence as reassurance.

## Solution

Use Composio as the first supported proactive provider. In Settings, Proactive, let the owner search for services and select which to check. Outlook, Gmail and GitHub are examples, not a fixed service list. Selecting a service includes all of its connected accounts belonging to the owner's Composio connection, including two Outlook accounts when both are connected. There is no account picker in V1 and no inferred two-account limit.

Explain each supported check in ordinary language: for example, inspect recent incoming email or relevant issue updates for developments that may need attention. Check each account independently, retain evidence of coverage, and deliver useful attention items through the existing proactive alerts and brief. Display and notify actionable loss of coverage, while healthy accounts continue checking. Unselected services remain outside monitoring scope; a selected service without a permitted read path is explicitly unavailable, not silently skipped.

## User Stories

1. As an owner, I want Composio supported first, so that proactive checks use my existing connection.
2. As an owner, I want a service list rather than raw API tools, so that I can configure monitoring in familiar terms.
3. As an owner, I want to discover the services exposed by my Composio connection, so that my choices reflect what I actually connected.
4. As an owner, I want to select any discovered service with supported checks, so that monitoring is not restricted to a hard-coded pair of email services.
5. As an owner, I want to leave a service such as GitHub unselected, so that proactive checks do not inspect it.
6. As an owner, I want every connected account in a selected service included, so that I do not have to configure each mailbox.
7. As an owner, I want two Outlook accounts checked independently, so that neither is silently missed.
8. As an owner, I want service-wide selection explained when saving, so that I understand which accounts it covers.
9. As an owner, I want newly connected accounts in a selected service covered by that service-wide choice, so that the choice continues to mean all connected accounts.
10. As an owner, I want newly available services to remain unselected, so that connecting another service does not expand monitoring unexpectedly.
11. As an owner, I want a clear description of the supported email check, so that I know what proactive monitoring includes.
12. As an owner, I want unsupported services or operations identified, so that availability is not overstated.
13. As an owner, I want recent email checked on the configured schedule, so that useful developments are found without another request.
14. As an owner, I want overdue checking handled after restart, so that repeated restarts do not postpone monitoring indefinitely.
15. As an owner, I want bounded checks, so that monitoring does not scan unlimited history or consume unlimited resources.
16. As an owner, I want useful findings delivered with source and time references, so that I can assess them.
17. As an owner, I want urgent findings considered for alerts and other useful findings for the brief, so that interruptions remain meaningful.
18. As an owner, I want repeated email findings suppressed, so that the same message does not repeatedly interrupt me.
19. As an owner, I want successful checks allowed to stay quiet, so that silence remains useful when coverage is known.
20. As an owner, I want an alert when a selected account needs sign-in, so that I can restore monitoring.
21. As an owner, I want missing permissions distinguished from sign-in failure, so that I can take the right corrective action.
22. As an owner, I want temporary outages and rate limits described accurately, so that I am not told to reconnect unnecessarily.
23. As an owner, I want the last successful check shown for an unavailable account, so that I know how stale its coverage is.
24. As an owner, I want healthy accounts checked when another fails, so that a partial outage does not disable all monitoring.
25. As an owner, I want repeated outage notices grouped and suppressed, so that a broken connection does not flood me.
26. As an owner, I want recovery recorded only after a successful email read, so that a connection badge does not falsely imply restored coverage.
27. As an owner, I want a total Composio outage grouped into one notice, so that one failure does not create many alerts.
28. As an owner, I want history to distinguish checked, empty, no attention needed, incomplete, failed and never started, so that I can trust its meaning.
29. As an owner, I want partial checks identified, so that a page limit is not mistaken for complete coverage.
30. As an owner, I want deselecting or pausing a service to stop further reads and unpublished findings, so that my current choice controls monitoring.
31. As an owner, I want monitoring to remain read-only, so that checking cannot send mail or change my accounts.
32. As an owner, I want instructions inside email treated as untrusted content, so that a message cannot expand monitoring or action authority.
33. As an owner, I want each account's progress preserved across failures and restarts, so that messages are not silently skipped or repeatedly reported.
34. As an owner, I want authentication or discovery problems exposed before a successful-check claim, so that setup failures do not disappear behind silence.
35. As a Limited-device user, I want the existing access restrictions preserved, so that source selection cannot bypass owner controls.
36. As an owner, I want the default bot to explain actual monitoring and limitations, so that its answers match installed behavior.

## Implementation Decisions

- **Domain language:** An integration connection reaches Composio; a connected service is an external service such as Outlook, Gmail or GitHub; a connected service account identifies one identity within that service; tool actions are the individual operations used to inspect it. The monitoring selection chooses services, a proactive check makes a bounded inspection attempt, and monitoring coverage records what was actually inspected. A coverage incident represents a continuing inability to inspect an intended source. Selection does not replace the existing source binding or permission authority.
- **Provider and service scope:** Composio is the initial provider. Use Composio service search rather than limiting the picker to named examples. Search results are not a complete account inventory. Supported monitoring still requires permitted, reviewed read operations for the selected service; discovery alone is not support. Expose missing coverage explicitly. The saved selection is a positive service allowlist; empty means no service monitoring. Do not enable monitoring on upgrade merely because Composio is connected.
- **Account inclusion:** No account picker. A selected service covers all accounts exposed for that service within the owner's authenticated Composio identity. At each check, enumerate current account membership and bind each read to an exact stable account identity. Newly connected accounts in selected services join that scope; newly connected services do not. Never substitute a different account for a failed account. A discovered missing account retains unavailable coverage history rather than disappearing silently.
- **Discovery gate:** Verify account listing for each explicitly selected service, account identity and exact account routing through OpenAg's existing hosted Connect OAuth contract. The owner accepted searchable service selection in place of complete automatic service discovery. Developer SDK/session APIs do not prove that the consumer Connect token supports those operations. Do not silently introduce a project API key, move connections, or grant a mixed connection-management operation unrestricted background authority.
- **Check contract:** Define a bounded, relevant check for each supported service, including resources, initial lookback and attention criteria. Email checks and issue-update checks are examples, not universal checks for every service. Pin those limits during implementation and expose the supported coverage in help. Do not promise every resource, all history or arbitrary tools. Fetch bounded content only when needed; exclude attachments.
- **Permission enforcement:** Reuse daemon-owned reviewed Composio request contracts and existing session permission authority. Exact reviewed Outlook reads already exist; review additional operations needed for supported services rather than treating every discovered tool as safe. Validate arguments, every batch member, account identity and selected service before dispatch. Remote tool hints and message content cannot grant authority. Unknown operations fail closed. Preserve independent background and offline restrictions.
- **Execution boundary:** Use a bounded proactive source-check path with only authorized reads. Do not rely on the general heartbeat prompt to discover arbitrary tools or enforce exclusions. Reuse the shared runner and execution gate where applicable; do not assume the existing responsibilities investigation path supports live Composio or ACP. Preserve ordinary interactive chat and other callers' permission behavior.
- **Scheduling:** Reuse the configured checking frequency and scheduler. Persist proactive due/progress state across daemon restarts. Admit at most one due check after downtime, avoid overlaps and do not replay every missed model turn. Record skips or uncertain coverage accurately.
- **Independent progress:** Keep per-account attempt, successful coverage, cursor/watermark and failure state. Use bounded pages, items and execution time. A failed account must not stop other accounts. Advance progress only for established coverage; partial reads remain incomplete and retain safe resume evidence. Deduplicate source events with stable service/account/message identity.
- **Configuration changes:** Source selection is owner/Full-only through existing authenticated settings controls. Validate and save service choices atomically with stale-edit protection using the existing settings convention where possible. Recheck current scope before further reads and publication; a pause or deselection invalidates the old scope. Previously delivered content cannot be recalled.
- **Findings and delivery:** Reuse the shared wake filter, destination and morning brief. Retain attributable source references and observation times. Separate a completed model turn, successful provider read, useful finding, local delivery and phone receipt. A check creates no implicit Work and performs no external write.
- **Coverage health:** Treat loss of selected-account coverage as a daemon-derived attention item rather than depending on a model to notice it. Distinguish needs sign-in, missing permission, temporary provider failure, rate limit, unsupported check and unknown access. A healthy Composio transport or ACTIVE metadata alone does not prove mailbox access.
- **Health delivery:** Emit one actionable notice for a new coverage incident, preserve the last successful check, suppress unchanged repeats and group a provider-wide outage. Continue healthy sources. Reuse notification routing, quiet hours and limits; persist visible pending/suppressed delivery reasons so a content verdict or exhausted budget cannot silently erase the incident. Recovery requires the supported source read to succeed; a recovery notice may enter the brief. An unselected service produces no proactive source reads or service-outage alerts.
- **Desk history:** Show service/account identity, check purpose, last attempt, last successful coverage, next check, outcome and actionable failure reason. Use existing shared controls and semantic status badges. Keep routine copy concise and detailed coverage explanations in help.
- **Data and knowledge:** Store only bounded redacted evidence and necessary progress/health metadata in daemon-owned storage. Do not retain tokens or unnecessary mailbox content in generic logs. Update authoritative proactive and Composio help plus bot-facing knowledge in the implementation change, and verify delivery to the configured default bot, including existing installs.

## Testing Decisions

- **Owner-approved primary seam:** Exercise the public settings and history API through scheduled check execution with a temporary daemon database, a controlled Composio transport and a captured notification transport. Observe provider requests, public history and delivered notices. This covers selection, account fan-out, permission enforcement, progress, recovery and delivery at one high integration boundary rather than mirroring internal helpers.
- Prior art includes the existing standalone Composio contract verification through the real runner and MCP transport, connector isolation checks, automation scheduling acceptance and controlled notification/knowledge verification. Reuse those fixtures and entry points where practical.
- A good check asserts externally visible behavior and prohibited dispatch: for example, two Outlook accounts and one Gmail account are inspected when those services are selected; unselected GitHub receives no source request. Also cover a discovered non-email service with a controlled supported read, so the implementation cannot pass by hard-coding email services. No individual-account selection is required.
- Include newly discovered accounts under selected services, newly connected unselected services, incomplete inventory, removed accounts, wrong-account requests, mixed batches, unknown tool names and malicious instructions inside email. Assert refusals occur before provider dispatch and no account fallback occurs.
- Simulate expired access, permission refusal, timeout, provider-wide outage, rate limit, partial batch, page cap and cursor invalidation. Assert healthy accounts continue, coverage remains accurate, incident notices deduplicate, progress does not skip unconfirmed coverage and recovery requires a successful scoped read.
- Exercise restart before the hourly due time, overdue restart, overlapping ticks and interrupted checks. Assert due times survive, one bounded opportunity is admitted, no catch-up storm occurs and interrupted coverage is not reported as complete.
- Exercise pause/deselection during a read, stale configuration saves, Limited-device writes, quiet hours, notification budget exhaustion and delivery failure. Verify subsequent reads/publication are fenced, failures remain visible and delivery is not claimed without evidence.
- Verify rendered service selection and history at phone and desktop sizes using existing desk compositions, including both accounts healthy, one failed, all unavailable, empty selection and unsupported setup. Record component-audit coverage.
- Run applicable build, type checks and standalone integration acceptance. Never run unit tests or Jest, directly or indirectly. Use a separately authorized live read acceptance for actual selected services and accounts and a separate device check for physical notification receipt; controlled fixtures do not prove those outcomes.

## Out of Scope

- Additional proactive providers beyond Composio, or a promise that every tool in every discovered service is automatically supported.
- An individual-account picker, arbitrary tool picker or inferred maximum of two accounts.
- Attachments, arbitrary historical backfill and unrestricted resource scanning. A service's unspecified resources are not implicitly included in its supported check.
- Sending mail, creating provider drafts, changing labels/read state, editing or deleting data, automatic consent/reconnection, shell/workbench/proxy execution or automatic Work creation.
- Provider triggers, public webhook infrastructure, a generic connector framework or a silent migration to developer-project credentials.
- Changing the existing responsibilities runtime support or unrelated interactive permissions as a prerequisite without a demonstrated need.
- Deployment, live settings changes, mailbox reads or notification sends merely to publish this specification.

## Further Notes

The model distinguishes intended scope, established access, actual inspection and delivery. Composio being connected establishes none of the latter outcomes for a particular mailbox. The existing source binding associates the exact account and permitted resources; service-wide monitoring selection does not bypass it. A proactive check produces coverage evidence and possible attention items, not automatic Work.

Concrete boundary scenarios:

| Scenario | Required meaning |
| --- | --- |
| Outlook is selected and has two connected service accounts. | Both accounts are in intended scope; each needs its own established access and coverage evidence. |
| One Outlook account succeeds and the other needs sign-in. | Outlook coverage is partial. Retain a coverage incident for the failed account while continuing the healthy account. |
| Gmail is connected and selected, but its supported email read is unavailable. | Record inability to check and an actionable coverage incident, not an empty successful result. |
| A third Outlook account is connected later. | It joins the selected service's intended scope, subject to established access and permitted reads; it has no inherited successful coverage. |
| GitHub is connected but unselected. | It is outside monitoring scope; no proactive source inspection or GitHub-specific coverage incident is created. |
| Composio is unreachable. | Account coverage is unknown or stale; group the outage notice without declaring every account's authorization broken. |
| A checked mailbox has no new email. | This is successful empty coverage for the inspected range, not a coverage gap or an incident. |
| An email finding is retained but a notification is suppressed. | Inspection and finding exist; delivery remains a separate outcome. |

This specification supersedes the research note's earlier account-picker and email-only recommendations: the owner chose service-level selection with all connected accounts included. Outlook and Gmail are examples, not the two initial supported services or a product restriction. No two-account cap was agreed.

The research note separates official Composio developer capabilities from OpenAg's hosted Connect compatibility. Fresh schemas established passive named-service account listing and an explicit account parameter. The owner chose a searchable service picker, retaining the existing integration. Exact live provider acceptance remains separate from schema and controlled verification.

The earlier diagnosis that all Composio execution is unavailable in background was too broad. Reviewed Outlook read batches have a supported permission path; missing source-selection and useful monitoring behavior remain the actual product gap. No Gmail or mailbox-access acceptance is implied.

External issue publication is not configured in the supplied project guidance. The to-spec workflow requires the project tracker and triage vocabulary, then publication with the `ready-for-agent` label. Run `/setup-matt-pocock-skills` to establish that destination. Do not infer the tracker solely from the Git remote or mark this draft published.

Research: [Composio-first proactive V1 research](../notes/proactive-composio-v1-research.md).
