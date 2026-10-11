# 11. Cadrul legal implementat

[← Cuprins](README.md)

> Rezumat tehnic al regulilor transpuse în cod, nu consultanță juridică. Verificați textele în vigoare înainte de
> a vă baza pe ele.

## Legea nr. 196/2018 (asociațiile de proprietari)

| Prevedere | Ce cere | În aplicație | Cod |
|---|---|---|---|
| art. 57 alin. (1) lit. e) | răspuns scris la sesizări în 10 zile | termen automat 10 zile, avertizare cu 3 zile înainte și la depășire | `TERMEN_RASPUNS_ZILE`, `ZILE_AVERTIZARE` (config.js), `termenInfo` |
| art. 28 alin. (3) | răspuns la contestațiile la lista de plată în 10 zile | categoria „contestație”, repartizată administratorului | `DOMENII.liste`, `CATEGORII.contestatie` |
| art. 55 | convocarea comitetului executiv cu cel puțin 5 zile înainte; deciziile afișate în 7 zile | avertizare la convocare sub 5 zile; avertizare la avizier pentru 7 zile | `ZILE_CONVOCARE`, `ZILE_AFISARE` (sedinte.js) |
| cvorum comitet | jumătate + 1 din membri | calcul automat din prezență | `cvorum()` |

## HG nr. 295/2021 — anexa 1 (regulamentul de aplicare) și anexa 8 (cartea de imobil)

| Prevedere | Ce cere | În aplicație | Cod |
|---|---|---|---|
| anexa 8 | coloanele cărții de imobil: nume, act de identitate (serie, nr.), data mutării și felul adresei, domiciliul din act, data mutării din imobil | exact aceste coloane în carte, cereri și tipărirea oficială | `carte-imobil.js`, `pregatesteCerere` |
| art. 93 lit. a) | înscriere în 15 zile de la sosire | termen 15 zile pe cererea de carte | `TERMEN_CARTE_ZILE` |
| art. 93 lit. c) | cartea se prezintă spre verificare numai poliției și S.P.C.E.P. | acces doar responsabil + președinte (administrator: citire și tipărire) — **impus doar în UI** | `ROLURI_CARTE`, [09](09-probleme-cunoscute.md) #1 |
| art. 94 | fără copii ale actelor de identitate | actul doar se vede; aplicația nu cere poze ale actului (doar ale cererii semnate / paginii vechi) | `formularInscriere` |

## Regulamentul intern al asociației

| Articol | Ce cere | În aplicație |
|---|---|---|
| art. 20–22 + anexa | formatul sesizării: apartament, tip, domeniu, problemă, soluție, cost estimat, „mă ocup eu” | formularul de sesizare și textul pentru e-mail (`textSesizare`) |
| art. 23–24 | sesizările fără soluție merg pe lista ședinței lunare a comitetului | `listaLunara`, ordinea de zi precompletată |
| Cap. IV | rolurile 1–13 ale responsabililor | `ROLURI` (config.js) |
| clauza (10) | fără înregistrare audio / video a ședințelor | dictarea e push-to-talk, nu se păstrează niciun sunet ([plan](plans/plan-dictare-vocala.md)) |

## Semnătura electronică

- Răspunsurile vechi: **semnătură electronică simplă** (amprentă SHA-256).
- Acum: passkey (WebAuthn) — tot semnătură electronică simplă în sensul Regulamentului eIDAS, legată de titular prin
  acordul pe hârtie care conține codul cheii. Nu este semnătură calificată ([10](10-roadmap.md) P3).
