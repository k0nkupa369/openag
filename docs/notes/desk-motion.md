# Restrained desk motion

Owner approved three sequential slices: OA-425 pointer reorder settling; OA-426 pointer-added attachment entrances; OA-427 available file-drop cue. Use the installed native shadcn/Base UI controls, no animation dependency. Shared curve is the `--ease-house` token, cubic-bezier(0.23,1,0.32,1), matching Button. Animate transform/opacity only; preserve global instant reduced motion and instant keyboard actions. No animations for chat content, Work/receipt data, search, model-save success, generic route entries or filtered grids.

Pointer reorder: preserve existing sidebar order/pin/browser-storage contract. Measure before/after accepted pointer drop, translate displaced rows to their final positions over200ms. Cancel visual settling on another drag, resize, route or reduced-motion change and unmount. Keyboard/menu moves, cancelled/invalid drops and passive item updates stay instant.

Attachments: only newly pointer-picked/native-dropped chips enter (opacity0→1, scale.98→1,150ms). Keyboard picker and paste are instant. Keep existing chips, retries, upload-state refresh and removal instant; no composer-height animation or delay to uploads/actions. Preserve six-file/10MiB UI limits, server validation, object URL cleanup, exact attachment IDs, drafts and failed-send recovery.

Drop cue: semantic outline overlay, non-interactive and aria-hidden, opacity transition125ms. Fine/hover pointers only. Eligibility comes from the same Composer guard used by addFiles, without new permission restrictions or duplicated validation. Files-only drag, nested enter/leave tracking, drop/cancel/blur/navigation/availability cleanup. Cue indicates where a drop can be attempted, never validated upload success. Actual addFiles/server validation remains authoritative.

Verification seam: built desk → real disposable gateway, controlled operations, no live providers. Standalone behavioural assertions plus CUA browser motion/geometry/focus,390/900/1440 light/dark, normal/reduced motion. No unit/Jest/Vitest runners. Update delivered help and verify bot knowledge. Each slice is independently demonstrated/committed; finish local Standards/Spec then installed codex review --base origin/main, fix substantive findings and re-review. No publication, merge or deployment under this approval.

## Keyboard-instant popups, sheets and jump-to-latest (20 November 2026)

Keyboard-driven UI appears on the first frame. The Cmd+K palette and its backdrop never animate (`CommandDialog` passes `animate-none!` to both; other dialogs keep their motion). The @mention picker never animates. Menus, popovers and tooltips skip their animation whenever Base UI sets `data-instant`: Enter or Space opens (`click`), Escape closes (`dismiss`), focus opens (`focus`) and adjacent tooltip opens (`delay`). Pointer opens keep the 100ms motion. Select is unchanged.

Sheets open over 200ms and close over 150ms on the house curve, panel and backdrop alike. The panel transitions only opacity and `translate` (what Tailwind v4 `translate-*` sets). Jump-to-latest leaves over 150ms on the house curve; its 200ms entry is unchanged.

`node scripts/verify-rendered-acceptance.mjs motion` asserts these in Chromium with normal motion preferences.

## Tooltip grouping, drag tracking and the phone navigation drawer (20 November 2026)

**Tooltips.** One `TooltipProvider` with a 600ms delay wraps the desk (`main.tsx`). The first tooltip waits for the delay; a tooltip opened right after another (for example Copy, then Reply on a message) opens at once with `data-instant="delay"` and no animation.

**Sidebar reorder drag.** While the pointer is down, the dragged row follows it 1:1 through a `transform` written directly on the row; React state changes only when the drop target changes. Past the first or last row of its group, the row moves a fifth of the overshoot. A drop settles from where the finger let go, through the existing 200ms reorder settle. A cancelled or invalid drop springs back over 200ms on the house curve, instantly under reduced motion. Only the primary pointer starts a drag, and a second touch during a drag is ignored. The drop target comes from the rows' bounds, not `elementFromPoint`, because the dragged row is now under the pointer.

**Phone navigation.** The phone sidebar is the shadcn base-nova `Drawer` (Base UI Drawer) instead of a `Sheet`. It swipes closed toward the edge it opened from. The drawer and backdrop follow the finger, and the backdrop fades with swipe progress. A long swipe or a flick closes it; a short drag snaps back. Base UI claims the gesture only after a short movement, so taps and vertical scrolling inside the drawer still work, then tracks 1:1. It responds to touch, not mouse drags. Timing is the registry default: 450ms open on `cubic-bezier(0.22,1,0.36,1)`, and closing time scales with swipe strength.

`node scripts/verify-rendered-acceptance.mjs motion` covers all three in Chromium:
- the first tooltip waits and the adjacent one is instant;
- the row tracks 1:1, rubber-bands, cancels home and reorders on drop;
- touch swipes track 1:1 after the drawer claims the gesture, fade the backdrop and close, while a short drag stays open.

Physical phones and Safari are unverified.

## Motion polish for 0.7.5 (20 November 2026)

**One easing token.** The house curve is defined once in `styles.css` as `--ease-house` in a `@theme static` block, so it is always emitted. Classes use `ease-house`, CSS uses `var(--ease-house)`, and WAAPI callers (sidebar reorder settle, composer height) use `houseEase()` from `lib/motion.ts`, which reads the token. `lib/motion.test.ts` fails if the curve is typed anywhere else under `apps/desk/src`. The minifier writes the token as `cubic-bezier(.23, 1, .32, 1)`, which is the same curve. The motion scenario's `house-curve-token` capture normalizes it and checks the token and Button in Chromium, and `sidebar-drag-tracks` checks the reorder settle animation uses it.


**Sidebar toggle.** Cmd+B (Ctrl+B) collapses and expands the desktop sidebar on the first frame. The provider records that the last toggle came from the keyboard and sets `data-instant` on the sidebar, which removes the gap and container transitions. Pointer toggles (the trigger and rail) keep the 200ms width and left transition, now on `ease-house` instead of linear. The `sidebar-keyboard-instant` and `sidebar-pointer-eases` captures check both in Chromium. The phone drawer is unchanged.

**Collapsible height.** `CollapsibleContent` (`ui/collapsible.tsx`) opens and closes by animating its height over 200ms on `ease-house`. It uses the Base UI pattern Trace already had: `h-(--collapsible-panel-height)` with `data-starting-style` and `data-ending-style` at 0. Every collapsible gets it, including `Disclosure` (approval cards, Work and settings details) and agent setting rows (`BotSettingRow`). Trace now relies on the shared classes. Padding must sit on an inner element, because padding on the panel stays visible at height 0, so `Disclosure`, Devices and Models moved their top padding inside, and Skills moved the gap between trigger and panel inside. A disclosure that is already open when its card arrives does not animate, so new approval cards do not move the feed. The `disclosure-height-in-feed` capture opens and closes Review details on an approval card at the bottom of a 40-message feed. It checks the height transition and curve, that the feed stays pinned to the latest message while the panel opens, and that closing ends at height 0 with the kept-mounted panel hidden.

**Crop editor drag.** While the pointer is down, the avatar crop preview writes a `translate()` on the image from the clamped target position and React state stays still. On pointerup or lost capture the last target is committed once, and a layout effect clears the transform in the same commit, so the image does not jump. A pointer cancel (the system took the gesture) clears the transform and keeps the position from before the drag. The arrow buttons and zoom still set state directly. The `crop-drag-transform` capture checks the image follows the pointer 1:1 without re-rendering its `left`, and that release commits the position where the drag left it.

Reduced motion is unchanged: the global `prefers-reduced-motion` rule in `styles.css` still removes every transition and animation, including the new collapsible height and sidebar transitions.
