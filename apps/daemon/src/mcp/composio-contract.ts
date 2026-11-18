import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ToolClass } from "../policy.js";
import { getDefaultRedactor } from '../redact.js';

// Operator-reviewed permission contracts, not server hints. New names retain opaque permissions.
// Source inventory and references: docs/notes/composio-e2e-test-map.md.
export const COMPOSIO_TOOL_CLASSES: Readonly<Record<string, ToolClass>> = Object.freeze({
  COMPOSIO_SEARCH_TOOLS: "search",
  COMPOSIO_GET_TOOL_SCHEMAS: "read",
  COMPOSIO_SEARCH_SKILLS: "search",
  COMPOSIO_USE_SKILL: "read",
  COMPOSIO_WAIT_FOR_CONNECTIONS: "act-external", // Requires a user-confirmed auth attempt; not passive status.
  COMPOSIO_MANAGE_CONNECTIONS: "act-external",
  COMPOSIO_MULTI_EXECUTE_TOOL: "act-external",
  COMPOSIO_PROXY_EXECUTE: "act-external",
  COMPOSIO_REMOTE_WORKBENCH: "act-external",
  COMPOSIO_REMOTE_BASH_TOOL: "act-external",
  COMPOSIO_MANAGE_SKILL: "act-external",
  COMPOSIO_SUBMIT_FEEDBACK: "act-external",
});
// Provider operations reviewed as read-only, by exact slug. Only the managed connection consults this, and only against the
// approved request, never the reply. This list controls permission only, never invocation completion.
export const COMPOSIO_READ_SLUGS: ReadonlySet<string> = new Set(["OUTLOOK_GET_PROFILE", "OUTLOOK_QUERY_EMAILS", "GMAIL_FETCH_EMAILS", "GITHUB_LIST_NOTIFICATIONS"]);
// The request shape the read-only acceptance check (scripts/verify-composio-readonly-e2e.mjs) treats as in scope; any other key could carry a side effect.
const READ_BATCH_KEYS: ReadonlySet<string> = new Set(["tools", "sync_response_to_workbench", "session_id", "current_step", "current_step_metric", "thought"]);
const READ_TOOL_KEYS: ReadonlySet<string> = new Set(["tool_slug", "arguments", "account"]);
// Keeps one batch within a reviewable size; matches docs/notes/mcp.md.
const COMPOSIO_MAX_BATCH = 10;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const failed = (value: unknown) => value !== undefined && value !== null && value !== "";

/** Interpret the reviewed provider envelope before bounding it; a delivered reply can still be a failure. */
/** Every requested batch operation must return a matching slug and an explicit nested success. */
function batchAnswered(envelope: Record<string, unknown>, args: unknown): boolean {
  const tools = object(args) ? args.tools : undefined;
  if (!Array.isArray(tools)) return true; // No request to compare against: keep the envelope-only verdict.
  const slug = (item: unknown) => (object(item) && typeof item.tool_slug === "string" ? item.tool_slug : "");
  if (!object(envelope.data) || !Array.isArray(envelope.data.results) || envelope.data.results.length !== tools.length) return false;
  const requested = tools.map(slug).sort(), returned = envelope.data.results.map(slug).sort();
  return requested.every((value, index) => value !== "" && value === returned[index]) && envelope.data.results.every(item =>
    object(item) && object(item.response) && item.response.successful === true && !failed(item.response.error));
}

export function composioResult(name: string, result: CallToolResult, args?: unknown): CallToolResult & { providerDiagnostic?: { code: string; logId?: string } } {
  let envelope: Record<string, unknown> | undefined;
  if (object(result.structuredContent) && Object.hasOwn(result.structuredContent, "successful")) envelope = result.structuredContent;
  else {
    const values: Record<string, unknown>[] = [];
    for (const block of result.content) {
      if (block.type !== "text") continue;
      try { const value: unknown = JSON.parse(block.text); if (object(value) && Object.hasOwn(value, "successful")) values.push(value); } catch { /* Non-JSON text is retained as evidence. */ }
    }
    if (values.length === 1) envelope = values[0];
  }
  let code: string | undefined;
  if (!envelope || typeof envelope.successful !== "boolean") code = "invalid_envelope";
  else if (!envelope.successful || failed(envelope.error)) code = "provider_error";
  else if (name === "COMPOSIO_MULTI_EXECUTE_TOOL" && object(envelope.data) && Array.isArray(envelope.data.results) && envelope.data.results.some(item =>
    object(item) && (failed(item.error) || object(item.response) && (item.response.successful === false || failed(item.response.error))))) code = "partial_failure";
  else if (name === "COMPOSIO_MULTI_EXECUTE_TOOL" && !batchAnswered(envelope, args)) code = "unmatched_results"; // The returned batch does not establish completion of the requested operations.
  else if (name === "COMPOSIO_PROXY_EXECUTE" && object(envelope.data) && typeof envelope.data.status === "number" && envelope.data.status >= 400) code = "provider_http_error";
  return { ...result, ...(code ? { isError: true } : {}), providerDiagnostic: { code: code ?? "provider_returned", ...(typeof envelope?.log_id === "string" ? { logId: envelope.log_id.slice(0, 300) } : {}) } };
}

