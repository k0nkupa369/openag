import { describe, expect, test } from "vitest";
import { checkLabel, composioData, failureReason, readPage, readRequest, searchServices, serviceAccounts, serviceSlug } from "./proactive-composio.js";

const reply = (data: unknown, extra: Record<string, unknown> = {}) => ({ structuredContent: { successful: true, error: null, data }, ...extra });
const page = (slug: string, body: unknown) => reply({ results: [{ tool_slug: slug, response: { successful: true, data: body } }] });
const encode = (raw: string) => `nav1:${Buffer.from(raw).toString("base64url")}`;

describe("failureReason", () => {
  test.each([
    ["Invalid page_token; continuation expired", "incomplete", { restart: true }],
    ["MCP tool failed: 503 upstream", "unavailable", { transport: true }],
    ["mcp.composio-connect is not enabled", "unavailable", { transport: true }],
    ["HTTP 429 slow down", "rate_limited", {}],
    ["401 Unauthorized", "needs_sign_in", {}],
    ["Token expired", "needs_sign_in", {}],
    ["403 Forbidden", "permission_missing", {}],
    ["Source assessment exceeds its evidence limit", "incomplete", {}],
    ["something odd", "unavailable", {}],
  ])("%s -> %s", (message, status, flags) => {
    const out = failureReason(new Error(message));
    expect(out.status).toBe(status);
    expect(Boolean(out.restart)).toBe("restart" in flags);
    expect(Boolean(out.transport)).toBe("transport" in flags);
  });

  test("accepts non-Error values and never echoes provider text in the reason", () => {
    const out = failureReason("rate limit reached for user secret-person@example.com");
    expect(out.status).toBe("rate_limited");
    expect(out.reason).not.toContain("secret-person");
  });
});

describe("composioData", () => {
  test("returns data for an explicit success, from structured content or JSON text", () => {
    expect(composioData(reply({ a: 1 }))).toEqual({ a: 1 });
    expect(composioData({ content: JSON.stringify({ successful: true, data: { b: 2 } }) })).toEqual({ b: 2 });
  });

  test("truncated, unreadable and unconfirmed replies are refused", () => {
    expect(() => composioData(null)).toThrow("incomplete or oversized");
    expect(() => composioData({ ...reply({}), truncated: true })).toThrow("incomplete or oversized");
    expect(() => composioData({ content: "{not json" })).toThrow("could not be read");
    expect(() => composioData({ content: undefined })).toThrow("did not confirm");
    expect(() => composioData({ structuredContent: { successful: "true", data: {} } })).toThrow("Provider read could not complete");
  });

  test("a failed reply throws the classified reason, including per-row batch errors", () => {
    expect(() => composioData({ structuredContent: { successful: false, error: "401 unauthorized" } })).toThrow("Connection needs sign-in");
    const batchFailure = { structuredContent: { successful: true, error: "1 failed", data: { results: [{ tool_slug: "X", error: "429 rate limit" }] } } };
    expect(() => composioData(batchFailure)).toThrow("Provider rate limit reached");
    expect(() => composioData({ isError: true, structuredContent: { successful: true, data: {} } })).toThrow();
  });
});

describe("searchServices", () => {
  test("keeps valid toolkit slugs with connection state and a check label, dropping malformed rows", () => {
    const out = searchServices(reply({
      toolkit_connection_statuses: [
        { toolkit: "outlook", has_active_connection: true },
        { toolkit: "github", has_active_connection: false },
        { toolkit: "asana", has_active_connection: true },
        { toolkit: "Bad Name", has_active_connection: true },
        { toolkit: 7 },
        null,
      ],
    }));
    expect(out).toEqual([
      { id: "outlook", connected: true, check: "Recent Inbox email" },
      { id: "github", connected: false, check: "Recent notifications" },
      { id: "asana", connected: true, check: null },
    ]);
  });

  test("is capped at 24 rows and requires connection metadata", () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({ toolkit: `svc${i}`, has_active_connection: true }));
    expect(searchServices(reply({ toolkit_connection_statuses: rows }))).toHaveLength(24);
    expect(() => searchServices(reply({}))).toThrow("did not return connection metadata");
  });
});

