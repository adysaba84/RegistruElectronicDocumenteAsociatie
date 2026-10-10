import { GitHubRepo, GitHubError, activitate } from './github.js?v=7';
import { Conturi, verificaParola, MIN_PAROLA } from './conturi.js?v=7';
import {
  Registru, CATEGORII, CATEGORII_SESIZARE, STARI, STARI_FINALE, TIPURI_DOC, CANALE, OCUPARE, MAX_FISIER,
  termenInfo, amprenta, continutSemnat, codVerificare, verificaLant,
} from './store.js?v=7';
import {
  ASOCIATIA, REPO_DATE, REPO_PUBLIC, ROLURI, DOMENII, APARTAMENTE, TERMEN_RASPUNS_ZILE, apiBase, urlPublic,
} from './config.js?v=7';

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
  const link = (hash, text, id) => h('a', { href: hash, class: activ === id ? 'activ' : null }, text);
  const nav = eProprietar()
    ? [
      link('#/admin', 'Sesizările mele', 'admin'),
      link('#/admin/sesizare-noua', '+ Sesizare nouă', 'sesizare-noua'),
      link('#/', 'Toate sesizările', 'public'),
    ]
    : conectat()
    ? [
      link('#/admin', 'Sesizări', 'admin'),
      poateInregistra() && link('#/admin/sesizare-noua', '+ Sesizare', 'sesizare-noua'),
      link('#/admin/registru', 'Registru', 'registru'),
      poateInregistra() && link('#/admin/document-nou', '+ Document', 'document-nou'),
      ePresedinte() && link('#/admin/utilizatori', 'Utilizatori', 'utilizatori'),
      link('#/', 'Pagina publică', 'public'),
    ]
    : [
      link('#/', 'Sesizări', 'public'),
      link('#/cum', 'Cum depun o sesizare', 'cum'),
      link('#/admin', 'Conectare', 'login'),
    ];
  const meniu = h('nav', { id: 'meniu' }, nav);
  return [
    h('header', { class: 'antet' },
      h('a', { href: conectat() ? '#/admin' : '#/', class: 'titlu' },
        h('strong', {}, ASOCIATIA.nume),
        h('span', {}, eAdministratie() ? 'Registru electronic — administrație' : 'Registru electronic de sesizări')),
      h('button', { class: 'meniu-buton', 'aria-label': 'Meniu', 'aria-expanded': 'false', onclick: (ev) => {
        const deschis = meniu.classList.toggle('deschis');
        ev.currentTarget.setAttribute('aria-expanded', String(deschis));
      } }, '☰'),
      meniu,
      conectat() && h('div', { class: 'utilizator' },
        h('span', {}, eticheta(S.cont.u)),
        h('a', { href: '#/admin/parola' }, 'Parola'),
        h('button', { class: 'link', onclick: iesire }, 'Ieșire'))),
    h('main', {},
      S.mesaj && h('p', { class: 'succes', role: 'status' }, S.mesaj),
      S.reg?.eroarePublicare && eAdministratie() && h('p', { class: 'avertizare' },
        `Pagina publică nu s-a putut actualiza (${mesajEroare(S.reg.eroarePublicare)}). Deschide o sesizare și apasă „Republică”.`),
      continut),
    h('footer', { class: 'subsol' }, `${ASOCIATIA.nume} · ${ASOCIATIA.adresa} · ${ASOCIATIA.email}`),
  ];
}

function afiseaza(activ, ...continut) {
  $app.replaceChildren(...cadru(activ, ...continut));
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
  Object.assign(S, { cont: null, token: null, reg: null });
  S.filtre = { text: '', stare: '', domeniu: '', rapid: '' };
  mergi('#/');
}

// ---------- partea publică ----------

async function citestePublic(an) {
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
    h('div', { class: 'bara' },
      h('h1', {}, 'Sesizări ', selectAn(paginaPublica)),
      h('a', { href: '#/cum', class: 'buton principal' }, 'Cum depun o sesizare')),
    h('div', { class: 'contoare' },
      h('div', { class: 'contor' }, h('strong', {}, date.sesizari.length), h('span', {}, 'înregistrate')),
      h('div', { class: 'contor' }, h('strong', {}, deschise), h('span', {}, 'în lucru')),
      h('div', { class: 'contor' }, h('strong', {}, date.sesizari.length - deschise), h('span', {}, 'cu răspuns'))),
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
        : [h('p', {}, 'Conectează-te cu contul apartamentului (de pe biletul primit de la asociație). Sesizarea se salvează direct în registru și primește imediat număr de înregistrare; apoi urmărești răspunsul în „Sesizările mele”.'),
          h('a', { href: '#/admin', class: 'buton principal' }, 'Conectare apartament')]),
    !eProprietar() && h('p', { class: 'slab nu-tipari' }, 'Nu ai încă cont? Poți completa formularul de mai jos, care se trimite pe e-mail asociației.'),
    !eProprietar() && form,
    h('div', { class: 'doar-tipar antet-tipar' }, h('strong', {}, ASOCIATIA.nume), h('span', {}, ASOCIATIA.adresa)),
    previzualizare,
    h('p', { class: 'doar-tipar' }, 'Semnătura: ______________________'));
}

