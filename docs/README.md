# Documentația proiectului — Registru electronic

Registru electronic de sesizări și documente pentru **Asociația de Proprietari Observatorului 105** (Cluj-Napoca):
sesizări cu termene legale, răspunsuri semnate cu passkey, ședințe ale comitetului executiv cu proces-verbal semnat,
cartea de imobil (HG 295/2021, anexa 8) și declarațiile de număr de persoane. Aplicație statică pe GitHub Pages,
datele în repo-uri GitHub, fără server propriu.

> Starea la **11.10.2026** (commit `81cd511`, versiunea scripturilor `?v=25`).
> `README.md` din rădăcină rămâne ghidul scurt pentru utilizatori; documentele de aici sunt pentru cine întreține proiectul.

## Cuprins

| # | Document | Pe scurt |
|---|---|---|
| 1 | [Prezentare generală](01-prezentare.md) | ce rezolvă aplicația, pentru cine, principii |
| 2 | [Arhitectură](02-arhitectura.md) | GitHub Pages + 3 repo-uri, module JS, fluxul unei scrieri |
| 3 | [Modelul de date](03-modele-date.md) | fiecare fișier JSON, câmpuri, stări |
| 4 | [Roluri și permisiuni](04-roluri-permisiuni.md) | conturi, matricea „cine ce poate” |
| 5 | [Funcționalități](05-functionalitati.md) | ce are aplicația, pe module, cu starea fiecăreia |
| 6 | [Securitate și integritate](06-securitate.md) | modelul de încredere, criptare, passkey, lanț de amprente |
| 7 | [Dezvoltare](07-dezvoltare.md) | rulare locală, convenții de cod, publicare |
| 8 | [Operare și mentenanță](08-operare.md) | configurare, rotirea cheii, backup, schimbarea anului |
| 9 | [Probleme cunoscute](09-probleme-cunoscute.md) | limite și bug-uri, cu gravitate și ocolire |
| 10 | [Ce lipsește / roadmap](10-roadmap.md) | ce nu are încă aplicația și ce am vrea, pe priorități |
| 11 | [Cadrul legal](11-cadru-legal.md) | articolele din lege, HG și regulament implementate |
| 12 | [Glosar](12-glosar.md) | termeni RO din cod ↔ sens |
| 13 | [Istoric versiuni](13-istoric.md) | ce s-a construit, în ordine |

### Planuri de proiectare (deja existente)

| Plan | Stare |
|---|---|
| [plans/plan-v1.md](plans/plan-v1.md) | MVP sesizări + conturi — **construit** |
| [plans/plan-sedinte-passkey.md](plans/plan-sedinte-passkey.md) | passkey + ședințe comitet — **construit** |
| [plans/plan-dictare-vocala.md](plans/plan-dictare-vocala.md) | dictare vocală în PV (v2) — **construit** |
| [plans/plan-produs-multi-asociatie.md](plans/plan-produs-multi-asociatie.md) | produs pentru mai multe asociații: roluri, blocuri, scări, module, profile presetate, stivă tehnică și hosting — **direcție aprobată** |

## Pornire rapidă

| Vreau să… | Citește |
|---|---|
| înțeleg proiectul în 5 minute | [01](01-prezentare.md), apoi [05](05-functionalitati.md) |
| rulez local și modific cod | [07](07-dezvoltare.md), [02](02-arhitectura.md), [03](03-modele-date.md) |
| știu dacă pot pune date reale | [06](06-securitate.md), [09](09-probleme-cunoscute.md) — **încă nu, pentru cartea de imobil** |
| decid ce construim mai departe | [10](10-roadmap.md) |
| răspund la o întrebare juridică | [11](11-cadru-legal.md) |

## Harta codului

```
index.html              punct de intrare, CSP, ?v= pe scripturi
css/app.css             designul „Bloc” (antet verde, plăci, bară jos pe telefon, stiluri de tipar)
js/
  app.js                interfața: rutare (#/…), toate paginile, permisiuni în UI   (~2600 rânduri)
  config.js             asociația, repo-uri, roluri, domenii → responsabil, termene
  github.js             client GitHub: citire, commit atomic, reîncercare la conflict
  crypto.js             PBKDF2 + AES-GCM pentru cheia de acces, parole temporare
  conturi.js            conturi.json: autentificare, parole, carduri de acces, comitet
  store.js              registrul: sesizări, documente, cereri, răspunsuri, lanț de amprente, publicare
  carte-imobil.js       cartea de imobil (anexa 8): înscriere, radiere, corecție
  passkey.js            WebAuthn: înregistrare chei, semnare, verificare (chei.json)
  sedinte.js            ședințe comitet: convocare, prezență, PV, semnare, avizier
  pv-text.js            PV ca text simplu ⇄ structură semnată
  comenzi-voce.js       parser pur pentru comenzile vocale
  dictare.js            Web Speech API, cu deduplicare pentru Chrome Android
dev/
  mock_github.py        GitHub simulat în memorie + server static (port 8787)
  autentificator-test.js  passkey simulat pentru teste
  mockup-*.html         machete de interfață (dictare, editor PV)
docs/                   această documentație + planuri
```
