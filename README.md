# Registru electronic de documente — Asociația de proprietari

Registru de intrare-ieșire pentru asociația de proprietari. Rulează direct din GitHub, fără server și fără bază de date.

- **Site (public):** https://adysaba84.github.io/RegistruElectronicDocumenteAsociatie/
- **Codul aplicației (public):** acest repo — doar HTML/CSS/JavaScript, fără date.
- **Datele (privat):** repo-ul `adysaba84/RegistruElectronicDocumenteAsociatie-date` — fișiere JSON + scanuri.

Cine deschide site-ul fără token vede doar ecranul de conectare. Datele nu sunt niciodată în acest repo public.

## Ce face

- Înregistrare documente de **intrare / ieșire / interne**, cu număr și dată puse automat (numerotarea reîncepe în fiecare an).
- Emitent, destinatar, nr./data documentului, conținut pe scurt, repartizare, termen, conexare, dosar, data expedierii, observații.
- **Scanuri / PDF-uri atașate** (max. 25 MB fiecare).
- Căutare și filtre; **export Excel (CSV)** și **tipărire** a registrului.
- „Răspunde” creează automat documentul de ieșire legat de cel de intrare.
- Înregistrările nu se șterg — se **anulează** cu motiv; numărul rămâne rezervat.
- Fiecare salvare e un commit în repo-ul de date: istoric complet, cine și când a modificat.

## Activare GitHub Pages (o singură dată)

1. Deschide **Settings → Pages** al acestui repo:
   https://github.com/adysaba84/RegistruElectronicDocumenteAsociatie/settings/pages
2. **Build and deployment → Source:** `Deploy from a branch`.
3. **Branch:** `main`, folder `/ (root)` → **Save**.
4. După 1–2 minute site-ul e la adresa de mai sus. Orice modificare urcată pe `main` se publică automat.

## Token

Fiecare persoană din administrație are nevoie de un token (o cheie de acces doar la repo-ul de date).
Tokenurile se fac din contul `adysaba84`, câte unul pentru fiecare persoană, ca să poată fi oprite separat.

1. Deschide https://github.com/settings/personal-access-tokens/new
2. **Token name:** de ex. `Registru - Maria (administrator)`.
3. **Expiration:** de ex. 1 an (la expirare se face unul nou).
4. **Resource owner:** `adysaba84`.
5. **Repository access:** `Only select repositories` → alege `RegistruElectronicDocumenteAsociatie-date`.
6. **Permissions → Repository permissions → Contents:**
   - `Read and write` — pentru cine înregistrează documente;
   - `Read-only` — pentru cine doar consultă (ex. cenzor).
7. **Generate token**, copiază-l (GitHub îl arată o singură dată) și trimite-l persoanei pe un canal privat.
8. Persoana deschide site-ul, își scrie numele și lipește tokenul.

**Siguranță:**
- Pe un calculator folosit și de alții, debifează „Ține-mă minte pe acest dispozitiv” și apasă **Ieșire** la final.
- Dacă un telefon/laptop se pierde sau cineva pleacă din administrație: șterge tokenul lui din
  https://github.com/settings/personal-access-tokens — accesul se oprește imediat.

## Structura datelor (repo-ul privat)

```
config.json                       denumire asociație, adresă, CIF, compartimente
registru/2026.json                { "an": 2026, "inregistrari": [ ... ] }
fisiere/2026/000012/scan.pdf      fișierele atașate înregistrării nr. 12/2026
```

Repo-ul de date se inițializează singur la prima conectare cu un token cu drept de scriere.
Limite GitHub de reținut: max. ~1 GB recomandat pe repo — suficient pentru mulți ani de scanuri PDF obișnuite.

## Dezvoltare locală

Fără instalări: doar Python.

```bash
python dev/mock_github.py
```

Apoi deschide http://127.0.0.1:8787/?api=http://127.0.0.1:8787/api — un GitHub simulat în memorie
(orice token merge; tokenul `citire` simulează acces doar de citire). Parametrul `?api=` funcționează
numai pe localhost; pe site-ul publicat tokenul merge exclusiv la `api.github.com`.
