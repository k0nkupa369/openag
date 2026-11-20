import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from "./ui/input-otp";
import { Textarea } from "./ui/textarea";
import { Field, FieldGroup, FieldLabel } from "./ui/field";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { Logo } from "./Logo";
import { Alert, AlertDescription } from "./ui/alert";
import { useEffect, useState, type FormEvent } from "react";
import { ApiError, messageOf, pair } from "../api";
import {
  cleanDeviceName,
  defaultDeviceName,
  formatCode,
  normalizeCode,
  setRtcIdentity,
  setToken,
  readJoinInvite,
  clearRtcIdentity,
} from "../auth";
import {
  checkInvite,
  normalizeCode as normalizeRtcCode,
  type RtcInvite as WireInvite,
} from "../rtc/protocol";
import { createRtcTransport, type RtcTransport } from "../rtc/transport";

type Mode = "pair" | "rtc";

/** Parses and validates a pasted invite. Throws a plain Error naming the bad field; the text is never echoed. */
export function parseInvite(text: string): WireInvite {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("paste the invite JSON");
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("the invite must be a JSON object");
  const v = raw as Record<string, unknown>;
  const invite = { server: v.server, topic: v.topic, stun: v.stun, ...(v.turn !== undefined ? { turn: v.turn } : {}), code: v.code, secret: v.secret } as WireInvite;
  checkInvite(invite);
  if (typeof invite.code !== "string" || normalizeRtcCode(invite.code).length !== 8) throw new Error("invite: bad code");
  if (invite.secret === undefined) throw new Error("invite: missing secret");
  return invite;
}

