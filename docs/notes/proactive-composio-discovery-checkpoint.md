# Proactive Composio discovery checkpoint

5 November 2026. The owner approved source implementation of the Composio-first proactive plan. The first slice must prove hosted Connect service discovery and exact account routing; the later picker and monitoring slices depend on it.

## Verified evidence

- The worktree began at `7e3ecaea702624134f5124f5669b36a985771a67` in detached HEAD. Work continues on `codex/proactive-composio-v1`, preserving the previously drafted specification, research and glossary changes.
- The installed connection uses hosted Connect OAuth, not a developer-project API key. Its previously observed offered catalogue has twelve meta tools. That inventory does not itself enumerate connected upstream services or provide current schemas.
- An isolated metadata connection used the existing saved bearer without refreshing it, copying credentials, registering a client, or writing to the installed store. Its initialize/tools-list path failed with a StreamableHTTPError; no tools/call was sent. Offline inspection confirmed the saved access expiry is in the past and needsAccess is false. These facts do not establish that the installed daemon cannot refresh normally or that provider consent has been revoked.
- Retained successful connection-list invocations name individual toolkits with action list. Their response contains a per-toolkit account collection with account IDs/statuses. This supports a known-service listing shape, not complete service discovery or current schema compatibility. No account identities or returned user information are copied into this note.
- The current public [Connect guide](https://docs.composio.dev/docs/composio-connect) describes mixed connection management. The [Manage Connections reference](https://docs.composio.dev/toolkits/meta-tools/manage_connections) instead documents a toolkit-name list that can initiate authentication for missing connections. Neither is sufficient evidence to grant the complete operation unattended read authority.
- [Composio issue 3118](https://github.com/ComposioHQ/composio/issues/3118) reports incomplete connected-toolkit discovery and is closed, but its discussion does not establish a concrete replacement contract usable by this installed connection. Closure alone is not acceptance.

## Recheck after owner reconnect

The owner reconnected through port 4747 and asked for rechecking. The saved access token is now unexpired and a fresh authenticated initialize/tools-list request succeeded. No restart or separate credential refresh is needed for that metadata inspection. The earlier restart request is no longer applicable to this checkpoint.

The [fresh contract snapshot](proactive-composio-contracts-2026-11-05.json) contains only public tool descriptions and input schemas. Twelve meta tools are exposed, and server capabilities advertise tools only, with no resource catalogue. The current connection-management list operation requires an exact toolkit name; search returns tools relevant to use cases. No offered input provides complete connected-service inventory or its pagination. Multi-execution explicitly supports selecting a connected account by ID or alias, but actual account routing acceptance remains untested because no provider data read was made.

The authentication blocker is resolved; the complete-inventory prerequisite remains unestablished. At this checkpoint two concrete alternatives were presented:

- Keep the existing connection and use a searchable service picker, verifying the selected services' accounts through the explicit passive list operation. This avoids account migration but cannot claim to display every connected service automatically.
- Investigate a project-backed Composio integration with documented complete account inventory. This preserves the complete-inventory product goal but requires a different credential/identity setup and separately approved connection migration, not silent reuse of the current consumer grant.

The owner subsequently approved the searchable-picker alternative with “Then implement it.” The first discovery prerequisite is resolved under that revised contract; complete automatic inventory remains unclaimed. Do not invent wildcard toolkit names, treat query matches as a complete catalogue, or grant the whole mixed connection-management tool background authority.

## State and limits

At the initial checkpoint no application code or shipped knowledge had changed. The owner performed the reconnect; the agent rechecked only metadata. Later source preparation used one live COMPOSIO_SEARCH_TOOLS metadata request to verify available operation schemas, without invoking provider-content reads. All later account/read/delivery acceptance uses synthetic accounts and controlled transports.

Source implementation and knowledge updates are tracked in OA-483 and [the proactive guide](proactive.md). No deployment, daemon restart, agent-initiated saved-credential refresh, live notification test, provider content read or account change was performed. No unit/Jest/Vitest runner was used.

The specification approval covers the agreed source implementation and integration seam. It does not grant production mutations.
