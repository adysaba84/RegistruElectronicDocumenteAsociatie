import { GitHubRepo, GitHubError, activitate } from './github.js?v=23';
import { Conturi, verificaParola, MIN_PAROLA } from './conturi.js?v=23';
import {
  Registru, CATEGORII, CATEGORII_SESIZARE, CATEGORII_CERERE, STARI, STARI_CERERE, STARI_FINALE, TIPURI_DOC, CANALE, OCUPARE, MAX_FISIER,
  OPERATII_CARTE, FEL_ADRESA, TERMEN_CARTE_ZILE, MAX_PERSOANE,
  termenInfo, azi, amprenta, continutSemnat, continutRaspuns, codVerificare, verificaLant, pregatesteCerere, amprentaParte, continutCerere,
} from './store.js?v=23';
import { CarteImobil, ROLURI_CARTE, ROLURI_CARTE_CITIRE } from './carte-imobil.js?v=23';
import { Chei, FaraCheie, creeazaCheie, semneaza, verifica, suportat, hashText, b64u, unb64u } from './passkey.js?v=23';
import {
  Sedinte, STARI_SEDINTA, ZILE_CONVOCARE, ZILE_AFISARE, continutConvocare, continutPV, stareSedinta, inchisa, cvorum, inceput, zileIntre,
} from './sedinte.js?v=23';
import {
  ASOCIATIA, REPO_DATE, REPO_PUBLIC, ROLURI, DOMENII, APARTAMENTE, TERMEN_RASPUNS_ZILE, apiBase, urlPublic,
} from './config.js?v=23';
import { parseaza, parseazaVot, parseazaTermen, potrivesteRol, fraza, textLiber } from './comenzi-voce.js?v=23';
import { pvInText, textInPV } from './pv-text.js?v=23';
import { Dictare, dictareSuportata } from './dictare.js?v=23';

const API = apiBase();
activitate.la = (n) => document.body.classList.toggle('ocupat', n > 0);
const $app = document.getElementById('app');
const CHEIE_SESIUNE = 'registru.sesiune';
const AN_START = 2026;

const S = {
  conturi: null,   // Conturi (încărcat la nevoie)
  cont: null,      // contul conectat
  token: null,
  reg: null,       // Registru (doar administrație)
  carte: null,     // CarteImobil (responsabilul cărții de imobil și președintele)
  sed: null,       // Sedinte (comitet)
  chei: null,      // Chei (passkey-uri publice)
  an: new Date().getFullYear(),
  ani: [],
  filtre: { text: '', stare: '', domeniu: '', rapid: '' },
  mesaj: null,
};

// ---------- utilitare ----------

function h(tag, attrs = {}, ...copii) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of copii.flat(Infinity)) {
    if (c === null || c === undefined || c === false || c === '') continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const fmtData = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('.') : '');
const fmtDataOra = (iso) => (iso ? new Date(iso).toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'short' }) : '');
const fmtMarime = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const rol = (id) => ROLURI.find((r) => r.id === id);
const ic = (nume) => h('i', { class: `ic ic-${nume}`, 'aria-hidden': 'true' });
const ICON_DOMENIU = {
  apa: 'droplet', electric: 'bolt', gaz: 'flame', lift: 'elevator', interfon: 'door', camere: 'video',
  curatenie: 'trash', verde: 'plant-2', boxe: 'box', acoperis: 'umbrella', fatade: 'wall', carte: 'book',
  restante: 'cash', liste: 'receipt', corespondenta: 'mail', altele: 'help-circle',
};
const domeniu = (id) => DOMENII.find((d) => d.id === id);
const aniDisponibili = () => {
  const ani = [];
  for (let a = new Date().getFullYear(); a >= AN_START; a--) ani.push(a);
  return ani;
};

function mesajEroare(e) {
  if (e instanceof GitHubError) {
    if (e.status === 401) return 'Cheia de acces a expirat sau a fost revocată. Președintele trebuie să refacă configurarea.';
    if (e.status === 403) return `GitHub a refuzat operația: ${e.message}`;
    if (e.status === 404) return 'Datele nu au fost găsite sau cheia de acces nu are drept asupra lor.';
    return `Eroare GitHub (${e.status}): ${e.message}`;
  }
  if (e instanceof TypeError) return 'Nu s-a putut contacta serverul. Verifică conexiunea la internet.';
  return e.message || String(e);
}

function citesteSesiune() {
  try { return JSON.parse(sessionStorage.getItem(CHEIE_SESIUNE) || 'null'); } catch { return null; }
}
function scrieSesiune(s) {
  try { sessionStorage.setItem(CHEIE_SESIUNE, JSON.stringify(s)); } catch { /* sesiunea ține cât e pagina deschisă */ }
}
function stergeSesiune() {
  try { sessionStorage.removeItem(CHEIE_SESIUNE); } catch { /* */ }
}

function descarcaBlob(blob, nume) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: nume });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function mergi(hash) {
  if (location.hash === hash) ruta(); else location.hash = hash;
}

// Eticheta unui cont fără nume de persoană: „Resp. instalații de apă (ap. 23)”.
function numeRol(id) {
  const r = rol(id);
  if (!r) return id || '—';
  const c = S.conturi?.utilizatori.find((x) => x.rol === id);
  return c?.apartament ? `${r.nume} (ap. ${c.apartament})` : r.nume;
}
function eticheta(u) {
  if (u === 'autor') return 'Autorul sesizării';
  const c = S.conturi?.gaseste(u);
  if (c?.rol === 'proprietar') return `Ap. ${c.apartament}`;
  return c ? numeRol(c.rol) : (ROLURI.find((r) => r.u === u)?.nume || u);
}

const conectat = () => Boolean(S.cont);
const eProprietar = () => S.cont?.rol === 'proprietar';
const eAdministratie = () => conectat() && !eProprietar();
const poateSesizare = () => eProprietar() || poateInregistra();
// Cererile: proprietarul le vede pe ale apartamentului; cele pentru cartea de imobil doar responsabilul
// cărții și președintele; declarațiile de număr de persoane administratorul, președintele și cenzorul.
const eRespCarte = () => ROLURI_CARTE.includes(S.cont?.rol);
const vedeCarte = () => ROLURI_CARTE_CITIRE.includes(S.cont?.rol); // administratorul o vede și o tipărește, nu o modifică
const poateRezolvaPersoane = () => ['presedinte', 'administrator'].includes(S.cont?.rol);
const vedePersoane = () => eProprietar() || ['presedinte', 'administrator', 'cenzor'].includes(S.cont?.rol);
const poateInregistraCerere = () => eRespCarte() || S.cont?.rol === 'administrator';
function vedeCerere(x) {
  if (eProprietar()) return x.apartament === S.cont.apartament;
  return x.categorie === 'cerere_carte' ? eRespCarte() : ['presedinte', 'administrator', 'cenzor'].includes(S.cont?.rol);
}
const vizibila = (x) => (CATEGORII_CERERE.includes(x.categorie) ? vedeCerere(x)
  : !eProprietar() || (CATEGORII_SESIZARE.includes(x.categorie) && x.apartament === S.cont.apartament));
// Cererile de care trebuie să se ocupe contul conectat.
const deRezolvat = (x) => CATEGORII_CERERE.includes(x.categorie) && !STARI_FINALE.includes(x.stare) && vedeCerere(x)
  && (ePresedinte() || x.responsabil === S.cont?.rol);
const ePresedinte = () => S.cont?.rol === 'presedinte';
const poateInregistra = () => ['presedinte', 'r10'].includes(S.cont?.rol);
const poateLucra = (x) => ePresedinte() || x.responsabil === S.cont?.rol;
const poateNota = () => eAdministratie() && S.cont.rol !== 'cenzor';

const stareText = (x) => (CATEGORII_CERERE.includes(x.categorie) ? STARI_CERERE[x.stare] : STARI[x.stare]) || '';

function insignaStare(x) {
  return h('span', { class: `eticheta stare-${x.stare}` }, stareText(x));
}

function insignaTermen(x) {
  const t = termenInfo(x);
  if (!t) return null;
  if (t.nivel === 'depasit') return h('span', { class: 'eticheta termen-depasit' }, `Termen depășit cu ${-t.zile} ${-t.zile === 1 ? 'zi' : 'zile'}`);
  if (t.nivel === 'aproape') return h('span', { class: 'eticheta termen-aproape' }, t.zile === 0 ? 'Termen: azi' : `Mai ${t.zile === 1 ? 'este 1 zi' : `sunt ${t.zile} zile`}`);
  return null;
}

function alertaTermen(x) {
  const t = termenInfo(x);
  if (!t || t.nivel === 'ok') return null;
  const temei = x.categorie === 'contestatie' ? 'art. 28 alin. (3) din Legea nr. 196/2018' : 'art. 57 alin. (1) lit. e) din Legea nr. 196/2018';
  return h('p', { class: t.nivel === 'depasit' ? 'eroare' : 'avertizare', role: 'alert' },
    t.nivel === 'depasit'
      ? `Termenul legal de răspuns (${TERMEN_RASPUNS_ZILE} zile, ${temei}) a expirat pe ${fmtData(x.termen)}.`
      : `Termenul legal de răspuns expiră pe ${fmtData(x.termen)} (${temei}).`);
}

// ---------- cadru ----------

function cadru(activ, ...continut) {
  const link = (hash, icon, text, id) => h('a', { href: hash, class: activ === id ? 'activ' : null }, ic(icon), h('span', {}, text));
  const nav = eProprietar()
    ? [
      link('#/admin', 'home', 'Sesizările mele', 'admin'),
      link('#/admin/sesizare-noua', 'plus', 'Sesizare nouă', 'sesizare-noua'),
      link('#/admin/carte-imobil', 'book', 'Carte imobil', 'carte'),
      link('#/admin/persoane', 'users', 'Nr. persoane', 'persoane'),
      link('#/', 'list', 'Sesizări bloc', 'public'),
      link('#/avizier', 'gavel', 'Avizier', 'avizier'),
    ]
    : conectat()
    ? [
      link('#/admin', 'home', 'Sesizări', 'admin'),
      link('#/admin/registru', 'notebook', 'Registru', 'registru'),
      vedeCarte() && link('#/admin/carte-imobil', 'book', 'Carte imobil', 'carte'),
      vedePersoane() && link('#/admin/persoane', 'users', 'Nr. persoane', 'persoane'),
      participaLaSedinte() && link('#/admin/sedinte', 'calendar', 'Ședințe', 'sedinte'),
      ePresedinte() && link('#/admin/utilizatori', 'users', 'Utilizatori', 'utilizatori'),
      link('#/avizier', 'gavel', 'Avizier', 'avizier'),
    ]
    : [
      link('#/', 'home', 'Sesizări', 'public'),
      link('#/avizier', 'gavel', 'Avizier', 'avizier'),
      link('#/cum', 'pencil', 'Depune', 'cum'),
      link('#/admin', 'user', 'Conectare', 'login'),
    ];
  return [
    h('header', { class: 'antet' },
      h('a', { href: conectat() ? '#/admin' : '#/', class: 'titlu' },
        h('strong', {}, ASOCIATIA.nume),
        h('span', {}, eAdministratie() ? 'Registru electronic — administrație' : 'Registru electronic de sesizări')),
      h('nav', { id: 'meniu' }, nav),
      conectat() && h('div', { class: 'utilizator' },
        h('span', { class: 'nume' }, eticheta(S.cont.u)),
        h('a', { href: '#/admin/profil', title: 'Profil și passkey', 'aria-label': 'Profil și passkey' }, ic('user')),
        h('button', { onclick: iesire, title: 'Ieșire', 'aria-label': 'Ieșire' }, ic('logout'))),
      h('div', { class: 'titlu-pagina' })),
    h('main', {},
      S.mesaj && h('p', { class: 'succes', role: 'status' }, S.mesaj),
      continut),
    h('footer', { class: 'subsol' }, `${ASOCIATIA.nume} · ${ASOCIATIA.adresa} · ${ASOCIATIA.email}`),
  ];
}

function afiseaza(activ, ...continut) {
  $app.replaceChildren(...cadru(activ, ...continut));
  // Titlul paginii stă în antetul verde (nu și cel din cardurile de conectare / parolă).
  const titlu = $app.querySelector('main > h1, main > .bara > h1');
  if (titlu) $app.querySelector('.titlu-pagina').append(titlu);
  S.mesaj = null;
  window.scrollTo(0, 0);
}

function seIncarca(activ) {
  const mesaj = S.mesaj;
  afiseaza(activ, h('p', { class: 'incarcare' }, 'Se încarcă…'));
  S.mesaj = mesaj;
}

function eroarePagina(activ, e) {
  afiseaza(activ, h('p', { class: 'eroare', role: 'alert' }, mesajEroare(e)), h('button', { onclick: () => ruta() }, 'Reîncearcă'));
}

function iesire() {
  stergeSesiune();
  Object.assign(S, { cont: null, token: null, reg: null, sed: null, carte: null });
  S.filtre = { text: '', stare: '', domeniu: '', rapid: '' };
  mergi('#/');
}

// ---------- partea publică ----------

// Direct din repo prin API: imediat la zi (GitHub Pages se reconstruiește în 1–2 minute după
// fiecare modificare). Vizitatorii neconectați au o limită de 60 de cereri/oră; peste ea
// (sau la orice eroare) se citește copia de pe Pages.
async function citestePublic(an) {
  try {
    const date = await new GitHubRepo({ apiBase: API, token: S.token, repo: REPO_PUBLIC }).readJson(`sesizari/${an}.json`);
    return date || { an, sesizari: [] };
  } catch { /* cădem pe Pages */ }
  const res = await fetch(`${urlPublic()}sesizari/${an}.json?t=${Date.now()}`, { cache: 'no-store' });
  if (res.status === 404) return { an, sesizari: [] };
  if (!res.ok) throw new Error(`Nu s-au putut încărca sesizările (${res.status}).`);
  return res.json();
}