async function verificareSemnatura(x, an) {
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
    h('p', { class: 'slab mic' }, `Semnat electronic de ${eticheta(r.semnatDe || 'presedinte')}${r.semnatLa ? `, ${fmtDataOra(r.semnatLa)}` : ''}.`),
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
    h('a', { href: '#/', class: 'inapoi nu-tipari' }, '← Toate sesizările'),
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
  h('p', { class: 'slab' }, 'Cu contul apartamentului (ex. ap12) sau cu contul de administrație, de pe biletul primit de la asociație.'),
  eroare && h('p', { class: 'eroare', role: 'alert' }, eroare),
  h('label', {}, 'Utilizator', h('input', { name: 'u', required: true, autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', placeholder: 'ex. ap12' })),
  h('label', {}, 'Parola', h('input', { name: 'p', type: 'password', required: true, autocomplete: 'current-password' })),
  h('button', { type: 'submit', class: 'principal' }, 'Conectare'),
  h('p', { class: 'slab mic' }, 'Ai uitat parola? Cere președintelui o parolă temporară nouă.'));
  afiseaza('login', h('div', { class: 'centrat' }, form));
  form.u.focus();
}

async function intra(cont, token) {
  S.cont = cont;
  S.token = token;
  const gh = new GitHubRepo({ apiBase: API, token, repo: REPO_DATE });
  const ghPublic = new GitHubRepo({ apiBase: API, token, repo: REPO_PUBLIC });
  S.reg = new Registru(gh, ghPublic, cont);
  await Promise.all([ghPublic.info(), S.reg.init()]);
  S.ani = await S.reg.ani();
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
    h('span', {}, `Cont: ${b.rol === 'proprietar' ? `Apartamentul ${b.apartament}` : numeRol(b.rol)}`),
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
          h('button', { class: 'principal', onclick: actiune(() => S.reg.semneazaRaspuns(an, nr), (r) => `Răspuns semnat electronic și înregistrat cu nr. ${r.raspuns.nr} din ${fmtData(r.raspuns.data)}.`) }, 'Semnează și înregistrează răspunsul'),
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
    act.push(h('button', { onclick: actiune(() => S.reg.publica(an).then(() => { S.reg.eroarePublicare = null; }), 'Pagina publică a fost actualizată.') }, 'Republică'));
  }
  if (poateNota()) {
    const nota = h('textarea', { rows: 2, placeholder: 'Notă internă (nu apare public)…', 'aria-label': 'Notă internă' });
    const fis = h('input', { type: 'file', multiple: true, 'aria-label': 'Fișiere' });
    act.push(h('div', { class: 'nota' }, nota, fis,
      h('button', { onclick: (ev) => (nota.value.trim() || fis.files.length) && actiune(() => S.reg.adaugaNota(an, nr, nota.value, [...fis.files]), 'Nota a fost adăugată.')(ev) }, 'Adaugă notă / fișiere')));
  }

  afiseaza('admin',
    h('a', { href: '#/admin', class: 'inapoi nu-tipari' }, eProprietar() ? '← Sesizările mele' : '← Sesizări'),
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
    h('a', { href: '#/admin/registru', class: 'inapoi' }, '← Registru'),
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
  try { S.conturi = await Conturi.incarca(API, S.token); } catch (e) { return eroarePagina('utilizatori', e); }
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
  const progres = h('span', { class: 'slab mic' });
  const nefolosite = S.conturi.utilizatori.filter((c) => c.rol === 'proprietar' && c.temporara).length;
  const lipsa = APARTAMENTE - S.conturi.utilizatori.filter((c) => c.rol === 'proprietar').length;
  const bileteApartamente = h('div', { class: 'card' },
    h('h2', {}, 'Conturile apartamentelor'),
    h('p', {}, `${APARTAMENTE - lipsa - nefolosite} din ${APARTAMENTE} apartamente și-au ales parola.`
      + (lipsa ? ` ${lipsa} conturi nu sunt încă create.` : '')),
    h('p', { class: 'slab mic' }, 'Parolele temporare nu se pot reafișa. Butonul generează parole noi pentru apartamentele care nu s-au conectat încă (ce au deja parola lor rămân neatinse) și afișează biletele de tipărit.'),
    h('div', { class: 'actiuni' },
      h('button', { class: 'principal', onclick: actiune(async () => {
        if (!confirm('Generezi bilete noi pentru apartamentele care nu și-au ales încă parola? Biletele vechi nefolosite nu vor mai funcționa.')) return;
        const parole = await S.conturi.reseteazaMai(S.token, (c) => c.rol === 'proprietar' && c.temporara, (i, n) => { progres.textContent = `${i}/${n}`; });
        arataBilete(parole.filter((b) => b.rol === 'proprietar'), 'Bilete pentru apartamente — se afișează o singură dată. Tipărește-le și pune-le în cutiile poștale.');
      }) }, 'Generează biletele apartamentelor'),
      progres));
  const randuri = S.conturi.utilizatori.filter((c) => c.rol !== 'proprietar').map((c) => {
    const ap = h('select', { 'aria-label': `Apartament ${c.u}`, onchange: actiune(async () => {
      await S.conturi.seteazaApartament(S.token, c.u, ap.value ? Number(ap.value) : null);
    }) }, h('option', { value: '' }, '—'), Array.from({ length: APARTAMENTE }, (_, i) => h('option', { value: i + 1, selected: c.apartament === i + 1 }, `Ap. ${i + 1}`)));
    return h('li', { class: 'rand-utilizator' },
      h('div', {}, h('strong', {}, rol(c.rol)?.nume || c.rol), h('span', { class: 'slab cod' }, c.u)),
      h('label', { class: 'inline' }, 'Apartament', ap),
      h('span', { class: `eticheta ${c.temporara ? 'termen-aproape' : 'stare-raspuns_trimis'}` }, c.temporara ? 'parolă temporară' : 'parolă schimbată'),
      c.u !== S.cont.u && h('button', { onclick: actiune(async () => {
        if (!confirm(`Resetezi parola pentru ${c.u}? Parola veche nu va mai funcționa.`)) return;
        const parola = await S.conturi.reseteaza(S.token, c.u);
        arataBilete([{ u: c.u, rol: c.rol, apartament: c.apartament, parola }], `Parolă temporară nouă pentru ${c.u}. Se afișează o singură dată.`);
      }) }, 'Resetează parola'));
  });
  const reseteazaAp = h('form', { class: 'rand-actiune', onsubmit: (ev) => {
    ev.preventDefault();
    const u = `ap${String(reseteazaAp.ap.value).padStart(2, '0')}`;
    actiune(async () => {
      if (!S.conturi.gaseste(u)) throw new Error(`Contul ${u} nu există încă — folosește „Generează biletele apartamentelor”.`);
      if (!confirm(`Resetezi parola pentru ${u}?`)) return;
      const parola = await S.conturi.reseteaza(S.token, u);
      arataBilete([{ u, rol: 'proprietar', apartament: Number(reseteazaAp.ap.value), parola }], `Parolă temporară nouă pentru ${u}. Se afișează o singură dată.`);
    })({ currentTarget: reseteazaAp.querySelector('button') });
  } },
  h('select', { name: 'ap', 'aria-label': 'Apartament' }, Array.from({ length: APARTAMENTE }, (_, i) => h('option', { value: i + 1 }, `Ap. ${i + 1}`))),
  h('button', { type: 'submit' }, 'Resetează parola apartamentului'));
  bileteApartamente.append(reseteazaAp);
  afiseaza('utilizatori',
    h('h1', {}, 'Utilizatori'),
    h('p', { class: 'slab' }, 'Fiecare rol se atribuie unui apartament (nu unei persoane). Apartamentul apare lângă rol în aplicație și pe pagina publică.'),
    bilet,
    h('h2', {}, 'Administrație'),
    h('ul', { class: 'lista-utilizatori card' }, randuri),
    bileteApartamente);
}

// ---------- rutare ----------

async function ruta() {
  document.getElementById('meniu')?.classList.remove('deschis');
  const [cale] = location.hash.replace(/^#/, '').split('?');
  const p = cale.split('/').filter(Boolean);

  if (p[0] !== 'admin') {
    if (p[0] === 'cum') return paginaCum();
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
