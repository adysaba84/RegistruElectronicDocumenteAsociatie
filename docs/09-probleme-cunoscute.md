# 9. Probleme cunoscute

[← Cuprins](README.md)

Gravitate: 🔴 critic (blochează folosirea cu date reale) · 🟠 mare · 🟡 medie · ⚪ mică.
Numerele sunt stabile (alte documente trimit la ele); o problemă rezolvată se marchează ~~tăiat~~ cu data, nu se șterge.

## Securitate și date personale

| # | Gr. | Problema | Efect | Ocolire acum | Soluție (vezi [10](10-roadmap.md)) |
|---|---|---|---|---|---|
| 1 | 🔴 | **Token comun, permisiuni doar în interfață.** Orice cont conectat, inclusiv `ap01`…`ap60`, decriptează tokenul complet. | Un proprietar cu cunoștințe tehnice poate citi tot repo-ul privat (nume, cartea de imobil, acte de identitate) și poate scrie orice. | Nu introduceți date reale în cartea de imobil; dați carduri de apartament doar cu acord. | P0: server (Cloudflare Worker) care ține tokenul și verifică rolul |
| 2 | 🔴 | **Falsificare posibilă cu tokenul**: chei passkey false în `chei.json`, modificarea registrului, rescrierea istoricului git dacă ramura nu e protejată. | Semnăturile rămân sigure doar prin codul cheii de pe hârtie. | Branch protection ([08](08-operare.md#84-protecții-recomandate-pe-github)); verificarea codurilor de cheie. | P0 (server) + P1 (ancorarea amprentelor) |
| 3 | 🟠 | `conturi.json` e public cu tokenul criptat → atac offline pe parole. | O parolă slabă spartă = acces total. | Parole lungi; 600 000 iterații PBKDF2. | Server + autentificare fără token în client |
| 5 | 🟡 | Lanțul de amprente din registru e calculat în browser; cine are tokenul îl poate recalcula integral. | Detectează doar modificări naive. | Istoricul git + branch protection. | P1: ancorarea periodică a ultimei amprente (în PV / avizier) |
| 6 | 🟠 | Textul liber al sesizării (`problema`, `solutie`) și răspunsul se publică exact cum sunt scrise. | Nume, telefoane, nr. de apartament scrise în text ajung publice. | Responsabilul citește și cere corectura; avertizare în formular. | P1: verificare înainte de publicare / ascundere text |
| 19 | 🟡 | Tokenul stă în clar în `sessionStorage` cât e fila deschisă; fără deconectare automată la inactivitate. | Calculator comun → sesiunea rămâne deschisă. | Butonul „Ieșire”. | P2: expirare la inactivitate |
| 21 | 🟠 | GDPR: date la GitHub (SUA), fără informare, evidența prelucrărilor sau termen de păstrare. | Neconformitate. | Fără date reale. | P0: documentație GDPR |
| 22 | 🟡 | „Ștergere la cerere” (date de contact) nu atinge istoricul git. | Datele rămân în istoric. | — | Server / stocare criptată per câmp |
| 12 | ⚪ | Înregistrarea passkey nu verifică atestarea; cheia publică vine din browser. | Cunoscut și acceptat; compensat de codul cheii pe hârtie. | — | — |
| 24 | ⚪ | La verificare, „cheia era revocată” compară cu ora semnăturii declarată de client (`la`). | Un semnatar cu cheie revocată ar putea antedata. | Revocarea + istoric git arată momentul real. | Marcă temporală de la server |
| 11 | ⚪ | Ora semnăturilor (`semnatLa`, `la`) e ceasul dispozitivului. | Nu e marcă temporală calificată. | Commit-ul git are ora GitHub. | Server / TSA |

## Funcționare

| # | Gr. | Problema | Efect | Ocolire acum | Soluție |
|---|---|---|---|---|---|
| 4 | 🟠 | **Fără rotirea tokenului.** Token fine-grained expiră (max. ~1 an); configurarea refuză dacă există `conturi.json`. | La expirare nimeni nu mai poate scrie; toate conturile trebuie refăcute cu carduri noi. | Procedura manuală din [08](08-operare.md#83-tokenul-a-expirat-sau-trebuie-schimbat); alarmă în calendar. | P1: avertizare înainte de expirare + „Schimbă cheia” care re-criptează la următoarea conectare a fiecăruia |
| 7 | 🟡 | **Trecerea în anul nou:** tabloul de bord arată anul selectat (implicit curent); „Cartea de imobil” citește cereri doar din anul curent; sincronizarea publică doar anul curent. | În ianuarie sesizările și cererile deschise din decembrie (inclusiv termene depășite) dispar din vederea implicită. | Selectorul de an; verificare în ianuarie ([08](08-operare.md#82-calendar-de-mentenanță)). | P1: „deschise din toți anii” pe tabloul de bord și în carte |
| 15 | 🟡 | **Fără notificări.** Termenele și cererile se văd doar la deschiderea aplicației. | Termene ratate. | Grupul de WhatsApp. | P1: e-mail / push (necesită server sau GitHub Actions) |
| 8 | 🟡 | Limite GitHub: 5 000 cereri/oră pentru tokenul **comun** (toți utilizatorii la un loc); 60/oră/IP pentru vizitatori (rezervă: Pages). | Sub încărcare mare, erori 403 pentru toți. | Cache pe `head`; puțini utilizatori simultan. | Server cu cache |
| 9 | 🟡 | Registrul unui an e un singur JSON rescris la fiecare modificare; max. 5 reîncercări la conflict. | Fișier mare spre final de an; rar, eroare la scrieri simultane. | Reîncercare manuală. | Fișiere pe înregistrare sau pe lună |
| 10 | 🟡 | Fișiere de max. 25 MB, citite integral în memorie; repo GitHub recomandat < 1 GB; nimic nu se poate șterge din istoric. | Multe scanări / fotografii mari umplu repo-ul. | Fotografii comprimate, PDF-uri mici. | Redimensionare automată a imaginilor la urcare; stocare separată |
| 18 | ⚪ | Publicarea (pagina publică, avizier) rulează în fundal; închiderea filei imediat după salvare o poate întrerupe. | Pagina publică rămâne în urmă. | Se repară la următoarea conectare a administrației (anul curent) sau următoarea modificare. | Server / GitHub Action care regenerează derivatele |
| 13 | ⚪ | Dictarea: nu merge în Firefox; sunetul e procesat de Google / Microsoft / Apple; pe telefon, microfonul poate fi ocupat de Zoom. | — | Tastatura cu microfon a telefonului; dictare pe PC. | — |
| ~~14~~ | ⚪ | ~~Responsabilul cărții putea înregistra o declarație separată de număr de persoane, dar nu o mai vedea.~~ **Rezolvat 11.10.2026** (`?v=25`): declarația separată o înregistrează doar președintele și administratorul; responsabilul cărții o înregistrează doar împreună cu o cerere de carte. | — | — | — |
| 23 | ⚪ | O convocare nu se poate muta în alt an (numerotarea ședințelor e pe anul datei). | Ședință mutată din decembrie în ianuarie → convocare nouă. | Convocare nouă. | — |

## Cod și proces

| # | Gr. | Problema | Soluție |
|---|---|---|---|
| 16 | 🟡 | `?v=NN` manual în ~20 de importuri; unul uitat → modul încărcat de două ori. | Script de verificare / înlocuire; sau import map |
| 17 | 🟡 | Fără teste automate (planurile le cereau pentru parser, PV, verificarea semnăturilor); `app.js` ~2 600 rânduri. | Teste pentru funcțiile pure; împărțirea `app.js` pe pagini |
| 25 | ⚪ | Fără mecanism de migrare a formatului datelor (doar citire tolerantă). | Câmp `versiune` respectat + funcții de migrare |

## Cum raportez o problemă nouă

Adaugă un rând cu următorul număr liber (ultimul folosit: **25**), gravitate, efect, ocolire și soluție;
dacă are legătură cu roadmap-ul, adaug-o și în [10](10-roadmap.md).
