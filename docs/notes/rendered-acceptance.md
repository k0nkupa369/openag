# Rendered desk acceptance (18 November 2026)

`scripts/verify-rendered-acceptance.mjs` renders the built desk in real Chromium against a disposable gateway (`bot-models-fixture`). It uses no live data, provider or model. Every state renders at desktop 1440×1000 and phone 390×844 (touch emulation), in light and dark. Automatic checks per render: no horizontal overflow, no page or console errors, and the state's own assertions (visible controls, labels, counts, scroll anchoring, draft retention). The owner accepted Chromium desktop and emulated-phone renders as the visual gate. Physical phones, Safari, the installed PWA and screen readers remain unverified.

```sh
pnpm -r build
OPENAG_PLAYWRIGHT_MODULE=<path to playwright-core matching the installed Chromium> \
OPENAG_EVIDENCE_DIR=<folder> node scripts/verify-rendered-acceptance.mjs [OA-476 OA-477 OA-466 OA-460 OA-459 sign-in]
```

The Playwright module must match the Chromium build in `PLAYWRIGHT_BROWSERS_PATH`. Here playwright-core 1.62.1 matches Chromium build 1234; the run also needs `chromium_headless_shell-1234`.

## Result

113 of 113 renders passed on branch `claude/rendered-acceptance`. After the 20 November findings fixes, 123 of 123 renders passed on branch `claude/design-findings` (new busy profile states; Load earlier now also in dark). Screenshots are not committed (`docs/notes/evidence/` stays out of the public tree); rerun the script to regenerate them in `OPENAG_EVIDENCE_DIR`.

| Ticket | States rendered |
| --- | --- |
| OA-476 replies | Agent, long/hostile and attachment-only targets; Escape cancels; send with quote; quote after reload |
| OA-477 questions | Open question with Reply/Dismiss; answering mode (the quoted Reply preview with Cancel reply; Escape cancels) |
| OA-473 provider forms | Live form with number, boolean and choice fields, credential warning, Send/Decline/Cancel |
| OA-469 receipt removal | Pending approval card collapsed and expanded (proposal, review details, actions). The receipt page itself was removed on 6 Nov (`c7ac59e`) |
| OA-474 result vs effect | Tool outcomes: completed, failed and Unknown. Summary reads "1 failed · 1 unconfirmed"; Unknown uses the neutral icon. The receipt labels left with the receipt page |
| OA-466 long history | 300 messages: opens at latest; jump-to-latest when scrolled away; Load earlier keeps the reading anchor within 48px; draft intact while replies arrive |
| OA-460 / OA-462 profile | Default, edited name, crop dialog, zoomed crop, saved image after reload, Limited device read-only |
| OA-459 reflection memory | Saved notes in the agent's Memories section; Reflection panel. `verify-reflection-ui.mjs` also passes in Chromium |
| OA-390 avatars | Agent settings, avatar editor, turned view with an expression |
| Sign-in (0.7.0) | Unpaired join page, Full invite link, revoked device |
| skill-curator (0.8) | Revise approval card with the per-line diff against the current version (3 added, 2 removed); Skills panel Archived section with Restore; restore end to end (desktop light) returns the skill to the active list |
| history-search (0.8) | Search command message results with highlighted words (sidebar Search, phone via navigation); no-match text (Ctrl+K, desktop); opening a result lands on the message with earlier and later context and Load earlier |

## Defects found and fixed in this change

- An attachment-only message drew an empty text bubble above its file card (`Feed.tsx`).
- The shared `Slider` thumb escaped its control and floated at the dialog's left edge, because the control was not a positioning context. The slider is now aligned with shadcn base (`relative` control, `thumbAlignment="edge"`, slots), keeping one named thumb for a scalar value and the 44px touch height.

## Findings

Fixed findings name the rendered assertion that now guards them in `verify-rendered-acceptance.mjs`.

| Before | After | Why | Status |
| --- | --- | --- | --- |
| Sign-in title is a `CardTitle` `div` | Expose "Connect this device" as the page `h1` | The page every new device lands on has no heading for screen readers | Fixed 20 Nov: `CardTitle` has heading role, level 1. Asserted by role and level; screenshots are byte-identical to before |
| Revoked/error `Alert` below Connect device | `Alert` at the top of the card | The error explains why the person is on this page | Fixed 20 Nov: one error `Alert` opens the card content for both sign-in methods. Asserted by bounding box (Alert bottom above the tabs) |
| Agent editor help text uses a local `font-mono text-[12px]` class | `FieldDescription` | shadcn: no typography overrides; descriptions belong to the field | Fixed 20 Nov: handle and model-steps help use `FieldDescription`; only the runtime/handle identifier line stays monospace. Asserted by computed font family |
| Phone activity summary truncates "boss · Activity" first | Truncate the counts description first | The actor is the part that identifies the row | Fixed 20 Nov: the counts description takes the remaining width and truncates; the title truncates only when it alone is wider than the row. Asserted by scrollWidth ≤ clientWidth on the title (phone) and the counts (desktop) |
| Desktop "Load earlier messages" floats over message text | Give it a solid surface or a `Marker` row | Overlapping text reads as a layout fault | Fixed 20 Nov: measured, the control already had its own row above the viewport; with no edge, clipped messages looked as if they ran under it. It is now a `Marker` border row. Asserted: no visible article under the control, control above the transcript, full-width rule between them |
| Message reply shows a quote block; question answer shows a one-line "Replying to:" | One composer reply pattern | Same concept, two treatments | Fixed 20 Nov: the composer holds one reply target (message or question) and renders one quoted preview with Cancel reply; Escape cancels either. Asserted: the question answer shows the quote block and Cancel reply, and Escape removes it |
| Profile uses a raw `fieldset`, "Reading image…" text and a "Saving…" label swap | `FieldSet`, `Spinner` + `data-icon` on the busy button | shadcn compositions | Fixed 20 Nov: `FieldSet`; the installed `Spinner` with `data-icon` on the disabled busy Save and Upload buttons. Asserted: each busy button is disabled with a Loading status inside, and the busy text appears only in the button |
| Automations toasts use the Sonner wrapper | Consider the shadcn Base UI `toast` | shadcn rule for Base UI projects | Open |
