const nodemailer = require('nodemailer');

/**
 * Outgoing e-mail (OTP codes). Configure in backend/.env:
 *   SMTP_HOST=smtp.gmail.com  SMTP_PORT=465  SMTP_USER=...  SMTP_PASS=<app password>
 *   MAIL_FROM="THCT Clinic <no-reply@thct.vn>"
 * Without SMTP_HOST the system runs in "demo mode": the message is printed in the backend console.
 */
let transporter = null;

const isConfigured = () => Boolean((process.env.SMTP_HOST || '').trim());

const getTransporter = () => {
  if (!transporter) {
    const port = parseInt(process.env.SMTP_PORT, 10) || 587;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
    });
  }
  return transporter;
};

const sendMail = async ({ to, subject, text, html }) => {
  if (!isConfigured()) {
    console.log(`📧 [demo mail] to=${to} | ${subject} | ${text}`);
    return { delivered: false, mode: 'demo' };
  }
  await getTransporter().sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
    html
  });
  return { delivered: true, mode: 'email' };
};

module.exports = { sendMail, isConfigured };
