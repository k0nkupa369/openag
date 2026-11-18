import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, test } from "vitest";
import {
  COMPOSIO_READ_SLUGS,
  COMPOSIO_TOOL_CLASSES,
  composioAllowedRead,
  composioReadRequest,
  composioResult,
  decodeProactiveContinuation,
  proactiveMetadata,
} from "./composio-contract.js";

const text = (value: unknown): CallToolResult => ({ content: [{ type: "text", text: JSON.stringify(value) }] });
const structured = (value: unknown): CallToolResult => ({ content: [], structuredContent: value as Record<string, unknown> });
const batch = (...slugs: string[]) => ({ tools: slugs.map((tool_slug) => ({ tool_slug, arguments: {} })) });
const okBatch = (...slugs: string[]) => ({
  successful: true,
  data: { results: slugs.map((tool_slug) => ({ tool_slug, response: { successful: true, data: {} } })) },
});

describe("reviewed classes", () => {
  test("only metadata lookups are passive; execution and connection tools stay act-external", () => {
    expect(COMPOSIO_TOOL_CLASSES.COMPOSIO_SEARCH_TOOLS).toBe("search");
    expect(COMPOSIO_TOOL_CLASSES.COMPOSIO_GET_TOOL_SCHEMAS).toBe("read");
    for (const name of ["COMPOSIO_MULTI_EXECUTE_TOOL", "COMPOSIO_PROXY_EXECUTE", "COMPOSIO_MANAGE_CONNECTIONS", "COMPOSIO_WAIT_FOR_CONNECTIONS", "COMPOSIO_REMOTE_BASH_TOOL"]) {
      expect(COMPOSIO_TOOL_CLASSES[name]).toBe("act-external");
    }
    expect(COMPOSIO_TOOL_CLASSES.COMPOSIO_FUTURE_TOOL).toBeUndefined(); // unreviewed names keep the opaque default
    expect(Object.isFrozen(COMPOSIO_TOOL_CLASSES)).toBe(true);
  });

  test("the read-only slug list names no write operation", () => {
    expect([...COMPOSIO_READ_SLUGS].sort()).toEqual(["GITHUB_LIST_NOTIFICATIONS", "GMAIL_FETCH_EMAILS", "OUTLOOK_GET_PROFILE", "OUTLOOK_QUERY_EMAILS"]);
  });
});

describe("composioResult", () => {
  test("an explicit success envelope in text content is returned with a provider_returned diagnostic and the log id", () => {
    const out = composioResult("COMPOSIO_GET_TOOL_SCHEMAS", text({ successful: true, data: { x: 1 }, log_id: "log-1" }));
    expect(out.isError).toBeUndefined();
    expect(out.providerDiagnostic).toEqual({ code: "provider_returned", logId: "log-1" });
  });

  test("structuredContent is accepted and long log ids are bounded", () => {
    const out = composioResult("COMPOSIO_GET_TOOL_SCHEMAS", structured({ successful: true, log_id: "x".repeat(900) }));
    expect(out.providerDiagnostic!.logId).toHaveLength(300);
  });

  test("missing, ambiguous or non-boolean envelopes are errors (invalid_envelope)", () => {
    for (const result of [
      text({ marker: "no contract" }),
      text({ successful: "true", data: {} }),
      { content: [{ type: "text" as const, text: "plain words" }] },
      { content: [{ type: "text" as const, text: JSON.stringify({ successful: true }) }, { type: "text" as const, text: JSON.stringify({ successful: true }) }] },
    ]) {
      const out = composioResult("COMPOSIO_GET_TOOL_SCHEMAS", result);
      expect(out.isError).toBe(true);
      expect(out.providerDiagnostic!.code).toBe("invalid_envelope");
    }
  });

  test("a failed or error-carrying envelope is provider_error", () => {
    expect(composioResult("COMPOSIO_GET_TOOL_SCHEMAS", text({ successful: false, error: "nope" })).providerDiagnostic!.code).toBe("provider_error");
    const withError = composioResult("COMPOSIO_GET_TOOL_SCHEMAS", text({ successful: true, error: "late failure" }));
    expect(withError.isError).toBe(true);
    expect(withError.providerDiagnostic!.code).toBe("provider_error");
  });

  test("a batch with one failed row is partial_failure even when the outer call succeeded", () => {
    const value = { successful: true, data: { results: [{ tool_slug: "A", response: { successful: true } }, { tool_slug: "B", error: "second failed" }] } };
    const out = composioResult("COMPOSIO_MULTI_EXECUTE_TOOL", text(value), batch("A", "B"));
    expect(out.isError).toBe(true);
    expect(out.providerDiagnostic!.code).toBe("partial_failure");
  });

  test("a batch must return a matching, explicitly successful result for every requested slug", () => {
    expect(composioResult("COMPOSIO_MULTI_EXECUTE_TOOL", text(okBatch("A", "B")), batch("A", "B")).providerDiagnostic!.code).toBe("provider_returned");
    const cases: Array<[unknown, ReturnType<typeof batch>]> = [
      [okBatch("A"), batch("A", "B")], // fewer results than requested
      [okBatch("A", "OTHER"), batch("A", "B")], // a result for a different operation
      [{ successful: true, data: { results: [{ tool_slug: "A", response: { data: {} } }] } }, batch("A")], // no explicit nested success
      [{ successful: true, data: null }, batch("A")],
    ];
    for (const [reply, args] of cases) {
      const out = composioResult("COMPOSIO_MULTI_EXECUTE_TOOL", text(reply), args);
      expect(out.isError).toBe(true);
      expect(out.providerDiagnostic!.code).toBe("unmatched_results");
    }
  });

  test("a proxied HTTP 4xx status is an error even when the envelope succeeded", () => {
    const out = composioResult("COMPOSIO_PROXY_EXECUTE", text({ successful: true, data: { status: 403, body: {} } }));
    expect(out.isError).toBe(true);
    expect(out.providerDiagnostic!.code).toBe("provider_http_error");
    expect(composioResult("COMPOSIO_PROXY_EXECUTE", text({ successful: true, data: { status: 200 } })).isError).toBeUndefined();
  });
});

