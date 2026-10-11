# 12. Glosar

[← Cuprins](README.md)

Termenii din cod și din date, cu sensul lor.

| Termen (cod) | Sens |
|---|---|
| `amprenta` | hash SHA-256 (hex); la înregistrări = verigă din lanțul de amprente; la răspunsuri vechi = semnătura simplă |
| `apartament` | numărul apartamentului (1–60); conturile proprietarilor sunt `ap01`…`ap60` |
| `avizier` | panoul public cu procesele-verbale închise (`avizier/<an>.json`, `#/avizier`) |
| `canal` | pe unde a venit documentul: `aplicatie`, `platforma` (formularul → e-mail), `email`, `ebloc`, `hartie` |
| `carte` / cartea de imobil | evidența persoanelor din HG 295/2021, anexa 8 (`carte-imobil.json`) |
| `categorie` | tipul înregistrării: `sesizare`, `contestatie`, `propunere`, `raspuns`, `document`, `cerere_carte`, `cerere_persoane` |
| `cheie` (cont) | tokenul GitHub criptat cu parola contului |
| `cheie` (semnătură) / passkey | credențial WebAuthn; `cod` = codul cheii `XXXX-XXXX-XXXX-XXXX` |
| `comitet` | bifa „membru al comitetului executiv” pe un cont |
| `conexat` | legătura cu altă înregistrare (`"nr/an"`) |
| `confirmari` | „Am luat la cunoștință” semnate pe convocare |
| `continut…` | conținutul canonic care se semnează (`continutRaspuns`, `continutPV`, …) |
| `cvorum` | ⌊membri/2⌋ + 1 prezenți |
| `domeniu` | categoria tehnică a sesizării, care decide responsabilul (`DOMENII`) |
| `felAdresa` | `domiciliu` sau `resedinta` (anexa 8) |
| `istoric` | lista acțiunilor `{ la, u, actiune, intern? }` |
| `listaLunara` | sesizarea merge pe lista ședinței lunare a comitetului (art. 23) |
| `maOcup` | „mă ocup eu”: `da` / `nu` / `ajut` |
| `preluare` | introducerea inițială în cartea electronică a persoanelor din cartea pe hârtie |
| `prezenta` | cine a apăsat „Sunt prezent” |
| PV | proces-verbal al ședinței comitetului |
| `radiere` | mutarea unei persoane din imobil (se completează `dataPlecarii`; nu se șterge) |
| `registru` | registrul unic de intrare-ieșire al anului (`registru/<an>.json`) |
| `repartizata`, `in_lucru`, `raspuns_propus`, `raspuns_trimis`, `inchisa` | stările sesizării |
| `rezolvata`, `respinsa` | stările finale ale cererilor |
| `responsabil` | id-ul rolului care se ocupă de înregistrare |
| `S` | starea globală a interfeței în `app.js` |
| `semnatari` | cine trebuie să semneze PV-ul (membrii prezenți + cenzor), fixat la redactare |
| `semnaturiAnulate` | semnături PV invalidate de o modificare ulterioară (păstrate) |
| `temporara` | contul are încă parola temporară (schimbare obligatorie) |
| `termen` | data limită de răspuns / rezolvare |
| `transact` | scriere atomică în GitHub cu reîncercare la conflict |
| `vederePublica` | ce se publică dintr-o sesizare |
| `webauthn` | obiectul semnăturii passkey pe un răspuns |
| e-bloc | platforma de liste de plată folosită de asociație (fără API) |
| S.P.C.E.P. | Serviciul public comunitar de evidență a persoanelor |
