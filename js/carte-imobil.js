// Cartea de imobil în formatul din HG nr. 295/2021, anexa 8, ținută electronic în repo-ul privat.
//
//   carte-imobil.json  { versiune, persoane: [{ id, apartament, nume, actSerie, actNumar, dataMutarii,
//                        felAdresa, domiciliu, dataPlecarii, telefon, email, contact, cerere?, cerereRadiere?, istoric: [...] }] }
//
// `telefon`, `email`, `contact` (persoană de contact pentru apartament) sunt opționale și nu fac parte din anexa 8:
// apar doar în evidența extinsă, nu în tipărirea oficială.
//
// Coloanele anexei 8: numele (cu litere de tipar), actul de identitate (seria, numărul), data mutării
// în imobil și felul adresei (domiciliu / reședință), domiciliul din actul de identitate, data mutării din imobil.
// Nicio persoană nu se șterge: la mutare se completează data mutării din imobil.
//
// Acces: doar responsabilul cărții de imobil și președintele (art. 93 lit. c) din anexa 1 la HG 295/2021:
// cartea se prezintă spre verificare numai poliției și S.P.C.E.P.). Nu se păstrează copii ale actelor (art. 94).

import { caleRegistru, FEL_ADRESA, STARI_FINALE, verificaContact } from './store.js?v=21';

const FISIER = 'carte-imobil.json';
const json = (obj) => JSON.stringify(obj, null, 2) + '\n';
const acum = () => new Date().toISOString();
const text = (v) => (typeof v === 'string' ? v.trim() : '');
const dataValida = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '');

export const ROLURI_CARTE = ['presedinte', 'r01'];          // văd și modifică
export const ROLURI_CARTE_CITIRE = [...ROLURI_CARTE, 'administrator']; // văd și tipăresc

// Câmpurile din anexa 8, validate. `partial` = corecție (doar câmpurile trimise).
function campuri(p) {
  const out = {
    apartament: Number(p.apartament),
    nume: text(p.nume).toUpperCase(),
    actSerie: text(p.actSerie).toUpperCase(),
    actNumar: text(p.actNumar),
    dataMutarii: text(p.dataMutarii),
    felAdresa: FEL_ADRESA[p.felAdresa] ? p.felAdresa : 'domiciliu',
    domiciliu: text(p.domiciliu),
    telefon: text(p.telefon),
    email: text(p.email).toLowerCase(),
    contact: p.contact === true || p.contact === 'on',
  };
  if (!(out.apartament >= 1)) throw new Error('Alege apartamentul.');
  if (!out.nume) throw new Error('Completează numele și prenumele.');
  if (!out.actNumar) throw new Error(`Completează numărul actului de identitate pentru ${out.nume}.`);
  if (!dataValida(out.dataMutarii)) throw new Error(`Completează data mutării în imobil pentru ${out.nume}.`);
  if (!out.domiciliu) throw new Error(`Completează domiciliul din actul de identitate pentru ${out.nume}.`);
  verificaContact(out);
  return out;
}

export class CarteImobil {
  constructor(reg) {
    this.reg = reg; // Registru: același repo privat, pentru a rezolva cererea în același commit
    this.gh = reg.gh;
  }

  async citeste(ref) {
    return (await this.gh.readJson(FISIER, ref || (await this.gh.head()))) || { versiune: 1, persoane: [] };
  }

  // Modifică cartea și, opțional, cererea din registru care a cerut modificarea, într-un singur commit.
  async scrie(schimbare, mesaj, cerere = null) {
    const u = this.reg.cont.u;
    const r = await this.gh.transact(async (head) => {
      const carte = await this.citeste(head);
      let reg = null;
      let x = null;
      if (cerere) {
        reg = await this.reg.citesteAn(cerere.an, head);
        x = reg.inregistrari.find((i) => i.nr === cerere.nr);
        if (!x || x.categorie !== 'cerere_carte') throw new Error(`Cererea nr. ${cerere.nr}/${cerere.an} nu există.`);
        if (STARI_FINALE.includes(x.stare)) throw new Error('Cererea e deja rezolvată.');
      }
      const descriere = schimbare(carte, x);
      if (x) {
        x.stare = 'rezolvata';
        x.rezolvare = { la: acum(), u, nota: descriere };
        this.reg.istoric(x, descriere);
      }
      const files = [{ path: FISIER, text: json(carte) }];
      if (reg) {
        files.push({ path: caleRegistru(cerere.an), text: json(reg) });
        this.reg.ultimRegistru = reg;
      }
      return { files, result: { carte, x } };
    }, () => `Cartea de imobil: ${mesaj} (${u})`);
    if (cerere) this.reg.retine(cerere.an);
    return r;
  }