describe("composioAllowedRead", () => {
  const outlook = batch("OUTLOOK_GET_PROFILE", "OUTLOOK_QUERY_EMAILS"), gmail = batch("GMAIL_FETCH_EMAILS"), github = batch("GITHUB_LIST_NOTIFICATIONS");
  const list = { toolkits: [{ name: "gmail", action: "list" }] };

  test("Outlook reviewed reads stay reads in any turn", () => {
    expect(composioAllowedRead("COMPOSIO_MULTI_EXECUTE_TOOL", outlook, false)).toEqual(["OUTLOOK_GET_PROFILE", "OUTLOOK_QUERY_EMAILS"]);
  });

  test("Gmail, GitHub and connection-list reads are reads only inside a proactive check", () => {
    for (const [name, args] of [["COMPOSIO_MULTI_EXECUTE_TOOL", gmail], ["COMPOSIO_MULTI_EXECUTE_TOOL", github], ["COMPOSIO_MANAGE_CONNECTIONS", list], ["COMPOSIO_MULTI_EXECUTE_TOOL", batch("OUTLOOK_GET_PROFILE", "GMAIL_FETCH_EMAILS")]] as const) {
      expect(composioAllowedRead(name, args, false)).toBeUndefined();
      expect(composioAllowedRead(name, args, true)).toBeDefined();
    }
  });

  test("a proactive check never widens a non-read request", () => {
    expect(composioAllowedRead("COMPOSIO_MULTI_EXECUTE_TOOL", batch("GMAIL_SEND_EMAIL"), true)).toBeUndefined();
  });
});

describe("composioReadRequest", () => {
  const read = (over: Record<string, unknown> = {}) => ({ ...batch("OUTLOOK_GET_PROFILE", "GMAIL_FETCH_EMAILS"), sync_response_to_workbench: false, thought: "read", ...over });

  test("a batch of reviewed read slugs yields those slugs", () => {
    expect(composioReadRequest("COMPOSIO_MULTI_EXECUTE_TOOL", read())).toEqual(["OUTLOOK_GET_PROFILE", "GMAIL_FETCH_EMAILS"]);
  });

  test.each([
    ["a write slug mixed in", batch("OUTLOOK_GET_PROFILE", "OUTLOOK_SEND_EMAIL")],
    ["lowercase slug", batch("outlook_get_profile")],
    ["empty batch", { tools: [] }],
    ["more than ten", batch(...Array(11).fill("OUTLOOK_GET_PROFILE"))],
    ["unknown top-level key", read({ extra: true })],
    ["workbench offload", read({ sync_response_to_workbench: true })],
    ["unknown key inside a tool entry", { tools: [{ tool_slug: "OUTLOOK_GET_PROFILE", arguments: {}, run_as: "x" }] }],
    ["not an object", "OUTLOOK_GET_PROFILE"],
  ])("%s stays opaque (undefined)", (_label, args) => {
    expect(composioReadRequest("COMPOSIO_MULTI_EXECUTE_TOOL", args)).toBeUndefined();
  });

  test("only a pure list request for connections is a read, and other tools are never reads", () => {
    const list = { toolkits: [{ name: "outlook", action: "list" }], session_id: "s" };
    expect(composioReadRequest("COMPOSIO_MANAGE_CONNECTIONS", list)).toEqual(["connection-list"]);
    expect(composioReadRequest("COMPOSIO_MANAGE_CONNECTIONS", { toolkits: [{ name: "outlook", action: "add" }] })).toBeUndefined();
    expect(composioReadRequest("COMPOSIO_MANAGE_CONNECTIONS", { toolkits: [{ name: "Out look", action: "list" }] })).toBeUndefined();
    expect(composioReadRequest("COMPOSIO_MANAGE_CONNECTIONS", { toolkits: [], })).toBeUndefined();
    expect(composioReadRequest("COMPOSIO_PROXY_EXECUTE", read())).toBeUndefined();
  });
});

