# 8. Operare și mentenanță

[← Cuprins](README.md)

## 8.1 Configurarea inițială

Pașii detaliați sunt în [README-ul principal](../README.md#cheia-de-acces). Pe scurt: tokenul fine-grained (Contents
read/write pe `-date` și `-public`, expirare maximă) → Administrație → „Configurare inițială” → tipărirea cardurilor.
GitHub Pages trebuie activat pe repo-ul aplicației **și** pe `-public` (rezerva pentru pagina publică).

## 8.2 Calendar de mentenanță

| Când | Ce | Cine |
|---|---|---|
| la fiecare cont nou | titularul își adaugă passkey și scrie **codul cheii** pe acordul pe hârtie | titular + președinte |
| lunar | „Verifică lanțul” în Registru; sesizări cu termen depășit (și din anul anterior, #7) | președinte |
| ianuarie | verifică sesizările și cererile rămase deschise din anul anterior (selectorul de an) | președinte, resp01 |
| trimestrial | backup ([8.5](#85-backup)) | președinte |
| cu ~1 lună înainte de expirarea tokenului | rotirea tokenului ([8.3](#83-tokenul-a-expirat-sau-trebuie-schimbat)) | președinte |
| când pleacă cineva dintr-un rol | resetează parola contului, revocă passkey-urile lui, reatribuie apartamentul | președinte |

## 8.3 Tokenul a expirat sau trebuie schimbat

Simptom: „Cheia de acces a expirat sau a fost revocată” (HTTP 401). Aplicația nu are încă un flux de rotire
([09](09-probleme-cunoscute.md) #4); procedura manuală:

1. Creează un token nou (aceleași setări). Revocă-l pe cel vechi dacă e compromis.
2. În repo-ul `-public`, salvează o copie a `conturi.json` (bifele `comitet` și atribuirile de apartamente se pierd),
   apoi șterge-l — altfel configurarea refuză („Aplicația este deja configurată”).
3. Administrație → „Configurare inițială” cu tokenul nou → tipărește cardurile noi.
4. Refă bifele „membru comitet”, apartamentele rolurilor și cardurile pentru apartamente (Utilizatori).
5. `chei.json` rămâne neatins: passkey-urile și semnăturile vechi rămân valabile.

## 8.4 Protecții recomandate pe GitHub

- Repo-urile `-date` și `-public`: **branch protection** pe ramura implicită — blochează force-push și ștergerea
  ramurii (fără reguli care cer PR, altfel aplicația nu mai poate scrie). Asta face din istoricul git un martor real.
- Autentificare în doi pași pe contul GitHub al proprietarului repo-urilor.
- Nimeni altcineva cu drept de scriere pe repo-uri.

## 8.5 Backup

Datele sunt repo-uri git, deci backup = clonă completă:

```bash
git clone --mirror https://github.com/adysaba84/RegistruElectronicDocumenteAsociatie-date.git
```

```bash
git clone --mirror https://github.com/adysaba84/RegistruElectronicDocumenteAsociatie-public.git
```

Păstrează clonele pe un mediu criptat (repo-ul de date conține date personale). Exportul CSV din Registru e o
copie lizibilă suplimentară, nu un backup complet (fără fișiere și istoric).

## 8.6 Recuperare

| Situație | Ce faci |
|---|---|
| Pagina publică arată date vechi | se repară singură la următoarea conectare a cuiva din administrație (doar anul curent); altfel orice modificare a unei sesizări din anul respectiv o regenerează |
| Avizierul nu arată un PV închis | președintele deschide ședința (reîncearcă publicarea și înregistrarea în registru) |
| „Lanțul nu se verifică la nr. X” | compară în istoricul git al `registru/<an>.json` ce s-a schimbat la înregistrarea X |
| Cineva și-a pierdut telefonul | revocă passkey-ul din Utilizatori/Profil; resetează parola contului |
| O modificare greșită în date | se corectează prin aplicație (istoric) — nu edita manual JSON-ul (rupe lanțul / semnăturile) |
| Repo de date corupt | `git revert` pe commit-ul greșit în clona locală + push (dacă protecția permite) |
