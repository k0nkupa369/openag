# OpenAI API platform: what OpenAg should integrate

**Status, 11 November 2026:** A1, A2 and A4 are implemented on `claude/openai-credit-safety`. The billing 429 codes are terminal, OpenAI requests send `store: false`, the model hint is `openai/gpt-6-luna`, and unattended turns use Flex with one retry at `auto`. The codes, the `gpt-6-luna` replacement and the Flex 429 behaviour were re-checked against the live OpenAI error-code, deprecation and Flex pages. `node scripts/verify-openai-requests.mjs` checks the request bodies through the installed provider with the network intercepted. No live OpenAI request was made. A3 (cost visibility) is still open.

Research date: 11 November 2026. Scope: OpenAI platform capability and cost research against OpenAg's invariants and open roadmap. It is not an implementation, deployment or live-acceptance claim. OpenAI documentation, pricing, changelog and deprecation pages were read live on developers.openai.com and learn.chatgpt.com. The published npm packages `openai` 7.55.0 and `@ai-sdk/openai` 4.0.111 were downloaded and inspected. The installed `@mastra/core` 1.79.0 bundle was inspected in the main checkout's `node_modules`. OpenAg source was read at `3b5e6ff`. No OpenAI request was sent, and no account, key, credit balance or model access was checked.

It builds on [always-on agent research](always-on-agent-research.md) and [OSS always-on research](oss-always-on-agent-research.md). It does not repeat them.

## Recommendation

Use the credit as a **cheap, high-quality hosted model supply behind the gate OpenAg already has**, not as a second agent platform. In practice:

1. **Make OpenAI a first-class, budget-honest ApiRuntime provider (small).** Use the GPT-6 family through the existing Mastra Responses path. Recognise OpenAI's credit-exhausted and spend-limit 429 codes as terminal so they stop retrying. Send `store: false` by default. Record cached-token counts. Then the owner can run the default bot, heartbeat and reflection on OpenAI and see when the credit runs out.
2. **Use Flex for unattended work (small).** Flex and Batch cost half of Standard. Flex is a single request option the installed Mastra bundle already exposes (`serviceTier`). Batch adds a 24-hour job lifecycle for what is one call per night.
3. **Add OpenAI web search as a gated first-party tool (small to medium).** The daemon makes a separate Responses call with `web_search`, then returns cited results as `search`-class, untrusted output. That is the same shape as the Brave tool. Never hand `web_search` to the bot's own model call, because it would execute outside `ctx.callTool`.
4. **Fix the dictation model path before OpenAI removes the old models (small).** The `gpt-4o-*-transcribe` and `whisper-1` models shut down on 26 February 2027. Live dictation on `gpt-live-transcribe` is the next step that is already researched.
5. **Defer or avoid the OpenAI features that move authority or state out of the daemon.** These are hosted remote MCP, connectors, hosted shell, Code Interpreter with network access, Conversations / `previous_response_id`, file search and vector stores, and the Agents API. Each one either executes tools at OpenAI where OpenAg's gate cannot see the call, or makes OpenAI a second store of conversation state. `previous_response_id` saves no input-token cost.
6. **Treat GPT-Live voice as a later, design-first item.** Its *client delegation* mode keeps every backend action in OpenAg, which fits the invariants. It needs an HTTPS desk origin, the same prerequisite as Web Push 0.6.0.

At illustrative usage levels (below), the background workload costs single-digit dollars a month on the credit. Interactive chat on a mid-tier model decides whether $200 is enough, and prompt caching is the main lever on that cost. These are estimates, not measurements.

Recommended next pick: **work items A1 to A3 as one OpenAI provider slice**, using **OA-335** (model selection) as the owning ticket. Then pick the non-OpenAI items in the last section. Do not start Agents API, hosted MCP or Realtime work before that.

## Evidence labels

- **Documented**: an OpenAI docs, pricing or changelog page states it. That is the vendor's contract, not acceptance testing.
- **Package**: read in published or installed package source. That shows the code, not runtime behaviour.
- **Source**: read in OpenAg at `3b5e6ff`. That shows an implementation path, not deployed state.
- **Estimate**: arithmetic on documented prices with stated assumptions.
- **Unverified**: not confirmed in this research.

## 1. What OpenAg uses from OpenAI today (Source)

