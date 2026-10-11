# Plan — Produs pentru mai multe asociații (SaaS)

Stare: **direcție aprobată 11.10.2026** (decizii în secțiunea 12); detaliile se rafinează pe etape. Pornește de la aplicația actuală (o singură asociație, GitHub, fără server)
și de la decizia de mutare pe hosting ([10-roadmap](../10-roadmap.md)). Termenii din cod: [12-glosar](../12-glosar.md).

## 0. Obiectiv

O singură platformă pe care o folosesc multe asociații de proprietari. Fiecare asociație își configurează:
- apartamentele (și scările / blocurile);
- rolurile și cine le ocupă, cu schimbări de mandat fără pierderea istoricului;
- modulele active (sesizări, ședințe, carte de imobil…), pornind de la **profile presetate**;
- termenele, domeniile și regulamentul intern, cu valorile implicite din lege.

Prima asociație client: **Observatorului 105**, migrată din datele actuale.

Decizii de produs (11.10.2026):
- **Clientul țintă: asociațiile, direct.** Înscriere și configurare fără ajutorul nostru (self-service).
  Panoul pentru firme de administrare vine mai târziu.
- **Gratuit deocamdată.** Prețul se decide după primele asociații; facturarea se amână, dar modelul de date
  păstrează loc pentru abonamente și limite pe module.
- **Blocuri și scări multiple din prima versiune.**
- **Proprietarii: conturi și e-mail.** Depun din cont sau prin formularul public, pe e-mail; ambele canale rămân.
- **Vinde o firmă nouă** (de înființat), cu nume de produs propriu.

## 1. Ce se schimbă față de MVP

| Azi (MVP) | În produs |
|---|---|
| un cont = un rol (`presedinte`, `resp02`), parola se dă mai departe | **persoane** cu cont propriu (e-mail / telefon + passkey) și **mandate** pe roluri, cu dată de început și de sfârșit |
| roluri, domenii, termene fixe în `config.js` | setări per asociație, în baza de date, cu valori implicite din profil |
| 60 de apartamente fixe | apartamente configurabile: număr, scară, etaj, suprafață, cotă-parte, import CSV |
| permisiuni în interfață (`poate*()` în `app.js`) | **permisiuni verificate pe server**, pe fiecare cerere |
| GitHub + token comun | server + bază de date + stocare de fișiere în UE |
| o asociație | multe asociații (*tenants*), complet separate; o persoană poate fi în mai multe (ex. firma de administrare) |
| toate funcțiile mereu active | module pornite / oprite pe asociație și pe abonament |

## 2. Modelul de date (nucleu)

```
Platforma
 └─ Asociatie (tenant)        nume, CUI, adresă, setări, profil, abonament, module active
     ├─ Bloc                   denumire, adresă (o asociație poate avea mai multe blocuri)
     │   └─ Scara              denumire / număr
     │       └─ Apartament     număr, etaj, suprafață, cotă-parte, nr. camere
     ├─ Rol                    din profil sau definit de asociație; = set de permisiuni + domenii
     ├─ Mandat                 persoană × rol × [de la, până la] × (apartament) — istoric complet
     ├─ Legatura apartament    persoană × apartament × tip (proprietar, coproprietar, chiriaș, reprezentant)
     ├─ Domeniu                domeniu de sesizare → rolul care îl primește
     └─ date pe module         registru, sesizări, ședințe, carte de imobil, declarații…

Persoana (globală)            nume, e-mail, telefon, passkey-uri; poate avea mandate în mai multe asociații
```

Reguli importante:
- **Semnătura aparține persoanei, cu rolul din acel moment**: „semnat de Ion Pop, președinte (mandat 2025–2027)”.
  La predarea mandatului, semnăturile vechi rămân valabile și atribuite corect.
- **Schimbarea rolului = mandat închis + mandat nou**, nu suprascriere. Sarcinile deschise ale rolului (sesizări,
  cereri) trec automat la noul titular; lista „ce preiei” apare la predare.
- **Mandat interimar** (ex. vicepreședintele în concediul președintelui) cu dată de sfârșit.
- Public: rămâne principiul „roluri și apartamente, fără nume”.

## 3. Permisiuni

Permisiuni granulare, grupate pe modul, fiecare cu un **domeniu de aplicare**:

