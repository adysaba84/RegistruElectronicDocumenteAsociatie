# 2. Arhitectură

[← Cuprins](README.md)

## 2.1 Privire de ansamblu

```
                       ┌──────────────────────────────────────────────┐
  browser              │  GitHub Pages: RegistruElectronicDocumente-  │
  (telefon / PC) ─────▶│  Asociatie (public) — index.html, js/, css/  │
        │              └──────────────────────────────────────────────┘
        │  fetch + token (api.github.com)
        ├──────────────▶ …-date   (PRIVAT)  registru/<an>.json, fisiere/…, sedinte/<an>.json, carte-imobil.json
        │
        ├──────────────▶ …-public (PUBLIC)  sesizari/<an>.json, avizier/<an>.json, conturi.json, chei.json
        │                     │
        └── fără cont ────────┴─▶ api.github.com (60 cereri/oră) → rezervă: GitHub Pages al repo-ului public
```

| Repo | Vizibil | Cine scrie | Conține |
|---|---|---|---|
| `RegistruElectronicDocumenteAsociatie` | public | dezvoltatorul (git push) | codul aplicației |
| `RegistruElectronicDocumenteAsociatie-date` | **privat** | aplicația, cu tokenul comun | sursa de adevăr: registru, fișiere, ședințe, cartea de imobil |
| `RegistruElectronicDocumenteAsociatie-public` | public | aplicația, cu tokenul comun | vederi publice derivate + conturi (token criptat) + chei passkey publice |

Repo-ul privat e **sursa de adevăr**. `sesizari/<an>.json` și `avizier/<an>.json` sunt derivate și se pot regenera oricând.

## 2.2 Autentificare

1. Președintele creează un singur **token GitHub fine-grained** (Contents: read/write pe `-date` și `-public`).
2. La configurare, aplicația generează conturile și pune în `conturi.json` tokenul **criptat cu parola fiecărui cont**
   (PBKDF2-SHA256 → AES-GCM, `js/crypto.js`).
3. La conectare: se citește `conturi.json`, se decriptează tokenul cu parola introdusă; succes = parolă corectă.
4. Tokenul decriptat stă în `sessionStorage` (`registru.sesiune`) cât e deschisă fila.

Consecința: **toți utilizatorii conectați folosesc același token** → [06](06-securitate.md), [09](09-probleme-cunoscute.md) #1.

## 2.3 Fluxul unei scrieri (commit atomic)

Toate scrierile trec prin `GitHubRepo.transact(build, message)` din `js/github.js`:

```
head = GET ref                        ← SHA-ul commit-ului curent
{files, result} = build(head)         ← citește JSON-ul la `head`, aplică schimbarea, validează
blob-uri → tree (base_tree) → commit
PATCH ref (force: false)              ← eșuează dacă altcineva a scris între timp
   └─ conflict (409/422) → pauză 0,3–1 s → reia de la `head` (max. 5 încercări)
```

- Mai multe fișiere se scriu în **același commit** (ex. răspunsul semnat + sesizarea; cartea de imobil + cererea rezolvată).
- Funcția `build` rulează din nou pe date proaspete la conflict, deci validările (stare, text semnat) se refac.
- Fișierele atașate se urcă întâi ca blob-uri (`urcaFisiere`), apoi se leagă în tree în commit.

## 2.4 Publicarea derivatelor

- După orice modificare a unei sesizări, `Registru.cuPublicare` pune în coadă regenerarea `sesizari/<an>.json`
  (în fundal, una câte una, reîncercări la 0 / 2 / 5 / 15 s).
- La conectare, `sincronizeazaPublic` compară vederea publică cu registrul și o reface dacă diferă.
- Ședințele: `Sedinte.publicaInFundal` regenerează `avizier/<an>.json` (doar PV-urile închise) după fiecare modificare.
- Pagina publică citește întâi prin API (la zi imediat); la eroare sau peste limita de 60 cereri/oră, citește
  copia de pe GitHub Pages (întârziere 1–2 minute).

## 2.5 Cache

