import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE } from '../../config/api';
import './DoctorQueue.css';

const pad = (n) => String(n).padStart(2, '0');
const hhmm = (v) => {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const authHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` } });

/**
 * DoctorQueue - the doctor's calling desk (hospital style).
 *
 *  📢 Gọi số tiếp theo  -> the lowest waiting number is shown full screen on the lobby TV and read out
 *  🔁 Gọi lại           -> announce the same number again
 *  🚫 Vắng mặt          -> the patient did not come; moved to "Lỡ lượt", can be called again later
 *  🩺 Bắt đầu khám      -> opens the examination flow for the called patient
 * Only one patient can be called into the room at a time; the next call is possible after
 * the examination is completed or the patient is marked absent.
 */
const DoctorQueue = ({ onStartExam, onOpenBoard }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/queue/console`, authHeaders());
      setData(res.data.data);
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error?.message || 'Không thể tải hàng đợi' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const act = async (path, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await axios.post(`${API_BASE}/queue/${path}`, {}, authHeaders());
      setMsg({ type: 'success', text: res.data.message });
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error?.message || 'Thao tác thất bại' });
    } finally {
      setBusy(false);
      load();
    }
  };

  if (loading) {
    return <div className="dq"><div className="dq-loading">Đang tải hàng đợi…</div></div>;
  }
  if (!data) {
    return (
      <div className="dq">
        {msg && <div className={`dq-msg is-${msg.type}`} role="alert">{msg.text}</div>}
        <button type="button" className="dq-btn" onClick={load}>Thử lại</button>
      </div>
    );
  }

  const { doctor, current, waiting, missed } = data;
  const next = waiting[0];

  return (
    <div className="dq">
      <header className="dq-head">
        <div>
          <h1>📢 Gọi số khám bệnh</h1>
          <p>
            <span className="dq-room">Phòng {doctor.room || '—'}</span>
            {doctor.name}{doctor.department ? ` · ${doctor.department}` : ''}
          </p>
        </div>
        <div className="dq-head-actions">
          {onOpenBoard && <button type="button" className="dq-btn is-ghost" onClick={onOpenBoard}>🖥️ Màn hình sảnh</button>}
          <button type="button" className="dq-btn is-ghost" onClick={load}>🔄 Làm mới</button>
        </div>
      </header>

      <div className="dq-stats">
        <div><b>{waiting.length}</b><span>Đang chờ</span></div>
        <div className={missed.length ? 'is-warn' : ''}><b>{missed.length}</b><span>Lỡ lượt</span></div>
        <div><b>{data.done_count}</b><span>Đã khám</span></div>
        <div><b>{data.total}</b><span>Đã cấp số</span></div>
      </div>

      {msg && <div className={`dq-msg is-${msg.type}`} role="status">{msg.text}</div>}

      <section className={`dq-current ${current ? 'is-calling' : ''}`} aria-live="polite">
        {current ? (
          <>
            <div className="dq-current-label">ĐANG MỜI VÀO PHÒNG {doctor.room}</div>
            <div className="dq-current-main">
              <div className="dq-current-number">{pad(current.number)}</div>
              <div className="dq-current-info">
                <div className="dq-current-name">{current.patient_name}</div>
                <div className="dq-muted">
                  {current.patient_phone || 'Không có SĐT'} · Khung giờ {current.time_slot} · Check-in {hhmm(current.checked_in_at)}
                </div>
                {current.symptoms && <div className="dq-symptoms">Triệu chứng: {current.symptoms}</div>}
                <div className="dq-muted">Đã gọi {current.call_count} lần · lần cuối {hhmm(current.called_at)}</div>
              </div>
            </div>
            <div className="dq-actions">
              <button type="button" className="dq-btn is-primary is-big" disabled={busy} onClick={() => onStartExam && onStartExam(current)}>
                🩺 Bắt đầu khám
              </button>
              <button type="button" className="dq-btn is-big" disabled={busy} onClick={() => act('recall')}>
                🔁 Gọi lại
              </button>
              <button
                type="button"
                className="dq-btn is-danger is-big"
                disabled={busy}
                onClick={() => act('skip', `Số ${pad(current.number)} – ${current.patient_name} không có mặt?\nBệnh nhân sẽ chuyển sang danh sách "Lỡ lượt" và có thể gọi lại sau.`)}
              >
                🚫 Vắng mặt
              </button>
            </div>
          </>
        ) : (
          <div className="dq-empty-room">
            <div className="dq-current-label">PHÒNG {doctor.room} ĐANG TRỐNG</div>
            <button
              type="button"
              className="dq-btn is-primary is-call"
              disabled={busy || !next}
              onClick={() => act('call-next')}
            >
              📢 Gọi số tiếp theo{next ? ` · ${pad(next.number)}` : ''}
            </button>
            <div className="dq-muted">
              {next
                ? `${next.patient_name} · khung giờ ${next.time_slot}. Màn hình sảnh sẽ hiện số và đọc loa mời vào phòng.`
                : missed.length
                  ? 'Không còn ai chờ. Nếu bệnh nhân lỡ lượt đã quay lại, bấm "Gọi vào khám" bên dưới.'
                  : 'Chưa có bệnh nhân nào check-in chờ khám.'}
            </div>
          </div>
        )}
      </section>

      <div className="dq-lists">
        <section className="dq-list">
          <h2>Đang chờ ({waiting.length})</h2>
          {waiting.length === 0 ? (
            <p className="dq-muted">Không có bệnh nhân chờ.</p>
          ) : (
            <ol>
              {waiting.map((p, i) => (
                <li key={p.appointment_id} className={i === 0 ? 'is-next' : ''}>
                  <span className="dq-num">{pad(p.number)}</span>
                  <span className="dq-who">
                    <b>{p.patient_name}</b>
                    <small>{p.time_slot} · check-in {hhmm(p.checked_in_at)}{p.symptoms ? ` · ${p.symptoms}` : ''}</small>
                  </span>
                  <button
                    type="button"
                    className="dq-btn is-small"
                    disabled={busy || !!current}
                    title={current ? 'Đang có bệnh nhân trong phòng' : 'Gọi trước (ưu tiên: người già, trẻ nhỏ, cấp cứu…)'}
                    onClick={() => act(`call/${p.appointment_id}`, i === 0 ? null : `Gọi ưu tiên số ${pad(p.number)} – ${p.patient_name} trước những người đang chờ?`)}
                  >
                    {i === 0 ? 'Gọi' : 'Gọi ưu tiên'}
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="dq-list is-missed">
          <h2>Lỡ lượt ({missed.length})</h2>
          {missed.length === 0 ? (
            <p className="dq-muted">Không có ai lỡ lượt.</p>
          ) : (
            <ol>
              {missed.map((p) => (
                <li key={p.appointment_id}>
                  <span className="dq-num">{pad(p.number)}</span>
                  <span className="dq-who">
                    <b>{p.patient_name}</b>
                    <small>Đã gọi {p.call_count} lần · lần cuối {hhmm(p.called_at)}</small>
                  </span>
                  <button
                    type="button"
                    className="dq-btn is-small"
                    disabled={busy || !!current}
                    title={current ? 'Đang có bệnh nhân trong phòng' : 'Bệnh nhân đã quay lại'}
                    onClick={() => act(`call/${p.appointment_id}`)}
                  >
                    Gọi vào khám
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <p className="dq-foot">Tự động cập nhật mỗi 5 giây · Chỉ mời một bệnh nhân vào phòng mỗi lần – khám xong (hoàn tất) hoặc bấm “Vắng mặt” để gọi số tiếp theo.</p>
    </div>
  );
};

export default DoctorQueue;
