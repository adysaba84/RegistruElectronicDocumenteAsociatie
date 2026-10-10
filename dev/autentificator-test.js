// Autentificator WebAuthn simulat, DOAR pentru testare locală (nu e încărcat de aplicație).
// Se lipește în consola paginii servite de dev/mock_github.py: înlocuiește navigator.credentials
// cu chei ECDSA P-256 generate în memorie, producând răspunsuri cu aceeași formă ca un passkey real
// (authenticatorData, clientDataJSON, semnătură DER).
(() => {
  const enc = new TextEncoder();
  const b64u = (b) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const sha = async (b) => new Uint8Array(await crypto.subtle.digest('SHA-256', b));
  const chei = new Map(); // id (b64u) -> CryptoKey privată
  const rawLaDer = (raw) => {
    const intreg = (v) => {
      let i = 0;
      while (i < v.length - 1 && v[i] === 0) i++;
      let x = v.slice(i);
      if (x[0] & 0x80) x = Uint8Array.of(0, ...x);
      return Uint8Array.of(0x02, x.length, ...x);
    };
    const r = intreg(raw.slice(0, 32));
    const s = intreg(raw.slice(32));
    return Uint8Array.of(0x30, r.length + s.length, ...r, ...s);
  };
  navigator.credentials.create = async ({ publicKey }) => {
    const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const spki = await crypto.subtle.exportKey('spki', k.publicKey);
    const rawId = crypto.getRandomValues(new Uint8Array(16));
    chei.set(b64u(rawId), k.privateKey);
    return { rawId: rawId.buffer, response: { getPublicKey: () => spki, getPublicKeyAlgorithm: () => -7 } };
  };
  navigator.credentials.get = async ({ publicKey }) => {
    const permise = publicKey.allowCredentials.map((c) => b64u(c.id)).filter((id) => chei.has(id));
    if (!permise.length) throw new DOMException('fără cheie', 'NotAllowedError');
    const id = permise[0];
    const authData = new Uint8Array(37);
    authData.set(await sha(enc.encode(publicKey.rpId)));
    authData[32] = 0x05; // UP + UV
    const clientDataJSON = enc.encode(JSON.stringify({ type: 'webauthn.get', challenge: b64u(publicKey.challenge), origin: location.origin }));
    const deSemnat = new Uint8Array(37 + 32);
    deSemnat.set(authData);
    deSemnat.set(await sha(clientDataJSON), 37);
    const raw = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, chei.get(id), deSemnat));
    return {
      rawId: Uint8Array.from(atob(id.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - id.length % 4) % 4)), (c) => c.charCodeAt(0)).buffer,
      response: { authenticatorData: authData.buffer, clientDataJSON: clientDataJSON.buffer, signature: rawLaDer(raw).buffer },
    };
  };
  window.PublicKeyCredential = window.PublicKeyCredential || function PublicKeyCredential() {};
  console.log('Autentificator de test activ');
})();
