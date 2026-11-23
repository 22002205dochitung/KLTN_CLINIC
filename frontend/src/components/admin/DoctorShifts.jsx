import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE } from '../../config/api';
import CalendarPicker from '../common/CalendarPicker';
import '../payment/CashierDesk.css';
import './DoctorShifts.css';

const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('auth_token')}` });
const errorText = (err, fallback) => err?.response?.data?.error?.message || fallback;
const WEEKDAYS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const TIMES = [];
for (let m = 6 * 60; m <= 21 * 60; m += 30) TIMES.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
const pad = (n) => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const dmy = (ymd) => String(ymd).split('-').reverse().join('/');

const TimeRange = ({ start, end, onStart, onEnd }) => (
  <>
    <select className="cashier-input ds-time" value={start} onChange={(e) => onStart(e.target.value)} aria-label="Giờ bắt đầu">
      {TIMES.slice(0, -1).map((t) => <option key={t} value={t}>{t}</option>)}
    </select>
    <span aria-hidden="true">–</span>
    <select className="cashier-input ds-time" value={end} onChange={(e) => onEnd(e.target.value)} aria-label="Giờ kết thúc">
      {TIMES.slice(1).map((t) => <option key={t} value={t}>{t}</option>)}
    </select>
  </>
);

/**
 * DoctorShifts - Quản lý ca trực (admin).
 * Weekly shifts + shifts on specific dates; bookable time slots follow the shifts.
 */
const DoctorShifts = ({ onBack }) => {
  const [doctors, setDoctors] = useState([]);
  const [doctorId, setDoctorId] = useState('');
  const [data, setData] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState({}); // weekday -> { start, end }
  const [dateForm, setDateForm] = useState({ date: '', start: '08:00', end: '12:00', note: '' });

  useEffect(() => {
    axios.get(`${API_BASE}/appointments/doctors`)
      .then((res) => {
        const list = res.data.doctors || [];
        setDoctors(list);
        if (list.length) setDoctorId(String(list[0].doctor_id));
      })
      .catch(() => setNotice({ type: 'error', text: 'Không thể tải danh sách bác sĩ' }));
  }, []);

  const load = useCallback(async () => {
    if (!doctorId) return;
    try {
      const res = await axios.get(`${API_BASE}/doctor-shifts`, { params: { doctorId }, headers: authHeader() });
      setData(res.data.data);
    } catch (err) {
      setNotice({ type: 'error', text: errorText(err, 'Không thể tải ca trực') });
    }
  }, [doctorId]);

  useEffect(() => { setData(null); load(); }, [load]);

  const act = async (fn) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fn();
      const affected = res.data?.data?.affected || [];
      setNotice({ type: affected.length ? 'warn' : 'success', text: res.data.message, affected });
      await load();
      return true;
    } catch (err) {
      setNotice({ type: 'error', text: errorText(err, 'Thao tác thất bại'), affected: err?.response?.data?.error?.affected || [] });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const addWeekly = async (weekday) => {
    const f = adding[weekday] || { start: '08:00', end: '12:00' };
    const ok = await act(() => axios.post(`${API_BASE}/doctor-shifts`, { doctorId: Number(doctorId), weekday, startTime: f.start, endTime: f.end }, { headers: authHeader() }));
    if (ok) setAdding((a) => ({ ...a, [weekday]: undefined }));
  };

  const addDate = async (e) => {
    e.preventDefault();
    if (!dateForm.date) return setNotice({ type: 'error', text: 'Chọn ngày' });
    const ok = await act(() => axios.post(`${API_BASE}/doctor-shifts`, {
      doctorId: Number(doctorId), workDate: dateForm.date, startTime: dateForm.start, endTime: dateForm.end, note: dateForm.note
    }, { headers: authHeader() }));
    if (ok) setDateForm((f) => ({ ...f, date: '', note: '' }));
    return undefined;
  };

  const remove = (s) => {
    const when = s.work_date ? `ngày ${dmy(s.work_date)}` : `mỗi ${WEEKDAYS[s.weekday]}`;
    if (!window.confirm(`Xoá ca ${s.start_time}–${s.end_time} ${when}?`)) return;
    act(() => axios.delete(`${API_BASE}/doctor-shifts/${s.id}`, { headers: authHeader() }));
  };

  const template = () => act(() => axios.post(`${API_BASE}/doctor-shifts/template`, { doctorId: Number(doctorId) }, { headers: authHeader() }));

  const doctor = doctors.find((d) => String(d.doctor_id) === String(doctorId));
  const closed = data?.closed_weekdays || [0];

  return (
    <div className="cashier-container">
      <div className="cashier-header">
        <div>
          <h1>🗓️ Ca trực bác sĩ</h1>
          <p className="cashier-subtitle">Bệnh nhân chỉ đặt được khung giờ nằm trong ca trực. Ngày không có ca sẽ bị khoá trên lịch đặt khám.</p>
        </div>
        {onBack && <button className="cashier-btn cashier-btn-secondary" onClick={onBack}>← Về Dashboard</button>}
      </div>

      <div className="cashier-filters">
        <select className="cashier-input" value={doctorId} onChange={(e) => setDoctorId(e.target.value)} aria-label="Chọn bác sĩ">
          {doctors.map((d) => (
            <option key={d.doctor_id} value={d.doctor_id}>{d.full_name} – {d.department_name}</option>
          ))}
        </select>
      </div>

      {notice && (
        <div className={`cashier-alert ${notice.type === 'error' ? 'cashier-alert-error' : notice.type === 'warn' ? 'ds-alert-warn' : 'cashier-alert-success'}`} role="status">
          <div>{notice.text}</div>
          {notice.affected?.length > 0 && (
            <>
              <div className="ds-affected-title">
                {notice.type === 'error' ? 'Lịch hẹn cần xử lý trước:' : `⚠️ ${notice.affected.length} lịch hẹn đã đặt nằm ngoài ca trực mới – gọi bệnh nhân đổi giờ:`}
              </div>
              <ul className="ds-affected">
                {notice.affected.map((a) => (
                  <li key={a.id}>#{a.id} · {a.date || dmy(a.d)} {a.time_slot} · {a.patient_name} · {a.phone}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {!data ? (
        <div className="cashier-empty">Đang tải…</div>
      ) : (
        <>
          {data.weekly.length === 0 && data.dates.length === 0 && (
            <div className="ds-default">
              <div>
                <b>{doctor?.full_name}</b> chưa khai báo ca trực – đang nhận lịch theo giờ mặc định của phòng khám
                (08:00–12:00, 14:00–17:00 các ngày mở cửa).
              </div>
              <button className="cashier-btn cashier-btn-primary" onClick={template} disabled={busy}>⚡ Tạo lịch mặc định (T2–T7)</button>
            </div>
          )}

          <section className="ds-card">
            <h2>Lịch trực hằng tuần</h2>
            <table className="cashier-table ds-week">
              <tbody>
                {ORDER.map((wd) => {
                  const shifts = data.weekly.filter((s) => s.weekday === wd);
                  const f = adding[wd];
                  return (
                    <tr key={wd}>
                      <th scope="row">{WEEKDAYS[wd]}</th>
                      <td>
                        {closed.includes(wd) ? (
                          <span className="ds-muted">Phòng khám nghỉ</span>
                        ) : (
                          <div className="ds-chips">
                            {shifts.length === 0 && !f && <span className="ds-muted">Không trực</span>}
                            {shifts.map((s) => (
                              <span key={s.id} className="ds-chip">
                                {s.start_time}–{s.end_time}
                                {s.booked > 0 && <small>{s.booked} lịch</small>}
                                <button type="button" onClick={() => remove(s)} aria-label={`Xoá ca ${s.start_time}–${s.end_time} ${WEEKDAYS[wd]}`} disabled={busy}>×</button>
                              </span>
                            ))}
                            {f ? (
                              <span className="ds-add">
                                <TimeRange
                                  start={f.start}
                                  end={f.end}
                                  onStart={(v) => setAdding((a) => ({ ...a, [wd]: { ...f, start: v } }))}
                                  onEnd={(v) => setAdding((a) => ({ ...a, [wd]: { ...f, end: v } }))}
                                />
                                <button type="button" className="cashier-btn cashier-btn-primary cashier-btn-sm" onClick={() => addWeekly(wd)} disabled={busy}>Lưu</button>
                                <button type="button" className="cashier-btn cashier-btn-ghost cashier-btn-sm" onClick={() => setAdding((a) => ({ ...a, [wd]: undefined }))}>Huỷ</button>
                              </span>
                            ) : (
                              <button
                                type="button"
                                className="cashier-btn cashier-btn-ghost cashier-btn-sm"
                                onClick={() => setAdding((a) => ({ ...a, [wd]: shifts.length ? { start: '14:00', end: '17:00' } : { start: '08:00', end: '12:00' } }))}
                              >
                                ＋ Thêm ca
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <section className="ds-card">
            <h2>Ca theo ngày cụ thể</h2>
            <p className="cashier-hint">Ngày có ca riêng sẽ dùng ca riêng thay cho lịch tuần (VD: trực bù, đổi ca, chỉ làm buổi sáng).</p>
            <form className="ds-date-form" onSubmit={addDate}>
              <CalendarPicker value={dateForm.date} onChange={(v) => setDateForm((f) => ({ ...f, date: v }))} min={today()} disabledWeekdays={closed} placeholder="Chọn ngày" />
              <span className="ds-range">
                <TimeRange
                  start={dateForm.start}
                  end={dateForm.end}
                  onStart={(v) => setDateForm((f) => ({ ...f, start: v }))}
                  onEnd={(v) => setDateForm((f) => ({ ...f, end: v }))}
                />
              </span>
              <input className="cashier-input" placeholder="Ghi chú (không bắt buộc)" value={dateForm.note} onChange={(e) => setDateForm((f) => ({ ...f, note: e.target.value }))} maxLength={255} />
              <button className="cashier-btn cashier-btn-primary" type="submit" disabled={busy}>＋ Thêm ca</button>
            </form>
            {data.dates.length === 0 ? (
              <p className="ds-muted">Chưa có ca theo ngày.</p>
            ) : (
              <div className="ds-chips">
                {data.dates.map((s) => (
                  <span key={s.id} className="ds-chip is-date">
                    {dmy(s.work_date)} · {s.start_time}–{s.end_time}
                    {s.note && <em>{s.note}</em>}
                    {s.booked > 0 && <small>{s.booked} lịch</small>}
                    <button type="button" onClick={() => remove(s)} aria-label={`Xoá ca ngày ${dmy(s.work_date)}`} disabled={busy}>×</button>
                  </span>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default DoctorShifts;