describe("proactiveMetadata", () => {
  const outlookArgs = { user_id: "me", folder: "inbox", top: 10, filter: "receivedDateTime ge 2026-11-05T00:00:00.000Z", select: ["id", "subject"], orderby: "receivedDateTime asc" };
  const nextLink = (over: Record<string, string> = {}) => {
    const url = new URL("https://graph.microsoft.com/v1.0/users/me/mailFolders/inbox/messages");
    url.searchParams.set("$filter", outlookArgs.filter);
    url.searchParams.set("$select", "id,subject");
    url.searchParams.set("$top", "10");
    url.searchParams.set("$skiptoken", "tok123");
    for (const [key, value] of Object.entries(over)) url.searchParams.set(key, value);
    return url.href;
  };
  const outlookReply = (body: Record<string, unknown>) => ({
    successful: true,
    error: null,
    data: { results: [{ tool_slug: "OUTLOOK_QUERY_EMAILS", response: { successful: true, data: body } }] },
  });
  const requested = { tools: [{ tool_slug: "OUTLOOK_QUERY_EMAILS", arguments: outlookArgs }] };
  const rowOf = (result: CallToolResult) => (result.structuredContent as any).data.results[0].response.data;

  test("tools outside the projected set are returned untouched", () => {
    const original = text(okBatch("X"));
    expect(proactiveMetadata("COMPOSIO_GET_TOOL_SCHEMAS", original)).toBe(original);
  });

  test("failed or non-envelope replies pass through unchanged", () => {
    const failedReply = text({ successful: false, error: "x", data: {} });
    expect(proactiveMetadata("COMPOSIO_SEARCH_TOOLS", failedReply)).toBe(failedReply);
    const plain: CallToolResult = { content: [{ type: "text", text: "not json" }] };
    expect(proactiveMetadata("COMPOSIO_SEARCH_TOOLS", plain)).toBe(plain);
  });

  test("search results keep only toolkit connection status", () => {
    const out = proactiveMetadata("COMPOSIO_SEARCH_TOOLS", text({ successful: true, error: null, data: { toolkit_connection_statuses: [{ toolkit: "gmail", has_active_connection: true, description: "x".repeat(5000) }], noise: "y".repeat(5000) } }));
    expect(out.structuredContent).toEqual({ successful: true, data: { toolkit_connection_statuses: [{ toolkit: "gmail", has_active_connection: true }] }, error: null });
    expect(JSON.stringify(out).length).toBeLessThan(800);
  });

  test("connection inventory keeps ids, alias (falling back to the user mail) and status", () => {
    const reply = { successful: true, error: null, data: { results: { outlook: { toolkit: "outlook", status: "ok", accounts: [{ id: "a1", alias: "Work", status: "ACTIVE", secret: "drop" }, { id: "a2", user_info: { mail: "me@example.com" }, status: "EXPIRED" }] } } } };
    const out = proactiveMetadata("COMPOSIO_MANAGE_CONNECTIONS", text(reply));
    expect((out.structuredContent as any).data.results.outlook.accounts).toEqual([
      { id: "a1", alias: "Work", status: "ACTIVE" },
      { id: "a2", alias: "me@example.com", status: "EXPIRED" },
    ]);
  });

  test("email pages are reduced to identity, version, subject, preview and sender, with a validated continuation", () => {
    const out = proactiveMetadata("COMPOSIO_MULTI_EXECUTE_TOOL", text(outlookReply({
      value: [{ id: "m1", subject: "Hello", bodyPreview: "p".repeat(400), receivedDateTime: "2026-11-05T01:00:00Z", from: { emailAddress: { address: "a@example.com" } }, webLink: "https://outlook.office.com/m1", body: { content: "HUGE" } }],
      "@odata.nextLink": nextLink(),
    })), requested);
    expect(out.content).toEqual([]);
    const data = rowOf(out);
    expect(data.messages).toEqual([{ id: "m1", updated_at: "2026-11-05T01:00:00Z", subject: "Hello", snippet: "p".repeat(120), sender: "a@example.com", webLink: "https://outlook.office.com/m1" }]);
    expect(data.continuation).toMatch(/^nav1:/);
    expect(JSON.stringify(out)).not.toContain("HUGE");
    // The saved token decodes only against the request it was produced for.
    expect(decodeProactiveContinuation(data.continuation, "OUTLOOK_QUERY_EMAILS", outlookArgs)).toBe(nextLink());
  });

  test("gmail pages take the preview body, not the HTML message text", () => {
    const reply = { successful: true, error: null, data: { results: [{ tool_slug: "GMAIL_FETCH_EMAILS", response: { successful: true, data: { messages: [{ messageId: "g1", subject: "Alert", sender: "a@example.com", messageTimestamp: "2026-11-11T18:40:38Z", messageText: "<!doctype html><html>", preview: { subject: "Alert", body: "A new device was added" } }], nextPageToken: "" } } }] } };
    const data = rowOf(proactiveMetadata("COMPOSIO_MULTI_EXECUTE_TOOL", text(reply), { tools: [{ tool_slug: "GMAIL_FETCH_EMAILS", arguments: {} }] }));
    expect(data.messages).toEqual([{ id: "g1", updated_at: "2026-11-11T18:40:38Z", subject: "Alert", snippet: "A new device was added", sender: "a@example.com" }]);
  });

  test("a continuation pointing at another host or with a changed filter is marked unsupported, not forwarded", () => {
    for (const link of [nextLink().replace("graph.microsoft.com", "evil.example"), nextLink({ $filter: "other" })]) {
      const data = rowOf(proactiveMetadata("COMPOSIO_MULTI_EXECUTE_TOOL", text(outlookReply({ value: [{ id: "m1", subject: "S" }], "@odata.nextLink": link })), requested));
      expect(data.continuation).toBeUndefined();
      expect(data.continuationUnsupported).toBe(true);
    }
  });

  test("a page with a record that has no usable id is returned as-is rather than silently shortened", () => {
    const reply = text(outlookReply({ value: [{ id: "m1", subject: "S" }, { subject: "no id" }] }));
    const out = proactiveMetadata("COMPOSIO_MULTI_EXECUTE_TOOL", reply, requested);
    expect(rowOf(out).value).toHaveLength(2);
    expect(rowOf(out).messages).toBeUndefined();
  });

  test("an unmatched batch is not projected", () => {
    const reply = text(outlookReply({ value: [] }));
    expect(proactiveMetadata("COMPOSIO_MULTI_EXECUTE_TOOL", reply, { tools: [{ tool_slug: "OUTLOOK_QUERY_EMAILS", arguments: outlookArgs }, { tool_slug: "GMAIL_FETCH_EMAILS", arguments: {} }] })).toBe(reply);
  });
});

