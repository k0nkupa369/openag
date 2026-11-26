# Release 0.10: talk mode and automation templates

Status: draft specification, 25 November 2026. It describes desired behavior and claims no implementation or acceptance. External publication is pending: no issue tracker or triage vocabulary is configured for this repo, and `origin` is public.

Ideas drawn from OpenClaw (Talk Mode) and from Goose recipes and Hermes automation templates. The two features are independent. Either can ship without the other.

## Problem Statement

Talk mode: the owner can dictate a message in the composer, but replies are text only. On a phone, while walking or driving, or with hands busy, the owner has to read every reply, then tap Dictate again for each turn. A spoken back-and-forth isn't possible.

Templates: an automation today is a blank form with cron, agent, conversation and prompt. A new owner doesn't know what a good automation looks like or how to word its prompt so that it runs unattended. Owners who have built a good automation can't move it to another installation or share it, short of copying fields by hand.

## Solution

Talk mode: a conversation can be switched into talk mode in the desk. In talk mode the desk reads each new agent reply aloud with the browser's built-in speech voice, then starts listening again. The owner's speech is transcribed with the existing dictation path and sent. The owner can interrupt speech, pause listening, or leave talk mode at any time. Reading a single reply aloud is also available outside talk mode.

Templates: Automations gets a template gallery. A template is a named, parameterized automation: a cron schedule, a prompt with placeholders and suggested permissions. Choosing one opens the normal create form already filled in, with the placeholders as labelled fields. Nothing is created until the owner saves. Owners can export an automation as a template file and import a template file. An imported template is treated as untrusted text and only fills the form.

## User Stories

Talk mode
1. As the owner, I want to start talk mode in a conversation, so that I can talk to an agent without touching the screen between turns.
2. As the owner, I want each new agent reply in that conversation read aloud, so that I don't have to look at my phone.
3. As the owner, I want listening to start again automatically after a reply has been read, so that the conversation keeps flowing.
4. As the owner, I want my speech transcribed and sent when I stop speaking, so that I don't have to press Send.
5. As the owner, I want a clear visible state (listening, transcribing, waiting for the agent, speaking), so that I always know what the desk is doing.
6. As the owner, I want to tap once to stop the voice mid-sentence, so that I can cut off a long reply.
7. As the owner, I want to pause listening without leaving talk mode, so that a nearby conversation isn't sent by mistake.
8. As the owner, I want talk mode to end when I leave the conversation, lock the screen or close the tab, so that the microphone never stays open unseen.
9. As the owner, I want the microphone released whenever talk mode is not listening, so that the browser's recording indicator is accurate.
10. As the owner, I want code blocks, links and long tables summarised as "code block", "link" and so on instead of read character by character, so that spoken replies stay listenable.
11. As the owner, I want approvals and questions announced aloud, with a decision still made in the conversation's controls, so that talk mode never decides an approval by voice.
12. As the owner, I want a "Read aloud" action on any single agent reply, so that I can listen to one reply without starting talk mode.
13. As the owner, I want to choose the voice and speaking rate from the voices my browser offers, so that it sounds acceptable to me.
14. As the owner, I want that voice choice remembered on this device, so that I don't pick it every time.
15. As the owner, I want talk mode hidden or disabled with a clear reason when dictation is not configured or the browser has no speech voices, so that I don't start something that can't work.
16. As the owner, I want talk mode to respect reduced-motion settings in its visual indicators, so that it is comfortable to use.
17. As the owner, I want talk mode to work in the installed phone PWA, so that it's useful away from my desk.
18. As the owner, I want transcribed text to appear in the conversation like a typed message, so that the record is the same whether I typed or spoke.

Templates
19. As a new owner, I want a gallery of useful automation templates, so that I can set up my first automation in a minute.
20. As the owner, I want each template to say what it does, when it runs and what permissions it needs, so that I can choose safely.
21. As the owner, I want choosing a template to open the normal create form filled in, so that I review everything before anything exists.
22. As the owner, I want template placeholders shown as labelled fields (such as repository, topic, time of day), so that I don't edit the prompt text to fill them.
23. As the owner, I want the form to refuse saving while a required placeholder is empty, so that no automation runs with a literal placeholder.
24. As the owner, I want suggested permissions shown as defaults that I can lower, so that a template never silently grants more than I accept.
25. As the owner, I want to export one of my automations as a template file, so that I can reuse it on another installation.
26. As the owner, I want export to leave out secrets, webhook credentials, run history and conversation ids, so that a shared file carries nothing private.
27. As the owner, I want to import a template file, so that I can reuse a template someone shared.
28. As the owner, I want an imported file validated strictly, with a specific error when it's invalid, so that a broken file can't half-fill the form.
29. As the owner, I want an imported template to only fill the form, so that importing never creates or runs anything.
30. As the owner, I want templates to support only the trigger kinds the desk can create, so that an import can't produce an unsupported automation.
31. As a Limited device user, I want to browse templates but not create from them, so that creation stays owner/Full only like today.
32. As the owner, I want the default bot to suggest a template when I ask for something a template covers, so that it uses known-good wording.
33. As the owner, I want the help topic on automations to explain templates, import and export, so that I can learn the feature from the default bot.