async function incarcaConturiPublic() {
  if (S.conturi) return;
  try {
    const res = await fetch(`${urlPublic()}conturi.json?t=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) S.conturi = new Conturi(API, await res.json());
  } catch { /* etichetele rămân fără apartament */ }
}

function selectAn(onchange) {
  return h('select', { class: 'an', 'aria-label': 'Anul', onchange: (ev) => { S.an = Number(ev.target.value); onchange(); } },
    (conectat() ? S.ani : aniDisponibili()).map((a) => h('option', { value: a, selected: a === S.an }, a)));
}

function filtreazaSesizari(lista) {
  const f = S.filtre;
  const t = f.text.toLowerCase();
  return lista.filter((x) => {
    if (f.stare && x.stare !== f.stare) return false;
    if (f.domeniu && x.domeniu !== f.domeniu) return false;
    if (f.rapid === 'depasit' && termenInfo(x)?.nivel !== 'depasit') return false;
    if (f.rapid === 'aproape' && termenInfo(x)?.nivel !== 'aproape') return false;
    if (f.rapid === 'desemnat' && x.stare !== 'raspuns_propus') return false;
    if (f.rapid === 'alemele' && (x.responsabil !== S.cont?.rol || STARI_FINALE.includes(x.stare))) return false;
    if (f.rapid === 'lunara' && (!x.listaLunara || STARI_FINALE.includes(x.stare))) return false;
    if (t) {
      const tot = [x.nr, x.problema, x.solutie, x.nume, x.apartament && `ap ${x.apartament}`, domeniu(x.domeniu)?.nume, x.raspuns?.text].join(' ').toLowerCase();
      if (!tot.includes(t)) return false;
    }
    return true;
  }).sort((a, b) => b.nr - a.nr);
}

function campFiltru(cheie, el, deseneaza) {
  el.value = S.filtre[cheie];
  el.addEventListener('input', () => { S.filtre[cheie] = el.value; deseneaza(); });
  return el;
}

function bareFiltre(deseneaza) {
  const opt = (obj, toate) => [h('option', { value: '' }, toate), ...Object.entries(obj).map(([v, t]) => h('option', { value: v }, t))];
  return h('div', { class: 'filtre' },
    campFiltru('text', h('input', { type: 'search', placeholder: 'Caută în sesizări…', 'aria-label': 'Caută' }), deseneaza),
    campFiltru('stare', h('select', { 'aria-label': 'Stare' }, opt(STARI, 'Toate stările')), deseneaza),
    campFiltru('domeniu', h('select', { 'aria-label': 'Domeniu' }, opt(Object.fromEntries(DOMENII.map((d) => [d.id, d.nume])), 'Toate domeniile')), deseneaza));
}

// Listă de sesizări ca rânduri-card (aceeași structură pe telefon și pe desktop).
function listaSesizari(lista, linkFn, { admin = false } = {}) {
  if (!lista.length) return h('p', { class: 'gol' }, 'Nicio sesizare nu corespunde.');
  return h('ul', { class: 'lista-sesizari' }, lista.map((x) => h('li', {},
    h('a', { href: linkFn(x), class: 'rand-sesizare' },
      h('span', { class: `placa ${termenInfo(x)?.nivel === 'depasit' ? 'depasit' : termenInfo(x)?.nivel === 'aproape' ? 'aproape' : x.stare}` },
        ic(x.categorie === 'cerere_carte' ? 'book' : x.categorie === 'cerere_persoane' ? 'users' : (ICON_DOMENIU[x.domeniu] || 'help-circle'))),
      h('div', { class: 'rand-cap' },
        h('span', { class: 'nr' }, `Nr. ${x.nr}`),
        h('span', { class: 'slab' }, fmtData(x.data)),
        x.categorie !== 'sesizare' && h('span', { class: 'eticheta' }, CATEGORII[x.categorie]),
        admin && h('span', { class: 'slab' }, `Ap. ${x.apartament}`),
        h('span', { class: 'dreapta' }, insignaTermen(x), insignaStare(x))),
      h('div', { class: 'rand-problema' }, x.problema || x.continut),
      h('div', { class: 'rand-meta slab' },
        domeniu(x.domeniu) ? [domeniu(x.domeniu).nume, ' · '] : '', numeRol(x.responsabil),
        x.listaLunara && !STARI_FINALE.includes(x.stare) ? ' · pe lista ședinței lunare' : '',
        x.raspuns ? ` · răspuns nr. ${x.raspuns.nr}/${fmtData(x.raspuns.data)}` : (x.termen && !STARI_FINALE.includes(x.stare) ? ` · termen ${fmtData(x.termen)}` : ''))))));
}

async function paginaPublica() {
  S.filtre.rapid = ''; // filtrele rapide (contoarele) există doar în administrație
  seIncarca('public');
  let date;
  try {
    [date] = await Promise.all([citestePublic(S.an), incarcaConturiPublic()]);
  } catch (e) { return eroarePagina('public', e); }
  const zona = h('div');
  const contor = h('p', { class: 'slab mic' });
  const deseneaza = () => {
    const lista = filtreazaSesizari(date.sesizari);
    contor.textContent = `${lista.length} din ${date.sesizari.length} sesizări${date.actualizat ? ` · actualizat ${fmtDataOra(date.actualizat)}` : ''}`;
    zona.replaceChildren(listaSesizari(lista, (x) => `#/p/${S.an}/${x.nr}`));
  };
  const deschise = date.sesizari.filter((x) => !STARI_FINALE.includes(x.stare)).length;
  afiseaza('public',
    h('h1', {}, 'Sesizările asociației ', selectAn(paginaPublica)),
    h('div', { class: 'contoare' },
      h('div', { class: 'contor' }, h('strong', {}, date.sesizari.length), h('span', {}, 'total')),
      h('div', { class: 'contor galben' }, h('strong', {}, deschise), h('span', {}, 'în lucru')),
      h('div', { class: 'contor verde' }, h('strong', {}, date.sesizari.length - deschise), h('span', {}, 'cu răspuns'))),
    h('a', { href: eProprietar() ? '#/admin/sesizare-noua' : '#/cum', class: 'buton principal cta-mare' }, ic('plus'), 'Depune o sesizare'),
    bareFiltre(deseneaza),
    contor,
    zona);
  deseneaza();
}

// Formularul public: fără conturi pentru apartamente, compune sesizarea în formatul
// din regulament și o trimite pe e-mail asociației (sau o copiază / tipărește).
const TITLURI_SESIZARE = { sesizare: 'SESIZARE', contestatie: 'CONTESTAȚIE LA LISTA DE PLATĂ', propunere: 'PROPUNERE DE PROIECT' };

function textSesizare(c) {
  return [
    `${TITLURI_SESIZARE[c.categorie] || 'SESIZARE'} — depusă prin platforma Registru electronic`,
    '',
    `Nume și prenume: ${c.nume}`,
    `Apartamentul: ${c.apartament}`,
    `Data: ${new Date().toLocaleDateString('ro-RO')}`,
    `Domeniul: ${domeniu(c.domeniu)?.nume || ''}`,
    '',
    'Problema:',
    c.problema,
    '',
    'Soluția pe care o propun:',
    c.solutie || '—',
    '',
    `Costul estimat: ${c.cost || '—'}`,
    `Mă ocup eu de soluție: ${OCUPARE[c.maOcup] || 'Nu'}`,
  ].join('\n');
}

function paginaCum() {
  const eroare = h('p', { class: 'eroare', role: 'alert', hidden: true });
  const previzualizare = h('pre', { class: 'cutie text-lung doar-tipar previzualizare' });
  const radio = (name, obj, implicit) => h('div', { class: 'optiuni' }, Object.entries(obj).map(([v, t]) => h('label', { class: 'bifa' },
    h('input', { type: 'radio', name, value: v, checked: v === implicit, required: true }), t)));
  const date = () => {
    eroare.hidden = true;
    if (!form.reportValidity()) return null;
    const c = Object.fromEntries(new FormData(form).entries());
    previzualizare.textContent = textSesizare(c);
    return c;
  };
  const form = h('form', { class: 'card formular nu-tipari', onsubmit: (ev) => {
    ev.preventDefault();
    const c = date();
    if (!c) return;
    const subiect = `${CATEGORII[c.categorie]} — Ap. ${c.apartament} — ${domeniu(c.domeniu)?.nume || ''}`;
    location.href = `mailto:${ASOCIATIA.email}?subject=${encodeURIComponent(subiect)}&body=${encodeURIComponent(textSesizare(c))}`;
  } },
  h('h2', {}, 'Fără cont: trimite pe e-mail'),
  h('p', { class: 'slab' }, 'Formularul pregătește sesizarea în formatul cerut de regulament și o trimite pe e-mail asociației, din aplicația ta de e-mail. Primește număr de înregistrare când o înregistrează responsabilul cu corespondența.'),
  h('div', { class: 'grila' },
    h('label', {}, 'Apartamentul *', h('select', { name: 'apartament', required: true },
      h('option', { value: '' }, 'Alege…'), Array.from({ length: APARTAMENTE }, (_, i) => h('option', { value: i + 1 }, `Ap. ${i + 1}`)))),
    h('label', {}, 'Nume și prenume *', h('input', { name: 'nume', required: true, autocomplete: 'name' })),
    h('label', { class: 'lat' }, 'Domeniul *', h('select', { name: 'domeniu', required: true },
      h('option', { value: '' }, 'Alege domeniul…'), DOMENII.map((d) => h('option', { value: d.id }, d.nume))))),
  h('fieldset', {}, h('legend', {}, 'Tipul'), radio('categorie', { sesizare: 'Sesizare', contestatie: 'Contestație la lista de plată', propunere: 'Propunere de proiect' }, 'sesizare')),
  h('div', { class: 'grila' },
    h('label', { class: 'lat' }, 'Problema *', h('textarea', { name: 'problema', required: true, rows: 4, maxlength: 1500 })),
    h('label', { class: 'lat' }, 'Soluția pe care o propun', h('textarea', { name: 'solutie', rows: 3, maxlength: 1000 })),
    h('label', {}, 'Costul estimat (dacă îl cunosc)', h('input', { name: 'cost' }))),
  h('fieldset', {}, h('legend', {}, 'Mă ocup eu de soluție?'), radio('maOcup', OCUPARE, 'nu')),
  eroare,
  h('div', { class: 'actiuni' },
    h('button', { type: 'submit', class: 'principal' }, 'Trimite pe e-mail'),
    h('button', { type: 'button', onclick: async (ev) => {
      const btn = ev.currentTarget;
      const c = date();
      if (!c) return;
      try {
        await navigator.clipboard.writeText(textSesizare(c));
        btn.textContent = 'Copiat ✓ — lipește în e-bloc, la „Contact”';
      } catch {
        eroare.textContent = 'Copierea nu a mers în acest browser. Folosește „Trimite pe e-mail”.';
        eroare.hidden = false;
      }
    } }, 'Copiază textul (pentru e-bloc)'),
    h('button', { type: 'button', onclick: () => { if (date()) window.print(); } }, 'Tipărește (pentru hârtie)')),
  h('p', { class: 'slab mic' }, 'Fotografiile sau documentele le atașezi în e-mailul care se deschide.'));

  afiseaza('cum',
    h('h1', { class: 'nu-tipari' }, 'Cum depun o sesizare'),
    h('div', { class: 'card nu-tipari' },
      h('p', {}, 'Sesizările, propunerile și contestațiile se depun numai în scris (Regulamentul intern, art. 20), pe unul dintre canalele oficiale:'),
      h('ul', {},
        h('li', {}, h('strong', {}, 'prin această platformă'), ' — cu contul apartamentului (se înregistrează direct) sau prin formularul de mai jos, trimis pe e-mail;'),
        h('li', {}, 'e-mail: ', h('a', { href: `mailto:${ASOCIATIA.email}` }, ASOCIATIA.email), ';'),
        h('li', {}, 'e-bloc, secțiunea „Contact”;'),
        h('li', {}, 'pe hârtie, în cutia poștală a asociației sau predată responsabilului cu corespondența.')),
      h('p', { class: 'slab' }, 'Sesizările verbale, telefonice sau pe WhatsApp nu se înregistrează și nu primesc răspuns.'),
      h('p', {}, `Fiecare sesizare primește un număr de înregistrare și apare pe pagina „Sesizări”, fără numele tău și fără numărul apartamentului. Răspunsul scris se dă în cel mult ${TERMEN_RASPUNS_ZILE} zile (art. 57 alin. (1) lit. e) din Legea nr. 196/2018).`),
      h('p', { class: 'slab' }, 'O sesizare fără propunere de soluție primește răspuns în termen, dar se discută la ședința lunară a comitetului (art. 23). Contestațiile la lista de plată se depun în 10 zile de la afișarea listei (art. 28 alin. (3)).')),
    h('div', { class: 'card nu-tipari evidentiat' },
      h('h2', {}, 'Depune direct pe platformă'),
      eProprietar()
        ? [h('p', {}, `Ești conectat cu contul apartamentului ${S.cont.apartament}. Sesizarea se salvează direct în registru și primește imediat număr de înregistrare.`),
          h('a', { href: '#/admin/sesizare-noua', class: 'buton principal' }, '+ Sesizare nouă')]
        : [h('p', {}, 'Conectează-te cu contul apartamentului. Sesizarea se salvează direct în registru și primește imediat număr de înregistrare; apoi urmărești răspunsul în „Sesizările mele”.'),
          h('p', { class: 'slab' }, 'Nu ai cont? Solicită accesul pe WhatsApp la președinte — primești pe loc un card cu utilizatorul și parola.'),
          h('a', { href: '#/admin', class: 'buton principal' }, 'Conectare apartament')]),
    !eProprietar() && h('p', { class: 'slab nu-tipari' }, 'Până primești contul, poți completa formularul de mai jos, care se trimite pe e-mail asociației.'),
    !eProprietar() && form,
    h('div', { class: 'doar-tipar antet-tipar' }, h('strong', {}, ASOCIATIA.nume), h('span', {}, ASOCIATIA.adresa)),
    previzualizare,
    h('p', { class: 'doar-tipar' }, 'Semnătura: ______________________'));
}

async function verificareSemnatura(x, an) {
  const r = x.raspuns;
  if (r?.webauthn) return blocSemnatura(r.webauthn, continutRaspuns(x, an, r.text, r.semnatDe, r.semnatLa));
  const el = h('p', { class: 'mic slab' }, 'Se verifică semnătura…');
  (async () => {
    if (!x.raspuns?.amprenta) { el.textContent = ''; return; }
    const ok = (await amprenta(continutSemnat(x, an, x.raspuns))) === x.raspuns.amprenta;
    el.className = `mic ${ok ? 'verificat' : 'eroare'}`;
    el.textContent = ok
      ? `✓ Semnătură electronică verificată — textul nu a fost modificat după semnare. Cod: ${codVerificare(x.raspuns.amprenta)}`
      : '✗ Textul nu corespunde semnăturii.';
  })();
  return el;
}

async function blocRaspuns(x, an) {
  const r = x.raspuns;
  return h('div', { class: 'card raspuns' },
    h('h2', {}, `Răspuns nr. ${r.nr} din ${fmtData(r.data)}`),
    h('p', { class: 'text-lung' }, r.text),
    !r.webauthn && h('p', { class: 'slab mic' }, `Semnat electronic de ${eticheta(r.semnatDe || 'presedinte')}${r.semnatLa ? `, ${fmtDataOra(r.semnatLa)}` : ''}.`),
    await verificareSemnatura(x, an),
    h('button', { class: 'nu-tipari', onclick: () => window.print() }, 'Tipărește / salvează PDF'));
}

function blocIstoric(x) {
  const lista = (x.istoric || []).filter((i) => eAdministratie() || !i.intern);
  if (!lista.length) return null;
  return h('div', { class: 'card nu-tipari' },
    h('h2', {}, 'Istoric'),
    h('ol', { class: 'istoric' }, lista.map((i) => h('li', { class: i.intern ? 'intern' : null },
      h('span', { class: 'slab mic' }, `${fmtDataOra(i.la)} · ${eticheta(i.u)}${i.intern ? ' · intern' : ''}`),
      h('span', {}, i.actiune)))));
}

function campuriSesizare(x, { admin }) {
  const rand = (et, val) => (val ? [h('dt', {}, et), h('dd', {}, val)] : null);
  return h('dl', { class: 'detalii' },
    admin && rand('Apartament', `Ap. ${x.apartament}`),
    admin && rand('Nume și prenume', x.nume),
    rand('Tip', CATEGORII[x.categorie]),
    rand('Domeniu', domeniu(x.domeniu)?.nume),
    rand('Problema', x.problema),
    rand('Soluția propusă', x.solutie || '— fără propunere (se discută la ședința lunară a comitetului, art. 23)'),
    rand('Cost estimat', x.cost),
    rand('Se ocupă autorul', OCUPARE[x.maOcup]),
    rand('Primită prin', CANALE[x.canal]),
    rand('Responsabil', numeRol(x.responsabil)),
    rand('Termen de răspuns', x.termen ? fmtData(x.termen) : (x.categorie === 'propunere' ? 'se discută în prima ședință a comitetului (art. 24)' : '')));
}

async function paginaPublicaDetaliu(an, nr) {
  seIncarca('public');
  let x;
  try {
    const [date] = await Promise.all([citestePublic(an), incarcaConturiPublic()]);
    x = date.sesizari.find((i) => i.nr === nr);
  } catch (e) { return eroarePagina('public', e); }
  if (!x) return afiseaza('public', h('p', { class: 'eroare' }, `Sesizarea nr. ${nr}/${an} nu a fost găsită.`), h('a', { href: '#/' }, '← Înapoi'));
  afiseaza('public',
    h('a', { href: '#/', class: 'inapoi nu-tipari' }, ic('arrow-left'), 'Toate sesizările'),
    h('div', { class: 'doar-tipar antet-tipar' }, h('strong', {}, ASOCIATIA.nume), h('span', {}, ASOCIATIA.adresa)),
    h('h1', {}, `${CATEGORII[x.categorie]} nr. ${x.nr} din ${fmtData(x.data)}`),
    h('p', { class: 'insigne' }, insignaStare(x), insignaTermen(x), x.listaLunara && !STARI_FINALE.includes(x.stare) && h('span', { class: 'eticheta' }, 'Pe lista ședinței lunare')),
    alertaTermen(x),
    h('div', { class: 'card' }, campuriSesizare(x, { admin: false })),
    x.raspuns ? await blocRaspuns(x, an) : h('div', { class: 'card' }, h('p', { class: 'slab' }, x.termen ? `Răspunsul va apărea aici. Termen: ${fmtData(x.termen)}.` : 'Răspunsul va apărea aici.')),
    blocIstoric(x));
}

// ---------- autentificare ----------

async function ecranLogin(eroare = '') {
  let conturi;
  try {
    conturi = await Conturi.incarca(API);
  } catch (e) { return afiseaza('login', h('p', { class: 'eroare' }, mesajEroare(e))); }
  if (!conturi) return ecranConfigurare();

  const form = h('form', { class: 'card conectare', onsubmit: async (ev) => {
    ev.preventDefault();
    const btn = form.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Se verifică…';
    const rez = await conturi.autentifica(form.u.value, form.p.value);
    if (!rez) return ecranLogin('Utilizator sau parolă greșită.');
    S.conturi = conturi;
    scrieSesiune({ u: rez.cont.u, token: rez.token });
    try {
      await intra(rez.cont, rez.token);
    } catch (e) {
      stergeSesiune();
      ecranLogin(mesajEroare(e));
    }
  } },
  h('h1', {}, 'Conectare'),
  h('p', { class: 'slab' }, 'Cu contul apartamentului (ex. ap12) sau cu contul de administrație, de pe cardul primit de la asociație.'),
  eroare && h('p', { class: 'eroare', role: 'alert' }, eroare),
  h('label', {}, 'Utilizator', h('input', { name: 'u', required: true, autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', placeholder: 'ex. ap12' })),
  h('label', {}, 'Parola', h('input', { name: 'p', type: 'password', required: true, autocomplete: 'current-password' })),
  h('button', { type: 'submit', class: 'principal' }, 'Conectare'),
  h('p', { class: 'slab mic' }, 'Nu ai cont sau ai uitat parola? Solicită accesul pe WhatsApp la președinte — primești pe loc un card cu parola.'));
  afiseaza('login', h('div', { class: 'centrat' }, form));
  form.u.focus();
}

async function intra(cont, token) {
  S.cont = cont;
  S.token = token;
  const gh = new GitHubRepo({ apiBase: API, token, repo: REPO_DATE });
  const ghPublic = new GitHubRepo({ apiBase: API, token, repo: REPO_PUBLIC });
  S.reg = new Registru(gh, ghPublic, cont);
  S.sed = new Sedinte(gh, ghPublic, cont);
  S.carte = new CarteImobil(S.reg);
  await Promise.all([ghPublic.info(), S.reg.init()]);
  S.ani = await S.reg.ani();
  S.reg.sincronizeazaPublic(new Date().getFullYear());
  if (!S.ani.includes(S.an)) S.an = S.ani[0];
  if (cont.temporara) return ecranParola(true);
  if (location.hash.startsWith('#/admin') && !location.hash.startsWith('#/admin/parola')) ruta(); else mergi('#/admin');
}

function ecranParola(obligatoriu = false) {
  const eroare = h('p', { class: 'eroare', role: 'alert', hidden: true });
  const form = h('form', { class: 'card conectare', onsubmit: async (ev) => {
    ev.preventDefault();
    eroare.hidden = true;
    const arata = (m) => { eroare.textContent = m; eroare.hidden = false; };
    if (!obligatoriu && !(await S.conturi.autentifica(S.cont.u, form.veche.value))) return arata('Parola actuală nu este corectă.');
    const problema = verificaParola(S.cont.u, form.noua.value);
    if (problema) return arata(problema);
    if (form.noua.value !== form.confirmare.value) return arata('Cele două parole nu coincid.');
    const btn = form.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Se salvează…';
    try {
      S.cont = await S.conturi.schimbaParola(S.token, S.cont.u, form.noua.value);
      S.mesaj = 'Parola a fost schimbată.';
      mergi('#/admin');
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Schimbă parola';
      arata(mesajEroare(e));
    }
  } },
  h('h1', {}, obligatoriu ? 'Alege o parolă nouă' : 'Schimbă parola'),
  obligatoriu && h('p', {}, `Te-ai conectat ca ${eticheta(S.cont.u)} cu o parolă temporară. Alege acum parola ta.`),
  eroare,
  !obligatoriu && h('label', {}, 'Parola actuală', h('input', { name: 'veche', type: 'password', required: true, autocomplete: 'current-password' })),
  h('label', {}, `Parola nouă (minim ${MIN_PAROLA} caractere, litere și cifre)`, h('input', { name: 'noua', type: 'password', required: true, minlength: MIN_PAROLA, autocomplete: 'new-password' })),
  h('label', {}, 'Repetă parola nouă', h('input', { name: 'confirmare', type: 'password', required: true, autocomplete: 'new-password' })),
  h('button', { type: 'submit', class: 'principal' }, 'Schimbă parola'),
  obligatoriu && h('button', { type: 'button', class: 'link', onclick: iesire }, 'Renunță și ieși'));
  afiseaza('parola', h('div', { class: 'centrat' }, form));
}

// ---------- bilete cu parole (configurare și resetare) ----------

function bilete(lista) {
  const site = `${location.origin}${location.pathname}#/admin`;
  return h('div', { class: 'bilete' }, lista.map((b) => h('div', { class: 'bilet' },
    h('strong', {}, ASOCIATIA.nume),
    h('span', {}, `Card de acces — ${b.rol === 'proprietar' ? `Apartamentul ${b.apartament}` : numeRol(b.rol)}`),
    h('span', {}, 'Site: ', h('b', {}, site)),
    h('span', {}, 'Utilizator: ', h('b', { class: 'cod' }, b.u)),
    h('span', {}, 'Parolă temporară: ', h('b', { class: 'cod' }, b.parola)),
    h('span', { class: 'mic' }, 'La prima conectare vei alege o parolă nouă.'))));
}

function tiparesteBilete() {
  document.body.classList.add('tipar-bilete');
  window.print();
  setTimeout(() => document.body.classList.remove('tipar-bilete'), 500);
}

function ecranConfigurare() {
  const eroare = h('p', { class: 'eroare', role: 'alert', hidden: true });
  const progres = h('p', { class: 'slab' });
  const form = h('form', { class: 'card', onsubmit: async (ev) => {
    ev.preventDefault();
    eroare.hidden = true;
    const btn = form.querySelector('button');
    btn.disabled = true;
    try {
      const parole = await Conturi.genereaza(API, form.token.value.trim(), (i, n) => { progres.textContent = `Se generează conturile… ${i}/${n}`; });
      afiseaza('login',
        h('h1', {}, 'Conturile au fost create'),
        h('p', { class: 'avertizare' }, 'Lista de mai jos se afișează o singură dată. Tipărește-o acum și dă fiecărui titular biletul lui. Dacă se pierde, poți reseta parolele din pagina Utilizatori.'),
        h('div', { class: 'actiuni nu-tipari' },
          h('button', { class: 'principal', onclick: tiparesteBilete }, 'Tipărește biletele'),
          h('a', { href: '#/admin', class: 'buton', onclick: () => setTimeout(() => ruta(), 0) }, 'Mergi la conectare')),
        bilete(parole));
    } catch (e) {
      btn.disabled = false;
      progres.textContent = '';
      eroare.textContent = mesajEroare(e);
      eroare.hidden = false;
    }
  } },
  h('h1', {}, 'Configurare inițială'),
  h('p', {}, 'Aplicația nu are încă conturi. Configurarea se face o singură dată, de către președinte.'),
  h('ol', {},
    h('li', {}, 'Creează cheia de acces GitHub după ', h('a', { href: 'https://github.com/adysaba84/RegistruElectronicDocumenteAsociatie#cheia-de-acces', target: '_blank', rel: 'noopener' }, 'instrucțiuni'), '.'),
    h('li', {}, 'Lipește-o mai jos. Aplicația creează conturile administrației, fiecare cu o parolă temporară diferită.'),
    h('li', {}, 'Tipărește biletele cu parole și împarte-le.')),
  eroare,
  h('label', {}, 'Cheia de acces GitHub', h('input', { name: 'token', type: 'password', required: true, autocomplete: 'off', placeholder: 'github_pat_…' })),
  progres,
  h('button', { type: 'submit', class: 'principal' }, 'Creează conturile'));
  afiseaza('login', form);
}

// ---------- administrație: sesizări ----------

async function paginaAdmin() {
  seIncarca('admin');
  let reg;
  try { reg = await S.reg.citesteAn(S.an); } catch (e) { return eroarePagina('admin', e); }
  const toate = reg.inregistrari.filter((x) => CATEGORII_SESIZARE.includes(x.categorie) && vizibila(x));
  if (eProprietar()) return paginaMele(toate);
  const deCarte = reg.inregistrari.filter((x) => x.categorie === 'cerere_carte' && deRezolvat(x)).length;
  const dePersoane = reg.inregistrari.filter((x) => x.categorie === 'cerere_persoane' && deRezolvat(x)).length;
  const nr = (f) => toate.filter(f).length;
  const deschise = (x) => !STARI_FINALE.includes(x.stare);
  const n = {
    depasit: nr((x) => termenInfo(x)?.nivel === 'depasit'),
    aproape: nr((x) => termenInfo(x)?.nivel === 'aproape'),
    desemnat: nr((x) => x.stare === 'raspuns_propus'),
    alemele: nr((x) => x.responsabil === S.cont.rol && deschise(x)),
    lunara: nr((x) => x.listaLunara && deschise(x)),
  };
  const zona = h('div');
  const deseneaza = () => {
    zona.replaceChildren(listaSesizari(filtreazaSesizari(toate), (x) => `#/admin/s/${S.an}/${x.nr}`, { admin: true }));
    contoare.querySelectorAll('button').forEach((b) => b.classList.toggle('activ', b.dataset.k === S.filtre.rapid));
  };
  const contor = (k, et, cls) => h('button', { class: `contor ${cls || ''}`, 'data-k': k, onclick: () => { S.filtre.rapid = S.filtre.rapid === k ? '' : k; deseneaza(); } },
    h('strong', {}, k ? n[k] : toate.length), h('span', {}, et));
  const contoare = h('div', { class: 'contoare' },
    contor('', 'toate'),
    contor('depasit', 'termen depășit', n.depasit ? 'rosu' : ''),
    contor('aproape', 'aproape de termen', n.aproape ? 'galben' : ''),
    ePresedinte() ? contor('desemnat', 'de semnat', n.desemnat ? 'albastru' : '') : contor('alemele', 'ale mele'),
    contor('lunara', 'lista lunară'));
  afiseaza('admin',
    h('div', { class: 'bara' },
      h('h1', {}, 'Sesizări ', selectAn(paginaAdmin)),
      poateInregistra() && h('a', { href: '#/admin/sesizare-noua', class: 'buton principal' }, '+ Înregistrează sesizare')),
    deCarte > 0 && h('p', { class: 'avertizare' }, ic('book'), ' ',
      h('a', { href: '#/admin/carte-imobil' }, `${deCarte} ${deCarte === 1 ? 'cerere așteaptă' : 'cereri așteaptă'} înscrierea sau radierea în cartea de imobil`), '.'),
    dePersoane > 0 && h('p', { class: 'avertizare' }, ic('users'), ' ',
      h('a', { href: '#/admin/persoane' }, `${dePersoane} ${dePersoane === 1 ? 'declarație de număr de persoane așteaptă' : 'declarații de număr de persoane așteaptă'} să fie trecute în e-bloc`), '.'),
    n.depasit > 0 && h('p', { class: 'eroare', role: 'alert' },
      `${n.depasit} ${n.depasit === 1 ? 'sesizare a depășit' : 'sesizări au depășit'} termenul legal de răspuns de ${TERMEN_RASPUNS_ZILE} zile (art. 57 alin. (1) lit. e) din Legea nr. 196/2018).`),
    contoare,
    bareFiltre(deseneaza),
    zona);
  deseneaza();
}

function paginaMele(toate) {
  S.filtre.rapid = '';
  const zona = h('div');
  const deseneaza = () => zona.replaceChildren(toate.length
    ? listaSesizari(filtreazaSesizari(toate), (x) => `#/admin/s/${S.an}/${x.nr}`)
    : h('p', { class: 'gol' }, `Apartamentul nu are sesizări în ${S.an}.`));
  afiseaza('admin',
    h('div', { class: 'bara' },
      h('h1', {}, `Sesizările mele — Ap. ${S.cont.apartament} `, selectAn(paginaAdmin)),
      h('a', { href: '#/admin/sesizare-noua', class: 'buton principal' }, '+ Sesizare nouă')),
    h('p', { class: 'slab' }, `Primești răspuns scris în cel mult ${TERMEN_RASPUNS_ZILE} zile de la înregistrare. Pe pagina publică sesizarea apare fără numele tău și fără apartament.`),
    toate.length > 3 && bareFiltre(deseneaza),
    zona);
  deseneaza();
}

function formularSesizare() {
  const eroare = h('p', { class: 'eroare', role: 'alert', hidden: true });
  const fisiere = h('input', { type: 'file', name: 'fisiere', multiple: true, accept: '.pdf,.jpg,.jpeg,.png,.heic,.doc,.docx' });
  const repartizare = h('p', { class: 'slab mic' });
  const alegeDomeniu = h('select', { name: 'domeniu', required: true, onchange: () => {
    const d = domeniu(alegeDomeniu.value);
    repartizare.textContent = d ? `Se repartizează automat: ${numeRol(d.rol)}` : '';
  } }, h('option', { value: '' }, 'Alege domeniul…'), DOMENII.map((d) => h('option', { value: d.id }, d.nume)));
  const radio = (name, obj, implicit) => h('div', { class: 'optiuni' }, Object.entries(obj).map(([v, t]) => h('label', { class: 'bifa' },
    h('input', { type: 'radio', name, value: v, checked: v === implicit, required: true }), t)));

  const form = h('form', { class: 'card formular', onsubmit: async (ev) => {
    ev.preventDefault();
    eroare.hidden = true;
    const c = Object.fromEntries([...new FormData(form).entries()].filter(([k]) => k !== 'fisiere'));
    const noi = [...fisiere.files];
    const mare = noi.find((f) => f.size > MAX_FISIER);
    if (mare) { eroare.textContent = `„${mare.name}” depășește 25 MB.`; eroare.hidden = false; return; }
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = noi.length ? 'Se urcă fișierele…' : 'Se înregistrează…';
    try {
      const r = await S.reg.adaugaSesizare(c, noi);
      S.mesaj = `Sesizarea a fost înregistrată cu nr. ${r.x.nr} din ${fmtData(r.x.data)}${r.x.termen ? `. Termen de răspuns: ${fmtData(r.x.termen)}` : ''}.`
;
      mergi(`#/admin/s/${r.an}/${r.x.nr}`);
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Înregistrează sesizarea';
      eroare.textContent = mesajEroare(e);
      eroare.hidden = false;
    }
  } },
  h('p', { class: 'slab' }, eProprietar()
    ? `Numărul de înregistrare și data se dau automat la salvare. Primești răspuns scris în cel mult ${TERMEN_RASPUNS_ZILE} zile (Regulamentul intern, art. 21–22).`
    : 'Numărul de înregistrare și data se dau automat. Completează după formularul primit (Regulamentul intern, art. 21).'),
  h('div', { class: 'grila' },
    eProprietar()
      ? h('label', {}, 'Apartamentul', h('input', { value: `Ap. ${S.cont.apartament}`, disabled: true }))
      : h('label', {}, 'Apartamentul *', h('select', { name: 'apartament', required: true },
        h('option', { value: '' }, 'Alege…'), Array.from({ length: APARTAMENTE }, (_, i) => h('option', { value: i + 1 }, `Ap. ${i + 1}`)))),
    h('label', {}, 'Nume și prenume *', h('input', { name: 'nume', required: true, autocomplete: eProprietar() ? 'name' : 'off' })),
    !eProprietar() && h('label', {}, 'Primită prin *', h('select', { name: 'canal', required: true },
      Object.entries(CANALE).filter(([k]) => k !== 'aplicatie').map(([v, t]) => h('option', { value: v }, t)))),
    h('label', {}, 'Domeniul *', alegeDomeniu, repartizare)),
  h('fieldset', {}, h('legend', {}, 'Tipul'), radio('categorie', { sesizare: 'Sesizare', contestatie: 'Contestație la lista de plată', propunere: 'Propunere de proiect' }, 'sesizare')),
  h('div', { class: 'grila' },
    h('label', { class: 'lat' }, 'Problema *', h('textarea', { name: 'problema', required: true, rows: 4, maxlength: 4000 })),
    h('label', { class: 'lat' }, 'Soluția propusă', h('textarea', { name: 'solutie', rows: 3, maxlength: 4000 }),
      h('span', { class: 'slab mic' }, 'Fără soluție propusă, sesizarea primește răspuns în termen, dar se discută la ședința lunară (art. 23).')),
    h('label', {}, 'Costul estimat', h('input', { name: 'cost', placeholder: 'ex. 500 lei' }))),
  h('fieldset', {}, h('legend', {}, 'Se ocupă autorul de soluție?'), radio('maOcup', OCUPARE, 'nu')),
  h('label', {}, eProprietar() ? 'Fotografii / documente (opțional, max. 25 MB fiecare)' : 'Scanul sesizării / fotografii (max. 25 MB fiecare)', fisiere),
  eroare,
  h('div', { class: 'actiuni' },
    h('button', { type: 'submit', class: 'principal' }, eProprietar() ? 'Trimite sesizarea' : 'Înregistrează sesizarea'),
    h('a', { href: '#/admin', class: 'buton' }, 'Renunță')));
  afiseaza('sesizare-noua', h('h1', {}, eProprietar() ? 'Sesizare nouă' : 'Înregistrează o sesizare'), form);
}

async function paginaAdminDetaliu(an, nr) {
  seIncarca('admin');
  let reg;
  try { reg = await S.reg.citesteAn(an); } catch (e) { return eroarePagina('admin', e); }
  const x = reg.inregistrari.find((i) => i.nr === nr);
  if (!x || !vizibila(x)) return afiseaza('admin', h('p', { class: 'eroare' }, `Nr. ${nr}/${an} nu există sau nu ai acces la el.`), h('a', { href: '#/admin' }, '← Înapoi'));
  if (CATEGORII_CERERE.includes(x.categorie)) return detaliuCerere(an, x, reg);
  if (!CATEGORII_SESIZARE.includes(x.categorie)) return detaliuDocument(an, x);

  const actiune = (fn, mesaj) => async (ev) => {
    const btn = ev.currentTarget;
    btn.disabled = true;
    try {
      const r = await fn();
      S.mesaj = typeof mesaj === 'function' ? mesaj(r) : mesaj;
      paginaAdminDetaliu(an, nr);
    } catch (e) {
      btn.disabled = false;
      alert(mesajEroare(e));
    }
  };
  const finala = STARI_FINALE.includes(x.stare);
  const blocuri = [];

  // Răspuns
  if (x.raspuns) {
    blocuri.push(await blocRaspuns(x, an));
  } else if (eProprietar()) {
    blocuri.push(h('div', { class: 'card' }, h('p', { class: 'slab' }, x.termen ? `Răspunsul va apărea aici. Termen: ${fmtData(x.termen)}.` : 'Răspunsul va apărea aici.')));
  } else {
    const parti = [h('h2', {}, 'Răspuns')];
    if (x.raspunsDraft) {
      parti.push(h('p', { class: 'slab mic' }, `${x.stare === 'raspuns_propus' ? 'Trimis la semnat' : 'Ciornă'} — ${eticheta(x.raspunsDraft.de)}, ${fmtDataOra(x.raspunsDraft.la)}`));
    }
    if (ePresedinte() && x.stare === 'raspuns_propus') {
      parti.push(h('p', { class: 'text-lung cutie' }, x.raspunsDraft.text),
        h('div', { class: 'actiuni' },
          h('button', { class: 'principal', onclick: actiune(async () => {
            const semnatLa = new Date().toISOString();
            const text = x.raspunsDraft.text;
            const sem = await semneazaCu(continutRaspuns(x, an, text, S.cont.u, semnatLa));
            return S.reg.semneazaRaspuns(an, nr, { webauthn: sem, semnatLa, text });
          }, (r) => `Răspuns semnat cu passkey și înregistrat cu nr. ${r.raspuns.nr} din ${fmtData(r.raspuns.data)}.`) }, ic('fingerprint'), 'Semnează și înregistrează răspunsul'),
          h('button', { onclick: (ev) => {
            const motiv = prompt('Ce trebuie refăcut în răspuns?');
            if (motiv && motiv.trim()) actiune(() => S.reg.respingeRaspuns(an, nr, motiv.trim()), 'Răspuns returnat responsabilului.')(ev);
          } }, 'Returnează pentru refacere')));
    } else if (poateLucra(x) && !finala) {
      const text = h('textarea', { rows: 8, maxlength: 8000, 'aria-label': 'Textul răspunsului' }, x.raspunsDraft?.text || '');
      parti.push(text, h('div', { class: 'actiuni' },
        h('button', { onclick: actiune(() => S.reg.salveazaRaspuns(an, nr, text.value, false), 'Ciorna a fost salvată.') }, 'Salvează ciorna'),
        h('button', { class: 'principal', onclick: actiune(() => S.reg.salveazaRaspuns(an, nr, text.value, true), 'Răspunsul a fost trimis președintelui la semnat.') }, 'Trimite la semnat')));
    } else if (x.raspunsDraft) {
      parti.push(h('p', { class: 'text-lung cutie' }, x.raspunsDraft.text));
    } else {
      parti.push(h('p', { class: 'slab' }, `Răspunsul îl redactează ${numeRol(x.responsabil)}.`));
    }
    blocuri.push(h('div', { class: 'card nu-tipari' }, parti));
  }

  // Acțiuni
  const act = [];
  if (poateLucra(x) && x.stare === 'repartizata') {
    act.push(h('button', { onclick: actiune(() => S.reg.incepeLucrul(an, nr), 'Sesizarea a fost preluată în lucru.') }, 'Preiau în lucru'));
  }
  if (ePresedinte() && !finala) {
    const sel = h('select', { 'aria-label': 'Responsabil' }, ROLURI.filter((r) => r.id !== 'cenzor').map((r) => h('option', { value: r.id, selected: r.id === x.responsabil }, numeRol(r.id))));
    act.push(h('div', { class: 'rand-actiune' }, sel,
      h('button', { onclick: (ev) => sel.value !== x.responsabil && actiune(() => S.reg.repartizeaza(an, nr, sel.value, numeRol(sel.value)), 'Sesizarea a fost repartizată.')(ev) }, 'Repartizează')));
  }
  if (ePresedinte()) {
    if (x.stare === 'raspuns_trimis') act.push(h('button', { onclick: actiune(() => S.reg.inchide(an, nr, prompt('Notă de închidere (opțional, apare public):') || ''), 'Sesizarea a fost închisă.') }, 'Închide (rezolvată)'));
    if (x.stare === 'inchisa') act.push(h('button', { onclick: actiune(() => S.reg.redeschide(an, nr), 'Sesizarea a fost redeschisă.') }, 'Redeschide'));
    if (!finala) act.push(h('button', { onclick: actiune(() => S.reg.seteazaListaLunara(an, nr, !x.listaLunara), 'Actualizat.') }, x.listaLunara ? 'Scoate de pe lista lunară' : 'Pune pe lista ședinței lunare'));
  }
  if (poateNota()) {
    const nota = h('textarea', { rows: 2, placeholder: 'Notă internă (nu apare public)…', 'aria-label': 'Notă internă' });
    const fis = h('input', { type: 'file', multiple: true, 'aria-label': 'Fișiere' });
    act.push(h('div', { class: 'nota' }, nota, fis,
      h('button', { onclick: (ev) => (nota.value.trim() || fis.files.length) && actiune(() => S.reg.adaugaNota(an, nr, nota.value, [...fis.files]), 'Nota a fost adăugată.')(ev) }, 'Adaugă notă / fișiere')));
  }

  afiseaza('admin',
    h('a', { href: '#/admin', class: 'inapoi nu-tipari' }, ic('arrow-left'), eProprietar() ? 'Sesizările mele' : 'Sesizări'),
    h('div', { class: 'doar-tipar antet-tipar' }, h('strong', {}, ASOCIATIA.nume), h('span', {}, ASOCIATIA.adresa)),
    h('h1', {}, `${CATEGORII[x.categorie]} nr. ${x.nr} din ${fmtData(x.data)}`),
    h('p', { class: 'insigne' }, insignaStare(x), insignaTermen(x), x.listaLunara && !finala && h('span', { class: 'eticheta' }, 'Pe lista ședinței lunare'),
      h('a', { href: `#/p/${an}/${nr}`, class: 'mic nu-tipari' }, 'vezi pagina publică')),
    alertaTermen(x),
    h('div', { class: 'card' }, campuriSesizare(x, { admin: true })),
    blocFisiere(x),
    blocuri,
    act.length > 0 && h('div', { class: 'card nu-tipari' }, h('h2', {}, 'Acțiuni'), h('div', { class: 'actiuni-col' }, act)),
    blocIstoric(x),
    h('p', { class: 'mic slab nu-tipari' }, 'Amprenta înregistrării: ', h('code', {}, codVerificare(x.amprenta) || '—')));
}

function blocFisiere(x) {
  if (!(x.fisiere || []).length) return null;
  return h('div', { class: 'card nu-tipari' },
    h('h2', {}, 'Fișiere'),
    h('ul', { class: 'fisiere' }, x.fisiere.map((f) => h('li', {},
      h('span', {}, f.nume, ' ', h('span', { class: 'slab' }, `(${fmtMarime(f.marime)})`)),
      h('button', { onclick: async () => {
        try { descarcaBlob(await S.reg.descarca(f), f.nume); } catch (e) { alert(mesajEroare(e)); }
      } }, 'Descarcă')))));
}

function detaliuDocument(an, x) {
  const rand = (et, val) => (val ? [h('dt', {}, et), h('dd', {}, val)] : null);
  const conexat = x.conexat && /^\d+\/\d{4}$/.test(x.conexat)
    ? h('a', { href: `#/admin/s/${x.conexat.split('/')[1]}/${x.conexat.split('/')[0]}` }, `nr. ${x.conexat}`) : x.conexat;
  afiseaza('registru',
    h('a', { href: '#/admin/registru', class: 'inapoi' }, ic('arrow-left'), 'Registru'),
    h('h1', {}, `${CATEGORII[x.categorie]} nr. ${x.nr} din ${fmtData(x.data)}`),
    h('div', { class: 'card' }, h('dl', { class: 'detalii' },
      rand('Tip', TIPURI_DOC[x.tip]),
      rand('Emitent', x.emitent),
      rand('Destinatar', x.destinatar),
      rand('Nr. documentului emitentului', x.nrDocExtern),
      rand('Conținut', x.continut),
      rand('Conexat la', conexat),
      rand('Redactat de', x.redactatDe && eticheta(x.redactatDe)),
      rand('Semnătură', x.semnatura && codVerificare(x.semnatura)),
      rand('Înregistrat de', `${eticheta(x.creatDe)} — ${fmtDataOra(x.creatLa)}`),
      rand('Amprenta înregistrării', codVerificare(x.amprenta)))),
    blocFisiere(x));
}

// ---------- cereri: cartea de imobil și numărul de persoane ----------

const normNume = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
const selectFel = (valoare, attrs = {}) => h('select', attrs, Object.entries(FEL_ADRESA).map(([v, t]) => h('option', { value: v, selected: v === valoare }, t)));

// Cererea pentru cartea de imobil (tip „carte”, opțional cu numărul nou de persoane) sau doar
// declarația numărului de persoane (tip „persoane”). Proprietarul o semnează cu passkey;
// administrația înregistrează cererile primite pe hârtie.
async function formularCerere(tip) {
  const proprietar = eProprietar();
  const deCarte = tip === 'carte';
  let carte = { persoane: [] };
  if (deCarte) {
    seIncarca('carte');
    try { carte = await S.carte.citeste(); } catch (e) { return eroarePagina('carte', e); }
  }
  const eroare = h('p', { class: 'eroare', role: 'alert', hidden: true });
  const fisiere = !proprietar && h('input', { type: 'file', multiple: true, accept: '.pdf,.jpg,.jpeg,.png,.heic' });
  const alegeAp = !proprietar && h('select', { name: 'apartament', required: true, onchange: () => { if (operatiune === 'radiere') reface(); } },
    h('option', { value: '' }, 'Alege…'), Array.from({ length: APARTAMENTE }, (_, i) => h('option', { value: i + 1 }, `Ap. ${i + 1}`)));
  const apartament = () => (proprietar ? S.cont.apartament : Number(alegeAp.value));
  const activi = () => carte.persoane.filter((p) => p.apartament === apartament() && !p.dataPlecarii);

  let operatiune = 'inscriere';
  const persoaneZona = h('div', { class: 'persoane-cerere' });
  const sterge = (rand) => h('button', { type: 'button', class: 'sterge-persoana', onclick: () => {
    if (persoaneZona.children.length > 1) rand.remove();
  } }, ic('x'), 'Scoate persoana');

  // Înscriere: coloanele din HG nr. 295/2021, anexa 8.
  const randInscriere = () => {
    const rand = h('div', { class: 'rand-persoana' },
      h('label', { class: 'lat' }, 'Numele de familie și prenumele *', h('input', { class: 'p-nume', maxlength: 120, autocomplete: 'off', autocapitalize: 'characters' })),
      h('label', {}, 'Actul de identitate: seria', h('input', { class: 'p-serie', maxlength: 4, autocomplete: 'off', autocapitalize: 'characters' })),
      h('label', {}, 'Actul de identitate: numărul *', h('input', { class: 'p-numar', maxlength: 12, autocomplete: 'off' })),
      h('label', {}, 'Data mutării în imobil *', h('input', { class: 'p-data', type: 'date' })),
      h('label', {}, 'Felul adresei', selectFel('domiciliu', { class: 'p-fel' })),
      h('label', { class: 'lat' }, 'Domiciliul persoanei (cum e înscris în actul de identitate) *', h('input', { class: 'p-dom', maxlength: 300 })),
      h('label', {}, 'Telefon (opțional)', h('input', { class: 'p-tel', type: 'tel', maxlength: 20, autocomplete: 'off' })),
      h('label', {}, 'E-mail (opțional)', h('input', { class: 'p-email', type: 'email', maxlength: 120, autocomplete: 'off' })),
      h('label', { class: 'bifa lat' }, h('input', { class: 'p-contact', type: 'checkbox' }), 'Persoană de contact pentru apartament'));
    rand.append(sterge(rand));
    return rand;
  };
  // Radiere: persoana se alege din cartea de imobil electronică (sau se scrie, dacă nu e încă acolo).
  const randRadiere = () => {
    const lista = activi();
    const numeAlt = h('label', { class: 'lat', hidden: lista.length > 0 }, 'Numele de familie și prenumele *', h('input', { class: 'p-nume', maxlength: 120, autocapitalize: 'characters' }));
    const alege = h('select', { class: 'p-id', onchange: () => { numeAlt.hidden = alege.value !== 'alta'; } },
      lista.length > 0 && h('option', { value: '' }, 'Alege persoana…'),
      lista.map((p) => h('option', { value: p.id }, `${p.nume} (din ${fmtData(p.dataMutarii)})`)),
      h('option', { value: 'alta', selected: !lista.length }, 'Altă persoană (nu apare în cartea de imobil electronică)'));
    // De ce lista poate fi goală: apartamentul nu e ales încă sau nimeni nu e înscris (încă) în cartea electronică.
    const motiv = !lista.length && h('p', { class: 'avertizare mic lat' }, !(apartament() >= 1)
      ? 'Alege întâi apartamentul (sus); lista se completează cu persoanele înscrise acolo.'
      : `În cartea de imobil electronică nu e nicio persoană înscrisă acum la ap. ${apartament()}. O persoană apare aici abia după ce cererea ei de înscriere a fost rezolvată de responsabilul cărții de imobil (starea „Rezolvată”), nu doar înregistrată.`);
    const rand = h('div', { class: 'rand-persoana' },
      h('label', { class: 'lat' }, 'Persoana care se mută din imobil *', alege),
      motiv,
      numeAlt,
      h('label', {}, 'Data mutării din imobil *', h('input', { class: 'p-data', type: 'date' })));
    rand.append(sterge(rand));
    return rand;
  };
  const randNou = () => (operatiune === 'inscriere' ? randInscriere() : randRadiere());
  const reface = () => persoaneZona.replaceChildren(randNou());
  reface();

  const persoaneCarte = () => [...persoaneZona.querySelectorAll('.rand-persoana')].map((r) => {
    if (operatiune === 'inscriere') {
      return {
        nume: r.querySelector('.p-nume').value, actSerie: r.querySelector('.p-serie').value, actNumar: r.querySelector('.p-numar').value,
        data: r.querySelector('.p-data').value, felAdresa: r.querySelector('.p-fel').value, domiciliu: r.querySelector('.p-dom').value,
        telefon: r.querySelector('.p-tel').value, email: r.querySelector('.p-email').value, contact: r.querySelector('.p-contact').checked,
      };
    }
    const id = r.querySelector('.p-id').value;
    if (!id) throw new Error('Alege persoana care se mută din imobil.');
    const p = id !== 'alta' && carte.persoane.find((y) => y.id === id);
    return p ? { id, nume: p.nume, data: r.querySelector('.p-data').value } : { nume: r.querySelector('.p-nume').value, data: r.querySelector('.p-data').value };
  });

  const zonaCarte = deCarte && h('fieldset', {},
    h('legend', {}, 'Cartea de imobil'),
    h('div', { class: 'optiuni' }, Object.entries(OPERATII_CARTE).map(([v, t]) => h('label', { class: 'bifa' },
      h('input', { type: 'radio', name: 'operatiune', value: v, checked: v === operatiune, onchange: () => { operatiune = v; reface(); } }), t))),
    persoaneZona,
    h('button', { type: 'button', onclick: () => persoaneZona.append(randNou()) }, ic('plus'), 'Încă o persoană'),
    h('p', { class: 'slab mic' }, 'Telefonul și e-mailul sunt opționale: asociația le folosește doar ca să vă contacteze (convocări, avarii) și le vede doar conducerea; puteți cere oricând ștergerea lor.'),
    h('p', { class: 'slab mic' }, `Datele se trec exact ca în actul de identitate (pentru copiii sub 14 ani, certificatul de naștere). Responsabilul cărții de imobil verifică actul — doar îl vede, nu face copii (art. 94) — și face înscrierea în ${TERMEN_CARTE_ZILE} zile de la sosire (HG nr. 295/2021, anexa 1, art. 93).`));

  const nrInput = h('input', { type: 'number', min: 0, max: MAX_PERSOANE, step: 1, inputmode: 'numeric' });
  const deInput = h('input', { type: 'date', value: azi() });
  const cuNr = deCarte && h('input', { type: 'checkbox', onchange: () => { zonaNr.hidden = !cuNr.checked; } });
  const zonaNr = h('div', { class: 'zona-cerere', hidden: deCarte },
    h('div', { class: 'grila' },
      h('label', {}, 'Câte persoane locuiesc efectiv în apartament *', nrInput),
      h('label', {}, 'De la data *', deInput)),
    h('p', { class: 'slab mic' }, 'Numărul de persoane pentru cheltuieli nu e același lucru cu cartea de imobil: contează cine locuiește efectiv în apartament, nu cine are domiciliul aici. Se înregistrează ca cerere separată, la administrator, care îl trece în e-bloc.'));

  // Cererea pe hârtie, tipărită cu ce s-a completat până acum (câmpurile goale rămân de scris de mână).
  const tiparesteCererea = (goala) => {
    const persoaneTipar = goala || !deCarte ? [] : [...persoaneZona.querySelectorAll('.rand-persoana')].map((r) => {
      const v = (cls) => r.querySelector(cls)?.value?.trim() || '';
      const id = v('.p-id');
      const din = id && id !== 'alta' && carte.persoane.find((y) => y.id === id);
      return { nume: din ? din.nume : v('.p-nume').toUpperCase(), actSerie: v('.p-serie').toUpperCase(), actNumar: v('.p-numar'),
        data: v('.p-data'), felAdresa: v('.p-fel'), domiciliu: v('.p-dom'), telefon: v('.p-tel'), email: v('.p-email') };
    }).filter((p) => Object.values(p).some(Boolean));
    tiparesteDocument(documentCerere({
      carte: deCarte, operatiune,
      apartament: goala ? '' : (apartament() || ''), nume: goala ? '' : form.nume.value.trim(),
      persoane: persoaneTipar,
      cuNr: !deCarte || cuNr.checked || goala, nr: goala ? '' : nrInput.value, de: goala ? '' : deInput.value,
    }));
  };

  const textButon = proprietar ? [ic('fingerprint'), 'Semnează cu passkey și trimite'] : ['Înregistrează cererea'];
  const form = h('form', { class: 'card formular', onsubmit: async (ev) => {
    ev.preventDefault();
    eroare.hidden = true;
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const c = {
        apartament: apartament(),
        nume: form.nume.value.trim(),
        canal: proprietar ? 'aplicatie' : form.canal.value,
        carte: deCarte ? { operatiune, persoane: persoaneCarte() } : null,
        persoane: !deCarte || cuNr.checked ? { nr: nrInput.value === '' ? NaN : Number(nrInput.value), de: deInput.value } : null,
      };
      if (!(c.apartament >= 1)) throw new Error('Alege apartamentul.');
      if (!c.nume) throw new Error('Completează numele solicitantului.');
      const parti = pregatesteCerere(c);
      const noi = fisiere ? [...fisiere.files] : [];
      if (!proprietar && !noi.length) throw new Error('Atașează cererea semnată (scan sau fotografie): e dovada modificării.');
      const mare = noi.find((f) => f.size > MAX_FISIER);
      if (mare) throw new Error(`„${mare.name}” depășește 25 MB.`);
      let semnatura = null;
      if (proprietar) {
        const semnatLa = new Date().toISOString();
        const [hCarte, hPersoane] = await Promise.all([amprentaParte(parti.carte), amprentaParte(parti.persoane)]);
        const webauthn = await semneazaCu(continutCerere({ apartament: c.apartament, nume: c.nume, semnatDe: S.cont.u, semnatLa, hCarte, hPersoane }));
        semnatura = { webauthn, semnatLa, hCarte, hPersoane };
      }
      btn.textContent = 'Se înregistrează…';
      const r = await S.reg.adaugaCerere({ ...c, ...parti }, semnatura, noi);
      const [a, b] = r.lista;
      S.mesaj = b
        ? `Cererea a fost înregistrată cu nr. ${a.nr} (cartea de imobil) și nr. ${b.nr} (numărul de persoane) din ${fmtData(a.data)}.`
        : `Cererea a fost înregistrată cu nr. ${a.nr} din ${fmtData(a.data)}.`;
      mergi(`#/admin/s/${r.an}/${a.nr}`);
    } catch (e) {
      btn.disabled = false;
      btn.replaceChildren(...textButon);
      eroare.textContent = mesajEroare(e);
      eroare.hidden = false;
    }
  } },
  h('p', { class: 'slab' }, proprietar
    ? 'Cererea primește număr de înregistrare și o semnezi cu passkey-ul tău (amprentă, față sau PIN), ca dovadă a datei la care ai anunțat.'
    : 'Pentru cererile pe hârtie: completează datele împreună cu solicitantul, tipărește cererea, cere-i s-o semneze, apoi atașează scanul sau fotografia ei și înregistrează. Fără cererea semnată atașată nu se poate înregistra.'),
  !proprietar && h('div', { class: 'actiuni' },
    h('button', { type: 'button', onclick: () => tiparesteCererea(false) }, ic('printer'), 'Tipărește cererea pentru semnare'),
    h('button', { type: 'button', onclick: () => tiparesteCererea(true) }, ic('printer'), 'Formular gol')),
  h('div', { class: 'grila' },
    proprietar
      ? h('label', {}, 'Apartamentul', h('input', { value: `Ap. ${S.cont.apartament}`, disabled: true }))
      : h('label', {}, 'Apartamentul *', alegeAp),
    h('label', {}, 'Solicitant (nume și prenume) *', h('input', { name: 'nume', required: true, maxlength: 120, autocomplete: proprietar ? 'name' : 'off' })),
    !proprietar && h('label', {}, 'Primită prin *', h('select', { name: 'canal', required: true },
      Object.entries(CANALE).filter(([k]) => k !== 'aplicatie').map(([v, t]) => h('option', { value: v }, t))))),
  zonaCarte,
  deCarte
    ? h('fieldset', {}, h('legend', {}, h('label', { class: 'bifa' }, cuNr, 'Se schimbă și numărul de persoane care locuiesc efectiv')), zonaNr)
    : h('fieldset', {}, h('legend', {}, 'Numărul de persoane'), zonaNr),
  fisiere && h('label', {}, 'Cererea semnată — scan sau fotografie * (max. 25 MB fiecare)', fisiere),
  eroare,
  h('div', { class: 'actiuni' },
    h('button', { type: 'submit', class: 'principal' }, ...textButon),
    h('a', { href: deCarte ? '#/admin/carte-imobil' : '#/admin/persoane', class: 'buton' }, 'Renunță')));
  afiseaza(deCarte ? 'carte' : 'persoane', h('h1', {}, deCarte ? 'Cerere: cartea de imobil' : 'Declarație: numărul de persoane'), form);
}

// Cererea tipărită pentru semnare (cereri pe hârtie): cu datele completate în formular sau goală.
// După semnare se scanează / fotografiază și se atașează la înregistrare, ca dovadă.
function documentCerere(d) {
  const linie = (v, n = 20) => (v === undefined || v === null || v === '' ? '_'.repeat(n) : String(v));
  const ins = d.operatiune !== 'radiere';
  const persoane = d.carte && d.persoane.length ? d.persoane : Array.from({ length: d.carte ? 4 : 0 }, () => ({}));
  const tabel = d.carte && h('table', { class: 'carte' },
    h('thead', {}, h('tr', {}, (ins
      ? ['Numele de familie și prenumele (cu litere de tipar)', 'Act de identitate: seria', 'Numărul', 'Data mutării în imobil', 'Felul adresei (domiciliu / reședință)', 'Domiciliul (din actul de identitate)', 'Telefon, e-mail (opțional)']
      : ['Numele de familie și prenumele', 'Data mutării din imobil']).map((t) => h('th', {}, t)))),
    h('tbody', {}, persoane.map((p) => h('tr', {}, (ins
      ? [p.nume, p.actSerie, p.actNumar, p.data && fmtData(p.data), p.felAdresa && FEL_ADRESA[p.felAdresa], p.domiciliu,
        [p.telefon, p.email].filter(Boolean).join(', ')]
      : [p.nume, p.data && fmtData(p.data)]).map((v) => h('td', {}, v || ' '))))));
  return h('div', { class: 'de-tipar doar-tipar document-cerere' },
    h('div', { class: 'antet-tipar' }, h('strong', {}, ASOCIATIA.nume), h('span', {}, ASOCIATIA.adresa)),
    h('p', { class: 'mic' }, 'Nr. de înregistrare __________ din ______________'),
    h('h2', { class: 'centrat-text' }, 'CERERE'),
    h('p', { class: 'centrat-text' }, d.carte
      ? (ins ? 'privind înscrierea în cartea de imobil' : 'privind mutarea din imobil (radierea din cartea de imobil)')
      : 'privind numărul de persoane care locuiesc efectiv în apartament'),
    h('p', {}, `Subsemnatul(a) ${linie(d.nume, 34)}, apartamentul ${linie(d.apartament, 4)}, `,
      d.carte
        ? (ins ? 'vă rog să înscrieți în cartea de imobil următoarele persoane:' : 'vă rog să treceți în cartea de imobil mutarea din imobil a următoarelor persoane:')
        : 'declar următoarele:'),
    tabel,
    d.cuNr && h('p', {}, `Declar că, începând cu data de ${linie(d.de && fmtData(d.de), 12)}, în apartament locuiesc efectiv ${linie(d.nr, 4)} persoane (pentru repartizarea cheltuielilor).`),
    d.carte && ins && h('p', { class: 'mic' }, 'Telefonul și e-mailul sunt opționale: asociația le folosește doar pentru a vă contacta și puteți cere oricând ștergerea lor.'),
    h('div', { class: 'semnaturi-cerere' },
      h('p', {}, 'Data: ________________'),
      h('p', {}, 'Semnătura solicitantului: ________________________')),
    d.carte && ins && h('p', { class: 'mic' }, `Rezervat responsabilului cărții de imobil: actul de identitate al fiecărei persoane a fost prezentat și verificat vizual, fără copie (HG nr. 295/2021, anexa 1, art. 94). Nume și semnătură: ______________________________`));
}

function tiparesteDocument(doc) {
  const main = document.querySelector('main');
  main.append(doc);
  document.body.classList.add('tipar-pv');
  window.addEventListener('afterprint', () => { document.body.classList.remove('tipar-pv'); doc.remove(); }, { once: true });
  window.print();
}

// Verifică semnătura proprietarului pe partea de cerere din această înregistrare.
async function blocSemnaturaCerere(x) {
  const s = x.semnatura;
  const amp = await amprentaParte(x.categorie === 'cerere_carte' ? x.carte : x.persoane);
  if (amp !== (x.categorie === 'cerere_carte' ? s.hCarte : s.hPersoane)) {
    return h('p', { class: 'eroare' }, '✗ Cererea a fost modificată după ce a fost semnată.');
  }
  return blocSemnatura(s.webauthn, continutCerere({ apartament: x.apartament, nume: x.nume, semnatDe: s.semnatDe, semnatLa: s.semnatLa, hCarte: s.hCarte, hPersoane: s.hPersoane }));
}

// Responsabilul vede actul de identitate, confirmă (sau corectează) datele din cerere și le înscrie.
function formularInscriere(an, x, gata) {
  const eroare = h('p', { class: 'eroare', role: 'alert', hidden: true });
  const randuri = x.carte.persoane.map((p) => h('fieldset', { class: 'persoana-carte' },
    h('legend', {}, p.nume),
    h('div', { class: 'grila' },
      h('label', { class: 'lat' }, 'Numele de familie și prenumele *', h('input', { name: 'nume', value: p.nume, required: true, maxlength: 120 })),
      h('label', {}, 'Actul de identitate: seria', h('input', { name: 'actSerie', value: p.actSerie, maxlength: 4, autocomplete: 'off' })),
      h('label', {}, 'Actul de identitate: numărul *', h('input', { name: 'actNumar', value: p.actNumar, required: true, maxlength: 12, autocomplete: 'off' })),
      h('label', {}, 'Data mutării în imobil *', h('input', { name: 'dataMutarii', type: 'date', value: p.data, required: true })),
      h('label', {}, 'Felul adresei', selectFel(p.felAdresa, { name: 'felAdresa' })),
      h('label', { class: 'lat' }, 'Domiciliul (din actul de identitate) *', h('input', { name: 'domiciliu', value: p.domiciliu, required: true, maxlength: 300 })),
      h('label', {}, 'Telefon (opțional)', h('input', { name: 'telefon', type: 'tel', value: p.telefon, maxlength: 20 })),
      h('label', {}, 'E-mail (opțional)', h('input', { name: 'email', type: 'email', value: p.email, maxlength: 120 })),
      h('label', { class: 'bifa lat' }, h('input', { name: 'contact', type: 'checkbox', checked: Boolean(p.contact) }), 'Persoană de contact pentru apartament'))));
  const camp = (f, n) => f.querySelector(`[name=${n}]`).value;
  const form = h('form', { class: 'formular', onsubmit: async (ev) => {
    ev.preventDefault();
    eroare.hidden = true;
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      await S.carte.inscrie(randuri.map((f) => ({
        apartament: x.apartament, nume: camp(f, 'nume'), felAdresa: camp(f, 'felAdresa'), actSerie: camp(f, 'actSerie'),
        actNumar: camp(f, 'actNumar'), dataMutarii: camp(f, 'dataMutarii'), domiciliu: camp(f, 'domiciliu'),
        telefon: camp(f, 'telefon'), email: camp(f, 'email'), contact: f.querySelector('[name=contact]').checked,
      })), { an, nr: x.nr });
      S.mesaj = 'Persoanele au fost înscrise în cartea de imobil; cererea e rezolvată.';
      gata();
    } catch (e) {
      btn.disabled = false;
      eroare.textContent = mesajEroare(e);
      eroare.hidden = false;
    }
  } }, randuri,
  h('label', { class: 'bifa' }, h('input', { type: 'checkbox', required: true }),
    'Am văzut actele de identitate și datele corespund (fără copii, art. 94).'),
  eroare,
  h('div', { class: 'actiuni' }, h('button', { type: 'submit', class: 'principal' }, ic('book'), 'Înscrie în cartea de imobil')));
  return h('div', { class: 'card nu-tipari' },
    h('h2', {}, 'Verificare și înscriere în cartea de imobil'),
    h('p', { class: 'slab mic' }, 'Datele le-a completat proprietarul. Verifică-le cu actul de identitate al fiecărei persoane (pentru copiii sub 14 ani, certificatul de naștere) și corectează-le dacă e cazul.'),
    form);
}

async function formularRadiere(an, x, gata) {
  const carte = await S.carte.citeste();
  const active = carte.persoane.filter((p) => p.apartament === x.apartament && !p.dataPlecarii);
  if (!active.length) {
    return h('div', { class: 'card nu-tipari' }, h('h2', {}, 'Radiere din cartea de imobil'),
      h('p', { class: 'avertizare' }, `În cartea de imobil electronică nu e nicio persoană înscrisă la ap. ${x.apartament} care să nu se fi mutat deja. Înregistrează întâi o cerere de înscriere pentru ea (cu data mutării de atunci) sau respinge cererea.`));
  }
  const eroare = h('p', { class: 'eroare', role: 'alert', hidden: true });
  const randuri = x.carte.persoane.map((p) => {
    const potrivita = active.find((a) => a.id === p.id) || active.find((a) => normNume(a.nume) === normNume(p.nume));
    return h('fieldset', { class: 'persoana-carte' },
      h('legend', {}, p.nume),
      h('div', { class: 'grila' },
        h('label', {}, 'Persoana din cartea de imobil *', h('select', { name: 'id', required: true },
          h('option', { value: '' }, 'Alege…'),
          active.map((a) => h('option', { value: a.id, selected: a === potrivita }, `${a.nume} (din ${fmtData(a.dataMutarii)})`)))),
        h('label', {}, 'Data mutării din imobil *', h('input', { name: 'data', type: 'date', value: p.data, required: true }))));
  });
  const form = h('form', { class: 'formular', onsubmit: async (ev) => {
    ev.preventDefault();
    eroare.hidden = true;
    const plecari = randuri.map((f) => ({ id: f.querySelector('[name=id]').value, data: f.querySelector('[name=data]').value }));
    if (new Set(plecari.map((p) => p.id)).size !== plecari.length) {
      eroare.textContent = 'Ai ales aceeași persoană de două ori.';
      eroare.hidden = false;
      return;
    }
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      await S.carte.radiaza(plecari, { an, nr: x.nr });
      S.mesaj = 'Data mutării din imobil a fost trecută în cartea de imobil; cererea e rezolvată.';
      gata();
    } catch (e) {
      btn.disabled = false;
      eroare.textContent = mesajEroare(e);
      eroare.hidden = false;
    }
  } }, randuri, eroare,
  h('div', { class: 'actiuni' }, h('button', { type: 'submit', class: 'principal' }, ic('book'), 'Trece mutarea în cartea de imobil')));
  return h('div', { class: 'card nu-tipari' }, h('h2', {}, 'Radiere din cartea de imobil'), form);
}

// Tabelul unei cereri pentru cartea de imobil (coloanele anexei 8 la înscriere).
function tabelCerereCarte(x) {
  const ins = x.carte.operatiune === 'inscriere';
  return h('div', { class: 'tabel-carte' }, h('table', { class: 'carte' },
    h('thead', {}, h('tr', {},
      ins
        ? ['Numele de familie și prenumele', 'Seria', 'Numărul', 'Data mutării în imobil și felul adresei', 'Domiciliul (din actul de identitate)', 'Contact (opțional)'].map((t) => h('th', {}, t))
        : ['Numele de familie și prenumele', 'Data mutării din imobil'].map((t) => h('th', {}, t)))),
    h('tbody', {}, x.carte.persoane.map((p) => h('tr', {},
      ins
        ? [h('td', {}, p.nume), h('td', {}, p.actSerie || ''), h('td', {}, p.actNumar || ''),
          h('td', {}, `${fmtData(p.data)}, ${FEL_ADRESA[p.felAdresa] || ''}`), h('td', {}, p.domiciliu || ''), h('td', {}, textContact(p))]
        : [h('td', {}, p.nume), h('td', {}, fmtData(p.data))])))));
}

async function detaliuCerere(an, x, reg) {
  const reincarca = () => paginaAdminDetaliu(an, x.nr);
  const actiune = (fn, mesaj) => async (ev) => {
    const btn = ev.currentTarget;
    btn.disabled = true;
    try {
      await fn();
      S.mesaj = mesaj;
      reincarca();
    } catch (e) {
      btn.disabled = false;
      alert(mesajEroare(e));
    }
  };
  const finala = STARI_FINALE.includes(x.stare);
  const carte = x.categorie === 'cerere_carte';
  const alta = x.conexat && reg.inregistrari.find((i) => `${i.nr}/${an}` === x.conexat);
  const rand = (et, val) => (val || val === 0 ? [h('dt', {}, et), h('dd', {}, val)] : null);
  const t = termenInfo(x);

  const act = [];
  if (!finala && (carte ? eRespCarte() : poateRezolvaPersoane())) {
    if (!carte) act.push(h('button', { class: 'principal', onclick: actiune(() => S.reg.marcheazaEbloc(an, x.nr), 'Marcată ca înregistrată în e-bloc.') }, ic('check'), 'Am înregistrat în e-bloc'));
    act.push(h('button', { onclick: (ev) => {
      const motiv = prompt('Motivul respingerii (îl vede proprietarul):');
      if (motiv && motiv.trim()) actiune(() => S.reg.respingeCerere(an, x.nr, motiv), 'Cererea a fost respinsă.')(ev);
    } }, 'Respinge'));
  }
  let rezolvare = null;
  if (carte && eRespCarte() && !finala) {
    try {
      rezolvare = x.carte.operatiune === 'inscriere' ? formularInscriere(an, x, reincarca) : await formularRadiere(an, x, reincarca);
    } catch (e) { rezolvare = h('p', { class: 'eroare' }, mesajEroare(e)); }
  }

  afiseaza(carte ? 'carte' : 'persoane',
    h('a', { href: carte ? '#/admin/carte-imobil' : '#/admin/persoane', class: 'inapoi nu-tipari' }, ic('arrow-left'), carte ? 'Cartea de imobil' : 'Numărul de persoane'),
    h('div', { class: 'doar-tipar antet-tipar' }, h('strong', {}, ASOCIATIA.nume), h('span', {}, ASOCIATIA.adresa)),
    h('h1', {}, `${CATEGORII[x.categorie]} nr. ${x.nr} din ${fmtData(x.data)}`),
    h('p', { class: 'insigne' }, insignaStare(x), insignaTermen(x)),
    t && t.nivel !== 'ok' && h('p', { class: t.nivel === 'depasit' ? 'eroare' : 'avertizare', role: 'alert' },
      `Termenul de ${TERMEN_CARTE_ZILE} zile pentru înscrierea în cartea de imobil (HG nr. 295/2021, anexa 1, art. 93 lit. a)) ${t.nivel === 'depasit' ? 'a expirat' : 'expiră'} pe ${fmtData(x.termen)}.`),
    h('div', { class: 'card' },
      h('dl', { class: 'detalii' },
        rand('Apartament', `Ap. ${x.apartament}`),
        rand('Solicitant', x.nume),
        rand('Primită prin', CANALE[x.canal]),
        rand('Se ocupă', numeRol(x.responsabil)),
        carte && rand('Operațiune', OPERATII_CARTE[x.carte.operatiune]),
        !carte && rand('Persoane care locuiesc efectiv', `${x.persoane.nr}, de la ${fmtData(x.persoane.de)}`),
        carte && rand('Termen', x.termen && fmtData(x.termen)),
        rand('Conexată cu', alta && vizibila(alta)
          ? h('a', { href: `#/admin/s/${an}/${alta.nr}` }, `nr. ${x.conexat} — ${CATEGORII[alta.categorie]}`)
          : (x.conexat ? `nr. ${x.conexat} (${carte ? 'numărul de persoane, la administrator' : 'cartea de imobil, la responsabilul cărții'})` : '')),
        x.rezolvare && rand(x.stare === 'respinsa' ? 'Motivul respingerii' : 'Rezolvare',
          `${x.rezolvare.motiv || x.rezolvare.nota} — ${eticheta(x.rezolvare.u)}, ${fmtDataOra(x.rezolvare.la)}`)),
      carte && tabelCerereCarte(x)),
    x.semnatura
      ? await blocSemnaturaCerere(x)
      : h('p', { class: 'slab mic' }, `Cerere ${CANALE[x.canal].toLowerCase()}, înregistrată de ${eticheta(x.creatDe)}.`),
    blocFisiere(x),
    rezolvare,
    act.length > 0 && h('div', { class: 'card nu-tipari' }, h('h2', {}, 'Acțiuni'), h('div', { class: 'actiuni' }, act)),
    blocIstoric(x),
    h('p', { class: 'mic slab nu-tipari' }, 'Amprenta înregistrării: ', h('code', {}, codVerificare(x.amprenta) || '—')));
}

// Cartea de imobil (HG nr. 295/2021, anexa 8): orice înscriere sau mutare trece printr-o cerere semnată
// (passkey sau hârtie atașată). Responsabilul cărții și președintele pot doar corecta greșelile de transcriere.
function formularPersoana(p, gata, renunta) {
  const eroare = h('p', { class: 'eroare', role: 'alert', hidden: true });
  const form = h('form', { class: 'card formular', onsubmit: async (ev) => {
    ev.preventDefault();
    eroare.hidden = true;
    const v = Object.fromEntries(new FormData(form).entries());
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      await S.carte.corecteaza(p.id, v);
      S.mesaj = 'Înscrierea a fost corectată.';
      gata();
    } catch (e) {
      btn.disabled = false;
      eroare.textContent = mesajEroare(e);
      eroare.hidden = false;
    }
  } },
  h('h2', {}, `Corectează: ${p.nume}`),
  h('p', { class: 'slab mic' }, 'Doar pentru greșeli de transcriere. O mutare în sau din imobil se face printr-o cerere semnată. Valorile vechi rămân în istoricul înscrierii.'),
  h('div', { class: 'grila' },
    h('label', {}, 'Apartamentul *', h('select', { name: 'apartament', required: true },
      h('option', { value: '' }, 'Alege…'), Array.from({ length: APARTAMENTE }, (_, i) => h('option', { value: i + 1, selected: p?.apartament === i + 1 }, `Ap. ${i + 1}`)))),
    h('label', {}, 'Numele de familie și prenumele *', h('input', { name: 'nume', required: true, maxlength: 120, value: p?.nume })),
    h('label', {}, 'Actul de identitate: seria', h('input', { name: 'actSerie', maxlength: 4, autocomplete: 'off', value: p?.actSerie })),
    h('label', {}, 'Actul de identitate: numărul *', h('input', { name: 'actNumar', required: true, maxlength: 12, autocomplete: 'off', value: p?.actNumar })),
    h('label', {}, 'Data mutării în imobil *', h('input', { name: 'dataMutarii', type: 'date', required: true, value: p?.dataMutarii })),
    h('label', {}, 'Felul adresei', selectFel(p?.felAdresa || 'domiciliu', { name: 'felAdresa' })),
    h('label', { class: 'lat' }, 'Domiciliul (cum e înscris în actul de identitate) *', h('input', { name: 'domiciliu', required: true, maxlength: 300, value: p?.domiciliu })),
    h('label', {}, 'Telefon (opțional)', h('input', { name: 'telefon', type: 'tel', maxlength: 20, value: p?.telefon })),
    h('label', {}, 'E-mail (opțional)', h('input', { name: 'email', type: 'email', maxlength: 120, value: p?.email })),
    h('label', { class: 'bifa lat' }, h('input', { name: 'contact', type: 'checkbox', checked: Boolean(p?.contact) }), 'Persoană de contact pentru apartament'),
    p && h('label', {}, 'Data mutării din imobil', h('input', { name: 'dataPlecarii', type: 'date', value: p.dataPlecarii || '' }))),
  p && (p.istoric || []).length > 0 && h('details', {}, h('summary', {}, 'Istoricul înscrierii'),
    h('ol', { class: 'istoric' }, p.istoric.map((i) => h('li', {}, h('span', { class: 'slab mic' }, `${fmtDataOra(i.la)} · ${eticheta(i.u)}`), h('span', {}, i.actiune))))),
  eroare,
  h('div', { class: 'actiuni' },
    h('button', { type: 'submit', class: 'principal' }, 'Salvează corecția'),
    h('button', { type: 'button', onclick: renunta }, 'Renunță')));
  return form;
}

