import { GitHubRepo, GitHubError } from './github.js';
import { Registru, TIPURI, STARI, MAX_FISIER, azi } from './store.js';
import { REPO_DATE_IMPLICIT, apiBase } from './config.js';

const $app = document.getElementById('app');
const CHEIE_SESIUNE = 'registru.sesiune';

const stare = {
  reg: null,
  info: null,
  an: new Date().getFullYear(),
  ani: [],
  date: null,
  filtre: { text: '', tip: '', stare: '', de: '', pana: '' },
  mesaj: null,
};

// ---------- utilitare DOM (tot textul trece prin textContent, nu innerHTML) ----------

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
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const fmtData = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('.') : '');
const fmtDataOra = (iso) => (iso ? new Date(iso).toLocaleString('ro-RO') : '');
const fmtMarime = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

function mesajEroare(e) {
  if (e instanceof GitHubError) {
    if (e.status === 401) return 'Tokenul este invalid sau a expirat. Conectează-te din nou cu un token nou.';
    if (e.status === 403) return `GitHub a refuzat operația (fără drept de scriere sau limită depășită): ${e.message}`;
    if (e.status === 404) return 'Repo-ul de date nu a fost găsit sau tokenul nu are acces la el.';
    return `Eroare GitHub (${e.status}): ${e.message}`;
  }
  if (e instanceof TypeError) return 'Nu s-a putut contacta GitHub. Verifică conexiunea la internet.';
  return e.message || String(e);
}

function citesteSesiune() {
  try {
    return JSON.parse(localStorage.getItem(CHEIE_SESIUNE) || sessionStorage.getItem(CHEIE_SESIUNE) || 'null');
  } catch { return null; }
}

function scrieSesiune(s, retine) {
  try {
    (retine ? localStorage : sessionStorage).setItem(CHEIE_SESIUNE, JSON.stringify(s));
  } catch { /* stocare indisponibilă — sesiunea ține doar cât e pagina deschisă */ }
}