## Implementation Decisions

Talk mode
- Desk only. No daemon change except help content. Speech output uses the browser Web Speech API's speech synthesis on the device, with no provider key, so the text is never sent to a speech service by OpenAg. Speech input reuses the existing composer dictation capture and daemon transcription unchanged.
- A talk-mode state machine owns the cycle: `off → listening → transcribing → sending → waiting → speaking → listening`, plus `paused`. It also reacts to leaving the conversation, losing visibility and failing permission. It is a single reducer that is unit-testable without a browser.
- End-of-speech detection: a silence threshold on the recording, with a manual "send now" tap as a fallback. Fixed bounds keep a recording from running forever.
- Speech text: a pure function turns a rendered reply into speakable text. It replaces code blocks, tables, links and images with short spoken labels and caps the length, then offers "Read the rest?" at the cap.
- Approvals and questions: talk mode announces them with fixed text and stays in `waiting`. A decision is made only with the existing on-screen controls. Voice never decides an approval.
- Voice preferences: voice name and rate are stored in browser storage on the device (per-viewer convenience) and read with a fallback when unavailable.
- UI: a talk control in the composer using the existing shadcn base-nova components and semantic tokens, plus a per-message "Read aloud" action in the message actions. Run the motion and gesture passes after the visual work, as the repo's UI rules require.

Templates
- Template shape: a versioned JSON document, strictly validated with zod in the daemon, containing `templateVersion`, `name`, `description`, `trigger` (cron with schedule, or `github_poll` with interval and events), a `prompt` with `{{placeholder}}` markers, a `placeholders` list (key, label, kind such as text, repository or time, required), and `suggested` permission flags (`allowApprovals`, `allowTools` where the trigger supports them). It has no fields for conversation, agent, secrets or ids.
- Built-in gallery: a small set shipped with the desk build (for example: daily inbox summary, weekly repository digest, evening reminder check, weekly reflection on open Work). The prompts are written for unattended turns.
- API: `GET /automations/templates` lists the built-ins (any device). `POST /automations/templates/validate` (owner/Full) takes an uploaded file and returns the parsed template or a specific error. `GET /automations/:id/template` (owner/Full) exports an existing automation with private fields removed. Creation still goes only through the existing create route and its validation. These routes sit under the existing `automations` segment.
- Placeholder filling happens in the desk form. Before create, the desk refuses any prompt that still contains a `{{` marker. The daemon refuses one as well, so the API can't be bypassed.
- Default bot: its automation proposal tool may name a built-in template as the starting point. The stored proposal payload is still the complete automation, so the management proposal approval and stale check are unchanged.
- Help: update the automations content in the `proactive` topic, or add an `automations` topic if it doesn't fit, which depends on the handbook capacity change in 0.8. Add a `talk-mode` section to the dictation topic.

## Testing Decisions

- Good tests assert what the owner sees and what the daemon accepts: which state talk mode is in after an event, what text is spoken, which templates validate, what an export contains. They don't assert component internals.
- Seams, highest first:
  1. Talk mode: the state reducer and the speakable-text function as plain unit tests, plus one desk component test with a mocked `speechSynthesis` and the existing dictation mocks. Prior art: the composer dictation tests and `docs/notes/composer-dictation.md` acceptance.
  2. Templates: the gateway over HTTP for list, validate and export, plus the existing create route refusing leftover placeholders. Prior art: `gateway.automations.test.ts`.
- Required cases: leaving the conversation releases the microphone; an approval in talk mode never resolves without an on-screen decision; a code block is spoken as a label; an invalid template file returns a specific error and fills nothing; export never includes webhook secrets, poll tokens, conversation or agent ids; a leftover `{{placeholder}}` is refused by the daemon.
- Rendered acceptance: talk mode on a real phone in the installed PWA (the speaking cycle at least twice) and the template gallery, form fill and import in desktop and phone layouts, recorded under `docs/notes/rendered-acceptance.md`. Voice quality depends on the browser and is not acceptance evidence.

## Out of Scope

- Hosted speech voices (ElevenLabs, OpenAI) and any speech service key.
- Wake words and always-on listening.
- Voice in Telegram or Slack.
- Deciding approvals by voice.
- A public template registry, template signing, or fetching templates from a URL.
- Templates for webhook, GitHub event or Slack triggers (they carry secrets and setup steps).
- Sub-templates or chaining templates (Goose sub-recipes).

## Further Notes

- Browser voices differ a lot. iOS Safari has good on-device voices, while some desktop Chromium builds use network voices that the browser vendor controls. The help topic should say that the browser supplies the voice.
- If talk mode proves popular, a hosted voice can be added later behind a provider key, in the same way dictation supports hosted transcription.
