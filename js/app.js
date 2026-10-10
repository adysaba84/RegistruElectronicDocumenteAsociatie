import { GitHubRepo, GitHubError, activitate } from './github.js?v=13';
import { Conturi, verificaParola, MIN_PAROLA } from './conturi.js?v=13';
import {
  Registru, CATEGORII, CATEGORII_SESIZARE, STARI, STARI_FINALE, TIPURI_DOC, CANALE, OCUPARE, MAX_FISIER,
  termenInfo, amprenta, continutSemnat, continutRaspuns, codVerificare, verificaLant,
} from './store.js?v=13';
import { Chei, FaraCheie, creeazaCheie, semneaza, verifica, suportat, hashText, b64u, unb64u } from './passkey.js?v=13';
import {
  Sedinte, STARI_SEDINTA, ZILE_CONVOCARE, ZILE_AFISARE, continutConvocare, continutPV, stareSedinta, cvorum, inceput, zileIntre,
} from './sedinte.js?v=13';
import {
  ASOCIATIA, REPO_DATE, REPO_PUBLIC, ROLURI, DOMENII, APARTAMENTE, TERMEN_RASPUNS_ZILE, apiBase, urlPublic,
} from './config.js?v=13';

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
const vizibila = (x) => !eProprietar() || (CATEGORII_SESIZARE.includes(x.categorie) && x.apartament === S.cont.apartament);
const ePresedinte = () => S.cont?.rol === 'presedinte';
const poateInregistra = () => ['presedinte', 'r10'].includes(S.cont?.rol);
const poateLucra = (x) => ePresedinte() || x.responsabil === S.cont?.rol;
const poateNota = () => eAdministratie() && S.cont.rol !== 'cenzor';

function insignaStare(x) {
  return h('span', { class: `eticheta stare-${x.stare}` }, STARI[x.stare]);
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
      link('#/admin', 'home', 'Ale mele', 'admin'),
      link('#/admin/sesizare-noua', 'plus', 'Sesizare nouă', 'sesizare-noua'),
      link('#/', 'list', 'Toate', 'public'),
    ]
    : conectat()
    ? [
      link('#/admin', 'home', 'Sesizări', 'admin'),
      poateInregistra() && link('#/admin/sesizare-noua', 'plus', 'Sesizare', 'sesizare-noua'),
      link('#/admin/registru', 'notebook', 'Registru', 'registru'),
      participaLaSedinte() && link('#/admin/sedinte', 'calendar', 'Ședințe', 'sedinte'),
      ePresedinte() && link('#/admin/utilizatori', 'users', 'Utilizatori', 'utilizatori'),
      link('#/', 'list', 'Public', 'public'),
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
  Object.assign(S, { cont: null, token: null, reg: null, sed: null });
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
        ic(ICON_DOMENIU[x.domeniu] || 'help-circle')),
      h('div', { class: 'rand-cap' },
        h('span', { class: 'nr' }, `Nr. ${x.nr}`),
        h('span', { class: 'slab' }, fmtData(x.data)),
        x.categorie !== 'sesizare' && h('span', { class: 'eticheta' }, CATEGORII[x.categorie]),
        admin && h('span', { class: 'slab' }, `Ap. ${x.apartament}`),
        h('span', { class: 'dreapta' }, insignaTermen(x), insignaStare(x))),
      h('div', { class: 'rand-problema' }, x.problema),
      h('div', { class: 'rand-meta slab' },
        domeniu(x.domeniu)?.nume, ' · ', numeRol(x.responsabil),
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
    h('h1', {}, 'Sesizări ', selectAn(paginaPublica)),
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
  let x;
  try { x = (await S.reg.citesteAn(an)).inregistrari.find((i) => i.nr === nr); } catch (e) { return eroarePagina('admin', e); }
  if (!x || !vizibila(x)) return afiseaza('admin', h('p', { class: 'eroare' }, `Nr. ${nr}/${an} nu există.`), h('a', { href: '#/admin' }, '← Înapoi'));
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
    act.length && h('div', { class: 'card nu-tipari' }, h('h2', {}, 'Acțiuni'), h('div', { class: 'actiuni-col' }, act)),
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

// ---------- registru complet ----------

const COLOANE_CSV = [
  ['Nr.', (x) => x.nr], ['Data', (x) => fmtData(x.data)], ['Tip', (x) => TIPURI_DOC[x.tip]], ['Categorie', (x) => CATEGORII[x.categorie]],
  ['Emitent', (x) => (CATEGORII_SESIZARE.includes(x.categorie) ? `Ap. ${x.apartament}` : x.emitent)],
  ['Destinatar', (x) => (CATEGORII_SESIZARE.includes(x.categorie) ? numeRol(x.responsabil) : x.destinatar)],
  ['Conținut pe scurt', (x) => x.problema || x.continut], ['Conexat', (x) => x.conexat || (x.raspuns ? `${x.raspuns.nr}/${x.raspuns.an}` : '')],
  ['Stare', (x) => STARI[x.stare] || ''], ['Termen', (x) => fmtData(x.termen)], ['Amprentă', (x) => codVerificare(x.amprenta)],
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
  h('input', { name: 'dispozitiv', required: true, maxlength: 60, placeholder: 'ex. Telefon Samsung, Laptop birou', 'aria-label': 'Numele dispozitivului' }),
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
      h('p', { class: 'slab' }, 'Cu un passkey semnezi documente cu amprenta, fața, PIN-ul telefonului sau Windows Hello. Poți adăuga câte unul pentru fiecare dispozitiv. Trece codul fiecărei chei pe acordul semnat pe hârtie: dacă o cheie ar fi înlocuită pe ascuns, codul nu s-ar mai potrivi.'),
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
  const cls = { convocata: 'stare-repartizata', pv_redactat: 'stare-in_lucru', in_semnare: 'stare-raspuns_propus', semnata: 'stare-raspuns_trimis' }[st];
  return h('span', { class: `eticheta ${cls}` }, STARI_SEDINTA[st]);
}

function avertizariSedinta(s) {
  const out = [];
  const convocare = zileIntre(inceput(s), new Date(s.convocataLa));
  if (convocare < ZILE_CONVOCARE) {
    out.push(h('p', { class: 'avertizare' }, ic('alert-triangle'), ` Convocată cu ${Math.max(0, Math.floor(convocare))} zile înainte — legea cere cel puțin ${ZILE_CONVOCARE} zile (art. 55 din Legea nr. 196/2018).`));
  }
  if (stareSedinta(s) !== 'semnata' && new Date() > inceput(s)) {
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
          h('span', { class: `placa ${stareSedinta(s) === 'semnata' ? 'inchisa' : stareSedinta(s) === 'convocata' ? '' : 'in_lucru'}` }, ic('calendar')),
          h('div', { class: 'rand-cap' },
            h('span', { class: 'nr' }, `Ședința ${s.nr}/${S.an}`),
            h('span', {}, `${fmtData(s.data)} · ${s.ora}`),
            h('span', { class: 'dreapta' }, insignaSedinta(s))),
          h('div', { class: 'rand-problema' }, s.ordineZi.join(' · ')),
          h('div', { class: 'rand-meta slab' }, s.pv ? `Proces-verbal nr. ${s.pv.nr}/${S.an}` : `${s.confirmari.length} confirmări · ${s.prezenta.length} prezenți`)))))
      : h('p', { class: 'gol' }, `Nicio ședință în ${S.an}.`));
}

