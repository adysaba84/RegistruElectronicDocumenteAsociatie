// Registrul de documente și fluxul sesizărilor, peste repo-ul privat de date.
//
//   registru/<an>.json                  { an, inregistrari: [...] }
//   fisiere/<an>/<nr 6 cifre>/<nume>    fișiere atașate
//
// Numerotarea e unică pe an pentru toate documentele (sesizări, răspunsuri, alte
// documente) și reîncepe de la 1 în fiecare an. Nimic nu se șterge; fiecare
// acțiune pe o sesizare se adaugă în istoricul ei.

import { DOMENII, TERMEN_RASPUNS_ZILE, ZILE_AVERTIZARE } from './config.js?v=8';

export const CATEGORII = {
  sesizare: 'Sesizare',
  contestatie: 'Contestație listă de plată',
  propunere: 'Propunere de proiect',
  raspuns: 'Răspuns',
  document: 'Document',
};
export const CATEGORII_SESIZARE = ['sesizare', 'contestatie', 'propunere'];

export const STARI = {
  repartizata: 'Repartizată',
  in_lucru: 'În lucru',
  raspuns_propus: 'Răspuns de semnat',
  raspuns_trimis: 'Răspuns trimis',
  inchisa: 'Închisă',
};
export const STARI_FINALE = ['raspuns_trimis', 'inchisa'];

export const TIPURI_DOC = { intrare: 'Intrare', iesire: 'Ieșire', intern: 'Intern' };
export const CANALE = { aplicatie: 'Aplicație', platforma: 'Platformă (formular)', email: 'E-mail', ebloc: 'e-bloc', hartie: 'Hârtie' };
export const OCUPARE = { da: 'Da, mă ocup eu', nu: 'Nu', ajut: 'Pot ajuta' };

export const MAX_FISIER = 25 * 1024 * 1024;

const json = (obj) => JSON.stringify(obj, null, 2) + '\n';
const caleRegistru = (an) => `registru/${an}.json`;
const acum = () => new Date().toISOString();
const text = (v) => (typeof v === 'string' ? v.trim() : '');

export function azi() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function adaugaZile(iso, zile) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + zile);
  return d.toISOString().slice(0, 10);
}

const zileIntre = (a, b) => Math.round((new Date(`${a}T12:00:00`) - new Date(`${b}T12:00:00`)) / 86400000);

// Starea termenului legal: null dacă nu are termen sau a primit deja răspuns.
export function termenInfo(x) {
  if (!x.termen || STARI_FINALE.includes(x.stare)) return null;
  const zile = zileIntre(x.termen, azi());
  return { zile, nivel: zile < 0 ? 'depasit' : zile <= ZILE_AVERTIZARE ? 'aproape' : 'ok' };
}

export function numeFisierSigur(name) {
  const base = name.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._]+/, '').slice(-100);
  return base || 'fisier';
}

// Semnătură electronică simplă: amprenta SHA-256 a conținutului semnat. Orice modificare
// ulterioară a textului schimbă codul, deci se poate verifica oricând.
export function continutSemnat(s, an, r) {
  return JSON.stringify(['raspuns', `${s.nr}/${an}`, `${r.nr}/${r.an}`, r.data, r.text, r.semnatDe, r.semnatLa]);
}

export async function amprenta(text) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const codVerificare = (hash) => (hash || '').slice(0, 16).toUpperCase().match(/.{1,4}/g)?.join('-') || '';

// Lanț de amprente în registru: amprenta fiecărei înregistrări include amprenta celei
// anterioare, deci modificarea ascunsă a unei înregistrări vechi rupe lanțul.
function campuriInitiale(x) {
  const { amprenta: _a, istoric: _i, stare: _s, responsabil: _r, raspuns: _rs, raspunsDraft: _d,
    listaLunara: _l, modificatDe: _m, modificatLa: _ml, fisiere: _f, ...rest } = x;
  return rest;
}

