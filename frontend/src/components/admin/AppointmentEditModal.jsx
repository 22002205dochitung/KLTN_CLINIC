import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { API_BASE } from '../../config/api';
import CalendarPicker from '../common/CalendarPicker';

const pad = (n) => String(n).padStart(2, '0');
/** DB date (ISO string at local midnight) -> 'YYYY-MM-DD' in local time */
export const toLocalYmd = (value) => {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const todayYmd = () => toLocalYmd(new Date());

/**
 * AppointmentEditModal - admin edits doctor / date / time slot / symptoms / status of a booking.
 * The server re-checks every booking rule; this form only offers valid choices up front.
 */
const AppointmentEditModal = ({ appointment, onClose, onSaved }) => {
  const locked = appointment.status === 'completed';
  const scheduleLocked = locked || appointment.status === 'checked_in';
  const original = useMemo(() => ({
    doctorId: String(appointment.doctor_id),
    appointmentDate: toLocalYmd(appointment.appointment_date),
    timeSlot: appointment.time_slot
  }), [appointment]);

  const [form, setForm] = useState({
    ...original,
    symptoms: appointment.symptoms || '',
    status: appointment.status
  });
  const [departments, setDepartments] = useState([]);
  const [slots, setSlots] = useState([]);
  const [offDays, setOffDays] = useState({ weekdays: [], dates: [] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    axios.get(`${API_BASE}/appointments/doctors`)
      .then((res) => setDepartments((res.data.departments || []).filter((d) => d.doctors?.length)))
      .catch(() => setDepartments([]));
  }, []);

  useEffect(() => {
    if (!form.doctorId) return;
    axios.get(`${API_BASE}/doctor-leaves/public`, { params: { doctorId: form.doctorId } })
      .then((res) => {
        const d = res.data?.data || {};
        setOffDays({ weekdays: d.closed_weekdays || [], dates: d.leave_dates || [] });
      })
      .catch(() => {});
  }, [form.doctorId]);

  useEffect(() => {
    if (!form.doctorId || !form.appointmentDate || scheduleLocked) { setSlots([]); return; }
    let cancelled = false;
    axios.get(`${API_BASE}/appointments/slots`, { params: { doctorId: form.doctorId, date: form.appointmentDate } })
      .then((res) => { if (!cancelled) setSlots(res.data.slots || []); })
      .catch(() => { if (!cancelled) setSlots([]); });
    return () => { cancelled = true; };
  }, [form.doctorId, form.appointmentDate, scheduleLocked]);

  const isOriginalSlot = (slot) => form.doctorId === original.doctorId
    && form.appointmentDate === original.appointmentDate
    && slot === original.timeSlot;

  const set = (field, value) => setForm((prev) => {
    const next = { ...prev, [field]: value };
    if (field === 'doctorId' || field === 'appointmentDate') {
      // keep the current slot only while it is still the original booking
      next.timeSlot = next.doctorId === original.doctorId && next.appointmentDate === original.appointmentDate
        ? original.timeSlot
        : '';
    }
    return next;
  });

  const save = async (e) => {
    e.preventDefault();
    if (!scheduleLocked && form.status === 'booked' && !form.timeSlot) {
      setError('Vui lòng chọn khung giờ');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body = { symptoms: form.symptoms };
      if (!scheduleLocked) {
        body.status = form.status;
        body.doctorId = Number(form.doctorId);
        body.appointmentDate = form.appointmentDate;
        body.timeSlot = form.timeSlot;
      }
      const res = await axios.put(`${API_BASE}/admin/appointments/${appointment.id}`, body, {
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
      });
      onSaved(res.data.message);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Không thể lưu thay đổi');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const onKey = (ev) => { if (ev.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="aem-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="aem" role="dialog" aria-modal="true" aria-labelledby="aem-title" onSubmit={save}>
        <div className="aem-head">
          <h2 id="aem-title">✏️ Sửa lịch hẹn #{appointment.id}</h2>
          <button type="button" className="aem-x" onClick={onClose} aria-label="Đóng">×</button>
        </div>

        <div className="aem-patient">
          <b>{appointment.patient_name}</b> · {appointment.patient_phone}
        </div>

        {locked && <div className="aem-note">Lịch hẹn đã khám xong – không thể sửa.</div>}
        {!locked && scheduleLocked && (
          <div className="aem-note">Bệnh nhân đã check-in và đang trong hàng đợi – chỉ sửa được triệu chứng.</div>
        )}

        <label className="aem-field">
          <span>Bác sĩ</span>
          <select value={form.doctorId} onChange={(e) => set('doctorId', e.target.value)} disabled={scheduleLocked}>
            {departments.length === 0 && <option value={form.doctorId}>{appointment.doctor_name}</option>}
            {departments.map((dep) => (
              <optgroup key={dep.id} label={dep.name}>
                {dep.doctors.map((doc) => (
                  <option key={doc.doctor_id} value={String(doc.doctor_id)}>{doc.full_name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <div className="aem-field">
          <span>Ngày khám</span>
          {scheduleLocked ? (
            <input value={form.appointmentDate.split('-').reverse().join('/')} disabled readOnly />
          ) : (
            <CalendarPicker
              value={form.appointmentDate}
              onChange={(v) => set('appointmentDate', v)}
              min={todayYmd()}
              disabledWeekdays={offDays.weekdays}
              disabledDates={offDays.dates.filter((d) => d !== original.appointmentDate || form.doctorId !== original.doctorId)}
            />
          )}
        </div>

        <div className="aem-field">
          <span>Khung giờ</span>
          {scheduleLocked ? (
            <input value={form.timeSlot} disabled readOnly />
          ) : slots.length === 0 ? (
            <p className="aem-muted">Chọn bác sĩ và ngày để xem khung giờ.</p>
          ) : (
            <div className="aem-slots">
              {slots.map((s) => {
                const mine = isOriginalSlot(s.time_slot);
                // the patient's own booking counts in "taken", so their original slot stays selectable
                const ok = s.available || (mine && !s.past && !s.closed);
                return (
                  <button
                    key={s.time_slot}
                    type="button"
                    className={`aem-slot ${form.timeSlot === s.time_slot ? 'is-on' : ''}`}
                    disabled={!ok}
                    onClick={() => set('timeSlot', s.time_slot)}
                    title={s.past ? 'Đã qua' : s.full && !mine ? 'Đã đủ người' : `Còn ${s.remaining}/${s.capacity}`}
                  >
                    {s.time_slot}
                    {!s.past && <small>{mine ? 'lịch hiện tại' : s.full ? 'đã đủ' : `còn ${s.remaining}`}</small>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <label className="aem-field">
          <span>Trạng thái</span>
          <select value={form.status} onChange={(e) => set('status', e.target.value)} disabled={scheduleLocked}>
            {scheduleLocked && <option value={form.status}>{form.status === 'completed' ? 'Hoàn thành' : 'Đã check-in'}</option>}
            {!scheduleLocked && <option value="booked">Đã xác nhận – chờ check-in</option>}
            {!scheduleLocked && <option value="cancelled">Đã huỷ</option>}
          </select>
        </label>

        <label className="aem-field">
          <span>Triệu chứng</span>
          <textarea rows="3" maxLength="500" value={form.symptoms} onChange={(e) => set('symptoms', e.target.value)} disabled={locked} />
        </label>

        {error && <div className="aem-error" role="alert">{error}</div>}

        <div className="aem-actions">
          <button type="button" className="aem-btn" onClick={onClose}>Đóng</button>
          {!locked && (
            <button type="submit" className="aem-btn is-primary" disabled={saving}>
              {saving ? 'Đang lưu…' : '💾 Lưu thay đổi'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
};

export default AppointmentEditModal;
