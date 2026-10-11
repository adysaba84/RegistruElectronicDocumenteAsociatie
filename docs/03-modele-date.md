# 3. Modelul de date

[← Cuprins](README.md)

Toate fișierele sunt JSON indentat cu 2 spații și terminat cu `\n` (diff-uri lizibile în git). Datele calendaristice
sunt `YYYY-MM-DD`, momentele sunt ISO 8601 UTC (`new Date().toISOString()`). Utilizatorii apar mereu prin numele
de cont (`presedinte`, `resp02`, `ap17`), rolurile prin id (`presedinte`, `r02`, `administrator`).

## 3.1 Repo privat `…-date`

```
README.md                         creat la inițializare
registru/<an>.json                registrul unic de intrare-ieșire al anului
fisiere/<an>/<nr 6 cifre>/<nume>  fișierele atașate unei înregistrări
sedinte/<an>.json                 ședințele comitetului + contorul de procese-verbale
carte-imobil.json                 cartea de imobil (anexa 8)
```

### `registru/<an>.json`

```jsonc
{ "an": 2026, "inregistrari": [ /* înregistrări, numerotate 1, 2, 3… pe an, toate tipurile la un loc */ ] }
```

Câmpuri comune ale unei înregistrări:

| Câmp | Sens |
|---|---|
| `nr`, `data` | numărul din registru (unic pe an) și data înregistrării |
| `tip` | `intrare` / `iesire` / `intern` |
| `categorie` | `sesizare`, `contestatie`, `propunere`, `raspuns`, `document`, `cerere_carte`, `cerere_persoane` |
| `fisiere[]` | `{ nume, cale, marime, tipMime }` — `cale` în `fisiere/<an>/<nr>/` |
| `creatDe`, `creatLa` | cine și când a înregistrat |
| `amprenta` | SHA-256 peste `[amprenta anterioară, câmpurile inițiale]` — lanțul de amprente ([06](06-securitate.md#lanț-de-amprente)) |
| `istoric[]` | `{ la, u, actiune, intern? }` — `intern: true` nu apare în public și nici la proprietar |
| `conexat` | `"nr/an"` al înregistrării legate (răspuns ↔ sesizare, cerere carte ↔ cerere persoane) |

**Sesizare / contestație / propunere** (`CATEGORII_SESIZARE`):
`apartament`, `nume` (privat), `domeniu` (vezi `DOMENII` în `config.js`), `problema`, `solutie`, `cost`,
`maOcup` (`da`/`nu`/`ajut`), `canal` (`aplicatie`/`platforma`/`email`/`ebloc`/`hartie`), `responsabil` (id rol),
`stare`, `termen` (`null` pentru propuneri), `listaLunara` (fără soluție sau propunere → ședința lunară),
`raspunsDraft` `{ text, de, la }` (ciorna, se șterge la semnare),
`raspuns` `{ nr, an, data, text, redactatDe, semnatDe, semnatLa, webauthn | amprenta }`.

Stări sesizare: `repartizata → in_lucru → raspuns_propus → raspuns_trimis → inchisa` (se poate redeschide).

**Răspuns** (`categorie: raspuns`, `tip: iesire`): `apartament`, `destinatar`, `conexat` (sesizarea), `continut`,
`redactatDe`, `webauthn` (semnătura președintelui). Se creează în anul curent, chiar dacă sesizarea e din anul trecut.

**Document** (`categorie: document`): `emitent`, `destinatar`, `nrDocExtern`, `continut`, `conexat` (text liber).
Procesele-verbale închise se înregistrează automat ca document `intern`, emitent „Comitetul executiv”.

**Cerere carte de imobil** (`cerere_carte`, responsabil `r01`, termen 15 zile):
`apartament`, `nume` (solicitantul), `canal`, `stare` (`repartizata` = trimisă / `rezolvata` / `respinsa`),
`carte` `{ operatiune: 'inscriere' | 'radiere', persoane: [...] }`, `preluare: true` (introducere inițială din cartea
pe hârtie, fără termen), `semnatura` (dacă a depus-o proprietarul din aplicație), `rezolvare` `{ la, u, nota | motiv }`.
- persoană la înscriere: `{ nume, actSerie, actNumar, data, felAdresa: 'domiciliu' | 'resedinta', domiciliu, telefon?, email?, contact? }`
- persoană la radiere: `{ id (din carte-imobil.json), nume, data }`

**Declarație număr de persoane** (`cerere_persoane`, responsabil `administrator`, fără termen):
`persoane` `{ nr (0–30), de (data de la care se aplică) }`; rezolvată prin „Am înregistrat în e-bloc”.

`continut` la cereri = descriere fără nume (`descriereCerere`), ca registrul să poată fi arătat fără date personale.

### `sedinte/<an>.json`

```jsonc
{
  "an": 2026,
  "ultimNrPV": 3,                     // registrul unic de procese-verbale: 1/2026, 2/2026…
  "sedinte": [{
    "nr": 4, "data": "2026-10-20", "ora": "19:00", "zoom": "https://…",
    "ordineZi": ["Titlu punct 1", "…"],
    "sesizari": ["12/2026", "15/2026"],   // sesizările puse pe ordinea de zi
    "inchidereManuala": true,              // lipsă = ședință veche, afișată automat la ultima semnătură
    "convocataDe": "presedinte", "convocataLa": "…",
    "confirmari": [ /* semnătură passkey peste continutConvocare */ ],
    "prezenta":   [{ "u": "resp02", "la": "…" }],
    "pv": {
      "nr": 4, "participanti": [...], "cvorum": {...}, "semnatari": ["presedinte", "resp02", "cenzor"],
      "puncte": [{ "titlu": "…", "discutii": "…", "decizii": [
        { "text": "…", "pentru": 4, "impotriva": 0, "abtineri": 1, "responsabil": "r02", "termen": "2026-10-30" }
      ] }],
      "observatii": "…", "redactatDe": "…", "modificatDe": "…", "modificatLa": "…"
    },
    "semnaturi": [ /* passkey peste continutPV */ ], "semnaturiAnulate": [ /* + anulataLa */ ],
    "semnataLa": "…", "inchisaLa": "…", "inchisaDe": "presedinte",
    "inregistrare": { "nr": 31, "an": 2026 },   // nr. din registrul de intrare-ieșire
    "istoric": [...]
  }]
}
```

Starea nu se salvează, se calculează (`stareSedinta`): `convocata → pv_redactat → in_semnare → semnata → afisata`.

### `carte-imobil.json`

```jsonc
{ "versiune": 1, "persoane": [{
  "id": "uuid", "apartament": 17,
  "nume": "POPESCU ION", "actSerie": "CJ", "actNumar": "123456",
  "dataMutarii": "2024-03-01", "felAdresa": "domiciliu", "domiciliu": "…",
  "dataPlecarii": null,                         // completată la radiere; nimeni nu se șterge
  "telefon": "", "email": "", "contact": false, // opționale, nu fac parte din anexa 8
  "cerere": "21/2026", "cerereRadiere": "40/2026",
  "istoric": [{ "la": "…", "u": "resp01", "actiune": "Înscrisă la cererea nr. 21/2026" }]
}] }
```

## 3.2 Repo public `…-public`

| Fișier | Conținut | Scris de |
|---|---|---|
| `sesizari/<an>.json` | `{ an, actualizat, sesizari: [...] }` — `vederePublica()`: fără `nume`, `apartament`, fișiere, istoric intern; autorul apare ca „autor” | `Registru.publica` |
| `avizier/<an>.json` | `{ an, actualizat, sedinte: [{ nr, data, ora, ordineZi, pv, semnaturi, semnataLa, inchisaLa }] }` — doar ședințele închise | `Sedinte.publicaAvizier` |
| `conturi.json` | `{ versiune, utilizatori: [{ u, rol, apartament, temporara, comitet?, cheie: { salt, iv, iter, date } }] }` | `Conturi` |
| `chei.json` | `{ versiune, chei: [{ id, u, spki, alg, rpId, origin, dispozitiv, inregistrataLa, cod, revocataLa?, revocataDe? }] }` — doar adăugare | `Chei` |

`cheie.date` = `{ token }` criptat AES-GCM; `iter` = 600 000 (parolă aleasă) sau 100 000 (parolă temporară).

## 3.3 Obiectul semnătură passkey

```jsonc
{ "u": "presedinte", "cheie": "<credentialId b64url>", "cod": "AB12-…", "la": "…",
  "hash": "<b64url SHA-256 al conținutului canonic>",
  "authenticatorData": "…", "clientDataJSON": "…", "signature": "…" }
```

Conținuturile canonice semnate (orice modificare ulterioară invalidează semnătura):

| Ce | Funcție | Conținut |
|---|---|---|
| Răspuns la sesizare | `continutRaspuns` (store.js) | `['raspuns', 'nr/an', text, semnatDe, semnatLa]` |
| Răspuns vechi (semnătură simplă) | `continutSemnat` | `['raspuns', 'nr/an', 'nrR/anR', data, text, semnatDe, semnatLa]` → `amprenta` |
| Cerere proprietar | `continutCerere` | `['cerere', apartament, nume, hCarte, hPersoane, semnatDe, semnatLa]` |
| Luare la cunoștință | `continutConvocare` (sedinte.js) | `['convocare', 'nr/an', data, ora, ordineZi, zoom]` |
| Proces-verbal | `continutPV` | `['pv', 'nrPV/an', data, ora, ordineZi, participanti, cvorum, semnatari, puncte, observatii]` |

Cererea semnează **amprentele** celor două părți (`hCarte`, `hPersoane`), nu datele: fiecare din cele două înregistrări
își verifică semnătura singură, iar administratorul nu vede numele din partea pentru cartea de imobil.

## 3.4 Compatibilitate și migrări

Nu există un mecanism formal de migrare. Compatibilitatea se păstrează în cod:
- răspunsuri vechi cu `amprenta` (SHA-256) în loc de `webauthn` — verificate pe calea veche;
- înregistrări fără `amprenta` (dinaintea lanțului) — sărite de `verificaLant`;
- ședințe fără `inchidereManuala` — considerate închise la ultima semnătură.

O schimbare de format trebuie să urmeze același tipar (câmp nou opțional + citire tolerantă), vezi
[09](09-probleme-cunoscute.md) și [10](10-roadmap.md).
