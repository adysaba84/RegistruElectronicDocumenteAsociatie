# 6. Securitate și integritate

[← Cuprins](README.md)

## 6.1 Modelul de încredere (pe scurt)

| Garanție | Asigurată de | Cât de puternică |
|---|---|---|
| Cine poate scrie în date | tokenul GitHub, deținut de **orice** cont conectat | slabă: un singur secret comun |
| Ce poate face fiecare rol | interfața (`app.js`) | doar pentru utilizatori onești |
| Confidențialitatea datelor private | repo privat GitHub | față de public: bună; față de alți utilizatori conectați: **niciuna** |
| Autenticitatea semnăturilor | passkey (WebAuthn) + cheile publice din `chei.json` + **codul cheii pe hârtie** | bună, dacă codurile de pe hârtie sunt verificate |
| Integritatea documentelor semnate | hash-ul conținutului canonic în semnătură | bună |
| Integritatea registrului | lanț de amprente + istoric git | detectează modificări naive; nu rezistă celui care rescrie tot lanțul (vezi 6.5) |

Concluzie: potrivit pentru o **administrație de încredere** și pentru date publice. Pentru conturile apartamentelor
și datele personale din cartea de imobil e nevoie de o componentă pe server ([10](10-roadmap.md) — P0).

## 6.2 Parole și tokenul de acces

- Tokenul GitHub fine-grained: Contents read/write doar pe `-date` și `-public`.
- În `conturi.json` (public) e criptat per cont: PBKDF2-SHA256 (600 000 iterații pentru parole alese, 100 000 pentru
  cele temporare, care au ~59 de biți de entropie) → AES-GCM-256, salt 16 B, IV 12 B. Parolele nu se stochează.
- Parola greșită = AES-GCM eșuează la decriptare; nu există altă verificare și nici limitare a încercărilor —
  atacul se poate face **offline** pe `conturi.json` ([09](09-probleme-cunoscute.md) #3).
- După conectare, tokenul stă în `sessionStorage` (dispare la închiderea filei).

## 6.3 Passkey (WebAuthn)

- Înregistrare: `rp.id = location.hostname`, ES256 sau RS256, `userVerification: 'required'`, fără atestare.
  Cheia publică (SPKI) și `rpId` / `origin` se salvează în `chei.json`; **codul cheii** = primele 16 caractere hex din
  SHA-256(SPKI), scris de titular pe acordul de pe hârtie.
- Semnare: provocarea WebAuthn = SHA-256 al conținutului canonic ([03](03-modele-date.md#33-obiectul-semnătură-passkey)).
- Verificare (`passkey.js → verifica`, rulează și pe pagina publică): cheia există și aparține semnatarului, nu era
  revocată, hash-ul conținutului actual coincide, `clientDataJSON` (tip, challenge, origin), `rpIdHash`, flag-urile
  UP + UV, apoi semnătura criptografică.
- Schimbarea domeniului nu invalidează semnăturile vechi (fiecare cheie își păstrează `rpId`/`origin`).

**Atac rezidual:** cine are tokenul poate adăuga în `chei.json` o cheie falsă pe numele altcuiva. Apărarea este
procedurală: codul cheii afișat lângă fiecare semnătură trebuie să corespundă celui de pe acordul semnat pe hârtie.

## 6.4 Ce se publică

`vederePublica()` din `store.js` este singurul loc care decide ce iese din repo-ul privat pentru sesizări:
fără `nume`, `apartament`, fișiere, note interne; autorii apartamente apar ca „autor”. Cererile (carte, persoane) nu
se publică deloc. Avizierul conține PV-ul întreg, care folosește doar roluri.

**Atenție:** câmpurile text libere (`problema`, `solutie`, textul răspunsului, discuțiile din PV) se publică așa cum
sunt scrise ([09](09-probleme-cunoscute.md) #6).

## 6.5 Lanț de amprente

Fiecare înregistrare din registru are `amprenta = SHA-256([amprenta anterioară, câmpurile inițiale])`; câmpurile care
se schimbă legitim (stare, istoric, răspuns, fișiere…) sunt excluse (`campuriInitiale`). Pagina Registru verifică lanțul.

Limită: amprentele sunt calculate în browser, deci cine are tokenul poate recalcula tot lanțul. Martorul independent
real este **istoricul git** — doar dacă nu poate fi rescris: activați protecția ramurii (fără force-push) pe repo-ul
de date ([08](08-operare.md#84-protecții-recomandate-pe-github)). Un pas mai departe: publicarea periodică a ultimei
amprente (ex. la avizier sau în PV) — vezi [10](10-roadmap.md).

## 6.6 Pagina web

- CSP strict, fără scripturi sau stiluri externe, `form-action 'none'`, `no-referrer`.
- DOM construit cu `h()` (atribute și `textContent`), fără `innerHTML` din date → fără XSS prin conținut.
- Export CSV protejat contra injecției de formule (prefix `'` pe `= + - @`).
- Numele fișierelor atașate sunt normalizate (`numeFisierSigur`).
- `?api=` (API simulat) funcționează exclusiv pe localhost.

## 6.7 Date personale (GDPR) — de rezolvat înainte de date reale

- Datele stau la GitHub (SUA). Sunt necesare: temei legal și informare a persoanelor, evidența prelucrărilor,
  evaluarea transferului; termen de păstrare.
- „Nimic nu se șterge” + istoricul git fac imposibilă ștergerea efectivă (inclusiv a datelor de contact opționale).
- Cartea de imobil: art. 93 lit. c) din HG 295/2021 limitează cine o vede; aplicația respectă asta doar în interfață.