describe("decodeProactiveContinuation", () => {
  const args = { user_id: "me", query: "in:inbox" };
  const encode = (raw: string) => `nav1:${Buffer.from(raw).toString("base64url")}`;

  test("round-trips an opaque provider page token", () => {
    expect(decodeProactiveContinuation(encode("PAGE_abc-123"), "GMAIL_FETCH_EMAILS", args)).toBe("PAGE_abc-123");
  });

  test("rejects malformed, non-canonical and credential-bearing tokens", () => {
    const bad = [
      "PAGE_abc", // no prefix
      "nav1:not base64!",
      `nav1:${Buffer.from("tok with space").toString("base64url")}`,
      encode("Bearer abcdefghijklmnopqrstuvwxyz0123456789"),
      encode("sk-ant-abcdefghijklmnopqrstuvwxyz"),
      `nav1:${"A".repeat(6001)}`,
    ];
    for (const token of bad) expect(() => decodeProactiveContinuation(token, "GMAIL_FETCH_EMAILS", args)).toThrow("Invalid saved continuation");
  });

  test("a URL token is only valid for Outlook inbox queries on Graph", () => {
    const url = "https://graph.microsoft.com/v1.0/users/me/mailFolders/inbox/messages?$filter=f&$select=id&$skiptoken=t";
    expect(() => decodeProactiveContinuation(encode(url), "GMAIL_FETCH_EMAILS", args)).toThrow("Invalid saved continuation");
    expect(() => decodeProactiveContinuation(encode(url), "OUTLOOK_QUERY_EMAILS", { ...args, folder: "inbox", user_id: "me", filter: "f", select: ["id"] })).not.toThrow();
    expect(() => decodeProactiveContinuation(encode(url), "OUTLOOK_QUERY_EMAILS", { ...args, folder: "sent", filter: "f", select: ["id"] })).toThrow("Invalid saved continuation");
  });
});
