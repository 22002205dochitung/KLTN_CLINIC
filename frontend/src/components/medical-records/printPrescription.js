import { getMedicalRecordDetails, getPrescriptions } from '../../services/medicalRecordsService';

const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const pad = (n) => String(n).padStart(2, '0');

const toDate = (value) => {
  if (!value) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const dmy = (value) => {
  const d = toDate(value);
  return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : '';
};

/** Age on the visit day; children under 6 are written in months (as on paper prescriptions) */
const ageText = (dob, at) => {
  const b = toDate(dob);
  if (!b) return '';
  const ref = toDate(at) || new Date();
  let months = (ref.getFullYear() - b.getFullYear()) * 12 + (ref.getMonth() - b.getMonth());
  if (ref.getDate() < b.getDate()) months -= 1;
  if (months < 0) return '';
  if (months < 72) return `${months} tháng`;
  return `${Math.floor(months / 12)} tuổi`;
};

const GENDER = { male: 'Nam', female: 'Nữ', other: 'Khác' };

/** The printable page (exported for tests) */
export const buildPrescriptionHtml = (record, prescriptions, origin = '') => {
  const r = record || {};
  const items = Array.isArray(prescriptions) ? prescriptions : [];
  const visit = toDate(r.appointment_date) || toDate(r.created_at) || new Date();

  const rows = items.length
    ? items.map((p, i) => `
      <tr>
        <td class="n">${i + 1}</td>
        <td>
          <div class="med">${esc(p.medicine_name)}</div>
          <div class="use">${esc([p.dosage, p.instructions].filter(Boolean).join(' – '))}</div>
        </td>
        <td class="q">${esc(p.quantity)} ${esc(p.unit || '')}</td>
      </tr>`).join('')
    : '<tr><td colspan="3" class="empty">Không kê thuốc</td></tr>';

  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<title>Đơn thuốc #${esc(r.medical_record_id)}</title>
<style>
  @page { size: A5 portrait; margin: 9mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Times New Roman", "Segoe UI", serif; color: #111827; font-size: 13.5px; }
  .page { max-width: 130mm; margin: 0 auto; padding: 4mm 2mm; }
  .head { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; }
  .clinic { display: flex; gap: 8px; align-items: center; }
  .clinic img { width: 40px; height: 40px; }
  .clinic b { display: block; font-size: 15px; color: #108578; font-family: "Segoe UI", Arial, sans-serif; }
  .clinic small { font-size: 11px; color: #4b5563; }
  .code { text-align: right; font-size: 11.5px; color: #374151; line-height: 1.5; }
  h1 { text-align: center; margin: 12px 0 10px; font-size: 22px; letter-spacing: 2px; }
  .info { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
  .info td { padding: 2px 0; vertical-align: top; }
  .info .k { color: #374151; white-space: nowrap; padding-right: 6px; width: 1%; }
  .dx { margin: 4px 0 8px; }
  .dx b { font-size: 14.5px; }
  .warn { color: #b91c1c; }
  .meds { width: 100%; border-collapse: collapse; margin-top: 6px; }
  .meds th { text-align: left; font-size: 12px; border-bottom: 1.5px solid #111827; padding: 4px 4px; }
  .meds td { border-bottom: 1px dotted #9ca3af; padding: 6px 4px; vertical-align: top; }
  .meds .n { width: 7%; text-align: center; }
  .meds .q { width: 22%; text-align: right; white-space: nowrap; font-weight: 700; }
  .med { font-weight: 700; font-size: 14px; }
  .use { font-style: italic; color: #374151; margin-top: 2px; }
  .empty { text-align: center; color: #6b7280; font-style: italic; }
  .total { text-align: right; font-size: 12px; margin-top: 4px; color: #374151; }
  .note { margin-top: 10px; line-height: 1.5; }
  .bottom { display: flex; justify-content: space-between; gap: 12px; margin-top: 14px; }
  .bottom .left { font-size: 12px; color: #374151; line-height: 1.6; max-width: 55%; }
  .sign { text-align: center; min-width: 45%; }
  .sign .date { font-style: italic; }
  .sign .role { font-weight: 700; margin-top: 2px; }
  .sign .hint { font-size: 11px; font-style: italic; color: #6b7280; }
  .sign .name { margin-top: 46px; font-weight: 700; }
  .sign .degree { font-size: 11.5px; color: #4b5563; }
  .foot { margin-top: 12px; padding-top: 6px; border-top: 1px solid #d1d5db; font-size: 11px; color: #4b5563; text-align: center; }
  .actions { text-align: center; margin: 12px 0; }
  .actions button { padding: 8px 18px; font-size: 14px; cursor: pointer; }
  @media print { .actions { display: none; } }
</style>
</head>
<body>
  <div class="actions"><button onclick="window.print()">🖨 In đơn thuốc</button></div>
  <div class="page">
    <div class="head">
      <div class="clinic">
        <img src="${esc(origin)}/icons/icon-192.png" alt="" />
        <div><b>THCT CLINIC</b><small>Hotline 1900-1234</small></div>
      </div>
      <div class="code">
        Mã hồ sơ: <b>#${esc(r.medical_record_id)}</b><br/>
        Lịch hẹn: #${esc(r.appointment_id)}<br/>
        ${esc(r.department_name)}${r.doctor_room ? ` · P.${esc(r.doctor_room)}` : ''}
      </div>
    </div>

    <h1>ĐƠN THUỐC</h1>

    <table class="info">
      <tr><td class="k">Họ tên:</td><td><b>${esc(String(r.patient_fullname || '').toUpperCase())}</b></td></tr>
      <tr><td class="k">Tuổi:</td><td>${esc(ageText(r.patient_dob, visit) || '……')}
        &nbsp;&nbsp; Giới tính: ${esc(GENDER[r.patient_gender] || '……')}
        &nbsp;&nbsp; SĐT: ${esc(r.patient_phone || '……')}</td></tr>
      ${r.exam_type === 'insurance' && r.insurance_number
        ? `<tr><td class="k">Số thẻ BHYT:</td><td>${esc(r.insurance_number)}</td></tr>` : ''}
      ${r.patient_allergies
        ? `<tr><td class="k">Dị ứng:</td><td class="warn"><b>${esc(r.patient_allergies)}</b></td></tr>` : ''}
    </table>
    <div class="dx">Chẩn đoán: <b>${esc(r.diagnosis)}</b></div>

    <table class="meds">
      <thead><tr><th class="n">STT</th><th>Tên thuốc – cách dùng</th><th class="q">Số lượng</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${items.length ? `<div class="total">Cộng khoản: ${items.length} loại thuốc</div>` : ''}

    ${r.note ? `<div class="note"><b>Lời dặn:</b> ${esc(r.note)}</div>` : ''}

    <div class="bottom">
      <div class="left">
        ${r.reexamination_date ? `<b>Tái khám ngày ${esc(dmy(r.reexamination_date))}</b><br/>` : ''}
        Khám lại xin mang theo đơn này.<br/>
        Không tự ý thay đổi liều thuốc.
      </div>
      <div class="sign">
        <div class="date">Ngày ${pad(visit.getDate())} tháng ${pad(visit.getMonth() + 1)} năm ${visit.getFullYear()}</div>
        <div class="role">BÁC SĨ ĐIỀU TRỊ</div>
        <div class="hint">(Ký, ghi rõ họ tên)</div>
        <div class="name">${esc(r.doctor_fullname)}</div>
        ${r.doctor_degree ? `<div class="degree">${esc(r.doctor_degree)}</div>` : ''}
      </div>
    </div>

    <div class="foot">Đơn thuốc dùng một lần · Mua thuốc tại quầy thu ngân THCT Clinic hoặc nhà thuốc</div>
  </div>
  <script>
    window.addEventListener('load', function () { setTimeout(function () { window.focus(); window.print(); }, 300); });
  </script>
</body>
</html>`;
};

/**
 * Opens a print-ready A5 prescription for one medical record in a new window.
 * Call it straight from a click handler (the window is opened before loading, so it is not blocked).
 * Returns false when the pop-up was blocked.
 */
export const printPrescription = (medicalRecordId) => {
  const win = window.open('', '_blank', 'width=600,height=860');
  if (!win) return false;
  win.document.write('<p style="font-family:sans-serif;padding:24px">Đang tạo đơn thuốc…</p>');

  Promise.all([getMedicalRecordDetails(medicalRecordId), getPrescriptions(medicalRecordId)])
    .then(([record, prescriptions]) => {
      win.document.open();
      win.document.write(buildPrescriptionHtml(record, prescriptions, window.location.origin));
      win.document.close();
    })
    .catch((err) => {
      win.document.open();
      win.document.write(`<p style="font-family:sans-serif;padding:24px;color:#b91c1c">Không tạo được đơn thuốc: ${esc(err?.message || 'lỗi không xác định')}</p>`);
      win.document.close();
    });
  return true;
};

export default printPrescription;
