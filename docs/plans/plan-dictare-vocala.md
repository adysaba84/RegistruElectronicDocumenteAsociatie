# Plan — Voice dictation with commands for the minutes (proces-verbal)

Status: **built 2026-10-10** (local, not yet pushed). Builds on [plan-sedinte-passkey.md](plan-sedinte-passkey.md)
(phase 3, step 3 "Minutes"): it only adds a faster way to fill the same PV structure. Nothing here changes
signing, storage or the lifecycle. Interactive mockup: see the artifact linked from the session that wrote this plan.

## 0. Goal and constraints
- While (or right after) the meeting, the person drafting the PV holds a 🎤 button and speaks; the text lands in
  the right place of the PV draft. Short spoken commands structure it (new item, decision, vote, responsible, deadline).
- **Free, no server, no API key**: browser Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`), `lang = 'ro-RO'`.
- **Push-to-talk only.** The app listens only while the button is held (or toggled on, with a visible red state).
  No continuous listening of the meeting, no audio stored anywhere — consistent with the "no audio/video recording"
  rule in the RO clause (art. (10)).
- Dictation never writes straight into a signed PV: it only edits the draft (`pv_redactat`), before the text locks.

## 1. Browser support and privacy (show this in the UI once)
| Browser | Works | Who processes the audio |
|---|---|---|
| Chrome (Android, desktop) | yes | Google servers |
| Edge (desktop) | yes | Microsoft servers |
| Safari (iOS 14.5+, macOS) | yes | Apple (on-device or servers) |
| Firefox | no | — (button hidden, keyboard dictation still works) |

- Feature-detect; if missing, hide 🎤 and show a hint: "Folosește microfonul din tastatura telefonului".
- One-time notice before first use: audio is sent to the browser vendor for recognition; nothing is stored by the app.
- Microphone shared with Zoom: fine on desktop; on phones the OS may give the mic to only one app → recommend
  running Zoom on the PC and dictating there (or dictating after the meeting).

## 2. Command grammar (Romanian, matched after normalisation)
Normalise: lowercase, strip diacritics, collapse spaces; a leading command word may be followed by ":" / "," or nothing.

| Spoken (examples) | Action |
|---|---|
| `consemnează …` / `notează …` | append the rest as a paragraph to the **current agenda item's discussion** |
| `punct nou …` / `punctul următor` / `punctul 3` | add a new agenda item with the rest as title / move to next / jump to item 3 |
| `decizie …` / `hotărâre …` | add a decision to the current item; it becomes the **current decision** |
| `vot <n> pentru, <n> împotrivă, <n> abțineri` / `vot unanim` | set votes on the current decision (`unanim` = all present for) |
| `responsabil <rol>` | set responsible on the current decision (fuzzy match against role labels, e.g. "responsabil lift") |
| `termen <date>` | set deadline (`20 octombrie`, `20.10`, `peste 10 zile`, `sfârșitul lunii`) |
| `șterge ultima` / `anulează` | undo the last dictated change (undo stack per session) |
| `stop dictare` | release / stop listening |
| anything else | **not** inserted; shown as "nerecunoscut — apasă pentru a consemna" so stray speech never lands silently |

- Numbers: accept digits and Romanian words 0–20 (`unu/una`, `doi/două`, …, `douăzeci`); "zero"/"niciuna" = 0.
- Vote sanity: for + against + abstain ≤ present count, else warn (do not block).
- A single utterance can chain: `decizie se aprobă oferta X, vot unanim, responsabil lift, termen 30 octombrie`
  → split on the command words, apply in order.

## 3. UI (design "Bloc")
- Sticky bottom bar on the PV editor: big round **🎤** (hold to talk; tap = toggle on desktop), current target
  chip ("→ Punctul 2 · Decizia 1"), and an **undo** button.
- While listening: red pulsing mic, live interim transcript in a bubble above the bar.
- After each utterance: a toast "Consemnat la punctul 2" / "Vot setat: 5–1–0" with **Anulează**; the changed
  block flashes briefly.
- Help sheet (`?`): the command table above, in Romanian, with examples.
- Everything dictated stays editable as normal text fields.

## 4. Code shape
- `js/dictare.js` — wraps `SpeechRecognition` (start/stop, interim/final events, restart on `onend` while held,
  error mapping: `not-allowed`, `no-speech`, `network`).
- `js/comenzi-voce.js` — **pure** parser: `parseaza(text, context) → [{ tip, ... }]` and
  `aplica(pvDraft, comenzi) → { pvDraft, descriere }` (immutable, so undo = keep previous drafts).
  Pure → unit-testable without a microphone.
- PV editor in `js/sedinte.js` mounts the bar only in states where the draft is editable.

## 5. Testing
- Parser: table-driven tests over ~40 Romanian phrases (with/without diacritics, number words, chained commands,
  unknown speech) in `dev/`.
- Manual: Chrome Android + Chrome desktop + Safari iOS on the live HTTPS site (mic permission needs HTTPS).

## 6. Open questions
1. Hold-to-talk on phones vs tap-to-toggle everywhere? (mockup has both; pick after trying it)
2. Should `consemnează` also be allowed outside an agenda item (e.g. a "Diverse" bucket)?