export async function amprentaInregistrare(x, anterioara) {
  return amprenta(JSON.stringify([anterioara || '', campuriInitiale(x)]));
}

export async function verificaLant(reg) {
  let anterioara = '';
  for (const x of [...reg.inregistrari].sort((a, b) => a.nr - b.nr)) {
    if (!x.amprenta) continue; // înregistrări dinaintea lanțului
    if ((await amprentaInregistrare(x, anterioara)) !== x.amprenta) return { valid: false, nr: x.nr };
    anterioara = x.amprenta;
  }
  return { valid: true };
}

const ultimaAmprenta = (reg) => [...reg.inregistrari].sort((a, b) => b.nr - a.nr).find((x) => x.amprenta)?.amprenta || '';

const nrUrmator = (reg) => reg.inregistrari.reduce((m, x) => Math.max(m, x.nr), 0) + 1;

// Ce se publică despre o sesizare: fără nume, apartament, note interne sau fișiere.
export function vederePublica(reg) {
  return {
    an: reg.an,
    actualizat: acum(),
    sesizari: reg.inregistrari.filter((x) => CATEGORII_SESIZARE.includes(x.categorie)).map((x) => ({
      nr: x.nr,
      data: x.data,
      categorie: x.categorie,
      domeniu: x.domeniu,
      problema: x.problema,
      solutie: x.solutie,
      cost: x.cost,
      maOcup: x.maOcup,
      canal: x.canal,
      responsabil: x.responsabil,
      stare: x.stare,
      termen: x.termen,
      listaLunara: x.listaLunara,
      raspuns: x.raspuns ? {
        nr: x.raspuns.nr, an: x.raspuns.an, data: x.raspuns.data, text: x.raspuns.text,
        semnatDe: x.raspuns.semnatDe, semnatLa: x.raspuns.semnatLa, amprenta: x.raspuns.amprenta,
      } : null,
      istoric: (x.istoric || []).filter((i) => !i.intern).map(({ la, u, actiune }) => ({ la, u: /^ap\d+$/.test(u) ? 'autor' : u, actiune })),
    })),
  };
}

export class Registru {
  constructor(gh, ghPublic, cont) {
    this.gh = gh;             // repo privat
    this.ghPublic = ghPublic; // repo public (vederea publică a sesizărilor)
    this.cont = cont;         // { u, rol, apartament }
    this.cache = {};          // an -> { head, reg }: evită recitirea registrului nemodificat
    this.publicare = Promise.resolve();
    this.eroarePublicare = null;
  }

  // Regenerează sesizari/<an>.json în repo-ul public din registrul privat.
  async publica(an) {
    const reg = await this.citesteAn(an);
    await this.ghPublic.transact(async () => ({
      files: [{ path: `sesizari/${an}.json`, text: json(vederePublica(reg)) }],
      result: null,
    }), () => `Sesizări ${an} actualizate (${this.cont.u})`);
  }

  // Scrierea în registrul privat e sursa de adevăr; dacă publicarea eșuează,
  // se reface la următoarea modificare (sau din butonul „Republică”).
  // Publicarea rulează în fundal (nu blochează salvarea), câte una pe rând.
  cuPublicare(rezultat) {
    this.retine(rezultat.an);
    this.publicare = this.publicare
      .then(() => this.publica(rezultat.an))
      .then(() => { this.eroarePublicare = null; })
      .catch((e) => { this.eroarePublicare = e; });
    return rezultat;
  }

  // După un commit propriu, registrul tocmai scris devine cache-ul pentru noul head.
  retine(an) {
    if (this.ultimRegistru?.an === an && this.gh.ultimulCommit) {
      this.cache[an] = { head: this.gh.ultimulCommit, reg: this.ultimRegistru };
    }
  }

