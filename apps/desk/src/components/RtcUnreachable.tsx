import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";

/** Shown when a browser that joined over WebRTC cannot reach the daemon. Pair again is the normal sign-out. */
export function RtcUnreachable({ onRetry, onPairAgain }: { onRetry: () => void; onPairAgain: () => void }) {
  return (
    <main className="mx-auto mt-[12vh] mb-0 flex max-w-[420px] flex-col gap-4 px-4">
      <h1>OpenAg</h1>
      <Alert><AlertDescription>This browser can't reach OpenAg over WebRTC right now. If this device was removed from OpenAg, pair it again.</AlertDescription></Alert>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={onRetry}>Try again</Button>
        <Button type="button" variant="outline" onClick={onPairAgain}>Pair again</Button>
      </div>
    </main>
  );
}