// Reviewed for daemon proactive checks only. Elsewhere these stay ordinary act-external operations (owner decision for 0.7.0).
const PROACTIVE_ONLY_READS: ReadonlySet<string> = new Set(["GMAIL_FETCH_EMAILS", "GITHUB_LIST_NOTIFICATIONS", "connection-list"]);

/** The reviewed read a request makes in this turn: proactive-only reads count only inside a daemon proactive check. */
export function composioAllowedRead(name: string, args: unknown, proactive: boolean): string[] | undefined {
  const slugs = composioReadRequest(name, args);
  return slugs && (proactive || !slugs.some(slug => PROACTIVE_ONLY_READS.has(slug))) ? slugs : undefined;
}

/** Trusted request contract only; remote hints and results cannot select effect classes. */
export function composioReadRequest(name:string,args:unknown):string[]|undefined {
  if (name === "COMPOSIO_MANAGE_CONNECTIONS" && object(args) && Object.hasOwn(args,'toolkits') && Object.keys(args).every(key => ['toolkits','session_id'].includes(key)) &&
    (args.session_id === undefined || typeof args.session_id === 'string') && Array.isArray(args.toolkits) && args.toolkits.length > 0 && args.toolkits.length <= 12 &&
    args.toolkits.every(item => object(item) && Object.hasOwn(item,'name') && Object.hasOwn(item,'action') && Object.keys(item).every(key => ['name','action'].includes(key)) && typeof item.name === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(item.name) && item.action === 'list')) return ['connection-list'];
  if (name !== "COMPOSIO_MULTI_EXECUTE_TOOL" || !object(args)) return undefined;
  if (!Object.keys(args).every(key => READ_BATCH_KEYS.has(key)) || (args.sync_response_to_workbench !== undefined && args.sync_response_to_workbench !== false)) return undefined;
  const tools = args.tools;
  if (!Array.isArray(tools) || tools.length === 0 || tools.length > COMPOSIO_MAX_BATCH) return undefined;
  const slugs: string[] = [];
  for (const tool of tools) {
    if (!object(tool) || !Object.keys(tool).every(key => READ_TOOL_KEYS.has(key)) || typeof tool.tool_slug !== "string" || !COMPOSIO_READ_SLUGS.has(tool.tool_slug)) return undefined;
    slugs.push(tool.tool_slug);
  }
  return slugs;
}

