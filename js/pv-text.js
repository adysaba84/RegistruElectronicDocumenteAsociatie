// Procesul-verbal ca text simplu (pentru editorul mare) ⇄ structura salvată și semnată.
// Funcții pure, fără DOM.
//
//   1. Titlul punctului
//   Discuții, pe oricâte rânduri.
//   Decizie: Textul deciziei.
//   Vot: 4 pentru, 1 împotrivă, 0 abțineri.
//   Responsabil: Administrator.
//   Termen: 30.10.2026.
//
//   2. Următorul punct …
//
// Structura: puncte: [{ titlu, discutii, decizii: [{ text, pentru, impotriva, abtineri, responsabil, termen }] }]

import { norm, parseazaVot, parseazaTermen, potrivesteRol } from './comenzi-voce.js?v=21';

export const RE_TITLU = /^(\d+)\.\s+(.+)$/;
const RE_CAMP = /^(Decizie|Vot|Responsabil|Termen)\s*:\s*(.*)$/i;
const fara = (s) => s.trim().replace(/\.$/, '');
const fmtData = (isoData) => (isoData ? isoData.split('-').reverse().join('.') : '');

export function pvInText(puncte, numeRol) {
  return puncte.map((p, i) => {
    const linii = [`${i + 1}. ${p.titlu}`];
    if (p.discutii) linii.push(p.discutii);
    for (const d of p.decizii || []) {
      linii.push(`Decizie: ${d.text}`);
      linii.push(`Vot: ${d.pentru} pentru, ${d.impotriva} împotrivă, ${d.abtineri} abțineri.`);
      if (d.responsabil) linii.push(`Responsabil: ${numeRol(d.responsabil)}.`);
      if (d.termen) linii.push(`Termen: ${fmtData(d.termen)}.`);
    }
    return linii.join('\n');
  }).join('\n\n') + '\n';
}

// → { puncte, erori: [mesaj] }. `roluri` = [{ id, nume }], `dataSedinta` = 'YYYY-MM-DD'.
export function textInPV(text, { roluri, dataSedinta }) {
  const erori = [];
  const puncte = [];
  let p = null;
  let d = null;
  const unde = () => `decizia ${p.decizii.length} de la punctul ${puncte.length}`;
  text.replace(/\r/g, '').split('\n').forEach((brut) => {
    const linie = brut.trim();
    if (!linie) return;
    let m;
    if ((m = linie.match(RE_TITLU))) {
      p = { titlu: m[2].trim(), discutii: [], decizii: [] };
      d = null;
      puncte.push(p);
      return;
    }
    if (!p) { erori.push('Textul trebuie să înceapă cu primul punct, de forma „1. Titlul punctului”.'); return; }
    if (!(m = linie.match(RE_CAMP))) {
      // Textul liber de după o decizie îi continuă textul; altfel e la discuții.
      if (d) d.text = `${d.text} ${linie}`.trim(); else p.discutii.push(linie);
      return;
    }
    const camp = norm(m[1]);
    const val = m[2].trim();
    if (camp === 'decizie') {
      d = { text: val, pentru: null, impotriva: null, abtineri: null, responsabil: '', termen: '' };
      p.decizii.push(d);
      return;
    }
    if (!d) { erori.push(`Punctul ${puncte.length}: rândul „${m[1]}:” trebuie să vină după un rând „Decizie:”.`); return; }
    if (camp === 'vot') {
      const v = parseazaVot(norm(val), 0);
      if (!v) erori.push(`Nu înțeleg votul de la ${unde()}: „${val}”. Scrie „4 pentru, 1 împotrivă, 0 abțineri”.`);
      else Object.assign(d, v);
    } else if (camp === 'responsabil') {
      if (!fara(val)) return;
      const id = potrivesteRol(norm(fara(val)), roluri);
      if (!id) erori.push(`Nu găsesc rolul „${fara(val)}” de la ${unde()}.`);
      else d.responsabil = id;
    } else if (camp === 'termen') {
      if (!fara(val)) return;
      const t = parseazaTermen(norm(fara(val)), dataSedinta);
      if (!t) erori.push(`Nu înțeleg termenul de la ${unde()}: „${fara(val)}”. Scrie data ca 30.10.2026.`);
      else d.termen = t;
    }
  });
  if (!puncte.length) erori.push('Procesul-verbal nu are niciun punct.');
  puncte.forEach((pt, i) => pt.decizii.forEach((x, j) => {
    if (!x.text.trim()) erori.push(`Decizia ${j + 1} de la punctul ${i + 1} nu are text.`);
    if (x.pentru == null) erori.push(`Decizia ${j + 1} de la punctul ${i + 1} nu are vot.`);
  }));
  return {
    erori,
    puncte: puncte.map((pt) => ({
      titlu: pt.titlu,
      discutii: pt.discutii.join('\n'),
      decizii: pt.decizii.map((x) => ({ ...x, text: x.text.trim() })),
    })),
  };
}