function textContact(p) {
  return [p.telefon, p.email, p.contact && 'persoană de contact'].filter(Boolean).join(' · ');
}

// Ultima declarație de număr de persoane trecută în e-bloc, pe apartamente (din toți anii).
async function persoanePeApartamente() {
  const regs = await Promise.all(S.ani.map((a) => S.reg.citesteAn(a)));
  const lista = regs.flatMap((reg, i) => reg.inregistrari
    .filter((x) => x.categorie === 'cerere_persoane' && x.stare === 'rezolvata' && vizibila(x))
    .map((x) => ({ x, an: S.ani[i] })))
    .sort((a, b) => b.an - a.an || b.x.nr - a.x.nr);
  const ultima = new Map();
  for (const { x } of lista) if (!ultima.has(x.apartament)) ultima.set(x.apartament, x.persoane);
  return ultima;
}

async function paginaCarteImobil() {
  seIncarca('carte');
  const proprietar = eProprietar();
  const modifica = eRespCarte();
  let carte;
  let reg;
  let nrPersoane;
  try {
    [carte, reg, nrPersoane] = await Promise.all([S.carte.citeste(), S.reg.citesteAn(new Date().getFullYear()), persoanePeApartamente()]);
  } catch (e) { return eroarePagina('carte', e); }
  const persoane = proprietar ? carte.persoane.filter((p) => p.apartament === S.cont.apartament) : carte.persoane;
  const inAsteptare = reg.inregistrari.filter((x) => x.categorie === 'cerere_carte' && vizibila(x) && !STARI_FINALE.includes(x.stare));
  let ap = '';
  let ascundeMutati = false;
  const zonaForm = h('div', { class: 'nu-tipari' });
  const zona = h('div');
  const gata = () => paginaCarteImobil();
  const renunta = () => zonaForm.replaceChildren();
  const deschide = (el) => { zonaForm.replaceChildren(el); zonaForm.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  // Două formate de tipărire: oficial (doar coloanele anexei 8) și extins (cu contact și numărul de persoane).
  const tipareste = (extins) => {
    document.body.classList.toggle('tipar-extins', extins);
    window.addEventListener('afterprint', () => document.body.classList.remove('tipar-extins'), { once: true });
    window.print();
  };
  const infoAp = (a) => {
    const n = nrPersoane.get(a);
    return h('span', { class: 'info-ap' }, n
      ? `· locuiesc efectiv ${n.nr} ${n.nr === 1 ? 'persoană' : 'persoane'} (de la ${fmtData(n.de)}, e-bloc)`
      : '· numărul de persoane nedeclarat în aplicație');
  };

  const tabel = (lista) => h('div', { class: 'tabel-carte' }, h('table', { class: 'carte' },
    h('thead', {},
      h('tr', {},
        h('th', { rowspan: 2 }, 'Numele de familie și prenumele (cu litere de tipar)'),
        h('th', { colspan: 2 }, 'Actul de identitate'),
        h('th', { rowspan: 2 }, 'Data mutării în imobil și felul adresei (de domiciliu sau de reședință)'),
        h('th', { rowspan: 2 }, 'Domiciliul persoanei (înscris în actul de identitate)'),
        h('th', { rowspan: 2 }, 'Data mutării din imobil'),
        h('th', { rowspan: 2, class: 'col-extra' }, 'Contact (opțional)'),
        modifica && h('th', { rowspan: 2, class: 'nu-tipari' }, '')),
      h('tr', {}, h('th', {}, 'Seria'), h('th', {}, 'Numărul'))),
    h('tbody', {}, lista.map((p) => h('tr', { class: p.dataPlecarii ? 'mutat' : null },
      h('td', {}, p.nume),
      h('td', {}, p.actSerie),
      h('td', {}, p.actNumar),
      h('td', {}, `${fmtData(p.dataMutarii)}, ${FEL_ADRESA[p.felAdresa] || ''}`),
      h('td', {}, p.domiciliu),
      h('td', {}, fmtData(p.dataPlecarii)),
      h('td', { class: 'col-extra' }, textContact(p)),
      modifica && h('td', { class: 'nu-tipari' }, h('div', { class: 'actiuni' },
        h('button', { type: 'button', class: 'mic', onclick: () => deschide(formularPersoana(p, gata, renunta)) }, ic('pencil'), 'Corectează'))))))));

  // Rezumat pe apartamente (evidența extinsă): înscriși acum, câți locuiesc efectiv, persoanele de contact.
  const rezumat = () => {
    const apartamente = [...new Set([...persoane.map((p) => p.apartament), ...(proprietar ? [] : nrPersoane.keys())])]
      .filter((a) => !ap || a === Number(ap)).sort((a, b) => a - b);
    if (!apartamente.length) return null;
    return h('section', { class: 'extins' },
      h('h2', {}, 'Rezumat: persoane și contact pe apartamente'),
      h('div', { class: 'tabel-carte' }, h('table', { class: 'carte' },
        h('thead', {}, h('tr', {}, ['Apartament', 'Înscriși acum în cartea de imobil', 'Locuiesc efectiv (e-bloc)', 'Persoane de contact'].map((t) => h('th', {}, t)))),
        h('tbody', {}, apartamente.map((a) => {
          const inscrisi = persoane.filter((p) => p.apartament === a && !p.dataPlecarii);
          const n = nrPersoane.get(a);
          const contacte = inscrisi.filter((p) => p.contact || p.telefon || p.email);
          return h('tr', {},
            h('td', {}, `Ap. ${a}`),
            h('td', {}, inscrisi.length),
            h('td', {}, n ? `${n.nr} (de la ${fmtData(n.de)})` : '—'),
            h('td', {}, contacte.length ? contacte.map((p) => h('div', {}, `${p.nume}: ${textContact(p)}`)) : '—'));
        })))));
  };

  const deseneaza = () => {
    const lista = persoane.filter((p) => (!ap || p.apartament === Number(ap)) && (!ascundeMutati || !p.dataPlecarii));
    const grupe = new Map();
    for (const p of [...lista].sort((a, b) => a.apartament - b.apartament || a.dataMutarii.localeCompare(b.dataMutarii))) {
      if (!grupe.has(p.apartament)) grupe.set(p.apartament, []);
      grupe.get(p.apartament).push(p);
    }
    const gol = proprietar
      ? 'Nu e încă nimeni înscris în cartea de imobil electronică la apartamentul tău. Depune o cerere de înscriere.'
      : (persoane.length ? 'Nicio persoană nu corespunde filtrului.' : 'Cartea de imobil e goală. Înscrierile apar aici după ce se rezolvă cererile de înscriere.');
    zona.replaceChildren(...(grupe.size
      ? [...grupe].map(([a, l]) => h('section', { class: 'carte-ap' }, h('h2', {}, `Apartamentul ${a}`, infoAp(a)), tabel(l)))
      : [h('p', { class: 'gol' }, gol)]),
    ...[rezumat()].filter(Boolean));
  };
  const activi = persoane.filter((p) => !p.dataPlecarii).length;
  afiseaza('carte',
    h('div', { class: 'bara' },
      h('h1', {}, proprietar ? `Cartea de imobil — Ap. ${S.cont.apartament}` : 'Cartea de imobil'),
      h('div', { class: 'actiuni' },
        proprietar && h('a', { href: '#/admin/cerere-noua/carte', class: 'buton principal' }, ic('plus'), 'Cerere de înscriere / radiere'),
        modifica && h('a', { href: '#/admin/cerere-noua/carte', class: 'buton principal' }, ic('plus'), 'Cerere pe hârtie'),
        !proprietar && h('button', { onclick: () => tipareste(false) }, ic('printer'), 'Tipărește — format oficial'),
        !proprietar && h('button', { onclick: () => tipareste(true) }, ic('printer'), 'Tipărește — cu contact și nr. persoane'))),
    h('p', { class: 'avertizare nu-tipari' }, ic('lock'), proprietar
      ? ' Persoanele înscrise în cartea de imobil la apartamentul tău. Pentru o persoană care se mută în apartament sau pleacă din el, depui o cerere; înscrierea o face responsabilul cărții de imobil, după ce vede actul de identitate.'
      : ` Confidențial. Cartea de imobil o văd responsabilul cărții de imobil și președintele (care o și modifică), administratorul (doar citire) și, pentru apartamentul lor, proprietarii; se prezintă spre verificare numai poliției și serviciului de evidență a persoanelor (HG nr. 295/2021, anexa 1, art. 93 lit. c)). Nu se fac și nu se păstrează copii ale actelor de identitate (art. 94). Formatul oficial tipărește doar coloanele anexei 8; cel extins adaugă datele de contact și numărul de persoane (evidență internă a asociației).`),
    inAsteptare.length > 0 && h('div', { class: 'nu-tipari' },
      h('h2', {}, proprietar ? 'Cererile tale în lucru' : 'Cereri care așteaptă înscrierea sau radierea'),
      listaSesizari(inAsteptare, (x) => `#/admin/s/${new Date().getFullYear()}/${x.nr}`, { admin: !proprietar })),
    h('div', { class: 'doar-tipar antet-tipar' },
      h('strong', { class: 'antet-oficial' }, 'CARTEA DE IMOBIL'),
      h('strong', { class: 'antet-extins' }, 'CARTEA DE IMOBIL — EVIDENȚĂ EXTINSĂ'),
      h('span', {}, `${ASOCIATIA.nume} — ${ASOCIATIA.adresa}`),
      h('span', { class: 'antet-oficial' }, 'Forma și conținutul conform HG nr. 295/2021, anexa 8'),
      h('span', { class: 'antet-extins' }, 'Coloanele anexei 8 (HG nr. 295/2021) plus datele de contact opționale și numărul de persoane care locuiesc efectiv — evidență internă a asociației.')),
    h('div', { class: 'filtre' },
      !proprietar && h('select', { 'aria-label': 'Apartament', onchange: (ev) => { ap = ev.target.value; deseneaza(); } },
        h('option', { value: '' }, 'Toate apartamentele'),
        [...new Set(persoane.map((p) => p.apartament))].sort((a, b) => a - b).map((a) => h('option', { value: a }, `Ap. ${a}`))),
      h('label', { class: 'bifa' }, h('input', { type: 'checkbox', onchange: (ev) => { ascundeMutati = ev.target.checked; deseneaza(); } }), 'Ascunde persoanele mutate din imobil')),
    h('p', { class: 'slab mic nu-tipari' }, `${activi} ${activi === 1 ? 'persoană înscrisă' : 'persoane înscrise'} în prezent, ${persoane.length - activi} mutate din imobil.`),
    zonaForm,
    zona,
    h('p', { class: 'doar-tipar subsol-tipar' },
      'ATENȚIE! Confidențial, date cu caracter personal prelucrate în conformitate cu Regulamentul (UE) 2016/679 (Regulamentul general privind protecția datelor). ',
      `Tipărit la ${fmtDataOra(new Date().toISOString())} din registrul electronic.`));
  deseneaza();
}

// Numărul de persoane care locuiesc efectiv (pentru cheltuieli; sursa rămâne e-bloc). Proprietarul vede
// istoricul declarațiilor apartamentului; administratorul, președintele și cenzorul ultima declarație pe apartamente.
async function paginaPersoane() {
  seIncarca('persoane');
  const proprietar = eProprietar();
  let declaratii;
  const anDe = new Map();
  try {
    const regs = await Promise.all(S.ani.map((a) => S.reg.citesteAn(a)));
    declaratii = regs.flatMap((reg, i) => reg.inregistrari
      .filter((x) => x.categorie === 'cerere_persoane' && vizibila(x))
      .map((x) => { anDe.set(x, S.ani[i]); return x; }));
  } catch (e) { return eroarePagina('persoane', e); }
  const link = (x) => `#/admin/s/${anDe.get(x)}/${x.nr}`;
  const recente = [...declaratii].sort((a, b) => anDe.get(b) - anDe.get(a) || b.nr - a.nr);
  const inAsteptare = recente.filter((x) => !STARI_FINALE.includes(x.stare));
  // Ultima declarație rezolvată (trecută în e-bloc) pe fiecare apartament.
  const ultima = new Map();
  for (const x of recente) if (x.stare === 'rezolvata' && !ultima.has(x.apartament)) ultima.set(x.apartament, x);

  const titlu = proprietar ? `Numărul de persoane — Ap. ${S.cont.apartament}` : 'Numărul de persoane';
  const buton = (proprietar || poateInregistraCerere()) && h('a', { href: '#/admin/cerere-noua/persoane', class: 'buton principal' }, ic('plus'),
    proprietar ? 'Declară un număr nou' : 'Înregistrează declarație');
  const explicatie = h('p', { class: 'avertizare' }, ic('users'), ' Câte persoane locuiesc efectiv în apartament, pentru împărțirea cheltuielilor. Nu e același lucru cu cartea de imobil (domiciliul sau reședința). Declarația ajunge la administrator, care o trece în e-bloc; e-bloc rămâne evidența folosită la lista de plată.');

  if (proprietar) {
    const u = ultima.get(S.cont.apartament);
    return afiseaza('persoane',
      h('div', { class: 'bara' }, h('h1', {}, titlu), h('div', { class: 'actiuni' }, buton)),
      explicatie,
      h('div', { class: 'card' },
        h('h2', {}, 'Ultimul număr înregistrat în e-bloc'),
        u ? h('p', { class: 'mare' }, h('strong', {}, `${u.persoane.nr} ${u.persoane.nr === 1 ? 'persoană' : 'persoane'}`), ` de la ${fmtData(u.persoane.de)}`,
          h('span', { class: 'slab mic' }, ` · declarația nr. ${u.nr}/${anDe.get(u)}, înregistrată în e-bloc la ${fmtData(u.rezolvare?.la)}`))
          : h('p', { class: 'slab' }, 'Nu ai încă nicio declarație înregistrată în e-bloc prin aplicație.')),
      h('h2', {}, 'Declarațiile mele'),
      recente.length ? listaSesizari(recente, link) : h('p', { class: 'gol' }, 'Nicio declarație.'));
  }
  const randuri = [...ultima.values()].sort((a, b) => a.apartament - b.apartament);
  afiseaza('persoane',
    h('div', { class: 'bara' }, h('h1', {}, titlu), h('div', { class: 'actiuni' }, buton, h('button', { onclick: () => window.print() }, ic('printer'), 'Tipărește'))),
    explicatie,
    inAsteptare.length > 0 && h('div', { class: 'nu-tipari' },
      h('h2', {}, `De trecut în e-bloc (${inAsteptare.length})`),
      listaSesizari(inAsteptare, link, { admin: true })),
    h('h2', {}, 'Ultima declarație înregistrată, pe apartamente'),
    randuri.length
      ? h('div', { class: 'tabel-carte' }, h('table', { class: 'carte' },
        h('thead', {}, h('tr', {}, ['Apartament', 'Persoane', 'De la', 'Declarația', 'Înregistrată în e-bloc'].map((t) => h('th', {}, t)))),
        h('tbody', {}, randuri.map((x) => h('tr', {},
          h('td', {}, `Ap. ${x.apartament}`),
          h('td', {}, x.persoane.nr),
          h('td', {}, fmtData(x.persoane.de)),
          h('td', {}, h('a', { href: link(x) }, `nr. ${x.nr}/${anDe.get(x)}`)),
          h('td', {}, fmtData(x.rezolvare?.la)))))))
      : h('p', { class: 'gol' }, 'Nicio declarație înregistrată încă.'));
}

// ---------- registru complet ----------

const COLOANE_CSV = [
  ['Nr.', (x) => x.nr], ['Data', (x) => fmtData(x.data)], ['Tip', (x) => TIPURI_DOC[x.tip]], ['Categorie', (x) => CATEGORII[x.categorie]],
  ['Emitent', (x) => (CATEGORII_SESIZARE.includes(x.categorie) ? `Ap. ${x.apartament}` : x.emitent)],
  ['Destinatar', (x) => (CATEGORII_SESIZARE.includes(x.categorie) || CATEGORII_CERERE.includes(x.categorie) ? numeRol(x.responsabil) : x.destinatar)],
  ['Conținut pe scurt', (x) => x.problema || x.continut], ['Conexat', (x) => x.conexat || (x.raspuns ? `${x.raspuns.nr}/${x.raspuns.an}` : '')],
  ['Stare', stareText], ['Termen', (x) => fmtData(x.termen)], ['Amprentă', (x) => codVerificare(x.amprenta)],
];

function exportCsv(lista) {
  const cel = (v) => {
    let s = v === undefined || v === null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const randuri = [COLOANE_CSV.map(([t]) => cel(t)).join(';')].concat(lista.map((x) => COLOANE_CSV.map(([, f]) => cel(f(x))).join(';')));
  descarcaBlob(new Blob(['﻿' + randuri.join('\r\n')], { type: 'text/csv;charset=utf-8' }), `registru-${S.an}.csv`);
}

async function paginaRegistru() {
  seIncarca('registru');
  let reg;
  try { reg = await S.reg.citesteAn(S.an); } catch (e) { return eroarePagina('registru', e); }
  const lista = [...reg.inregistrari].sort((a, b) => a.nr - b.nr);
  const lant = h('span', { class: 'mic slab' }, 'Se verifică lanțul de amprente…');
  verificaLant(reg).then((r) => {
    lant.className = `mic ${r.valid ? 'verificat' : 'eroare'}`;
    lant.textContent = r.valid ? '✓ Lanțul de amprente al registrului este intact.' : `✗ Lanțul de amprente este rupt la nr. ${r.nr}.`;
  });
  afiseaza('registru',
    h('div', { class: 'bara' },
      h('h1', {}, 'Registru de intrare-ieșire ', selectAn(paginaRegistru)),
      h('div', { class: 'actiuni nu-tipari' },
        poateInregistra() && h('a', { href: '#/admin/document-nou', class: 'buton principal' }, ic('plus'), 'Document'),
        h('button', { onclick: () => exportCsv(lista) }, 'Export Excel'),
        h('button', { onclick: () => window.print() }, 'Tipărește'))),
    h('div', { class: 'doar-tipar antet-tipar' }, h('strong', {}, ASOCIATIA.nume), h('span', {}, `Registru de intrare-ieșire — anul ${S.an}`)),
    h('p', { class: 'nu-tipari' }, lant),
    lista.length
      ? h('div', { class: 'tabel-zona' }, h('table', { class: 'registru' },
        h('thead', {}, h('tr', {}, ['Nr.', 'Data', 'Tip', 'Emitent', 'Destinatar', 'Conținut pe scurt', 'Conexat', 'Stare'].map((t) => h('th', {}, t)))),
        h('tbody', {}, lista.map((x) => h('tr', { class: 'clic', tabindex: '0', onclick: () => mergi(`#/admin/s/${S.an}/${x.nr}`), onkeydown: (ev) => ev.key === 'Enter' && mergi(`#/admin/s/${S.an}/${x.nr}`) },
          COLOANE_CSV.slice(0, 2).map(([, f]) => h('td', { class: 'nowrap' }, f(x))),
          h('td', {}, `${TIPURI_DOC[x.tip]}${x.categorie !== 'document' ? ` · ${CATEGORII[x.categorie]}` : ''}`),
          [4, 5, 6, 7, 8].map((i) => h('td', { 'data-et': COLOANE_CSV[i][0] }, COLOANE_CSV[i][1](x))))))))
      : h('p', { class: 'gol' }, `Registrul pe ${S.an} este gol.`));
}

function paginaDocumentNou() {
  const eroare = h('p', { class: 'eroare', role: 'alert', hidden: true });
  const fisiere = h('input', { type: 'file', name: 'fisiere', multiple: true });
  const form = h('form', { class: 'card formular', onsubmit: async (ev) => {
    ev.preventDefault();
    const c = Object.fromEntries([...new FormData(form).entries()].filter(([k]) => k !== 'fisiere'));
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const r = await S.reg.adaugaDocument(c, [...fisiere.files]);
      S.mesaj = `Document înregistrat cu nr. ${r.x.nr} din ${fmtData(r.x.data)}.`;
      mergi(`#/admin/s/${r.an}/${r.x.nr}`);
    } catch (e) {
      btn.disabled = false;
      eroare.textContent = mesajEroare(e);
      eroare.hidden = false;
    }
  } },
  h('fieldset', {}, h('legend', {}, 'Tipul'), h('div', { class: 'optiuni' }, Object.entries(TIPURI_DOC).map(([v, t]) => h('label', { class: 'bifa' },
    h('input', { type: 'radio', name: 'tip', value: v, checked: v === 'intrare', required: true }), t)))),
  h('div', { class: 'grila' },
    h('label', {}, 'Emitent (de unde provine)', h('input', { name: 'emitent', placeholder: 'ex. Primăria Cluj-Napoca, E.ON' })),
    h('label', {}, 'Destinatar', h('input', { name: 'destinatar' })),
    h('label', {}, 'Nr. documentului emitentului', h('input', { name: 'nrDocExtern' })),
    h('label', {}, 'Conexat la nr. (ex. 12/2026)', h('input', { name: 'conexat' })),
    h('label', { class: 'lat' }, 'Conținutul pe scurt *', h('textarea', { name: 'continut', rows: 3, required: true, maxlength: 2000 }))),
  h('label', {}, 'Scan / fișiere', fisiere),
  eroare,
  h('div', { class: 'actiuni' },
    h('button', { type: 'submit', class: 'principal' }, 'Înregistrează documentul'),
    h('a', { href: '#/admin/registru', class: 'buton' }, 'Renunță')));
  afiseaza('document-nou', h('h1', {}, 'Înregistrează un document'), h('p', { class: 'slab' }, 'Pentru corespondență care nu e sesizare: adrese de la primărie, furnizori, notificări trimise etc.'), form);
}

// ---------- utilizatori ----------

async function paginaUtilizatori() {
  seIncarca('utilizatori');
  try { [S.conturi] = await Promise.all([Conturi.incarca(API, S.token), incarcaChei(true)]); } catch (e) { return eroarePagina('utilizatori', e); }
  const bilet = h('div');
  const actiune = (fn) => async (ev) => {
    const el = ev.currentTarget;
    el.disabled = true;
    try { await fn(); } catch (e) { alert(mesajEroare(e)); } finally { el.disabled = false; }
  };
  const arataBilete = (parole, text) => {
    bilet.replaceChildren(h('div', { class: 'card' },
      h('p', { class: 'avertizare' }, text),
      h('button', { class: 'principal', onclick: tiparesteBilete }, `Tipărește biletele (${parole.length})`),
      bilete(parole)));
    window.scrollTo(0, 0);
  };
  const proprii = S.conturi.utilizatori.filter((c) => c.rol === 'proprietar');
  const active = proprii.filter((c) => !c.temporara).length;
  const card = h('form', { class: 'rand-actiune', onsubmit: (ev) => {
    ev.preventDefault();
    const ap = Number(card.ap.value);
    const u = `ap${String(ap).padStart(2, '0')}`;
    const exista = S.conturi.gaseste(u);
    actiune(async () => {
      if (exista && !confirm(`Apartamentul ${ap} are deja cont${exista.temporara ? '' : ' cu parola lui'}. Generezi un card nou? Parola veche nu va mai funcționa.`)) return;
      const parola = await S.conturi.cardAcces(S.token, { u, rol: 'proprietar', apartament: ap });
      arataBilete([{ u, rol: 'proprietar', apartament: ap, parola }], `Card de acces pentru apartamentul ${ap}. Se afișează o singură dată — dă-l pe loc sau tipărește-l.`);
    })({ currentTarget: card.querySelector('button') });
  } },
  h('select', { name: 'ap', 'aria-label': 'Apartament' }, Array.from({ length: APARTAMENTE }, (_, i) => {
    const c = S.conturi.gaseste(`ap${String(i + 1).padStart(2, '0')}`);
    return h('option', { value: i + 1 }, `Ap. ${i + 1}${c ? (c.temporara ? ' — card dat, neactivat' : ' — activ') : ''}`);
  })),
  h('button', { type: 'submit', class: 'principal' }, 'Generează card de acces'));
  const bileteApartamente = h('div', { class: 'card' },
    h('h2', {}, 'Acces pentru apartamente'),
    h('p', {}, `${active} din ${APARTAMENTE} apartamente au contul activ.`),
    h('p', { class: 'slab mic' }, 'Proprietarul cere accesul pe WhatsApp. Verifici că e din apartamentul respectiv, alegi apartamentul și generezi cardul: utilizatorul și o parolă temporară, pe care o schimbă la prima conectare. Tot de aici se face și resetarea, dacă și-a uitat parola.'),
    card);
  const randuri = S.conturi.utilizatori.filter((c) => c.rol !== 'proprietar').map((c) => {
    const ap = h('select', { 'aria-label': `Apartament ${c.u}`, onchange: actiune(async () => {
      await S.conturi.seteazaApartament(S.token, c.u, ap.value ? Number(ap.value) : null);
    }) }, h('option', { value: '' }, '—'), Array.from({ length: APARTAMENTE }, (_, i) => h('option', { value: i + 1, selected: c.apartament === i + 1 }, `Ap. ${i + 1}`)));
    const coduri = S.chei.ale(c.u).filter((k) => !k.revocataLa).map((k) => k.cod);
    const poateComitet = !['cenzor', 'administrator'].includes(c.rol);
    return h('li', { class: 'rand-utilizator' },
      h('div', {}, h('strong', {}, rol(c.rol)?.nume || c.rol), h('span', { class: 'slab cod' }, c.u),
        h('span', { class: 'slab mic' }, coduri.length ? `Passkey: ${coduri.join(', ')}` : 'fără passkey')),
      h('label', { class: 'inline' }, 'Apartament', ap),
      poateComitet && h('label', { class: 'bifa' },
        h('input', { type: 'checkbox', checked: c.rol === 'presedinte' || Boolean(c.comitet), disabled: c.rol === 'presedinte', onchange: (ev) => actiune(async () => {
          await S.conturi.seteazaComitet(S.token, c.u, ev.target.checked);
        })(ev) }), c.rol === 'presedinte' ? 'Comitet executiv (de drept)' : 'Membru comitet executiv'),
      h('span', { class: `eticheta ${c.temporara ? 'termen-aproape' : 'stare-raspuns_trimis'}` }, c.temporara ? 'parolă temporară' : 'parolă schimbată'),
      c.u !== S.cont.u && h('button', { onclick: actiune(async () => {
        if (!confirm(`Resetezi parola pentru ${c.u}? Parola veche nu va mai funcționa.`)) return;
        const parola = await S.conturi.reseteaza(S.token, c.u);
        arataBilete([{ u: c.u, rol: c.rol, apartament: c.apartament, parola }], `Parolă temporară nouă pentru ${c.u}. Se afișează o singură dată.`);
      }) }, 'Resetează parola'));
  });
  afiseaza('utilizatori',
    h('h1', {}, 'Utilizatori'),
    h('p', { class: 'slab' }, 'Fiecare rol se atribuie unui apartament (nu unei persoane). Apartamentul apare lângă rol în aplicație și pe pagina publică.'),
    bilet,
    h('h2', {}, 'Administrație'),
    h('ul', { class: 'lista-utilizatori card' }, randuri),
    bileteApartamente);
}

// ---------- passkey: chei, semnare, verificare ----------

async function incarcaChei(fortat = false) {
  if (!S.chei || fortat) S.chei = await Chei.incarca(API, S.token, urlPublic());
  return S.chei;
}

// Cere semnătura passkey a utilizatorului conectat pe textul canonic dat.
async function semneazaCu(continut) {
  await incarcaChei(true);
  try {
    return await semneaza({ u: S.cont.u, chei: S.chei.lista, continut });
  } catch (e) {
    if (e instanceof FaraCheie) {
      if (confirm(`${e.message}\n\nMergi acum la Profil?`)) mergi('#/admin/profil');
      throw new Error('Semnarea are nevoie de un passkey.');
    }
    if (e?.name === 'NotAllowedError' || e?.name === 'AbortError') throw new Error('Semnarea a fost anulată.');
    throw e;
  }
}

// Card de verificare: ✓ / ✗ pentru o semnătură passkey.
function blocSemnatura(sem, continut) {
  const el = h('div', { class: 'semnatura' }, h('span', { class: 'slab mic' }, `Se verifică semnătura ${eticheta(sem.u)}…`));
  (async () => {
    await incarcaChei();
    const r = await verifica(sem, continut, S.chei.lista);
    el.className = `semnatura ${r.ok ? 'ok' : 'rau'}`;
    el.replaceChildren(
      ic(r.ok ? 'shield-check' : 'alert-triangle'),
      h('div', {},
        h('strong', {}, r.ok ? `Semnat de ${eticheta(sem.u)}` : `${eticheta(sem.u)}: ${r.motiv}`),
        h('span', { class: 'mic' }, `${fmtDataOra(sem.la)} · cheia ${sem.cod || '—'}`)));
  })();
  return el;
}

// ---------- profil și passkey-uri ----------

async function paginaProfil() {
  seIncarca('profil');
  try { await incarcaChei(true); } catch (e) { return eroarePagina('profil', e); }
  const ale = S.chei.ale(S.cont.u).sort((a, b) => b.inregistrataLa.localeCompare(a.inregistrataLa));
  const eroare = h('p', { class: 'eroare', role: 'alert', hidden: true });
  const form = h('form', { class: 'rand-actiune', onsubmit: async (ev) => {
    ev.preventDefault();
    eroare.hidden = true;
    const btn = form.querySelector('button');
    btn.disabled = true;
    try {
      const cheie = await creeazaCheie({ u: S.cont.u, eticheta: eticheta(S.cont.u), dispozitiv: form.dispozitiv.value.trim(), existente: ale });
      await S.chei.adauga(API, S.token, cheie);
      S.mesaj = `Passkey adăugat. Codul cheii: ${cheie.cod} — trece-l pe acordul semnat pe hârtie.`;
      paginaProfil();
    } catch (e) {
      btn.disabled = false;
      eroare.textContent = e?.name === 'NotAllowedError' ? 'Înregistrarea a fost anulată.' : (e?.name === 'InvalidStateError' ? 'Acest dispozitiv are deja un passkey pentru contul tău.' : mesajEroare(e));
      eroare.hidden = false;
    }
  } },
  h('input', { name: 'dispozitiv', required: true, maxlength: 60, placeholder: 'ex. Cont Google, Laptop birou', 'aria-label': 'Numele dispozitivului' }),
  h('button', { type: 'submit', class: 'principal', disabled: !suportat() }, ic('fingerprint'), 'Adaugă passkey'));

  afiseaza('profil',
    h('h1', {}, 'Profil'),
    h('div', { class: 'card' },
      h('dl', { class: 'detalii' },
        h('dt', {}, 'Cont'), h('dd', {}, `${eticheta(S.cont.u)} (${S.cont.u})`),
        eMembruComitet() && [h('dt', {}, 'Funcție'), h('dd', {}, 'Membru al comitetului executiv')]),
      h('a', { href: '#/admin/parola', class: 'buton' }, ic('key'), 'Schimbă parola')),
    h('div', { class: 'card' },
      h('h2', {}, 'Semnătură electronică (passkey)'),
      h('p', { class: 'slab' }, 'Cu un passkey semnezi documente cu amprenta, fața, PIN-ul telefonului sau Windows Hello. De obicei passkey-ul se sincronizează singur prin contul tău Google sau Apple, așa că îl ai pe toate dispozitivele tale cu același cod. Adaugă unul nou doar pe un dispozitiv care nu îl vede (de exemplu un calculator fără contul tău). Trece codul fiecărei chei pe acordul semnat pe hârtie: dacă o cheie ar fi înlocuită pe ascuns, codul nu s-ar mai potrivi.'),
      !suportat() && h('p', { class: 'avertizare' }, 'Browserul acesta nu suportă passkey-uri. Folosește un browser actualizat (Chrome, Safari, Edge, Firefox).'),
      ale.length
        ? h('ul', { class: 'lista-chei' }, ale.map((c) => h('li', { class: c.revocataLa ? 'revocata' : null },
          h('span', { class: 'placa' }, ic('fingerprint')),
          h('div', {},
            h('strong', {}, c.dispozitiv || 'Dispozitiv'),
            h('span', { class: 'cod mare' }, c.cod),
            h('span', { class: 'slab mic' }, `adăugat ${fmtDataOra(c.inregistrataLa)}${c.rpId !== location.hostname ? ` · pe ${c.rpId}` : ''}${c.revocataLa ? ` · revocat ${fmtDataOra(c.revocataLa)}` : ''}`)),
          !c.revocataLa && h('button', { onclick: async (ev) => {
            if (!confirm(`Revoci passkey-ul „${c.dispozitiv}”? Semnăturile făcute deja cu el rămân valabile.`)) return;
            ev.currentTarget.disabled = true;
            try { await S.chei.revoca(API, S.token, c.id, S.cont.u); S.mesaj = 'Passkey revocat.'; paginaProfil(); } catch (e) { alert(mesajEroare(e)); }
          } }, 'Revocă'))))
        : h('p', { class: 'slab' }, 'Nu ai încă niciun passkey.'),
      eroare,
      form));
}

// ---------- ședințe ----------

const membriComitet = () => S.conturi?.membriComitet() || [];
const eMembruComitet = () => membriComitet().some((c) => c.u === S.cont?.u);
const conturiCenzor = () => (S.conturi?.utilizatori || []).filter((c) => c.rol === 'cenzor');
const participaLaSedinte = () => eMembruComitet() || S.cont?.rol === 'cenzor';
const participanti = () => [...membriComitet(), ...conturiCenzor()];

async function hashB64u(text) {
  return b64u(await hashText(text));
}

function insignaSedinta(s) {
  const st = stareSedinta(s);
  const cls = { convocata: 'stare-repartizata', pv_redactat: 'stare-in_lucru', in_semnare: 'stare-raspuns_propus', semnata: 'stare-raspuns_propus', afisata: 'stare-raspuns_trimis' }[st];
  return h('span', { class: `eticheta ${cls}` }, STARI_SEDINTA[st]);
}

function avertizariSedinta(s) {
  const out = [];
  const convocare = zileIntre(inceput(s), new Date(s.convocataLa));
  if (convocare < ZILE_CONVOCARE) {
    out.push(h('p', { class: 'avertizare' }, ic('alert-triangle'), ` Convocată cu ${Math.max(0, Math.floor(convocare))} zile înainte — legea cere cel puțin ${ZILE_CONVOCARE} zile (art. 55 din Legea nr. 196/2018).`));
  }
  if (stareSedinta(s) !== 'afisata' && new Date() > inceput(s)) {
    const limita = new Date(inceput(s).getTime() + ZILE_AFISARE * 86400000);
    const ramase = Math.ceil(zileIntre(limita, new Date()));
    out.push(h('p', { class: ramase < 0 ? 'eroare' : 'avertizare' }, ic('clock'),
      ramase < 0
        ? ` Termenul de afișare a deciziilor (${ZILE_AFISARE} zile, art. 55) a expirat pe ${fmtData(limita.toISOString())}.`
        : ` Deciziile trebuie afișate până pe ${fmtData(limita.toISOString())} (${ZILE_AFISARE} zile, art. 55) — mai sunt ${ramase} zile.`));
  }
  return out;
}

async function paginaSedinte() {
  seIncarca('sedinte');
  let reg;
  try { reg = await S.sed.citesteAn(S.an); } catch (e) { return eroarePagina('sedinte', e); }
  const lista = [...reg.sedinte].sort((a, b) => b.nr - a.nr);
  afiseaza('sedinte',
    h('div', { class: 'bara' },
      h('h1', {}, 'Ședințe comitet ', selectAn(paginaSedinte)),
      ePresedinte() && h('a', { href: '#/admin/sedinte/noua', class: 'buton principal' }, ic('plus'), 'Convoacă ședință')),
    h('p', { class: 'slab' }, `Comitetul executiv: ${membriComitet().map((c) => eticheta(c.u)).join(', ') || '—'}. Cvorum: ${cvorum(membriComitet().length, 0).necesar} membri.`),
    lista.length
      ? h('ul', { class: 'lista-sesizari' }, lista.map((s) => h('li', {},
        h('a', { href: `#/admin/sedinte/${S.an}/${s.nr}`, class: 'rand-sesizare' },
          h('span', { class: `placa ${stareSedinta(s) === 'afisata' ? 'inchisa' : stareSedinta(s) === 'convocata' ? '' : 'in_lucru'}` }, ic('calendar')),
          h('div', { class: 'rand-cap' },
            h('span', { class: 'nr' }, `Ședința ${s.nr}/${S.an}`),
            h('span', {}, `${fmtData(s.data)} · ${s.ora}`),
            h('span', { class: 'dreapta' }, insignaSedinta(s))),
          h('div', { class: 'rand-problema' }, s.ordineZi.join(' · ')),
          h('div', { class: 'rand-meta slab' }, s.pv ? `Proces-verbal nr. ${s.pv.nr}/${S.an}` : `${s.confirmari.length} confirmări · ${s.prezenta.length} prezenți`)))))
      : h('p', { class: 'gol' }, `Nicio ședință în ${S.an}.`));
}

// Sesizările propuse pentru ședință: pe lista ședinței lunare (art. 23–24), nefinalizate și
// netrecute încă pe ordinea de zi a altei ședințe. `exceptNr` = ședința editată (ale ei rămân propuse).
async function sesizariPropuse(exceptNr, anSedinta) {
  const ani = [...new Set([...(S.ani || []), S.an])];
  const [registre, sedinte] = await Promise.all([
    Promise.all(ani.map((a) => S.reg.citesteAn(a).then((r) => ({ an: a, r })))),
    Promise.all(ani.map((a) => S.sed.citesteAn(a))),
  ]);
  const folosite = new Set(sedinte.flatMap((r) => r.sedinte
    .filter((x) => !(r.an === anSedinta && x.nr === exceptNr)).flatMap((x) => x.sesizari || [])));
  return registre.flatMap(({ an, r }) => r.inregistrari
    .filter((x) => x.listaLunara && !STARI_FINALE.includes(x.stare) && !folosite.has(`${x.nr}/${an}`))
    .map((x) => ({ cheie: `${x.nr}/${an}`, x })));
}

const RE_SESIZARE_PE_ORDINE = /\(sesizarea nr\. (\d+\/\d+)\)$/;
function scurt(t, n = 90) {
  t = (t || '').replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const sp = t.lastIndexOf(' ', n);
  return `${t.slice(0, sp > 40 ? sp : n)}…`;
}
const titluDinSesizare = ({ cheie, x }) => `${scurt(x.problema || 'Sesizare').replace(/[.…]+$/, '')} (sesizarea nr. ${cheie})`;

async function formularConvocare(s, an) {
  seIncarca('sedinte');
  let propuse;
  try { propuse = await sesizariPropuse(s?.nr, an); } catch (e) { return eroarePagina('sedinte', e); }

  // Ordinea de zi: [{ titlu, cheie? }]. La o ședință nouă, toate sesizările propuse sunt bifate.
  let ordine = s
    ? s.ordineZi.map((titlu) => ({ titlu, cheie: titlu.match(RE_SESIZARE_PE_ORDINE)?.[1] }))
    : propuse.map((p) => ({ titlu: titluDinSesizare(p), cheie: p.cheie }));

  const eroare = h('p', { class: 'eroare', role: 'alert', hidden: true });
  const avert = h('p', { class: 'avertizare', hidden: true });
  const listaOrdine = h('ol', { class: 'ordine-zi' });
  const listaPropuse = h('div', { class: 'propuse' });
  const punctNou = h('input', { type: 'text', 'aria-label': 'Punct nou pe ordinea de zi', placeholder: 'ex.: Bugetul pentru curățenia de primăvară' });

  const muta = (i, j) => { [ordine[i], ordine[j]] = [ordine[j], ordine[i]]; deseneaza(); };
  const deseneaza = () => {
    listaPropuse.replaceChildren(...(propuse.length ? propuse.map((p) => {
      const dom = p.x.categorie === 'propunere' ? 'Propunere de proiect' : (DOMENII.find((d) => d.id === p.x.domeniu)?.nume || '');
      return h('label', { class: 'bifa' },
        h('input', { type: 'checkbox', checked: ordine.some((o) => o.cheie === p.cheie), onchange: (ev) => {
          ordine = ev.target.checked ? [...ordine, { titlu: titluDinSesizare(p), cheie: p.cheie }] : ordine.filter((o) => o.cheie !== p.cheie);
          deseneaza();
        } }),
        h('span', {}, h('strong', { class: 'cod' }, `Nr. ${p.cheie}`), ` · ${dom}`, h('br'), h('span', { class: 'slab' }, scurt(p.x.problema, 160))));
    }) : [h('p', { class: 'slab mic' }, 'Nicio sesizare nu așteaptă o ședință. Le pui pe listă din pagina sesizării: „Pune pe lista ședinței lunare”.')]));
    listaOrdine.replaceChildren(...ordine.map((o, i) => h('li', {},
      h('span', { class: 'titlu' }, o.titlu),
      h('button', { type: 'button', class: 'mic-btn', title: 'Mută mai sus', 'aria-label': 'Mută mai sus', disabled: i === 0, onclick: () => muta(i, i - 1) }, ic('arrow-up')),
      h('button', { type: 'button', class: 'mic-btn', title: 'Mută mai jos', 'aria-label': 'Mută mai jos', disabled: i === ordine.length - 1, onclick: () => muta(i, i + 1) }, ic('arrow-down')),
      h('button', { type: 'button', class: 'mic-btn', title: 'Scoate de pe ordinea de zi', 'aria-label': 'Scoate', onclick: () => { ordine.splice(i, 1); deseneaza(); } }, ic('x')))));
    if (!ordine.length) listaOrdine.append(h('li', { class: 'gol-ordine slab' }, 'Ordinea de zi e goală. Bifează sesizări sau adaugă puncte.'));
  };
  const adauga = () => {
    const t = punctNou.value.trim();
    if (!t) return;
    ordine.push({ titlu: t });
    punctNou.value = '';
    deseneaza();
    punctNou.focus();
  };
  punctNou.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); adauga(); } });

  const verificaTermen = () => {
    if (!form.data.value || !form.ora.value) { avert.hidden = true; return; }
    const zile = zileIntre(new Date(`${form.data.value}T${form.ora.value}:00`), new Date());
    avert.hidden = zile >= ZILE_CONVOCARE;
    avert.textContent = `Atenție: până la ședință sunt mai puțin de ${ZILE_CONVOCARE} zile. Legea cere convocarea cu cel puțin ${ZILE_CONVOCARE} zile înainte (art. 55 din Legea nr. 196/2018).`;
  };
  const form = h('form', { class: 'formular convocare', oninput: verificaTermen, onsubmit: async (ev) => {
    ev.preventDefault();
    eroare.hidden = true;
    const c = {
      data: form.data.value, ora: form.ora.value, zoom: form.zoom.value,
      ordineZi: ordine.map((o) => o.titlu),
      sesizari: ordine.map((o) => o.cheie).filter(Boolean),
    };
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const r = s ? await S.sed.editeazaConvocare(an, s.nr, c) : await S.sed.convoaca(c);
      S.mesaj = s ? 'Convocarea a fost modificată. Membrii trebuie să confirme din nou.' : `Ședința ${r.s.nr}/${r.an} a fost convocată.`;
      S.an = r.an;
      mergi(`#/admin/sedinte/${r.an}/${r.s.nr}`);
    } catch (e) {
      btn.disabled = false;
      eroare.textContent = mesajEroare(e);
      eroare.hidden = false;
    }
  } },
  h('div', { class: 'convocare-grila' },
    h('div', { class: 'card' },
      h('div', { class: 'grila' },
        h('label', {}, 'Data *', h('input', { type: 'date', name: 'data', required: true, value: s?.data || '' })),
        h('label', {}, 'Ora *', h('input', { type: 'time', name: 'ora', required: true, value: s?.ora || '19:00' })),
        h('label', { class: 'lat' }, 'Link Zoom', h('input', { name: 'zoom', value: s?.zoom || '', placeholder: 'https://zoom.us/j/…' }))),
      h('h2', {}, ic('list'), ' Propuse din sesizări'),
      h('p', { class: 'slab mic' }, 'Sesizările de pe lista ședinței lunare (fără soluție propusă și propunerile de proiect, art. 23–24), încă nediscutate. Debifează ce nu vrei pe ordinea de zi.'),
      listaPropuse,
      h('h2', {}, ic('plus'), ' Alte puncte'),
      h('div', { class: 'rand-adauga' }, punctNou, h('button', { type: 'button', onclick: adauga }, 'Adaugă'))),
    h('div', { class: 'card' },
      h('h2', {}, ic('notebook'), ' Ordinea de zi'),
      listaOrdine,
      avert,
      s?.confirmari.length ? h('p', { class: 'avertizare' }, `Modificarea anulează cele ${s.confirmari.length} confirmări „Am luat la cunoștință”.`) : null,
      eroare,
      h('div', { class: 'actiuni' },
        h('button', { type: 'submit', class: 'principal' }, s ? 'Salvează convocarea' : 'Convoacă ședința'),
        h('a', { href: s ? `#/admin/sedinte/${an}/${s.nr}` : '#/admin/sedinte', class: 'buton' }, 'Renunță')))));
  deseneaza();
  afiseaza('sedinte', h('h1', {}, s ? `Modifică convocarea ${s.nr}/${an}` : 'Convoacă o ședință'), form);
  verificaTermen();
}

