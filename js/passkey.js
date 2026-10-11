// Semnătură electronică cu passkey (WebAuthn): înregistrarea cheilor, semnarea și
// verificarea, doar cu Web Crypto (fără server).
//
// chei.json (repo-ul public — cheile publice nu sunt secrete și pagina publică le folosește):
//   { versiune, chei: [{ id, u, spki, alg, rpId, origin, dispozitiv, inregistrataLa, cod, revocataLa?, revocataDe? }] }
// Lista e doar adăugată: o cheie revocată rămâne, ca semnăturile făcute cu ea înainte să fie verificabile.

import { GitHubRepo } from './github.js?v=20';
import { REPO_PUBLIC } from './config.js?v=20';

const enc = new TextEncoder();
const dec = new TextDecoder();
const FISIER = 'chei.json';

export function b64u(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function unb64u(s) {
  let t = s.replace(/-/g, '+').replace(/_/g, '/');
  while (t.length % 4) t += '=';
  return Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
}

const sha256 = async (bytes) => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
export const hashText = (text) => sha256(enc.encode(text));

// „Codul cheii”: amprenta cheii publice, trecută de membru pe acordul semnat pe hârtie.
export async function codCheie(spki) {
  const h = await sha256(unb64u(spki));
  return [...h.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase().match(/.{4}/g).join('-');
}

export const suportat = () => Boolean(window.PublicKeyCredential && navigator.credentials?.create);

export class FaraCheie extends Error {
  constructor() {
    super('Nu ai încă un passkey pe acest site. Adaugă unul din Profil.');
  }
}

export async function creeazaCheie({ u, eticheta, dispozitiv, existente = [] }) {
  if (!suportat()) throw new Error('Browserul acesta nu suportă passkey-uri.');
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { id: location.hostname, name: 'Registru electronic' },
      user: { id: enc.encode(u), name: u, displayName: eticheta },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
      attestation: 'none',
      timeout: 120000,
      excludeCredentials: existente.filter((c) => c.rpId === location.hostname)
        .map((c) => ({ type: 'public-key', id: unb64u(c.id) })),
    },
  });
  const r = cred.response;
  const spkiBuf = typeof r.getPublicKey === 'function' ? r.getPublicKey() : null;
  if (!spkiBuf) throw new Error('Browserul nu oferă cheia publică. Actualizează browserul și încearcă din nou.');
  const spki = b64u(spkiBuf);
  return {
    id: b64u(cred.rawId),
    u,
    spki,
    alg: r.getPublicKeyAlgorithm(),
    rpId: location.hostname,
    origin: location.origin,
    dispozitiv,
    inregistrataLa: new Date().toISOString(),
    cod: await codCheie(spki),
  };
}

// Semnează textul canonic al unui document: provocarea WebAuthn este SHA-256 al textului.
export async function semneaza({ u, chei, continut }) {
  const proprii = chei.filter((c) => c.u === u && !c.revocataLa && c.rpId === location.hostname);
  if (!proprii.length) throw new FaraCheie();
  const hash = await hashText(continut);
  const cred = await navigator.credentials.get({
    publicKey: {
      challenge: hash,
      rpId: location.hostname,
      allowCredentials: proprii.map((c) => ({ type: 'public-key', id: unb64u(c.id) })),
      userVerification: 'required',
      timeout: 120000,
    },
  });
  const id = b64u(cred.rawId);
  return {
    u,
    cheie: id,
    cod: proprii.find((c) => c.id === id)?.cod || '',
    la: new Date().toISOString(),
    hash: b64u(hash),
    authenticatorData: b64u(cred.response.authenticatorData),
    clientDataJSON: b64u(cred.response.clientDataJSON),
    signature: b64u(cred.response.signature),
  };
}

// ECDSA din WebAuthn vine în format DER; Web Crypto vrea r||s.
function derLaRaw(der, n = 32) {
  let i = 2;
  if (der[1] & 0x80) i = 2 + (der[1] & 0x7f);
  const intreg = () => {
    if (der[i++] !== 0x02) throw new Error('DER invalid');
    const len = der[i++];
    let v = der.slice(i, i + len);
    i += len;
    while (v.length > n && v[0] === 0) v = v.slice(1);
    const out = new Uint8Array(n);
    out.set(v, n - v.length);
    return out;
  };
  const r = intreg();
  const s = intreg();
  const raw = new Uint8Array(2 * n);
  raw.set(r);
  raw.set(s, n);
  return raw;
}