function formularConvocare(s, an) {
  const eroare = h('p', { class: 'eroare', role: 'alert', hidden: true });
  const avert = h('p', { class: 'avertizare', hidden: true });
  const verificaTermen = () => {
    if (!form.data.value || !form.ora.value) { avert.hidden = true; return; }
    const zile = zileIntre(new Date(`${form.data.value}T${form.ora.value}:00`), new Date());
    avert.hidden = zile >= ZILE_CONVOCARE;
    avert.textContent = `Atenție: până la ședință sunt mai puțin de ${ZILE_CONVOCARE} zile. Legea cere convocarea cu cel puțin ${ZILE_CONVOCARE} zile înainte (art. 55 din Legea nr. 196/2018).`;
  };
  const form = h('form', { class: 'card formular', oninput: verificaTermen, onsubmit: async (ev) => {
    ev.preventDefault();
    eroare.hidden = true;
    const c = { data: form.data.value, ora: form.ora.value, zoom: form.zoom.value, ordineZi: form.ordineZi.value.split('\n') };
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
  h('div', { class: 'grila' },
    h('label', {}, 'Data *', h('input', { type: 'date', name: 'data', required: true, value: s?.data || '' })),
    h('label', {}, 'Ora *', h('input', { type: 'time', name: 'ora', required: true, value: s?.ora || '19:00' })),
    h('label', { class: 'lat' }, 'Ordinea de zi * (câte un punct pe rând)', h('textarea', { name: 'ordineZi', rows: 5, required: true }, (s?.ordineZi || []).join('\n'))),
    h('label', { class: 'lat' }, 'Link Zoom', h('input', { name: 'zoom', value: s?.zoom || '', placeholder: 'https://zoom.us/j/…' }))),
  avert,
  s?.confirmari.length ? h('p', { class: 'avertizare' }, `Modificarea anulează cele ${s.confirmari.length} confirmări „Am luat la cunoștință”.`) : null,
  eroare,
  h('div', { class: 'actiuni' },
    h('button', { type: 'submit', class: 'principal' }, s ? 'Salvează convocarea' : 'Convoacă ședința'),
    h('a', { href: s ? `#/admin/sedinte/${an}/${s.nr}` : '#/admin/sedinte', class: 'buton' }, 'Renunță')));
  afiseaza('sedinte', h('h1', {}, s ? `Modifică convocarea ${s.nr}/${an}` : 'Convoacă o ședință'), form);
  verificaTermen();
}

// Procesul-verbal, afișat la fel în administrație și la avizier.
function vederePV(s, an) {
  const p = s.pv;
  const c = p.cvorum;
  return h('div', { class: 'card pv' },
    h('div', { class: 'doar-tipar antet-tipar' }, h('strong', {}, ASOCIATIA.nume), h('span', {}, ASOCIATIA.adresa)),
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
    participaLaSedinte() && !confirmat && h('button', { class: 'principal', onclick: actiune(async () => {
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
      h('div', { class: 'card nu-tipari' },
        h('h2', {}, ic('fingerprint'), ' Semnături'),
        h('div', { class: 'lista-semnaturi' }, s.pv.semnatari.map((u) => {
          const sem = s.semnaturi.find((x) => x.u === u);
          return sem ? blocSemnatura(sem, textPV) : h('div', { class: 'semnatura asteapta' }, ic('clock'), h('div', {}, h('strong', {}, eticheta(u)), h('span', { class: 'mic' }, 'nesemnat')));
        })),
        s.pv.semnatari.includes(eu) && !semnat && h('button', { class: 'principal', onclick: actiune(async () => {
          const sem = await semneazaCu(textPV);
          await S.sed.semneazaPV(an, nr, sem, (x) => hashB64u(continutPV(x, an)));
        }, 'Ai semnat procesul-verbal.') }, ic('fingerprint'), 'Semnează procesul-verbal'),
        stare === 'semnata' && h('p', { class: 'succes' }, 'Semnat de toți. Deciziile sunt afișate la ', h('a', { href: `#/avizier/${an}/${nr}` }, 'avizier'), '.'),
        eMembruComitet() && h('a', { href: `#/admin/sedinte/${an}/${nr}/pv`, class: 'buton' }, ic('pencil'),
          s.semnaturi.length ? 'Modifică (anulează semnăturile)' : 'Modifică procesul-verbal')));
  } else if (eMembruComitet()) {
    blocuri.push(h('div', { class: 'card' },
      h('h2', {}, ic('file-text'), ' Proces-verbal'),
      h('p', { class: 'slab' }, 'După ședință, orice membru al comitetului redactează procesul-verbal. Primește automat numărul următor din registrul unic de procese-verbale.'),
      h('a', { href: `#/admin/sedinte/${an}/${nr}/pv`, class: 'buton principal' }, ic('pencil'), 'Redactează procesul-verbal')));
  }

  afiseaza('sedinte',
    h('a', { href: '#/admin/sedinte', class: 'inapoi nu-tipari' }, ic('arrow-left'), 'Ședințe'),
    h('h1', {}, `Ședința ${nr}/${an}`),
    h('p', { class: 'insigne' }, insignaSedinta(s), s.pv && h('span', { class: 'eticheta' }, `PV nr. ${s.pv.nr}/${an}`)),
    avertizariSedinta(s),
    blocuri,
    blocIstoric(s));
}

function formularPV(s, an) {
  const membri = membriComitet();
  const prezentiMembri = membri.filter((m) => s.prezenta.some((p) => p.u === m.u)).map((m) => m.u);
  const cenzori = conturiCenzor().map((c) => c.u);
  const existent = s.pv;
  const participantiPV = existent?.participanti || s.prezenta.map((p) => p.u);
  const cv = existent?.cvorum || cvorum(membri.length, prezentiMembri.length);
  const semnatari = existent?.semnatari || [...new Set([...prezentiMembri, ...cenzori])];
  const eroare = h('p', { class: 'eroare', role: 'alert', hidden: true });

  const optiuniRol = (sel) => [h('option', { value: '' }, '—'), ...ROLURI.map((r) => h('option', { value: r.id, selected: r.id === sel }, numeRol(r.id)))];
  const decizieNoua = (d = {}) => {
    const el = h('div', { class: 'decizie editare' },
      h('label', {}, 'Decizia', h('textarea', { 'data-k': 'text', rows: 2, required: true }, d.text || '')),
      h('div', { class: 'grila-vot' },
        h('label', {}, 'Pentru', h('input', { 'data-k': 'pentru', type: 'number', min: 0, value: d.pentru ?? '', required: true })),
        h('label', {}, 'Împotrivă', h('input', { 'data-k': 'impotriva', type: 'number', min: 0, value: d.impotriva ?? 0, required: true })),
        h('label', {}, 'Abțineri', h('input', { 'data-k': 'abtineri', type: 'number', min: 0, value: d.abtineri ?? 0, required: true }))),
      h('div', { class: 'grila-vot' },
        h('label', {}, 'Responsabil', h('select', { 'data-k': 'responsabil' }, optiuniRol(d.responsabil))),
        h('label', {}, 'Termen', h('input', { 'data-k': 'termen', type: 'date', value: d.termen || '' }))),
      h('button', { type: 'button', class: 'link', onclick: () => el.remove() }, 'Șterge decizia'));
    return el;
  };
  const puncteSursa = existent?.puncte || s.ordineZi.map((titlu) => ({ titlu, discutii: '', decizii: [] }));
  const puncte = puncteSursa.map((pt) => {
    const lista = h('div', { class: 'decizii' }, (pt.decizii || []).map((d) => decizieNoua(d)));
    return h('fieldset', { class: 'card punct', 'data-titlu': pt.titlu },
      h('legend', {}, pt.titlu),
      h('label', {}, 'Discuții (pe scurt)', h('textarea', { 'data-k': 'discutii', rows: 3 }, pt.discutii || '')),
      lista,
      h('button', { type: 'button', onclick: () => lista.append(decizieNoua()) }, ic('plus'), 'Adaugă decizie'));
  });
  const observatii = h('textarea', { rows: 2, 'aria-label': 'Observații' }, existent?.observatii || '');

  const form = h('form', { class: 'formular', onsubmit: async (ev) => {
    ev.preventDefault();
    eroare.hidden = true;
    if (s.semnaturi.length && !confirm(`Procesul-verbal are ${s.semnaturi.length} semnături. Salvarea le anulează și toți trebuie să semneze din nou. Continui?`)) return;
    const pv = {
      participanti: participantiPV,
      cvorum: cv,
      semnatari,
      puncte: puncte.map((f) => ({
        titlu: f.dataset.titlu,
        discutii: f.querySelector('[data-k=discutii]').value.trim(),
        decizii: [...f.querySelectorAll('.decizie')].map((d) => {
          const v = (k) => d.querySelector(`[data-k=${k}]`).value;
          return { text: v('text').trim(), pentru: Number(v('pentru')), impotriva: Number(v('impotriva')), abtineri: Number(v('abtineri')), responsabil: v('responsabil'), termen: v('termen') };
        }),
      })),
      observatii: observatii.value.trim(),
    };
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      await S.sed.salveazaPV(an, s.nr, pv);
      S.mesaj = 'Procesul-verbal a fost salvat. Semnatarii îl pot semna acum.';
      mergi(`#/admin/sedinte/${an}/${s.nr}`);
    } catch (e) {
      btn.disabled = false;
      eroare.textContent = mesajEroare(e);
      eroare.hidden = false;
    }
  } },
  h('div', { class: 'card' },
    h('dl', { class: 'detalii' },
      h('dt', {}, 'Participanți'), h('dd', {}, participantiPV.map((u) => eticheta(u)).join(', ') || '— (nimeni nu a marcat prezența)'),
      h('dt', {}, 'Cvorum'), h('dd', {}, `${cv.prezenti} din ${cv.membri} membri (necesar ${cv.necesar}) — ${cv.intrunit ? 'întrunit' : 'neîntrunit'}`),
      h('dt', {}, 'Semnează'), h('dd', {}, semnatari.map((u) => eticheta(u)).join(', '))),
    h('p', { class: 'slab mic' }, 'Participanții și cvorumul se iau din butoanele „Sunt prezent”. Semnează membrii prezenți și cenzorul.')),
  puncte,
  h('div', { class: 'card' }, h('label', {}, 'Observații', observatii)),
  eroare,
  h('div', { class: 'actiuni' },
    h('button', { type: 'submit', class: 'principal' }, 'Salvează procesul-verbal'),
    h('a', { href: `#/admin/sedinte/${an}/${s.nr}`, class: 'buton' }, 'Renunță')));
  afiseaza('sedinte', h('h1', {}, existent ? `Proces-verbal nr. ${existent.nr}/${an}` : `Proces-verbal — ședința ${s.nr}/${an}`), form);
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
    h('p', { class: 'slab' }, 'Deciziile comitetului executiv, din procesele-verbale semnate electronic de membrii prezenți și de cenzor.'),
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
    h('div', { class: 'card' },
      h('h2', {}, ic('shield-check'), ' Semnături electronice'),
      h('div', { class: 'lista-semnaturi' }, s.semnaturi.map((sem) => blocSemnatura(sem, text))),
      h('p', { class: 'slab mic' }, `Cod de verificare: ${codVerificare(await hashB64u(text).then((x) => [...unb64u(x)].map((b) => b.toString(16).padStart(2, '0')).join('')))}`),
      h('button', { class: 'nu-tipari', onclick: () => window.print() }, 'Tipărește / salvează PDF')));
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
