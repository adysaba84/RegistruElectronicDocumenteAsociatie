# 1. Prezentare generală

[← Cuprins](README.md)

## Problema

Asociația (60 de apartamente, Str. Observatorului 105, Cluj-Napoca) are obligații legale de evidență și termene:
răspuns scris la sesizări în 10 zile, convocarea comitetului cu 5 zile înainte, afișarea deciziilor în 7 zile,
cartea de imobil ținută în formatul anexei 8 din HG 295/2021. Pe hârtie, cu WhatsApp și e-mail, nu se vede cine
are de răspuns, ce termen a expirat sau ce s-a hotărât.

## Ce face aplicația

- **Registru unic de intrare-ieșire** pe an (sesizări, răspunsuri, documente, cereri), cu număr și dată automate.
- **Sesizări** depuse de proprietari (din cont, pe e-mail prin formularul public sau pe hârtie), repartizate automat
  pe domeniu, cu termen legal, avertizări și răspuns semnat cu passkey, care primește propriul număr de ieșire.
- **Pagina publică**: toate sesizările, fără nume, apartament, note interne sau fișiere.
- **Ședințe ale comitetului executiv**: convocare, „am luat la cunoștință”, prezență și cvorum, proces-verbal redactat
  la tastatură sau prin dictare vocală, semnat de membri și cenzor, închis de președinte și afișat la **avizier**.
- **Cartea de imobil** electronică (anexa 8), modificată numai prin cereri semnate sau cereri pe hârtie scanate.
- **Numărul de persoane** declarat de proprietar, pe care administratorul îl trece în e-bloc.

## Cui se adresează

| Utilizator | Ce face în principal |
|---|---|
| Proprietar (ap01…ap60) | depune sesizări și cereri, își vede apartamentul, citește avizierul |
| Președinte | tot: repartizează, semnează răspunsuri, convoacă, închide PV, gestionează conturi |
| Responsabili de domeniu (resp01…resp13) | rezolvă sesizările domeniului lor; resp01 ține cartea de imobil, resp10 înregistrează corespondența |
| Cenzor | citește tot, semnează procesele-verbale |
| Administrator | contestațiile la lista de plată, numărul de persoane → e-bloc, tipărește cartea de imobil |
| Public | vede sesizările și avizierul fără cont |

Detalii: [04 — Roluri și permisiuni](04-roluri-permisiuni.md).

## Principii de proiectare

1. **Fără server și fără bază de date.** Codul e static (GitHub Pages); datele sunt fișiere JSON în repo-uri GitHub.
   Cost zero, nimic de administrat, istoric complet în git.
2. **Fără nume în public.** Peste tot se folosesc roluri și apartamente; numele stau doar în repo-ul privat.
3. **Nimic nu se șterge.** Fiecare acțiune se adaugă în istoric; persoanele din cartea de imobil primesc data plecării;
   semnăturile anulate se păstrează.
4. **Semnături verificabile de oricine.** Passkey (WebAuthn) cu cheile publice în repo-ul public; verificarea rulează în
   browser.
5. **Merge pe telefon.** Interfață mobilă, bară de navigare jos, butoane mari.
6. **Termenii legali în cod.** Termenele, numerotarea și formularele urmează legea și regulamentul intern
   ([11 — Cadrul legal](11-cadru-legal.md)).

## Ce *nu* este (deocamdată)

- Nu e un sistem cu control de acces impus de server: regulile de acces sunt aplicate de interfață
  ([06](06-securitate.md), [09](09-probleme-cunoscute.md) #1).
- Nu e integrat cu e-bloc (nu există API public); e-bloc rămâne un canal de depunere înregistrat manual.
- Nu trimite notificări (e-mail, push) — utilizatorii trebuie să deschidă aplicația.