| Permisiune (exemple) | Domeniu de aplicare |
|---|---|
| `sesizari.depune` | apartamentul propriu |
| `sesizari.vede` | proprii / repartizate rolului / toate |
| `sesizari.inregistreaza`, `sesizari.repartizeaza` | toate |
| `sesizari.raspunde`, `sesizari.semneaza_raspuns` | repartizate / toate |
| `registru.vede`, `registru.document_nou`, `registru.export` | toate |
| `sedinte.convoaca`, `sedinte.redacteaza_pv`, `sedinte.semneaza_pv`, `sedinte.inchide` | — |
| `carte.vede`, `carte.modifica`, `carte.tipareste` | apartamentul propriu / toate |
| `persoane.vede`, `persoane.rezolva` | apartamentul propriu / toate |
| `asociatie.configureaza`, `asociatie.roluri`, `asociatie.apartamente`, `asociatie.module` | — |

- Un **rol** = listă de permisiuni + domeniile de sesizare pe care le primește.
- Unele permisiuni sunt **legate de lege** și nu se pot da oricui (ex. cartea de imobil: doar persoana desemnată și
  președintele — HG 295/2021 art. 93). Profilul le marchează ca blocate; interfața explică de ce.
- Verificarea e **numai pe server**; interfața doar ascunde ce nu poți face.

## 4. Module

| Modul | Conține | Depinde de |
|---|---|---|
| **Nucleu** (mereu activ) | asociație, blocuri, scări, apartamente, persoane, roluri, registru de intrare-ieșire, pagina publică, depunere pe e-mail | — |
| Sesizări | sesizări, termene, răspunsuri semnate, lista lunară | Nucleu |
| Ședințe comitet | convocare, prezență, PV, semnare, dictare | Nucleu |
| Avizier | PV-uri și anunțuri publice | Ședințe (opțional) |
| Carte de imobil | anexa 8, cereri, tipărire | Nucleu |
| Număr de persoane | declarații → administrator | Nucleu |
| Adunare generală *(viitor)* | convocare, prezență pe cote-părți, vot, PV | Nucleu |
| Urmărirea deciziilor *(viitor)* | sarcini din PV | Ședințe |
| Notificări | e-mail / push pentru termene, cereri, convocări | — |

## 5. Profile presetate

Un profil = module active + roluri predefinite + permisiuni + domenii + termene. La creare, asociația alege un profil;
după aceea poate modifica orice nu e blocat de lege.

| Profil | Pentru | Roluri | Module |
|---|---|---|---|
| **Mică** (< 20 ap.) | fără comitet extins | președinte, cenzor, administrator, proprietari | Nucleu, Sesizări, Nr. persoane |
| **Standard (Legea 196/2018)** | majoritatea | președinte, comitet executiv, cenzor, administrator, responsabili pe domenii, proprietari | toate cele existente |
| **Ca Observatorului 105** | regulament cu 13 responsabili | exact rolurile din `config.js` de azi | toate |
| **Administrată de firmă** | firma de administrare are mai multe asociații | ca Standard + rol „firmă de administrare” cu acces în mai multe asociații | toate + panou multi-asociație |

Profilele sunt date (JSON / tabele), nu cod: se pot adăuga fără o versiune nouă.

## 6. Setări pe asociație

- Date de identificare (nume, CUI, adresă, e-mail, logo) — apar pe documente tipărite și pe pagina publică.
- Termene: răspuns la sesizări (implicit 10 zile, art. 57), convocare comitet (5 zile), afișare (7 zile), cartea de
  imobil (15 zile). Valoarea legală e **minimul**: se poate cere mai scurt, nu mai lung.
- Domenii de sesizare și cui se repartizează.
- Referințe la regulamentul intern (articolele afișate în formulare) — text configurabil.
- Canale de depunere, adresa de e-mail pentru formularul public.
- Ce se publică (pagina publică activă sau nu; avizierul).

## 7. Platforma (noi, ca furnizor)

- **Onboarding fără ajutor**: înscriere → date asociație → blocuri și scări → apartamente (CSV sau intervale pe scară)
  → profil → invitarea președintelui și a celorlalți (link pe e-mail / WhatsApp, în locul cardurilor tipărite) → passkey.
  Proprietarii se alătură cu un cod de invitație al apartamentului, confirmat de președinte.
