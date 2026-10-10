// Comenzile vocale pentru editorul procesului-verbal. Funcții pure (fără DOM, fără microfon).
// Vezi docs/plans/plan-dictare-vocala.md.
//
//   parseaza('decizie se aprobă oferta, vot unanim, termen 30 octombrie')
//     → [{ tip: 'decizie', rest: 'se aprobă oferta' }, { tip: 'vot', ... }, { tip: 'termen', ... }]
// Textul fără comandă (înainte de prima comandă) vine ca { tip: 'text' } și se scrie la cursor.

const NUMERE = {
  zero: 0, niciuna: 0, niciun: 0, nimeni: 0, unu: 1, una: 1, un: 1, o: 1, doi: 2, doua: 2, trei: 3, patru: 4,
  cinci: 5, sase: 6, sapte: 7, opt: 8, noua: 9, zece: 10, unsprezece: 11, doisprezece: 12, douasprezece: 12,
  treisprezece: 13, paisprezece: 14, cincisprezece: 15, saisprezece: 16, saptesprezece: 17, optsprezece: 18,
  nouasprezece: 19, douazeci: 20, treizeci: 30,
};
const LUNI = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
// Cuvinte care nu deosebesc un rol de altul.
const CUVINTE_GOALE = new Set(['resp', 'responsabil', 'si', 'de', 'cu', 'la', 'pe', 'cel', 'instalatii', 'spatii']);

// Fără diacritice și cu litere mici, păstrând lungimea (ca să tăiem textul original la aceleași poziții).
export const norm = (s) => [...s].map((c) => c.normalize('NFD').replace(/[̀-ͯ]/g, '') || c).join('').toLowerCase();
const curat = (s) => s.replace(/^[\s,:;.\-–]+|[\s,:;\-–]+$/g, '');

// O frază: majusculă la început și punct la sfârșit.
export function fraza(s) {
  s = curat(s).replace(/\.+$/, '');
  if (!s) return '';
  return `${s[0].toUpperCase()}${s.slice(1)}${/[!?]$/.test(s) ? '' : '.'}`;
}

export function numar(cuvant) {
  if (cuvant == null) return null;
  if (/^\d+$/.test(cuvant)) return Number(cuvant);
  return NUMERE[cuvant] ?? null;
}

const NR = '\\d+|unu|una|doi|doua|trei|patru|cinci|sase|sapte|opt|noua|zece';
const RE_COMANDA = new RegExp(`\\b(consemneaza|noteaza|punct nou|punctul urmator|punctul (?:${NR})|decizia (?:${NR}|urmatoare|anterioara|precedenta)|decizie|hotararea|hotarare|vot|responsabil|termen|rand nou|sterge ultima|anuleaza)\\b`, 'g');
const SINONIME = { noteaza: 'consemneaza', hotarare: 'decizie', hotararea: 'decizie', anuleaza: 'sterge ultima' };

export function parseaza(text) {
  const n = norm(text);
  const gasite = [...n.matchAll(RE_COMANDA)];
  const comenzi = [];
  const inainte = curat(text.slice(0, gasite.length ? gasite[0].index : text.length));
  if (inainte) comenzi.push({ tip: 'text', rest: inainte, restN: norm(inainte) });
  gasite.forEach((m, i) => {
    const sfarsit = i + 1 < gasite.length ? gasite[i + 1].index : text.length;
    const start = m.index + m[0].length;
    const c = { tip: SINONIME[m[1]] || m[1], rest: curat(text.slice(start, sfarsit)), restN: curat(n.slice(start, sfarsit)) };
    if (c.tip.startsWith('punctul ') && c.tip !== 'punctul urmator') { c.nr = numar(c.tip.slice(8)); c.tip = 'punctul'; }
    if (c.tip.startsWith('decizia ')) {
      const w = c.tip.slice(8);
      c.tip = 'decizia';
      c.nr = numar(w);
      c.dir = w === 'urmatoare' ? 1 : -1;
    }
    comenzi.push(c);
  });
  return comenzi;
}

// „4 pentru 1 împotrivă 0 abțineri” / „unanim” → { pentru, impotriva, abtineri } sau null.
export function parseazaVot(restN, prezenti) {
  if (/\bunanim/.test(restN)) return prezenti ? { pentru: prezenti, impotriva: 0, abtineri: 0 } : null;
  const ia = (re) => { const m = restN.match(re); return m ? numar(m[1]) : 0; };
  const v = { pentru: ia(/(\w+)\s+pentru/), impotriva: ia(/(\w+)\s+impotriva/), abtineri: ia(/(\w+)\s+abtiner/) };
  if (Object.values(v).some((x) => x == null) || v.pentru + v.impotriva + v.abtineri === 0) return null;
  return v;
}

export const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// „30 octombrie”, „30.10”, „30.10.2026”, „peste 10 zile”, „sfârșitul lunii” → 'YYYY-MM-DD' sau null.
// `baza` = data ședinței ('YYYY-MM-DD'); o dată fără an care ar cădea înaintea ședinței trece în anul următor.
export function parseazaTermen(restN, baza) {
  const [ab, lb, zb] = baza.split('-').map(Number);
  const start = new Date(ab, lb - 1, zb);
  const cuAn = (z, l, an) => {
    if (!z || l < 0 || l > 11 || z > 31) return null;
    let d = new Date(an ?? ab, l, z);
    if (an == null && d < start) d = new Date(ab + 1, l, z);
    return d.getDate() === z ? iso(d) : null;
  };
  let m;
  if ((m = restN.match(/peste (\w+) (?:de )?(zile|zi|saptamani|saptamana)/))) {
    const k = numar(m[1]);
    if (k == null) return null;
    const d = new Date(start);
    d.setDate(d.getDate() + k * (m[2].startsWith('sapt') ? 7 : 1));
    return iso(d);
  }
  if (/sfarsitul lunii/.test(restN)) return iso(new Date(ab, lb, 0));
  if ((m = restN.match(/(\d{1,2})\s*[./-]\s*(\d{1,2})(?:\s*[./-]\s*(\d{4}))?/))) return cuAn(Number(m[1]), Number(m[2]) - 1, m[3] ? Number(m[3]) : null);
  if ((m = restN.match(/(\w+)\s+(ianuarie|februarie|martie|aprilie|mai|iunie|iulie|august|septembrie|octombrie|noiembrie|decembrie)(?:\s+(\d{4}))?/))) {
    return cuAn(numar(m[1]), LUNI.indexOf(m[2]), m[3] ? Number(m[3]) : null);
  }
  return null;
}

// „responsabil apă” → id-ul rolului cu cele mai multe cuvinte potrivite (prefix comun de cel puțin 4 litere).
// `roluri` = [{ id, nume }].
export function potrivesteRol(restN, roluri) {
  const exact = roluri.find((r) => norm(r.nume).replace(/\.$/, '') === restN.replace(/\.$/, ''));
  if (exact) return exact.id;
  const spuse = restN.split(/[\s.,]+/).filter((w) => w.length >= 3 && !CUVINTE_GOALE.has(w));
  const seamana = (a, b) => a === b || (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a)));
  let best = null;
  let scor = 0;
  for (const r of roluri) {
    const cuv = norm(r.nume).split(/[\s.,-]+/).filter((w) => w.length >= 3 && !CUVINTE_GOALE.has(w));
    const s = spuse.filter((w) => cuv.some((c) => seamana(w, c))).length;
    if (s > scor) { best = r.id; scor = s; }
  }
  return best;
}
