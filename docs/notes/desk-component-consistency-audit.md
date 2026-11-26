# Desk component consistency audit

Baseline: 3 November 2026. Part 2 source reconciliation: 4 November 2026. Browser/state evidence and final review were recorded during the release; source inventory alone is not visual acceptance.

OA-403 follow-up: Slack setup/diagnostics were separated, agent sections now expand inline with mounted drafts, Full ledger moved to Activity, and agent actions use pointer-gated opacity with immediate keyboard/touch access. See follow-up evidence.

## Release 0.8 skill curator — 26 November 2026

The revise approval in ApprovalCard composes the shared Alert (stale warning), Skeleton (loading the current version) and EvidenceBlock; the per-line diff is plain text inside EvidenceBlock with a hidden `+`/`-` gutter and screen-reader change labels. The Skills panel Archived section is a plain list with the shared Separator, a secondary count Badge, an outline "Archived" Badge (neutral metadata) and Restore as a shared outline Button. Audited exception: the added and removed line tints use `color-mix(in oklab, var(--online|--destructive) 12%, transparent)`. They derive from the semantic tokens in both themes, but no shared diff or tint token exists, and a status Badge or Alert would misstate a line of text as a status. Removed lines also use `text-muted-foreground`, so the change does not rely on colour alone.

Rendered: the `skill-curator` scenario in `scripts/verify-rendered-acceptance.mjs` (revise card and Archived section at desktop 1440×1000 and phone 390×844, light and dark; restore end to end at desktop light). Physical phone, Safari and screen-reader checks were not run.

## OA-501 Conversation unread — 6 November 2026

The sidebar and phone navigation use the shared attention Badge for unread conversations; direct-agent and room rows retain the installed Base Sidebar composition. The transcript boundary uses the installed Base Marker separator and attention Badge inside MessageScroller. Read and unread states use the same variants across the redesigned and classic shells. The new-message marker and unread badge follow the shared read boundary.

