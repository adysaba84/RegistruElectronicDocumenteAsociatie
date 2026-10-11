# 13. Istoric versiuni

[← Cuprins](README.md)

Rezumat pe etape al istoricului git (`git log` are detaliile). Cele mai noi sus.

## 11.10.2026 — Documentație (`?v=25`)

- Documentația de proiect în `docs/` și `CLAUDE.md`.
- Fix #14: declarația separată de număr de persoane o înregistrează doar președintele și administratorul.

## 11.10.2026 — Cartea de imobil și numărul de persoane

- `81cd511` Radiere doar din persoanele înscrise; preluare inițială din cartea pe hârtie.
- `2068a6d` Radiere: explicație când lista persoanelor e goală.
- `1706a9e` Orice înscriere sau mutare doar prin cerere semnată, cu formular tipărit pentru hârtie.
- `53b1d60` Date de contact opționale, tipărire oficială și extinsă, acces de citire pentru administrator.
- `68f68a4` Meniu „Carte imobil” și „Nr. persoane”; cererea în formatul anexei 8.
- `e43c6ba` Cereri pentru cartea de imobil și numărul de persoane; cartea în formatul anexei 8.

## 10.10.2026 — Ședințe comitet, passkey, dictare

- `53aa266` PV: tipărire / PDF, avizier în meniul celor conectați, înregistrare automată în registru la închidere.
- `0e09b10` Dictare: comenzi doar la începutul frazei, forme flexionate, punctuație dictată, responsabil din listă.
- `58a64ee` Ordinea de zi din sesizări, PV într-un editor mare, închidere manuală la avizier.
- `63133f9` Dictare vocală în procesul-verbal ([plan](plans/plan-dictare-vocala.md)).
- `c3adc6b` Profil: text despre sincronizarea passkey-urilor.
- `c15a65a` Semnare cu passkey, membri comitet, ședințe cu PV semnat și avizier public ([plan](plans/plan-sedinte-passkey.md)).
- `3723b68` Planul ședințe + passkey.

## 10.10.2026 — Design, apartamente, pagina publică

- `2da7a99` Design nou „Bloc”: antet verde, plăci colorate, iconițe pe domenii, bară de navigare jos pe telefon.
- `c72b217` Acces apartamente prin WhatsApp la președinte: card de acces generat pe loc.
- `683fa49` Pagina publică citește direct din repo, cu rezervă GitHub Pages.
- `1520015`, `a9c170a` Publicarea paginii publice doar automat (reîncercări + sincronizare la conectare).
- `1743e38` Conturi pentru apartamente cu depunere directă; publicare în fundal, cache registru, indicatori de încărcare.

## 10.10.2026 — MVP

- `e7283c0`, `7859908` Configurare: test real de scriere, inițializarea repo-ului gol, mesaje clare, versiune pe scripturi.
- `a4ea3fc` Formular public cu trimitere pe e-mail, copiere pentru e-bloc, tipărire.
- `39683aa` MVP: sesizări publice, administrație cu roluri, termene legale, semnătură electronică simplă.
- `a498ba2` Plan v1 ([plan](plans/plan-v1.md)).
- `237c8b0`, `ef2343c` Prima versiune: registru static (GitHub Pages + JSON în repo privat), server de test local.

## Cum actualizez

La o versiune nouă (creșterea `?v=`), adaugă o secțiune sus cu data și commit-urile relevante, iar în
[09](09-probleme-cunoscute.md) / [10](10-roadmap.md) marchează ce s-a rezolvat.
