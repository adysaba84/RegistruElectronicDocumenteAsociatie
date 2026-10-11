// Conturile aplicației: utilizator + parolă, fiecare cu un rol atribuit unui apartament.
//
// conturi.json (repo-ul public):
//   { versiune, utilizatori: [{ u, rol, apartament, temporara, cheie: {salt, iv, iter, date} }] }
// `cheie` = tokenul de acces la date, criptat cu parola utilizatorului. Parolele nu se
// stochează nicăieri; fără parola corectă cheia nu se poate decripta.

import { GitHubRepo } from './github.js?v=21';
import { cripteaza, decripteaza, parolaTemporara, ITERATII_PAROLA, ITERATII_TEMPORARA } from './crypto.js?v=21';
import { REPO_PUBLIC, REPO_DATE, ROLURI } from './config.js?v=21';

const FISIER = 'conturi.json';
const json = (obj) => JSON.stringify(obj, null, 2) + '\n';

export const MIN_PAROLA = 10;

export function verificaParola(u, parola) {
  if (parola.length < MIN_PAROLA) return `Parola trebuie să aibă cel puțin ${MIN_PAROLA} caractere.`;
  if (parola.toLowerCase().includes(u.toLowerCase())) return 'Parola nu poate conține numele de utilizator.';
  if (!/[a-zA-Z]/.test(parola) || !/[0-9]/.test(parola)) return 'Parola trebuie să conțină litere și cifre.';
  return null;
}

// La configurare se creează doar conturile administrației; conturile apartamentelor
// (ap01…ap60) apar pe rând, când președintele generează cardul de acces.
export function contImplicite() {
  return ROLURI.map((r) => ({ u: r.u, rol: r.id, apartament: null }));
}

export class Conturi {
  constructor(apiBase, date) {
    this.apiBase = apiBase;
    this.date = date;
  }

  static repo(apiBase, token) {
    return new GitHubRepo({ apiBase, token, repo: REPO_PUBLIC });
  }

  // null = aplicația nu a fost încă configurată.
  static async incarca(apiBase, token = null) {
    const gh = Conturi.repo(apiBase, token);
    const date = await gh.readJson(FISIER);
    return date ? new Conturi(apiBase, date) : null;
  }

  get utilizatori() {
    return this.date.utilizatori;
  }

  gaseste(u) {
    const cheie = (u || '').trim().toLowerCase();
    return this.utilizatori.find((x) => x.u === cheie) || null;
  }

  async autentifica(u, parola) {
    const cont = this.gaseste(u);
    if (!cont?.cheie) return null;
    const secret = await decripteaza(cont.cheie, parola);
    return secret?.token ? { cont, token: secret.token } : null;
  }

  // Modifică un cont și scrie fișierul (reia automat dacă altcineva a scris între timp).
  async modificaCont(token, u, schimbare, mesaj) {
    const gh = Conturi.repo(this.apiBase, token);
    await gh.info();
    const actualizat = await gh.transact(async (head) => {
      const date = await gh.readJson(FISIER, head);
      const cont = date.utilizatori.find((x) => x.u === u);
      if (!cont) throw new Error(`Contul ${u} nu există.`);
      await schimbare(cont);
      return { files: [{ path: FISIER, text: json(date) }], result: date };
    }, () => mesaj);
    this.date = actualizat;
    return this.gaseste(u);
  }

  schimbaParola(token, u, parolaNoua) {
    return this.modificaCont(token, u, async (cont) => {
      cont.cheie = await cripteaza({ token }, parolaNoua, ITERATII_PAROLA);
      cont.temporara = false;
    }, `Parolă schimbată: ${u}`);
  }

  async reseteaza(token, u) {
    const parola = parolaTemporara();
    await this.modificaCont(token, u, async (cont) => {
      cont.cheie = await cripteaza({ token }, parola, ITERATII_TEMPORARA);
      cont.temporara = true;
    }, `Parolă resetată: ${u}`);
    return parola;
  }