- **Super-admin**: lista asociațiilor, module, limite, suport (acces de suport doar cu acordul asociației, jurnalizat).
- **Facturare: amânată** (gratuit deocamdată). Modelul de date are deja `abonament` și limite pe asociație, ca prețul
  să se poată introduce fără migrare.
- **Adresă publică** per asociație: `<domeniu>/<asociatie>` (ulterior subdomeniu).
- **Export complet** al datelor unei asociații (JSON + fișiere + PDF-uri semnate), oricând — obligatoriu pentru încredere.

## 8. Stivă tehnică și hosting

Principiu: **o singură aplicație web, un singur cod**; desktopul și mobilul sunt aceeași aplicație, instalată sau
împachetată.

### Tehnologii

| Strat | Alegere |
|---|---|
| Limbaj | **TypeScript** peste tot |
| Organizare | monorepo **pnpm + Turborepo**: `apps/api`, `apps/web`, `packages/shared` (reguli, permisiuni, validări) |
| Server | **NestJS** (Node 22), câte un modul NestJS pe modul de produs |
| Bază de date | **PostgreSQL 16**, o bază comună, `asociatie_id` pe fiecare tabel + **Row Level Security** |
| Acces la date | **Drizzle ORM** |
| Validare | **Zod** (comun client / server) |
| Permisiuni | **CASL** (roluri + condiții: „doar apartamentul meu”, „doar cele repartizate”) |
| Autentificare | **passkey** (SimpleWebAuthn) + cod pe e-mail ca rezervă; sesiuni pe server, cookie httpOnly |
| Interfață | **React + Vite**, TanStack Router / Query, **shadcn/ui + Tailwind** |
| Joburi (termene, notificări, PDF) | **pg-boss** (coadă în PostgreSQL) |
| PDF | **Gotenberg** (HTML → PDF) |
| Fișiere | stocare S3-compatibilă în UE, criptată, linkuri temporare |
| E-mail | **Brevo** (UE); primirea sesizărilor pe e-mail: adresă per asociație, parsare în API |
| Push | **Web Push** (VAPID) |
| Plăți (mai târziu) | **Stripe Billing** + **SmartBill** (facturi, e-Factura) |
| Monitorizare | **Sentry** (regiunea UE) + **Uptime Kuma** |
| Teste / CI | **Vitest**, **Playwright**, **GitHub Actions** → imagini Docker |

### Platforme

| Platformă | Alegere | Când |
|---|---|---|
| Web | aplicația React | de la început |
| Desktop | **PWA** instalată din Edge / Chrome (passkey nativ: Windows Hello, Touch ID) | de la început, fără cod în plus |
| Desktop „greu” | **Tauri 2** cu aceeași interfață | doar pentru nevoi reale: offline complet, scanner, imprimantă dedicată |
| Mobil | **PWA**, apoi **Capacitor** pentru App Store / Google Play | Capacitor când vrem prezență în magazine |

Respinse: Electron (greu, passkey slab), Flutter / nativ (încă un cod), Next.js (randarea pe server nu aduce nimic în
spatele conectării), Supabase (passkey și permisiunile complexe tot pe server propriu, mutare grea mai târziu).

### Hosting pe etape (toate în UE)

Prețuri verificate în **octombrie 2026**, fără TVA; Hetzner a scumpit de două ori în 2026 (aprilie, 15 iunie).
Se reconfirmă la comandă.

| Etapă | Infrastructură | Cost / lună |
|---|---|---|
| **1** — 0–20 asociații | 1 server **Hetzner Cloud CX33** (4 vCPU partajate / 8 GB, ~8,49 € + IPv4) cu **Coolify**; **Hetzner Object Storage** (~6,49 €, 1 TB inclus); backup Hetzner (~1,70 €); copie săptămânală la alt furnizor | ~**20–25 €** |
| **2** — 20–200 | PostgreSQL pe **server separat**, administrat de noi, cu **pgBackRest** (restaurare la orice moment) în Object Storage; 2 servere de aplicație + **Hetzner Load Balancer**; joburi / PDF separat; CDN **Bunny.net** | ~**50–90 €** |
| **2+** — când nu mai vrem să administrăm baza de date | **Scaleway Managed PostgreSQL** (~0,14 €/oră pentru 2 vCPU / 8 GB ≈ **105 €/lună** doar baza de date, plus spațiu și backup) | ~**150–200 €** |
| **3** — 200+ | DB mai mare + copie pentru citire; mai multe servere; pentest; marcă temporală calificată opțională | ~**300 €+** |