function stergeSesiune() {
  try { localStorage.removeItem(CHEIE_SESIUNE); sessionStorage.removeItem(CHEIE_SESIUNE); } catch { /* */ }
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

// ---------- conectare ----------

async function conecteaza(s) {
  const gh = new GitHubRepo({ apiBase: apiBase(), token: s.token, repo: s.repo });
  const reg = new Registru(gh, s.nume);
  stare.info = await reg.init();
  stare.reg = reg;
  stare.ani = await reg.ani();
}

function ecranConectare(eroare = '') {
  const s = citesteSesiune() || {};
  const form = h('form', { class: 'card conectare', onsubmit: async (ev) => {
    ev.preventDefault();
    const fd = new FormData(form);
    const sesiune = {
      repo: fd.get('repo').trim(),
      token: fd.get('token').trim(),
      nume: fd.get('nume').trim(),
    };
    const btn = form.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Se conectează…';
    try {
      await conecteaza(sesiune);
      stergeSesiune();
      scrieSesiune(sesiune, fd.get('retine') === 'on');
      mergi('#/registru');
    } catch (e) {
      ecranConectare(mesajEroare(e));
    }
  } },
  h('h1', {}, 'Registru electronic de documente'),
  h('p', { class: 'slab' }, 'Asociația de proprietari — acces rezervat administrației.'),
  eroare && h('p', { class: 'eroare', role: 'alert' }, eroare),
  h('label', {}, 'Numele tău (apare în registru la fiecare înregistrare)',
    h('input', { name: 'nume', required: true, autocomplete: 'name', value: s.nume || '' })),
  h('label', {}, 'Token GitHub',
    h('input', { name: 'token', type: 'password', required: true, autocomplete: 'off', placeholder: 'github_pat_…' })),
  h('details', {},
    h('summary', {}, 'Setări avansate'),
    h('label', {}, 'Repo de date (privat)',
      h('input', { name: 'repo', required: true, value: s.repo || REPO_DATE_IMPLICIT, pattern: '[\\w.-]+/[\\w.-]+' }))),
  h('label', { class: 'bifa' }, h('input', { type: 'checkbox', name: 'retine', checked: true }), 'Ține-mă minte pe acest dispozitiv'),
  h('button', { type: 'submit', class: 'principal' }, 'Conectare'),
  h('p', { class: 'slab mic' }, 'Nu ai token? Vezi ',
    h('a', { href: 'https://github.com/adysaba84/RegistruElectronicDocumenteAsociatie#token', target: '_blank', rel: 'noopener' }, 'instrucțiunile'), '.'));
  $app.replaceChildren(h('main', { class: 'centrat' }, form));
  form.querySelector(s.nume ? '[name=token]' : '[name=nume]').focus();
}

// ---------- cadru pagină ----------

function cadru(activ, ...continut) {
  const cfg = stare.reg.config;
  const link = (hash, text, id) => h('a', { href: hash, class: activ === id ? 'activ' : null }, text);
  const doarCitire = !stare.info?.permissions?.push;
  return [
    h('header', { class: 'antet' },
      h('div', { class: 'titlu' },
        h('strong', {}, cfg.asociatie.nume || 'Asociația de proprietari'),
        h('span', { class: 'slab' }, 'Registru electronic de documente')),
      h('nav', {},
        link('#/registru', 'Registru', 'registru'),
        !doarCitire && link('#/nou', '+ Înregistrare nouă', 'nou'),
        link('#/setari', 'Setări', 'setari')),
      h('div', { class: 'utilizator' },
        h('span', {}, stare.reg.utilizator),
        h('button', { class: 'link', onclick: () => { stergeSesiune(); stare.reg = null; ecranConectare(); } }, 'Ieșire'))),
    h('main', {},
      doarCitire && h('p', { class: 'avertizare' }, 'Tokenul tău are doar drept de citire — nu poți adăuga sau modifica înregistrări.'),
      stare.mesaj && h('p', { class: 'succes', role: 'status' }, stare.mesaj),
      continut),
  ];
}

function afiseaza(activ, ...continut) {
  $app.replaceChildren(...cadru(activ, ...continut));
  stare.mesaj = null;
  window.scrollTo(0, 0);
}

function seIncarca(activ) {
  afiseaza(activ, h('p', { class: 'incarcare' }, 'Se încarcă…'));
}

function eroarePagina(activ, e) {
  afiseaza(activ, h('p', { class: 'eroare', role: 'alert' }, mesajEroare(e)),
    h('button', { onclick: () => ruta() }, 'Reîncearcă'));
}

// ---------- registru (listă) ----------

const COLOANE_CSV = [
  ['Nr.', (x) => x.nr], ['Data', (x) => fmtData(x.data)], ['Tip', (x) => TIPURI[x.tip]],
  ['Nr. doc. extern', (x) => x.nrDocExtern], ['Data doc. extern', (x) => fmtData(x.dataDocExtern)],
  ['Emitent', (x) => x.emitent], ['Destinatar', (x) => x.destinatar], ['Conținut pe scurt', (x) => x.continut],
  ['Repartizat', (x) => x.repartizat], ['Termen', (x) => fmtData(x.termen)], ['Conexat la nr.', (x) => x.conexat],
  ['Dosar', (x) => x.dosar], ['Data expedierii', (x) => fmtData(x.dataExpedierii)], ['Stare', (x) => STARI[x.stare]],
  ['Observații', (x) => [x.observatii, x.motivAnulare && `Motiv anulare: ${x.motivAnulare}`].filter(Boolean).join(' | ')],
  ['Fișiere', (x) => (x.fisiere || []).map((f) => f.nume).join(', ')],
];

function exportCsv(lista) {
  const cel = (v) => {
    let s = v === undefined || v === null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // previne formule în Excel
    return `"${s.replace(/"/g, '""')}"`;
  };
  const randuri = [COLOANE_CSV.map(([t]) => cel(t)).join(';')]
    .concat(lista.map((x) => COLOANE_CSV.map(([, f]) => cel(f(x))).join(';')));
  descarcaBlob(new Blob(['﻿' + randuri.join('\r\n')], { type: 'text/csv;charset=utf-8' }), `registru-${stare.an}.csv`);
}

function filtreaza(lista) {
  const f = stare.filtre;
  const text = f.text.toLowerCase();
  return lista.filter((x) => {
    if (f.tip && x.tip !== f.tip) return false;
    if (f.stare && x.stare !== f.stare) return false;
    if (f.de && x.data < f.de) return false;
    if (f.pana && x.data > f.pana) return false;
    if (text) {
      const tot = [x.nr, x.emitent, x.destinatar, x.continut, x.repartizat, x.nrDocExtern, x.dosar, x.observatii,
        ...(x.fisiere || []).map((fi) => fi.nume)].join(' ').toLowerCase();
      if (!tot.includes(text)) return false;
    }
    return true;
  }).sort((a, b) => b.nr - a.nr);
}

async function paginaRegistru() {
  seIncarca('registru');
  try {
    stare.date = await stare.reg.citesteAn(stare.an);
  } catch (e) { return eroarePagina('registru', e); }

  const zona = h('div', { class: 'tabel-zona' });
  const contor = h('span', { class: 'slab' });
  const astazi = azi();

  const deseneaza = () => {
    const lista = filtreaza(stare.date.inregistrari);
    contor.textContent = `${lista.length} din ${stare.date.inregistrari.length} înregistrări`;
    if (!lista.length) {
      zona.replaceChildren(h('p', { class: 'gol' }, stare.date.inregistrari.length
        ? 'Nicio înregistrare nu corespunde filtrelor.' : `Registrul pe ${stare.an} este gol.`));
      return;
    }
    zona.replaceChildren(h('table', { class: 'registru' },
      h('thead', {}, h('tr', {}, ['Nr.', 'Data', 'Tip', 'Emitent / Destinatar', 'Conținut pe scurt', 'Repartizat', 'Termen', 'Stare', '']
        .map((t) => h('th', {}, t)))),
      h('tbody', {}, lista.map((x) => {
        const intarziat = x.stare === 'deschis' && x.termen && x.termen < astazi;
        return h('tr', { class: `${x.stare === 'anulat' ? 'anulat' : ''} clic`, tabindex: '0',
          onclick: () => mergi(`#/doc/${stare.an}/${x.nr}`),
          onkeydown: (ev) => { if (ev.key === 'Enter') mergi(`#/doc/${stare.an}/${x.nr}`); } },
        h('td', { class: 'nr' }, x.nr),
        h('td', { class: 'nowrap' }, fmtData(x.data)),
        h('td', {}, h('span', { class: `eticheta tip-${x.tip}` }, TIPURI[x.tip])),
        h('td', {}, x.tip === 'iesire' ? x.destinatar : x.emitent),
        h('td', { class: 'continut' }, x.continut),
        h('td', {}, x.repartizat),
        h('td', { class: `nowrap ${intarziat ? 'intarziat' : ''}` }, fmtData(x.termen)),
        h('td', {}, h('span', { class: `eticheta stare-${x.stare}` }, STARI[x.stare])),
        h('td', { class: 'atasat', title: (x.fisiere || []).length ? `${x.fisiere.length} fișier(e)` : '' },
          (x.fisiere || []).length ? `📎${x.fisiere.length}` : ''));
      }))));
  };

  const camp = (cheie, el) => {
    el.value = stare.filtre[cheie];
    el.addEventListener('input', () => { stare.filtre[cheie] = el.value; deseneaza(); });
    return el;
  };

  const optiuni = (obj, toate) => [h('option', { value: '' }, toate), ...Object.entries(obj).map(([v, t]) => h('option', { value: v }, t))];

  afiseaza('registru',
    h('div', { class: 'bara' },
      h('h2', {}, 'Registrul de intrare-ieșire pe anul ',
        h('select', { class: 'an', 'aria-label': 'Anul', onchange: (ev) => { stare.an = Number(ev.target.value); paginaRegistru(); } },
          stare.ani.map((a) => h('option', { value: a, selected: a === stare.an }, a)))),
      h('div', { class: 'actiuni' },
        h('button', { onclick: () => exportCsv(filtreaza(stare.date.inregistrari).reverse()) }, 'Export Excel (CSV)'),
        h('button', { onclick: () => window.print() }, 'Tipărește'))),
    h('div', { class: 'filtre' },
      camp('text', h('input', { type: 'search', placeholder: 'Caută (nr., emitent, conținut…)', 'aria-label': 'Caută' })),
      camp('tip', h('select', { 'aria-label': 'Tip' }, optiuni(TIPURI, 'Toate tipurile'))),
      camp('stare', h('select', { 'aria-label': 'Stare' }, optiuni(STARI, 'Toate stările'))),
      h('label', { class: 'inline' }, 'De la', camp('de', h('input', { type: 'date' }))),
      h('label', { class: 'inline' }, 'Până la', camp('pana', h('input', { type: 'date' }))),
      contor),
    h('div', { class: 'doar-tipar' },
      h('h1', {}, stare.reg.config.asociatie.nume),
      h('p', {}, [stare.reg.config.asociatie.adresa, stare.reg.config.asociatie.cif && `CIF ${stare.reg.config.asociatie.cif}`].filter(Boolean).join(' · ')),
      h('h2', {}, `Registru de intrare-ieșire — anul ${stare.an}`)),
    zona);
  deseneaza();
}

// ---------- detaliu document ----------

async function deschideFisier(f) {
  const fereastra = window.open('', '_blank'); // deschisă sincron, ca să nu fie blocată
  try {
    const blob = await stare.reg.descarca(f);
    const url = URL.createObjectURL(blob);
    if (fereastra) fereastra.location = url; else descarcaBlob(blob, f.nume);
    setTimeout(() => URL.revokeObjectURL(url), 300000);
  } catch (e) {
    fereastra?.close();
    alert(mesajEroare(e));
  }
}

async function paginaDocument(an, nr) {
  seIncarca('registru');
  let x;
  try {
    const date = await stare.reg.citesteAn(an);
    x = date.inregistrari.find((i) => i.nr === nr);
  } catch (e) { return eroarePagina('registru', e); }
  if (!x) return afiseaza('registru', h('p', { class: 'eroare' }, `Nr. ${nr}/${an} nu există.`), h('a', { href: '#/registru' }, '← Înapoi la registru'));

  const poateScrie = stare.info?.permissions?.push;
  const actiune = async (btn, fn, mesaj) => {
    btn.disabled = true;
    try {
      await fn();
      stare.mesaj = mesaj;
      paginaDocument(an, nr);
    } catch (e) {
      btn.disabled = false;
      alert(mesajEroare(e));
    }
  };

  const rand = (eticheta, valoare) => (valoare ? [h('dt', {}, eticheta), h('dd', {}, valoare)] : null);
  const repo = stare.reg.gh.repo;

  afiseaza('registru',
    h('a', { href: '#/registru', class: 'inapoi' }, '← Registru'),
    h('div', { class: 'bara' },
      h('h2', {}, `Nr. ${x.nr} din ${fmtData(x.data)} `,
        h('span', { class: `eticheta tip-${x.tip}` }, TIPURI[x.tip]), ' ',
        h('span', { class: `eticheta stare-${x.stare}` }, STARI[x.stare])),
      poateScrie && x.stare !== 'anulat' && h('div', { class: 'actiuni' },
        h('button', { onclick: () => mergi(`#/doc/${an}/${nr}/editare`) }, 'Editează'),
        x.tip === 'intrare' && h('button', { onclick: () => mergi(`#/nou?raspuns=${an}/${nr}`) }, 'Răspunde'),
        x.stare === 'deschis'
          ? h('button', { class: 'principal', onclick: (ev) => actiune(ev.target, () => stare.reg.schimbaStare(an, nr, 'rezolvat'), 'Marcat ca rezolvat.') }, 'Marchează rezolvat')
          : h('button', { onclick: (ev) => actiune(ev.target, () => stare.reg.schimbaStare(an, nr, 'deschis'), 'Redeschis.') }, 'Redeschide'),
        h('button', { class: 'pericol', onclick: (ev) => {
          const motiv = prompt('Motivul anulării (numărul rămâne rezervat, înregistrarea nu se șterge):');
          if (motiv && motiv.trim()) actiune(ev.target, () => stare.reg.schimbaStare(an, nr, 'anulat', motiv.trim()), 'Înregistrare anulată.');
        } }, 'Anulează'))),
    h('div', { class: 'card' },
      h('dl', { class: 'detalii' },
        rand('Conținut pe scurt', x.continut),
        rand('Emitent (de unde provine)', x.emitent),
        rand('Destinatar', x.destinatar),
        rand('Nr. / data documentului', [x.nrDocExtern, fmtData(x.dataDocExtern)].filter(Boolean).join(' din ')),
        rand('Repartizat', x.repartizat),
        rand('Termen de rezolvare', fmtData(x.termen)),
        rand('Conexat la nr.', x.conexat),
        rand('Indicativ dosar', x.dosar),
        rand('Data expedierii', fmtData(x.dataExpedierii)),
        rand('Observații', x.observatii),
        rand('Motivul anulării', x.motivAnulare),
        rand('Înregistrat de', `${x.creatDe} — ${fmtDataOra(x.creatLa)}`),
        rand('Ultima modificare', x.modificatLa && `${x.modificatDe} — ${fmtDataOra(x.modificatLa)}`))),
    h('div', { class: 'card' },
      h('h3', {}, 'Fișiere atașate'),
      (x.fisiere || []).length
        ? h('ul', { class: 'fisiere' }, x.fisiere.map((f) => h('li', {},
          h('span', {}, f.nume, ' ', h('span', { class: 'slab' }, `(${fmtMarime(f.marime)})`)),
          h('span', { class: 'actiuni' },
            h('button', { onclick: () => deschideFisier(f) }, 'Deschide'),
            h('button', { onclick: async () => { try { descarcaBlob(await stare.reg.descarca(f), f.nume); } catch (e) { alert(mesajEroare(e)); } } }, 'Descarcă')))))
        : h('p', { class: 'slab' }, 'Niciun fișier atașat.')),
    h('p', { class: 'mic slab' },
      h('a', { href: `https://github.com/${repo}/commits/HEAD/registru/${an}.json`, target: '_blank', rel: 'noopener' }, 'Istoricul complet al modificărilor (GitHub)')));
}

// ---------- formular înregistrare / editare ----------

async function paginaFormular({ an, nr, raspuns } = {}) {
  const editare = nr !== undefined;
  const activ = editare ? 'registru' : 'nou';
  seIncarca(activ);
  let x = { tip: 'intrare' };
  try {
    if (editare) {
      x = (await stare.reg.citesteAn(an)).inregistrari.find((i) => i.nr === nr);
      if (!x) throw new Error(`Nr. ${nr}/${an} nu există.`);
    } else if (raspuns) {
      const [ra, rn] = raspuns.split('/').map(Number);
      const orig = (await stare.reg.citesteAn(ra)).inregistrari.find((i) => i.nr === rn);
      if (orig) {
        x = { tip: 'iesire', destinatar: orig.emitent, conexat: `${orig.nr}/${fmtData(orig.data)}`, dosar: orig.dosar,
          continut: `Răspuns la ${orig.continut || ''}`.slice(0, 300) };
      }
    }
  } catch (e) { return eroarePagina(activ, e); }

  const compartimente = stare.reg.config.compartimente || [];
  const v = (k) => x[k] || '';
  const fisiere = h('input', { type: 'file', name: 'fisiere', multiple: true, accept: '.pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.odt,.txt' });
  const eroare = h('p', { class: 'eroare', role: 'alert', hidden: true });
  const camp = (eticheta, input, cls = '') => h('label', { class: cls }, eticheta, input);

  const form = h('form', { class: 'card formular', onsubmit: async (ev) => {
    ev.preventDefault();
    const fd = new FormData(form);
    const campuri = Object.fromEntries([...fd.entries()].filter(([k]) => k !== 'fisiere'));
    const noi = [...fisiere.files];
    const mare = noi.find((f) => f.size > MAX_FISIER);
    eroare.hidden = true;
    if (campuri.tip === 'intrare' && !campuri.emitent.trim()) { eroare.textContent = 'Completează emitentul (de unde provine documentul).'; eroare.hidden = false; return; }
    if (campuri.tip === 'iesire' && !campuri.destinatar.trim()) { eroare.textContent = 'Completează destinatarul.'; eroare.hidden = false; return; }
    if (mare) { eroare.textContent = `„${mare.name}” depășește 25 MB. Scanează la o rezoluție mai mică.`; eroare.hidden = false; return; }
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = noi.length ? 'Se urcă fișierele și se salvează…' : 'Se salvează…';
    try {
      const rez = editare
        ? await stare.reg.editeaza(an, nr, campuri, noi)
        : await stare.reg.adauga(campuri, noi);
      stare.mesaj = editare ? 'Modificările au fost salvate.'
        : `Document înregistrat cu nr. ${rez.intrare.nr} din ${fmtData(rez.intrare.data)}.`;
      if (!stare.ani.includes(rez.an)) stare.ani = await stare.reg.ani();
      mergi(`#/doc/${rez.an}/${rez.intrare.nr}`);
    } catch (e) {
      btn.disabled = false;
      btn.textContent = editare ? 'Salvează modificările' : 'Înregistrează';
      eroare.textContent = mesajEroare(e);
      eroare.hidden = false;
    }
  } },
  h('fieldset', { class: 'tip' }, h('legend', {}, 'Tipul documentului'),
    Object.entries(TIPURI).map(([val, t]) => h('label', { class: 'bifa' },
      h('input', { type: 'radio', name: 'tip', value: val, checked: x.tip === val, required: true }), t))),
  h('div', { class: 'grila' },
    camp('Emitent — de unde provine documentul', h('input', { name: 'emitent', value: v('emitent'), placeholder: 'ex. Ion Popescu, ap. 12 / E.ON / Primăria' })),
    camp('Destinatar', h('input', { name: 'destinatar', value: v('destinatar') })),
    camp('Nr. documentului (al emitentului)', h('input', { name: 'nrDocExtern', value: v('nrDocExtern') })),
    camp('Data documentului', h('input', { type: 'date', name: 'dataDocExtern', value: v('dataDocExtern') })),
    camp('Conținutul pe scurt *', h('textarea', { name: 'continut', required: true, rows: 3, maxlength: 2000 }, v('continut')), 'lat'),
    camp('Repartizat către', h('input', { name: 'repartizat', value: v('repartizat'), list: 'compartimente' })),
    camp('Termen de rezolvare', h('input', { type: 'date', name: 'termen', value: v('termen') })),
    camp('Conexat la nr. (document legat)', h('input', { name: 'conexat', value: v('conexat'), placeholder: 'ex. 12/05.10.2026' })),
    camp('Indicativ dosar', h('input', { name: 'dosar', value: v('dosar') })),
    camp('Data expedierii', h('input', { type: 'date', name: 'dataExpedierii', value: v('dataExpedierii') })),
    camp('Observații', h('textarea', { name: 'observatii', rows: 2, maxlength: 2000 }, v('observatii')), 'lat'),
    camp(editare && (x.fisiere || []).length ? `Adaugă fișiere (are deja ${x.fisiere.length})` : 'Scan / fișiere (PDF, imagini — max. 25 MB fiecare)', fisiere, 'lat')),
  h('datalist', { id: 'compartimente' }, compartimente.map((c) => h('option', { value: c }))),
  eroare,
  h('div', { class: 'actiuni' },
    h('button', { type: 'submit', class: 'principal' }, editare ? 'Salvează modificările' : 'Înregistrează'),
    h('a', { href: editare ? `#/doc/${an}/${nr}` : '#/registru', class: 'buton' }, 'Renunță')));

  afiseaza(activ,
    h('h2', {}, editare ? `Editare nr. ${nr}/${fmtData(x.data)}` : 'Înregistrare nouă'),
    !editare && h('p', { class: 'slab' }, 'Numărul și data de înregistrare se dau automat la salvare.'),
    form);
}

// ---------- setări ----------

function paginaSetari() {
  const cfg = stare.reg.config;
  const poateScrie = stare.info?.permissions?.push;
  const mesaj = h('p', { class: 'eroare', role: 'alert', hidden: true });
  const form = h('form', { class: 'card formular', onsubmit: async (ev) => {
    ev.preventDefault();
    const fd = new FormData(form);
    const nou = {
      ...cfg,
      asociatie: { nume: fd.get('nume').trim(), adresa: fd.get('adresa').trim(), cif: fd.get('cif').trim() },
      compartimente: fd.get('compartimente').split('\n').map((s) => s.trim()).filter(Boolean),
    };
    const btn = form.querySelector('button');
    btn.disabled = true;
    try {
      await stare.reg.salveazaConfig(nou);
      stare.mesaj = 'Setările au fost salvate.';
      paginaSetari();
    } catch (e) {
      btn.disabled = false;
      mesaj.textContent = mesajEroare(e);
      mesaj.hidden = false;
    }
  } },
  h('fieldset', { disabled: !poateScrie },
    h('div', { class: 'grila' },
      h('label', { class: 'lat' }, 'Denumirea asociației', h('input', { name: 'nume', required: true, value: cfg.asociatie.nume })),
      h('label', {}, 'Adresa', h('input', { name: 'adresa', value: cfg.asociatie.adresa })),
      h('label', {}, 'CIF', h('input', { name: 'cif', value: cfg.asociatie.cif })),
      h('label', { class: 'lat' }, 'Compartimente / persoane (câte unul pe rând — apar la „Repartizat către”)',
        h('textarea', { name: 'compartimente', rows: 6 }, (cfg.compartimente || []).join('\n')))),
    mesaj,
    h('button', { type: 'submit', class: 'principal' }, 'Salvează setările')));

  afiseaza('setari',
    h('h2', {}, 'Setări'),
    form,
    h('div', { class: 'card' },
      h('h3', {}, 'Conexiune'),
      h('dl', { class: 'detalii' },
        h('dt', {}, 'Utilizator'), h('dd', {}, stare.reg.utilizator),
        h('dt', {}, 'Repo de date'), h('dd', {}, h('a', { href: `https://github.com/${stare.reg.gh.repo}`, target: '_blank', rel: 'noopener' }, stare.reg.gh.repo)),
        h('dt', {}, 'Drepturi'), h('dd', {}, poateScrie ? 'citire și scriere' : 'doar citire'))));
}

// ---------- rutare ----------

async function ruta() {
  if (!stare.reg) return ecranConectare();
  const [cale, query] = location.hash.replace(/^#/, '').split('?');
  const p = cale.split('/').filter(Boolean);
  const q = new URLSearchParams(query || '');
  if (p[0] === 'nou') return paginaFormular({ raspuns: q.get('raspuns') });
  if (p[0] === 'doc' && p[3] === 'editare') return paginaFormular({ an: Number(p[1]), nr: Number(p[2]) });
  if (p[0] === 'doc') return paginaDocument(Number(p[1]), Number(p[2]));
  if (p[0] === 'setari') return paginaSetari();
  return paginaRegistru();
}

window.addEventListener('hashchange', ruta);

(async function start() {
  const s = citesteSesiune();
  if (!s) return ecranConectare();
  try {
    await conecteaza(s);
    ruta();
  } catch (e) {
    ecranConectare(mesajEroare(e));
  }
})();
