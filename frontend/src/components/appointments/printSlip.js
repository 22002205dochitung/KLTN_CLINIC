import QRCode from 'qrcode';
import { bookingCodeOf } from './bookingCode';

const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const pad = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' or an ISO timestamp -> 'Thứ ba, 12/11/2026' (local date) */
const formatDay = (value) => {
  if (!value) return '';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  const names = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
  return `${names[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const money = (v) => `${Number(v || 0).toLocaleString('vi-VN')} đ`;

const payText = (a) => {
  const status = a.payment_status || a.paymentStatus;
  if (status === 'paid') return 'Đã thanh toán';
  if (status === 'refunded') return 'Đã hoàn tiền';
  return `Chưa thanh toán – trả tại quầy thu ngân hoặc chuyển khoản nội dung <b>THCT${esc(a.id)}</b>`;
};

/**
 * Opens a print-ready A5 appointment slip (with the check-in QR) in a new window.
 * Call it directly from a click handler so the browser does not block the window.
 * Returns false when the window could not be opened (pop-up blocked).
 */
export const printAppointmentSlip = (appointment) => {
  const a = appointment || {};
  const token = a.qr_code_token || a.qrCodeToken;
  const win = window.open('', '_blank', 'width=560,height=820');
  if (!win) return false;
  win.document.write('<p style="font-family:sans-serif;padding:24px">Đang tạo phiếu khám…</p>');

  const fee = a.consultation_fee ?? a.consultationFee;
  const printedAt = new Date();

  QRCode.toDataURL(String(token || ''), { width: 300, margin: 1 })
    .catch(() => '')
    .then((qr) => {
      const html = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<title>Phiếu khám ${esc(bookingCodeOf(a))}</title>
<style>
  @page { size: A5 portrait; margin: 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; color: #0f172a; }
  .slip { max-width: 128mm; margin: 0 auto; padding: 6mm; border: 1px dashed #94a3b8; border-radius: 4mm; }
  .head { display: flex; align-items: center; gap: 10px; border-bottom: 2px solid #108578; padding-bottom: 8px; }
  .head img { width: 46px; height: 46px; }
  .head h1 { margin: 0; font-size: 18px; color: #108578; }
  .head p { margin: 2px 0 0; font-size: 11px; color: #475569; }
  h2 { text-align: center; margin: 12px 0 2px; font-size: 20px; letter-spacing: 1px; }
  .code { text-align: center; font-size: 13px; color: #475569; margin-bottom: 10px; }
  .code .bk { font-size: 17px; color: #0f172a; letter-spacing: 1px; }
  table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  td { padding: 5px 0; vertical-align: top; border-bottom: 1px dotted #cbd5e1; }
  td:first-child { width: 34%; color: #475569; }
  td b { font-size: 14.5px; }
  .when { font-size: 16px; font-weight: 700; color: #108578; }
  .qr { text-align: center; margin: 12px 0 4px; }
  .qr img { width: 52mm; height: 52mm; }
  .qr p { margin: 4px 0 0; font-size: 12px; font-weight: 700; }
  .note { margin-top: 10px; padding: 8px 10px; background: #f1f5f9; border-radius: 3mm; font-size: 11.5px; line-height: 1.5; }
  .foot { margin-top: 8px; text-align: center; font-size: 10.5px; color: #64748b; }
  .actions { text-align: center; margin: 14px 0; }
  .actions button { padding: 8px 18px; font-size: 14px; cursor: pointer; }
  @media print { .actions { display: none; } .slip { border: none; } }
</style>
</head>
<body>
  <div class="actions"><button onclick="window.print()">🖨 In phiếu</button></div>
  <div class="slip">
    <div class="head">
      <img src="${esc(window.location.origin)}/icons/icon-192.png" alt="" />
      <div>
        <h1>THCT CLINIC</h1>
        <p>Hotline 1900-1234 · Hệ thống đặt lịch khám bệnh</p>
      </div>
    </div>
    <h2>PHIẾU KHÁM BỆNH</h2>
    <div class="code">Mã lịch hẹn: <b class="bk">${esc(bookingCodeOf(a))}</b></div>
    <table>
      <tr><td>Bệnh nhân</td><td><b>${esc(a.patient_name || a.patientName)}</b></td></tr>
      <tr><td>Số điện thoại</td><td>${esc(a.patient_phone || a.patientPhone)}</td></tr>
      <tr><td>Ngày khám</td><td class="when">${esc(formatDay(a.appointment_date || a.appointmentDate))}</td></tr>
      <tr><td>Khung giờ</td><td class="when">${esc(a.time_slot || a.timeSlot)}</td></tr>
      <tr><td>Bác sĩ</td><td>${esc(a.doctor_name || a.doctorName)}</td></tr>
      <tr><td>Chuyên khoa</td><td>${esc(a.department_name || a.departmentName)}</td></tr>
      ${fee != null ? `<tr><td>Phí khám</td><td>${esc(money(fee))}<br/><small>${payText(a)}</small></td></tr>` : ''}
    </table>
    ${qr ? `<div class="qr"><img src="${qr}" alt="Mã QR check-in" /><p>Đưa mã này cho lễ tân để check-in</p></div>` : ''}
    <div class="note">
      • Vui lòng đến trước giờ hẹn 10–15 phút và mang theo phiếu này.<br/>
      • Mỗi khung giờ có nhiều bệnh nhân: ai check-in trước được khám trước.<br/>
      • Cần đổi hoặc huỷ lịch: gọi hotline 1900-1234.
    </div>
    <div class="foot">In lúc ${pad(printedAt.getHours())}:${pad(printedAt.getMinutes())} ${pad(printedAt.getDate())}/${pad(printedAt.getMonth() + 1)}/${printedAt.getFullYear()}</div>
  </div>
  <script>
    window.addEventListener('load', function () { setTimeout(function () { window.focus(); window.print(); }, 300); });
  </script>
</body>
</html>`;
      win.document.open();
      win.document.write(html);
      win.document.close();
    });
  return true;
};

export default printAppointmentSlip;
