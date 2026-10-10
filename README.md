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
| `RegistruElectronicDocumenteAsociatie-public` | public | `sesizari/<an>.json` (fără date personale) și `conturi.json` |

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

## Semnătură electronică și integritate

- **Semnătură electronică simplă:** la semnare se calculează amprenta SHA-256 a răspunsului (text, numere, data, semnatar).
  Pagina publică o verifică automat și afișează codul de verificare.
- **Lanț de amprente:** fiecare înregistrare din registru conține amprenta celei anterioare; pagina Registru verifică lanțul.
- **Istoric git:** fiecare salvare e un commit în repo-ul de date.

## Limite cunoscute (MVP)

- Regulile de acces sunt aplicate de aplicație, nu de un server: oricine are un cont al administrației deține,
  după conectare, cheia de acces completă. Potrivit pentru o administrație de încredere; pentru conturi ale
  apartamentelor e nevoie de o componentă pe server.
- Dacă cheia de acces expiră sau e revocată, aplicația nu mai poate scrie: se creează o cheie nouă și se refac conturile.

## Dezvoltare locală

```bash
python dev/mock_github.py
```

Apoi http://127.0.0.1:8787/?api=http://127.0.0.1:8787/api — un GitHub simulat în memorie (orice cheie merge).
Parametrul `?api=` funcționează numai pe localhost.
