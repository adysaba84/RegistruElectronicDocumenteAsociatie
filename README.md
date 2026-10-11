# Registru electronic — Asociația de Proprietari Observatorului 105

Registru de sesizări și documente, cu termene legale, răspunsuri semnate electronic și istoric.
Rulează direct din GitHub, fără server și fără bază de date. Merge și de pe telefon.

- **Site:** https://adysaba84.github.io/RegistruElectronicDocumenteAsociatie/
- **Partea publică** (fără conectare): lista sesizărilor, starea, termenul și răspunsul — fără nume și fără apartament.
- **Administrație** (`#/admin`, cu utilizator și parolă): înregistrare, repartizare, răspunsuri, semnare, registru, utilizatori.

| Repo | Vizibilitate | Conține |
|---|---|---|
| `RegistruElectronicDocumenteAsociatie` | public | codul aplicației (acest repo) |
| `RegistruElectronicDocumenteAsociatie-date` | **privat** | registrul complet: nume, note interne, fișiere, alte documente |
| `RegistruElectronicDocumenteAsociatie-public` | public | `sesizari/<an>.json`, `avizier/<an>.json` (fără date personale), `conturi.json`, `chei.json` (cheile publice passkey) |

## Cheia de acces

O singură dată, președintele creează o cheie de acces GitHub pe care aplicația o folosește pentru a scrie datele.
Nimeni nu trebuie să o țină minte: la configurare, aplicația o criptează cu parola fiecărui cont.

1. Deschide https://github.com/settings/personal-access-tokens/new
2. **Token name:** `Registru electronic`.
3. **Expiration:** cea mai lungă variantă disponibilă.
4. **Resource owner:** `adysaba84`.
5. **Repository access:** `Only select repositories` → alege **`RegistruElectronicDocumenteAsociatie-date`** și **`RegistruElectronicDocumenteAsociatie-public`**.
6. **Permissions → Repository permissions → Contents:** `Read and write`.
7. **Generate token** și copiază-l.
8. Deschide site-ul → **Administrație** → apare „Configurare inițială” → lipește cheia → **Creează conturile**.
9. Tipărește cardurile cu parolele temporare și dă-le titularilor. La prima conectare fiecare își alege parola.

## Conturi

`presedinte`, `resp01`…`resp13` (rolurile din Regulamentul intern, Cap. IV), `cenzor`, `administrator`.
Fiecare rol se atribuie unui apartament, nu unei persoane (pagina **Utilizatori**). Președintele poate reseta orice parolă.

**Apartamentele** (`ap01`…`ap60`): proprietarul cere accesul pe WhatsApp la președinte, care verifică și generează pe loc
un card de acces (Utilizatori → Acces pentru apartamente). Proprietarul conectat depune sesizări direct și își vede doar
sesizările apartamentului lui.

| Cont | Poate |
|---|---|
| Președinte | tot: înregistrează, repartizează, semnează răspunsuri, închide, utilizatori |
| Resp. 10 (corespondență) | înregistrează sesizări și documente |
| Responsabil de domeniu | preia sesizările repartizate, redactează răspunsul, trimite la semnat |
| Cenzor | doar citire |
| Administrator | răspunde la sesizările despre lista de plată |

## Sesizări

- Câmpurile din formularul anexă al regulamentului (art. 21); numărul și data se dau automat.
- Repartizare automată după domeniu; termen de **10 zile** (art. 57 alin. (1) lit. e) din Legea nr. 196/2018;
  art. 28 alin. (3) pentru contestațiile la lista de plată). Avertizare cu 3 zile înainte și la depășire.
- Fără soluție propusă → pe lista ședinței lunare a comitetului (art. 23).
- Stări: Repartizată → În lucru → Răspuns de semnat → Răspuns trimis → Închisă.
- Răspunsul semnat primește propriul număr de ieșire, conexat la sesizare.

## Ședințe comitet executiv

- **Membru comitet executiv:** bifă în Utilizatori pe conturile existente (președintele e membru de drept).
- **Convocare** (președintele): dată, oră, link Zoom; avertizare sub 5 zile (art. 55). Ordinea de zi vine precompletată
  cu sesizările de pe lista ședinței lunare încă netrecute pe ordinea de zi a altei ședințe (se pot debifa); se adaugă
  puncte și se reordonează. Membrii și cenzorul confirmă **„Am luat la cunoștință”** cu passkey.
- **Prezență:** „Sunt prezent” (de la o oră înainte de ședință); cvorum = jumătate + 1 din membri.
- **Proces-verbal** (orice membru): nr. din registrul unic (1/2026, 2/2026…). Se redactează într-o foaie mare de text
  (rânduri `Decizie:` / `Vot:` / `Responsabil:` / `Termen:`), la tastatură sau cu **dictare vocală**
  (vezi `docs/plans/plan-dictare-vocala.md`); la salvare textul devine structura semnată. Semnează cu passkey membrii
  prezenți și cenzorul; o modificare după prima semnătură anulează semnăturile.
