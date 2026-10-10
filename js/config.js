// Setări ale aplicației (nimic secret — codul e public).

export const ASOCIATIA = {
  nume: 'Asociația de Proprietari Observatorului 105',
  adresa: 'Str. Observatorului nr. 105, Bl. O1, Cluj-Napoca',
  email: 'asociatiaobservatorului105@gmail.com',
};

// Repo PRIVAT cu registrul complet (nume, note interne, fișiere, alte documente).
export const REPO_DATE = 'adysaba84/RegistruElectronicDocumenteAsociatie-date';
// Repo PUBLIC: sesizările fără date personale (sesizari/<an>.json) și conturile administrației
// (conturi.json — parolele nu sunt stocate, doar cheia de acces criptată cu ele).
export const REPO_PUBLIC = 'adysaba84/RegistruElectronicDocumenteAsociatie-public';
const PAGES_PUBLIC = 'https://adysaba84.github.io/RegistruElectronicDocumenteAsociatie-public/';

export const APARTAMENTE = 60;

// Legea 196/2018, art. 57 alin. (1) lit. e): răspuns scris la sesizări în 10 zile;
// art. 28 alin. (3): contestațiile la lista de plată primesc răspuns în 10 zile.
export const TERMEN_RASPUNS_ZILE = 10;
export const ZILE_AVERTIZARE = 3;

// Roluri din Regulamentul intern (Cap. IV). Un rol se atribuie unui apartament, nu unei persoane.
export const ROLURI = [
  { id: 'presedinte', u: 'presedinte', nume: 'Președinte' },
  { id: 'r01', u: 'resp01', nume: 'Resp. cartea de imobil' },
  { id: 'r02', u: 'resp02', nume: 'Resp. instalații de apă' },
  { id: 'r03', u: 'resp03', nume: 'Resp. instalații electrice' },
  { id: 'r04', u: 'resp04', nume: 'Resp. instalații de gaz' },
  { id: 'r05', u: 'resp05', nume: 'Resp. interfon' },
  { id: 'r06', u: 'resp06', nume: 'Resp. camere de supraveghere' },
  { id: 'r07', u: 'resp07', nume: 'Resp. curățenie și gunoi' },
  { id: 'r08', u: 'resp08', nume: 'Resp. spații verzi' },
  { id: 'r09', u: 'resp09', nume: 'Resp. boxe și spații comune' },
  { id: 'r10', u: 'resp10', nume: 'Resp. convocări și corespondență' },
  { id: 'r11', u: 'resp11', nume: 'Resp. acoperiș și structură' },
  { id: 'r12', u: 'resp12', nume: 'Resp. fațade' },
  { id: 'r13', u: 'resp13', nume: 'Resp. restanțieri' },
  { id: 'cenzor', u: 'cenzor', nume: 'Cenzor' },
  { id: 'administrator', u: 'administrator', nume: 'Administrator' },
];

// Domeniul sesizării → cui se repartizează automat.
export const DOMENII = [
  { id: 'apa', nume: 'Instalații de apă și canalizare', rol: 'r02' },
  { id: 'electric', nume: 'Instalații electrice, iluminat', rol: 'r03' },
  { id: 'gaz', nume: 'Instalații de gaz', rol: 'r04' },
  { id: 'lift', nume: 'Lift', rol: 'presedinte' },
  { id: 'interfon', nume: 'Interfon, ușa de intrare, cartele', rol: 'r05' },
  { id: 'camere', nume: 'Camere de supraveghere', rol: 'r06' },
  { id: 'curatenie', nume: 'Curățenie, gunoi, zăpadă', rol: 'r07' },
  { id: 'verde', nume: 'Spații verzi', rol: 'r08' },
  { id: 'boxe', nume: 'Boxe, spații comune, obiecte pe hol', rol: 'r09' },
  { id: 'acoperis', nume: 'Acoperiș, terasă, structură', rol: 'r11' },
  { id: 'fatade', nume: 'Fațade', rol: 'r12' },
  { id: 'carte', nume: 'Cartea de imobil, număr de persoane', rol: 'r01' },
  { id: 'restante', nume: 'Restanțe', rol: 'r13' },
  { id: 'liste', nume: 'Lista de plată, cheltuieli', rol: 'administrator' },
  { id: 'corespondenta', nume: 'Convocări, adunări, corespondență', rol: 'r10' },
  { id: 'altele', nume: 'Altele', rol: 'presedinte' },
];

// Doar la rulare locală (localhost) se poate folosi un API de test prin ?api=...
// Pe site-ul public, cererile merg exclusiv la api.github.com.
function apiLocal() {
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const override = new URLSearchParams(location.search).get('api');
  return local && override && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(override) ? override : null;
}

export function apiBase() {
  return apiLocal() || 'https://api.github.com';
}

// De unde citește partea publică sesizările (GitHub Pages al repo-ului public, fără limită de cereri).
export function urlPublic() {
  const local = apiLocal();
  return local ? `${local.replace(/\/$/, '')}/raw/${REPO_PUBLIC}/` : PAGES_PUBLIC;
}
