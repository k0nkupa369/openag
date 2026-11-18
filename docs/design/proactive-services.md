# Proactive service setup and coverage

Owner-requested UI/UX refinement of the Composio-first feature, following the installed shadcn Base UI/nova system and Emil design guidance. Product behavior remains in the [proactive guide](../notes/proactive.md).

## Reading order

Schedule answers **what, then when**. Services to check comes before Checking frequency. Keep the existing Schedule, Reflection, Notifications and History navigation and independent saves.

History answers **what happened, and what needs attention**. It starts with schedule status and next check, then attention summary, account coverage grouped by service, and recent checks. Each recent check names its service and account; expanding it reveals the inspected window and source evidence. Held-back alerts remains a separate existing section.

## Design changes

| Before | After | Why |
| --- | --- | --- |
| Service choice follows every schedule and notification control | Services first; provider identified once in the header | Start with the owner's main decision |
| Search and save share a generic Working label | Stable action labels with a busy icon for the active operation | Preserve the action's identity while it completes |
| An unstructured list mixes every service account | Service headings and native Item rows with account names and semantic status badges | Make a broken account easy to locate without obscuring healthy accounts |
| Recent rows show service and time | Service, account, time and an outcome badge | Distinguish two accounts from the same service |
| Broken connection has only an error sentence | An actionable Review connection link opens the existing Composio entry | Offer a next step without reconnecting automatically |
| Blank/loading states are plain paragraphs | Native Empty and Skeleton compositions | Keep hierarchy and loading geometry consistent |
| Empty setup can look like a paused schedule | Not configured plus an explicit service-selection cue | Avoid implying that any source has already been checked |

## Components and interaction

Use the installed Card, FieldGroup/Field, FieldSet/FieldLegend, Checkbox, Input, Button, ItemGroup/Item, Badge, Alert, Empty, Skeleton, Separator and Disclosure. The search field and content-sized Search button wrap on narrow screens. Selection remains a checkbox form: all connected accounts are included, and saving remains explicit. Service names are dynamic; the familiar names in the preview are examples.

Keep unsaved selections through search and failed saves. Show the selected count and Unsaved changes by the Save services action. Search, save and refresh retain their labels while pending and prevent duplicate submissions. Status reads and Refresh remain passive. Unsupported checks remain selectable with their existing explicit coverage description.

Account badges use shared semantic variants. Checked is success; sign-in, incomplete, rate-limited, unsupported and not-checked states need attention; unavailable access and interruption are destructive. Scheduled is neutral metadata, not a claim of successful coverage. Never infer healthy account access from the Composio provider label.

Use native focus, keyboard and touch behavior. No new entrance, stagger, hover or selection animation is needed on this settings screen. Pending icons use the existing reduced-motion-aware spin treatment; disclosures retain the shared treatment. No new component skins, raw colors, dependencies or global CSS are needed.

## Responsive and state coverage

Desktop keeps the existing settings shell and a single content column. Phone hides the workspace sidebar through the existing shell, wraps account metadata and actions, and keeps check outcomes readable. Essential actions remain visible without hover.

Rendered coverage and screenshots are retained in the OA-484 evidence. The disposable preview uses the built desk and real settings/history gateway with synthetic accounts. It cannot run a model or contact a provider. Controlled integration continues to establish save, stale revision, read isolation and coverage behavior separately from visual checks.

## Component references

The current Base UI [Field](https://ui.shadcn.com/docs/components/base/field), [Item](https://ui.shadcn.com/docs/components/base/item), [Empty](https://ui.shadcn.com/docs/components/base/empty) and [Button](https://ui.shadcn.com/docs/components/base/button) compositions informed this change. Existing installed components own appearance and sizing.
