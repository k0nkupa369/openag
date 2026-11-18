import { decodeProactiveContinuation } from './mcp/composio-contract.js';
import { z } from 'zod';

export const serviceSlug = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/);
export interface SourceItem { id: string; version: string; text: string; reference: string }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

export function failureReason(error: unknown): { reason: string; status: string; restart?: boolean; transport?: boolean } {
  const message = error instanceof Error ? error.message : String(error);
  if (/invalid.*(?:page.?token|skip.?token|cursor|continuation)|(?:page.?token|skip.?token|cursor|continuation|page position).*(?:invalid|expired)|\b410\b/i.test(message)) return {reason:'Saved page position expired; this window will restart next time',status:'incomplete',restart:true};
  if (/Composio transport|MCP session negotiation|MCP catalogue|MCP tool timed out|MCP tool failed:.*(?:5[0-9]{2}|fetch|network)|mcp\.composio-connect.*not enabled|ECONN|ENOTFOUND/i.test(message)) return {reason:'Composio transport is unavailable; checking will retry on the next schedule',status:'unavailable',transport:true};
  if (/429|rate.?limit/i.test(message)) return { reason: 'Provider rate limit reached; checking will resume on the next schedule', status: 'rate_limited' };
  if (/401|unauthori[sz]ed|expired|needs sign-in/i.test(message)) return { reason: 'Connection needs sign-in', status: 'needs_sign_in' };
  if (/403|forbidden|permission|refused|denied/i.test(message)) return { reason: 'Read permission is unavailable; review access', status: 'permission_missing' };
  if (/too large to read inline/i.test(message)) return { reason: 'The provider reply was too large to read inline; coverage was not advanced', status: 'incomplete' };
  if (/assessment|evidence limit|coverage|oversized|continuation|incomplete|inventory/i.test(message)) return { reason: 'The check was incomplete; its coverage was not advanced', status: 'incomplete' };
  return { reason: 'Provider read could not complete; access or service availability needs review', status: 'unavailable' };
}

/** Unwrap only a complete, explicitly successful provider reply. */
export function composioData(value: unknown): any {
  if (!object(value) || value.truncated) throw Error('Provider returned incomplete or oversized evidence');
  let envelope = value.structuredContent;
  if (!object(envelope)) {
    try { envelope = typeof value.content === 'string' ? JSON.parse(value.content) : undefined; }
    catch { throw Error('Provider reply could not be read'); }
  }
  if (!object(envelope)) throw Error('Provider did not confirm the read');
  if(value.isError || envelope.successful!==true || envelope.error){
    const errors = [envelope.error, ...(Array.isArray((envelope.data as any)?.results) ? (envelope.data as any).results.map((row:any)=>row.error??row.response?.error) : [])];
    throw Error(failureReason(errors.map(value=>typeof value==='string'?value:'').join(' ')).reason);
  }
  return envelope.data;
}

export function searchServices(value: unknown) {
  const data = composioData(value);
  if (!Array.isArray(data?.toolkit_connection_statuses)) throw Error('Service search did not return connection metadata');
  return data.toolkit_connection_statuses.slice(0, 24).flatMap((row: any) => {
    const slug = serviceSlug.safeParse(row?.toolkit);
    return slug.success ? [{ id: slug.data, connected: row.has_active_connection === true, check: checkLabel(slug.data) }] : [];
  });
}

export function serviceAccounts(value: unknown, service: string): Array<{ id: string; alias: string; status: string }> {
  const result = composioData(value)?.results;
  if (!object(result) || !Object.hasOwn(result, service)) throw Error('Account inventory is incomplete');
  const row = result[service];
  if (!object(row) || row.toolkit !== service || !Array.isArray(row.accounts) || row.accounts.length > 100) throw Error('Account inventory is incomplete');
  const accounts = row.accounts.map((account: any) => {
    if (typeof account?.id !== 'string' || !account.id || account.id.length > 200 || typeof account.status !== 'string') throw Error('Account identity is unavailable');
    return { id: account.id, alias: typeof account.alias === 'string' ? account.alias.slice(0, 100) : account.id, status: account.status.trim().toUpperCase() };
  });
  if (new Set(accounts.map(account => account.id)).size !== accounts.length) throw Error('Account inventory contains duplicate identities');
  return accounts;
}