const egal = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// Verifică o semnătură față de conținutul actual al documentului și lista de chei.
// Folosește rpId/origin salvate la cheie, deci rămâne valabilă și după o schimbare de domeniu.
export async function verifica(sem, continut, chei) {
  try {
    const cheie = chei.find((c) => c.id === sem.cheie);
    if (!cheie) return { ok: false, motiv: 'cheia nu există în lista publică' };
    if (cheie.u !== sem.u) return { ok: false, motiv: 'cheia nu aparține semnatarului' };
    if (cheie.revocataLa && cheie.revocataLa < sem.la) return { ok: false, motiv: 'cheia era revocată' };
    const hash = await hashText(continut);
    if (b64u(hash) !== sem.hash) return { ok: false, motiv: 'documentul a fost modificat după semnare' };
    const cdBytes = unb64u(sem.clientDataJSON);
    const cd = JSON.parse(dec.decode(cdBytes));
    if (cd.type !== 'webauthn.get' || cd.challenge !== sem.hash || cd.origin !== cheie.origin) {
      return { ok: false, motiv: 'datele semnăturii nu corespund' };
    }
    const ad = unb64u(sem.authenticatorData);
    if (!egal(ad.slice(0, 32), await sha256(enc.encode(cheie.rpId)))) return { ok: false, motiv: 'semnată pe alt site' };
    if ((ad[32] & 0x05) !== 0x05) return { ok: false, motiv: 'fără confirmarea utilizatorului' };
    const semnat = new Uint8Array(ad.length + 32);
    semnat.set(ad);
    semnat.set(await sha256(cdBytes), ad.length);
    const spki = unb64u(cheie.spki);
    const sig = unb64u(sem.signature);
    let ok;
    if (cheie.alg === -7) {
      const k = await crypto.subtle.importKey('spki', spki, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, k, derLaRaw(sig), semnat);
    } else if (cheie.alg === -257) {
      const k = await crypto.subtle.importKey('spki', spki, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
      ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', k, sig, semnat);
    } else {
      return { ok: false, motiv: 'algoritm nesuportat' };
    }
    return ok ? { ok: true, cheie } : { ok: false, motiv: 'semnătura nu se verifică' };
  } catch {
    return { ok: false, motiv: 'semnătura nu se verifică' };
  }
}

export class Chei {
  constructor(lista = []) {
    this.lista = lista;
  }

  static async incarca(apiBase, token, urlPublic) {
    try {
      const date = await new GitHubRepo({ apiBase, token, repo: REPO_PUBLIC }).readJson(FISIER);
      return new Chei(date?.chei || []);
    } catch {
      const res = await fetch(`${urlPublic}${FISIER}?t=${Date.now()}`, { cache: 'no-store' });
      return new Chei(res.ok ? (await res.json()).chei || [] : []);
    }
  }

  ale(u) {
    return this.lista.filter((c) => c.u === u);
  }

  async scrie(apiBase, token, schimbare, mesaj) {
    const gh = new GitHubRepo({ apiBase, token, repo: REPO_PUBLIC });
    await gh.info();
    const date = await gh.transact(async (head) => {
      const d = (await gh.readJson(FISIER, head)) || { versiune: 1, chei: [] };
      schimbare(d.chei);
      return { files: [{ path: FISIER, text: JSON.stringify(d, null, 2) + '\n' }], result: d };
    }, () => mesaj);
    this.lista = date.chei;
  }

  adauga(apiBase, token, cheie) {
    return this.scrie(apiBase, token, (l) => l.push(cheie), `Passkey adăugat: ${cheie.u} (${cheie.cod})`);
  }

  revoca(apiBase, token, id, deCine) {
    return this.scrie(apiBase, token, (l) => {
      const c = l.find((x) => x.id === id);
      if (c && !c.revocataLa) Object.assign(c, { revocataLa: new Date().toISOString(), revocataDe: deCine });
    }, `Passkey revocat de ${deCine}`);
  }
}
