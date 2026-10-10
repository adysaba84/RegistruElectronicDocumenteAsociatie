// Recunoaștere vocală gratuită din browser (Web Speech API), în română.
// Ascultă doar cât timp e pornită de utilizator; aplicația nu păstrează niciun sunet.
// Chrome trimite sunetul la Google, Edge la Microsoft, Safari la Apple. Firefox nu are API-ul.

const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

export const dictareSuportata = () => Boolean(SR);

const ERORI = {
  'not-allowed': 'Microfonul nu are permisiune. Permite-l din bara de adrese a browserului.',
  'service-not-allowed': 'Browserul nu permite recunoașterea vocală aici.',
  'audio-capture': 'Nu am găsit un microfon.',
  network: 'Recunoașterea vocală are nevoie de internet.',
  'language-not-supported': 'Browserul nu recunoaște limba română.',
};

export class Dictare {
  // onFinal(text) — o frază terminată; onInterim(text) — ce se aude acum; onEroare(mesaj); onStare(ascultă)
  constructor({ onFinal, onInterim, onEroare, onStare }) {
    Object.assign(this, { onFinal, onInterim, onEroare, onStare });
    this.asculta = false;
    this.rec = null;
  }

  porneste() {
    if (!SR) { this.onEroare?.('Browserul acesta nu are recunoaștere vocală. Folosește Chrome, Edge sau Safari.'); return; }
    if (this.asculta) return;
    const rec = new SR();
    rec.lang = 'ro-RO';
    rec.interimResults = true;
    rec.continuous = true;
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) { if (t.trim()) this.onFinal?.(t.trim()); } else interim += t;
      }
      this.onInterim?.(interim);
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      this.opreste();
      this.onEroare?.(ERORI[e.error] || `Recunoașterea vocală a dat eroare (${e.error}).`);
    };
    // Browserul oprește singur după o pauză; repornim cât timp utilizatorul n-a oprit.
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
    this.onInterim?.('');
  }
}