const plans: Record<string, { slug: string; label: string }> = {
  outlook: { slug: 'OUTLOOK_QUERY_EMAILS', label: 'Recent Inbox email' },
  gmail: { slug: 'GMAIL_FETCH_EMAILS', label: 'Recent Inbox email' },
  github: { slug: 'GITHUB_LIST_NOTIFICATIONS', label: 'Recent notifications' },
};
export const checkLabel = (service: string) => Object.hasOwn(plans, service) ? plans[service]!.label : null;

export function readRequest(service: string, account: string, from: number, until: number, page: number, token?: string) {
  if (!Object.hasOwn(plans, service)) throw Error('No supported check yet');
  let args: Record<string, unknown>;
  if (service === 'outlook') args = { user_id: 'me', folder: 'inbox', top: 10, filter: `receivedDateTime ge ${new Date(from).toISOString()} and receivedDateTime lt ${new Date(until).toISOString()}`, select: ['id', 'subject', 'bodyPreview', 'receivedDateTime', 'webLink'], orderby: 'receivedDateTime asc',  };
  else if (service === 'gmail') args = { user_id: 'me', query: `in:inbox after:${Math.floor(from / 1000)} before:${Math.ceil(until / 1000)}`, max_results: 10, verbose: false, include_payload: false, include_spam_trash: false,  };
  else args = { all: true, since: new Date(from).toISOString(), before: new Date(until).toISOString(), per_page: 10, page };
  if(token && service!=='github')args.page_token=decodeProactiveContinuation(token,plans[service]!.slug,args);
  return { tools: [{ tool_slug: plans[service]!.slug, arguments: args, account }], sync_response_to_workbench: false };
}

export function readPage(value: unknown, service: string): { items: SourceItem[]; next?: string } {
  const data = composioData(value);
  const results = data?.results;
  const plan = Object.hasOwn(plans, service) ? plans[service] : undefined;
  if (!plan || !Array.isArray(results) || results.length !== 1 || results[0]?.tool_slug !== plan.slug || results[0]?.response?.successful !== true || results[0].response.error) throw Error('Read result did not match the requested operation');
  const response = results[0].response;
  // Composio replaces a large result with a sample (data_preview) and a remote file; a sample may omit messages.
  if (!Object.hasOwn(response, 'data') && (Object.hasOwn(response, 'data_preview') || Object.hasOwn(response, 'remote_file_info') || Object.hasOwn(results[0], 'remote_file_info'))) throw Error('Provider reply was too large to read inline');
  const body = response.data;
  const rows = service === 'outlook' ? body?.value ?? body?.messages : service === 'gmail' ? body?.messages ?? body?.emails : Array.isArray(body) ? body : body?.notifications;
  if (!Array.isArray(rows) || rows.length > 10) throw Error('Provider returned unsupported or oversized coverage');
  const items = rows.map((item: any): SourceItem => {
    const id = item?.id ?? item?.messageId ?? item?.message_id;
    if (typeof id !== 'string' || !id || id.length > 300) throw Error('Source item identity is unavailable');
    const reference = service === 'gmail' ? `gmail:${id}` : item.webLink ?? item.url ?? '';
    const text = String(item.subject?.title ?? item.subject ?? item.Subject ?? item.snippet ?? item.bodyPreview ?? '').slice(0, 180);
    const detail = String(item.bodyPreview ?? item.snippet ?? item.preview?.body ?? '').slice(0, 120);
    const sender = typeof item.sender === 'string' ? item.sender.slice(0, 160) : '';
    return { id, version: String(item.updated_at ?? item.receivedDateTime ?? item.internalDate ?? id).slice(0, 100), text: `${sender ? `From: ${sender}\n` : ''}${text}\n${detail}`.trim(), reference: typeof reference === 'string' ? reference.slice(0, 300) : '' };
  });
  if(body?.continuationUnsupported)throw Error('Unsupported continuation; coverage is incomplete');
  const next = body?.continuation ?? body?.next_page_token ?? body?.nextPageToken ?? body?.['@odata.nextLink'];
  if (next !== undefined && next !== null && (typeof next !== 'string' || next.length > 6000)) throw Error('Invalid continuation token');
  // shortcut: GitHub has no response-header projection; a full page requires another bounded page.
  return { items, next: service === 'github' ? rows.length === 10 ? 'next' : undefined : next || undefined };
}
