# Plan v1 — Electronic register for Asociația de Proprietari Observatorului 105

## Goal
Owners of apartments 1–60 file complaints (sesizări) in the format of the internal regulation
(Art. 20–24 + annex). Each one gets an automatic registration number and date, is routed to the
responsible role, gets a written answer within the legal deadline, and keeps a full history.
No personal names anywhere: every account is a role or an apartment.

## Hosting / storage (no server, no database)
| Repo | Visibility | Contents |
|---|---|---|
| `RegistruElectronicDocumenteAsociatie` | public | app code, served by GitHub Pages |
| `RegistruElectronicDocumenteAsociatie-date` | private | `registru/<year>.json` + attachments |
| `RegistruElectronicDocumenteAsociatie-conturi` | public | `conturi.json`: usernames, roles, apartment, access key encrypted with each password |

One fine-grained GitHub token (Contents read/write on `-date` and `-conturi`) is created once by
the president. Setup encrypts it per account (PBKDF2 + AES-GCM). Passwords are never stored.

## Accounts
- `presedinte`, `resp01`…`resp13` (regulation roles 1–13), `cenzor`, `administrator`, `ap01`…`ap60`.
- A role is assigned to an apartment (e.g. `resp02` → ap. 23), editable by the president.
- Each account gets a unique random temporary password at setup (printable list, shown once).
- First login forces a password change (min. 10 chars, letters + digits).
- President can reset any password (new temporary password).

## Sesizare
- Fields (annex): apartment, type (sesizare / contestație listă de plată / propunere), domain,
  problem, proposed solution, estimated cost, "I handle it" (yes / no / can help), channel, files.
- Auto: registration no. + date, responsible from domain, deadline = date + 10 days
  (Law 196/2018 art. 57(1)(e); art. 28(3) for payment-list disputes). No solution → flagged for the
  monthly committee meeting (Art. 23).
- States: Repartizată → În lucru → Răspuns de semnat → Răspuns trimis → Închisă.
- Answer: responsible drafts → president signs → answer gets its own outgoing registration number,
  linked to the sesizare.
- Warnings: overdue (red), ≤3 days left (amber); dashboard counters.
- History: every action with time + account; internal notes hidden from the owner.

## Permissions (enforced in the UI)
- Owner: files and sees only own apartment's sesizări and answers.
- Responsible: sees all, works on the ones assigned to its role.
- President: everything (assign, sign, close, register paper/e-mail sesizări, other documents, users).
- Resp. 10 (correspondence): registers paper/e-mail sesizări and other documents.
- Cenzor, administrator: read all; administrator answers payment-list disputes.

## Known limitation (decision pending)
With GitHub only, every logged-in user holds the same access key, so the permission rules are
enforced by the app's screens, not by a server. A technical owner could bypass them (read other
apartments' sesizări, edit data). The fix is a small free server-side component (e.g. a Cloudflare
Worker) that holds the key and checks the role per request; the UI and data format stay the same.

## e-bloc
No public API found. Integration is out of scope; e-bloc remains a channel for filing sesizări
(staff register those manually, channel = e-bloc).

## Decisions update (2026-10-10, same day)
- Sesizări are **public** (no name, no apartment number, no internal notes/files) on the public page;
  only the administration part needs login. Owner/apartment accounts are postponed.
- Repos: `-date` (private, full register) and `-public` (public: `sesizari/<year>.json` mirror +
  `conturi.json`, served by its own GitHub Pages). The `-conturi` repo idea was dropped.
- Accounts: administration roles only; unique temporary password per account, printable slips.
- Owner's name is typed in each sesizare (private side only).
- Simple electronic signature (SHA-256 over the signed answer) + hash chain over registry entries;
  no separate blockchain (git history is already a hash chain).
- MVP stays GitHub-only; server-side enforcement deferred.