// Tipărirea / PDF-ul unui proces-verbal: se tipăresc doar blocurile marcate `de-tipar`
// (PDF-ul se obține din fereastra de tipărire: „Salvează ca PDF”).
function tiparestePV() {
  document.body.classList.add('tipar-pv');
  window.addEventListener('afterprint', () => document.body.classList.remove('tipar-pv'), { once: true });
  window.print();
}
const butonTiparPV = () => h('button', { type: 'button', class: 'nu-tipari', onclick: tiparestePV }, ic('printer'), 'Tipărește / salvează PDF');
const subsolTiparPV = (s, an) => h('p', { class: 'doar-tipar mic subsol-tipar' },
  `Generat din registrul electronic al asociației la ${fmtDataOra(new Date().toISOString())}.`,
  inchisa(s) ? ` Verificare online: ${location.origin}${location.pathname}#/avizier/${an}/${s.nr}` : '');

// Procesul-verbal, afișat la fel în administrație și la avizier.
function vederePV(s, an) {
  const p = s.pv;
  const c = p.cvorum;
  return h('div', { class: 'card pv de-tipar' },
    h('div', { class: 'doar-tipar antet-tipar' }, h('strong', {}, ASOCIATIA.nume), h('span', {}, ASOCIATIA.adresa)),
    !inchisa(s) && h('p', { class: 'doar-tipar ciorna' }, 'CIORNĂ — procesul-verbal nu este încă semnat de toți și închis.'),
    h('h2', {}, `Proces-verbal nr. ${p.nr}/${an}`),
    h('p', { class: 'slab' }, `Ședința comitetului executiv din ${fmtData(s.data)}, ora ${s.ora}.`),
    h('dl', { class: 'detalii' },
      h('dt', {}, 'Participanți'), h('dd', {}, p.participanti.map((u) => eticheta(u)).join(', ') || '—'),
      h('dt', {}, 'Cvorum'), h('dd', {}, `${c.prezenti} din ${c.membri} membri prezenți (necesar ${c.necesar}) — ${c.intrunit ? 'cvorum întrunit' : 'cvorum neîntrunit'}`)),
    h('ol', { class: 'puncte' }, p.puncte.map((pt) => h('li', {},
      h('h3', {}, pt.titlu),
      pt.discutii && h('p', { class: 'text-lung' }, pt.discutii),
      (pt.decizii || []).map((d, i) => h('div', { class: 'decizie' },
        h('strong', {}, `Decizia ${i + 1}: `), h('span', { class: 'text-lung' }, d.text),
        h('div', { class: 'vot' },
          h('span', { class: 'eticheta stare-raspuns_trimis' }, `pentru ${d.pentru}`),
          h('span', { class: 'eticheta termen-aproape' }, `abțineri ${d.abtineri}`),
          h('span', { class: 'eticheta' }, `împotrivă ${d.impotriva}`),
          d.responsabil && h('span', { class: 'slab mic' }, `Responsabil: ${numeRol(d.responsabil)}`),
          d.termen && h('span', { class: 'slab mic' }, `Termen: ${fmtData(d.termen)}`))))))),
    p.observatii && h('p', { class: 'text-lung' }, h('strong', {}, 'Observații: '), p.observatii));
}

