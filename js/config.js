// Setări ale aplicației (nu conțin nimic secret — codul e public).

// Repo-ul PRIVAT în care stau datele registrului (JSON + scanuri).
export const REPO_DATE_IMPLICIT = 'adysaba84/RegistruElectronicDocumenteAsociatie-date';

// Doar la rulare locală (localhost) se poate folosi un API de test prin ?api=...
// Pe site-ul public, tokenul merge exclusiv la api.github.com.
export function apiBase() {
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const override = new URLSearchParams(location.search).get('api');
  if (local && override && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(override)) {
    return override;
  }
  return 'https://api.github.com';
}