export function Login({ notice, onSignedIn, invite, onCancel }: {
  notice: string | null;
  onSignedIn: (token: string) => void;
  invite?: { code: string; full: boolean } | null;
  onCancel?: () => void;
}) {
  const [joinInvite] = useState(() => invite ?? readJoinInvite());
  const joinCode = joinInvite?.code;
  useEffect(() => {
    if (joinInvite) window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }, [joinInvite]);
  const [mode, setMode] = useState<Mode>("pair");
  const [error, setError] = useState<string | null>(notice);
  const [busy, setBusy] = useState(false);
  const [deviceName, setDeviceName] = useState(() => defaultDeviceName());
  const [value, setValue] = useState(() => (joinCode ? normalizeCode(joinCode) : ""));
  const [inviteText, setInviteText] = useState("");

  function switchMode(next: Mode) {
    setMode(next);
    setValue("");
    setInviteText("");
    setError(null);
  }

  async function finish(token: string, rtc = false) {
    if (!rtc) clearRtcIdentity();
    setToken(token);
    setValue("");
    onSignedIn(token);
  }

  async function submitPair(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = normalizeCode(value);
    if (!code || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { token } = await pair(formatCode(code), cleanDeviceName(deviceName) || "This browser");
      await finish(token);
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) setError("Invalid or expired code");
      else if (err instanceof ApiError && err.status === 429)
        setError(
          err.retryAfter
            ? `Too many attempts. Try again in ${err.retryAfter} seconds.`
            : "Too many attempts. Try again later.",
        );
      else if (err instanceof ApiError && err.status === 0) setError("Cannot reach the daemon");
      else setError(`Pairing failed: ${messageOf(err)}`);
    } finally {
      setBusy(false);
    }
  }

  // Pairing codes are single use: a failed attempt is reported and never retried automatically.
  async function submitRtc(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    let invite: WireInvite;
    try {
      invite = parseInvite(inviteText);
    } catch (err) {
      setError(`Invite is not valid: ${messageOf(err)}`);
      setBusy(false);
      return;
    }
    let transport: RtcTransport | null = null;
    let token: string | null = null;
    try {
      transport = await createRtcTransport({ invite, auth: { kind: "pair", code: invite.code! } });
      const res = await transport.request("POST", "/pair", {
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: formatCode(invite.code!), name: cleanDeviceName(deviceName) || "This browser" }),
      });
      if (res.status !== 200) {
        const message =
          res.status === 400
            ? "Invalid or expired code"
            : res.status === 429
              ? "Too many attempts. Try again later."
              : `Pairing failed (${res.status})`;
        throw new ApiError(message, res.status);
      }
      let data: unknown;
      try {
        data = JSON.parse(res.body);
      } catch {
        throw new Error("Unexpected pairing response");
      }
      const d = data as { deviceId?: unknown; token?: unknown } | null;
      if (!d || typeof d.deviceId !== "string" || typeof d.token !== "string") throw new Error("Unexpected pairing response");
      setRtcIdentity({
        server: invite.server.replace(/\/+$/, ""),
        topic: invite.topic,
        stun: [...invite.stun],
        deviceId: d.deviceId,
        ...(invite.turn ? { turn: invite.turn } : {}),
      });
      token = d.token;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Could not join over WebRTC: ${messageOf(err)}`);
    } finally {
      transport?.close();
      setInviteText("");
      setBusy(false);
    }
    if (token !== null) await finish(token, true);
  }

  const tabId = (m: Mode) => `login-tab-${m}`;
  const panelId = (m: Mode) => `login-panel-${m}`;
  const nameField = (
    <>
      <Field><FieldLabel htmlFor="device-name">Device name</FieldLabel><Input
        id="device-name"
        type="text"
        maxLength={64}
        autoComplete="off"
        value={deviceName}
        onChange={(e) => setDeviceName(e.target.value)}
      /></Field>
    </>
  );

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-md flex-col gap-6">
        <div className="flex items-center gap-2 font-semibold tracking-tight"><Logo size={24} /> OpenAg</div>
        <Card>
          <CardHeader>
            <CardTitle role="heading" aria-level={1} className="text-2xl">Connect this device</CardTitle>
            <CardDescription>Bring your OpenAg desk with you.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <ErrorLine error={error} />
            {joinInvite?.full && <Alert><AlertDescription>The host invited this browser to have Full access. Confirm the device name to continue. This link expires after five minutes and works once.</AlertDescription></Alert>}
            {onCancel && <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>Cancel and keep current access</Button>}
            <Tabs value={mode} onValueChange={value => switchMode(value as Mode)}>
              <TabsList aria-label="Sign-in method" className="w-full">
                <TabsTrigger value="pair" id={tabId("pair")} aria-controls={panelId("pair")}>Pair with a code</TabsTrigger>
                <TabsTrigger value="rtc" id={tabId("rtc")} aria-controls={panelId("rtc")}>Join without VPN</TabsTrigger>
              </TabsList>
              {mode === "pair" ? (
        <form
          className="pt-4"
          role="tabpanel"
          id={panelId("pair")}
          aria-label="Pair this browser with a code"
          onSubmit={submitPair}
        >
        <FieldGroup>
          <p className="text-sm text-muted-foreground">On a trusted OpenAg desk, open Settings → Devices → Pair device. Enter the code below.</p>
          <Field><FieldLabel htmlFor="pair-code">Pairing code</FieldLabel>
            <InputOTP id="pair-code" maxLength={8} pattern="[A-Za-z0-9]*" inputMode="text" autoCapitalize="characters"
              autoComplete="one-time-code" required value={value} onChange={next => setValue(next.toUpperCase())}
              pasteTransformer={normalizeCode}>
              <InputOTPGroup>{[0, 1, 2, 3].map(index => <InputOTPSlot key={index} index={index} />)}</InputOTPGroup>
              <InputOTPSeparator />
              <InputOTPGroup>{[4, 5, 6, 7].map(index => <InputOTPSlot key={index} index={index} />)}</InputOTPGroup>
            </InputOTP>
          </Field>
          {nameField}
          <Button type="submit" disabled={busy}>
            {busy ? <><LoaderCircle data-icon="inline-start" className="animate-spin motion-reduce:animate-none" />Connecting…</> : <>Connect device <ArrowRight data-icon="inline-end" /></>}
          </Button>
        </FieldGroup></form>
      ) : (
        <form
          className="pt-4"
          role="tabpanel"
          id={panelId("rtc")}
          aria-label="Join without VPN using an invite"
          onSubmit={submitRtc}
        >
        <FieldGroup>
          <p className="text-sm text-muted-foreground">On a trusted desk, enable Direct join in Settings → Server, then create an invite and paste it here.</p>
          <Field><FieldLabel htmlFor="rtc-invite">Invite JSON</FieldLabel><Textarea
            id="rtc-invite"
            autoComplete="off"
            spellCheck={false}
            required
            placeholder='{"server":"...","topic":"...","stun":[],"code":"...","secret":"..."}'
            value={inviteText}
            onChange={(e) => setInviteText(e.target.value)}
          /></Field>
          <p className="text-muted-foreground">The invite is single use and expires in 5 minutes. Paste it here only.</p>
          {nameField}
          <Button type="submit" disabled={busy}>
            {busy ? <><LoaderCircle data-icon="inline-start" className="animate-spin motion-reduce:animate-none" />Connecting…</> : "Join"}
          </Button>
        </FieldGroup></form>
      )}
            </Tabs>
          </CardContent>
        </Card>
        <p className="text-sm text-muted-foreground">On the computer running OpenAg? Run <code>pnpm desk:open</code> there to sign in this browser.</p>
      </div>
    </main>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null;
}