// Procesul-verbal închis se înregistrează în registrul de intrare-ieșire (document intern), o singură dată.
async function inregistreazaPV(an, nr) {
  const s = (await S.sed.citesteAn(an)).sedinte.find((x) => x.nr === nr);
  if (!s || s.inregistrare || !inchisa(s)) return;
  const decizii = s.pv.puncte.reduce((n, p) => n + (p.decizii || []).length, 0);
  const r = await S.reg.adaugaDocument({
    tip: 'intern',
    emitent: 'Comitetul executiv',
    destinatar: 'Proprietari (avizier)',
    continut: `Proces-verbal nr. ${s.pv.nr}/${an} al ședinței comitetului executiv din ${fmtData(s.data)} — ${decizii === 1 ? '1 decizie' : `${decizii} decizii`}`,
    conexat: (s.sesizari || []).length ? `sesizările ${s.sesizari.join(', ')}` : '',
  });
  await S.sed.noteazaInregistrare(an, nr, { nr: r.x.nr, an: r.an });
}

async function paginaSedinta(an, nr) {
  seIncarca('sedinte');
  let s;
  try {
    [s] = await Promise.all([S.sed.citesteAn(an).then((r) => r.sedinte.find((x) => x.nr === nr)), incarcaChei()]);
  } catch (e) { return eroarePagina('sedinte', e); }
  if (!s) return afiseaza('sedinte', h('p', { class: 'eroare' }, `Ședința ${nr}/${an} nu există.`));

  const actiune = (fn, mesaj) => async (ev) => {
    const btn = ev.currentTarget;
    btn.disabled = true;
    try { await fn(); S.mesaj = mesaj; paginaSedinta(an, nr); } catch (e) { btn.disabled = false; alert(mesajEroare(e)); }
  };
  const eu = S.cont.u;
  const stare = stareSedinta(s);
  const textConvocare = continutConvocare(s, an);
  const confirmat = s.confirmari.find((c) => c.u === eu);
  const prezent = s.prezenta.some((p) => p.u === eu);
  const membri = membriComitet();
  const prezentiMembri = membri.filter((m) => s.prezenta.some((p) => p.u === m.u));
  const cv = cvorum(membri.length, prezentiMembri.length);
  const poatePrezenta = participaLaSedinte() && !prezent && !s.semnaturi.length && Date.now() >= inceput(s).getTime() - 3600000;

  const convocare = h('div', { class: 'card' },
    h('h2', {}, ic('calendar'), ' Convocare'),
    h('dl', { class: 'detalii' },
      h('dt', {}, 'Data și ora'), h('dd', {}, `${fmtData(s.data)}, ora ${s.ora}`),
      s.zoom && [h('dt', {}, 'Zoom'), h('dd', {}, /^https?:\/\//.test(s.zoom) ? h('a', { href: s.zoom, target: '_blank', rel: 'noopener' }, s.zoom) : s.zoom)],
      h('dt', {}, 'Convocată de'), h('dd', {}, `${eticheta(s.convocataDe)} — ${fmtDataOra(s.convocataLa)}`),
      h('dt', {}, 'Ordinea de zi'), h('dd', {}, h('ol', {}, s.ordineZi.map((p) => h('li', {}, p))))),
    ePresedinte() && !s.pv && h('a', { href: `#/admin/sedinte/${an}/${nr}/convocare`, class: 'buton' }, ic('pencil'), 'Modifică convocarea'));

  const luare = h('div', { class: 'card' },
    h('h2', {}, ic('user-check'), ' Luare la cunoștință'),
    h('div', { class: 'lista-semnaturi' }, participanti().map((c) => {
      const sem = s.confirmari.find((x) => x.u === c.u);
      return sem ? blocSemnatura(sem, textConvocare) : h('div', { class: 'semnatura asteapta' }, ic('clock'), h('div', {}, h('strong', {}, eticheta(c.u)), h('span', { class: 'mic' }, 'nu a confirmat încă')));
    })),
    participaLaSedinte() && !confirmat && stare !== 'afisata' && h('button', { class: 'principal', onclick: actiune(async () => {
      const sem = await semneazaCu(textConvocare);
      await S.sed.confirma(an, nr, sem, (x) => hashB64u(continutConvocare(x, an)));
    }, 'Ai confirmat că ai luat la cunoștință convocarea.') }, ic('fingerprint'), 'Am luat la cunoștință'));

  const prezenta = h('div', { class: 'card' },
    h('h2', {}, ic('users'), ' Prezență'),
    h('p', {}, h('span', { class: `eticheta ${cv.intrunit ? 'stare-raspuns_trimis' : 'termen-aproape'}` },
      cv.intrunit ? `Cvorum întrunit: ${cv.prezenti}/${cv.membri}` : `Cvorum neîntrunit: ${cv.prezenti}/${cv.membri} (necesar ${cv.necesar})`)),
    h('ul', { class: 'lista-prezenta' }, participanti().map((c) => {
      const p = s.prezenta.find((x) => x.u === c.u);
      return h('li', { class: p ? 'da' : null }, ic(p ? 'check' : 'clock'), h('span', {}, eticheta(c.u)), h('span', { class: 'slab mic' }, p ? fmtDataOra(p.la) : 'absent'));
    })),
    poatePrezenta && h('button', { class: 'principal', onclick: actiune(() => S.sed.prezent(an, nr), 'Prezența a fost înregistrată.') }, ic('check'), 'Sunt prezent'),
    participaLaSedinte() && !prezent && !poatePrezenta && !s.semnaturi.length && h('p', { class: 'slab mic' }, 'Butonul „Sunt prezent” apare cu o oră înainte de începerea ședinței.'));

  const blocuri = [convocare, luare, prezenta];
  if (s.pv) {
    const textPV = continutPV(s, an);
    const semnat = s.semnaturi.find((x) => x.u === eu);
    blocuri.push(vederePV(s, an),
      h('div', { class: 'card de-tipar' },
        h('h2', {}, ic('fingerprint'), ' Semnături'),
        h('div', { class: 'lista-semnaturi' }, s.pv.semnatari.map((u) => {
          const sem = s.semnaturi.find((x) => x.u === u);
          return sem ? blocSemnatura(sem, textPV) : h('div', { class: 'semnatura asteapta' }, ic('clock'), h('div', {}, h('strong', {}, eticheta(u)), h('span', { class: 'mic' }, 'nesemnat')));
        })),
        s.pv.semnatari.includes(eu) && !semnat && stare !== 'afisata' && h('button', { class: 'principal nu-tipari', onclick: actiune(async () => {
          const sem = await semneazaCu(textPV);
          await S.sed.semneazaPV(an, nr, sem, (x) => hashB64u(continutPV(x, an)));
        }, 'Ai semnat procesul-verbal.') }, ic('fingerprint'), 'Semnează procesul-verbal'),
        stare === 'semnata' && h('p', { class: 'succes' }, 'Au semnat toți. Președintele închide procesul-verbal și îl afișează la avizier.'),
        stare === 'semnata' && ePresedinte() && h('button', { class: 'principal nu-tipari', onclick: actiune(async () => {
          await S.sed.inchidePV(an, nr);
          await inregistreazaPV(an, nr);
        }, 'Procesul-verbal a fost închis, afișat la avizier și înregistrat în registrul de intrare-ieșire.') },
          ic('lock'), 'Închide și afișează la avizier'),
        stare === 'afisata' && h('p', { class: 'succes' }, ic('lock'), ' Închis și afișat la ', h('a', { href: `#/avizier/${an}/${nr}` }, 'avizier'),
          s.inchisaLa ? ` pe ${fmtDataOra(s.inchisaLa)}` : '', '. Nu se mai poate modifica.'),
        stare === 'afisata' && s.inregistrare && h('p', { class: 'nu-tipari' }, ic('notebook'), ' Înregistrat în registrul de intrare-ieșire cu ',
          h('a', { href: `#/admin/s/${s.inregistrare.an}/${s.inregistrare.nr}` }, `nr. ${s.inregistrare.nr}/${s.inregistrare.an}`), '.'),
        h('div', { class: 'actiuni nu-tipari' },
          butonTiparPV(),
          stare !== 'afisata' && eMembruComitet() && h('a', { href: `#/admin/sedinte/${an}/${nr}/pv`, class: 'buton' }, ic('pencil'),
            s.semnaturi.length ? 'Modifică (anulează semnăturile)' : 'Modifică procesul-verbal')),
        subsolTiparPV(s, an)));
  } else if (eMembruComitet()) {
    blocuri.push(h('div', { class: 'card' },
      h('h2', {}, ic('file-text'), ' Proces-verbal'),
      h('p', { class: 'slab' }, 'După ședință, orice membru al comitetului redactează procesul-verbal. Primește automat numărul următor din registrul unic de procese-verbale.'),
      h('a', { href: `#/admin/sedinte/${an}/${nr}/pv`, class: 'buton principal' }, ic('pencil'), 'Redactează procesul-verbal')));
  }

  if (stare === 'afisata' && !s.inregistrare && ePresedinte()) {
    inregistreazaPV(an, nr).then(() => { if (location.hash === `#/admin/sedinte/${an}/${nr}`) paginaSedinta(an, nr); }).catch(() => {});
  }

  afiseaza('sedinte',
    h('a', { href: '#/admin/sedinte', class: 'inapoi nu-tipari' }, ic('arrow-left'), 'Ședințe'),
    h('h1', {}, `Ședința ${nr}/${an}`),
    h('p', { class: 'insigne' }, insignaSedinta(s), s.pv && h('span', { class: 'eticheta' }, `PV nr. ${s.pv.nr}/${an}`)),
    avertizariSedinta(s),
    blocuri,
    blocIstoric(s));
}

// Redactarea procesului-verbal: o foaie mare de text (gândită pentru calculator), cu dictare vocală.
// La salvare textul devine structura semnată (puncte, discuții, decizii cu vot / responsabil / termen).
function formularPV(s, an) {
  if (stareSedinta(s) === 'afisata') {
    return afiseaza('sedinte', h('p', { class: 'eroare' }, 'Procesul-verbal e închis și afișat la avizier. Nu se mai poate modifica.'),
      h('a', { href: `#/admin/sedinte/${an}/${s.nr}`, class: 'buton' }, ic('arrow-left'), 'Înapoi la ședință'));
  }
  const membri = membriComitet();
  const prezentiMembri = membri.filter((m) => s.prezenta.some((p) => p.u === m.u)).map((m) => m.u);
  const cenzori = conturiCenzor().map((c) => c.u);
  const existent = s.pv;
  const participantiPV = existent?.participanti || s.prezenta.map((p) => p.u);
  const cv = existent?.cvorum || cvorum(membri.length, prezentiMembri.length);
  const semnatari = existent?.semnatari || [...new Set([...prezentiMembri, ...cenzori])];
  const roluri = ROLURI.map((r) => ({ id: r.id, nume: numeRol(r.id) }));
  const puncteInitiale = existent?.puncte || s.ordineZi.map((titlu) => ({ titlu, discutii: '', decizii: [] }));

  const ta = h('textarea', { class: 'foaie-pv', spellcheck: 'true', 'aria-label': 'Textul procesului-verbal' }, pvInText(puncteInitiale, numeRol));
  const observatii = h('textarea', { rows: 3, 'aria-label': 'Observații' }, existent?.observatii || '');
  const eroare = h('div', { class: 'eroare', role: 'alert', hidden: true });
  const ed = editorPV({ ta, prezenti: cv.prezenti, dataSedinta: s.data, roluri });

  const form = h('form', { class: 'formular pv-editor', onsubmit: async (ev) => {
    ev.preventDefault();
    eroare.hidden = true;
    const { puncte, erori } = textInPV(ta.value, { roluri, dataSedinta: s.data });
    if (erori.length) {
      eroare.replaceChildren(h('strong', {}, 'Corectează înainte de salvare:'), h('ul', {}, erori.map((e) => h('li', {}, e))));
      eroare.hidden = false;
      eroare.scrollIntoView({ block: 'center' });
      return;
    }
    if (s.semnaturi.length && !confirm(`Procesul-verbal are ${s.semnaturi.length} semnături. Salvarea le anulează și toți trebuie să semneze din nou. Continui?`)) return;
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    ed.opreste();
    try {
      await S.sed.salveazaPV(an, s.nr, { participanti: participantiPV, cvorum: cv, semnatari, puncte, observatii: observatii.value.trim() });
      S.mesaj = 'Procesul-verbal a fost salvat. Semnatarii îl pot semna acum.';
      mergi(`#/admin/sedinte/${an}/${s.nr}`);
    } catch (e) {
      btn.disabled = false;
      eroare.replaceChildren(mesajEroare(e));
      eroare.hidden = false;
    }
  } },
  h('div', { class: 'pv-grila' },
    h('div', { class: 'card editor-pv' }, ed.bara, ed.aud, ta, ed.previz),
    h('aside', { class: 'pv-lateral' },
      h('div', { class: 'card' },
        h('h2', {}, ic('users'), ' Ședința'),
        h('dl', { class: 'detalii' },
          h('dt', {}, 'Data'), h('dd', {}, `${fmtData(s.data)}, ora ${s.ora}`),
          h('dt', {}, 'Participanți'), h('dd', {}, participantiPV.map((u) => eticheta(u)).join(', ') || '— (nimeni nu a marcat prezența)'),
          h('dt', {}, 'Cvorum'), h('dd', {}, `${cv.prezenti} din ${cv.membri} membri (necesar ${cv.necesar}) — ${cv.intrunit ? 'întrunit' : 'neîntrunit'}`),
          h('dt', {}, 'Semnează'), h('dd', {}, semnatari.map((u) => eticheta(u)).join(', ')))),
      h('div', { class: 'card' }, h('h2', {}, ic('notebook'), ' Ordinea de zi'), ed.salt),
      h('div', { class: 'card' }, ed.ajutor),
      h('div', { class: 'card' }, h('label', {}, 'Observații', observatii)))),
  eroare,
  h('div', { class: 'actiuni' },
    h('button', { type: 'submit', class: 'principal' }, 'Salvează procesul-verbal'),
    h('a', { href: `#/admin/sedinte/${an}/${s.nr}`, class: 'buton' }, 'Renunță')));
  afiseaza('sedinte', h('h1', {}, existent ? `Proces-verbal nr. ${existent.nr}/${an}` : `Proces-verbal — ședința ${s.nr}/${an}`), form);
  ed.porneste();
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) window.__pv = ed; // doar pentru teste locale
}

// Editorul: comenzile vocale și butoanele modifică textul din `ta`. Vezi docs/plans/plan-dictare-vocala.md.
//   text fără comandă → la cursor        „consemnează [text]” → la discuțiile punctului, deasupra deciziilor
//   „decizie [text]” → rând „Decizie:”  „vot / responsabil / termen …” → la decizia curentă (înlocuiește)
//   „decizia 2 / următoare / anterioară”, „punctul 2 / următor”, „punct nou …”, „rând nou”, „șterge ultima”
function editorPV({ ta, prezenti, dataSedinta, roluri }) {
  const istoric = [];
  const aud = h('div', { class: 'pv-aud' });
  const audEt = h('span', { class: 'eticheta' }, 'Microfon oprit');
  const audText = h('span', { class: 'text' }, dictareSuportata()
    ? 'Apasă microfonul și vorbește, sau scrie direct în foaie.'
    : 'Dictarea vocală nu merge în acest browser (merge în Chrome, Edge și Safari). Scrie direct în foaie.');
  aud.append(audEt, audText);
  const salt = h('div', { class: 'pv-salt' });
  const previz = h('div', { class: 'pv-previz', hidden: true });
  const undo = h('button', { type: 'button', class: 'mic-btn', title: 'Anulează ultima modificare dictată', 'aria-label': 'Anulează ultima modificare dictată', disabled: true }, ic('arrow-back-up'));
  const mic = h('button', { type: 'button', class: 'pv-mic', 'aria-pressed': 'false', 'aria-label': 'Pornește sau oprește dictarea', hidden: !dictareSuportata() }, ic('microphone'));
  const vedEdit = h('button', { type: 'button', 'aria-pressed': 'true' }, 'Editează');
  const vedPrev = h('button', { type: 'button', 'aria-pressed': 'false' }, 'Previzualizare');

  const aviz = (tip, text) => { audText.className = `text ${tip}`; audText.textContent = text; };
  const fmtZi = (iso) => iso.split('-').reverse().join('.');

  // ---- structura textului ----
  const sectiuni = () => {
    const re = /^(\d+)\.\s+(.+)$/gm; const out = []; let m;
    while ((m = re.exec(ta.value))) out.push({ nr: Number(m[1]), titlu: m[2], start: m.index, corp: m.index + m[0].length });
    out.forEach((x, i) => { x.end = i + 1 < out.length ? out[i + 1].start : ta.value.length; });
    return out;
  };
  const sectiuneaLa = (poz) => { const s = sectiuni(); let i = 0; s.forEach((x, k) => { if (poz >= x.start) i = k; }); return { s, i, x: s[i] }; };
  const tai = (e, min) => { while (e > min && /\s/.test(ta.value[e - 1])) e--; return e; };
  const sfarsit = (x) => tai(x.end, x.corp);
  const sfarsitDiscutii = (x) => {
    const m = ta.value.slice(x.corp, x.end).match(/^Decizie:/im);
    return m ? tai(x.corp + m.index, x.corp) : sfarsit(x);
  };
  const decizii = (x) => {
    const corp = ta.value.slice(x.corp, x.end); const re = /^Decizie:.*$/gim; const ds = []; let m;
    while ((m = re.exec(corp))) ds.push({ start: x.corp + m.index, text: m[0].replace(/^Decizie:\s*/i, '') });
    ds.forEach((d, i) => { d.end = tai(i + 1 < ds.length ? ds[i + 1].start : x.end, d.start); });
    return ds;
  };
  // Decizia pe care e cursorul; din discuții se ia ultima decizie a punctului.
  const decizieCurenta = (x, poz = ta.selectionStart) => {
    const ds = decizii(x); let k = -1;
    ds.forEach((d, i) => { if (poz >= d.start) k = i; });
    if (k < 0 && ds.length) k = ds.length - 1;
    return { ds, k };
  };

  // ---- modificări ----
  const salveazaStare = () => { istoric.push({ v: ta.value, c: ta.selectionStart }); if (istoric.length > 200) istoric.shift(); undo.disabled = false; };
  const muta = (p) => { ta.focus(); ta.selectionStart = ta.selectionEnd = p; deseneazaSalt(); };
  const insereaza = (poz, text) => { ta.setRangeText(text, poz, poz, 'end'); muta(poz + text.length); };
  const peRand = (poz, text) => (poz === 0 || ta.value[poz - 1] === '\n' ? '' : '\n') + text;
  const puneCamp = (x, eticheta, valoare) => {
    const { ds, k } = decizieCurenta(x);
    if (k < 0) return 'Spune întâi „decizie”, apoi votul, responsabilul sau termenul.';
    const d = ds[k];
    const m = ta.value.slice(d.start, d.end).match(new RegExp(`^${eticheta}:.*$`, 'im'));
    const linie = `${eticheta}: ${valoare}`;
    if (m) { const a = d.start + m.index; ta.setRangeText(linie, a, a + m[0].length, 'end'); muta(a + linie.length); } else insereaza(d.end, peRand(d.end, linie));
    return null;
  };
  const anuleaza = () => {
    const u = istoric.pop();
    if (!u) { aviz('err', 'Nu e nimic de anulat.'); return; }
    ta.value = u.v; muta(u.c); undo.disabled = !istoric.length;
    aviz('ok', 'Ultima modificare dictată a fost anulată.');
  };

  const aplica = (enunt) => {
    if (!previz.hidden) vedere(false);
    // „vot / responsabil / termen” din mijlocul unei fraze contează ca și comandă doar dacă se înțeleg.
    const valid = (c) => (c.tip === 'vot' ? Boolean(parseazaVot(c.restN, prezenti || 1))
      : c.tip === 'termen' ? Boolean(parseazaTermen(c.restN, dataSedinta))
        : c.tip === 'responsabil' ? Boolean(potrivesteRol(c.restN, roluri)) : true);
    const comenzi = parseaza(enunt, valid);
    if (!comenzi.length) return;
    if (comenzi.some((c) => c.tip === 'sterge ultima')) { anuleaza(); return; }
    salveazaStare();
    const facute = []; const erori = [];
    for (const c of comenzi) {
      const { s, i, x } = sectiuneaLa(ta.selectionStart);
      if (!x && c.tip !== 'punct nou') { erori.push('Procesul-verbal nu are niciun punct. Spune „punct nou …”.'); break; }
      switch (c.tip) {
        case 'text': {
          const p = ta.selectionStart;
          const randCurent = ta.value.slice(ta.value.lastIndexOf('\n', p - 1) + 1, p);
          // După un rând completat de vot / responsabil / termen, textul liber trece pe rând nou.
          const dupaCamp = /^(Vot|Responsabil|Termen):\s*\S/i.test(randCurent);
          insereaza(p, dupaCamp ? `\n${textLiber(c.rest, '')}` : textLiber(c.rest, ta.value.slice(0, p)));
          facute.push('Scris la cursor');
          break;
        }
        case 'consemneaza': {
          c.rest = c.rest.replace(/^(faptul\s+)?c[aă]\s+/i, ''); // „consemnăm că …”
          const p = sfarsitDiscutii(x);
          insereaza(p, c.rest ? peRand(p, fraza(c.rest)) : '\n');
          facute.push(c.rest ? `Consemnat la discuțiile punctului ${x.nr}` : `Scrii la discuțiile punctului ${x.nr}, deasupra deciziilor`);
          break;
        }
        case 'decizie': {
          const p = sfarsit(x);
          insereaza(p, peRand(p, c.rest ? `Decizie: ${fraza(c.rest)}` : 'Decizie: '));
          facute.push(c.rest ? `Decizie adăugată la punctul ${x.nr}` : `Decizie nouă la punctul ${x.nr}: dictează textul ei`);
          break;
        }
        case 'vot': {
          if (/\bunanim/.test(c.restN) && !prezenti) { erori.push('„Vot unanim” are nevoie de prezență marcată. Spune voturile: „vot 4 pentru 0 împotrivă 0 abțineri”.'); break; }
          const v = parseazaVot(c.restN, prezenti);
          if (!v) { erori.push('N-am înțeles votul. Exemplu: „vot 4 pentru 1 împotrivă 0 abțineri” sau „vot unanim”.'); break; }
          const e = puneCamp(x, 'Vot', `${v.pentru} pentru, ${v.impotriva} împotrivă, ${v.abtineri} abțineri.`);
          if (e) { erori.push(e); break; }
          facute.push(`Vot ${v.pentru}–${v.impotriva}–${v.abtineri} la decizia ${decizieCurenta(x).k + 1}`);
          const total = v.pentru + v.impotriva + v.abtineri;
          if (total > prezenti) erori.push(`Atenție: ${total} voturi, dar sunt ${prezenti} membri prezenți.`);
          break;
        }
        case 'responsabil': {
          const id = potrivesteRol(c.restN, roluri);
          if (!id) { erori.push(`N-am găsit rolul „${c.rest}”. Exemplu: „responsabil curățenie”.`); break; }
          const e = puneCamp(x, 'Responsabil', `${numeRol(id)}.`);
          if (e) erori.push(e); else facute.push(`Responsabil: ${numeRol(id)}`);
          break;
        }
        case 'termen': {
          const t = parseazaTermen(c.restN, dataSedinta);
          if (!t) { erori.push('N-am înțeles data. Exemplu: „termen 30 octombrie” sau „termen peste 10 zile”.'); break; }
          const e = puneCamp(x, 'Termen', `${fmtZi(t)}.`);
          if (e) erori.push(e); else facute.push(`Termen: ${fmtZi(t)}`);
          break;
        }
        case 'decizia': {
          const { ds, k } = decizieCurenta(x);
          const tinta = c.nr != null ? c.nr - 1 : k + c.dir;
          if (!ds[tinta]) { erori.push(ds.length ? `Punctul ${x.nr} are ${ds.length === 1 ? 'o decizie' : `${ds.length} decizii`}.` : `Punctul ${x.nr} nu are decizii.`); break; }
          muta(ds[tinta].end);
          facute.push(`La decizia ${tinta + 1} de la punctul ${x.nr}`);
          break;
        }
        case 'punctul':
        case 'punctul urmator': {
          const tinta = c.tip === 'punctul' ? (c.nr ?? 0) - 1 : i + 1;
          if (!s[tinta]) { erori.push(c.tip === 'punctul' ? `Nu există punctul ${c.nr ?? ''}.` : 'Nu mai există un punct următor. Spune „punct nou …”.'); break; }
          muta(sfarsitDiscutii(s[tinta]));
          facute.push(`La punctul ${s[tinta].nr}`);
          break;
        }
        case 'punct nou': {
          const titlu = fraza(c.rest || 'Diverse').replace(/\.$/, '');
          const p = tai(ta.value.length, 0);
          insereaza(p, `${p ? '\n\n' : ''}${s.length + 1}. ${titlu}\n`);
          facute.push(`Punct nou: ${s.length + 1}. ${titlu}`);
          break;
        }
        case 'rand nou':
          insereaza(ta.selectionStart, '\n');
          facute.push('Rând nou');
          break;
        default: break;
      }
    }
    if (istoric.length && istoric[istoric.length - 1].v === ta.value) istoric.pop();
    undo.disabled = !istoric.length;
    aviz(erori.length ? 'err' : 'ok', [...facute, ...erori].join(' · '));
  };

  // ---- ordinea de zi și deciziile, pentru salt ----
  const deseneazaSalt = () => {
    const s = sectiuni(); const poz = ta.selectionStart; const { i } = sectiuneaLa(poz);
    salt.replaceChildren(...s.flatMap((x, k) => {
      const ds = decizii(x);
      let kd = -1; if (k === i) ds.forEach((d, j) => { if (poz >= d.start) kd = j; });
      return [
        h('button', { type: 'button', class: k === i && kd < 0 ? 'curent' : null, onclick: () => muta(sfarsitDiscutii(x)) }, `${x.nr}. ${x.titlu}`),
        ...ds.map((d, j) => h('button', { type: 'button', class: `dec${k === i && j === kd ? ' curent' : ''}`, onclick: () => muta(d.end) }, `Decizia ${j + 1}: ${d.text || '…'}`)),
      ];
    }));
  };

  // ---- previzualizare ----
  const deseneazaPreviz = () => {
    const { puncte, erori } = textInPV(ta.value, { roluri, dataSedinta });
    previz.replaceChildren(
      erori.length ? h('div', { class: 'avertizare' }, h('strong', {}, 'De corectat înainte de salvare:'), h('ul', {}, erori.map((e) => h('li', {}, e)))) : null,
      ...puncte.map((p, i) => h('section', {},
        h('h3', {}, `${i + 1}. ${p.titlu}`),
        p.discutii ? h('p', { class: 'text-lung' }, p.discutii) : h('p', { class: 'slab' }, 'Fără discuții consemnate.'),
        p.decizii.map((d, j) => h('div', { class: 'decizie' },
          h('strong', {}, `Decizia ${j + 1}: `), h('span', { class: 'text-lung' }, d.text || '—'),
          h('div', { class: 'vot' },
            d.pentru != null && h('span', { class: 'eticheta stare-raspuns_trimis' }, `pentru ${d.pentru}`),
            d.pentru != null && h('span', { class: 'eticheta termen-aproape' }, `abțineri ${d.abtineri}`),
            d.pentru != null && h('span', { class: 'eticheta' }, `împotrivă ${d.impotriva}`),
            d.responsabil && h('span', { class: 'slab mic' }, `Responsabil: ${numeRol(d.responsabil)}`),
            d.termen && h('span', { class: 'slab mic' }, `Termen: ${fmtZi(d.termen)}`)))))));
  };
  const vedere = (prev) => {
    vedEdit.setAttribute('aria-pressed', String(!prev));
    vedPrev.setAttribute('aria-pressed', String(prev));
    ta.hidden = prev;
    previz.hidden = !prev;
    if (prev) deseneazaPreviz(); else ta.focus();
  };
  vedEdit.addEventListener('click', () => vedere(false));
  vedPrev.addEventListener('click', () => vedere(true));

  // ---- butoane ----
  const butonCamp = (text, fn) => h('button', { type: 'button', class: 'pv-unealta', onclick: () => { if (!previz.hidden) vedere(false); fn(); } }, ic('plus'), text);
  const cuSectiune = (fn) => () => { const { x } = sectiuneaLa(ta.selectionStart); if (!x) { aviz('err', 'Adaugă întâi un punct.'); return; } salveazaStare(); const e = fn(x); if (e) { istoric.pop(); undo.disabled = !istoric.length; aviz('err', e); } };
  // Responsabilul se alege dintr-o listă și se pune la decizia pe care e cursorul (înlocuiește).
  const alegeResponsabil = h('select', { class: 'pv-alege', 'aria-label': 'Alege responsabilul deciziei curente', onchange: (ev) => {
    const id = ev.target.value;
    ev.target.value = '';
    if (!id) return;
    if (!previz.hidden) vedere(false);
    let ok = false;
    cuSectiune((x) => { const e = puneCamp(x, 'Responsabil', `${numeRol(id)}.`); ok = !e; return e; })();
    if (ok) aviz('ok', `Responsabil: ${numeRol(id)} (decizia ${decizieCurenta(sectiuneaLa(ta.selectionStart).x).k + 1})`);
  } },
  h('option', { value: '' }, '+ Responsabil…'),
  roluri.filter((r) => r.id !== 'cenzor').map((r) => h('option', { value: r.id }, r.nume)));
  const unelte = h('div', { class: 'pv-unelte' },
    mic,
    butonCamp('Decizie', () => aplica('decizie')),
    butonCamp('Vot', cuSectiune((x) => puneCamp(x, 'Vot', '_ pentru, _ împotrivă, _ abțineri.'))),
    alegeResponsabil,
    butonCamp('Termen', cuSectiune((x) => puneCamp(x, 'Termen', ''))),
    undo,
    h('span', { class: 'umple' }),
    h('div', { class: 'pv-vederi' }, vedEdit, vedPrev));
  undo.addEventListener('click', anuleaza);
  ['click', 'keyup', 'input'].forEach((e) => ta.addEventListener(e, deseneazaSalt));

  // ---- microfon ----
  const dictare = new Dictare({
    onEnunt: aplica,
    onAud: (t) => { if (t) { audEt.textContent = 'Aud'; audEt.className = 'eticheta termen-aproape'; aviz('', `„${t}”`); } },
    onEroare: (m) => aviz('err', m),
    onStare: (on) => {
      mic.classList.toggle('asculta', on);
      mic.setAttribute('aria-pressed', String(on));
      audEt.textContent = on ? 'Ascult' : 'Microfon oprit';
      audEt.className = on ? 'eticheta stare-raspuns_trimis' : 'eticheta';
      if (on) aviz('', 'Vorbește. Textul se scrie după o scurtă pauză. Sunetul e recunoscut de browser și nu se păstrează.');
    },
  });
  mic.addEventListener('click', () => (dictare.asculta ? dictare.opreste() : dictare.porneste()));
  window.addEventListener('hashchange', () => dictare.opreste(), { once: true });

  const ajutor = h('details', { class: 'pv-ajutor' },
    h('summary', {}, ic('help-circle'), ' Comenzi vocale'),
    h('dl', { class: 'detalii' },
      h('dt', {}, '(orice text)'), h('dd', {}, 'se scrie unde e cursorul'),
      h('dt', {}, '„consemnează [text]”'), h('dd', {}, 'la discuțiile punctului curent, deasupra deciziilor; singur, mută acolo cursorul'),
      h('dt', {}, '„decizie [text]”'), h('dd', {}, 'rând nou „Decizie:”; textul e opțional, îl poți dicta după'),
      h('dt', {}, '„vot 4 pentru 1 împotrivă 0 abțineri”'), h('dd', {}, 'sau „vot unanim”; la decizia curentă, înlocuiește votul vechi'),
      h('dt', {}, '„responsabil …”'), h('dd', {}, 'de exemplu „responsabil curățenie”'),
      h('dt', {}, '„termen …”'), h('dd', {}, '„30 octombrie”, „30.10”, „peste 10 zile”, „sfârșitul lunii”'),
      h('dt', {}, '„decizia 2” / „decizia următoare” / „decizia anterioară”'), h('dd', {}, 'revii la o decizie a punctului curent'),
      h('dt', {}, '„punctul 2” / „punctul următor”'), h('dd', {}, 'mută cursorul la alt punct'),
      h('dt', {}, '„punct nou …”'), h('dd', {}, 'un punct care nu era pe ordinea de zi'),
      h('dt', {}, '„rând nou”'), h('dd', {}, 'trece pe rândul următor'),
      h('dt', {}, '„șterge ultima”'), h('dd', {}, 'anulează ultima dictare')),
    h('p', { class: 'slab mic' }, 'La tastatură scrii la fel: „Decizie:”, „Vot:”, „Responsabil:”, „Termen:” la început de rând. Sunetul e recunoscut de browser (Chrome: Google, Edge: Microsoft, Safari: Apple); aplicația nu înregistrează nimic.'));

  return {
    bara: unelte, aud, previz, salt, ajutor,
    opreste: () => dictare.opreste(),
    porneste: () => { deseneazaSalt(); muta(sectiuni()[0] ? sfarsitDiscutii(sectiuni()[0]) : 0); ta.scrollTop = 0; },
    aplica, // pentru teste
  };
}

async function deschideFormular(an, nr, fn) {
  seIncarca('sedinte');
  try {
    const s = (await S.sed.citesteAn(an)).sedinte.find((x) => x.nr === nr);
    if (!s) throw new Error(`Ședința ${nr}/${an} nu există.`);
    fn(s, an);
  } catch (e) { eroarePagina('sedinte', e); }
}

// ---------- avizier (public) ----------

async function citesteAvizier(an) {
  try {
    const d = await new GitHubRepo({ apiBase: API, token: S.token, repo: REPO_PUBLIC }).readJson(`avizier/${an}.json`);
    return d || { an, sedinte: [] };
  } catch { /* cădem pe Pages */ }
  const res = await fetch(`${urlPublic()}avizier/${an}.json?t=${Date.now()}`, { cache: 'no-store' });
  return res.ok ? res.json() : { an, sedinte: [] };
}

async function paginaAvizier() {
  seIncarca('avizier');
  let d;
  try { [d] = await Promise.all([citesteAvizier(S.an), incarcaConturiPublic()]); } catch (e) { return eroarePagina('avizier', e); }
  const lista = [...d.sedinte].sort((a, b) => b.pv.nr - a.pv.nr);
  afiseaza('avizier',
    h('h1', {}, 'Avizier ', selectAn(paginaAvizier)),
    h('p', { class: 'slab' }, 'Deciziile comitetului executiv, din procesele-verbale semnate electronic de membrii prezenți și de cenzor.',
      conectat() && !eProprietar() ? [' ', h('a', { href: '#/' }, 'Vezi și pagina publică a sesizărilor.')] : null),
    lista.length
      ? h('ul', { class: 'lista-sesizari' }, lista.map((s) => h('li', {},
        h('a', { href: `#/avizier/${S.an}/${s.nr}`, class: 'rand-sesizare' },
          h('span', { class: 'placa inchisa' }, ic('gavel')),
          h('div', { class: 'rand-cap' }, h('span', { class: 'nr' }, `Proces-verbal nr. ${s.pv.nr}/${S.an}`), h('span', {}, `ședința din ${fmtData(s.data)}`)),
          h('div', { class: 'rand-problema' }, s.pv.puncte.flatMap((p) => (p.decizii || []).map((x) => x.text)).join(' · ') || s.ordineZi.join(' · ')),
          h('div', { class: 'rand-meta slab' }, `${((n) => (n === 1 ? '1 decizie' : `${n} decizii`))(s.pv.puncte.reduce((n, p) => n + (p.decizii || []).length, 0))} · semnat ${fmtDataOra(s.semnataLa)}`)))))
      : h('p', { class: 'gol' }, `Nicio decizie afișată în ${S.an}.`));
}

async function paginaAvizierDetaliu(an, nr) {
  seIncarca('avizier');
  let s;
  try { [s] = await Promise.all([citesteAvizier(an).then((d) => d.sedinte.find((x) => x.nr === nr)), incarcaConturiPublic(), incarcaChei()]); } catch (e) { return eroarePagina('avizier', e); }
  if (!s) return afiseaza('avizier', h('p', { class: 'eroare' }, 'Procesul-verbal nu a fost găsit.'));
  const text = continutPV(s, an);
  afiseaza('avizier',
    h('a', { href: '#/avizier', class: 'inapoi nu-tipari' }, ic('arrow-left'), 'Avizier'),
    h('h1', {}, `Proces-verbal nr. ${s.pv.nr}/${an}`),
    vederePV(s, an),
    h('div', { class: 'card de-tipar' },
      h('h2', {}, ic('shield-check'), ' Semnături electronice'),
      h('div', { class: 'lista-semnaturi' }, s.semnaturi.map((sem) => blocSemnatura(sem, text))),
      h('p', { class: 'slab mic' }, `Cod de verificare: ${codVerificare(await hashB64u(text).then((x) => [...unb64u(x)].map((b) => b.toString(16).padStart(2, '0')).join('')))}`),
      butonTiparPV(),
      subsolTiparPV({ ...s, inchisaLa: s.inchisaLa || s.semnataLa }, an)));
}

// ---------- rutare ----------

async function ruta() {
  const [cale] = location.hash.replace(/^#/, '').split('?');
  const p = cale.split('/').filter(Boolean);

  if (p[0] !== 'admin') {
    if (p[0] === 'cum') return paginaCum();
    if (p[0] === 'avizier' && p[2]) return paginaAvizierDetaliu(Number(p[1]), Number(p[2]));
    if (p[0] === 'avizier') return paginaAvizier();
    if (p[0] === 'p' && p[2]) return paginaPublicaDetaliu(Number(p[1]), Number(p[2]));
    return paginaPublica();
  }
  if (!conectat()) return ecranLogin();
  if (S.cont.temporara) return ecranParola(true);
  switch (p[1]) {
    case 'sesizare-noua': return poateSesizare() ? formularSesizare() : paginaAdmin();
    case 'document-nou': return poateInregistra() ? paginaDocumentNou() : paginaAdmin();
    case 'cerere-noua':
      if (p[2] === 'carte' && (eProprietar() || eRespCarte())) return formularCerere('carte');
      if (p[2] === 'persoane' && (eProprietar() || poateInregistraCerere())) return formularCerere('persoane');
      return paginaAdmin();
    case 'carte-imobil': return eProprietar() || vedeCarte() ? paginaCarteImobil() : paginaAdmin();
    case 'persoane': return vedePersoane() ? paginaPersoane() : paginaAdmin();
    case 's': return paginaAdminDetaliu(Number(p[2]), Number(p[3]));
    case 'registru': return eAdministratie() ? paginaRegistru() : paginaAdmin();
    case 'utilizatori': return ePresedinte() ? paginaUtilizatori() : paginaAdmin();
    case 'parola': return ecranParola(false);
    case 'profil': return paginaProfil();
    case 'sedinte':
      if (!participaLaSedinte()) return paginaAdmin();
      if (p[2] === 'noua') return ePresedinte() ? formularConvocare(null) : paginaSedinte();
      if (p[4] === 'convocare') return deschideFormular(Number(p[2]), Number(p[3]), formularConvocare);
      if (p[4] === 'pv') return deschideFormular(Number(p[2]), Number(p[3]), formularPV);
      if (p[3]) return paginaSedinta(Number(p[2]), Number(p[3]));
      return paginaSedinte();
    default: return paginaAdmin();
  }
}

window.addEventListener('hashchange', ruta);

(async function start() {
  const s = citesteSesiune();
  if (s) {
    try {
      S.conturi = await Conturi.incarca(API, s.token);
      const cont = S.conturi?.gaseste(s.u);
      if (cont) await intra(cont, s.token);
      else stergeSesiune();
    } catch {
      stergeSesiune();
      Object.assign(S, { cont: null, token: null, reg: null });
    }
  }
  if (!S.cont || !location.hash.startsWith('#/admin')) ruta();
})();
