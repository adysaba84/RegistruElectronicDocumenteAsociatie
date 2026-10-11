// Recunoaștere vocală gratuită din browser (Web Speech API), în română.
// Ascultă doar cât timp e pornită de utilizator; aplicația nu păstrează niciun sunet.
// Chrome trimite sunetul la Google, Edge la Microsoft, Safari la Apple. Firefox nu are API-ul.
//
// Chrome pe Android trimite fiecare variantă intermediară a frazei („Că”, „Că vom”, „Că vom discuta”)
// ca rezultat final. De aceea variantele care se continuă una pe alta se unesc, iar enunțul se dă mai
// departe abia după o pauză în vorbire (sau la oprirea microfonului).

import { norm } from './comenzi-voce.js?v=19';

const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
export const PAUZA_MS = 1300;

export const dictareSuportata = () => Boolean(SR);

const ERORI = {
  'not-allowed': 'Microfonul nu are permisiune. Permite-l din bara de adrese a browserului.',
  'service-not-allowed': 'Browserul nu permite recunoașterea vocală aici.',
  'audio-capture': 'Nu am găsit un microfon.',
  network: 'Recunoașterea vocală are nevoie de internet.',
  'language-not-supported': 'Browserul nu recunoaște limba română.',
};

// Unește bucățile finale ale unui enunț: o variantă mai lungă o înlocuiește pe cea dinainte,
// una mai scurtă sau identică se ignoră, una nouă se adaugă.
export function uneste(bucati, text) {
  const n = norm(text.trim());
  if (!n) return bucati;
  const ult = bucati.length ? norm(bucati[bucati.length - 1]) : null;
  if (ult != null && n.startsWith(ult)) return [...bucati.slice(0, -1), text.trim()];
  if (ult != null && ult.startsWith(n)) return bucati;
  if (bucati.some((b) => norm(b) === n)) return bucati;
  return [...bucati, text.trim()];
}

export class Dictare {
  // onEnunt(text) — un enunț terminat; onAud(text) — ce se aude acum; onEroare(mesaj); onStare(ascultă)
  constructor({ onEnunt, onAud, onEroare, onStare }) {
    Object.assign(this, { onEnunt, onAud, onEroare, onStare });
    this.asculta = false;
    this.rec = null;
    this.bucati = [];
    this.interim = '';
    this.timer = null;
  }

  // Primește un rezultat (și din teste, fără microfon).
  primeste(text, final) {
    if (final) { this.bucati = uneste(this.bucati, text); this.interim = ''; } else this.interim = text.trim();
    this.onAud?.([...this.bucati, this.interim].filter(Boolean).join(' '));
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.trimite(), PAUZA_MS);
  }

  trimite() {
    clearTimeout(this.timer);
    const t = this.bucati.join(' ').trim();
    this.bucati = [];
    this.interim = '';
    this.onAud?.('');
    if (t) this.onEnunt?.(t);
  }

  porneste() {
    if (!SR) { this.onEroare?.('Browserul acesta nu are recunoaștere vocală. Folosește Chrome, Edge sau Safari.'); return; }
    if (this.asculta) return;
    const rec = new SR();
    rec.lang = 'ro-RO';
    rec.interimResults = true;
    rec.continuous = true;
    rec.onresult = (e) => {
      if (this.rec !== rec) return; // rezultat întârziat după oprire: textul a fost deja scris
      for (let i = e.resultIndex; i < e.results.length; i++) this.primeste(e.results[i][0].transcript, e.results[i].isFinal);
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      this.opreste();
      this.onEroare?.(ERORI[e.error] || `Recunoașterea vocală a dat eroare (${e.error}).`);
    };
    // Browserul se oprește singur după o pauză; repornim cât timp utilizatorul n-a oprit.
    rec.onend = () => {
      if (this.asculta && this.rec === rec) { try { rec.start(); return; } catch { /* oprește mai jos */ } }
      if (this.rec === rec) this.opreste();
    };
    this.rec = rec;
    try {
      rec.start();
      this.asculta = true;
      this.onStare?.(true);
    } catch {
      this.rec = null;
      this.onEroare?.('Microfonul nu a putut porni.');
    }
  }

  opreste() {
    const rec = this.rec;
    const era = this.asculta;
    this.asculta = false;
    this.rec = null;
    try { rec?.stop(); } catch { /* deja oprit */ }
    if (era) this.onStare?.(false);
    // Ce s-a auzit deja se scrie imediat.
    if (this.bucati.length || this.interim) {
      if (this.interim) this.bucati = uneste(this.bucati, this.interim);
      this.trimite();
    }
  }
}