`Registru.cache[an] = { head, reg }`: registrul unui an nu se recitește dacă `head` nu s-a schimbat; după un commit
propriu, registrul scris devine cache pentru noul head (`retine`).

## 2.6 Module

| Modul | Responsabilitate | Depinde de |
|---|---|---|
| `config.js` | constante: asociația, repo-uri, `ROLURI`, `DOMENII` (domeniu → rol), termene, `apiBase()` | — |
| `github.js` | `GitHubRepo`: `readJson`, `readBytes`, `listDir`, `createBlob`, `commitFiles`, `transact`; contor de cereri active | — |
| `crypto.js` | `cripteaza` / `decripteaza`, `parolaTemporara` (XXXX-XXXX-XXXX, fără 0/O/1/I/L) | `github.js` |
| `conturi.js` | `Conturi`: încărcare, autentificare, schimbare/resetare parolă, card de acces, comitet, configurare inițială | `github`, `crypto`, `config` |
| `store.js` | `Registru` + funcții pure: categorii, stări, termene, vedere publică, cereri, amprente, lanț | `config` |
| `carte-imobil.js` | `CarteImobil`: înscriere, radiere, corecție — scrie cartea și cererea în același commit | `store` |
| `passkey.js` | `creeazaCheie`, `semneaza`, `verifica`, `Chei` (chei.json) | `github`, `config` |
| `sedinte.js` | `Sedinte`: convocare, confirmare, prezență, PV, semnare, închidere, avizier; `stareSedinta`, `cvorum` | — |
| `pv-text.js` | `pvInText`, `textInPV` (pure) | `comenzi-voce` |
| `comenzi-voce.js` | `parseaza`, `parseazaVot`, `parseazaTermen`, `potrivesteRol`, `norm` (pure) | — |
| `dictare.js` | `Dictare` peste `SpeechRecognition` (ro-RO), deduplicare, pauză 1,3 s | `comenzi-voce` |
| `app.js` | starea globală `S`, `h()` (creare DOM), rutare `ruta()`, toate paginile, verificări de permisiune | toate |

## 2.7 Rute

| Rută | Pagina | Acces |
|---|---|---|
| `#/` | lista publică a sesizărilor | oricine |
| `#/p/<an>/<nr>` | detaliu public sesizare | oricine |
| `#/cum` | cum depui o sesizare (formular → e-mail) | oricine |
| `#/avizier`, `#/avizier/<an>/<nr>` | procese-verbale închise + verificare semnături | oricine |
| `#/admin` | conectare / tabloul de bord (sesizări) / „Sesizările mele” | conectat |
| `#/admin/parola` | schimbare parolă (obligatorie la parola temporară) | conectat |
| `#/admin/profil` | passkey-urile mele | conectat |
| `#/admin/sesizare-noua` | formular sesizare | proprietar, președinte, resp10 |
| `#/admin/s/<an>/<nr>` | detaliu înregistrare (sesizare / document / cerere) | după vizibilitate |
| `#/admin/registru`, `#/admin/document-nou` | registrul complet, CSV, document nou | administrație; document: președinte, resp10 |
| `#/admin/carte-imobil` | cartea de imobil | proprietar (ap. propriu), resp01, președinte, administrator (citire) |
| `#/admin/cerere-noua/{carte,persoane,preluare}` | cereri | vezi [04](04-roluri-permisiuni.md) |
| `#/admin/persoane` | declarații număr de persoane | proprietar, președinte, administrator, cenzor |
| `#/admin/utilizatori` | conturi, carduri de acces, comitet | președinte |
| `#/admin/sedinte[/noua \| /<an>/<nr>[/convocare \| /pv]]` | ședințe | membri comitet + cenzor |

## 2.8 Securitatea paginii

`index.html` are CSP strict: `script-src 'self'`, `connect-src 'self' https://api.github.com` (+ localhost pentru
dezvoltare), `object-src 'none'`, `form-action 'none'`, `referrer: no-referrer`. Fără biblioteci externe.
Parametrul `?api=` (API simulat) e acceptat **doar** pe localhost (`config.js → apiLocal`).
