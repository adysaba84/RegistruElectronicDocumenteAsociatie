// Criptare în browser (Web Crypto): cheia de acces la date e păstrată criptată
// cu parola fiecărui utilizator (PBKDF2-SHA256 → AES-GCM).

import { bytesToBase64 } from './github.js';

const enc = new TextEncoder();
const dec = new TextDecoder();

export const ITERATII_PAROLA = 600000;   // parole alese de utilizatori
export const ITERATII_TEMPORARA = 100000; // parole temporare aleatoare (entropie mare)

const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const aleator = (n) => crypto.getRandomValues(new Uint8Array(n));

async function cheie(parola, salt, iteratii) {
  const baza = await crypto.subtle.importKey('raw', enc.encode(parola), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: iteratii, hash: 'SHA-256' },
    baza, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

export async function cripteaza(obiect, parola, iteratii) {
  const salt = aleator(16);
  const iv = aleator(12);
  const k = await cheie(parola, salt, iteratii);
  const date = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, enc.encode(JSON.stringify(obiect)));
  return { salt: bytesToBase64(salt), iv: bytesToBase64(iv), iter: iteratii, date: bytesToBase64(new Uint8Array(date)) };
}

// null dacă parola e greșită (AES-GCM verifică integritatea).
export async function decripteaza(rec, parola) {
  try {
    const k = await cheie(parola, unb64(rec.salt), rec.iter);
    const date = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(rec.iv) }, k, unb64(rec.date));
    return JSON.parse(dec.decode(date));
  } catch {
    return null;
  }
}

// Parolă temporară ușor de dictat: XXXX-XXXX-XXXX, fără caractere confundabile (0/O, 1/I/L).
export function parolaTemporara() {
  const alfabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const out = [];
  while (out.length < 12) {
    const b = aleator(1)[0];
    if (b < alfabet.length * 8) out.push(alfabet[b % alfabet.length]);
  }
  return `${out.slice(0, 4).join('')}-${out.slice(4, 8).join('')}-${out.slice(8).join('')}`;
}
