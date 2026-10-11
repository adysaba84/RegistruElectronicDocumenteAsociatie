# 4. Roluri și permisiuni

[← Cuprins](README.md)

> **Important:** permisiunile de mai jos sunt aplicate de **interfață** (`app.js`, funcțiile `poate*` / `vede*`),
> nu de un server. Oricine e conectat deține tokenul comun și, tehnic, poate citi și scrie orice. Vezi
> [06 — Securitate](06-securitate.md) și [09](09-probleme-cunoscute.md) #1.

## 4.1 Conturi

| Cont | Rol (`rol`) | Creat |
|---|---|---|
| `presedinte` | `presedinte` | la configurare |
| `resp01` … `resp13` | `r01` … `r13` (Regulamentul intern, Cap. IV) | la configurare |
| `cenzor` | `cenzor` | la configurare |
| `administrator` | `administrator` | la configurare |
| `ap01` … `ap60` | `proprietar` | la cerere, când președintele generează cardul de acces |

- Un rol se atribuie unui **apartament**, nu unei persoane (`apartament` pe cont, pagina Utilizatori).
- **Membru comitet executiv** = bifa `comitet` pe un cont existent; președintele e membru de drept; cenzorul,
  administratorul și proprietarii nu pot fi membri. Cvorum = ⌊n/2⌋ + 1.
- Parole: temporare la creare (`XXXX-XXXX-XXXX`), schimbate obligatoriu la prima conectare (min. 10 caractere,
  litere și cifre, fără numele contului). Președintele poate reseta orice parolă.

Responsabilii de domeniu (`config.js → ROLURI`):

| Rol | Domeniu | Rol | Domeniu |
|---|---|---|---|
| r01 | cartea de imobil | r08 | spații verzi |
| r02 | instalații de apă | r09 | boxe și spații comune |
| r03 | instalații electrice | r10 | convocări și corespondență |
| r04 | instalații de gaz | r11 | acoperiș și structură |
| r05 | interfon | r12 | fațade |
| r06 | camere de supraveghere | r13 | restanțieri |
| r07 | curățenie și gunoi | | |

Repartizarea automată pe domenii: lift și „altele” → președinte; lista de plată → administrator (`DOMENII`).

## 4.2 Matricea de permisiuni

Legendă: ✅ poate · 👁 doar citire · 🏠 doar apartamentul propriu · ◐ doar cele repartizate rolului său · — nu

| Acțiune | Public | Proprietar | Președinte | Resp. domeniu | Resp01 (carte) | Resp10 (coresp.) | Cenzor | Administrator |
|---|---|---|---|---|---|---|---|---|
| Vede sesizările (fără nume) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Vede sesizările cu nume, note, fișiere | — | 🏠 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Depune / înregistrează sesizare | e-mail | 🏠 | ✅ | — | — | ✅ | — | — |
| Înregistrează document | — | — | ✅ | — | — | ✅ | — | — |
| Repartizează sesizare | — | — | ✅ | — | — | — | — | — |
| Preia, redactează răspuns | — | — | ✅ | ◐ | ◐ | ◐ | — | ◐ |
| Semnează răspunsul (passkey) | — | — | ✅ | — | — | — | — | — |
| Notă internă | — | — | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| Registrul complet + CSV | — | — | ✅ | ✅ | ✅ | ✅ | 👁 | ✅ |
| Cartea de imobil | — | 🏠 👁 | ✅ | — | ✅ | — | — | 👁 + tipar |
| Cerere carte din aplicație (passkey) | — | 🏠 | — | — | — | — | — | — |
| Cerere carte pe hârtie / preluare | — | — | ✅ | — | ✅ | — | — | — |
| Rezolvă / respinge cerere carte | — | — | ✅ | — | ✅ | — | — | — |
| Declarație nr. persoane — vede | — | 🏠 | ✅ | — | — | — | 👁 | ✅ |
| Declarație nr. persoane — depune / înregistrează pe hârtie | — | 🏠 | ✅ | — | doar cu o cerere de carte ¹ | — | — | ✅ |
| „Am înregistrat în e-bloc” | — | — | ✅ | — | — | — | — | ✅ |
| Utilizatori, carduri de acces, comitet | — | — | ✅ | — | — | — | — | — |
| Convoacă / modifică convocarea | — | — | ✅ | — | — | — | — | — |
| Confirmă, prezență, redactează PV | — | — | ✅ | dacă e membru comitet | idem | idem | confirmă, semnează | — |
| Semnează PV | — | — | dacă e prezent | dacă e membru prezent | idem | idem | ✅ | — |
| Închide PV și afișează la avizier | — | — | ✅ | — | — | — | — | — |
| Avizier | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Propriile passkey-uri (adaugă / revocă) | — | ✅ | ✅ + ale tuturor | ✅ | ✅ | ✅ | ✅ | ✅ |

¹ Responsabilul cărții înregistrează numărul de persoane doar ca parte a unei cereri de carte pe hârtie (bifa „Se schimbă
și numărul de persoane”); cererea conexată merge la administrator și apare la el ca „la administrator”
(`poateInregistraDeclaratie` în `app.js`).

## 4.3 Unde sunt regulile în cod

| Regulă | Unde |
|---|---|
| `poateInregistra`, `poateLucra`, `poateNota`, `vedeCarte`, `vedePersoane`, `vedeCerere`, `vizibila` | `js/app.js` (~r. 123–146) |
| `ROLURI_CARTE` / `ROLURI_CARTE_CITIRE` | `js/carte-imobil.js` |
| Rutare cu verificare de rol | `ruta()` în `js/app.js` |
| Doar președintele închide PV, doar semnatarii semnează | `Sedinte.inchidePV`, `Sedinte.semneazaPV` |
| Proprietarul nu poate depune cerere nesemnată | `Registru.adaugaCerere` |
| Membri comitet | `Conturi.membriComitet` |