Disposable built-desk Chromium checks cover room and direct-agent badges, Full/Limited devices, cross-device clearing, scrolled-up preservation, jump-to-latest and simulated hidden/visible transitions. Desktop 1440 and phone 390 screenshots cover light/dark navigation, plus a desktop transcript boundary. Official [Badge](https://ui.shadcn.com/docs/components/base/badge) and [Sidebar](https://ui.shadcn.com/docs/components/base/sidebar) compositions were compared, and Marker was installed from the current base-nova registry. Physical phone, Safari, assistive technology and real OS background-state acceptance remain unverified.

## OA-497 Dismiss unanswered question — 6 November 2026

Added native ghost/sm Dismiss beside Reply in pending-question cards and the footer of known open questions in loaded history. Pending requests show Dismissing… and disable duplicate dismissal; success removes the reminder and its open action, failure uses the existing destructive Alert. It introduces no status badge, control skin or dependency. A question closes through existing cancelled state, with a separate owner dismissal audit event. No answer, continuation or permission grant.

Actual built desk/disposable gateway inspected at1440×1000 and390×844 in dark mode. Enter on Dismiss closed only the selected reminder; the other remained. The composer retained the unfinished draft and removed its question target. Loading earlier history retained the original closed question without a Dismiss control; the other open question had Dismiss beside its inline Reply. Phone had no horizontal overflow. Native controls match Message/Footer and the OA-498 light/dark composition. Evidence. Mounted gateway checks cover errors, stale revision, Full/Limited controls, history/recovery and no resumed turn. Light theme uses unchanged shared controls; no new light screenshot, physical phone/Safari or screen-reader check for this slice.

## OA-498 unanswered questions outside history — 6 November 2026

Replaced the plain-text fallback and stretched Reply button with the installed Message/Avatar/Header/Bubble/Footer composition. The outline bubble holds the original prompt; the header uses attention Badge “Unanswered question”; the footer contains its original date and a native ghost/sm Reply. Avatar stays static. Existing question id/revision selection, permissions, request paging and visible-message deduplication are retained. No new primitives, dependencies or control skins.

Compared current official Base AI Elements Message, Confirmation and Questionnaire: Message/Footer fits an open-text conversation request; Confirmation is an action review and Questionnaire requires structured input. Actual built desk on a disposable gateway passed phone390×844 and desktop1440×1000 in light/dark. Two older pending questions and a newer reply render together with consistent left alignment. Phone Reply controls measure59px wide, with no page overflow. Keyboard Enter selects the exact question; New message clears it. Loading original history removes both fallback cards and renders each question once. Mounted checks cover Limited-device action omission and attention status. Evidence. No live question was answered or cancelled. Physical phone/Safari and screen-reader checks were not run.

## OA-488 chat history — 5 November 2026

Direct and room chat share MessageScroller/Viewport/Content/Item and the native ghost Button for **Load earlier messages**. The control sits outside measured transcript rows, at a stable height after exhaustion. Loading uses the existing Skeleton before the real scroller mounts; pending initial positions remain hidden. All content children are Items, including conversation requests and working status. Rows use measured content height; there are no alternative control skins, status badges or new tokens.

Real Chromium against a disposable synthetic gateway passed desktop 1440×1000 and phone 390×844 for both chat types. Covered: recent opening, cached reading restoration (0px displacement), reader hold during live output and delayed preceding content, older-page anchoring, jump/follow latest, reconnect, late old-room responses, count/size cache eviction, queued recovery after request failure, refresh and replacement session. Native roles/labels and phone page overflow were checked. The representative light-theme desktop/phone captures were inspected against the existing composition. Existing chat-display and render integration checks passed. No new dark-theme, real provider or installed-service acceptance is claimed.

## OA-491 compact action controls — 6 November 2026

Copy and Reply now use the shared Button icon-compact size. It keeps native ghost styling, focus, labels and 16px icons; width is 28px in all layouts, height remains 28px desktop/44px touch. No negative margins or overlapping targets. Other controls retain their existing sizes. Bubble/avatar geometry and footer alignment are unchanged.

Actual built desk at 390×844 and 1440×1000: three message footers each have 28px icon center spacing and 12px visible icon gap, compared with 44px/28px previously on phone. Adjacent targets touch but do not overlap. Keyboard Enter on Reply opened the quoted agent draft; Cancel reply dismissed it. Compared rendered Message/Bubble/Footer and native ghost button composition. Evidence. Physical phone/Safari, light mode and screen-reader checks were not repeated.

## OA-490 owner correction: action alignment — 6 November 2026

The owner clarified that the left inset request applied to agent actions, not agent bubbles. Restored the original Feed gutters (16px phone/32px desktop), 32px avatar and 8px row gap. The shared native MessageFooter now removes its extra 12px horizontal padding for start-aligned messages only. The zero vertical gap and native control hit areas remain. No replacement control skins or CSS repairs.

Actual built desk checked at 390×844 and 1440×1000 in dark mode: agent footer left equals bubble left; phone bubble restored to x=56px and desktop to 72px from the centered feed edge. Copy glyph is 14px inside the bubble edge on phone (44px hit target), 6px on desktop (28px target), with no extra footer inset. Both have a 0px bubble/footer gap and no horizontal overflow. Evidence. Physical phone/Safari, light mode and screen-reader checks were not repeated.

## OA-494 tighter agent alignment — 6 November 2026

Shared Message rows now use a 4px avatar gap and 24px avatar minimum. Feed renders 24px avatars with 8px phone/16px desktop gutters. MessageContent adds no gap above the native Footer; ghost/icon-sm controls retain their native 28px desktop and 44px touch targets. Avatar bottom alignment follows the actual footer height. These are layout changes to the existing native composition, with no new control skins.

Actual built desk on a disposable gateway was inspected at 390×844 and 1440×1000 in dark mode. Phone agent bubbles start at x=36px (20px closer to the edge); desktop bubbles start 44px from the centered feed edge. Short user/agent and wrapped user messages all measured 0px bubble/footer gap. No horizontal overflow; desktop avatar and bubble bottoms match. Evidence. Light theme was covered by OA-493; physical phone/Safari and screen-reader checks were not run for this follow-up.

## OA-493 compact message actions — 6 November 2026

Removed empty attachment/Work containers from Feed and changed shared MessageContent spacing to gap-1 (4px). MessageFooter still uses native ghost/icon-sm buttons, tooltips and timestamps. Avatar bottom alignment follows the footer height plus the shared gap. No button size, hit target, color, skin or action changed.

Actual built desk on a disposable gateway was inspected at 390×844 (light/dark) and 1440×1000 (light). Short user text, wrapped user text and an agent reply each measured exactly 4px from bubble bottom to footer top. Native Message/Bubble/Footer comparison shows the actions adjacent to their bubble and no empty spacer rows. Keyboard Enter on Reply opened the quoted draft; Escape dismissed it. Evidence. Physical phone/Safari and screen-reader checks were not run.

## OA-492 asynchronous agents and editable handles — 6 November 2026

Reuses native Field/Input/Button compositions for the handle editor and Trace/TraceCollapsible/Badge for request activity. No new control skins, ancestor CSS repairs, dependencies or graphic exceptions. Queued requests are attention; completed findings are success; failed execution/delivery is destructive; interruption remains attention and cancellation neutral.

Controlled rendered comparison used actual built desk plus disposable gateways: 1440×1000 and 390×844, light/dark request states (queued, working, findings ready, failed and interrupted), expanded findings/cancellation and the handle editor (desktop light; phone light/dark). A real handle save exposed missing bot_handle_changed refresh in shared room/list hooks; corrected and verified a second save updates the visible address without navigation/reload. Phone documents measured 390px content width at a 390px viewport. Queue cancellation visibly changed to Cancelled and removed its Cancel control. Screenshots and coverage limits.

The stale desktop-dark editor capture is retained as before-fix reproduction, not final visual acceptance. Browser screenshots cover Chromium/in-app browser only; physical phone/Safari and screen-reader acceptance are not claimed. Managed-tool behavior and real adapter journeys are separate from this visual comparison.

## Motion polish 0.7.5 — 20 November 2026

`CollapsibleContent` carries the height transition from Trace's composition (`--collapsible-panel-height`, Base UI starting and ending styles). Callers keep layout classes on the panel, but padding moved to an inner element (Disclosure, DevicesPage, ModelsPage) so the panel can close to zero. Sidebar gap and container use `ease-house` and drop their transition under `data-instant` (Cmd+B). The house curve is one token, `--ease-house`, used by Button, Sheet, MessageScroller and the WAAPI reorder and composer-height animations. No new control skins or token changes beyond the easing token. Rendered: `verify-rendered-acceptance.mjs motion` in Chromium (normal motion, desktop), plus the full rendered suite across desktop and phone, light and dark, for layout.

## Proactive model use — 20 November 2026

History adds a Model use ProactiveCard: native Table (aria-label "Model use by day") with Day, Calls and Tokens columns, native Empty for no calls, semantic `text-muted-foreground` and `tabular-nums`. No new control skins, token changes or motion. Rendered by `verify-rendered-acceptance.mjs proactive-usage` at desktop and phone in light and dark: 4/4 passed with no horizontal overflow, screenshots reviewed.

## OA-484 proactive UI/UX — 5 November 2026

Owner requested shadcn and Emil design guidance for the Composio-first feature. Source selection now leads Schedule. ProactiveCard supports the native CardFooter for the selection count and save controls. History groups accounts by service with ItemGroup/Item/Header/Content, semantic Badge variants and explicit recovery navigation; native Empty/Skeleton states replace blank text. Recent disclosures name the service and account. Feature classes own layout, with no new control skins, token changes or entrance motion.

Rendered evidence records 32 desktop/phone light/dark state captures, keyboard search/selection/save, narrow 320px evidence expansion and absence of whole-page overflow. Representative screens were inspected against the installed native compositions. Mounted real-gateway acceptance retains draft/error and scope behavior; component inventory remains 132 modules. This completes the previously blocked OA-483 rendered comparison for the reachable controlled service picker/history states. Real provider access and physical notification receipt remain separate.

## OA-483 proactive services — 5 November 2026

The searchable Composio picker composes ProactiveCard, FieldGroup/Field, FieldContent/FieldDescription, FieldLabel, Input, Checkbox, FieldSet and Button. Feature classes own layout. Account coverage uses the shared Badge semantic variants; check evidence uses the existing Disclosure composition and semantic document text. No alternative control skins, ancestor repair selectors or graphic exceptions were added.

| Surface/state | Controlled coverage | Rendered comparison |
| --- | --- | --- |
| Empty selection, service search, multiple service choices, saving | Public gateway plus mounted real components | Unavailable |
| Multiple accounts, one needs sign-in, last successful read and covered-through time | Public integration plus mounted account history | Unavailable |
| Stale save, error, retained draft and refresh | Mounted controls through the actual gateway | Unavailable |
| Unsupported checks, incomplete pages, permissions/rate limits, interruption and recovery | Public integration; component mapping inspected | Unavailable |
| Check excerpts and historical scope withholding | Public history integration; shared Disclosure composition | Unavailable |

Badge mapping: Checked/No new items/No alert needed/Alert posted use success; Needs sign-in/Not checked/Checking/Incomplete/Rate limited/No supported check/Held for brief/Held back use attention; Could not check/Read access missing/Interrupted use destructive; Cancelled is neutral metadata. No per-call colour overrides.

Initial acceptance was blocked because Cua reported local browser use disabled. Browser access became available during OA-484; the rendered comparison is now completed in the evidence linked above. The original DOM/source checks alone were not treated as visual acceptance.

OA-403 follow-up: Slack setup/diagnostics were separated, agent sections now expand inline with mounted drafts, Full ledger moved to Activity, and agent actions use pointer-gated opacity with immediate keyboard/touch access. See follow-up evidence.

## OA-481 question reply composer — 5 November 2026

A selected question reply now activates the existing expanded InputGroup composition, as a quoted-message reply already did. The block-start context header, full-width textarea and block-end flex toolbar share the existing components, sizes and tokens. No CSS override or replacement control was added. The previous empty/unfocused state combined a block header with a compact contents toolbar, causing the observed vertical controls.

Mounted RoomView/disposable gateway regression asserts an empty unfocused question reply retains block-end controls with a flex container. It failed against the original implementation and passed after the fix. Existing New message, target retention, explicit sending, permissions and quoted reply journeys are retained. Rendered desktop/phone light/dark comparison remains open: local browser access is disabled in Work settings. DOM composition checks do not establish final pixel geometry.

## OA-480 dynamic working indicator — 5 November 2026

Feed and AgentRequestsPanel reuse the installed Trace/TraceLine/TraceIcon/TraceTitle, TraceCollapsible, Badge, Button and Alert compositions without new control styling. One spinner names active bots once using singular/plural list copy. Request details expand beneath the line; successful delivered rows disappear rather than remaining above the composer. Input and non-success states retain their semantic badges and controls in the scrolling feed. Bot names resolve against the installation catalogue, including guests outside room membership.

Built-desk DOM coverage checks three/two/one names, duplicate recipients, stream completion removal and retained failed/input rows. **Rendered acceptance remains open:** local browser inventory reports “Local browser use is disabled in Work settings”. Desktop/phone, light/dark, long-name truncation, focus, expanded details and scrolling have not received a rendered comparison in this change. Source/DOM/build checks are not visual certification.

## OA-409 completion — 4 November 2026

All 111 production modules have a current disposition and family-specific evidence in the source audit. The remaining competing payload, attachment, card, navigation and ancestor control skins were corrected. The six OA-408 reopened rows are closed within this controlled acceptance scope. See verification and limits and the 390/900/1440 light/dark matrix. Specialist artwork, hidden file input, semantic document content and remote-viewer geometry remain explicit exceptions. Physical-device, screen-reader and live provider/computer acceptance are separate.

## Historical acceptance correction — 4 November 2026

The Part 2 completion claim did not establish fidelity to official shadcn compositions. Source inventory, behavior journeys and the earlier screenshot matrix remain useful evidence, but do not certify matching compositions. The owner found retained model-picker and composer differences. OA-406/407 removed the old model picker; OA-408 corrects Prompt Input. At that point the broader visual consistency gate was reopened. OA-409 above supersedes this historical gap list.

Source recheck found these remaining composition gaps, in priority order:

| Priority | Source | Confirmed gap / next check |
| --- | --- | --- |
| 1 | ActivityTrace, ReceiptView | Independently styled preformatted payload blocks remain; compare and migrate to the official CodeBlock composition while preserving exact evidence and bounded scrolling. |
| 2 | AttachmentChip | Received files still use a custom bordered card/button; compare with the same Attachment primitive now used by the composer, preserving authenticated lazy previews and downloads. |
| 3 | SettingsLayout, RoomRail | Caller-level navigation colours/radii and descendant tab-height overrides remain. Compare actual selected, hover, focus and phone states against official Sidebar/Tabs compositions. |
| 4 | BotEditor | Custom grouped-row/settings surfaces remain. Decide which are domain layout and which compete with native component treatment using rendered comparisons. |

These are source-confirmed differences, not completed browser audits or newly proved functional bugs. The rest of the inventory has not received a new reference-by-reference visual pass in OA-408. Part 1 behavior acceptance remains separate from this reopened visual gate.

## Agents sidebar static avatars — 5 November 2026

The Agents sidebar keeps its existing Sidebar composition, sizes, colours and artwork. Only its BotAvatar call forces static SVG rendering. Controlled renderer checks cover default and explicitly animated saved avatars with no animation frames; other callers retain animation. Rendered desktop/mobile comparison and performance measurements remain unverified.

## Chat sender identity — 5 November 2026

Owner requested visible identification for room replies. The shared Feed now composes native MessageAvatar and MessageHeader with the existing Message/MessageContent/Bubble/Footer. Agent replies show a static 32px BotAvatar beside the bubble and the display name above it; missing metadata uses the actor handle. User and error rows retain their existing presentation. The avatar is existing specialist artwork; no new control skin is introduced. `verify-render-performance.mjs` checks multiple senders, all colours, automatic/missing metadata, static SVGs with zero animation frames, accessible labels, timestamps and appearance refresh. The build and component inventory pass. **Visual acceptance remains open:** browser inventory reports “Local browser use is disabled in Work settings”, so desktop/phone, light/dark, long names, attachment/result/Work rows and scroll comparison with the official Message composition were not visually verified. DOM checks do not establish rendered alignment or overflow.

## Goal and boundary

Make the whole shipped desk feel unified and consistent through native shadcn Base UI/base-nova components. A component already using shadcn can still fail consistency through per-screen overrides, conflicting defaults or incorrect state variants. A raw HTML element is not automatically a defect: hidden file inputs, semantic document structure and specialised graphics have legitimate uses.

The original pre-Part-1 audit inventoried 104 production TSX modules (33 shared UI and 71 feature/support). Part 2 started with 105 modules after Part 1 added MessageText. After this migration, the current tree contains 111 production modules: 35 shared UI and 76 feature/support modules. The ReasoningText module was retired; AlertDialog, NavigationDialogs, Disclosure and MessageText are included. Test files and the separate design reference are excluded from the counts. Counts below are source sites, not rendered instances or unique exported components. Repeated list elements and conditional branches can produce different runtime counts.

Evidence combines source review of all inventory rows, standalone controlled gateway checks and the 390/900/1440px light/dark browser matrix linked above. The inventory is source coverage; it does not claim every live state or device was exercised. Real phone keyboards/touch, screen readers and live provider/computer acceptance remain unverified.

## Baseline findings and migration matrix

| ID | Finding and evidence | Native shadcn target / required action | Priority |
| --- | --- | --- | --- |
| C01 | The shared model selector explicitly derives from Cuelark. Its 44 px custom transparent trigger and medium-weight label differ from the 32 px NativeSelect used for effort. Provider colours are calculated locally. Callers include agent creation, agent model settings and room routing. | Recompose the model picker from the official model-selector pattern and shared controls, retaining search, grouping, value handling and loading. Match the effort control's shared size, surface, border, label weight, focus and chevron. Do not discard provider metadata merely to make controls match. | First in Part 2 |
| C02 | Shared Input and Button default to 44 px, while NativeSelect and InputGroup start at 32 px. SettingsLayout stretches selected descendants to 44 px; sheets outside that ancestor do not get the same treatment. | Set a coherent size contract in shared components. Explicit compact variants are allowed; ordinary controls must not rely on their ancestor page to repair their size. Do not impose a single height on textareas or overlays. | First in Part 2 |
| C03 | Login has 5 raw button sites, 3 raw input sites and 1 raw textarea site, with its own labels, primary-button styling and warning-coloured errors. | Button, Field, Input, Textarea and Alert. Preserve pairing, host sign-in, legacy token handling, invite validation and credential privacy. | Part 2 |
| C04 | ComputerView has 9 raw button sites and a raw backend select. Its compact rendering already uses shared Button, so the same feature has two control systems. | Button, NativeSelect, Field, Card, Badge and Alert. Reuse shared lifecycle presentation in full and contextual views. Functional Unknown/missing recovery remains Part 1 and must not be hidden by restyling. | Parts 1–2 |
| C05 | LedgerView has 3 raw button sites, 2 raw selects, 1 raw input and a raw table. Filters and metadata pills have independent styles. This is a reachable diagnostic page. | Button, Input, NativeSelect, ToggleGroup, Table, Badge and shared detail surfaces. Keep exports, filtering, row selection, exact evidence and controlled horizontal scrolling. | Part 2 |
| C06 | McpInteractionCard generates 3 raw select branches and a raw input from remote form schema. They do not share ordinary form treatment. One select is a multiple-choice list and a boolean field has an unset state. | Field, Input and NativeSelect for single choices; compose supported multiple-choice controls from Checkbox/Field or an appropriate official pattern. Preserve missing versus false, typed values, optional fields, expiry, disabled state and server validation. Never convert a tri-state field to a two-state Switch. | Part 2 |
| C07 | App library combines shared Input with a raw Category select and custom filter CSS, in both browsing and installed-connection views. | Field and NativeSelect with matching sizing. Use the same filter composition in both views. | Part 2 |
| C08 | App enabling and reviewed integration setup each use a raw visible checkbox for security-relevant acknowledgement. | Checkbox plus linked FieldLabel. Preserve explicit acknowledgement, disabled states and the exact reviewed package/hash binding. Styling must not pre-check or bypass consent. | Part 2 |
| C09 | AppsPanel draws its own state/tool pills; McpPanel has an independently styled amber status pill in its unscoped view; PermissionGrid has custom 11–12 px tags; Ledger has its own event pills. Some Badge callers also use neutral variants for pending/failure states. | Shared Badge variants. Audit Apps, MCP, permissions, models, computer, receipts, devices, skills and Work by actual meaning. Not every Off or Limited state is a failure; use neutral metadata where appropriate. | Part 2 |
| C10 | ReceiptView maps failed and unknown to the same attention variant. ModelsPage uses outline for both responding and unreachable Ollama, and for a missing adapter. | Failed/denied states use destructive; unknown/unchecked/setup states use attention; verified affirmative states use success. Preserve distinctions between configuration, reachability and effect confirmation. | Part 2 |
| C11 | Notification and reflection panels render successful notices and errors using warning-coloured text. Other pages use Alert, FieldError or plain paragraphs. | Use one feedback convention: FieldError for field problems, Alert for relevant failures/warnings, and accessible saved/status text for successful local changes. Do not show success as a warning. | Part 2 |
| C12 | ReasoningText and the CSS agent-progress grid derive from AgentUI. Feed rotates unrelated joke phrases while displaying activity. Trace is already present for agent events. | Prefer the native shadcn Trace/reasoning composition with accurate short activity labels. Remove the separate decorative skin/phrase rotation if it adds no necessary behaviour. Preserve actual lifecycle semantics, reduced motion and screen-reader status; never invent hidden reasoning. | Part 2 |
| C13 | Composer has a custom mention list with a raw option button, alongside shared InputGroup controls. The hidden file input is intentional. | Align mention options with shared selection styling while preserving text-entry focus, caret insertion, IME behaviour, keyboard navigation and attachment handling. Do not replace the mention interaction wholesale unless the replacement preserves those contracts. Keep the hidden file input. | Part 2 |
| C14 | App library cards and provider lists use bespoke CSS surfaces. Approvals, receipts, result viewers and activity traces each define related payload blocks. | Reuse shared Card, Table, Collapsible and code/payload presentation where the semantics match. Keep Work rows and domain-specific evidence composition. Preserve exact payloads and diffs; syntax highlighting is optional. | Parts 2–3 |
| C15 | Overlays have caller-specific widths, padding, scrolling and action layouts. Conversation context uses full viewport width below 1180 px; other settings sheets use 560 px. | Define bounded desktop sheet/dialog treatment, phone detail treatment, consistent titles/Close/Back/actions and focus return. Preserve wide contextual inspectors. | Part 2 |
| C16 | Eight native details sites coexist with Collapsible. Not every disclosure needs replacement. A classic shell remains reachable through a query option, with legacy CSS. | Reconcile visible disclosure styling with Collapsible or record a native-semantic exception. Include the reachable classic shell in the consistency pass; do not silently remove it or certify its old styles. | Part 2 |
| C17 | Typography, card padding and control surfaces are set in both shared components and legacy/page CSS. Settings applies descendant overrides; library and provider metadata use separate sizing conventions. | Apply the existing design contract once through components/tokens. Retain layout-only page rules. Remove only superseded visual rules after checking callers, including compatibility views. | Part 2 |
| C18 | Status, empty, loading, errors, disabled controls and long content vary even on screens already importing native primitives. | Complete state-by-state visual and keyboard review across every inventory row. Reusing a component name alone is not acceptance. Preserve functionality and diagnostic truth. | Parts 2–3 |

Primary evidence: [model selector](../../apps/desk/src/components/ui/model-selector.tsx), `NativeSelect` (retired under OA-404), [InputGroup](../../apps/desk/src/components/ui/input-group.tsx), [SettingsLayout](../../apps/desk/src/components/SettingsLayout.tsx), [Login](../../apps/desk/src/components/Login.tsx), [ComputerView](../../apps/desk/src/components/ComputerView.tsx), [LedgerView](../../apps/desk/src/components/LedgerView.tsx), [McpInteractionCard](../../apps/desk/src/components/McpInteractionCard.tsx), [AppLibraryPage](../../apps/desk/src/components/AppLibraryPage.tsx), [AppsPanel](../../apps/desk/src/components/AppsPanel.tsx), [McpPanel](../../apps/desk/src/components/McpPanel.tsx), [PermissionGrid](../../apps/desk/src/components/PermissionGrid.tsx), [Feed](../../apps/desk/src/components/Feed.tsx), `ReasoningText` (retired), [RoomView](../../apps/desk/src/components/RoomView.tsx), and [global styles](../../apps/desk/src/styles.css).

## Source-site totals outside shared UI

| Element | Sites | Disposition |
| --- | ---: | --- |
| button | 19 | Migrate ordinary actions; preserve mention-option behaviour while using shared styling |
| input | 11 | 7 ordinary/check fields, 1 hidden file picker, 3 avatar radio source sites; classify by interaction before replacing |
| select | 7 | Migrate single selects; preserve schema-generated multi-select and unset semantics |
| textarea | 1 | Migrate Login to shared Textarea |
| label | 19 | Reconcile visible form composition; semantic or screen-reader-only labels are valid |
| table | 2 | Recompose Ledger and permissions with shared Table without changing table semantics |
| details | 8 | Use shared Collapsible where appropriate; record valid native disclosures explicitly |

These totals do not include hand-styled spans, cards or links. Those are covered separately in the matrix and source inventory. Raw HTML inside a shared shadcn implementation is expected.

## Allowed product-specific composition

These retained exception classes were checked at their shared-control boundaries; they do not allow an independent ordinary-control skin.

| Element | Why it may remain custom | Required shared treatment |
| --- | --- | --- |
| Agent avatar renderer, editor preview and brand marks | OpenAg-specific graphics and identity; generic Avatar does not reproduce the feature | Shared surrounding forms, focus, selection, spacing, motion preferences and feedback; preserve artwork/licences |
| Hidden attachment file input | Browser file-picker mechanism | Invoked by shared Button; no competing visible input style; preserve accessible label and upload limits |
| Avatar swatch and shape radios | Visual selection targets represent artwork/colour rather than ordinary text options | Prefer native shadcn RadioGroup when it preserves interaction; otherwise document native-radio semantics, shared focus/selection and phone targets |
| Mentions, sidebar ordering and computer viewer | Specialised text insertion, reorder or remote-control behaviour | Shared controls and overlays; retain keyboard alternatives, permission and takeover boundaries |
| Work, action receipts, server interactions, saved results and provenance | Domain-specific content, not primitive widgets | Compose from shared primitives; preserve exact evidence and domain meanings |
| Semantic HTML, plain text/code and disclosure | Appropriate native semantics can be simpler than an abstraction | No separate control skin; long content, keyboard and accessible states must remain usable |
| Classic shell | Existing reachable compatibility view | Apply shared visual primitives; no removal without separate authority |

## Completion gate for Part 2

1. Account for every production module below and any newly added UI module. Mark it migrated, reconciled or a justified retained exception, with evidence. Every row below has an explicit disposition; source and browser evidence remain distinct.
2. Ordinary visible controls use shared native shadcn components. Borrowed patterns use the same controls/tokens. No independent Cuelark/AgentUI skin remains.
3. Re-run a scoped source-site inventory. Every remaining raw interactive element or custom status/control treatment has a recorded reason and verification. Do not demand zero native HTML or remove valid semantics for a count.
4. Verify matching model/effort styling in agent creation, settings and room routing. Verify ordinary and compact control variants on pages and inside overlays without ancestor-specific repairs.
5. Review desktop, intermediate and phone widths; light/dark/system themes; keyboard entry/exit; reduced motion; long labels; and empty/loading/disabled/error/success/uncertain states. Preserve at least 44 px phone hit targets for ordinary controls.
6. Verify hidden/advanced routes and dialogs, including Login, Ledger, provider interactions and classic compatibility, rather than only the main pages.
7. Verify external behaviour through the agreed isolated-daemon browser seam. No unit tests or Jest. Run applicable builds and knowledge-delivery checks when implementation changes ship; do not claim those checks from this document-only audit.
8. Preserve authentication, policy, review versions, credential handling, exact action payloads, typed form values, takeover locks, drafts and existing data. Restyling must not grant authority or retry operations.

## Official references checked

- [Button](https://ui.shadcn.com/docs/components/base/button)
- [Native Select](https://ui.shadcn.com/docs/components/base/native-select)
- [Combobox](https://ui.shadcn.com/docs/components/base/combobox)
- [Model selector pattern](https://ui.shadcn.com/docs/ai-elements/base/model-selector)
- [Trace](https://ui.shadcn.com/docs/components/base/trace)

The CLI resolves primitive documentation; the model selector is an AI Elements composition rather than an installable primitive under that name. Prefer the installed preset and APIs, not an unreviewed wholesale upstream overwrite.

## Full source inventory

The following tables record the current disposition. Per-module source, native imports, controlled view families and applicable checks are in the linked OA-409 source audit. Rendered family coverage does not certify every conditional live state.

### Shared UI modules (36)

| Source | Intended disposition | Verification |
| --- | --- | --- |
| [alert](../../apps/desk/src/components/ui/alert.tsx) | Retain native Alert; reconcile plain warning-coloured errors and feedback. | Reconciled native composition — shared native primitive; OA-409 scope and evidence. |
| [attachment](../../apps/desk/src/components/ui/attachment.tsx) | Official Base UI Attachment primitive; composer uses its media/content/actions composition. | Corrected native composition — shared native primitive; OA-409 scope and evidence. |
| [badge](../../apps/desk/src/components/ui/badge.tsx) | Retain semantic variants; migrate custom pills and correct callers by state. | Reconciled native composition — shared native primitive; OA-409 scope and evidence. |
| [bubble](../../apps/desk/src/components/ui/bubble.tsx) | Retain native Bubble composition; safe formatted content remains Part 1. | Reconciled native composition — shared native primitive; OA-409 scope and evidence. |
| [button](../../apps/desk/src/components/ui/button.tsx) | Retain native Button; reconcile regular/compact sizes, hit targets and callers. | Reconciled native composition — shared native primitive; OA-409 scope and evidence. |
| [card](../../apps/desk/src/components/ui/card.tsx) | Retain native Card; reconcile custom feature surfaces and density. | Reconciled native composition — shared native primitive; OA-409 scope and evidence. |
| [checkbox](../../apps/desk/src/components/ui/checkbox.tsx) | Retain native Checkbox; migrate acknowledgement fields without changing consent. | Reconciled native composition — shared native primitive; OA-409 scope and evidence. |
| [collapsible](../../apps/desk/src/components/ui/collapsible.tsx) | Retain native Collapsible; assess native disclosure exceptions. | Reconciled native composition — shared native primitive; OA-409 scope and evidence. |
| [code-block](../../apps/desk/src/components/ui/code-block.tsx) | Official native CodeBlock surface and scrollable content; no independent payload skins. | Corrected native composition — shared native primitive; OA-409 scope and evidence. |
| [command](../../apps/desk/src/components/ui/command.tsx) | Retain native Command/cmdk composition; reconcile item and input sizing. | Reconciled native composition — shared native primitive; OA-409 scope and evidence. |
| [dialog](../../apps/desk/src/components/ui/dialog.tsx) | Reconcile caller widths, padding, scrolling, actions, motion and focus. | Reconciled native composition — shared native primitive; OA-409 scope and evidence. |
| [drawer](../../apps/desk/src/components/ui/drawer.tsx) | Unmodified shadcn base-nova Drawer (Base UI); used only for the phone sidebar so it closes with a swipe. | Native composition — 20 November 2026 drawer section; `motion` scenario covers the phone swipe. Physical devices and Safari unverified. |
| [dropdown-menu](../../apps/desk/src/components/ui/dropdown-menu.tsx) | Retain native menu; check item grouping, trigger and keyboard behaviour. | Reconciled native composition — shared native primitive; OA-409 scope and evidence. |
| [empty](../../apps/desk/src/components/ui/empty.tsx) | Retain native Empty; reconcile feature empty/loading/error distinctions. | Reconciled native composition — shared native primitive; OA-409 scope and evidence. |
| [field](../../apps/desk/src/components/ui/field.tsx) | Retain Field/FieldLabel/FieldError composition; reconcile ad hoc forms. | Reconciled native composition — shared native primitive; OA-409 scope and evidence. |
| [input-group](../../apps/desk/src/components/ui/input-group.tsx) | Reconcile 32 px default with ordinary controls; preserve composer layout. | Reconciled native composition — shared native primitive; OA-409 scope and evidence. |
| [input](../../apps/desk/src/components/ui/input.tsx) | Retain native Input; reconcile surfaces, size, focus and disabled/error states. | Reconciled native composition — shared native primitive; OA-409 scope and evidence. |
| [input-otp](../../apps/desk/src/components/ui/input-otp.tsx) | Shared pairing-code input used by Login. | Sign-in redesign; desktop, mobile, light and dark rendered states remain unverified. |
| [label](../../apps/desk/src/components/ui/label.tsx) | Retain shared Label; preserve valid semantic and screen-reader-only labels. | Reconciled native composition — shared native primitive; OA-409 scope and evidence. |
| [message-scroller](../../apps/desk/src/components/ui/message-scroller.tsx) | Retain @shadcn/react behaviour; preserve following, anchoring and latest action. | Reconciled native composition — shared native primitive; OA-409 scope and evidence. |
| [marker](../../apps/desk/src/components/ui/marker.tsx) | Native Base Marker separator for the current-visit new-message boundary. | Reconciled native composition — OA-501; evidence. |
| [message](../../apps/desk/src/components/ui/message.tsx) | Retain native Message composition; reconcile identities, typography and timestamps. | Reconciled native composition — shared native primitive; OA-409 scope and evidence. |
| [model-selector](../../apps/desk/src/components/ui/model-selector.tsx) | Use the official grouped DropdownMenu composition in every model caller; search removed by owner request OA-407. | Reconciled native composition — shared native primitive; OA-409 scope and evidence. |
| [select](../../apps/desk/src/components/ui/select.tsx) | Official Base UI Select with shared 44px sizing and grouped options; replaces retired NativeSelect. | Reconciled native composition — shared native primitive; OA-409 scope and evidence. |
| [popover](../../apps/desk/src/components/ui/popover.tsx) | Retain native primitive; reconcile selection/command surfaces and focus. | Corrected native composition — shared native primitive; OA-409 scope and evidence. |
| reasoning-text (retired) | Decorative phrase animation removed; activity remains in native Trace. | Retired — held-turn gateway/browser check replaces its private verifier. |
| [separator](../../apps/desk/src/components/ui/separator.tsx) | Retain native Separator; use where a semantic separator is needed. | Reconciled native composition — shared native primitive; OA-409 scope and evidence. |
| [sheet](../../apps/desk/src/components/ui/sheet.tsx) | Reconcile caller widths, padding, scrolling, actions, motion and focus. | Reconciled native composition — shared native primitive; OA-409 scope and evidence. |
| [sidebar](../../apps/desk/src/components/ui/sidebar.tsx) | Retain native Sidebar; reconcile navigation states, mobile destinations and labels. | Corrected native composition — shared native primitive; OA-409 scope and evidence. |
| [skeleton](../../apps/desk/src/components/ui/skeleton.tsx) | Retain native Skeleton; reconcile loading placeholders. | Reconciled native composition — shared native primitive; OA-409 scope and evidence. |
| [sonner](../../apps/desk/src/components/ui/sonner.tsx) | shadcn Sonner wrapper: popover/border/radius tokens, lucide status icons, and the theme taken from the desk's effective `data-theme` so a manual Light/Dark choice is followed. AutomationsPanel uses it in place of the raw `sonner` Toaster with inline styles. | Source and controlled DOM checks only; rendered light/dark toast comparison remains unverified. |
| [spinner](../../apps/desk/src/components/ui/spinner.tsx) | shadcn base Spinner (`shadcn@4.23.0 add spinner`, unchanged): a `role="status"` "Loading" icon for busy Buttons with `data-icon` and `disabled`. Used by the profile form. | Rendered desktop/phone light/dark busy Save and Upload buttons — 20 November 2026 design findings. |
| [switch](../../apps/desk/src/components/ui/switch.tsx) | Retain native Switch; preserve track dimensions and labelled hit targets. | Reconciled native composition — shared native primitive; OA-409 scope and evidence. |
| [table](../../apps/desk/src/components/ui/table.tsx) | Retain native Table; migrate Ledger/permissions while preserving headers and scrolling. | Reconciled native composition — shared native primitive; OA-409 scope and evidence. |
| [tabs](../../apps/desk/src/components/ui/tabs.tsx) | Retain native Tabs; reconcile tab styles, overflow and selected state. | Reconciled native composition — shared native primitive; OA-409 scope and evidence. |
| [textarea](../../apps/desk/src/components/ui/textarea.tsx) | Retain native Textarea; reconcile ordinary/composer variants and Login. | Reconciled native composition — shared native primitive; OA-409 scope and evidence. |
| [toggle-group](../../apps/desk/src/components/ui/toggle-group.tsx) | Retain native ToggleGroup; migrate matching choice sets without changing selection semantics. | Reconciled native composition — shared native primitive; OA-409 scope and evidence. |
| [toggle](../../apps/desk/src/components/ui/toggle.tsx) | Retain native Toggle; reconcile selected/focus/disabled states. | Reconciled native composition — shared native primitive; OA-409 scope and evidence. |
| [tooltip](../../apps/desk/src/components/ui/tooltip.tsx) | Retain native Tooltip; preserve labels and focus/hover behaviour. | Reconciled native composition — shared native primitive; OA-409 scope and evidence. |
| [trace](../../apps/desk/src/components/ui/trace.tsx) | Retain native Trace; align activity and reasoning presentation with real states. | Reconciled native composition — shared native primitive; OA-409 scope and evidence. |

| [alert-dialog](../../apps/desk/src/components/ui/alert-dialog.tsx) | Official Base UI confirmation primitive, inspected through installed CLI; no Button overwrite. | Reconciled native composition — shared native primitive; OA-409 scope and evidence. |

### Feature and support modules (78)

| Source | Intended disposition | Verification |
| --- | --- | --- |
| [app-library](../../apps/desk/src/app-library.tsx) | Support/entry module: preserve API, auth, events and state boundary; verify visible loading/error wrappers and provider consumers. | Reconciled native composition — support; OA-409 scope and evidence. |
| [app](../../apps/desk/src/app.tsx) | Support/entry module: preserve API, auth, events and state boundary; verify visible loading/error wrappers and provider consumers. | Reconciled native composition — support; OA-409 scope and evidence. |
| [avatar-library](../../apps/desk/src/avatar-library.tsx) | Support/entry module: preserve API, auth, events and state boundary; verify visible loading/error wrappers and provider consumers. | Reconciled native composition — support; OA-409 scope and evidence. |
| [ActivityTrace](../../apps/desk/src/components/ActivityTrace.tsx) | Retain native conversation/Trace; reconcile activity skin, labels, payloads and state; safe formatting is Part 1. | Corrected native composition — conversation; OA-409 scope and evidence. |
| [AppLibraryPage](../../apps/desk/src/components/AppLibraryPage.tsx) | Migrate category select/fields; reconcile cards, header, maintenance controls and installed view. | Corrected native composition — integrations; OA-409 scope and evidence. |
| [ApprovalCard](../../apps/desk/src/components/ApprovalCard.tsx) | Reconcile native review/status/disclosure/payload surfaces; Part 3 simplifies hierarchy without hiding exact proposals. | Corrected native composition — work/evidence; OA-409 scope and evidence. |
| [AppsPanel](../../apps/desk/src/components/AppsPanel.tsx) | Migrate acknowledgement checkbox, feedback and custom status surfaces; preserve reviewed setup/enable consent. | Corrected native composition — integrations; OA-409 scope and evidence. |
| [AttachmentChip](../../apps/desk/src/components/AttachmentChip.tsx) | Reconcile empty/loading/error, actions, rows, panels and results; Part 3 owns workflow hierarchy and evidence. | Corrected native composition — conversation; OA-409 scope and evidence. |
| [AutomationHistory](../../apps/desk/src/components/AutomationHistory.tsx) | Reconcile native forms/tables/history/sheets and disclosures; Part 3 simplifies scheduling and purpose. | Corrected native composition — automations; OA-409 scope and evidence. |
| [AutomationsPanel](../../apps/desk/src/components/AutomationsPanel.tsx) | Reconcile native forms/tables/history/sheets and disclosures; Part 3 simplifies scheduling and purpose. | Corrected native composition — automations; OA-409 scope and evidence. |
| [AutomationsTable](../../apps/desk/src/components/AutomationsTable.tsx) | Reconcile native forms/tables/history/sheets and disclosures; Part 3 simplifies scheduling and purpose. | Reconciled native composition — automations; OA-409 scope and evidence. |
| [AvatarEditor](../../apps/desk/src/components/AvatarEditor.tsx) | Retain specialised graphics; reconcile selector radios, tabs, switches, actions and responsive hit targets. | Verified specialised graphics exception — artwork exception; OA-409 scope and evidence. |
| [AvatarPreview](../../apps/desk/src/components/AvatarPreview.tsx) | Retain product graphics/identity as documented exceptions; reconcile surrounding sizing, labels, motion and theme. | Verified specialised graphics exception — artwork exception; OA-409 scope and evidence. |
| [BotAvatar](../../apps/desk/src/components/BotAvatar.tsx) | Retain product graphics/identity as documented exceptions; reconcile surrounding sizing, labels, motion and theme. | Verified specialised graphics exception — artwork exception; OA-409 scope and evidence. |
| [BotEditor](../../apps/desk/src/components/BotEditor.tsx) | Reconcile forms, section/detail navigation, panels, badges and feedback; Part 1 owns draft protection. | Corrected native composition — agent; OA-409 scope and evidence. |
| [BotModelSettings](../../apps/desk/src/components/BotModelSettings.tsx) | Reconcile every model/effort caller, fields, loading and feedback; retain supported configuration discovery. | Corrected native composition — agent; OA-409 scope and evidence. |
| [BotSettingRow](../../apps/desk/src/components/BotSettingRow.tsx) | Reconcile forms, section/detail navigation, panels, badges and feedback; Part 1 owns draft protection. | Corrected native composition — agent; OA-409 scope and evidence. |
| [BotSettings](../../apps/desk/src/components/BotSettings.tsx) | Reconcile forms, section/detail navigation, panels, badges and feedback; Part 1 owns draft protection. | Corrected native composition — agent; OA-409 scope and evidence. |
| [BrandLogo](../../apps/desk/src/components/BrandLogo.tsx) | Retain product graphics/identity as documented exceptions; reconcile surrounding sizing, labels, motion and theme. | Verified specialised graphics exception — artwork exception; OA-409 scope and evidence. |
| [ClassicShell](../../apps/desk/src/components/ClassicShell.tsx) | Reconcile navigation/selection/menu styling, typography and compatibility; preserve ordering and keyboard alternatives. | Corrected native composition — navigation; OA-409 scope and evidence. |
| [Composer](../../apps/desk/src/components/Composer.tsx) | Reconcile InputGroup and mention options; retain hidden file picker, caret, IME, focus and upload contracts. | Corrected native composition — conversation; OA-409 scope and evidence. |
| [ComposioAccess](../../apps/desk/src/components/ComposioAccess.tsx) | Reconcile connection/consent views, loading/error/status, tabs and dialogs; preserve evidence and initiating-device authority. | Reconciled native composition — integrations; OA-409 scope and evidence. |
| [ComputerView](../../apps/desk/src/components/ComputerView.tsx) | Migrate raw controls/cards/status; unify full/context views; Part 1 owns truthful recovery. | Corrected native composition — operations; OA-409 scope and evidence. |
| [ConnectorAccess](../../apps/desk/src/components/ConnectorAccess.tsx) | Reconcile connection/consent views, loading/error/status, tabs and dialogs; preserve evidence and initiating-device authority. | Corrected native composition — integrations; OA-409 scope and evidence. |
| [ConnectorConnectReturn](../../apps/desk/src/components/ConnectorConnectReturn.tsx) | Reconcile connection/consent views, loading/error/status, tabs and dialogs; preserve evidence and initiating-device authority. | Reconciled native composition — access; OA-409 scope and evidence. |
| [DevicesPage](../../apps/desk/src/components/DevicesPage.tsx) | Reconcile access badges, forms, recovery disclosures and feedback; preserve access and revocation semantics. | Reconciled native composition — access; OA-409 scope and evidence. |
| [DevicesPanel](../../apps/desk/src/components/DevicesPanel.tsx) | Reconcile access badges, forms, recovery disclosures and feedback; preserve access and revocation semantics. | Reconciled native composition — access; OA-409 scope and evidence. |
| [EvidenceBlock](../../apps/desk/src/components/EvidenceBlock.tsx) | Native CodeBlock composition for exact payload text across approvals, receipts, activity, Ledger, results and skills. | Corrected native composition — conversation; OA-409 scope and evidence. |
| [AgentRequestsPanel](../../apps/desk/src/components/AgentRequestsPanel.tsx) | Shared Badge, Button, Alert and RequestDetails sheet; feature classes own layout only. | OA-465 source coverage; original compiled browser coverage recorded below. |
| [Feed](../../apps/desk/src/components/Feed.tsx) | Retain native conversation/Trace; reconcile activity skin, labels, payloads and state; safe formatting is Part 1. | Corrected native composition — conversation; OA-409 scope and evidence. |
| [HeldBack](../../apps/desk/src/components/HeldBack.tsx) | Migrate feedback action; reconcile list, empty/loading/error and recorded feedback state. | Corrected native composition — automations; OA-409 scope and evidence. |
| [HomeView](../../apps/desk/src/components/HomeView.tsx) | Reconcile empty/loading/error, actions, rows, panels and results; Part 3 owns workflow hierarchy and evidence. | Corrected native composition — work/evidence; OA-409 scope and evidence. |
| [Icon](../../apps/desk/src/components/Icon.tsx) | Retain product graphics/identity as documented exceptions; reconcile surrounding sizing, labels, motion and theme. | Verified specialised graphics exception — artwork exception; OA-409 scope and evidence. |
| [InboxView](../../apps/desk/src/components/InboxView.tsx) | Reconcile empty/loading/error, actions, rows, panels and results; Part 3 owns workflow hierarchy and evidence. | Reconciled native composition — work/evidence; OA-409 scope and evidence. |
| [IntegrationDetails](../../apps/desk/src/components/IntegrationDetails.tsx) | Reconcile connection/consent views, loading/error/status, tabs and dialogs; preserve evidence and initiating-device authority. | Corrected native composition — integrations; OA-409 scope and evidence. |
| [IntegrationSetup](../../apps/desk/src/components/IntegrationSetup.tsx) | Migrate acknowledgement checkbox, feedback and custom status surfaces; preserve reviewed setup/enable consent. | Corrected native composition — integrations; OA-409 scope and evidence. |
| [LedgerView](../../apps/desk/src/components/LedgerView.tsx) | Migrate controls, filters, Table, badges and detail surfaces; preserve export and exact evidence. | Corrected native composition — work/evidence; OA-409 scope and evidence. |
| [Login](../../apps/desk/src/components/Login.tsx) | Migrate raw actions/fields/errors; preserve pairing, host/legacy sign-in and invite contracts. | Corrected native composition — access; OA-409 scope and evidence. |
| [Logo](../../apps/desk/src/components/Logo.tsx) | Retain product graphics/identity as documented exceptions; reconcile surrounding sizing, labels, motion and theme. | Verified specialised graphics exception — artwork exception; OA-409 scope and evidence. |
| [McpInteractionCard](../../apps/desk/src/components/McpInteractionCard.tsx) | Migrate schema-driven fields; preserve typed choices, multi-selection, unset values, expiry and response meaning. | Corrected native composition — work/evidence; OA-409 scope and evidence. |
| [McpPanel](../../apps/desk/src/components/McpPanel.tsx) | (OA-454: now also hosts McpServerSettings, McpServerDialog and McpServerCheck, built from installed shadcn Dialog, AlertDialog, Field, Switch, Input, Alert, Badge and Button with no custom styling beyond layout; ApprovalCard reused for the check.) Reconcile feedback and reachable maintenance views; assess unscoped custom status pill without claiming it is always visible. | Corrected native composition — integrations; OA-409 scope and evidence. |
| [McpOAuthSettings](../../apps/desk/src/components/McpOAuthSettings.tsx) | (OA-457: sign-in section of a custom server; built from installed shadcn Alert, Badge, Button, Field and Input with no custom styling beyond layout.) Checked in jsdom against the real gateway and a fake authorization server by `scripts/verify-mcp-desk.mjs`; no browser, 390 px or screen-reader check. | Corrected native composition — integrations; jsdom evidence only. |
| [McpServerSettings](../../apps/desk/src/components/McpServerSettings.tsx) | (OA-454/OA-455: part of the custom MCP server management UI; built from installed shadcn Dialog, AlertDialog, Field, Input, Switch, Alert, Badge and Button with no custom styling beyond layout.) Checked in jsdom against the real gateway by `scripts/verify-mcp-desk.mjs`; no browser, 390 px or screen-reader check. | Corrected native composition — integrations; jsdom evidence only. |
| [McpServerDialog](../../apps/desk/src/components/McpServerDialog.tsx) | (OA-454/OA-455: part of the custom MCP server management UI; built from installed shadcn Dialog, AlertDialog, Field, Input, Switch, Alert, Badge and Button with no custom styling beyond layout.) Checked in jsdom against the real gateway by `scripts/verify-mcp-desk.mjs`; no browser, 390 px or screen-reader check. | Corrected native composition — integrations; jsdom evidence only. |
| [McpServerCheck](../../apps/desk/src/components/McpServerCheck.tsx) | (OA-454/OA-455: part of the custom MCP server management UI; built from installed shadcn Dialog, AlertDialog, Field, Input, Switch, Alert, Badge and Button with no custom styling beyond layout.) Checked in jsdom against the real gateway by `scripts/verify-mcp-desk.mjs`; no browser, 390 px or screen-reader check. | Corrected native composition — integrations; jsdom evidence only. |
| [McpCommandDialog](../../apps/desk/src/components/McpCommandDialog.tsx) | (OA-456: add or edit a local command; built from installed shadcn Dialog, Field, Input, Textarea, Switch, Alert and Button with no custom styling beyond layout; the inline review reuses ApprovalCard. Checked in jsdom against the real gateway: review card contents, cancel, approve, edit-drops-proposal, write-only secret fields. No browser, 390 px or screen-reader check.) | Corrected native composition — integrations; jsdom evidence only, see OA-456 Log. |
| [MemoryPage](../../apps/desk/src/components/MemoryPage.tsx) | Reconcile forms, section/detail navigation, panels, badges and feedback; Part 1 owns draft protection. | Corrected native composition — agent; OA-409 scope and evidence. |
| [ModelsPage](../../apps/desk/src/components/ModelsPage.tsx) | Reconcile provider rows/cards, status variants and setup feedback; preserve configuration/evidence distinctions. | Corrected native composition — operations; OA-409 scope and evidence. |
| [NewBotSheet](../../apps/desk/src/components/NewBotSheet.tsx) | Reconcile every model/effort caller, fields, loading and feedback; retain supported configuration discovery. | Reconciled native composition — agent; OA-409 scope and evidence. |
| [NewRoomSheet](../../apps/desk/src/components/NewRoomSheet.tsx) | Reconcile room headers, sheets, tabs, forms and status; preserve direct chat versus room identity. | Reconciled native composition — rooms; OA-409 scope and evidence. |
| [NotificationsPanel](../../apps/desk/src/components/NotificationsPanel.tsx) | Reconcile native forms and success/error feedback; preserve notification/proposal authority. | Corrected native composition — automations; OA-409 scope and evidence. |
| [OpsPanel](../../apps/desk/src/components/OpsPanel.tsx) | Reconcile state/feedback/forms/disclosures; preserve setup limitations, device and operational authority. | Reconciled native composition — operations; OA-409 scope and evidence. |
| [OwnerPanel](../../apps/desk/src/components/OwnerPanel.tsx) | Reconcile access badges, forms, recovery disclosures and feedback; preserve access and revocation semantics. | Reconciled native composition — access; OA-409 scope and evidence. |
| [PermissionGrid](../../apps/desk/src/components/PermissionGrid.tsx) | Use shared Table/Badge/feedback; preserve locked modes, reset semantics and responsive permissions. | Corrected native composition — agent; OA-409 scope and evidence. |
| [ProactiveCard](../../apps/desk/src/components/ProactiveCard.tsx) | Reconcile shared headings/cards/form sizes/tabs and feedback; remove caller-dependent visual repairs. | Reconciled native composition — automations; OA-409 scope and evidence. |
| [ProactivePage](../../apps/desk/src/components/ProactivePage.tsx) | Reconcile shared headings/cards/form sizes/tabs and feedback; remove caller-dependent visual repairs. | Reconciled native composition — automations; OA-409 scope and evidence. |
| [ProactiveDestination](../../apps/desk/src/components/ProactiveDestination.tsx) | Shared message destination selector and save. | Native ProactiveCard/CardFooter, Field/SelectField, Alert and Skeleton. OA-487 records rendered coverage and routing acceptance. |
| [TranscriptViewport](../../apps/desk/src/components/TranscriptViewport.tsx) | Shared MessageScrollerViewport with reading-anchor restore; no independent control skin. | OA-488 rendered direct/room desktop/phone evidence above. |
| [Conversation history](../../apps/desk/src/conversation-history.tsx) | Session-only history provider and hooks; no visible controls. | OA-488 gateway/browser transcript acceptance above. |
| [ProactiveSources](../../apps/desk/src/components/ProactiveSources.tsx) | Service selection, account coverage, semantic badges and check evidence. | Source reconciled with native fields, Checkbox, Badge and Disclosure; mounted gateway coverage in OA-483 section above. Rendered phone/desktop coverage is recorded in OA-484 evidence. |
| [ReadinessPanel](../../apps/desk/src/components/ReadinessPanel.tsx) | Reconcile state/feedback/forms/disclosures; preserve setup limitations, device and operational authority. | Reconciled native composition — operations; OA-409 scope and evidence. |
| [ReasoningFields](../../apps/desk/src/components/ReasoningFields.tsx) | Reconcile every model/effort caller, fields, loading and feedback; retain supported configuration discovery. | Reconciled native composition — agent; OA-409 scope and evidence. |
| [ReceiptView](../../apps/desk/src/components/ReceiptView.tsx) | Reconcile native review/status/disclosure/payload surfaces; Part 3 simplifies hierarchy without hiding exact proposals. | Corrected native composition — work/evidence; OA-409 scope and evidence. |
| [ReflectionPanel](../../apps/desk/src/components/ReflectionPanel.tsx) | Reconcile native forms and success/error feedback; preserve notification/proposal authority. | Corrected native composition — automations; OA-409 scope and evidence. |
| [ResponsibilitiesPanel](../../apps/desk/src/components/ResponsibilitiesPanel.tsx) | Reconcile native forms/tables/history/sheets and disclosures; Part 3 simplifies scheduling and purpose. | Corrected native composition — automations; OA-409 scope and evidence. |
| [ResultsPanel](../../apps/desk/src/components/ResultsPanel.tsx) | Reconcile empty/loading/error, actions, rows, panels and results; Part 3 owns workflow hierarchy and evidence. | Corrected native composition — work/evidence; OA-409 scope and evidence. |
| [RoomRail](../../apps/desk/src/components/RoomRail.tsx) | Reconcile room headers, sheets, tabs, forms and status; preserve direct chat versus room identity. | Corrected native composition — rooms; OA-409 scope and evidence. |
| [RoomRoutingPanel](../../apps/desk/src/components/RoomRoutingPanel.tsx) | Reconcile every model/effort caller, fields, loading and feedback; retain supported configuration discovery. | Corrected native composition — rooms; OA-409 scope and evidence. |
| [RoomSettings](../../apps/desk/src/components/RoomSettings.tsx) | Reconcile room headers, sheets, tabs, forms and status; preserve direct chat versus room identity. | Reconciled native composition — rooms; OA-409 scope and evidence. |
| [RoomView](../../apps/desk/src/components/RoomView.tsx) | Reconcile room headers, sheets, tabs, forms and status; preserve direct chat versus room identity. | Reconciled native composition — rooms; OA-409 scope and evidence. |
| [RtcPanel](../../apps/desk/src/components/RtcPanel.tsx) | Reconcile state/feedback/forms/disclosures; preserve setup limitations, device and operational authority. | Corrected native composition — operations; OA-409 scope and evidence. |
| [RtcUnreachable](../../apps/desk/src/components/RtcUnreachable.tsx) | New OA-306 state: native Alert plus default/outline Buttons; layout matches the Login shell. | Native composition — connectivity; OA-306 section below. |
| [SchedulePanel](../../apps/desk/src/components/SchedulePanel.tsx) | Reconcile shared headings/cards/form sizes/tabs and feedback; remove caller-dependent visual repairs. | Corrected native composition — automations; OA-409 scope and evidence. |
| [SectionViews](../../apps/desk/src/components/SectionViews.tsx) | Reconcile shared headings/cards/form sizes/tabs and feedback; remove caller-dependent visual repairs. | Reconciled native composition — navigation; OA-409 scope and evidence. |
| [SettingsLayout](../../apps/desk/src/components/SettingsLayout.tsx) | Reconcile shared headings/cards/form sizes/tabs and feedback; remove caller-dependent visual repairs. | Corrected native composition — operations; OA-409 scope and evidence. |
| [SettingsView](../../apps/desk/src/components/SettingsView.tsx) | Reconcile shared headings/cards/form sizes/tabs and feedback; remove caller-dependent visual repairs. | Corrected native composition — operations; OA-409 scope and evidence. |
| [Shell](../../apps/desk/src/components/Shell.tsx) | Reconcile navigation/selection/menu styling, typography and compatibility; preserve ordering and keyboard alternatives. | Corrected native composition — navigation; OA-409 scope and evidence. |
| [SidebarList](../../apps/desk/src/components/SidebarList.tsx) | Reconcile navigation/selection/menu styling, typography and compatibility; preserve ordering and keyboard alternatives. | Reconciled native composition — navigation; OA-409 scope and evidence. |
| [SkillsPanel](../../apps/desk/src/components/SkillsPanel.tsx) | Reconcile forms, section/detail navigation, panels, badges and feedback; Part 1 owns draft protection. | Corrected native composition — agent; OA-409 scope and evidence. |
| [SlackPanel](../../apps/desk/src/components/SlackPanel.tsx) | Reconcile state/feedback/forms/disclosures; preserve setup limitations, device and operational authority. | Corrected native composition — integrations; OA-409 scope and evidence. |
| [WebPushSection](../../apps/desk/src/components/WebPushSection.tsx) | Web Push for this device and (owner/Full) the installation: native Badge, Button, Switch, Field/Input, Alert. | Native composition — notifications; Web Push section below. |
| [WorkView](../../apps/desk/src/components/WorkView.tsx) | Reconcile empty/loading/error, actions, rows, panels and results; Part 3 owns workflow hierarchy and evidence. | Corrected native composition — work/evidence; OA-409 scope and evidence. |
| [main](../../apps/desk/src/main.tsx) | Support/entry module: preserve API, auth, events and state boundary; verify visible loading/error wrappers and provider consumers. | Reconciled native composition — support; OA-409 scope and evidence. |
| [stream](../../apps/desk/src/stream.tsx) | Support/entry module: preserve API, auth, events and state boundary; verify visible loading/error wrappers and provider consumers. | Reconciled native composition — support; OA-409 scope and evidence. |

| [MessageText](../../apps/desk/src/components/MessageText.tsx) | Retain safe Markdown, bounded code/tables and existing theme. | Corrected native composition — conversation; OA-409 scope and evidence. |
| [NavigationDialogs](../../apps/desk/src/components/NavigationDialogs.tsx) | One route-independent native confirmation/operation host. | Reconciled native composition — navigation; OA-409 scope and evidence. |
| [Disclosure](../../apps/desk/src/components/Disclosure.tsx) | Shared native disclosure with mounted children and readable long titles. | Reconciled native composition — navigation; OA-409 scope and evidence. |

## Part 1 inventory delta

OA-397 adds `apps/desk/src/components/MessageText.tsx` as a safe presentation component using the existing desk theme. The baseline above remains the pre-migration inventory; Part 2 must include this additional production module and recheck the current tree. Part 1 does not complete the native-component migration.

| [ChatModelSettings](../../apps/desk/src/components/ChatModelSettings.tsx) | Composer model/effort controls share the existing model configuration contract. | Reconciled native composition — conversation; OA-409 scope and evidence. |

## Part 3A follow-up

OA-410 reconciles Work list density and detail hierarchy using the same native Card, Badge, Button and Disclosure primitives. No new production TSX module or specialised source exception is introduced. See Work coverage.

OA-411 changes approval content order and request labels using existing native Card/Disclosure/Badge parts. Exact review and typed schema interactions retain their contracts. Coverage. Production inventory remains unchanged.

OA-412 separates receipt decision/outcome and groups metadata using native Card/Badge/Alert/Disclosure/Field parts. Unknown inspection retains its exact policy and draft protection; legacy and no-Work receipts stay truthful. Coverage and limits. No new production module or exception.

OA-413 separates integration discovery and management with native Card/Dialog/Tab/Button compositions and additive selected-detail links. No new production TSX module or specialised exception. Coverage.

### OA-414/OA-415 — integration setup and account controls

IntegrationSetup retains Field/Checkbox/Textarea/Button/Disclosure for reviewed local setup; package details and rollback are secondary. ConnectorAccess/ComposioAccess use the installed AlertDialog composition for destructive disconnect, with safe initial/cancel/success focus. Callback return keeps a native Dialog and dismisses without awaiting network. No new competing control skin or production TSX module. OA-414 evidence and OA-415 evidence record responsive/theme, keyboard, controlled setup/account checks and limits.

### OA-416 — integration maintenance and failure-state closeout

AppLibraryPage, IntegrationDetails, IntegrationSetup, AppsPanel, McpPanel, ConnectorAccess, ComposioAccess and ConnectorConnectReturn retain installed native shadcn compositions. Maintenance and technical details use Disclosure; stale state uses attention Badge/Alert, with no fresh success claim. Account and setup actions keep explicit decision controls; generic footer copy and its unused CSS are removed. No production module was added; the 111-row inventory remains accounted for. OA-416 evidence includes 60 responsive/theme screenshots, Full/Limited and failed-read recovery, controlled real-gateway checks and known limits. Part 3B is delivered locally; live provider/deployment/device/screen-reader acceptance remains separate.

### Connection action icons — 4 November 2026

ConnectorAccess uses Lucide Check for Apple/Google read checks, Pause for pausing and Play for resuming, with the shared Button inline-start icon treatment. Desk build and shipped integration gateway check passed; CUA verified the Google check/pause/resume icons and scoped pause/resume. Help needs no change: these are decorative icons and the labels, actions and access rules are unchanged. Existing Vite chunk warning remains; no unit runners or live providers used.

### OA-417 — prospective automation timing

AutomationsPanel keeps native Field/Select/Checkbox/Button/Alert composition and adds daemon-derived schedule evidence, without a browser cron implementation or new TSX module. Current 111-module inventory passes. OA-417 evidence records 18 responsive/theme captures, keyboard and controlled real-gateway timing/save/race assertions; live-device/provider/scheduling acceptance remains separate.

### OA-418 — proactive choices

SchedulePanel/ProactivePage keep shared native cards, independent FieldSet/Field/Select/Switch/ToggleGroup saves, with checking frequency, proactive-alert hours/limits and morning brief grouped by owner choices. Existing drafts, value semantics and uncertain-save behavior are preserved. Automations uses Agent and purpose copy. OA-418 evidence records 24 responsive/theme captures, keyboard and real-gateway separate-save/lost-response coverage; 111-module inventory unchanged. Legacy Settings joined-flow Work expectation is recorded as a verification limit.

### OA-419 — secondary model diagnostics

BotModelSettings retains shared native selectors/save actions and collapses exact saved/requested/report evidence behind Disclosure. Report provenance uses semantic definition lists and shared stale-status Badge, with no inference from selection. ModelsPage setup copy follows current agent/chat configuration. No new production TSX module; inventory remains111. OA-419 evidence records 18 responsive/theme captures, keyboard and controlled shipped-gateway/model regression coverage and limits.

### OA-420 — navigation and final Part 3C closeout

Shell/ClassicShell, SettingsLayout/SectionViews, ProactivePage, AutomationsPanel/AutomationHistory and RoomView/BotSettings retain native Button/Tab/Sheet/Alert compositions. Automations has one Workspace identity; compatible tab/editor/run/panel URLs restore context without placing drafts in addresses. Same-context children remain mounted, while real exits keep the asynchronous leave guard. Both shells expose Skip to content. Creation waits for valid inventory and an available agent. No new production module or specialised exception; the current 111-row inventory passes. OA-420 evidence records 48 responsive/theme captures, keyboard/focus/reload/Back, controlled real-gateway regressions and known limits. Part 3C is delivered locally through OA-417–OA-420; live provider, deployment, physical-device and screen-reader acceptance remain separate.


## OA-434 request inspector — 4 November 2026

RequestDetails composes the installed Base UI Sheet (title/description/close), shared Disclosure, Badge, Skeleton, Alert, Empty and EvidenceBlock. ActivityTrace retains the existing Trace composition. Feature classes control layout; no competing control skins or new motion/dependency were added.

Compiled desk → real temporary gateway → controlled Ollama request → retained trace → inspector was exercised in the browser at the existing 1280×720 viewport and at 390×844. Summary and expanded Context states fit the sheet; the mobile sheet uses the shared scrolling region, and Escape returns focus to the Request details trigger. Viewport override was reset. Screenshot: `$HOME/.codex/visualizations/2026/11/03/01a1a32e-fdd1-7121-ae76-626d132abbac/request-provenance-mobile.png`.

The standalone desk/gateway journey additionally checks collapsed technical metadata, cross-device refresh, failed read clearing stale details, Retry without model dispatch, and historical Not recorded. These are automated DOM checks, not physical-phone or screen-reader acceptance. Real hosted-provider access is separate from this component audit.


| Before | After | Why |
| --- | --- | --- |
| Turn activity had no request inspector. | A compact Request details trigger opens the shared Sheet; context, attempts, receipts and technical metadata expand separately. | Keep ordinary conversation concise and make private diagnostics deliberate. |

Final compiled-bundle recheck used a fresh disposable gateway at `http://127.0.0.1:57588/#/room/main`: two-attempt grouping, Context expansion, actual mobile scrolling, Not recorded, and Escape focus return were observed. The viewport was reset and the preview was left open for owner review. Final artifacts in the same visualization folder: `request-provenance-desktop-final.png`, `request-provenance-mobile-final.png`, `request-provenance-empty-final.png`. The 51-step pagination/refresh case is verified through the actual component/gateway standalone journey.
## OA-432 composer dictation — 4 November 2026

Official Base UI InputGroup, Button, Field and Badge compositions were read through shadcn CLI documentation. Dictation reuses installed InputGroupButton variants (including shared 44px phone minimums), FieldGroup/Field/SelectField and SettingsSection. No private control skin or ancestor styling was added. Badges use secondary Off, success Configured, attention Needs setup; current errors use Alert.

Reachable controlled states: idle, starting permission, recording/Stop/Cancel, transcribing/Cancel, existing draft and concurrent edits, denied permission, late permission resolution, canceled result and repeated dictation are covered by the shipped-desk verifier. Chrome visual inspection covered dark desktop composer, recording/Stop/Cancel and preserved draft, Models enabled and saved Off states, native selector keyboard interaction, and dark/light 390px emulated settings/composer controls. The full-access phone recording row was also checked; its crowded inline status was moved to a separate InputGroupAddon line, then capture/Cancel was rechecked with clear icon spacing. Native local-provider selection picked LFM3-Omni and saved by readback. All new controls stayed within the composer/card at those views. Current full-device model controls were visually checked beside the microphone and recording controls; their implementation is unchanged. The initial minimal fixture had no chat model catalogue; the final fixture uses real bot-model state and has no Work runtime. Its unrelated Work 503 is not a production finding.

Local microphone capture reached Ollama and inserted a response, but the spoken test phrase was not recognized faithfully; recognition accuracy is unverified. Synthetic OpenAI/local-provider transcription was separately checked. Desktop light theme, physical Safari/phone and screen readers remain unverified. This is scoped coverage, not a blanket desk consistency claim.

| Module | Disposition | Verification |
| --- | --- | --- |
| [DictationSettings.tsx](../../apps/desk/src/components/DictationSettings.tsx) | SettingsSection, FieldGroup, Field, SelectField, Button, Badge and Alert; no raw controls | OA-432 dark desktop/390px form and native select/save; controlled settings API |

## OA-433 empty-composer dictation status — 4 November 2026

Composer keeps the installed InputGroup/InputGroupTextarea composition. Only the native textarea is inside a feature-owned grid; the noninteractive, aria-hidden prompt label shares its grid cell. Attachments remain in their existing preceding InputGroupAddon and the direct block-end toolbar continues to own column layout and height. The one existing active-dictation status remains mounted in its own addon through empty/nonempty draft changes, switching to `sr-only` rather than adding a second live region. The scoped opacity-only prompt animation follows the existing 1.2-second activity cadence and has an explicit reduced-motion override.

The controlled built-desk verifier has source coverage for Starting/Recording/Transcribing labels, a blank native placeholder and one live status when overlayed, prompt removal/restoration while typing or clearing, empty-to-filled transcript insertion, preserved attachment and Cancel/error restoration. Source-token contrast at the 0.65 minimum opacity is 6.31:1 on white and 6.95:1 on the conservative dark surface; it is a calculation, not browser measurement. Rendered CUA Chrome inspection at actual port 4750 verified dark desktop and dark/light 390px empty recording placement with no extra row or toolbar overlap, click-through textarea focus, typed/cleared drafts, Cancel restoration and emulated reduced-motion static feedback. Browser emulation was restored and preview left idle. Starting/Transcribing and attachment/error cases are covered by the controlled built-desk verifier. Physical Safari/phone, screen-reader use and slow-motion frame inspection remain unverified; this is scoped coverage.

## OA-430 compact reasoning icon shape — 4 November 2026

`ReasoningFields` now selects the shared Field horizontal orientation for compact composer controls. The default vertical Field variant applies `*:w-full`, which overrode the native icon button width inside an auto-width field and squeezed it into an oval. Horizontal orientation lets the native InputGroupButton own its square dimensions; no glyph, private sizing rule or shared primitive changed. Noncompact settings/creation/routing fields remain vertical. Actual port-4750 Chrome inspection confirmed a round centered reasoning icon aligned with the adjacent CPU/microphone buttons. Standalone composer/settings checks and the 112-module source inventory pass. Physical phone/Safari geometry was not checked.

## Main merge — permission component inventory

| Module | Disposition | Verification |
| --- | --- | --- |
| [PermissionAdoption.tsx](../../apps/desk/src/components/PermissionAdoption.tsx) | Shared Alert/Field/ToggleGroup/Checkbox/Button and Collapsible composition for archived-rule disclosure | Standalone historical migration/adoption checks; no automatic adoption |
| [PermissionControl.tsx](../../apps/desk/src/components/PermissionControl.tsx) | Shared Dialog, Field, SelectField, ToggleGroup, Checkbox, Badge and Alert | Standalone actual-desk permission controls |

The incoming permission modules were absent from the source inventory. The archived-rule disclosure now uses the installed Collapsible composition to satisfy the existing ordinary-control gate; its text and adoption behavior are unchanged. This is merge reconciliation, not a new permission design or a claim of full visual acceptance.

## OA-431 capability-based model choices — 4 November 2026

DictationSettings retains the installed Field/SelectField/SelectItem/Button/Badge
composition. Menu items now come from cached task-compatible models; empty/loading
and Limited states disable controls. A catalogue-refresh revision disables saving
until matching metadata arrives, retaining the user's draft. The status badge keeps
neutral Off, success Configured and attention Needs setup variants.

Actual CUA Chrome at port 4750 verified dark desktop and 390×844 dictation form and
expanded menu. The real refreshed OpenAI source exposed Whisper and diarization
choices alongside the existing models, with no realtime-only entry. Controls stayed
within the viewport; the existing selected target remained unchanged. Temporary
viewport was reset and the separate inspection tab closed. No setting was saved
through this visual check. Controlled built-desk checks cover selection, refresh draft
retention, explicit save, chat controls and Limited access. Other unchanged model
surfaces retain their earlier composition coverage; physical phone/Safari and screen
reader use are unverified. Final controlled check results are recorded in OA-431.

## OA-448 (implementation label OA-439) — Permission icons

Shared Tabler IconEye / IconShieldCode / IconShieldExclamation accompany existing labels in session/default controls and adoption choices. Native Button/ToggleGroup sizing and accessible names remain unchanged. CUA inspected session390px dark and default900px light. Adoption is covered by the actual controlled desk/adoption check; its new icons were source-reviewed, not separately browser-captured. No live permission writes.

## OA-449 (implementation label OA-440) — Compact composer disclosure

| Module | Composition | Coverage |
| --- | --- | --- |
| [Composer.tsx](../../apps/desk/src/components/Composer.tsx) | Existing InputGroup, menus and permission controls remain mounted. Compact input is one line with Add/Dictate/Send; focus and content disclose the current composition. | CUA390/900/1440 light/dark compact/expanded; pointer150ms measured height; keyboard/reduced instant; draft/menu retention. Controlled built-gateway upload, dictation and model behavior pass. |
| [input-group.tsx](../../apps/desk/src/components/ui/input-group.tsx) | Shared explicit compact sizing preserves inline icons,44px phone targets and overflow-free textarea. | Same matrix; standard size callers unchanged. |
| [RequestDetails.tsx](../../apps/desk/src/components/RequestDetails.tsx) | Retained from current main; shared Sheet/Disclosure/Badge/Skeleton/Alert/Empty/EvidenceBlock, as documented in its earlier narrative audit. | Inventory row reconciled with that existing source audit; not newly browser-audited under OA-440. |

ChatModelSettings publishes actionable child error/catalogue attention separately from execution blocking, so compact presentation never hides recovery. Initial error/readback recovery and clean collapse are verified through the shipped desk/gateway selector check.

## OA-441 — Add placement correction

Compact Add remains at the left edge; text sits between it and right-aligned Dictate/Send. InputGroup layout uses the existing mounted button and semantic controls, with no competing skin. CUA390/900/1440 light/dark checks confirm bounds/alignment and44px phone targets; expanded Add remains left. Native file chooser opens from compact Add..

## OA-442 — Plain composer icons

Composer Add/dictation/stop/cancel/send and compact model/effort triggers use the installed ghost variant. CUA390/900/1440 light/dark compact/expanded checks record fully transparent resting fill/border,44px phone targets and retained Add-left placement. Native keyboard focus shows its3px semantic ring; disabled feedback and hover/open feedback remain owned by Button. Full-size settings selectors retain outline..

## OA-443 — Composer icon legibility

Shared InputGroupButton icon-sm uses24px glyphs and semantic foreground instead of inherited muted text. All actual callers are composer actions/compact model/reasoning controls. CUA12 width/theme/state views confirm24px glyphs, unchanged44px phone/32px compact desktop targets, transparent borders/fills and correct light/dark foreground. Disabled opacity remains50%; enabled Send is100%..

**Superseded 20 November 2026 (owner):** the 24px glyphs looked oversized next to the rest of the desk. `icon-sm` composer buttons are back to the default 16px glyphs. Semantic foreground, 32px desktop and 44px phone targets are unchanged. Rendered desktop-dark and phone-light composer checks confirm all five actions (Attach, Model, Effort, Dictate, Send) at 16px. The composer's inline "Some model sources are unavailable. Refresh models" notice was removed at the owner's request because it shifted the action row. Model refresh stays in Settings → Models, and the controls keep their attention state.

## OA-444 — Matching Send color

Shared ghost submit icon styling retains full opacity when disabled. Native disabled state and dispatch guards are unchanged; non-submit disabled controls still dim. CUA light/dark confirms Add/Dictate/Send share foreground and opacity1 for an empty composer, with Send disabled; typing enables Send without changing its color..

## OA-445 — Bot-panel permissions

Composer no longer renders an agent/mode trigger beneath the input; its shared dialog remains available through `/permission`. BotSettings → Permissions replaces its old redirect paragraph with the existing session control, explicitly bound to the current room/agent and Full-access status from RoomView. CUA checked390px clean expanded composer,1440px bot panel and358px-wide nested phone dialog; shortcut opens one dialog without sending text. Source inventory114 and controlled permission/selector/gateway checks pass..

## OA-446 — Filled Send

Send uses the native primary fill and contrasting foreground again. Other composer icons remain ghost with semantic foreground. Shared icon-sm sizing keeps24px glyphs; its ghost-only color rule lets the primary variant own Send contrast. The superseded ghost-submit opacity exception was removed. CUA empty/ready phone light/dark checks confirm fill/arrow contrast,44px targets and native disabled feedback..

## OA-447 — Compact Send fill

Shared Button icon-primary variant centers a32px decorative circle behind the unchanged24px arrow. Actual Send button remains44px on phones/32px compact desktop, preserving native focus/disabled/hover behavior. No feature skin or reduced touch target. CUA eight390/900 light/dark empty/ready states verify glyph/fill/hit-area sizes, contrast and non-interactive decoration..

## OA-450 — Compact phone text alignment

Shared compact InputGroupTextarea uses10px vertical padding below768px, matching its24px line inside the44px control. Before:48px scroll height and text line2px below icon center. After:44px scroll height and zero center offset. CUA390/900/1440 light/dark verifies compact alignment and unchanged12px expanded/desktop padding..

## OA-452 — existing-room agent picker (4 November 2026)

Room settings now reuses NewRoomSheet’s installed Command/CommandInput/CommandList/CommandItem composition, Field, Button and BotAvatar. Checked actual desktop 1440×1000 and phone 390×844 rendered states in dark/light: idle, selected, existing members disabled, search-empty, saved, and permission error with draft retained. No new control skins or audited exceptions. Browser evidence and coverage limits.

## OA-453 — room field order (4 November 2026)

Moved Lead above Add agents with the existing Field/Select/Command compositions unchanged. Viewed rendered desktop 1440×1000 and phone 390×844 states, and asserted Lead’s top coordinate precedes the search input. Desktop, phone. Desk build passes. Knowledge requires no update: this changes only field order, with no change to labels, help steps or behavior.

## OA-459 reflection memory — 5 November 2026

ReflectionPanel changes explanatory copy and labels memory counts as notes. MemoryPage adds removal guidance to the existing Saved memory section; its Textarea and Button compositions are reused unchanged. Source, build and temporary gateway behavior checks pass. **Rendered/state comparison is blocked:** browser access is disabled in Work settings. No desktop/phone visual acceptance is claimed; OA-459 stays open. See scope and verification.

## OA-461 cancelled Recovery — 5 November 2026

InboxView changes explanatory text only. Recovery retains the existing shared attention Badge, Alert and Button compositions and layout; no new control or style is introduced. Controlled HTTP coverage verifies cancelled Recovery exposes review and refuses a fresh attempt. The built-screen check was attempted through CUA but local browser use is disabled in Work settings, so rendered comparison remains unverified. This entry makes no new visual-consistency claim.
## OA-460 user profile — 5 November 2026

Source coverage: Profile navigation and search entry, SettingsHeader/SettingsSection, labelled Field/Input, save/cancel Button, destructive Alert and existing AvatarEditor/Dialog composition; chat uses the existing Message/MessageAvatar. UserAvatar retains the existing initial badge as a semantic identity graphic exception and reuses BotAvatar for chosen characters. No control skins or status badge overrides added.

**Rendered coverage remains unverified.** Cua inventory reports “Local browser use is disabled in Work settings”. Desktop/phone Profile, draft/cancel/save/error/read-only states, avatar dialog character/colour/reset/motion/focus and changed chat appearance still need rendered comparison with installed shadcn compositions. Build/API checks do not close this gate.

## OA-462 uploaded user image — 5 November 2026

Profile now uses uploaded raster images and initials, leaving character avatars to agents. Source coverage: existing Dialog/Field/Input/Button/Alert and new shared Base UI Slider composition (Root, Control, Track, Indicator, Thumb); labelled zoom, zoom buttons and single-click arrow alternatives to drag. The circular crop geometry, hidden file input and raster image are explicit specialist graphic exceptions. Saved image/removal, file errors, loading/busy, read-only and legacy initials are covered by source review; JPEG validation/persistence, size refusals, legacy-name retention and crop geometry have standalone controlled checks.

Rendered comparison is still blocked: Cua reports local browser use disabled in Work settings. Desktop/phone crop, zoom, pointer/touch/keyboard, focus, cancellation, load/save errors and chat image states remain unverified. Source/build checks do not close the visual gate.

### Avatar idle animation — 5 November 2026

The existing shared BotAvatar renderer now honors Animate avatar outside the editor, including neutral sidebar/header/message instances. Character thumbnails remain static; existing controls, geometry and status semantics are unchanged. Controlled renderer/editor checks cover all 12 shapes, 100 instances sharing one frame loop, idle transform changes, motion-off and dynamic reduced motion. Rendered visual/performance comparison remains unverified: Cua browser inventory reports local browser use disabled in Work settings. See `docs/notes/avatars/replacement-acceptance.md`.

## OA-463 tool activity grouping (5 November 2026)

ActivityTrace retains the installed Trace/Collapsible/EvidenceBlock and receipt-link compositions. Feed, room activity and Work share the same lifecycle projection; raw LedgerView remains unchanged. Current-state labels replace duplicated stages, with Failed destructive and Unknown neutral/unconfirmed. No control skin or status badge override was added. Real-component SSR covers lifecycle/room/native-failure cases and both real adapter recordings; cua-driver Chrome checks cover desktop/light, 500px light/dark, Pending → Finished and expanded evidence. See scope, screenshots and limits. Chrome refused 390px geometry; physical phone and full installed-desk acceptance remain unverified.

OA-463 review follow-up: exact input matches take precedence over default-expanded subsets; ambiguous adapter records remain separate. Completed default-only inputs are covered. Final static source review found no blocking defects.


## OA-465 — Agent requests in direct chats

| Surface | Composition and coverage |
| --- | --- |
| Composer mentions | Existing listbox/InputGroup/Button composition; global eligible agents only in direct chats, stable handle in selection. Rendered at 1440×1000 and 390×844, phone light/dark; pointer selection and Send verified. |
| AgentRequestsPanel | Shared Badge/Button/Alert, wrapping rows in bounded scrolling region. Requested/Cancelled and Answered rendered; Cancel exercised against the actual temporary gateway. Other lifecycle/failed-delivery/input states covered by controlled gateway assertions and source mapping. |
| Request details | Existing shared Sheet/Disclosure/Badge composition; owner/Full scoped manifest rendered at phone and desktop widths. Closing the sheet returns to the same conversation. |
| Receipt navigation | Existing ReceiptView composition; origin navigation preserves private receipt scope. Automatic and inspected response routes covered by actual gateway assertions; no external action performed. |

Semantic mapping reviewed for every branch: completed/delivered success; failed/expired or failed delivery destructive; interrupted attention and cancelled neutral take precedence; other pending/running/incomplete attention; cancelled neutral secondary. Outstanding requests remain accessible, with only settled history capped (newest five, then a ghost Show earlier Button; settled answers over 600 characters shortened behind a link Button, covered by `AgentRequestsPanel.test.tsx`; rendered comparison unverified). Production component inventory (115 modules) and built desk selector/provenance checks pass. Screenshots: OA-465 evidence. Physical phone/Safari and screen-reader use remain unverified.

## OA-466 — Conversation rendering performance

Feed retains MessageScroller/Message/Bubble and ActivityTrace retains native Trace/Collapsible, receipt links and evidence presentation. MessageText retains the existing Markdown/Table/CodeBlock composition. BotAvatar remains the audited artwork exception with its sized outer element. Composer retains InputGroup, menus, mentions and existing pointer/keyboard disclosure behavior. No new controls, badge states, feature skins or scroll library are introduced.

Controlled real-module DOM checks cover shared/split activity, native expansion, unchanged message rendering, hidden activity, avatar visibility/current-state resume, animation-off/reduced motion and draft/caret/focus/IME plus measured pointer collapse. Existing shipped-desk checks cover attachments, disclosure and offline guards. **Rendered comparison pending:** desktop/phone light/dark; off-screen reveal and row geometry; long-history scrolling/anchoring/latest; typing and menus during incoming events. Work settings disable local browser use, so source/DOM checks do not certify visual consistency or smooth frames. See [scope and journey](conversation-rendering.md).

## Conversation panel default — 5 November 2026

RoomView no longer opens the context panel merely because the viewport is at least 1180px wide. Explicit tab/Work routes still open it. Existing panel, Sheet, toggle and responsive compositions are retained. Build and source checks cover the default change; rendered desktop/phone and toggle comparisons remain unverified.

## Message composition — 5 November 2026

Feed follows the official [Base Message composition](https://ui.shadcn.com/docs/ai-elements/base/message): Message/MessageContent/Bubble/BubbleContent/MessageFooter. User rows align end with muted bubbles; agent rows align start with the installed tinted variant and a bubble-local primary token from the existing avatar palette. Sender avatars/name headers are removed; article labels and footer timestamps retain accessible identity and timing. Error bubbles remain destructive. Message/Bubble primitives and native spacing/radii/responsive widths are unchanged; no component or dependency is added.

Controlled DOM checks cover all 14 colours, automatic/missing metadata, appearance refresh, sender labels, timestamps, Markdown, literal user text, errors and absence of message avatar animation, alongside existing Trace/Composer/preview/approval checks. Visual comparison at 390/900/1440px in light/dark themes, actual contrast/overflow and scroll behavior remain open: Cua reports local browser use disabled in Work settings. No live data or deployment is implied.

Verification: `pnpm -r build` passed (hosted relay dry-run only); handbook repackaging and four `verify-bot-knowledge.mjs` delivery groups passed after the help edits. `verify-render-performance.mjs` and `verify-avatar-desk.mjs` passed, including the new bubble checks and existing approval/library render journey. Script syntax and whitespace checks passed. The broader `verify-desk-components.mjs` gate remains blocked by HEAD's existing missing ProfileImageEditor.tsx inventory entry; this change does not alter that module or claim that gate passed. No unit/Jest/Vitest runners, live provider calls, live data changes or deployment.

## OA-469 — receipt inspection removal (5 November 2026)

ReceiptView retains native Card, Badge, Disclosure, Button and evidence compositions. The target/reference and findings fields, inspection action, dirty-draft handling and generic Unknown warning are deleted. Status variants remain unchanged: Unknown/pending attention, failed/not-run destructive, completed success. Needs you no longer lists chat receipts as Recovery items; normal action approvals, server input and Work recovery remain.

Controlled shipped-bundle DOM acceptance covers completed/edited, legacy, pending-evidence and Unknown receipts, retained exact payloads, absence of inspection fields/button, no leave guard and no automatic replay. Gateway acceptance covers no chat receipt Recovery item and no historical-Unknown model lock. Real rendered desktop/phone consistency remains unverified: on this turn Cua inventory reported `Local browser use is disabled in Work settings`. No substitute screenshot or physical-device acceptance is claimed.

---

## OA-467 AI Elements adoption — 5 November 2026

| Component | Source coverage | Rendered coverage |
| --- | --- | --- |
| [item](../../apps/desk/src/components/ui/item.tsx) | Official base-nova Item composition installed through shadcn; existing Separator preserved. Simple inline confirmations use Item/Header/Content/Actions; complex avatar/reflection reviews retain Card. | Controlled DOM decisions, Edit/Respond reachability and exact proposal disclosure; browser comparison pending. |
| [profile](../../apps/desk/src/profile.tsx) | Existing nonvisual profile context and shared refresh; no UI composition. | No presentation change. |
| [UserAvatar](../../apps/desk/src/components/UserAvatar.tsx) | Existing semantic image/initial graphic exception used in Profile; message rows omit it. | Previous profile-image browser limits remain. |
| [slider](../../apps/desk/src/components/ui/slider.tsx) | Existing Base UI slider wrapper for image adjustment, inventoried without source changes. | Previous crop/keyboard/browser limits remain. |
| [ProfileSettings](../../apps/desk/src/components/ProfileSettings.tsx) | Existing native fields, buttons, dialogs and hidden image picker; implementation unchanged. | Inventory reconciliation only; previous browser limits remain. |
| [ProfileImageEditor](../../apps/desk/src/components/ProfileImageEditor.tsx) | Existing native Dialog/Button/Slider crop editor added to the source inventory. Its rendering and upload behavior are unchanged. | Existing profile limitations retained; this inventory correction is not new browser evidence. |

ActivityTrace uses one native summary and nested Trace per recorded turn within each contiguous activity segment. Settled historical groups start closed; running groups start open. Operation details remain lazy. Explicit failure/unconfirmed counts and existing receipt reconciliation prevent Unknown outcomes from becoming success. Command stdout/stderr are displayed only when present in recorded results; no output stream is invented. Work plan progress stays labelled as reported. Delegated Work opens its existing authorized activity reader only on expansion; agent requests use only events already visible in the same conversation. Copy uses ghost icon Button/Tooltip with success and refusal feedback. Shared spacing, semantic variants and control sizing remain native.

The source gate now accounts for the existing profile modules/Slider and explicitly permits the existing hidden ProfileSettings file picker, alongside the composer file picker and three artwork radios. No ordinary-control exception is added. This repairs the previously reported inventory gap without changing the profile implementation.

Reachable states covered by controlled checks: active/settled/failed/unknown/interrupted and missing tool results; collapsed/expanded summary, operation and exact proposal; recorded command output; all reported plan states and empty plan; Copy success/refusal; Accept/Ignore/JSON Edit and Respond reachability; delegated status/result/receipts and same-room activity filtering. Existing message alignment/palette, Markdown, previews, library approvals, composer drafts and off-screen avatar checks remain applicable. Desktop/phone light/dark reference comparison and real scrolling remain unverified while local browser use is disabled. User scroll anchoring and native scroll dependency are unchanged pending that evidence.

Initial OA-467 verification passed recursive build, standalone activity/render/pattern/avatar checks and the reconciled component gate (121 production modules, five explicit specialised input sites). Packaged/default API/Ollama/cached ACP-MCP/replacement-default knowledge delivery passed all four groups, including new activity/Copy/review wording. Final pinned-release checks and deployed readbacks are recorded in the dated release note. No unit/Jest/Vitest runners or live provider canaries.

## OA-468 Checkpoint

| Component | Source coverage | Rendered coverage |
| --- | --- | --- |


## OA-470 recorded evidence compositions

| Module | Native composition | Coverage |
| --- | --- | --- |
| [RecordedEvidence](../../apps/desk/src/components/RecordedEvidence.tsx) | Trace, Collapsible, Button, HoverCard and existing EvidenceBlock; recorded sources, file tree, TAP and stack frames. | Actual DOM and malformed/bounded evidence checks passed; rendered coverage recorded below. |
| [RequestUsage](../../apps/desk/src/components/RequestUsage.tsx) | HoverCard, Button and Progress, existing owner/Full metadata reader. | Lazy-read, missing-data and character-budget DOM checks passed; rendered coverage recorded below. |
| [hover-card](../../apps/desk/src/components/ui/hover-card.tsx) | Official installed base-nova PreviewCard composition. | No feature skin; shared primitive. |
| [progress](../../apps/desk/src/components/ui/progress.tsx) | Official installed base-nova Progress composition. | Recorded character budget only. |

WorkView reuses Tabs/Trace for reported Queue; Composer reuses Button for draft suggestions. Feed retains the existing bubble alignment, saved colour, accessible sender, native scroller and closed side-panel behavior. Runtime streaming/hidden reasoning and inferred answer citations are excluded.

Chrome became available during this batch. The built disposable desk was compared in desktop dark/light and 390×844 responsive layouts: file tree, returned source preview, recorded stdout/stderr/TAP/stack, usage/bar, Queue groups and draft suggestions retain native compositions. Side panel was closed and message alignment/tints retained. A real UI checkpoint fork created a distinct synthetic conversation without a turn. Missing/error and malformed states have controlled DOM coverage; complete physical-device and scroll/reconnect coverage is not claimed. See OA-470 evidence.

## OA-471 checkpoint removal

Removed the chat checkpoint row and unused ConversationCheckpoint/Marker modules. Message bubbles, footers, usage and Copy keep their native compositions. Existing forked rooms and attachment references are retained. Render checks assert that Checkpoint/Fork from here are absent; updated help describes existing forks only. Historical screenshots above retain the before-state.

Chrome reloaded the rebuilt disposable conversation: four message rows remained, Checkpoint text and Fork from here buttons were absent, and usage/Copy/tinted alignment and closed side panel remained visible. Evidence: chat without checkpoints. Desktop removal reviewed; mobile behavior follows the same removed row and controlled render assertions.

## OA-477 — conversation questions and decisions

| Component | Source coverage | Rendered coverage |
| --- | --- | --- |
| [ConversationRequests](../../apps/desk/src/components/ConversationRequests.tsx) | Native Message/MessageContent, existing ApprovalCard and McpInteractionCard, native Buttons and errors. Per-chat pending decisions survive history paging; no alternate input form for bot questions. | Mounted RoomView/gateway assertions pass, including reply selection, exact send, model-control target and stale draft retention. Actual browser comparison blocked. |

Composer uses native InputGroupAddon/InputGroupButton for Replying to/New message; existing textarea owns the draft. Question Reply uses the installed Button; Feed and pending decisions retain native Message compositions. Shell/ClassicShell drop Needs you navigation, counts and the old page. Shared attention colour values are unchanged while their former feature-specific token names become semantic `--attention` tokens. Existing badge variant mapping remains: pending attention, accepted success, denied/failed destructive. The removed InboxView row above is historical inventory.

Desktop/phone visual acceptance is not established by imports, typechecks, or mounted DOM. Record browser access and final verification in the ticket Log.

OA-477 browser access was rechecked through Cua on 5 November: local browser use is disabled in Work settings. Desktop/phone visual comparison remains blocked. No live desk or installed service was changed.

---

## OA-473 provider prompts in chat

Feed mounts the existing McpInteractionCard as a Message/MessageContent row outside the activity Trace. It reuses Field, SelectField, Checkbox, Input, Button, Alert and Badge; no feature control skins or new primitive are introduced. The open request's Response needed badge uses `attention`; accepted uses `success`, declined uses `destructive`, cancelled remains neutral, and expired/interrupted use `attention` in the retained Questions detail.

Controlled gateway/React/stream DOM coverage includes a live arriving permission form with activity hidden or shown, exactly one form after duplicate/forwarded-shaped events and chat remount, room separation, restricted-device omission, explicit Allow once submission, stale-response rejection, and removal after accepted/declined/cancelled/expired state. URL-mode prompts show their guarded link in chat and remove it on parent cancellation. The existing Questions form retains numeric, boolean, choice and other-device-decision coverage. The component inventory and actual Trace composition checks passed.

Visual comparison remains unavailable: on 5 November, Cua returned `Local browser use is disabled in Work settings`. No desktop/mobile screenshot, browser layout, overflow or physical-device acceptance is claimed. The source/DOM checks above do not replace that comparison; ticket OA-473 remains open for it.

## OA-474 invocation result and effect verification

ReceiptView retains the existing native Card, CardHeader, CardTitle, CardAction, CardContent and semantic Badge composition. New MCP receipts label the outcome Tool result, use Succeeded for completed invocations, and show External change verification: Not checked in the existing content stack. Failed/not-run use destructive, pending/unknown attention and completed success; older receipts keep their existing heading and labels. No control, layout skin or colour override was added.

The shipped-desk gateway/DOM receipt check covers Succeeded plus separately persisted Not checked evidence, alongside Failed, Pending, legacy/retained Unknown and missing historical receipt states. Component inventory and renderer checks remain separate from visual acceptance. Browser review remains unavailable because local browser use is disabled; no desktop/phone screenshot or screen-reader acceptance is claimed for the new text.

## OA-476 message replies — 5 November 2026

Reply actions use the existing MessageFooter Button (`ghost`, `icon-sm`) with Tooltip. Composer keeps InputGroup and uses its block-start Addon plus InputGroupButton (`ghost`, `icon-xs`) for Cancel reply. Shared touch-size variants, focus rings and semantic theme tokens remain authoritative. No status badge changes. MessageQuote is an explicit semantic-document exception: a plain-text blockquote with sender, a two-line excerpt and shared border/text tokens; it renders in both composer and BubbleContent. Installed shadcn CLI info confirms Base UI/base-nova; official InputGroup/Button/Tooltip compositions were located through the installed CLI.

| Module | Composition | Coverage |
| --- | --- | --- |
| [MessageQuote](../../apps/desk/src/components/MessageQuote.tsx) | Semantic quoted text; escaped React text nodes, bounded preview and shared tokens. | Built-desk DOM acceptance below; visual comparison pending. |

State coverage required: user/agent/attachment-only targets, select/replace/cancel/Escape, keyboard focus, sending lock, draft and quote retention on failure/uncertain response, acknowledged send, sent quote after reload, room change, direct/room/classic shell, long/multiline/hostile text, light/dark and phone/desktop sizes. Browser inventory currently reports **Local browser use is disabled in Work settings**. DOM assertions establish behavior and component structure only; rendered theme, size, wrapping and scroll comparison remains unverified. This visual gate remains open.

OA-476 controlled acceptance: `pnpm -r build`, `verify-message-replies`, `verify-hosted-context`, `verify-acp-continuity`, `verify-agent-requests` (38 cases), `verify-chat-display`, `verify-ai-patterns`, `verify-desk-components` (126 modules), `verify-bot-knowledge` (four delivery groups) and whitespace passed. Reply/Copy adjacency, native control slots, focus/Escape/cancel/replace, send lock, failure/lost-response retention, safe quoted text, persistence and direct/classic/mobile DOM paths are asserted against the shipped bundle and disposable real gateway. The phone media-query DOM path does not establish rendered phone layout. No browser screenshots, theme/wrapping/scroll comparison, real adapters/providers or deployment were performed.

## OA-306 WebRTC unreachable state — 11 November 2026

RtcUnreachable is shown by `Signed` (app.tsx) only when a stored WebRTC identity cannot connect and the daemon is not reachable directly. A tab that never had a live session sees it at once; a tab that had one keeps its workspace through `UNREACHABLE_AFTER_FAILURES` (3) failed reconnects (`showUnreachable`, connectivity.ts). It uses the shared Alert (default variant; this is an actionable connection state, not a destructive failure) and Buttons (default "Try again", outline "Pair again"). The h1 and container repeat Login's shell so the two read as one sign-in flow. There are no badges and no custom control styling.

Rendered coverage: the previous inline version of this screen was seen in Chrome 149 on an Android emulator during the OA-306 run (webrtc.md, Acceptance), and its copy and controls are unchanged apart from dropping one explanatory sentence. The extracted component and the 3-failure gate are covered by `RtcUnreachable.test.tsx` and `connectivity.test.ts`. They have not been re-rendered on a device; desktop width and dark mode have not been checked.

## Web Push notifications section — 12 November 2026

WebPushSection sits in Settings → Proactive → Notifications, under the ntfy form. Status uses the shared Badge mapping:
- `success`: "On for this device".
- `attention`: "Off for this device" or "Not available here" (needs setup).
- `destructive`: "Blocked in browser settings".

Actions use default/outline Buttons. The installation switch and the contact for push services use the shared Switch and Field/Input, and errors use the shared destructive Alert. There is no custom control styling. A single explanatory line appears only when the state requires it: an insecure origin, an unsupported browser, or iOS when the desk is not installed.

Coverage is `WebPushSection.test.tsx` (unavailable, turn on with subscribe and register, send test, denied, owner controls and save). Rendered comparison is pending until the lab delivery run.

## OA-479 receipt gate removal — 5 November 2026

Removed the inspection form and its draft/busy state from the shared ReceiptPage. The shipped desk DOM acceptance covers pending/accepted/edited/failed/Unknown/legacy/automatic receipts, retained payloads, semantic status badges and absence of inspection fields/buttons. The existing Base UI/base-nova Card, Badge, Disclosure and navigation compositions remain. No new control styling or specialist exception. Desktop/phone rendered review was not repeated for this removal; mounted shipped-DOM coverage is not visual acceptance.

## OA-486 HTTP Copy and automatic localhost sign-in (sign-in removed in 0.7.0)

Copy controls retain the installed ghost/icon Button and Tooltip compositions; the shared helper changes clipboard execution only. CodeBlockCopyButton adds concise failure status using the existing status pattern. Login retains Field/Tabs/Button/Alert and uses plain status text while the localhost attempt is pending. Existing signed-in and remote pairing layouts are preserved.

Controlled mounted states: HTTP Copy success/refusal and exact content selection; async clipboard success; focus and temporary-field cleanup; direct-host automatic Full bootstrap, StrictMode single request, explicit sign-out suppression, remote pairing and uncertain-response failure without retry. Real gateway checks cover remote TCP, spoofed Host, Origin, proxy headers, body limits, rate limits, revocation and frame protection. Browser inspection covers automatic localhost Full access and the native pairing dialog's HTTP Copied state at desktop and 390px dark-theme widths. Evidence and limits. No light-theme, system clipboard readback or actual iPhone acceptance is claimed.

## OA-487 proactive destination — 5 November 2026

Message destination reuses ProactiveCard/CardFooter, Field/FieldGroup/FieldLabel, SelectField/SelectGroup/SelectItem, Button, Skeleton and destructive Alert. Feature classes only arrange layout. No new status badge or specialist exception. Rendered comparison covers desktop 1280 × 1000 and phone 390 × 844 in light/dark themes, both choice types, popup selection, disabled/unchanged Save, confirmed save and unavailable-room recovery. Shared sizes, spacing, focus/selected treatment and narrow popup wrapping match the installed compositions. Screenshots, state coverage and limits. Standalone mounted gateway acceptance additionally covers load/persistence, failed saves and shared brief/alert routing; it does not replace the rendered comparison.

## OA-489 Proactive duplicate scrollbar — 6 November 2026

Shared FieldSet adds a relative containing block for absolute screen-reader legends. FieldSet/FieldLegend semantics and installed control compositions remain. No page-level clipping, competing control skin or new specialist exception. Rendered regression evidence covers Schedule in desktop 1280×720 and phone 390×844, dark/light, top and bottom, retained accessible group names and keyboard reachability. Outer document overflow changes from 1234px to zero; the content pane retains its scrollbar. Other shared FieldSet callers were inspected; their visible layouts and behavior are otherwise unchanged by normal-flow positioning.

### OA-496 — reflection history and retained details (6 November 2026)

| Before | After | Why |
| --- | --- | --- |
| Run dates, states and counts joined into one muted sentence inside the settings form | Separate ProactiveCard with native Table, date, semantic Badge, result counts and detail action | Gives settings and history distinct hierarchy; stable columns improve scanning |
| No way to inspect a reflection | Native Sheet with title/description, agent/time/duration, recorded counts and proposed note/skill content | Keeps history context while reading; read-only and Full-only |
| Raw manual run key shown as a date | Readable date plus Manual/Scheduled origin | Removes internal identifiers from routine UI |

Uses installed base-nova Card/Table/Button/Badge/Sheet/Separator/Skeleton/Empty and existing FieldGroup controls. No new control skin, dependency or custom animation. Proposal text is semantic document content (plain escaped text, wrapping and preserved line breaks), an explicit content exception. Status variants: completed success; running attention; failed/interrupted/invalid destructive; no changes secondary (neutral outcome). No skill acceptance controls appear in the read view.

Real disposable gateway and Chromium: 1440×1000 and 390×1000, dark/light. Screenshots cover history, memory details, full skill draft and running/interrupted states. Also checked refused detail access, missing content, empty proposals, no runs, Escape/focus return, zero page errors and no document overflow. Full-only HTTP access, redaction, missing-boundary refusal and cross-run isolation checked by the gateway acceptance. Reduced-motion mode was used for stable captures; animation timing, physical phones/Safari and assistive technology were not tested. No live data or installed daemon changed.

Evidence and commands: OA-496, browser coverage. The existing ReflectionPanel inventory row remains valid; no production component module was added.

### OA-500 — Proactive History layout (6 November 2026)

| Before | After | Why |
| --- | --- | --- |
| Full-width account cards stacked by service | Responsive account grid with compact coverage dates | Keeps current source health distinct from past check results |
| Up to fifty expanding rows in the same settings card | Separate native Table with ten records per page and Newer/Older controls | Makes recent checks scannable and bounds page height |
| Inline disclosure mixes reason, range and excerpts into the list | Native read-only Sheet with status, reason, start/finish, requested window and evidence | Preserves context and the current page while reading a check |
| Held alerts use monospace technical summaries inside a nested card | Native Item list, plain-text reasons, held-state Badge and existing feedback action | Removes nested framing and keeps the action easy to find |

Reuses installed base-nova Card, Table, Sheet, Item, Badge, Button, Alert, Empty, Skeleton and Separator. Feature classes own layout; retained evidence/reasons are semantic document content and remain escaped plain text. The existing stateVariant mapping is retained: checked/no-new/quiet/posted success, unavailable/interrupted/missing-permission destructive, cancelled secondary, other pending/setup/held states attention. Recorded feedback now uses success. No new production component module or dependency.

Rendered Chromium at 1440×1000 and 390×1000, light/dark, en-NZ/Pacific-Auckland: coverage, history, detail and held-alert screenshots; long account names wrap without document overflow; sheet fits the viewport, closes on Escape and restores focus. A 23-record fixture verifies pages 10/10/3, final/initial button bounds, retained page after detail close, refresh returning to latest, empty/error states, escaped evidence text, and the sole feedback POST with its unchanged payload. Gateway standalone proactive acceptance also passes, including source choices, account attribution, failures, stale-save retention and delivery destination. Knowledge guide/handbook updated; packaged delivery verified in four integration groups.

Evidence and commands, browser coverage. No live service/provider changes, unit/Jest/Vitest, physical phone/Safari, screen reader or animation-timing check. No merge or deployment for this slice.

### App library actions (6 November 2026)

The library and installed connections reuse base-nova Button and Collapsible; the installed count uses the neutral Badge. Manage connections and Refresh status share a compact action row, with maintenance in a separate disclosure. Existing disabled and error states are retained. The handbook topic `computer-connectors` was updated; `pnpm -r build` packaged it and `node scripts/verify-bot-knowledge.mjs` verified delivery to default-bot paths.

Rendered coverage remains open: a disposable preview started, but local browser use was disabled in Work settings. The collapsed and expanded disclosure, narrow layout, loading, disabled and error states still need a visual comparison with the official compositions. No live installation was changed.

The follow-up groups visible entries as Apps, Connectors and MCP servers, presents Apple apps in Apps, and hides Gmail and Drive in the desk without deleting their backend or saved configuration. The existing neutral Badge and Card compositions are retained. The packaged handbook explains the grouping and the scope of global MCP reconnect. Rendered coverage remains open for these groups and their empty, filtered and narrow states; browser control was unavailable.

The compact follow-up combines apps and connectors under Apps and retains a separate MCP servers group. It uses the installed outline Item link composition with media, title, tool count and semantic status Badge; details and setup remain in the existing dialog. Desktop and narrow rendered comparison, focus return and state coverage remain open because local browser control is disabled. The handbook was updated and packaged for default-bot delivery.

The library action row now exposes reload and reconnect as shared outline Buttons beside refresh, with wrapping on narrow screens. The handbook describes their scope. Rendered comparison and disabled, busy and error state coverage remain open because local browser control is disabled.

The category filter is hidden in both library views; the shared Field and Input remain for search. Prior category selections no longer filter entries. The handbook describes search; rendered desktop and narrow coverage remains open because local browser control is disabled.

### Automation destination and feedback (6 November 2026)

The editor uses the shared Select with still bot avatars for agent choices and room names for room choices. Selecting a room saves its current lead; a direct agent choice uses the existing direct-chat creation path. Existing room/agent assignments remain unchanged until the destination is changed. Success uses Sonner as requested, with semantic theme tokens; the count sits below the list. The proactive handbook describes the destination semantics. Controlled shipped-desk and gateway coverage checks direct and room saves, existing non-lead preservation, and creation feedback. Rendered desktop, narrow, dark/light, keyboard and toast appearance coverage remains open because local browser control is disabled.

### Sidebar profile navigation (6 November 2026)

The existing SidebarMenuButton now links to Profile and names that destination for assistive technology. In the disposable desktop preview, selecting the device control opened the Profile page; Devices remained available in Settings. The overview handbook was packaged and its default-bot delivery checked. Mobile and keyboard navigation were not checked.
### Sign-in redesign (2026-11-06)

Login uses the shared Card, Tabs, Field, Button and Alert components for pairing and direct-join forms. The pairing code uses shadcn Input OTP with eight slots and supports pasting formatted codes. Pairing and direct join show a spinner while connecting. The legacy token sign-in option was removed. 0.7.0 removed automatic localhost sign-in and its loading card; the footer points to `pnpm desk:open`. Rendered desktop, mobile, light and dark states remain unverified: local browser use is disabled in Work settings.

### Receipt links removed (6 November 2026)

The separate receipt page and links were removed. The existing approval card and request details use the same shared compositions. A disposable built-desk preview showed the pending approval and expanded interrupted request without receipt links at desktop width. Request details, Work, activity, mobile layouts, and other states were not visually rechecked. Database recording is unchanged.

### Conversation approval layout (6 November 2026)

The compact approval keeps the base-nova Item, semantic Badge, Disclosure, Separator and Button compositions. Actions now follow the review content rather than sitting beside it. The built disposable preview was inspected at a 618 px viewport with the initial card and expanded proposal, review details and Respond field. Pending status uses the attention variant; the tool class remains neutral. Other approval types, desktop width, touch devices and edit/error states were not visually rechecked. Existing shared button feedback is retained; no new animation was added.

### OA-503 — Guest Work permissions (in progress)

The direct-chat permission picker reuses the installed base-nova Dialog, Select, Field and Textarea. Controlled DOM/gateway checks cover selecting a prospective guest, saving its mode, setting the coordinator's shared writable folder before assignment, Limited-device refusal and unchanged membership. The direct-chat Work panel includes guest assignments from that chat alongside the bot's other Work.

The in-app browser opened a disposable gateway in dark mode. At desktop size the guest assignment appeared in the originating chat and Work panel. With a synthetic model-settings response, `/permission` opened the native dialog, listed the coordinator and prospective guest agents, and showed the writable-folders field. At 390×844 the guest selection and field remained visible and the save and cancel controls were reachable by scrolling; Escape returned focus to the composer. The gateway check covers actual saves and permission boundaries. Light-theme, screen-reader and full state coverage were not checked.

## Rendered acceptance — 18 November 2026

Real Chromium renders (desktop 1440×1000, phone 390×844 with touch, light and dark) now cover the states the OA-459, OA-460, OA-462, OA-466, OA-469, OA-473, OA-474, OA-476 and OA-477 entries above left as "rendered comparison pending", plus OA-390 and the 0.7.0 sign-in page. 113 of 113 renders passed overflow, error and state checks. Scope, results and screenshots: [rendered-acceptance.md](rendered-acceptance.md). Physical phone, Safari, PWA and screen-reader use remain unverified.

Two defects were fixed against the installed compositions. Feed no longer draws an empty Bubble above an attachment-only message. The shared [slider](../../apps/desk/src/components/ui/slider.tsx) now follows the shadcn base Slider: positioned Control, `thumbAlignment="edge"`, `slider-track`/`slider-range`/`slider-thumb` slots and upstream thumb styling, keeping one named thumb for a scalar value and the 44px touch height. Before, its thumb escaped the Control and rendered at the crop dialog's edge.

Open composition findings are listed in the notes table: sign-in title not a heading, error Alert placement, agent editor help text using a local mono class instead of FieldDescription, the activity summary's phone truncation order, Load earlier overlapping text, two reply composer patterns, the profile form's raw fieldset and busy-state text, and the Sonner wrapper versus the Base UI toast.

## Rendered design findings — 20 November 2026

Fixes for the open findings from the 18 November sweep, each asserted in real Chromium by [verify-rendered-acceptance.mjs](../../scripts/verify-rendered-acceptance.mjs) at desktop 1440×1000 and phone 390×844, light and dark. The full run passed 123 of 123 renders. Physical phones, Safari and screen readers remain unverified.

- Sign-in: the `CardTitle` "Connect this device" carries heading role, level 1, so the page has an `h1` for assistive technology. The global `h1` rule would restyle a native `h1`, so the Card composition stays and the role is added; screenshots are byte-identical to before.
- Sign-in errors: one destructive `Alert` now opens the card content, above the method tabs, for the revoked-device notice and pairing or direct-join failures. Before, each form drew it below its submit button.
- Agent editor: the handle and maximum model steps help are `FieldDescription`s inside their `Field`, and the footer Saved status uses the muted body text. The local `MONO` class is gone; the `api · @handle` identifier line keeps its monospace style.
- Activity summary: the summary row's `TraceDescription` takes `min-w-0 flex-1 truncate`, so at 390px the counts truncate and "boss · Activity" stays whole. A zero flex basis gives the counts no share of the shrink, so a title wider than the row still truncates after the counts reach zero. Inner activity lines keep the Trace default (title truncates first).
- Load earlier: the control row is the installed `Marker` with `variant="border"`, so a full-width rule separates it from the transcript. Measured before the change, the row already sat outside the scroll viewport; the overlap was perceptual, from text clipped right under a borderless row. Prepend anchoring is unchanged (`verify-transcript.mjs --browser` and the OA-466 48px anchor check pass).
- Composer replies: RoomView owns one `ReplyTarget` (`message` with its id, or `question` with id and revision; both carry the quote) and the composer renders it with one block-start `InputGroupAddon`: "Replying to", the `MessageQuote` blockquote and the icon Cancel reply button. Answering a question still sends `replyToQuestion {id, revision}` and keeps the asking agent's model and permission controls; Escape and Cancel reply clear either kind. The one-line "Replying to:" text and New message button are gone; `verify-conversation-interactions.mjs` and the help topic now use Cancel reply.
- Profile: the raw `fieldset` is the shadcn `FieldSet` (it still disables the form while loading, saving or reading an image), and the busy Upload image and Save profile buttons use the newly installed `Spinner` with `data-icon="inline-start"` and `disabled`. The separate "Reading image…" paragraph is gone. No `FieldLegend` was added: the Card section title already names the group.

## Keyboard-instant motion — 20 November 2026

Five motion fixes in the installed base-nova components, each asserted by the `motion` scenario of [verify-rendered-acceptance.mjs](../../scripts/verify-rendered-acceptance.mjs) in Chromium at desktop 1440×1000, light, with normal motion preferences. Each assertion failed before its fix. Rules: [desk-motion.md](desk-motion.md).

- Command palette: `DialogContent` takes `overlayClassName`; `CommandDialog` turns off popup and backdrop animation. A pointer-opened dialog (profile crop) still animates.
- Mention picker: its `PopoverContent` has `animate-none!`; the shared Popover is unchanged.
- Dropdown menu, Popover and Tooltip popups add `data-instant:animate-none!`, so keyboard and focus opens and Escape closes are instant. A pointer-opened menu still animates. Select is unchanged.
- Sheet: panel and backdrop use `cubic-bezier(0.23,1,0.32,1)`, 200ms open and 150ms close; the panel transitions only opacity and translate.
- Message scroller: the jump-to-latest exit is 150ms on the house curve instead of 400ms `cubic-bezier(0.7,0,0.84,0)`.

Phone sizes, dark theme, Safari and physical devices were not run for the motion scenario; these are class changes with no layout effect, and the full acceptance run covers layout at those sizes with reduced motion.

## Tooltip grouping, drag tracking and phone navigation drawer — 20 November 2026

- **Drawer (new):** `ui/drawer.tsx` is the unmodified shadcn base-nova registry component (`npx shadcn add drawer`, Base UI Drawer).
  - It replaces `Sheet` only for the phone sidebar in `ui/sidebar.tsx`, with `swipeDirection` following the sidebar side.
  - Feature classes set only the sidebar surface (`bg-sidebar`, foreground) and its width (`--drawer-content-width: var(--sidebar-width)`).
  - The sidebar's own `data-slot="sidebar"` replaces the popup's `drawer-popup` slot, as it did for `sheet-content`.
  - Sheets elsewhere are unchanged.
- **Tooltip:** one `TooltipProvider` (delay 600ms) at the root. `ui/tooltip.tsx` is unchanged.
- **Sidebar reorder:** a feature-level gesture in `SidebarList.tsx`. The only styling change is to `.desk-dragging`: it now sits above its neighbours and its opacity goes from 0.5 to 0.85.
- **Rendered coverage:** the full `verify-rendered-acceptance.mjs` run covers layout at desktop and phone sizes in both themes. The `motion` scenario covers the gestures on desktop (reorder) and on phone with touch (drawer). Physical devices and Safari are unverified.

## History search in the search command (release 0.8)

The existing `CommandDialog` gains a **Messages** `CommandGroup` (`HistorySearch.tsx`) built from installed `CommandGroup`/`CommandItem`; snippets are text with `<mark>` ranges using the semantic `primary` token. The sidebar gains a **Search** `SidebarMenuButton` that opens the same dialog, so phones can reach it. The dialog keeps its existing no-animation open (keyboard-opened, used often). The landing mark on the opened message (`.desk-search-hit`) is a one-time background fade on the `MessageScrollerItem`, no layout or transform. Rendered in Chromium by `verify-rendered-acceptance.mjs history-search`: results at desktop 1440×1000 and phone 390×844 in light and dark, no-match on desktop, opened-at-message in all four variants; 9/9 passed. Physical phones, Safari and screen readers are unverified.

| Component | Source coverage | Rendered coverage |
| --- | --- | --- |
| [HistorySearch](../../apps/desk/src/components/HistorySearch.tsx) | New. Installed `CommandGroup`/`CommandItem` inside the existing `CommandDialog`; snippet highlights are `<mark>` text on the `primary` token. No control skin or dependency added. | `history-search` scenario as above: 9/9 at desktop and phone, light and dark. |

## Release 0.8 owner notes (T3b) — 25 November 2026

Settings → Profile gains an Owner notes `SettingsSection` below Your profile. Notes use the installed base-nova `ItemGroup`/`Item` (outline, sm) with `ItemContent` and a ghost/sm `Button` in `ItemActions` for Remove; the busy Remove and Save buttons use `Spinner` with `data-icon`. The empty state is the installed `Empty` composition; whole-file editing reuses `Textarea` as Saved memory does; errors use the destructive `Alert`. No status badge, control skin, token or dependency added.

| Component | Source coverage | Rendered coverage |
| --- | --- | --- |
| [OwnerNotesSection](../../apps/desk/src/components/OwnerNotesSection.tsx) | New. SettingsSection, Item/ItemGroup list, ghost/sm Remove, outline Edit notes, Textarea editor, Empty, Skeleton loading, destructive Alert. Owner/Full controls only; Limited sees the list and a one-line access note. | `R08-owner-notes` in `verify-rendered-acceptance.mjs`: empty, list (including a long wrapping note), editing, and Limited read-only, each at desktop 1440×1000 and phone 390×844 in light and dark; 16 of 16 passed with no horizontal overflow or console errors. Physical phone, Safari and screen readers not run. |
| [ProfileSettings](../../apps/desk/src/components/ProfileSettings.tsx) | Renders OwnerNotesSection; header description now names both parts of the page. Form unchanged. | Existing OA-460/OA-462 states re-run in the same pass: 33 of 33 passed. |
