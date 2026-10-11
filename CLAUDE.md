# CLAUDE.md

Registru electronic pentru Asociația de Proprietari Observatorului 105: sesizări cu termene legale, registru de
intrare-ieșire, ședințe ale comitetului cu PV semnat cu passkey, cartea de imobil (HG 295/2021, anexa 8).

## Citește întâi

Documentația de proiect e în [`docs/`](docs/README.md) — **indexul e `docs/README.md`**. Înainte de o modificare,
citește ce e relevant:

- arhitectura și fluxul unei scrieri → `docs/02-arhitectura.md`
- formatul datelor (JSON în repo-uri GitHub) → `docs/03-modele-date.md`
- cine ce poate → `docs/04-roluri-permisiuni.md`
- securitate, ce se publică → `docs/06-securitate.md`
- convenții, rulare locală, `?v=` → `docs/07-dezvoltare.md`
- probleme cunoscute (numerotate) și roadmap → `docs/09-probleme-cunoscute.md`, `docs/10-roadmap.md`
- planurile de proiectare → `docs/plans/`

## Arhitectura, pe scurt

- Aplicație **statică** (GitHub Pages), ES modules fără framework și fără build; logica în `js/`, UI în `js/app.js`.
- Datele sunt fișiere JSON în două repo-uri GitHub: `-date` (privat, sursa de adevăr) și `-public` (vederi publice
  derivate, `conturi.json`, `chei.json`). Toate scrierile trec prin `GitHubRepo.transact` (commit atomic + reîncercare).
- Un singur token GitHub, criptat cu parola fiecărui cont; permisiunile sunt aplicate doar în interfață.
- **Decizie 11.10.2026:** proiectul se mută pe hosting cu server propriu (încă MVP). Problemele care țin de lipsa
  serverului se rezolvă prin mutare; nu construi ocolișuri complicate pentru ele în arhitectura actuală.
- **Direcție:** produs pentru mai multe asociații (roluri, apartamente, module configurabile, profile presetate) —
  `docs/plans/plan-produs-multi-asociatie.md`. Codul nou nu mai fixează în cod ce trebuie să devină setare.

## Reguli

- Limba: română — identificatori fără diacritice, texte în interfață cu diacritice, commit-uri fără diacritice.
- DOM doar prin `h()`; niciodată `innerHTML` cu date.
- Nimic nu se șterge din date: adaugă în `istoric`, marchează cu dată. Format nou = câmp opțional + citire tolerantă.
- Orice câmp nou ajuns în `vederePublica()` (store.js) sau la avizier: verifică să nu conțină date personale.
- La fiecare modificare publicată, crește `?v=NN` în **toate** importurile și în `index.html` (comanda în `docs/07`).
- După o schimbare de funcționalitate, actualizează documentația: `docs/05` (ce are), `docs/09` (marchează rezolvate,
  nu șterge rânduri), `docs/10`, `docs/13` (istoric).
- Rulare locală: `python dev/mock_github.py` → `http://127.0.0.1:8787/?api=http://127.0.0.1:8787/api`
  (configurația `mock-github` din `.claude/launch.json`). Passkey simulat: `await import('/dev/autentificator-test.js')`.
