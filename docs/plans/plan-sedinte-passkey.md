# Plan — Committee meetings + passkey signing

Status: **approved 2026-10-10**, in progress. Builds on plan-v1 (GitHub Pages + JSON in GitHub, design "Bloc").

## 0. Scope and phases
1. **Passkeys (WebAuthn)** — register keys per account, sign with them, verify publicly. Replaces the
   simple SHA-256 signature on answers to sesizări (old ones stay verifiable).
2. **Committee membership flag** on existing accounts (no new roles).
3. **Committee meetings** — convocation, acknowledgements, attendance + quorum, minutes (proces-verbal)
   with numbered register, passkey signing, public notice board (avizier).

Each phase ships separately; phase 1 is a prerequisite for signing in phase 3.

## 1. Passkeys

### Registration (Profile page, new: `#/admin/profil`)
- `navigator.credentials.create` with `rp.id = location.hostname`, `user.id = utf8(username)`,
  `pubKeyCredParams: [ES256 (-7), RS256 (-257)]`, `authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' }`,
  `attestation: 'none'`.
- Stored per key (append-only list):
  `{ id (credentialId, b64url), u, spki (b64, from response.getPublicKey()), alg, rpId, origin, dispozitiv (user-typed name),
     inregistrataLa, cod (key code), revocataLa? }`
- **Key code** = first 16 hex chars of SHA-256(SPKI), shown as `XXXX-XXXX-XXXX-XXXX`; the member writes it on the
  paper agreement. A key swapped later produces a different code → detectable.
- Where: public keys are not secret and the public page must verify, so the list lives in the **public repo**
  `chei.json` (mirrored nowhere else; git history keeps every change). Revoking sets `revocataLa`, never deletes.
- Multiple keys per user (phone, PC). A user can revoke their own keys; the president can revoke anyone's.

### Signing
- Canonical content → `SHA-256` → used as the WebAuthn `challenge` in `navigator.credentials.get`
  (`allowCredentials` = the signer's non-revoked keys, `userVerification: 'required'`) → fingerprint / face / PIN / Windows Hello.
- Stored signature: `{ u, cheie (credentialId), cod, la, hash, authenticatorData, clientDataJSON, signature }` (all b64url).

### Verification (shared by admin and public pages, pure WebCrypto)
1. Find the key by `credentialId` in `chei.json` and check it belongs to `u` and was not revoked before `la`.
2. `clientDataJSON`: `type === 'webauthn.get'`, `challenge === b64url(hash)`, `origin === key.origin`.
3. `authenticatorData`: `rpIdHash === SHA-256(key.rpId)`, flags UP and UV set.
4. Recompute `hash` from the document's canonical content (detects any later text change).
5. Verify `signature` over `authenticatorData || SHA-256(clientDataJSON)` with the SPKI
   (ES256: convert DER signature to raw r||s; RS256: RSASSA-PKCS1-v1_5).
- Result shown as **"✓ semnat de <role> la <time> · cheia XXXX-…"** or **"✗ semnătură invalidă"**.

### Domain changes
- Passkeys are bound to `rp.id`. Each key stores its own `rpId` and `origin`, and verification uses those stored
  values, so **old signatures stay verifiable** after a domain move; users just register a new key on the new domain.

### Answers to sesizări
- President's "Semnează și înregistrează" now requires a passkey assertion (if the president has no key yet, the app
  sends them to the profile page first).
- Old answers (simple SHA-256 `amprenta`) keep verifying with the current code path; new ones carry `semnatura` (WebAuthn).

### Known limitation (same root as plan-v1)
Anyone holding the shared GitHub access key could add a fake public key for another member to `chei.json`.
That is exactly what the **key code on the paper agreement** guards against: the page shows each key's code, and a
code that doesn't match the paper is evidence of tampering. Moving to a real backend later removes the gap.

## 2. Committee membership
- `conturi.json`: optional boolean `comitet` on existing accounts; checkbox "Membru comitet executiv" in Utilizatori
  (president only). The account keeps its base role.
- President is always a member (not toggleable). Cenzor is not a member but participates and signs the minutes.
- Committee = `presedinte` + accounts with `comitet: true`. Quorum = ⌊n/2⌋ + 1.

## 3. Committee meetings (`#/admin/sedinte`)

### Data (private repo)
- `sedinte/<year>/<id>.json` — one file per meeting (keeps files small, avoids rewriting a year file).
- `sedinte/<year>/index.json` — light list (id, date, status, PV number) for the overview.
- PV numbers come from the **registrul unic de procese-verbale**: a per-year counter in the index
  (open question below).

### Lifecycle
`convocata → in_desfasurare → pv_redactat → in_semnare → semnata → afisata`

1. **Convocation** (president): date/time, agenda items (ordered list), Zoom link (text). Warning if the meeting is
   less than **5 days** away (art. 55, Law 196/2018). Members press **"Am luat la cunoștință"** → stored with account +
   timestamp as proof.
2. **Attendance**: from meeting start, each member presses **"Sunt prezent"**. The page shows present / total and
   whether **quorum** is met.
3. **Minutes** (president or a delegated member): template pre-filled with participants (present members + cenzor),
   quorum, agenda items. Per item: discussion summary, decisions; per decision: vote for / against / abstain,
   responsible role, deadline. No audio/video, no AI.
4. **Signing**: all present members + cenzor, each with their passkey. Canonical content = PV text + structured data.
   **Text locks at the first signature.** Editing after that clears all signatures (logged in the meeting history)
   and requires signing again.
5. **Notice board**: after the last signature, decisions are published to the public repo `avizier/<year>.json` and
   shown on a new public page **Avizier** with the verification code and per-signature ✓/✗. Warning in admin when the
   **7-day** display deadline (art. 55) is approaching or passed.

### Public page
- New tab **Avizier**: list of signed decisions (PV number, date, decision text, votes, responsible, deadline) and the
  signature check. No names (roles + apartment only, as elsewhere).

## 4. UI (design "Bloc")
- Profile: list of my keys (device, date, key code, revoke) + "Adaugă passkey".
- Utilizatori: "Membru comitet executiv" checkbox; per account, its registered key codes.
- Ședințe: overview cards (date, status, quorum badge), meeting page with stepper by status, sticky action button.
- Signature blocks: green ✓ / red ✗ cards with role, time, key code.

## 5. Testing
- Verification logic tested with WebCrypto-generated ECDSA/RSA keys producing WebAuthn-shaped
  `authenticatorData`/`clientDataJSON` (the mock server can't provide a real authenticator).
- Real passkey ceremony verified on the live site (HTTPS) by the president on phone and PC.

## 6. Decisions (2026-10-10)
1. PV numbering restarts every year: **1/2026, 2/2026, …**
2. Minutes can be drafted/edited by **any committee member** (incl. the president).
3. "Am luat la cunoștință" is **confirmed with a passkey** (signed over the convocation content; editing the
   convocation invalidates earlier confirmations).

## 7. Implementation notes
- Meetings are stored in one file per year, `sedinte/<year>.json` (≈12 meetings/year, small), which also keeps the
  PV counter atomic with the meeting it belongs to.
- The whole signed PV is published to the avizier (roles only, no names) so anyone can verify the signatures;
  required signers (present committee members + cenzor) are snapshotted into the PV and are part of the signed content.
- "+ Document" moves from the nav to the Registru page to make room for "Ședințe" in the mobile tab bar.