| Surface | Endpoint / protocol | Where | Notes |
| --- | --- | --- | --- |
| Hosted chat bots (`openai/<model>`) | **Responses API** through Mastra's model router | `apps/daemon/src/runtimes/api.ts:89-98` (Mastra `Agent.generate`), protocol label `apps/daemon/src/hostedmodels.ts:153` | The installed Mastra 1.79.0 builds `createOpenAI({...}).responses(modelId)` from a bundled `@ai-sdk/openai` **3.0.130** (Package: `@mastra/core/dist/netlify-*.js`, `case "openai"`). Only OpenAg `ToolDef`s become Mastra tools. Each one executes through `ctx.callTool` (`runtimes/api.ts:35-46`), so no provider-defined (hosted) tools are passed. |
| Request options | `providerOptions.openai.reasoningEffort` only | `apps/daemon/src/botmodels.ts:35-37`, `hostedmodels.ts:188-197` | No `store`, `serviceTier`, `promptCacheKey`/`promptCacheOptions`, `previousResponseId` or `conversation` is set. The bundled provider defaults `store` to **true** (Package), so OpenAI keeps each Responses turn as application state for 30 days. |
| Model discovery | `GET https://api.openai.com/v1/models` | `apps/daemon/src/hostedmodels.ts:91` | Capability data comes from the models.dev-derived catalogue ([model-capability-sources](model-capability-sources.md)). |
| Room router "openai-decision" | **Decisions API** `POST https://api.openai.com/v1/decisions` (choice question) | `apps/daemon/src/router.ts:224-233`, [provider-routing](provider-routing.md) | The only non-Responses text endpoint in use. Legacy configurations go through OpenRouter (`router.ts:108`). |
| Dictation | `POST https://api.openai.com/v1/audio/transcriptions`, `chunking_strategy=auto`, fixed host, `redirect: "error"`, 60 s timeout, no retry, redacted result | `apps/daemon/src/transcription.ts:46-70`, setting `settings.ts:177` (default model is empty) | Completed recordings only. Live dictation is researched in [live-dictation-research](live-dictation-research.md) but not built. |
| Embeddings | **None from OpenAI.** Ollama `/api/embed`, default `nomic-embed-text` | `apps/daemon/src/vectors.ts:37,46`, `main.ts:152` | sqlite-vec tables are sized per dimension (`vectors.ts:238-246`). |
| Codex bots | ChatGPT-subscription login. `OPENAI_API_KEY` and `CODEX_API_KEY` are deleted from the child env | `apps/daemon/src/runtimes/acp.ts:211-215`, [codex-acp](codex-acp.md) | Pinned `@openai/codex` 0.164.0 (latest on npm: 0.167.0). |
| Key handling | `OPENAI_API_KEY` is read only from the daemon env (`providers.ts:14-18`), registered with the redactor (`providers.ts:19-21`) and stripped from every bot process (`secret-env.ts:8-13`, `acp.ts:138-142`) | | Any `*_API_KEY` is stripped. `OPENAI_ADMIN_KEY` does **not** match that rule (see A5). |
| Token accounting | Per-request input, output and total tokens recorded in request provenance | `apps/daemon/src/request-provenance.ts:151-158` | Cached-input and cache-write tokens are not recorded. Nothing converts tokens to dollars. |
| Retry classification | 429 is treated as temporary. Of the billing codes, only `insufficient_quota` and `billing_hard_limit_reached` are terminal | `apps/daemon/src/runtimes/model-retries.ts:46,59` | OpenAI's current codes `credit_balance_exhausted`, `organization_spend_limit_exceeded`, `project_spend_limit_exceeded` and `organization_usage_limit_exceeded` are missing from that list. They would be retried as temporary 429s (Source; runtime behaviour unverified). |

The default-model hint in `runtimes/api.ts:54` still suggests `openai/gpt-4o-mini`, which shuts down on 14 January 2027 (see section 2).

## 2. The platform as of November 2026 (Documented)

### The credit itself

The "$200/month" matches the **Pro ($200 tier)** benefit, *API credits for ChatGPT subscribers* (launched 28 October 2026). Key terms:

- Credits expire at the end of each billing cycle and do not roll over.
- They are used before purchased credits.
- When they run out with no purchased balance, requests fail with HTTP `429` `credit_balance_exhausted`.
- They cover the Responses, Agents, Decisions, Realtime/Live and Images APIs and built-in tools.
- **"Codex usage through API keys is not supported by this benefit."** The credits also do not raise signed-in Codex limits.