Note:
- Nu folosim serverele **CPX** (vCPU dedicate) la început: după iunie 2026 CPX32 costă ~35,49 €, de 4 ori mai mult
  decât CX33, fără câștig real pentru încărcarea noastră.
- Alternative mai ieftine de verificat la comandă: **OVH** VPS (după scumpirea din aprilie 2026, posibil cel mai ieftin
  8 GB) și **Netcup**. Hetzner rămâne alegerea implicită pentru că are la același furnizor server, stocare, backup și
  load balancer.
- E-mail: **Brevo** gratuit până la 300 de e-mailuri/zi (~9 000/lună), suficient pentru etapa 1.

Fără Kubernetes. Trecerea între etape nu schimbă tehnologiile (containere Docker + PostgreSQL standard).
Obligatoriu din etapa 1: backup zilnic, copie la alt furnizor, restaurare de probă lunară.

## 9. Juridic și GDPR

Chiar gratuit, platforma prelucrează date personale ale proprietarilor, deci partea juridică trebuie gata **înainte
de a doua asociație**.

- **Firmă nouă** (SRL) care operează platforma; nume de produs propriu (marcă la OSIM, domeniu `.ro`).
- Firma devine **persoana împuternicită** pentru fiecare asociație: contract de prelucrare (DPA) acceptat la înscriere,
  lista subîmputerniciților (Hetzner, Scaleway, Brevo, Sentry), măsuri de securitate.
- Asociația rămâne operator: notă de informare pentru proprietari (generată de platformă, adaptabilă).
- Termeni și condiții, politică de confidențialitate, politică de cookie-uri (doar cookie-uri strict necesare).
- Termene de păstrare configurabile; ștergerea datelor unei asociații la încetare (după export).
- Cartea de imobil: acces restrâns impus de server, jurnal al accesărilor.

## 10. Piața (de verificat)

- Concurența principală (e-bloc, aviziere.ro și altele) e axată pe **liste de plată și încasări**. Diferențiatorul nostru:
  **registrul legal, termenele, răspunsurile semnate, ședințele cu PV semnat, cartea de imobil** — partea de
  conformitate și transparență.
- Integrare, nu concurență, cu platformele de liste de plată (export / import, link din aplicație).
- Ținta inițială: **președinții de asociații**; firmele de administrare, într-o etapă ulterioară.

## 11. Etape

| Etapă | Conținut | Rezultat |
|---|---|---|
| 0 | monorepo, CI, server Hetzner + Coolify; modelul de date (asociație, bloc, scară, apartament, persoană, mandat, rol, permisiuni); autentificare passkey + e-mail | schelet care rulează |
| 1 | nucleul (registru, pagina publică, depunere din cont și pe e-mail) + sesizările; migrarea Observatorului 105 | O105 rulează pe platformă |
| 2 | ședințe, avizier, carte de imobil, nr. persoane; notificări e-mail; PDF-uri | paritate cu MVP |
| 3 | configurare: blocuri / scări / apartamente, roluri, permisiuni, module, profile presetate; onboarding fără ajutor; export complet | platforma se poate folosi de altă asociație |
| 3b | **în paralel cu 1–3**: firma, numele, DPA, termeni, politici | gata juridic |
| 4 | pilot cu 2–3 asociații, gratuit; colectare feedback, decizia de preț | primii clienți |
| 5 | facturare (Stripe + SmartBill), super-admin complet, PWA cu push, Capacitor | vânzare |
| 6 | firme de administrare, adunare generală, urmărirea deciziilor | extindere |

Între timp, MVP-ul actual rămâne în funcțiune pentru Observatorului 105; doar bug-uri, fără funcții noi mari.

## 12. Decizii și întrebări deschise

Decise (11.10.2026):
1. Clientul țintă: **asociațiile direct**.
2. Preț: **gratuit deocamdată**; se decide după pilot.
3. **Blocuri și scări multiple** din prima versiune.
4. Proprietarii: **conturi și e-mail**, ambele.
5. Vânzător: **firmă nouă**.
6. Stiva și hostingul: secțiunea 8.

Deschise:
1. Numele produsului și al firmei; domeniul.
2. Primele 2–3 asociații pilot.
3. Ce limite are varianta gratuită (dacă are), ca să nu blocăm prețul mai târziu.