  static istoric(p, u, actiune) {
    p.istoric = [...(p.istoric || []), { la: acum(), u, actiune }];
  }

  // Înscrie persoanele (după verificarea vizuală a actului de identitate). `cerere` = { an, nr } dacă vin dintr-o cerere.
  inscrie(lista, cerere = null) {
    const u = this.reg.cont.u;
    const noi = lista.map(campuri);
    return this.scrie((carte, x) => {
      for (const p of noi) {
        if (x && p.apartament !== x.apartament) throw new Error('Apartamentul nu corespunde cererii.');
        const persoana = { id: crypto.randomUUID(), ...p, dataPlecarii: null, ...(cerere ? { cerere: `${cerere.nr}/${cerere.an}` } : {}) };
        CarteImobil.istoric(persoana, u, cerere ? `Înscrisă la cererea nr. ${cerere.nr}/${cerere.an}` : 'Înscrisă');
        carte.persoane.push(persoana);
      }
      return `Înscris în cartea de imobil: ${noi.map((p) => p.nume).join(', ')}`;
    }, `înscriere ap. ${noi[0]?.apartament}`, cerere);
  }

  // `plecari` = [{ id, data }]
  radiaza(plecari, cerere = null) {
    const u = this.reg.cont.u;
    if (!plecari.length) return Promise.reject(new Error('Alege persoanele care s-au mutat.'));
    for (const pl of plecari) if (!dataValida(pl.data)) return Promise.reject(new Error('Completează data mutării din imobil.'));
    return this.scrie((carte, x) => {
      const nume = [];
      for (const pl of plecari) {
        const p = carte.persoane.find((y) => y.id === pl.id);
        if (!p) throw new Error('Persoana nu mai există în cartea de imobil.');
        if (p.dataPlecarii) throw new Error(`${p.nume} are deja data mutării din imobil.`);
        if (x && p.apartament !== x.apartament) throw new Error('Apartamentul nu corespunde cererii.');
        if (pl.data < p.dataMutarii) throw new Error(`Data mutării din imobil e înaintea datei mutării în imobil pentru ${p.nume}.`);
        p.dataPlecarii = pl.data;
        if (cerere) p.cerereRadiere = `${cerere.nr}/${cerere.an}`;
        CarteImobil.istoric(p, u, `Mutată din imobil la ${pl.data}${cerere ? ` (cererea nr. ${cerere.nr}/${cerere.an})` : ''}`);
        nume.push(p.nume);
      }
      return `Radiat din cartea de imobil: ${nume.join(', ')}`;
    }, 'radiere', cerere);
  }

  // Corectarea unei înscrieri greșite; vechile valori rămân în istoricul persoanei.
  corecteaza(id, valori) {
    const u = this.reg.cont.u;
    const nou = campuri(valori);
    const plecare = text(valori.dataPlecarii);
    if (plecare && !dataValida(plecare)) return Promise.reject(new Error('Data mutării din imobil nu e validă.'));
    if (plecare && plecare < nou.dataMutarii) return Promise.reject(new Error('Data mutării din imobil e înaintea datei mutării în imobil.'));
    return this.scrie((carte) => {
      const p = carte.persoane.find((y) => y.id === id);
      if (!p) throw new Error('Persoana nu mai există în cartea de imobil.');
      const schimbate = [];
      for (const [k, v] of Object.entries({ ...nou, dataPlecarii: plecare || null })) {
        if ((p[k] ?? null) !== v) { schimbate.push(`${k}: „${p[k] ?? ''}” → „${v ?? ''}”`); p[k] = v; }
      }
      if (!schimbate.length) throw new Error('Nu ai modificat nimic.');
      CarteImobil.istoric(p, u, `Corectată: ${schimbate.join('; ')}`);
      return `Corectat: ${p.nume}`;
    }, 'corecție');
  }
}
