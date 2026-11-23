# Computer

Computer opens the managed-computer controls. The default backend is Cua; optional backends depend on administrator configuration. A configured backend is not proof a session is running. "cua is not installed": install the Cua CLI there or pick another backend. Shell availability varies by backend.

Computer actions share a lock. Human takeover pauses bot input while screenshots remain available. Computer shell is an external action. Clicking a submit button cannot reliably be detected from pixels, so input actions ask by default. Do not recommend making all input automatic as a way around action review.

The capability catalogue reads a passive computer snapshot. It reports not_observed before the first observation, or the last observed lifecycle state with its timestamp. Busy, human_control and backend_switch_pending describe current local restrictions. Reading this catalogue never probes a backend, starts a computer, applies a pending backend switch or releases a hosted session. Shell support is backend-specific; screenshots remain separate from human input control. Configuration and permissions are reported separately, and execution rechecks them.

Computer has Refresh status in the full page and conversation panel. Unknown or unreadable status requires another status check and, if unresolved, inspection on the OpenAg machine. It is not evidence that the computer is absent. Refresh never creates, destroys or switches the computer, or releases a hosted session. An explicit backend selection is separate; if busy or human control blocks it, wait and use Apply selected backend. See [status inspection and recovery](../notes/cua.md).

Integrations and connectors are in the `computer-connectors` help topic.