- **Închidere:** după ce au semnat toți, președintele apasă **„Închide și afișează la avizier”**. Abia atunci procesul-verbal
  devine public și nu se mai poate modifica nimic. (Ședințele semnate înainte de această regulă au fost afișate automat
  și sunt tratate ca închise.)
- **Registru:** la închidere, procesul-verbal se înregistrează automat în registrul de intrare-ieșire (document intern,
  emitent Comitetul executiv, conexat cu sesizările discutate). Dacă nu reușește atunci, se reîncearcă automat la
  următoarea deschidere a ședinței de către președinte.
- **Tipărire / PDF:** „Tipărește / salvează PDF” pe pagina ședinței și la avizier tipărește doar procesul-verbal și
  semnăturile (cu marcajul „CIORNĂ” până la închidere); PDF-ul se salvează din fereastra de tipărire.
- **Avizier** (public, și în meniul celor conectați): procesele-verbale închise, cu verificarea semnăturilor; avertizare
  pentru termenul de 7 zile.

## Cereri: cartea de imobil și numărul de persoane

- **Cererea proprietarului** (meniul **Cerere**), semnată cu passkey: înscriere sau radiere în cartea de imobil
  (persoanele, data mutării, felul adresei) și, opțional, **numărul nou de persoane care locuiesc efectiv**.
  Se înregistrează **două cereri** conexate, fiecare cu numărul ei din registru:
  - **cartea de imobil** → responsabilul cărții de imobil (Resp. 01), termen **15 zile** (HG nr. 295/2021, anexa 1, art. 93);
  - **numărul de persoane** → administratorul, care îl trece în **e-bloc** și apasă „Am înregistrat în e-bloc”.
  Cele două sunt independente: cartea de imobil arată domiciliul/reședința, cheltuielile țin de cine locuiește efectiv.
- Cererile primite pe hârtie le înregistrează responsabilul cărții, președintele sau administratorul (cu scanul atașat).
- Semnătura acoperă amprentele ambelor părți, așa că fiecare cerere se verifică singură: administratorul nu vede
  numele din cererea pentru cartea de imobil.
- Cererile nu se publică; în registru apar fără nume („Înscriere în cartea de imobil — ap. 23, 2 persoane”).

## Cartea de imobil

- Ținută electronic în formatul din **HG nr. 295/2021, anexa 8** (`carte-imobil.json` în repo-ul privat): numele, seria și
  numărul actului de identitate, data mutării și felul adresei, domiciliul din act, data mutării din imobil.
- O văd și o modifică **doar responsabilul cărții de imobil și președintele** (art. 93 lit. c): se prezintă spre verificare
  numai poliției și S.P.C.E.P.). Fără copii ale actelor (art. 94): actul se verifică vizual, se trec doar datele.
- La rezolvarea cererii, responsabilul completează datele din act și cererea devine „Rezolvată” în același commit;
  există și înscriere directă, corectare (vechile valori rămân în istoric) și „Mutat”. Nimeni nu se șterge.
- **Tipărește** dă cartea în formatul anexei 8, pe apartamente, cu mențiunea de confidențialitate.

## Semnătură electronică și integritate

- **Passkey (WebAuthn):** fiecare își adaugă din **Profil** un passkey (de obicei se sincronizează singur prin contul Google/
  Apple pe toate dispozitivele; altul se adaugă doar pe un dispozitiv care nu îl vede) și trece **codul cheii** pe acordul
  semnat pe hârtie. Răspunsurile la sesizări, confirmările și procesele-verbale se semnează cu amprenta,
  fața, PIN-ul sau Windows Hello; pagina publică verifică fiecare semnătură cu cheia publică din `chei.json`.
  Semnăturile rămân verificabile și după o schimbare de domeniu (fiecare cheie își păstrează domeniul).
- **Răspunsurile mai vechi** au o semnătură electronică simplă (amprentă SHA-256), verificată în continuare.
- **Lanț de amprente:** fiecare înregistrare din registru conține amprenta celei anterioare; pagina Registru verifică lanțul.
- **Istoric git:** fiecare salvare e un commit în repo-ul de date.

## Limite cunoscute (MVP)

- Cartea de imobil și cererile stau în repo-ul privat, la care tehnic are acces orice cont conectat (vezi mai jos):
  restricția „doar responsabil și președinte” e aplicată de interfață. Nu introduceți date reale înainte de componenta pe server.
- Regulile de acces sunt aplicate de aplicație, nu de un server: oricine are un cont al administrației deține,
  după conectare, cheia de acces completă. Potrivit pentru o administrație de încredere; pentru conturi ale
  apartamentelor e nevoie de o componentă pe server.
- Dacă cheia de acces expiră sau e revocată, aplicația nu mai poate scrie: se creează o cheie nouă și se refac conturile.

## Dezvoltare locală

```bash
python dev/mock_github.py
```

Apoi http://127.0.0.1:8787/?api=http://127.0.0.1:8787/api — un GitHub simulat în memorie (orice cheie merge).
Parametrul `?api=` funcționează numai pe localhost. Pentru passkey-uri fără dispozitiv real, în consola paginii:
`await import('/dev/autentificator-test.js')` (autentificator simulat, doar pentru teste).