/** Project proactive pages before the model-output cap; preserve identities and navigation, not full bodies. */
export function proactiveMetadata(name: string, result: CallToolResult, args?: unknown): CallToolResult {
  if (!['COMPOSIO_SEARCH_TOOLS', 'COMPOSIO_MANAGE_CONNECTIONS', 'COMPOSIO_MULTI_EXECUTE_TOOL'].includes(name)) return result;
  let envelope: any = result.structuredContent;
  if (!object(envelope)) {
    const blocks = result.content.filter(block => block.type === 'text');
    if (blocks.length !== 1) return result;
    try { envelope = JSON.parse((blocks[0] as { text: string }).text); } catch { return result; }
  }
  if (result.isError || !object(envelope) || envelope.successful !== true || failed(envelope.error) || !object(envelope.data)) return result;
  const data = envelope.data;
  if (name === 'COMPOSIO_MULTI_EXECUTE_TOOL') {
    if (!Array.isArray(data.results) || !batchAnswered(envelope, args) || data.results.some((item: any) => failed(item?.error))) return result;
    const requested = object(args) && Array.isArray(args.tools) ? args.tools : [];
    const rows = data.results.map((item: any, index: number) => {
      if (!['OUTLOOK_QUERY_EMAILS','GMAIL_FETCH_EMAILS'].includes(item?.tool_slug) || !object(item?.response?.data)) return item;
      const {next_page_token, nextPageToken, '@odata.nextLink': nextLink, ...body} = item.response.data;
      const messages = item.tool_slug === 'OUTLOOK_QUERY_EMAILS' ? body.value ?? body.messages : body.messages ?? body.emails;
      // Never drop a malformed record or shorten its identity to make a page appear complete.
      if (!Array.isArray(messages) || messages.length > 10 || messages.some(message => {
        const id = message?.id ?? message?.messageId ?? message?.message_id;
        return !object(message) || typeof id !== 'string' || !id || id.length > 300;
      })) return item;
      const text = (limit: number, ...values: unknown[]) => {
        const value = values.find(value => typeof value === 'string' && value);
        return getDefaultRedactor().redactString(typeof value === 'string' ? value : '').slice(0, limit);
      };
      const projected = messages.map(message => ({
        id: message.id ?? message.messageId ?? message.message_id,
        updated_at: text(100, String(message.updated_at ?? message.receivedDateTime ?? message.internalDate ?? message.messageTimestamp ?? message.id ?? message.messageId ?? message.message_id)),
        subject: text(180, message.subject?.title, message.subject, message.Subject),
        snippet: text(120, message.bodyPreview, message.snippet, message.preview?.body, message.preview, message.messageText),
        sender: text(160, message.sender, message.from?.emailAddress?.address, message.from),
        ...(item.tool_slug === 'OUTLOOK_QUERY_EMAILS' ? { webLink: text(300, message.webLink, message.url) } : {}),
      }));
      const raw = next_page_token ?? nextPageToken ?? nextLink ?? body.continuation;
      let navigation: Record<string, unknown> = {};
      if (raw !== undefined && raw !== null && raw !== '') {
        const request = requested[index];
        const valid = object(request) && request.tool_slug === item.tool_slug && validContinuation(raw, item.tool_slug, request.arguments);
        // Validate before encoding: credential redaction remains strict, including inside navigation values.
        navigation = valid ? { continuation: `nav1:${Buffer.from(raw as string).toString('base64url')}` } : { continuationUnsupported: true };
      }
      return {tool_slug:item.tool_slug,response:{successful:item.response.successful,error:item.response.error,data:{messages:projected,...(body.continuationUnsupported ? {continuationUnsupported:true} : {}),...navigation}}};
    });
    const compact = {successful:true,data:{results:rows},error:null};
    // Structured evidence is sufficient; duplicating it as text spends the same budget twice.
    return {...result,structuredContent:compact,content:[]};
  }
  const accounts = (values: unknown) => Array.isArray(values) ? values.map(item => object(item) ? { id: item.id, alias: typeof item.alias === 'string' ? item.alias : object(item.user_info) ? item.user_info.mail ?? item.user_info.email ?? item.user_info.userPrincipalName : undefined, status: item.status } : null) : values;
  const projected = name === 'COMPOSIO_SEARCH_TOOLS'
    ? { toolkit_connection_statuses: Array.isArray(data.toolkit_connection_statuses) ? data.toolkit_connection_statuses.map((item: any) => ({ toolkit: item?.toolkit, has_active_connection: item?.has_active_connection })) : null }
    : { results: object(data.results) ? Object.fromEntries(Object.entries(data.results).map(([key, value]) => [key, object(value) ? { toolkit: value.toolkit, status: value.status, accounts: accounts(value.accounts) } : null])) : null };
  const compact = { successful: true, data: projected, error: null };
  return { ...result, structuredContent: compact, content: [{ type: 'text', text: JSON.stringify(compact) }] };
}

function validContinuation(raw: unknown, slug: string, args: unknown): raw is string {
  if (typeof raw !== 'string' || !raw || raw.length > 4096 || !object(args)) return false;
  const redactor = getDefaultRedactor();
  if (!/^https?:/i.test(raw)) return /^[A-Za-z0-9][A-Za-z0-9._~+/=-]*$/.test(raw) && redactor.redactString(raw) === raw;
  if (slug !== 'OUTLOOK_QUERY_EMAILS' || args.folder !== 'inbox' || args.user_id !== 'me') return false;
  try {
    const url = new URL(raw);
    if (url.origin !== 'https://graph.microsoft.com' || url.username || url.password || url.hash ||
      !/^\/v1\.0\/(?:me|users\/me)\/mailFolders\/inbox\/messages\/?$/i.test(url.pathname)) return false;
    const names = [...url.searchParams.keys()];
    if (new Set(names).size !== names.length || names.some(name => !['$skiptoken','$skip','$top','$filter','$select','$orderby'].includes(name))) return false;
    if (url.searchParams.get('$filter') !== args.filter || url.searchParams.get('$select') !== (Array.isArray(args.select) ? args.select.join(',') : '')) return false;
    if (url.searchParams.has('$top') && url.searchParams.get('$top') !== String(args.top)) return false;
    if (url.searchParams.has('$orderby') && url.searchParams.get('$orderby') !== args.orderby) return false;
    return [...url.searchParams.values()].every(value => redactor.redactString(value) === value);
  } catch { return false; }
}

export function decodeProactiveContinuation(encoded: string, slug: string, args: unknown): string {
  if (!/^nav1:[A-Za-z0-9_-]+$/.test(encoded) || encoded.length > 6000) throw Error('Invalid saved continuation');
  const raw = Buffer.from(encoded.slice(5), 'base64url').toString('utf8');
  if (!validContinuation(raw, slug, args) || `nav1:${Buffer.from(raw).toString('base64url')}` !== encoded) throw Error('Invalid saved continuation');
  return raw;
}