describe("serviceAccounts", () => {
  const inventory = (service: string, row: unknown) => reply({ results: { [service]: row } });

  test("returns normalized accounts: status uppercased and trimmed, alias defaulting to id and capped", () => {
    const out = serviceAccounts(inventory("outlook", { toolkit: "outlook", accounts: [{ id: "a1", alias: "Work", status: " active " }, { id: "a2", status: "expired" }, { id: "a3", alias: "x".repeat(300), status: "ACTIVE" }] }), "outlook");
    expect(out[0]).toEqual({ id: "a1", alias: "Work", status: "ACTIVE" });
    expect(out[1]).toEqual({ id: "a2", alias: "a2", status: "EXPIRED" });
    expect(out[2]!.alias).toHaveLength(100);
  });

  test("a missing, mismatched or oversized inventory is refused rather than treated as empty", () => {
    expect(() => serviceAccounts(reply({ results: {} }), "outlook")).toThrow("Account inventory is incomplete");
    expect(() => serviceAccounts(inventory("outlook", { toolkit: "gmail", accounts: [] }), "outlook")).toThrow("incomplete");
    expect(() => serviceAccounts(inventory("outlook", { toolkit: "outlook", accounts: "none" }), "outlook")).toThrow("incomplete");
    const many = Array.from({ length: 101 }, (_, i) => ({ id: `a${i}`, status: "ACTIVE" }));
    expect(() => serviceAccounts(inventory("outlook", { toolkit: "outlook", accounts: many }), "outlook")).toThrow("incomplete");
  });

  test("accounts without a usable identity or with duplicate ids are refused", () => {
    expect(() => serviceAccounts(inventory("outlook", { toolkit: "outlook", accounts: [{ status: "ACTIVE" }] }), "outlook")).toThrow("Account identity is unavailable");
    expect(() => serviceAccounts(inventory("outlook", { toolkit: "outlook", accounts: [{ id: "a", status: "ACTIVE" }, { id: "a", status: "ACTIVE" }] }), "outlook")).toThrow("duplicate identities");
  });

  test("a service named like an Object prototype member is not an inventory", () => {
    expect(() => serviceAccounts(reply({ results: {} }), "constructor")).toThrow("incomplete");
  });
});

describe("serviceSlug and checkLabel", () => {
  test("slugs are lowercase identifiers", () => {
    expect(serviceSlug.safeParse("google_calendar").success).toBe(true);
    for (const bad of ["", "Gmail", "1gmail", "a-b", "x".repeat(65)]) expect(serviceSlug.safeParse(bad).success).toBe(false);
  });

  test("only supported services have a check, and prototype names do not", () => {
    expect(checkLabel("gmail")).toBe("Recent Inbox email");
    expect(checkLabel("asana")).toBeNull();
    expect(checkLabel("constructor")).toBeNull();
    expect(checkLabel("toString")).toBeNull();
  });
});

describe("readRequest", () => {
  const from = Date.UTC(2026, 10, 5, 0, 0, 0);
  const until = Date.UTC(2026, 10, 5, 12, 0, 0);

  test("outlook asks for a bounded inbox window on one named account without workbench offload", () => {
    const request = readRequest("outlook", "acct-1", from, until, 1);
    expect(request.sync_response_to_workbench).toBe(false);
    expect(request.tools).toHaveLength(1);
    const tool = request.tools[0]!;
    expect(tool).toMatchObject({ tool_slug: "OUTLOOK_QUERY_EMAILS", account: "acct-1" });
    expect(tool.arguments).toMatchObject({ user_id: "me", folder: "inbox", top: 10, orderby: "receivedDateTime asc" });
    expect(tool.arguments.filter).toBe("receivedDateTime ge 2026-11-05T00:00:00.000Z and receivedDateTime lt 2026-11-05T12:00:00.000Z");
  });

  test("gmail uses epoch seconds, excludes spam and payloads; github pages by number", () => {
    const gmail = readRequest("gmail", "g1", from, until, 1).tools[0]!;
    expect(gmail.arguments).toMatchObject({ query: `in:inbox after:${from / 1000} before:${until / 1000}`, max_results: 10, verbose: false, include_payload: false, include_spam_trash: false });
    const github = readRequest("github", "h1", from, until, 3).tools[0]!;
    expect(github.tool_slug).toBe("GITHUB_LIST_NOTIFICATIONS");
    expect(github.arguments).toMatchObject({ all: true, since: "2026-11-05T00:00:00.000Z", before: "2026-11-05T12:00:00.000Z", per_page: 10, page: 3 });
  });

  test("a saved continuation is decoded into the provider page token; a tampered one is refused", () => {
    expect(readRequest("gmail", "g1", from, until, 2, encode("PAGE_2")).tools[0]!.arguments.page_token).toBe("PAGE_2");
    expect(() => readRequest("gmail", "g1", from, until, 2, "PAGE_2")).toThrow("Invalid saved continuation");
  });

  test("unsupported services are refused, including prototype names", () => {
    expect(() => readRequest("asana", "a", from, until, 1)).toThrow("No supported check yet");
    expect(() => readRequest("constructor", "a", from, until, 1)).toThrow("No supported check yet");
  });
});