  async init() {
    const info = await this.gh.info();
    if ((await this.gh.head()) === null) {
      await this.gh.initEmpty('README.md', '# Date registru electronic\n\nNu modificați manual — fișierele sunt scrise de aplicație.\n', 'Inițializare registru');
    }
    return info;
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
    if (this.cache[an]?.head === head) return structuredClone(this.cache[an].reg);
    const reg = (await this.gh.readJson(caleRegistru(an), head)) || { an, inregistrari: [] };
    this.cache[an] = { head, reg: structuredClone(reg) };
    return reg;
  }

  async urcaFisiere(files) {
    const out = [];
    for (const file of files) {
      if (file.size > MAX_FISIER) throw new Error(`„${file.name}” depășește 25 MB.`);
      const bytes = new Uint8Array(await file.arrayBuffer());
      out.push({ nume: file.name, marime: file.size, tipMime: file.type, blobSha: await this.gh.createBlob(bytes) });
    }
    return out;
  }

  static ataseaza(an, x, blobs) {
    const files = [];
    const folosite = new Set((x.fisiere || []).map((f) => f.cale));
    for (const b of blobs) {
      let cale = `fisiere/${an}/${String(x.nr).padStart(6, '0')}/${numeFisierSigur(b.nume)}`;
      for (let i = 2; folosite.has(cale); i++) {
        cale = cale.replace(/(-\d+)?(\.[^./]*)?$/, (m, _n, ext) => `-${i}${ext || ''}`);
      }
      folosite.add(cale);
      x.fisiere = [...(x.fisiere || []), { nume: b.nume, cale, marime: b.marime, tipMime: b.tipMime }];
      files.push({ path: cale, blobSha: b.blobSha });
    }
    return files;
  }

  istoric(x, actiune, intern = false) {
    x.istoric = [...(x.istoric || []), { la: acum(), u: this.cont.u, actiune, ...(intern ? { intern: true } : {}) }];
  }

  // Înregistrare nouă în anul curent; `construieste(nr, data)` întoarce câmpurile.
  async inregistreaza(construieste, fisiere, mesaj) {
    const blobs = await this.urcaFisiere(fisiere);
    const an = new Date().getFullYear();
    return this.gh.transact(async (head) => {
      const reg = await this.citesteAn(an, head);
      const x = { nr: nrUrmator(reg), data: azi(), ...construieste(), fisiere: [], creatDe: this.cont.u, creatLa: acum() };
      if (CATEGORII_SESIZARE.includes(x.categorie)) {
        this.istoric(x, `Înregistrată cu nr. ${x.nr} (canal: ${CANALE[x.canal]})`);
      }
      const files = Registru.ataseaza(an, x, blobs);
      x.amprenta = await amprentaInregistrare(x, ultimaAmprenta(reg));
      reg.inregistrari.push(x);
      files.push({ path: caleRegistru(an), text: json(reg) });
      this.ultimRegistru = reg;
      return { files, result: { an, x } };
    }, ({ x }) => `Nr. ${x.nr}/${x.data}: ${mesaj(x)} (${this.cont.u})`).then((r) => { this.retine(an); return r; });
  }

  adaugaSesizare(c, fisiere = []) {
    const domeniu = DOMENII.find((d) => d.id === c.domeniu) || DOMENII.at(-1);
    const categorie = CATEGORII_SESIZARE.includes(c.categorie) ? c.categorie : 'sesizare';
    const apartament = this.cont.rol === 'proprietar' ? this.cont.apartament : Number(c.apartament);
    if (!(apartament >= 1)) throw new Error('Alege apartamentul.');
    if (!text(c.nume)) throw new Error('Completează numele și prenumele.');
    if (!text(c.problema)) throw new Error('Descrie problema.');
    const solutie = text(c.solutie);
    return this.inregistreaza(() => {
      const data = azi();
      const x = {
        tip: 'intrare',
        categorie,
        apartament,
        nume: text(c.nume),
        domeniu: domeniu.id,
        problema: text(c.problema),
        solutie,
        cost: text(c.cost),
        maOcup: OCUPARE[c.maOcup] ? c.maOcup : 'nu',
        canal: this.cont.rol === 'proprietar' ? 'aplicatie' : (CANALE[c.canal] ? c.canal : 'hartie'),
        responsabil: domeniu.rol,
        stare: 'repartizata',
        termen: categorie === 'propunere' ? null : adaugaZile(data, TERMEN_RASPUNS_ZILE),
        listaLunara: categorie === 'propunere' || !solutie,
      };
      return x;
    }, fisiere, (x) => `${CATEGORII[x.categorie]} ap. ${x.apartament}`).then((r) => this.cuPublicare(r));
  }

