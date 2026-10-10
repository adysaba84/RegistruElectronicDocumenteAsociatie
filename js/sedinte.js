// Ședințele comitetului executiv: convocare, luare la cunoștință (passkey), prezență,
// proces-verbal numerotat în registrul unic și semnat cu passkey, publicare la avizier.
//
//   sedinte/<an>.json (repo privat):  { an, ultimNrPV, sedinte: [...] }
//   avizier/<an>.json (repo public):  procesele-verbale semnate complet, cu semnăturile lor
//
// Legea 196/2018, art. 55: convocare cu cel puțin 5 zile înainte; deciziile se afișează în 7 zile.
//
// Stări: convocată → PV redactat → în semnare → semnată de toți → închisă și afișată.
// Închiderea o face președintele, manual; abia atunci PV ajunge la avizier și nu se mai poate schimba.
// Ședințele de dinainte de închiderea manuală (fără `inchidereManuala`) erau afișate automat la ultima semnătură.

export const ZILE_CONVOCARE = 5;
export const ZILE_AFISARE = 7;

export const STARI_SEDINTA = {
  convocata: 'Convocată',
  pv_redactat: 'Proces-verbal redactat',
  in_semnare: 'În semnare',
  semnata: 'Semnată de toți',
  afisata: 'Închisă și afișată',
};

const json = (obj) => JSON.stringify(obj, null, 2) + '\n';
const acum = () => new Date().toISOString();
const cale = (an) => `sedinte/${an}.json`;
const caleAvizier = (an) => `avizier/${an}.json`;

export const inceput = (s) => new Date(`${s.data}T${s.ora || '00:00'}:00`);
export const zileIntre = (a, b) => (a - b) / 86400000;

// Conținutul semnat la „Am luat la cunoștință”: orice modificare a convocării îl invalidează.
export function continutConvocare(s, an) {
  return JSON.stringify(['convocare', `${s.nr}/${an}`, s.data, s.ora, s.ordineZi, s.zoom || '']);
}

// Conținutul semnat al procesului-verbal (include semnatarii necesari, fixați la redactare).
export function continutPV(s, an) {
  const p = s.pv;
  return JSON.stringify(['pv', `${p.nr}/${an}`, s.data, s.ora, s.ordineZi, p.participanti, p.cvorum, p.semnatari,
    p.puncte, p.observatii || '']);
}

export function stareSedinta(s) {
  if (s.inchisaLa) return 'afisata';
  if (!s.pv) return 'convocata';
  const semnati = new Set((s.semnaturi || []).map((x) => x.u));
  if (!semnati.size) return 'pv_redactat';
  if (!s.pv.semnatari.every((u) => semnati.has(u))) return 'in_semnare';
  return s.inchidereManuala ? 'semnata' : 'afisata';
}

export const inchisa = (s) => stareSedinta(s) === 'afisata';
const blocheazaDacaInchisa = (s) => {
  if (inchisa(s)) throw new Error('Procesul-verbal e închis și afișat la avizier. Nu se mai poate modifica nimic.');
};

export const cvorum = (membri, prezenti) => {
  const necesar = Math.floor(membri / 2) + 1;
  return { membri, prezenti, necesar, intrunit: prezenti >= necesar };
};

export class Sedinte {
  constructor(gh, ghPublic, cont) {
    this.gh = gh;
    this.ghPublic = ghPublic;
    this.cont = cont;
    this.publicare = Promise.resolve();
  }

  async citesteAn(an, ref) {
    return (await this.gh.readJson(cale(an), ref || (await this.gh.head()))) || { an, ultimNrPV: 0, sedinte: [] };
  }

  istoric(s, actiune) {
    s.istoric = [...(s.istoric || []), { la: acum(), u: this.cont.u, actiune }];
  }

  async modifica(an, nr, schimbare, descriere) {
    const rez = await this.gh.transact(async (head) => {
      const reg = await this.citesteAn(an, head);
      const s = reg.sedinte.find((x) => x.nr === nr);
      if (!s) throw new Error(`Ședința ${nr}/${an} nu există.`);
      blocheazaDacaInchisa(s);
      await schimbare(s, reg);
      return { files: [{ path: cale(an), text: json(reg) }], result: { an, s } };
    }, () => `Ședința ${nr}/${an}: ${descriere} (${this.cont.u})`);
    this.publicaInFundal(an);
    return rez;
  }

  async convoaca({ data, ora, ordineZi, zoom, sesizari = [] }) {
    if (!data || !ora) throw new Error('Alege data și ora ședinței.');
    const puncte = ordineZi.map((p) => p.trim()).filter(Boolean);
    if (!puncte.length) throw new Error('Completează ordinea de zi.');
    const an = Number(data.slice(0, 4));
    return this.gh.transact(async (head) => {
      const reg = await this.citesteAn(an, head);
      const s = {
        nr: reg.sedinte.reduce((m, x) => Math.max(m, x.nr), 0) + 1,
        data, ora, ordineZi: puncte, zoom: (zoom || '').trim(), sesizari, inchidereManuala: true,
        convocataDe: this.cont.u, convocataLa: acum(),
        confirmari: [], prezenta: [], pv: null, semnaturi: [], semnaturiAnulate: [], istoric: [],
      };
      this.istoric(s, 'Ședință convocată');
      reg.sedinte.push(s);
      return { files: [{ path: cale(an), text: json(reg) }], result: { an, s } };
    }, ({ s }) => `Ședința ${s.nr}/${an} convocată pentru ${data} ${ora} (${this.cont.u})`);
  }

