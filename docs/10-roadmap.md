# 10. Ce lipsește și ce am vrea — roadmap

[← Cuprins](README.md)

Priorități: **P0** înainte de date reale · **P1** următorul pas firesc · **P2** util · **P3** idei.
Fiecare element trimite la problema rezolvată din [09](09-probleme-cunoscute.md), unde e cazul.

## P0 — înainte de date reale (cartea de imobil, conturi pentru toate apartamentele)

> **Decizie (11.10.2026):** proiectul se mută pe hosting cu server propriu cât timp e încă MVP. Problemele care țin
> de lipsa serverului (#1–#5, #8, #11, #15, #18, #19, #21, #22, #24) se rezolvă prin mutare, nu prin ocolișuri în
> arhitectura actuală. Până atunci se repară doar bug-urile de funcționare.
>
> **Direcție (11.10.2026):** aplicația devine produs vândut asociațiilor — mai multe asociații, apartamente, roluri și
> module configurabile, profile presetate. Planul: [plans/plan-produs-multi-asociatie.md](plans/plan-produs-multi-asociatie.md).

| Ce | De ce | Schiță |
|---|---|---|
| **Componentă pe server** (ex. Cloudflare Worker, gratuit) care ține tokenul | #1, #2, #3, #8 | Utilizatorul se autentifică la Worker (parolă + passkey), primește o sesiune scurtă; Worker-ul verifică rolul pe fiecare cerere și scrie în GitHub. UI-ul și formatul datelor rămân aceleași: se înlocuiește doar `GitHubRepo` cu un client către Worker. `conturi.json` nu mai conține tokenul. |
| Separarea datelor sensibile | #1, #22 | Cartea de imobil și cererile într-un repo / stocare separată, accesibilă doar rolurilor `r01`, `presedinte` (și citire `administrator`) — impus de server. |
| Pachet GDPR | #21 | Notă de informare, evidența prelucrărilor, temei legal, termen de păstrare, procedura de acces / rectificare; decizia privind GitHub ca împuternicit. |
| Branch protection pe repo-urile de date | #2, #5 | Fără force-push — configurare GitHub, fără cod ([08](08-operare.md#84-protecții-recomandate-pe-github)). |

## P1 — următorul pas

| Ce | De ce | Schiță |
|---|---|---|
| Rotirea tokenului din aplicație + avertizare înainte de expirare | #4 | Data expirării salvată la configurare; banner cu 30 de zile înainte; „Schimbă cheia”: fiecare cont primește tokenul nou re-criptat la prima conectare (cu tokenul vechi încă valid). Devine inutil cu serverul. |
| „Deschise din toți anii” | #7 | Tabloul de bord, cartea de imobil și sincronizarea publică citesc și anul anterior pentru elementele nefinalizate. |
| Notificări | #15 | E-mail (GitHub Action zilnic sau Worker): termene la 3 zile / depășite, cereri noi, convocări, PV de semnat. Opțional Web Push. |
| Urmărirea deciziilor comitetului | lipsă funcțională | Fiecare decizie din PV (responsabil + termen) devine o sarcină cu stare, vizibilă la responsabil și pe avizier („în lucru / realizată”). |
| Verificarea textului înainte de publicare | #6 | Avertizare automată pentru telefoane, e-mailuri, „ap. NN”, nume proprii în textul public; responsabilul confirmă sau editează versiunea publică. |
| Ancorarea lanțului de amprente | #5 | Ultima amprentă a registrului se trece automat în fiecare PV semnat (și la avizier) → martor public, semnat. |
| Teste automate | #17 | `node --test` (fără dependențe) pe funcțiile pure + verificarea semnăturilor cu chei WebCrypto; rulate în GitHub Actions. |
| Corecturi mici | #16 | Script pentru `?v=`. (#14 rezolvat) |

## P2 — util

| Ce | Detalii |
|---|---|
| Adunarea generală a proprietarilor | convocare (cu termenele legii), listă de prezență pe apartamente / cote-părți, vot, proces-verbal, afișare |
| Comunicarea răspunsului | trimiterea automată pe e-mail a răspunsului semnat (PDF + link de verificare) |
| PDF semnat descărcabil | răspunsuri și PV-uri ca PDF cu codul de verificare și QR către pagina de verificare |
| Căutare în toți anii, rapoarte | timp mediu de răspuns, sesizări pe domeniu / responsabil, termene depășite; raport anual pentru adunarea generală |
| Redimensionarea imaginilor la urcare | #10 — fotografii de 5–10 MB → ~500 KB |
| PWA instalabilă, citire offline | manifest + service worker (atenție la CSP și cache-ul de versiuni) |
| Expirarea sesiunii la inactivitate | #19 |
| Împărțirea `app.js` | pe pagini (`pagini/sesizari.js`, `pagini/sedinte.js`, …), fără build |
| Import din e-bloc | import manual CSV / copiere, dacă e-bloc permite export |
| Migrări de format | #25 |

## P3 — idei

- Registru de contracte și furnizori (lift, curățenie), cu termene de reînnoire.
- Evidența lucrărilor și a garanțiilor pe părțile comune (cu legătură la sesizări).
- Programări (acces în boxă, tehnician) și anunțuri pe avizier în afara PV-urilor.
- Semnătură electronică calificată / marcă temporală TSA pentru documentele cu greutate juridică mare.

## Decizii deschise

| Întrebare | Opțiuni |
|---|---|
| Unde rulează serverul? | **decis: hosting propriu** — rămâne de ales furnizorul (preferabil UE, pentru GDPR) și stiva |
| Unde stau datele personale după server? | tot GitHub privat · stocare UE criptată · Worker KV / D1 |
| Câte apartamente primesc cont înainte de server? | doar la cerere (acum) · toate |