  adaugaDocument(c, fisiere = []) {
    if (!text(c.continut)) throw new Error('Completează conținutul pe scurt.');
    return this.inregistreaza(() => ({
      tip: TIPURI_DOC[c.tip] ? c.tip : 'intrare',
      categorie: 'document',
      emitent: text(c.emitent),
      destinatar: text(c.destinatar),
      nrDocExtern: text(c.nrDocExtern),
      continut: text(c.continut),
      conexat: text(c.conexat),
    }), fisiere, (x) => `${TIPURI_DOC[x.tip]} — ${x.continut.slice(0, 60)}`);
  }

  // Modifică o înregistrare existentă; `schimbare(x)` rulează din nou pe date proaspete la conflict.
  async modifica(an, nr, schimbare, descriere, fisiere = []) {
    const blobs = await this.urcaFisiere(fisiere);
    return this.gh.transact(async (head) => {
      const reg = await this.citesteAn(an, head);
      const x = reg.inregistrari.find((i) => i.nr === nr);
      if (!x) throw new Error(`Nr. ${nr}/${an} nu există.`);
      schimbare(x);
      const files = Registru.ataseaza(an, x, blobs);
      if (blobs.length) this.istoric(x, `Fișiere adăugate: ${blobs.map((b) => b.nume).join(', ')}`, true);
      files.push({ path: caleRegistru(an), text: json(reg) });
      this.ultimRegistru = reg;
      return { files, result: { an, x } };
    }, () => `Nr. ${nr}/${an}: ${descriere} (${this.cont.u})`).then((r) => (this.retine(an), r)).then((r) => (
      CATEGORII_SESIZARE.includes(r.x.categorie) ? this.cuPublicare(r) : r
    ));
  }

  repartizeaza(an, nr, rol, numeRol) {
    return this.modifica(an, nr, (x) => {
      if (STARI_FINALE.includes(x.stare)) throw new Error('Sesizarea are deja răspuns.');
      x.responsabil = rol;
      if (x.stare !== 'raspuns_propus') x.stare = 'repartizata';
      this.istoric(x, `Repartizată către ${numeRol}`);
    }, 'repartizare');
  }

  incepeLucrul(an, nr) {
    return this.modifica(an, nr, (x) => {
      if (x.stare !== 'repartizata') throw new Error('Starea s-a schimbat între timp.');
      x.stare = 'in_lucru';
      this.istoric(x, 'Preluată în lucru');
    }, 'în lucru');
  }

  // Responsabilul redactează răspunsul; `deSemnat` îl trimite președintelui.
  salveazaRaspuns(an, nr, textRaspuns, deSemnat) {
    if (!text(textRaspuns)) return Promise.reject(new Error('Scrie textul răspunsului.'));
    return this.modifica(an, nr, (x) => {
      if (STARI_FINALE.includes(x.stare)) throw new Error('Sesizarea are deja răspuns trimis.');
      x.raspunsDraft = { text: text(textRaspuns), de: this.cont.u, la: acum() };
      if (deSemnat) x.stare = 'raspuns_propus';
      else if (x.stare === 'repartizata') x.stare = 'in_lucru';
      this.istoric(x, deSemnat ? 'Răspuns redactat, trimis la semnat' : 'Ciornă de răspuns salvată', !deSemnat);
    }, deSemnat ? 'răspuns de semnat' : 'ciornă răspuns');
  }