  editeazaConvocare(an, nr, { data, ora, ordineZi, zoom, sesizari = [] }) {
    return this.modifica(an, nr, (s) => {
      if (s.pv) throw new Error('Procesul-verbal a fost deja redactat; convocarea nu se mai poate modifica.');
      if (data.slice(0, 4) !== s.data.slice(0, 4)) throw new Error('Data trebuie să rămână în același an.');
      Object.assign(s, { data, ora, ordineZi: ordineZi.map((p) => p.trim()).filter(Boolean), zoom: (zoom || '').trim(), sesizari });
      if (s.confirmari.length) this.istoric(s, `Convocare modificată — ${s.confirmari.length} confirmări anulate`);
      else this.istoric(s, 'Convocare modificată');
      s.confirmari = [];
    }, 'convocare modificată');
  }

  confirma(an, nr, semnatura, hashAsteptat) {
    return this.modifica(an, nr, async (s) => {
      if (semnatura.hash !== await hashAsteptat(s)) throw new Error('Convocarea s-a modificat între timp. Reîncarcă și confirmă din nou.');
      s.confirmari = s.confirmari.filter((c) => c.u !== this.cont.u).concat(semnatura);
      this.istoric(s, 'Am luat la cunoștință (passkey)');
    }, 'luare la cunoștință');
  }

  prezent(an, nr) {
    return this.modifica(an, nr, (s) => {
      if (s.semnaturi.length) throw new Error('Procesul-verbal e deja în semnare.');
      if (!s.prezenta.some((p) => p.u === this.cont.u)) s.prezenta.push({ u: this.cont.u, la: acum() });
      this.istoric(s, 'Prezent');
    }, 'prezență');
  }

  // Salvează procesul-verbal. Primește număr din registrul unic la prima salvare.
  // O modificare după prima semnătură anulează toate semnăturile.
  salveazaPV(an, nr, pv) {
    return this.modifica(an, nr, (s, reg) => {
      const nou = { ...pv, nr: s.pv?.nr || ++reg.ultimNrPV, redactatDe: s.pv?.redactatDe || this.cont.u, modificatDe: this.cont.u, modificatLa: acum() };
      if (s.semnaturi.length) {
        s.semnaturiAnulate.push(...s.semnaturi.map((x) => ({ ...x, anulataLa: acum() })));
        this.istoric(s, `Proces-verbal modificat după semnare — ${s.semnaturi.length} semnături anulate`);
        s.semnaturi = [];
      } else {
        this.istoric(s, s.pv ? 'Proces-verbal modificat' : `Proces-verbal nr. ${nou.nr}/${an} redactat`);
      }
      s.pv = nou;
    }, 'proces-verbal');
  }

  semneazaPV(an, nr, semnatura, hashAsteptat) {
    return this.modifica(an, nr, async (s) => {
      if (!s.pv) throw new Error('Nu există proces-verbal.');
      if (!s.pv.semnatari.includes(this.cont.u)) throw new Error('Nu ești printre semnatarii acestui proces-verbal.');
      if (semnatura.hash !== await hashAsteptat(s)) throw new Error('Procesul-verbal s-a modificat între timp. Reîncarcă și semnează din nou.');
      s.semnaturi = s.semnaturi.filter((x) => x.u !== this.cont.u).concat(semnatura);
      this.istoric(s, 'Proces-verbal semnat (passkey)');
      if (stareSedinta(s) === 'semnata') {
        s.semnataLa = acum();
        this.istoric(s, 'Semnat de toți — așteaptă închiderea de către președinte');
      }
    }, 'semnătură proces-verbal');
  }

  // Președintele închide procesul-verbal semnat de toți: se afișează la avizier și se blochează.
  inchidePV(an, nr) {
    return this.modifica(an, nr, (s) => {
      if (this.cont.rol !== 'presedinte') throw new Error('Doar președintele închide procesul-verbal.');
      if (stareSedinta(s) !== 'semnata') throw new Error('Procesul-verbal se poate închide doar după ce au semnat toți semnatarii.');
      s.inchisaLa = acum();
      s.inchisaDe = this.cont.u;
      this.istoric(s, 'Proces-verbal închis și afișat la avizier');
    }, 'proces-verbal închis și afișat');
  }

  // Sesizările deja trecute pe ordinea de zi a unei ședințe din anul dat („nr/an”).
  async sesizariPeOrdine(an) {
    const reg = await this.citesteAn(an);
    return new Set(reg.sedinte.flatMap((s) => s.sesizari || []));
  }

  // Avizierul public conține doar procesele-verbale închise (semnate de toți și închise de președinte).
  async publicaAvizier(an) {
    const reg = await this.citesteAn(an);
    const semnate = reg.sedinte.filter(inchisa).map((s) => ({
      nr: s.nr, data: s.data, ora: s.ora, ordineZi: s.ordineZi, pv: s.pv, semnaturi: s.semnaturi, semnataLa: s.semnataLa, inchisaLa: s.inchisaLa,
    }));
    const existent = await this.ghPublic.readJson(caleAvizier(an));
    if (JSON.stringify(existent?.sedinte || []) === JSON.stringify(semnate)) return;
    await this.ghPublic.transact(async () => ({
      files: [{ path: caleAvizier(an), text: json({ an, actualizat: acum(), sedinte: semnate }) }],
      result: null,
    }), () => `Avizier ${an} actualizat (${this.cont.u})`);
  }

  publicaInFundal(an) {
    this.publicare = this.publicare.then(async () => {
      for (const pauza of [0, 2000, 5000, 15000]) {
        if (pauza) await new Promise((r) => setTimeout(r, pauza));
        try { await this.publicaAvizier(an); return; } catch { /* reîncearcă */ }
      }
    });
    return this.publicare;
  }
}
