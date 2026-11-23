import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import InstallAppBanner from './components/common/InstallAppBanner';
import { SepayReturn } from './components/payment/SepayGateway';
// shared look & feel – imported last so it wins over component stylesheets
import './styles/theme.css';
import './styles/unify.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
    <InstallAppBanner />
    <SepayReturn />
  </React.StrictMode>
);

// Service worker: makes the app installable on phones and quick to reopen.
// Browsers only allow it on https:// or localhost (a phone opening http://192.168.x.x gets none).
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${process.env.PUBLIC_URL}/sw.js`).catch(() => {
      // not fatal: the site still works as a normal web page
    });
  });
}
