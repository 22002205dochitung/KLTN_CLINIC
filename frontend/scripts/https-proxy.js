/**
 * HTTPS door for phones on the same Wi-Fi (development only):  npm run start:https
 *
 *   https://<ip-máy-tính>:3443  ->  /api/*  -> backend   http://localhost:5000
 *                               ->  rest    -> React dev  http://localhost:3000 (npm start)
 *
 * Phones only open the camera on https pages, so QR check-in needs this. It does not start a
 * second React dev server (two of them share node_modules/.cache and crash each other).
 * The certificate is self-made: the phone shows a warning once -> "Nâng cao" -> "Tiếp tục".
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');
const httpProxy = require('http-proxy');
const selfsigned = require('selfsigned');

const PORT = Number(process.env.HTTPS_PORT) || 3443;
const WEB = process.env.WEB_TARGET || 'http://localhost:3000';
const API = process.env.API_TARGET || 'http://localhost:5000';

const lanIps = Object.values(os.networkInterfaces()).flat()
  .filter((i) => i && i.family === 'IPv4' && !i.internal)
  .map((i) => i.address);

// Reuse one certificate (kept next to the cache, outside git) so the phone only asks once
const certFile = path.join(__dirname, '..', 'node_modules', '.cache', 'https-proxy-cert.json');
let cert;
try {
  cert = JSON.parse(fs.readFileSync(certFile, 'utf8'));
  if (!lanIps.every((ip) => (cert.ips || []).includes(ip))) cert = null; // IP changed: new cert
} catch (e) {
  cert = null;
}
if (!cert) {
  const pems = selfsigned.generate([{ name: 'commonName', value: 'THCT Clinic (dev)' }], {
    days: 825,
    keySize: 2048,
    algorithm: 'sha256',
    extensions: [{
      name: 'subjectAltName',
      altNames: [
        { type: 2, value: 'localhost' },
        { type: 7, ip: '127.0.0.1' },
        ...lanIps.map((ip) => ({ type: 7, ip }))
      ]
    }]
  });
  cert = { key: pems.private, cert: pems.cert, ips: lanIps };
  fs.mkdirSync(path.dirname(certFile), { recursive: true });
  fs.writeFileSync(certFile, JSON.stringify(cert));
}

const proxy = httpProxy.createProxyServer({ ws: true, xfwd: true });
proxy.on('error', (err, req, res) => {
  const target = req.url.startsWith('/api') ? `backend (${API})` : `web (${WEB}) – đã chạy "npm start" chưa?`;
  if (res && res.writeHead && !res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Không kết nối được ${target}`);
  } else if (res && res.destroy) {
    res.destroy();
  }
});
// The browser call is same-origin now; drop Origin so the backend's CORS list is not involved
proxy.on('proxyReq', (proxyReq, req) => {
  if (req.url.startsWith('/api')) proxyReq.removeHeader('origin');
});

const server = https.createServer({ key: cert.key, cert: cert.cert }, (req, res) => {
  proxy.web(req, res, { target: req.url.startsWith('/api') ? API : WEB, changeOrigin: true });
});
// hot reload websocket of the React dev server
server.on('upgrade', (req, socket, head) => {
  proxy.ws(req, socket, head, { target: WEB, changeOrigin: true });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`HTTPS cho điện thoại đang chạy (chuyển tiếp ${WEB} và ${API}):`);
  [...lanIps, 'localhost'].forEach((ip) => console.log(`  https://${ip}:${PORT}`));
});
