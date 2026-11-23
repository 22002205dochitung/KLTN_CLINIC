/**
 * Single source of truth for the backend address.
 * Set REACT_APP_API_BASE (e.g. http://192.168.1.10:5000/api) to point the whole app elsewhere.
 * REACT_APP_API_URL (origin without /api) is still honoured for older setups.
 */
const fromLegacy = process.env.REACT_APP_API_URL ? `${process.env.REACT_APP_API_URL.replace(/\/$/, '')}/api` : null;

/**
 * Default: the backend on port 5000 of the same machine that serves the page. Opening the app
 * from a phone on the same Wi-Fi (http://192.168.x.x:3000) then reaches http://192.168.x.x:5000
 * instead of the phone's own "localhost".
 */
const sameHostBackend = () => {
  if (typeof window === 'undefined' || !window.location || !window.location.hostname) {
    return 'http://localhost:5000/api';
  }
  // Production (served by the backend itself, e.g. https://thctclinic.vn): same origin
  if (window.location.port !== '3000') {
    return `${window.location.origin}/api`;
  }
  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
  return `${protocol}//${window.location.hostname}:5000/api`;
};

/**
 * A configured "localhost" backend only works on the PC itself. When the page is opened from
 * another device (phone on the same Wi-Fi), swap localhost for the address the page came from.
 */
const fixLocalhostForOtherDevices = (base) => {
  if (typeof window === 'undefined' || !window.location) return base;
  // https page (phone camera needs https) + http backend = blocked by the browser ("mixed content"):
  // call /api on the page's own address instead; the dev server forwards it (src/setupProxy.js)
  if (window.location.protocol === 'https:' && /^http:\/\//i.test(base) && window.location.port) {
    return `${window.location.origin}/api`;
  }
  const pageHost = window.location.hostname;
  const isLocal = (h) => h === 'localhost' || h === '127.0.0.1';
  try {
    const url = new URL(base);
    if (isLocal(url.hostname) && pageHost && !isLocal(pageHost)) {
      url.hostname = pageHost;
      return url.toString();
    }
  } catch (e) {
    // relative or malformed base: leave as is
  }
  return base;
};

export const API_BASE = fixLocalhostForOtherDevices(
  process.env.REACT_APP_API_BASE || fromLegacy || sameHostBackend()
).replace(/\/$/, '');
export const API_ORIGIN = API_BASE.replace(/\/api$/, '');

export default API_BASE;