describe("readPage", () => {
  test("outlook rows become bounded source items with identity, version, text and link", () => {
    const out = readPage(page("OUTLOOK_QUERY_EMAILS", {
      value: [{ id: "m1", subject: "Invoice", bodyPreview: "b".repeat(300), receivedDateTime: "2026-11-05T01:00:00Z", sender: "boss@example.com", webLink: "https://outlook.office.com/m1" }],
    }), "outlook");
    expect(out.next).toBeUndefined();
    expect(out.items).toEqual([{ id: "m1", version: "2026-11-05T01:00:00Z", text: `From: boss@example.com\nInvoice\n${"b".repeat(120)}`, reference: "https://outlook.office.com/m1" }]);
  });

  test("a reply Composio offloaded to a remote file is refused with its own reason, never read from the sample", () => {
    // Shape recorded from a live GMAIL_FETCH_EMAILS reply: data replaced by data_preview + structure_info + instruction.
    const offloaded = reply({ results: [{ tool_slug: "GMAIL_FETCH_EMAILS", index: 0, instruction: "Use structure_info (schema) and data_preview (samples) to understand the result, then process the remote response file.",
      structure_info: { data_structure: { type: "object" } }, response: { successful: true, data_preview: { messages: [{ messageId: "g1", subject: "S" }], nextPageToken: "" } } }] });
    expect(() => readPage(offloaded, "gmail")).toThrow("too large to read inline");
    const remote = reply({ results: [{ tool_slug: "GMAIL_FETCH_EMAILS", remote_file_info: { path: "x" }, response: { successful: true } }] });
    expect(() => readPage(remote, "gmail")).toThrow("too large to read inline");
    expect(failureReason(new Error("Provider reply was too large to read inline"))).toEqual({ reason: "The provider reply was too large to read inline; coverage was not advanced", status: "incomplete" });
  });

  test("gmail preview text comes from preview.body", () => {
    const out = readPage(page("GMAIL_FETCH_EMAILS", { messages: [{ messageId: "g2", subject: "Alert", sender: "a@example.com", preview: { subject: "Alert", body: "Short preview" }, messageTimestamp: "2026-11-11T18:40:38Z" }], nextPageToken: "" }), "gmail");
    expect(out.items[0]!.text).toBe("From: a@example.com\nAlert\nShort preview");
    expect(out.next).toBeUndefined();
  });

  test("gmail items reference gmail:<id> and use messageId, and a continuation token is surfaced", () => {
    const out = readPage(page("GMAIL_FETCH_EMAILS", { messages: [{ messageId: "g1", subject: "Hi", snippet: "snip", internalDate: "1730000000" }], nextPageToken: "NEXT" }), "gmail");
    expect(out.items[0]).toMatchObject({ id: "g1", version: "1730000000", reference: "gmail:g1" });
    expect(out.next).toBe("NEXT");
  });

  test("github has no token: a full page of ten asks for another page, a short page ends", () => {
    const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `n${i}`, subject: { title: `T${i}` }, updated_at: "u", url: "https://github.com/x" }));
    expect(readPage(page("GITHUB_LIST_NOTIFICATIONS", rows(10)), "github").next).toBe("next");
    const short = readPage(page("GITHUB_LIST_NOTIFICATIONS", { notifications: rows(3) }), "github");
    expect(short.next).toBeUndefined();
    expect(short.items.map((i) => i.text.split("\n")[0])).toEqual(["T0", "T1", "T2"]);
  });

  test("a result for a different operation, a failed row or a missing result is refused", () => {
    expect(() => readPage(page("GMAIL_FETCH_EMAILS", { messages: [] }), "outlook")).toThrow("did not match the requested operation");
    expect(() => readPage(reply({ results: [{ tool_slug: "OUTLOOK_QUERY_EMAILS", response: { successful: true, error: "x", data: { value: [] } } }] }), "outlook")).toThrow("did not match");
    expect(() => readPage(reply({ results: [] }), "outlook")).toThrow("did not match");
    expect(() => readPage(page("OUTLOOK_QUERY_EMAILS", { value: [] }), "asana")).toThrow("did not match");
  });

  test("unsupported page shapes fail instead of passing partial coverage", () => {
    expect(() => readPage(page("OUTLOOK_QUERY_EMAILS", { value: Array.from({ length: 11 }, (_, i) => ({ id: `m${i}` })) }), "outlook")).toThrow("unsupported or oversized");
    expect(() => readPage(page("OUTLOOK_QUERY_EMAILS", { value: [{ subject: "no id" }] }), "outlook")).toThrow("Source item identity is unavailable");
    expect(() => readPage(page("OUTLOOK_QUERY_EMAILS", { value: [{ id: "m1" }], continuationUnsupported: true }), "outlook")).toThrow("Unsupported continuation");
    expect(() => readPage(page("OUTLOOK_QUERY_EMAILS", { value: [{ id: "m1" }], continuation: 42 }), "outlook")).toThrow("Invalid continuation token");
  });
});
