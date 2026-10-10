// Logica registrului peste repo-ul de date.
//
// Structura repo-ului de date:
//   config.json                         date asociație, compartimente
//   registru/<an>.json                  { an, inregistrari: [...] }
//   fisiere/<an>/<nr 6 cifre>/<nume>    scanuri / PDF-uri atașate
//
// Numerotarea reîncepe de la 1 în fiecare an. Un număr nu se refolosește
// niciodată: înregistrările nu se șterg, se anulează.

export const TIPURI = { intrare: 'Intrare', iesire: 'Ieșire', intern: 'Intern' };
export const STARI = { deschis: 'În lucru', rezolvat: 'Rezolvat', anulat: 'Anulat' };

export const CAMPURI_EDITABILE = [
  'tip', 'emitent', 'destinatar', 'nrDocExtern', 'dataDocExtern', 'continut',
  'repartizat', 'termen', 'conexat', 'dosar', 'dataExpedierii', 'observatii',
];

export const MAX_FISIER = 25 * 1024 * 1024;

const CONFIG_IMPLICIT = {
  asociatie: { nume: 'Asociația de Proprietari', adresa: '', cif: '' },
  compartimente: ['Administrator', 'Președinte', 'Comitet executiv', 'Cenzor', 'Contabil'],
};


export function azi() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function numeFisierSigur(name) {
  const base = name.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._]+/, '').slice(-100);
  return base || 'fisier';
}

const caleRegistru = (an) => `registru/${an}.json`;
const json = (obj) => JSON.stringify(obj, null, 2) + '\n';

export class Registru {
  constructor(gh, utilizator) {
    this.gh = gh;
    this.utilizator = utilizator; // nume afișat, trecut în creatDe / modificatDe
    this.config = null;
  }

  async init() {
    const info = await this.gh.info();
    if ((await this.gh.head()) === null) {
      if (!info.permissions?.push) throw new Error('Registrul nu a fost încă inițializat de un administrator cu drept de scriere.');
      await this.gh.initEmpty('config.json', json(CONFIG_IMPLICIT), 'Inițializare registru');
    }
    await this.incarcaConfig();
    return info;
  }

  async incarcaConfig() {
    const head = await this.gh.head();
    const cfg = await this.gh.readJson('config.json', head);
    this.config = { ...CONFIG_IMPLICIT, ...(cfg || {}) };
    return this.config;
  }

  async salveazaConfig(config) {
    await this.gh.transact(async (head) => ({
      files: [{ path: 'config.json', text: json(config) }],
      result: config,
    }), () => `Setări actualizate (${this.utilizator})`);
    this.config = config;
  }

  async ani() {
    const head = await this.gh.head();
    const ani = (await this.gh.listDir('registru', head))
      .map((f) => /^(\d{4})\.json$/.exec(f.name)).filter(Boolean).map((m) => Number(m[1]));
    const curent = new Date().getFullYear();
    if (!ani.includes(curent)) ani.push(curent);
    return ani.sort((a, b) => b - a);
  }

  async citesteAn(an, ref) {
    const head = ref || (await this.gh.head());
    const data = await this.gh.readJson(caleRegistru(an), head);
    return data || { an, inregistrari: [] };
  }

  // Urcă fișierele ca blob-uri o singură dată, înainte de commit; la reîncercare
  // se refolosesc (blob-ul nu depinde de calea la care ajunge).
  async urcaFisiere(files) {
    const out = [];
    for (const file of files) {
      if (file.size > MAX_FISIER) throw new Error(`„${file.name}” depășește 25 MB.`);
      const bytes = new Uint8Array(await file.arrayBuffer());
      out.push({ nume: file.name, marime: file.size, tipMime: file.type, blobSha: await this.gh.createBlob(bytes) });
    }
    return out;
  }

  static ataseaza(an, nr, intrare, blobs) {
    const files = [];
    const folosite = new Set((intrare.fisiere || []).map((f) => f.cale));
    for (const b of blobs) {
      let nume = numeFisierSigur(b.nume);
      let cale = `fisiere/${an}/${String(nr).padStart(6, '0')}/${nume}`;
      for (let i = 2; folosite.has(cale); i++) {
        cale = cale.replace(/(\.[^./]*)?$/, (ext) => `-${i}${ext || ''}`);
      }
      folosite.add(cale);
      intrare.fisiere = [...(intrare.fisiere || []), { nume: b.nume, cale, marime: b.marime, tipMime: b.tipMime }];
      files.push({ path: cale, blobSha: b.blobSha });
    }
    return files;
  }

  async adauga(campuri, fisiereNoi = []) {
    const blobs = await this.urcaFisiere(fisiereNoi);
    const an = new Date().getFullYear();
    return this.gh.transact(async (head) => {
      const reg = await this.citesteAn(an, head);
      const nr = reg.inregistrari.reduce((m, x) => Math.max(m, x.nr), 0) + 1;
      const intrare = {
        nr,
        data: azi(),
        ...pick(campuri, CAMPURI_EDITABILE),
        stare: 'deschis',
        fisiere: [],
        creatDe: this.utilizator,
        creatLa: new Date().toISOString(),
      };
      const files = Registru.ataseaza(an, nr, intrare, blobs);
      reg.inregistrari.push(intrare);
      files.push({ path: caleRegistru(an), text: json(reg) });
      return { files, result: { an, intrare } };
    }, ({ intrare }) => `Nr. ${intrare.nr}/${intrare.data}: ${TIPURI[intrare.tip] || ''} — ${(intrare.continut || '').slice(0, 60)} (${this.utilizator})`);
  }

  // `schimbare(intrare)` modifică înregistrarea pe loc; rulează din nou pe datele
  // proaspete dacă apare un conflict.
  async modifica(an, nr, schimbare, descriere, fisiereNoi = []) {
    const blobs = await this.urcaFisiere(fisiereNoi);
    return this.gh.transact(async (head) => {
      const reg = await this.citesteAn(an, head);
      const intrare = reg.inregistrari.find((x) => x.nr === nr);
      if (!intrare) throw new Error(`Nr. ${nr}/${an} nu există.`);
      schimbare(intrare);
      const files = Registru.ataseaza(an, nr, intrare, blobs);
      intrare.modificatDe = this.utilizator;
      intrare.modificatLa = new Date().toISOString();
      files.push({ path: caleRegistru(an), text: json(reg) });
      return { files, result: { an, intrare } };
    }, () => `Nr. ${nr}/${an}: ${descriere} (${this.utilizator})`);
  }

  editeaza(an, nr, campuri, fisiereNoi) {
    return this.modifica(an, nr, (x) => Object.assign(x, pick(campuri, CAMPURI_EDITABILE)), 'modificare', fisiereNoi);
  }

  schimbaStare(an, nr, stare, motiv = '') {
    return this.modifica(an, nr, (x) => {
      if (x.stare === 'anulat') throw new Error('Înregistrarea este anulată.');
      x.stare = stare;
      if (stare === 'anulat') x.motivAnulare = motiv;
    }, STARI[stare].toLowerCase());
  }

  async descarca(fisier) {
    const bytes = await this.gh.readBytes(fisier.cale);
    if (!bytes) throw new Error('Fișierul nu a fost găsit.');
    return new Blob([bytes], { type: fisier.tipMime || 'application/octet-stream' });
  }
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (k in obj) out[k] = typeof obj[k] === 'string' ? obj[k].trim() : obj[k];
  return out;
}

