/**
 * Minimal CSV writer for Excel (UTF-8 with BOM, CRLF).
 * Text cells that start with = + - @ are prefixed with ' so Excel never runs them as formulas
 * (names and notes come from users). Numbers are written as plain numbers.
 */
const cell = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
};

const toCsv = (rows) => '﻿' + rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';

module.exports = { toCsv, cell };