  respingeRaspuns(an, nr, motiv) {
    return this.modifica(an, nr, (x) => {
      if (x.stare !== 'raspuns_propus') throw new Error('Nu există un răspuns de semnat.');
      x.stare = 'in_lucru';
      this.istoric(x, `Răspuns returnat pentru refacere: ${motiv}`, true);
    }, 'răspuns returnat');
  }

  // Președintele semnează: răspunsul primește propriul număr de ieșire în registru,
  // conexat la sesizare. Ambele înregistrări se scriu în același commit.
  async semneazaRaspuns(an, nr) {
    const anCurent = new Date().getFullYear();
    return this.gh.transact(async (head) => {
      const regCurent = await this.citesteAn(anCurent, head);
      const regS = an === anCurent ? regCurent : await this.citesteAn(an, head);
      const s = regS.inregistrari.find((i) => i.nr === nr);
      if (!s) throw new Error(`Nr. ${nr}/${an} nu există.`);
      if (s.stare !== 'raspuns_propus' || !s.raspunsDraft) throw new Error('Nu există un răspuns de semnat.');
      const data = azi();
      const r = {
        nr: nrUrmator(regCurent),
        data,
        tip: 'iesire',
        categorie: 'raspuns',
        apartament: s.apartament,
        destinatar: `Ap. ${s.apartament}`,
        conexat: `${s.nr}/${an}`,
        continut: s.raspunsDraft.text,
        redactatDe: s.raspunsDraft.de,
        fisiere: [],
        creatDe: this.cont.u,
        creatLa: acum(),
      };
      regCurent.inregistrari.push(r);
      s.raspuns = { nr: r.nr, an: anCurent, data, text: r.continut, redactatDe: r.redactatDe, semnatDe: this.cont.u, semnatLa: acum() };
      s.raspuns.amprenta = await amprenta(continutSemnat(s, an, s.raspuns));
      r.semnatura = s.raspuns.amprenta;
      r.amprenta = await amprentaInregistrare(r, ultimaAmprenta({ inregistrari: regCurent.inregistrari.filter((i) => i !== r) }));
      delete s.raspunsDraft;
      s.stare = 'raspuns_trimis';
      this.istoric(s, `Răspuns semnat și înregistrat cu nr. ${r.nr}/${data.split('-').reverse().join('.')}`);
      const files = [{ path: caleRegistru(anCurent), text: json(regCurent) }];
      if (regS !== regCurent) files.push({ path: caleRegistru(an), text: json(regS) });
      this.ultimRegistru = regS;
      return { files, result: { an, x: s, raspuns: r } };
    }, ({ raspuns }) => `Nr. ${raspuns.nr}: răspuns la nr. ${nr}/${an} (${this.cont.u})`).then((r) => this.cuPublicare(r));
  }

  inchide(an, nr, nota) {
    return this.modifica(an, nr, (x) => {
      x.stare = 'inchisa';
      this.istoric(x, nota ? `Închisă: ${nota}` : 'Închisă');
    }, 'închisă');
  }

  redeschide(an, nr) {
    return this.modifica(an, nr, (x) => {
      x.stare = x.raspuns ? 'raspuns_trimis' : 'in_lucru';
      this.istoric(x, 'Redeschisă');
    }, 'redeschisă');
  }

  adaugaNota(an, nr, nota, fisiere = []) {
    return this.modifica(an, nr, (x) => {
      if (text(nota)) this.istoric(x, `Notă: ${text(nota)}`, true);
    }, 'notă', fisiere);
  }

  seteazaListaLunara(an, nr, val) {
    return this.modifica(an, nr, (x) => {
      x.listaLunara = val;
      this.istoric(x, val ? 'Trecută pe lista ședinței lunare a comitetului (art. 23)' : 'Scoasă de pe lista ședinței lunare', true);
    }, 'listă lunară');
  }

  async descarca(fisier) {
    const bytes = await this.gh.readBytes(fisier.cale);
    if (!bytes) throw new Error('Fișierul nu a fost găsit.');
    return new Blob([bytes], { type: fisier.tipMime || 'application/octet-stream' });
  }
}