  // Card de acces: parolă temporară nouă pentru un cont, creat dacă nu există încă
  // (ex. apartamentul care cere acces). Întoarce parola, afișată o singură dată.
  async cardAcces(token, model) {
    const gh = Conturi.repo(this.apiBase, token);
    await gh.info();
    const parola = parolaTemporara();
    const cheie = await cripteaza({ token }, parola, ITERATII_TEMPORARA);
    this.date = await gh.transact(async (head) => {
      const date = await gh.readJson(FISIER, head);
      let cont = date.utilizatori.find((x) => x.u === model.u);
      if (!cont) date.utilizatori.push(cont = { ...model });
      cont.cheie = cheie;
      cont.temporara = true;
      return { files: [{ path: FISIER, text: json(date) }], result: date };
    }, () => `Card de acces: ${model.u}`);
    return parola;
  }

  // Funcție suplimentară „membru comitet executiv”; contul își păstrează rolul de bază.
  seteazaComitet(token, u, membru) {
    return this.modificaCont(token, u, (cont) => { cont.comitet = membru; }, `Comitet executiv: ${u} ${membru ? 'adăugat' : 'retras'}`);
  }

  // Președintele e membru de drept; ceilalți prin bifa „comitet”.
  membriComitet() {
    return this.utilizatori.filter((c) => c.rol === 'presedinte' || (c.comitet && !['cenzor', 'administrator', 'proprietar'].includes(c.rol)));
  }

  seteazaApartament(token, u, apartament) {
    return this.modificaCont(token, u, (cont) => { cont.apartament = apartament; }, `Apartament atribuit: ${u} → ${apartament ?? '—'}`);
  }

  // Configurarea inițială: verifică tokenul, generează toate conturile cu parole
  // temporare unice și scrie conturi.json. Întoarce lista de parole (afișată o singură dată).
  static async genereaza(apiBase, token, progres = () => {}) {
    const verifica = async (gh) => {
      const nume = gh.repo.split('/')[1];
      try {
        await gh.info();
      } catch (e) {
        if (e.status === 401) throw new Error('GitHub nu recunoaște cheia (copiată incomplet sau expirată). Generează una nouă.');
        if (e.status === 404) throw new Error(`Cheia nu are acces la repo-ul „${nume}”. Pe GitHub, editează cheia → Repository access → adaugă-l, apoi încearcă din nou.`);
        throw e;
      }
      // `permissions` din răspuns arată rolul contului, nu al cheii; testăm scrierea efectiv.
      // Într-un repo gol Git Data API nu merge; prima scriere îl și inițializează.
      try {
        if ((await gh.head()) === null) {
          await gh.initEmpty('README.md', '# Date registru electronic\n\nNu modificați manual — fișierele sunt scrise de aplicație.\n', 'Inițializare');
        } else {
          await gh.createBlob(new TextEncoder().encode('test acces'));
        }
      } catch (e) {
        if (e.status === 403 || e.status === 404) throw new Error(`Cheia vede repo-ul „${nume}”, dar nu poate scrie în el. Pe GitHub, editează cheia → Permissions → Contents: Read and write → Update.`);
        throw e;
      }
    };
    await verifica(new GitHubRepo({ apiBase, token, repo: REPO_DATE }));
    const gh = Conturi.repo(apiBase, token);
    await verifica(gh);
    if (await gh.readJson(FISIER, await gh.head())) throw new Error('Aplicația este deja configurată.');

    const lista = contImplicite();
    const parole = [];
    for (let i = 0; i < lista.length; i++) {
      const parola = parolaTemporara();
      lista[i].temporara = true;
      lista[i].cheie = await cripteaza({ token }, parola, ITERATII_TEMPORARA);
      parole.push({ u: lista[i].u, rol: lista[i].rol, apartament: lista[i].apartament, parola });
      progres(i + 1, lista.length);
    }
    const continut = json({ versiune: 1, utilizatori: lista });
    const head = await gh.head();
    if (head === null) await gh.initEmpty(FISIER, continut, 'Configurare conturi');
    else await gh.commitFiles(head, [{ path: FISIER, text: continut }], 'Configurare conturi');
    return parole;
  }
}
