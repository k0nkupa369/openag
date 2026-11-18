# Agent management

Agent tools reuse the desk's validated creation, settings, handle, cached model and skill-assignment operations. They require an interactive Full-access conversation. Unattended, isolated and specialist request turns cannot manage agents. Changing another agent's instructions or skills grants no action permission; the target's permission sessions remain authoritative. Deletion and permission changes are owner controls, not agent tools.

- `agent_models`: read cached creation choices, or choices/revision for an existing agent. No refresh or provider request. For creation, retain its requestId and snapshotId.
- `agent_create`: create using those choices. Repeat the same requestId after an uncertain response; a matching request reads back the same agent, changed content is refused. Creation starts no turn, room, Work or permission upgrade.
- `agent_settings_set`: change an idle agent's name, description or instructions.
- `agent_handle_set`: change an idle agent's public handle, preserving identity and retired aliases. See [handles](agent-handles.md).
- `agent_model_set`: change an idle agent's model using cached snapshot and current revision. Environment overrides and supported reasoning controls remain authoritative.
- `agent_skills_assign`: add discovered shared packages while retaining existing assignments. Use skill_list with includeAvailable=true first. Shared packages remain read-only.

All tool inputs are strict. Configuration writes use redaction, audit the real calling agent and invalidate cached ACP context as applicable. Busy targets refuse configuration changes; only messages queue. Both API and ACP tool offering comes from the first-party registry and MCP allow-list. The bot's durable identity, not its display name, is used for stored references.

Source behavior only. This change does not deploy the tools or establish real-provider acceptance. See [agent requests](agent-requests.md) for asynchronous messages and cancellation.