Source: [API credits for ChatGPT subscribers](https://developers.openai.com/api/docs/guides/chatgpt-api-credits), [changelog 28 Oct 2026](https://developers.openai.com/api/docs/changelog).

Implications:

- OpenAg's existing removal of `OPENAI_API_KEY` from Codex children is correct and should stay. An API-key Codex would bill purchased credit, or fail.
- Unused credit is lost each month, so moving the cheap unattended work onto OpenAI costs the owner nothing extra up to the cap.
- That the owner's account is on this benefit, and its balance, is **unverified**.

Spend controls are dashboard settings. A hard limit returns `429` `organization_spend_limit_exceeded` / `project_spend_limit_exceeded`, and enforcement is not instantaneous. [Spend limits](https://developers.openai.com/api/docs/guides/spend-limits). Usage tiers are now Free ($100/month usage limit), Build, Launch and Grow. [Rate limits](https://developers.openai.com/api/docs/guides/rate-limits). How the credit benefit interacts with the tier's monthly usage limit is **unverified**.

### Models and prices (Standard tier, per 1M tokens, ≤272K input)

| Model | Positioning | Input / cached / output | Batch = Flex |
| --- | --- | --- | --- |
| `gpt-6-astra` | Flagship | $10 / $1.00 / $50 | $5 / $0.50 / $25 |
| `gpt-6.1-sol` | Near-Astra at lower cost | $2 / $0.10 / $10 | $1 / $0.05 / $5 |
| `gpt-6.1-terra` | Fast; visual reasoning, computer use, writing | $1 / $0.05 / $5 | $0.50 / $0.025 / $2.50 |
| `gpt-6-luna` | Cost-sensitive, high volume; also the only Decisions model | $0.10 / $0.01 / $0.50 | $0.05 / $0.005 / $0.25 |

Cache writes cost 1.25× input for the default 30-minute lifetime and 2.5× for 12 hours. The four models list a 1.05M context window and support functions, web search, file search and computer use. Sources: [Models](https://developers.openai.com/api/docs/models), [Pricing](https://developers.openai.com/api/docs/pricing).

For GPT-6 tool use: "GPT-6 Astra, GPT-6.1 Sol, and GPT-6.1 Terra support Chat Completions, but tool calling requires Responses" ([GPT-6 guide](https://developers.openai.com/api/docs/guides/latest-model/gpt-6-astra)). OpenAg's direct OpenAI path already uses Responses. Whether OpenRouter-routed OpenAI models keep tool calling is **unverified**.

Deprecations that affect OpenAg ([Deprecations](https://developers.openai.com/api/docs/deprecations)):

- `gpt-4o-mini`, `gpt-4o`, `gpt-4.1` and `gpt-4.1-mini` shut down on **14 Jan 2027**. The recommended replacement is `gpt-6-luna`.
- `whisper-1` and the `gpt-4o(-mini)-transcribe(-diarize)` models shut down on **26 Feb 2027**. The replacement is `gpt-transcribe` or `gpt-live-transcribe`.
- `tts-1`, `tts-1-hd` and `gpt-4o-mini-tts` shut down on **6 Jan 2027**. The replacement is Realtime `gpt-realtime-2.1-mini`; `/v1/audio/speech` has no successor model.
- `gpt-5.4-nano` and `gpt-5.1` shut down on 1 Apr 2027.
- The Assistants API was removed on 26 Aug 2026.

### Responses state, background mode and webhooks

- **`store`.** Responses are stored 30 days by default. Conversation objects have no 30-day TTL. Chaining with `previous_response_id` still bills "all previous input tokens … as input tokens". [Conversation state](https://developers.openai.com/api/docs/guides/conversation-state).
- **Server-side compaction.** Configured with `context_management` / `compact_threshold`. [Compaction](https://developers.openai.com/api/docs/guides/compaction).
- **Background mode.** `background: true`; poll or resume the stream by `sequence_number`; cancel is idempotent. With `store=false`, data is kept about 10 minutes for polling. [Background](https://developers.openai.com/api/docs/guides/background).
- **Webhooks.** These follow Standard Webhooks (`webhook-id`, `webhook-timestamp`, `webhook-signature`). Retries run for up to 72 hours; redirects count as failures. The endpoint must be publicly reachable. [Webhooks](https://developers.openai.com/api/docs/guides/webhooks).
  - Package: `openai` 7.55.0 provides `webhooks.unwrap()/verifySignature()` with a 300-second default tolerance.
  - Package: event types include `response.completed|failed|incomplete|cancelled`, `batch.*`, `agent.session.*`, `realtime.call.incoming` and `live.call.incoming`.

### Cost levers

- **Flex**: `service_tier: "flex"` on Responses or Chat Completions, billed at Batch rates. It is slower, and when capacity is short it returns `429` "Resource Unavailable" with no charge. The SDK default timeout is 10 minutes. [Flex](https://developers.openai.com/api/docs/guides/flex-processing).
- **Batch**: 50% off, a 24-hour window, `/v1/responses` supported, a separate rate-limit pool, and output files deleted after 30 days. Batches are not ZDR-eligible. [Batch](https://developers.openai.com/api/docs/guides/batch), [Your data](https://developers.openai.com/api/docs/guides/your-data).
- **Prompt caching**: automatic at ≥1,024 visible tokens on GPT-5.6 and later. Reads cost 0.1× input (0.05× on 6.1 Sol/Terra).
  - `prompt_cache_options.ttl` is `30m` (default) or `12h`.
  - Up to four explicit breakpoints are allowed per request.
  - Keep the prefix stable and append rather than rewrite.
  - Watch `cached_tokens` and `cache_write_tokens`.

  Source: [Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching). The 12-hour option was added on 20 October 2026 ([changelog](https://developers.openai.com/api/docs/changelog)).

### Built-in tools: where they execute

| Tool | Executes | Source |
| --- | --- | --- |
| `function`, custom tools, local `shell` (`environment: local`), `apply_patch`, `computer` | **Your application.** The model only requests the call. For computer use, `status: "completed"` means the model finished generating the call, not that the action ran. | [Tools](https://developers.openai.com/api/docs/guides/tools), [Shell](https://developers.openai.com/api/docs/guides/tools-shell), [Computer use](https://developers.openai.com/api/docs/guides/tools-computer-use) |
| `web_search` | **OpenAI.** Supports `filters.allowed_domains` (up to 100), `external_web_access: false` (cache-only), `include: ["web_search_call.action.sources"]` and required `url_citation` display. Costs $10 per 1k calls plus search content tokens. | [Web search](https://developers.openai.com/api/docs/guides/tools-web-search), [Pricing](https://developers.openai.com/api/docs/pricing) |
| `file_search` + vector stores | **OpenAI** ("a hosted tool managed by OpenAI"). Storage is $0.10/GB/day; calls are $2.50 per 1k. Vector stores are kept until deleted and are not ZDR-eligible. | [File search](https://developers.openai.com/api/docs/guides/tools-file-search), [Your data](https://developers.openai.com/api/docs/guides/your-data) |
| Code Interpreter, hosted `shell` (`container_auto`) | **OpenAI containers.** Network is off by default; an org allowlist and `network_policy` can open it; `domain_secrets` attaches credentials per domain. Costs $0.03 per 20 minutes for 1 GB. | [Shell](https://developers.openai.com/api/docs/guides/tools-shell), [Code Interpreter](https://developers.openai.com/api/docs/guides/tools-code-interpreter) |
| Remote `mcp` / connectors | **OpenAI calls the MCP server.** Approval is required by default (`mcp_approval_request` / `mcp_approval_response`); `require_approval: "never"` is allowed. OpenAI warns that a malicious server "can exfiltrate sensitive data from anything that enters the model's context". `connector_id` is deprecated for newer models. Secure MCP Tunnel reaches private servers with an outbound-only client. | [MCP and connectors](https://developers.openai.com/api/docs/guides/tools-connectors-mcp), [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels) |
| `image_generation` | **OpenAI** | [Tools](https://developers.openai.com/api/docs/guides/tools) |

### Other surfaces

- **Decisions API** (GA 22 Oct 2026). `POST /v1/decisions` with `gpt-6-luna`. It takes 1 to 400 named questions of type `predicate`, `choice` or `score`, and returns probabilities and confidence. Input costs $0.10 per 1M tokens and output is not charged. It runs no tools and is ZDR-eligible. OpenAI says it is about 10× faster than Responses. [Decisions](https://developers.openai.com/api/docs/guides/decisions).
- **Realtime / GPT-Live.** WebRTC uses server-minted client secrets (`POST /v1/realtime/client_secrets`) or `/v1/realtime/calls`. In Realtime, `function` tools are executed by your app and `mcp` tools by the Realtime API. [Realtime](https://developers.openai.com/api/docs/guides/realtime), [Realtime with tools](https://developers.openai.com/api/docs/guides/realtime-mcp).
  - GPT-Live (`gpt-live-1`, $0.05/minute) has **client delegation**: "your application owns permissions, confirmations, business records, and task state", and the delegation event carries metadata, not task text. [Live delegation](https://developers.openai.com/api/docs/guides/live-delegation), [Live sessions](https://developers.openai.com/api/docs/guides/live-conversations).
  - Outbound SIP calling became generally available on 2 Nov 2026 ([changelog](https://developers.openai.com/api/docs/changelog)).
- **Transcription.** `gpt-transcribe` costs $0.0045/minute; `gpt-live-transcribe` and `gpt-realtime-whisper` cost $0.017/minute. [Pricing](https://developers.openai.com/api/docs/pricing).
- **Embeddings.** `text-embedding-3-small` costs $0.02 per 1M tokens and `-3-large` $0.13; `dimensions` shortens vectors. No newer embedding model is listed. [Embeddings](https://developers.openai.com/api/docs/guides/embeddings).
- **Agents API** (public beta). An OpenAI-managed **Codex harness** with sessions, sandboxes, MCP, subagents, scheduled automations (23 Oct), `auto_review` model approval (30 Oct) and webhooks. Function tools still return to your code through `agent.session.requires_action`. [Agents API](https://developers.openai.com/api/docs/guides/agents-api/overview), [Functions](https://developers.openai.com/api/docs/guides/agents-api/tools/functions).
- **Usage and Costs Admin API.** `GET /v1/organization/usage/{completions,embeddings,audio_transcriptions,web_search_calls,file_search_calls,…}` and `/v1/organization/costs` take `bucket_width` (`1m|1h|1d`) and `group_by` (project, API key, model, …). They require an **Admin API key**, which "cannot be used for non-administration endpoints". The same key family manages API keys, projects and spend limits. [Usage reference](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage), [Admin APIs](https://developers.openai.com/api/docs/guides/admin-apis). Whether an Admin key can be scoped read-only, and whether a credit-balance endpoint exists, are **unverified**.
- **Data.** API data is not used for training by default. Abuse-monitoring logs are kept up to 30 days. ZDR forces `store=false` and excludes Conversations, vector stores, files and batches. [Your data](https://developers.openai.com/api/docs/guides/your-data).
- **Codex billing.** ChatGPT sign-in uses the subscription. An API key is "billed through your OpenAI Platform account at standard API rates" and some features are unavailable with it. [Codex auth](https://learn.chatgpt.com/docs/auth) (redirected from developers.openai.com/codex/auth).

### SDK and Mastra support (Package)

- The installed **Mastra 1.79.0** bundles `@ai-sdk/openai` 3.0.130 for its model router. Its Responses `providerOptions` accept:
  - `store`, `previousResponseId`, `conversation`
  - `serviceTier` (`auto|flex|priority|fast|ultrafast|default`)
  - `promptCacheKey`, `promptCacheOptions` (`mode`, `ttl: "30m"` only), `promptCacheRetention`
  - `reasoningEffort`, `reasoningContext`, `truncation`, `maxToolCalls`, `safetyIdentifier`
  - provider tools (`web_search`, `file_search`, `code_interpreter`, `image_generation`, `shell`, `local_shell`, `apply_patch`, `mcp`, `tool_search`)

  No asynchronous `background` request option was found; the only `background` field belongs to image generation.
- **`@ai-sdk/openai` 4.0.111** (latest) adds `ttl: "12h"`. Latest `@mastra/core` is 1.82.0. Which `@ai-sdk/openai` version Mastra 1.82.0 bundles is **unverified**.
- **`@openai/agents` 0.21.0** exists. Adopting it would introduce a second agent loop, which the parking lot rules out.

## 3. Fit against OpenAg invariants

| Capability | Fit | Why |
| --- | --- | --- |
| GPT-6 models via Mastra Responses | **Good** | This is the existing path. Tools stay OpenAg `ToolDef`s behind `ctx.callTool`. |
| `store: false` | **Good** | OpenAg already resends its own bounded history ([hosted-context](hosted-context.md)). The daemon remains the only conversation store. The bundled provider adds `reasoning.encrypted_content` automatically when `store` is false (Package). |
| Flex for unattended turns | **Good** | A request option only. Needs a fallback when Flex returns 429 "Resource Unavailable", and the 10-minute SDK timeout has to fit inside the turn watchdog (unverified). |
| Prompt caching | **Good** | Billing only. Needs a stable prefix, so `prepareTurnInput` ordering has to be measured (cached-token share unverified). |
| Decisions API for routing / wake scoring | **Good** | No tools; typed output with probabilities. Already used by the router. |
| OpenAI web search **as a daemon-owned ToolDef** | **Good** | The search runs inside a gated `search`-class tool, and its output is wrapped untrusted like Brave (`tools/brave.ts:30,44`). Domain filters and `external_web_access:false` can be fixed by the daemon. |
| `web_search` passed as a provider tool on the bot's own request | **Breaks the gate** | OpenAI executes the search inside the model call, so `ctx.callTool` never sees it. Unattended and confined modes could not refuse it. Its fetched content would enter context without OpenAg's untrusted wrapper. |
| Remote MCP / connectors, hosted shell / Code Interpreter with network, Agents API hosted tools | **Breaks the gate** | OpenAI executes calls and holds credentials for the call (`authorization`, `domain_secrets`). The only control is OpenAI's own approval item (`mcp_approval_request`) or `auto_review`. If ever used, it would have to be mapped to an OpenAg approval as a provider prompt (OA-473 territory) and classed `act-external`. Not recommended. |
| Computer use (`computer` tool) | **Possible, later** | Your harness executes the actions, so it could drive the existing `computer_*` tools through the gate. But OpenAg's computer path is per-action tools across both ACP adapters, and a second computer loop adds a new receipt surface. |
| Conversations / `previous_response_id` / server compaction | **Conflicts** | Makes OpenAI a second store of conversation state. There is no cost saving on input tokens. Compaction would rewrite context outside OpenAg's provenance. |
| File search / vector stores | **Conflicts** | Duplicates sqlite-vec. Memory is kept at OpenAI until deleted and is not ZDR-eligible. |
| OpenAI embeddings | **Optional** | Cheap and gated. But memory text would leave the host (local-first), and switching models requires re-embedding into a new dimension table (`vectors.ts:238-246`). |
| OpenAI webhooks / background mode | **Low value now** | Webhooks need public ingress (OpenAg exposes only `/hooks/*` through a tunnel) and a new signing secret. Background mode is not exposed by the installed Mastra bundle. Polling works for the one-shot reflection. |
| GPT-Live client delegation | **Good, design-first** | Voice is a front end; backend tasks become ordinary OpenAg turns. Needs a secure (HTTPS) origin for the microphone, a server-minted client secret, and redaction of transcripts. |
| Admin Usage/Costs API | **Careful** | The key is organisation-admin power. `OPENAI_ADMIN_KEY` is not stripped from bot processes by `isDaemonSecretEnvName` today (`secret-env.ts:8-13`), so it would need to be added to that rule, registered with the redactor and kept owner-only. |

## 4. Candidate work items

Each item needs its own acceptance. Costs are estimates against the $200/month credit.

### A. OpenAI provider slice (owning ticket: OA-335)

**A1. Budget-honest provider errors (S).** Add `credit_balance_exhausted`, `organization_spend_limit_exceeded`, `project_spend_limit_exceeded` and `organization_usage_limit_exceeded` to the terminal set in `model-retries.ts:46`.

- Surface them as a typed outcome such as "OpenAI credit/spend limit reached", rather than a generic failure.
- Add the same handling to dictation (`transcription.ts`) and the Decisions router.
- Value: no retry storm when the monthly credit runs out, and an honest reason in the desk and heartbeat.
- Risk: low.
- Touches OA-335, the hosted outcome contract and help docs.

**A2. Safer OpenAI request defaults (S).** Pass `providerOptions.openai.store = false` for OpenAI bots, the router and reflection. Replace the `gpt-4o-mini` hint (`runtimes/api.ts:54`) with a current model.

- Value: no 30-day OpenAI-side copy of every turn; one conversation store.
- Risk: some OpenAI features (MCP approval chaining, `previous_response_id`) need stored responses, which reinforces section 3. Verify with a controlled two-turn journey that reasoning models still continue correctly with `store:false`.

**A3. Cache and cost visibility (S/M).**

- Record `cachedInputTokens` and cache writes next to the existing counts (`request-provenance.ts:151-158`).
- Show an **estimated** monthly OpenAI spend from recorded tokens and a price table, labelled as an estimate. Never call it "remaining credit".
- Optionally set `promptCacheKey` per bot.

Value: the owner sees whether $200 is enough, and the cache hit rate becomes measurable. Risk: prices change, so keep the table data-driven with a verification date. Touches OA-335 and [ops](../ops.md) (the turn budget counts turns, not dollars).

**A4. Flex for unattended turns (S).** For heartbeat, reflection and automations on an OpenAI bot, send `serviceTier: "flex"`. On Flex 429 "Resource Unavailable", retry once at `auto`, or record an incomplete run; never replay tool effects.

- Value: half price on background work.
- Risk: latency against the turn watchdog, plus the retry semantics in `model-retries.ts`. Needs a controlled check.
- Touches OA-459 (reflection) and heartbeat.

**A5. Optional usage readback (M, later).** Read `/v1/organization/costs` with an Admin key held only in daemon env. Add `OPENAI_ADMIN_KEY` to `isDaemonSecretEnvName`, register it with the redactor, and make the readback owner-only.

- Value: actual billed cost instead of an estimate.
- Risk: an admin-grade secret on the host. Prefer A3 plus a dashboard hard spend limit set by the owner.
- Do only if A3's estimate proves insufficient.

### B. Capabilities

**B1. `openai_web_search` first-party tool (S/M).** A `search`-class `ToolDef` beside Brave. The daemon calls `/v1/responses` on `gpt-6-luna` or `gpt-6.1-terra` with `web_search`, and returns the answer plus `url_citation`s and the sources list, wrapped `{untrusted:true}`.

- Settings: owner-set `allowed_domains` and live versus cache-only access.
- Value: web search without a Brave key; the same gate and capability diagnostics ([capabilities](capabilities.md)).
- Cost: $10 per 1k searches plus content tokens. Ten searches a day is about $3 a month plus tokens (Estimate).
- Risk: search content tokens are billed at model rates, so cap `search_context_size`.
- Touches OA-347 (default bot tools) and requires `node scripts/verify-capabilities.mjs`.

**B2. Dictation model migration and live dictation (S, then M).**

- Steer the transcription picker to `gpt-transcribe` before 26 Feb 2027, and warn on deprecated selections.
- Then build live dictation on `gpt-live-transcribe` following [live-dictation-research](live-dictation-research.md).
- Cost: $0.0045/minute recorded, $0.017/minute live; 20 minutes a day is about $2.70 or $10.20 a month (Estimate).
- Touches composer dictation (shipped) and OA-335 catalogue filtering.

**B3. Decisions API as a cheap wake scorer (M, design-first).** After the heartbeat verdict, score ping urgency with `predicate`/`score` questions on `gpt-6-luna`. Feed the result into the existing wake filter order (dedupe, active hours, urgency, budget). Never let it bypass the filter.

- Value: calibrated probabilities and an audit trail per ping.
- Cost: well under $1 a month (Estimate).
- Risk: an extra model hop that needs measured usefulness. The prior research asks to measure missed important events.

**B4. Optional OpenAI embedder (S/M).** Add `OPENAG_EMBED_PROVIDER=openai` using `text-embedding-3-small`.

- Value: a vector index without Ollama on the host.
- Cost: cents a month.
- Risk: memory text leaves the host, and switching requires a full re-embed. Keep Ollama as the default.

**B5. GPT-Live voice desk (L, design-first, after Web Push / HTTPS).** Use client delegation: the daemon mints a short-lived client secret, the desk connects over WebRTC, and delegations become ordinary OpenAg turns through the gate and approvals.

- Cost: $0.05/minute plus backend turns; 15 minutes a day is about $22.50 a month (Estimate).
- Risks: transcript redaction, approval UX by voice, and the HTTPS origin.
- Touches OA-306/307 (WebRTC transport). This is a different WebRTC peer; do not conflate them.

### Not recommended now

- **Hosted MCP / connectors and hosted shell / Code Interpreter in bot turns.** These execute outside the gate. OpenAg already runs MCP itself, including OAuth.
- **Agents API.** It replaces OpenAg's loop, approvals and scheduler with OpenAI-managed ones (`auto_review` is a model approver). Parking lot: "Replacing the ACP CLIs with a custom agent loop".
- **Conversations, `previous_response_id`, compaction, file search.** These create a second state store with no input-token saving.
- **Batch API for reflection.** Flex gives the same price per token without a file and job lifecycle. Revisit only for bulk re-embedding or evaluations.
- **Codex on an API key.** Not covered by the credit.

### Illustrative monthly cost on the credit (Estimate)

The assumptions are invented for scale only. Actual use, prompt sizes and cache hit rate are unmeasured.

| Workload | Assumption | Model / tier | ≈ $/month |
| --- | --- | --- | --- |
| Heartbeat | 32 runs/day, 20K input (80% cached), 0.5K output | `gpt-6.1-terra` Flex | ≈ $3.50 (≈ $7 Standard) |
| Reflection | 1/night, 60K input, 3K output | `gpt-6.1-sol` Flex | ≈ $2.30 |
| Router / Decisions | 100/day, 2K input | `gpt-6-luna` | < $1 |
| Web search tool | 10/day plus tokens | Luna/Terra | ≈ $3 to $6 |
| Dictation | 20 min/day recorded | `gpt-transcribe` | ≈ $2.70 |
| Interactive default bot | 50 turns/day × 5 steps × 30K input (90% cached), 1K output per step | `gpt-6.1-sol` Standard | ≈ $140 |
| Same, on Terra | as above | `gpt-6.1-terra` Standard | ≈ $70 |

Conclusion: background and assistive features fit easily. The interactive model choice, and whether the cache actually hits, decide whether the credit lasts the month. This is why A1 and A3 come first.

## 5. Mapping to open ROADMAP items

| ROADMAP item | OpenAI relevance |
| --- | --- |
| **OA-335** Bot adapter switching and model selection | Owns A1 to A4. Also covers GPT-6 presets in the picker, removing deprecated defaults, and Responses-only tool calling for GPT-6. |
| **OA-459** Save reflection memory automatically | [reflection.md](reflection.md) already describes automatic saving, so the ROADMAP entry may be stale (closing it is out of scope here). OpenAI adds a cheaper reflection model through A4. A strict JSON schema on the reflection output is possible but goes through Mastra, which is unverified for this call. |
| **OA-347** Default bot management tools (design first) | B1 gives the default bot web search without a third-party key. The default bot can run on an OpenAI model on the credit. |
| **Web Push 0.6.0** | No OpenAI dependency. Its HTTPS desk origin (Tailscale Serve) is also a prerequisite for B5 and live dictation in phone browsers. |
| **OA-473** Provider response forms in chat | Relevant only if hosted MCP approvals were adopted, which is not recommended. |
| **OA-306 / OA-307** Desk WebRTC | Separate from OpenAI Realtime WebRTC. B5 should come after them, or explicitly not depend on them. |
| **OA-354** Live connector acceptance | Not affected. OpenAI connectors are not recommended. |

## 6. Non-OpenAI view: what to build next for the always-on agent

In priority order, reasoning from the earlier research (attention, truthful outcomes, trust):

1. **OA-477 questions and decisions in chat**, then **OA-473 provider response forms in chat with owner notification.** These make an always-on agent's pauses visible where the owner already is. They remove the "Needs you" queue split described in the AGENTS.md conversation rules.
2. **Web Push 0.6.0.** Encrypted, device-bound notifications tied to device revocation are the missing half of "only interrupt when it matters" on a phone. They also give the desk the HTTPS origin that voice and live dictation need.
3. **OA-469 and OA-475 receipt conflict and inspection cleanup.** Uncertain receipts that block other conversations are the main way unattended work stalls without anyone seeing it.
4. **OA-215 close-out.** The code exists. Closing it gives a tunnel-free GitHub trigger with acceptance evidence.
5. **OA-466 rendering performance.** This is quality of life for a long-running desk. Lower priority than the items above.

The identity and avatar items (OA-460, OA-462, OA-390) add polish but do not move the always-on promise.

## What could not be verified

- The owner's account: credit balance, whether it is the Pro $200 benefit, usage tier, model access, and project spend limits.
- Live behaviour of any OpenAI request from OpenAg, including `store:false` with GPT-6 reasoning continuity, Flex latency against the watchdog, and whether `prepareTurnInput` yields cache hits.
- How the four new billing 429 codes are classified at runtime. Only the code list in `model-retries.ts` was read.
- Whether OpenRouter-routed OpenAI GPT-6 models keep tool calling.
- Which `@ai-sdk/openai` version Mastra 1.82.0 bundles, and whether it exposes background mode.
- Whether Admin API keys can be read-only, and whether a credit-balance API exists.
- The complete webhook event list on the docs page. It was taken from the SDK types instead.
- How the credit benefit interacts with the Free tier's $100 monthly usage limit.
- The documented Realtime client-secret TTL.
- Reasoning-model behaviour with Structured Outputs through Mastra for reflection.

No OpenAg code, ticket, configuration or live service was changed. This note is research, not bot-facing documentation of shipped behaviour.
