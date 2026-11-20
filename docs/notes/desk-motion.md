# Restrained desk motion

Owner approved three sequential slices: OA-425 pointer reorder settling; OA-426 pointer-added attachment entrances; OA-427 available file-drop cue. Use the installed native shadcn/Base UI controls, no animation dependency. Shared curve is cubic-bezier(0.23,1,0.32,1), matching Button. Animate transform/opacity only; preserve global instant reduced motion and instant keyboard actions. No animations for chat content, Work/receipt data, search, model-save success, generic route entries or filtered grids.

Pointer reorder: preserve existing sidebar order/pin/browser-storage contract. Measure before/after accepted pointer drop, translate displaced rows to their final positions over200ms. Cancel visual settling on another drag, resize, route or reduced-motion change and unmount. Keyboard/menu moves, cancelled/invalid drops and passive item updates stay instant.

Attachments: only newly pointer-picked/native-dropped chips enter (opacity0→1, scale.98→1,150ms). Keyboard picker and paste are instant. Keep existing chips, retries, upload-state refresh and removal instant; no composer-height animation or delay to uploads/actions. Preserve six-file/10MiB UI limits, server validation, object URL cleanup, exact attachment IDs, drafts and failed-send recovery.

Drop cue: semantic outline overlay, non-interactive and aria-hidden, opacity transition125ms. Fine/hover pointers only. Eligibility comes from the same Composer guard used by addFiles, without new permission restrictions or duplicated validation. Files-only drag, nested enter/leave tracking, drop/cancel/blur/navigation/availability cleanup. Cue indicates where a drop can be attempted, never validated upload success. Actual addFiles/server validation remains authoritative.

Verification seam: built desk → real disposable gateway, controlled operations, no live providers. Standalone behavioural assertions plus CUA browser motion/geometry/focus,390/900/1440 light/dark, normal/reduced motion. No unit/Jest/Vitest runners. Update delivered help and verify bot knowledge. Each slice is independently demonstrated/committed; finish local Standards/Spec then installed codex review --base origin/main, fix substantive findings and re-review. No publication, merge or deployment under this approval.

## Keyboard-instant popups, sheets and jump-to-latest (20 November 2026)

Keyboard-driven UI appears on the first frame. The Cmd+K palette and its backdrop never animate (`CommandDialog` passes `animate-none!` to both; other dialogs keep their motion). The @mention picker never animates. Menus, popovers and tooltips skip their animation whenever Base UI sets `data-instant`: Enter or Space opens (`click`), Escape closes (`dismiss`), focus opens (`focus`) and adjacent tooltip opens (`delay`). Pointer opens keep the 100ms motion. Select is unchanged.

Sheets open over 200ms and close over 150ms on the house curve, panel and backdrop alike. The panel transitions only opacity and `translate` (what Tailwind v4 `translate-*` sets). Jump-to-latest leaves over 150ms on the house curve; its 200ms entry is unchanged.

`node scripts/verify-rendered-acceptance.mjs motion` asserts these in Chromium with normal motion preferences.
