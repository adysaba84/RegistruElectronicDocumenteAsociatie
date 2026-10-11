# 5. Funcționalități

[← Cuprins](README.md)

Legendă stare: ✅ funcțional · 🟡 funcțional cu limite (vezi [09](09-probleme-cunoscute.md)) · ⛔ nu există (vezi [10](10-roadmap.md))

## 5.1 Partea publică (fără cont)

| Funcție | Stare | Detalii |
|---|---|---|
| Lista sesizărilor pe an, cu filtre (text, stare, domeniu, rapide) | ✅ | `#/`; citire prin API, rezervă GitHub Pages |
| Detaliu sesizare, răspuns, istoric public, verificarea semnăturii | ✅ | `#/p/<an>/<nr>`; fără nume / apartament / note / fișiere |
| „Cum depun o sesizare” — formular care pregătește un e-mail | ✅ | `#/cum`; `mailto:` către adresa asociației, text în formatul anexei; copiere pentru e-bloc; tipărire |
| Avizier: procesele-verbale închise, cu verificarea fiecărei semnături | ✅ | `#/avizier`; avertizare pentru termenul de 7 zile |
| Tipărire / PDF proces-verbal | ✅ | din fereastra de tipărire a browserului |

## 5.2 Conturi și acces

| Funcție | Stare | Detalii |
|---|---|---|
| Configurare inițială (token → conturi + carduri tipărite) | ✅ | test real de scriere în ambele repo-uri, inițializează repo-ul gol |
| Conectare cu utilizator + parolă | ✅ | decriptarea tokenului = verificarea parolei |
| Schimbare parolă obligatorie la prima conectare | ✅ | min. 10 caractere, litere + cifre |
| Resetare parolă de către președinte | ✅ | parolă temporară nouă, afișată o dată |
| Card de acces pentru apartament (cerere pe WhatsApp → card generat pe loc) | ✅ | contul `apNN` se creează la primul card |
| Atribuire rol → apartament, bifă „membru comitet” | ✅ | pagina Utilizatori |
| Passkey: adăugare, listă, revocare, cod cheie pentru acordul pe hârtie | ✅ | `#/admin/profil`; președintele revocă orice cheie |
| Rotirea tokenului fără refacerea conturilor | ⛔ | [09](09-probleme-cunoscute.md) #4 |
| Recuperare parolă fără președinte | ⛔ | — |

## 5.3 Sesizări și registru

| Funcție | Stare | Detalii |
|---|---|---|
| Sesizare / contestație listă de plată / propunere, câmpurile din anexa regulamentului | ✅ | proprietarul direct; președintele și resp10 pentru hârtie / e-mail / e-bloc |
| Număr și dată automate, registru unic pe an | ✅ | numerotarea reîncepe la 1 în fiecare an |
| Repartizare automată pe domeniu, repartizare manuală | ✅ | `DOMENII` în `config.js` |
| Termen 10 zile, avertizare cu 3 zile înainte și la depășire | 🟡 | doar pe ecran, fără notificări; vezi #7, #15 |
| Lista ședinței lunare (fără soluție / propuneri) | ✅ | se poate bifa / debifa manual |
| Flux răspuns: preluare → ciornă → trimis la semnat → returnat / semnat | ✅ | |
| Răspuns semnat cu passkey, cu număr propriu de ieșire, conexat | ✅ | un singur commit pentru ambele |
| Închidere, redeschidere, note interne, fișiere atașate (max. 25 MB) | ✅ | |
| Documente de intrare / ieșire / interne | ✅ | `#/admin/document-nou` |
| Registrul complet, verificarea lanțului de amprente, export CSV | ✅ | CSV cu `;` și BOM (Excel RO), protejat contra injecției de formule |
| Tipărirea unei sesizări | ✅ | |
| Căutare în mai mulți ani deodată | ⛔ | selectorul de an arată un an pe rând |
| Comunicarea răspunsului către proprietar (e-mail) | ⛔ | proprietarul îl vede în cont sau public |

