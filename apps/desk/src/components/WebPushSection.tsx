import { useEffect, useRef, useState } from "react";
import { messageOf, type Api } from "../api";
import type { WebPushInfo } from "../types";
import { disableWebPush, enableWebPush, resyncWebPush, webPushSupport, type WebPushState, type WebPushSupport } from "../web-push";
import { Alert, AlertDescription } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Field, FieldGroup, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import { Switch } from "./ui/switch";

const UNAVAILABLE: Record<Exclude<WebPushSupport, { ok: true }>["reason"], string> = {
  insecure: "Needs the desk opened over HTTPS (for example Tailscale Serve) or on this computer.",
  unsupported: "This browser does not support notifications from the desk.",
  "ios-not-installed": "On iPhone and iPad, add the desk to the Home Screen first, then open it from there.",
};

/** Web Push to this installed desk. Owner and Full devices also see the installation switch and the contact. */
export function WebPushSection({ api, support = webPushSupport() }: { api: Api; support?: WebPushSupport }) {
  const pending = useRef(false);
  const [info, setInfo] = useState<WebPushInfo | null>(null);
  const [state, setState] = useState<WebPushState>(support.ok ? "off" : "unavailable");
  const [enabled, setEnabled] = useState(false);
  const [subject, setSubject] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const next = await api.getWebPush();
    setInfo(next);
    setEnabled(next.enabled);
    if (next.all !== undefined) {
      const { settings } = await api.getSettings();
      setSubject(settings.push?.webPush?.subject ?? "");
    }
    return next;
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const current = await load();
        if (!support.ok || cancelled) return;
        if (Notification.permission === "denied") return setState("denied");
        if (await resyncWebPush(api, current.publicKey)) { if (!cancelled) setState("on"); await load(); }
      } catch (err) {
        if (!cancelled) setError(messageOf(err));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  async function run(action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    setNote(null);
    try { await action(); } catch (err) { setError(messageOf(err)); } finally { pending.current = false; setBusy(false); }
  }

  const saveInstallation = () => run(async () => {
    const { settings } = await api.getSettings();
    const trimmed = subject.trim();
    await api.putSetting("push", { ...settings.push, webPush: { enabled, subject: trimmed === "" ? null : trimmed } });
    await load();
    setNote("Saved.");
  });
  const turnOn = () => run(async () => { setState(await enableWebPush(api)); await load(); });
  const turnOff = () => run(async () => { setState(await disableWebPush(api)); await load(); });
  const test = () => run(async () => {
    const r = await api.sendWebPushTest();
    setNote(r.ok ? "Test sent to this device." : `Test not sent: ${r.reason ?? "unknown reason"}.`);
  });

  const owner = info?.all !== undefined;
  const badge = state === "on" ? <Badge variant="success">On for this device</Badge>
    : state === "denied" ? <Badge variant="destructive">Blocked in browser settings</Badge>
    : state === "unavailable" ? <Badge variant="attention">Not available here</Badge>
    : <Badge variant="attention">Off for this device</Badge>;

  return (
    <section aria-labelledby="web-push-title" className="grid gap-3">
      <h3 id="web-push-title">Notifications on this device</h3>
      <fieldset disabled={busy} className="min-w-0 border-0 p-0" data-slot="field-set"><FieldGroup>
        <div className="flex flex-wrap items-center gap-2">{badge}</div>
        {!support.ok && <p className="text-muted-foreground">{UNAVAILABLE[support.reason]}</p>}
        {support.ok && info && !info.enabled && <p className="text-muted-foreground">Web Push is off for this OpenAg.{owner ? "" : " Ask the owner to turn it on."}</p>}
        {support.ok && info?.enabled && (
          <div className="flex flex-wrap gap-2">
            {state === "on"
              ? <><Button type="button" variant="outline" onClick={turnOff}>Turn off for this device</Button><Button type="button" variant="outline" onClick={test}>Send test</Button></>
              : state !== "denied" && <Button type="button" onClick={turnOn}>Turn on for this device</Button>}
          </div>
        )}
        {owner && (
          <>
            <Field orientation="horizontal"><FieldLabel htmlFor="web-push-enabled">Web Push for this OpenAg</FieldLabel><Switch id="web-push-enabled" checked={enabled} onCheckedChange={setEnabled} /></Field>
            <Field><FieldLabel htmlFor="web-push-subject">Contact for push services</FieldLabel>
              <Input id="web-push-subject" placeholder="mailto:you@example.com" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
            </Field>
            <div><Button type="button" variant="outline" onClick={saveInstallation}>Save Web Push</Button></div>
            {info && info.all!.length > 0 && (
              <ul aria-label="Subscribed devices" className="m-0 grid gap-1 p-0 text-sm text-muted-foreground">
                {info.all!.map((s) => <li key={s.id} className="list-none [overflow-wrap:anywhere]">{s.deviceName ?? "Unknown device"} · {s.host}{s.lastError ? ` · last error ${s.lastError}` : ""}</li>)}
              </ul>
            )}
          </>
        )}
        {note && <p className="text-muted-foreground" role="status">{note}</p>}
        {error && <Alert variant="destructive" className="min-h-0 text-destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      </FieldGroup></fieldset>
    </section>
  );
}
