# 7. Dezvoltare

[← Cuprins](README.md)

## 7.1 Cerințe

- Python 3 (doar pentru serverul de test), un browser modern (Chrome / Edge pentru dictare și passkey).
- Fără Node, fără build, fără dependențe: fișierele din repo sunt exact ce se publică.

## 7.2 Rulare locală

```bash
python dev/mock_github.py
```

Apoi deschide `http://127.0.0.1:8787/?api=http://127.0.0.1:8787/api`.

- `dev/mock_github.py` servește aplicația **și** simulează în memorie API-ul GitHub folosit (refs, commits, trees,
  blobs, contents, raw). Orice token e acceptat; tokenul `citire` simulează drept doar de citire.
  Datele se pierd la oprirea serverului.
- În aplicația desktop Claude există configurația `.claude/launch.json` → `mock-github` (port 8787).
- Prima dată: Administrație → „Configurare inițială” → orice text ca token → se generează conturile și parolele.
- Passkey fără dispozitiv real — în consola paginii:
  ```js
  await import('/dev/autentificator-test.js')
  ```
  (înlocuiește `navigator.credentials` cu un autentificator simulat; doar pentru teste).
- Machetele din `dev/mockup-*.html` se deschid direct în browser.

## 7.3 Convenții de cod

- **Limba:** identificatori, comentarii, mesaje de commit și interfață în **română** (fără diacritice în identificatori
  și în mesajele de commit; cu diacritice în textele din interfață). Planurile din `docs/plans/` sunt în engleză.
- **ES modules** native, fără framework. DOM prin `h(tag, attrs, ...copii)`; niciodată `innerHTML` cu date.
- **Logica pură separată de UI:** `store.js`, `sedinte.js`, `pv-text.js`, `comenzi-voce.js` nu ating DOM-ul
  (excepție: `passkey.js` și `dictare.js`, care folosesc API-uri de browser).
- **Toate scrierile prin `transact`** — funcția `build` trebuie să fie re-rulabilă (citește din `head`, nu din cache vechi)
  și să arunce `Error` cu mesaj pentru utilizator la validare.
- **Nimic nu se șterge:** adaugă în `istoric`, marchează cu dată (`dataPlecarii`, `revocataLa`, `anulataLa`).
- **Format nou = câmp opțional + citire tolerantă** ([03](03-modele-date.md#34-compatibilitate-și-migrări)).
- Mesajele de commit în repo-urile de date: `Nr. 12/2026-10-11: … (cont)`, `Ședința 3/2026: … (cont)`.

## 7.4 Versionarea scripturilor (cache)

Fiecare import și `index.html` au `?v=25`. La orice modificare publicată, crește numărul **peste tot**:

```bash
grep -rl "?v=25" index.html js | xargs sed -i 's/?v=25/?v=26/g'   # 25 → versiunea curentă, 26 → următoarea
```

Un import uitat încarcă același modul de două ori, în versiuni diferite (stare duplicată) — [09](09-probleme-cunoscute.md) #16.

## 7.5 Publicare

`git push` pe `main` → GitHub Pages servește repo-ul (`.nojekyll` dezactivează Jekyll). Datele nu sunt afectate.
Verifică după publicare pe telefon (HTTPS e necesar pentru passkey și microfon).

## 7.6 Testare

Nu există teste automate. Verificare manuală recomandată înainte de publicare:

1. mock server → configurare → conectare `presedinte` → schimbare parolă;
2. passkey simulat → sesizare nouă → repartizare → răspuns → semnare → verificare pe pagina publică;
3. convocare → confirmare → prezență → PV (inclusiv un text cu erori) → semnare → închidere → avizier;
4. card de acces `ap05` → cerere carte (înscriere + nr. persoane) → rezolvare ca `resp01` și `administrator`;
5. Registru → „Verifică lanțul”.

Candidații pentru primele teste automate (funcții pure): `comenzi-voce.js`, `pv-text.js`, `store.js`
(`pregatesteCerere`, `vederePublica`, `verificaLant`, `termenInfo`), `sedinte.js` (`stareSedinta`, `cvorum`),
`passkey.verifica` cu chei generate în WebCrypto — vezi [10](10-roadmap.md).

## 7.7 Unde adaug…

| Vreau să… | Modific |
|---|---|
| un domeniu nou de sesizare | `DOMENII` în `config.js` |
| un rol nou | `ROLURI` în `config.js` + conturile existente (configurarea nu le recreează) |
| un termen legal | `config.js` / constantele din `store.js`, `sedinte.js` |
| un câmp public nou al sesizării | `vederePublica()` în `store.js` — gândește-te la date personale |
| o pagină nouă | o funcție `pagina…()` în `app.js` + un `case` în `ruta()` + link în `cadru()` |
| o comandă vocală | `comenzi-voce.js` (parser) + `editorPV` în `app.js` (aplicare) + ajutorul din editor |
