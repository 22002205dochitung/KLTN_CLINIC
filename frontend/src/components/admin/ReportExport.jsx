import React, { useState } from 'react';
import axios from 'axios';
import { API_BASE } from '../../config/api';

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cell = (v) => (typeof v === 'number' ? v.toLocaleString('vi-VN') : esc(v));

/**
 * Report rows (same as the CSV) -> printable A4 page; the browser's "Save as PDF" makes the file.
 * One-cell rows are headings, empty rows separate sections, wide groups get a header row.
 */
const reportHtml = (title, rows) => {
  const parts = [];
  let group = [];
  const flush = () => {
    if (!group.length) return;
    const withHeader = group.length > 1 && group[0].length >= 3;
    const head = withHeader ? `<thead><tr>${group[0].map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>` : '';
    const body = (withHeader ? group.slice(1) : group)
      .map((r) => `<tr>${r.map((c) => `<td class="${typeof c === 'number' ? 'num' : ''}">${cell(c)}</td>`).join('')}</tr>`).join('');
    parts.push(`<table>${head}<tbody>${body}</tbody></table>`);
    group = [];
  };
  rows.forEach((r, i) => {
    if (!r.length) { flush(); return; }
    if (r.length === 1) { flush(); parts.push(i === 0 ? `<h1>${esc(r[0])}</h1>` : i === 1 ? `<p class="meta">${esc(r[0])}</p>` : `<h2>${esc(r[0])}</h2>`); return; }
    group.push(r);
  });
  flush();
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #0f172a; font-size: 11px; }
  .brand { display: flex; justify-content: space-between; border-bottom: 2px solid #108578; padding-bottom: 6px; margin-bottom: 10px; }
  .brand b { font-size: 16px; color: #108578; }
  h1 { font-size: 18px; margin: 6px 0 2px; text-align: center; }
  h2 { font-size: 13px; margin: 14px 0 6px; color: #108578; }
  .meta { text-align: center; color: #64748b; margin: 0 0 10px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; page-break-inside: auto; }
  th, td { border: 1px solid #cbd5e1; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #f1faf8; }
  tr { page-break-inside: avoid; }
  td.num { text-align: right; white-space: nowrap; }
  .sign { display: flex; justify-content: flex-end; margin-top: 24px; text-align: center; }
</style></head><body>
<div class="brand"><b>THCT CLINIC</b><span>Hệ thống đặt lịch khám &amp; quản lý hồ sơ y tế điện tử</span></div>
${parts.join('\n')}
<div class="sign"><div>Người lập báo cáo<br><br><br><br>(Ký, ghi rõ họ tên)</div></div>
</body></html>`;
};
import './ReportExport.css';

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const RANGES = {
  week: () => { const t = new Date(); const f = new Date(); f.setDate(t.getDate() - 6); return [ymd(f), ymd(t)]; },
  month: () => { const t = new Date(); return [ymd(new Date(t.getFullYear(), t.getMonth(), 1)), ymd(t)]; },
  lastMonth: () => {
    const t = new Date();
    return [ymd(new Date(t.getFullYear(), t.getMonth() - 1, 1)), ymd(new Date(t.getFullYear(), t.getMonth(), 0))];
  }
};

/**
 * ReportExport - admin downloads appointment / revenue reports as CSV files that open in Excel.
 */
const ReportExport = () => {
  const [[from, to], setRange] = useState(RANGES.month());
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);

  const download = async (type) => {
    if (!from || !to || from > to) {
      setMessage({ type: 'error', text: 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc' });
      return;
    }
    try {
      setBusy(type);
      setMessage(null);
      const res = await axios.get(`${API_BASE}/admin/reports/export`, {
        params: { type, from, to },
        responseType: 'blob',
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
      });
      const name = `${type === 'appointments' ? 'lich-hen' : 'doanh-thu'}_${from}_${to}.csv`;
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage({ type: 'success', text: `Đã tải ${name} – mở bằng Excel` });
    } catch (err) {
      // error bodies come back as a Blob because of responseType
      let text = 'Không thể xuất báo cáo';
      try {
        const body = JSON.parse(await err.response.data.text());
        text = body.error?.message || text;
      } catch (e) {
        // keep the generic message
      }
      setMessage({ type: 'error', text });
    } finally {
      setBusy(null);
    }
  };

  // PDF: open the printable report; "Lưu dưới dạng PDF" in the print dialog saves the file
  const printPdf = async (type) => {
    if (!from || !to || from > to) {
      setMessage({ type: 'error', text: 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc' });
      return;
    }
    const win = window.open('', '_blank');
    if (!win) {
      setMessage({ type: 'error', text: 'Trình duyệt đã chặn cửa sổ mới – cho phép popup rồi bấm lại' });
      return;
    }
    win.document.write('<p style="font-family:sans-serif">Đang tạo báo cáo…</p>');
    try {
      setBusy(`${type}-pdf`);
      setMessage(null);
      const res = await axios.get(`${API_BASE}/admin/reports/export`, {
        params: { type, from, to, format: 'json' },
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
      });
      const { filename, rows } = res.data.data;
      win.document.open();
      win.document.write(reportHtml(filename, rows));
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 400);
      setMessage({ type: 'success', text: 'Đã mở bản in – chọn "Lưu dưới dạng PDF" để lưu file PDF' });
    } catch (err) {
      win.close();
      setMessage({ type: 'error', text: err.response?.data?.error?.message || 'Không thể tạo báo cáo PDF' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="report-export" aria-label="Xuất báo cáo">
      <div className="report-export-head">
        <h3>⬇ Xuất báo cáo Excel / PDF</h3>
        <div className="report-quick">
          <button type="button" onClick={() => setRange(RANGES.week())}>7 ngày qua</button>
          <button type="button" onClick={() => setRange(RANGES.month())}>Tháng này</button>
          <button type="button" onClick={() => setRange(RANGES.lastMonth())}>Tháng trước</button>
        </div>
      </div>
      <div className="report-export-row">
        <label>
          Từ ngày
          <input type="date" value={from} max={to} onChange={(e) => setRange([e.target.value, to])} />
        </label>
        <label>
          Đến ngày
          <input type="date" value={to} min={from} onChange={(e) => setRange([from, e.target.value])} />
        </label>
        <button type="button" className="report-btn" onClick={() => download('appointments')} disabled={!!busy}>
          {busy === 'appointments' ? 'Đang xuất…' : '📋 Báo cáo lịch hẹn'}
        </button>
        <button type="button" className="report-btn is-revenue" onClick={() => download('revenue')} disabled={!!busy}>
          {busy === 'revenue' ? 'Đang xuất…' : '💰 Báo cáo doanh thu'}
        </button>
        <button type="button" className="report-btn is-pdf" onClick={() => printPdf('appointments')} disabled={!!busy}>
          {busy === 'appointments-pdf' ? 'Đang tạo…' : '🖨 Lịch hẹn (PDF)'}
        </button>
        <button type="button" className="report-btn is-pdf" onClick={() => printPdf('revenue')} disabled={!!busy}>
          {busy === 'revenue-pdf' ? 'Đang tạo…' : '🖨 Doanh thu (PDF)'}
        </button>
      </div>
      <p className="report-hint">
        Lịch hẹn: từng lịch kèm trạng thái (có "Không đến"), phí và thanh toán, cuối file là bảng tổng hợp.
        Doanh thu: theo ngày, theo chuyên khoa và theo hình thức thanh toán. Tối đa 1 năm mỗi lần.
      </p>
      {message && (
        <div className={`report-msg ${message.type === 'error' ? 'is-error' : ''}`} role="status">{message.text}</div>
      )}
    </section>
  );
};

export default ReportExport;