## 5.4 Ședințele comitetului executiv

| Funcție | Stare | Detalii |
|---|---|---|
| Convocare: dată, oră, link Zoom, avertizare sub 5 zile | ✅ | doar președintele |
| Ordinea de zi precompletată din sesizările de pe lista lunară | ✅ | doar cele încă neprogramate; bife + puncte manuale + reordonare |
| „Am luat la cunoștință” cu passkey | ✅ | modificarea convocării anulează confirmările |
| Prezență („Sunt prezent” cu o oră înainte), cvorum | ✅ | |
| Proces-verbal într-un editor de text mare, cu previzualizare și validare | ✅ | `pv-text.js`; erorile blochează salvarea |
| Dictare vocală cu comenzi (consemnează, decizie, vot, responsabil, termen, punct…) | 🟡 | Chrome / Edge / Safari; nu Firefox (#13) |
| Numerotare în registrul unic de procese-verbale (1/2026, 2/2026…) | ✅ | |
| Semnare cu passkey de membrii prezenți + cenzor; modificarea anulează semnăturile | ✅ | semnăturile anulate se păstrează |
| Închidere manuală de președinte → avizier, blocare totală | ✅ | |
| Înregistrare automată a PV în registrul de intrare-ieșire | ✅ | reîncercare la următoarea deschidere de către președinte |
| Urmărirea deciziilor (responsabil + termen) după ședință | ⛔ | [10](10-roadmap.md) |
| Adunarea generală a proprietarilor | ⛔ | [10](10-roadmap.md) |

## 5.5 Cartea de imobil (HG 295/2021, anexa 8)

| Funcție | Stare | Detalii |
|---|---|---|
| Carte electronică cu coloanele anexei 8 | 🟡 | date personale în repo-ul privat accesibil oricărui cont (#1) — **nu introduceți date reale** |
| Cerere de înscriere / radiere de la proprietar, semnată cu passkey | ✅ | termen 15 zile |
| Cerere pe hârtie: tipărire cerere precompletată / formular gol, scan obligatoriu | ✅ | |
| Preluare inițială din cartea pe hârtie (cu fotografia paginii) | ✅ | intră direct în carte |
| Rezolvare: verificarea actului (fără copii), confirmare / corectare date | ✅ | cartea și cererea în același commit |
| Radiere doar din persoanele înscrise; nimeni nu se șterge | ✅ | |
| Corectare greșeli de transcriere, cu istoric | ✅ | |
| Date de contact opționale (telefon, e-mail, persoană de contact) | 🟡 | ștergerea la cerere nu atinge istoricul git (#22) |
| Tipărire oficială (anexa 8) și extinsă (contact + nr. persoane + rezumat) | ✅ | președinte, administrator, resp01 |

## 5.6 Numărul de persoane

| Funcție | Stare | Detalii |
|---|---|---|
| Declarație de la proprietar (număr + data aplicării), opțional împreună cu cererea de carte | ✅ | o singură semnătură acoperă ambele cereri |
| Administratorul: lista pe apartamente, „Am înregistrat în e-bloc” | ✅ | |
| Sincronizare automată cu e-bloc | ⛔ | e-bloc nu are API public |

## 5.7 Transversal

| Funcție | Stare |
|---|---|
| Interfață mobilă (design „Bloc”), bară de navigare jos | ✅ |
| Indicator de încărcare global, mesaje de eroare în limbaj simplu | ✅ |
| Rezolvarea automată a scrierilor concurente (reîncercare) | ✅ |
| Funcționare offline / PWA instalabilă | ⛔ |
| Notificări (e-mail, push, WhatsApp) | ⛔ |
| Jurnal de audit pe utilizator (cine a citit ce) | ⛔ |
| Accesibilitate verificată (WCAG) | 🟡 parțial: etichete ARIA, navigare cu tastatura în tabele; neauditat |
| Teste automate | ⛔ |
