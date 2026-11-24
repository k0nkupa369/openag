# Model requests

## Bounded execution and incomplete results

API and Ollama turns use at most 20 model steps by default. In Bot settings, the owner can set Maximum model steps from 1 to 100. Each turn also permits at most 40 executed tools; refused proposals do not consume that execution allowance. Settings are captured when the turn starts and retained for same-turn recovery. ACP keeps its adapter-owned execution behavior.

API agents receive the most used tools (files, shell, help and status, questions, memory, skills, agent consultation) with every request. Other tools, including every connected MCP tool, are listed by name in `tool_search`; searching loads up to five matches for the rest of that turn, and each call still goes through the same permission and approval checks. A search uses one model step. Ollama and ACP agents are unchanged.

A normal final answer at the exact limit can complete. A forced stop, unresolved calls, output-length stop or omitted oversized tool data is reported as Incomplete, with the reason and any partial findings retained. Model-facing tool data is capped at 20,000 characters in valid JSON. Retained tool events and action receipts remain separate evidence; connected tools can also apply their own output limits.

Incomplete appears in chat, linked Work and automation history. Unknown actions remain in history without a manual inspection requirement; neither Incomplete nor a completed turn proves an external effect. There is no automatic continuation or action retry. Model-request retries are described below. Scheduled turns are not investigations.

See `docs/notes/hosted-outcomes.md` for outcome and recovery details.

## Transient model-request failures

API and Ollama can make up to two retries after an initial generation request fails temporarily. They retry that request, not the conversation, Work, tools or earlier actions. Authentication, configuration and invalid-input errors are not retried. ACP keeps its adapter-owned behavior.

Each model step has a five-minute window shared by its attempts and waits, including response reading. This is not a five-minute limit on an entire turn or on approval waits. A valid provider Retry-After is never shortened. If the wait cannot fit, the result is Incomplete with provider_backoff and, when known, a Retry not before time. That time does not schedule another run. A linked continuation preserves the applicable wait across restart; unrelated requests do not share a new account-wide throttle.

A broken response stream stops incomplete without being resubmitted or combined with another response. Partial findings are retained when available. Deadline and cancellation also stop further submissions. Existing permission and approval gates still apply; a model connection failure does not mean an earlier action failed.

See `docs/notes/model-retries.md` for retry categories, timing, error handling and verification limits.
