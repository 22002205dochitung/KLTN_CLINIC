import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE } from '../../config/api';
import './DoctorDirectory.css';

const pad = (n) => String(n).padStart(2, '0');
const dm = (ymd) => { const [, m, d] = ymd.split('-'); return `${d}/${m}`; };
const initials = (name) => String(name || '').replace(/^(ThS\.)?\s*BS\.\s*/i, '').split(/\s+/).slice(-2).map((w) => w[0]).join('').toUpperCase();
const SHORT_DAY = { 'Thứ hai': 'T2', 'Thứ ba': 'T3', 'Thứ tư': 'T4', 'Thứ năm': 'T5', 'Thứ sáu': 'T6', 'Thứ bảy': 'T7', 'Chủ nhật': 'CN' };
const stars = (r) => '★'.repeat(Math.round(r)) + '☆'.repeat(5 - Math.round(r));

/**
 * DoctorDirectory - "Tìm kiếm chuyên khoa/bác sĩ" (use case 3.2.2.3, public).
 * Search by doctor name, specialty, expertise or symptom; view profile, working hours,
 * free places for the next 7 days and reviews; book with the doctor in one click.
 */
const DoctorDirectory = ({ onBook, initialQuery = '', initialDepartmentId = '' }) => {
  const [query, setQuery] = useState(initialQuery);
  const [departmentId, setDepartmentId] = useState(initialDepartmentId);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null); // doctor id

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      axios.get(`${API_BASE}/doctors`, { params: { q: query.trim() || undefined, departmentId: departmentId || undefined } })
        .then((res) => { if (!cancelled) { setData(res.data.data); setError(''); } })
        .catch(() => { if (!cancelled) setError('Không tải được danh sách bác sĩ. Vui lòng thử lại.'); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, departmentId]);

  const doctors = data?.doctors || [];
  const departments = data?.departments || [];

  return (
    <div className="dd">
      <header className="dd-head">
        <h1>👨‍⚕️ Tìm bác sĩ & chuyên khoa</h1>
        <p>Xem thông tin bác sĩ, lịch làm việc và chỗ trống trước khi đặt lịch khám.</p>
        <div className="dd-search">
          <span aria-hidden="true">🔍</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tên bác sĩ, chuyên khoa hoặc triệu chứng (VD: tim mạch, ho, đau ngực)"
            aria-label="Tìm bác sĩ hoặc chuyên khoa"
          />
        </div>
      </header>

      <div className="dd-chips" role="group" aria-label="Lọc theo chuyên khoa">
        <button type="button" className={!departmentId ? 'is-on' : ''} onClick={() => setDepartmentId('')}>Tất cả</button>
        {departments.map((d) => (
          <button
            key={d.id}
            type="button"
            className={`${String(departmentId) === String(d.id) ? 'is-on' : ''} ${data?.matched_departments?.includes(d.id) ? 'is-match' : ''}`}
            onClick={() => setDepartmentId(String(departmentId) === String(d.id) ? '' : String(d.id))}
            disabled={d.doctor_count === 0}
            title={d.doctor_count === 0 ? 'Chuyên khoa chưa có bác sĩ nhận lịch' : d.description || ''}
          >
            {d.name.replace(/^Khoa\s+/i, '')} <small>{d.doctor_count}</small>
          </button>
        ))}
      </div>

      {error && <div className="dd-error" role="alert">{error}</div>}

      {!error && !loading && doctors.length === 0 && (
        <div className="dd-empty" role="status">
          <div aria-hidden="true">🔎</div>
          <b>Không tìm thấy kết quả phù hợp</b>
          <span>Thử từ khoá khác, bỏ bớt dấu hoặc chọn "Tất cả" chuyên khoa.</span>
        </div>
      )}

      <div className={`dd-grid ${loading ? 'is-loading' : ''}`} aria-busy={loading}>
        {doctors.map((d) => (
          <article key={d.id} className="dd-card">
            <div className="dd-card-top">
              <div className="dd-avatar" aria-hidden="true">{initials(d.name)}</div>
              <div>
                <h2>{d.name}</h2>
                <div className="dd-sub">{d.degree}</div>
                <div className="dd-dept">{d.department_name}{d.room ? ` · Phòng ${d.room}` : ''}</div>
              </div>
            </div>
            <div className="dd-meta">
              {d.avg_rating !== null
                ? <span className="dd-rating" title={`${d.avg_rating}/5`}>{stars(d.avg_rating)} {d.avg_rating} ({d.review_count})</span>
                : <span className="dd-muted">Chưa có đánh giá</span>}
              {d.experience_years !== null && <span>· {d.experience_years} năm kinh nghiệm</span>}
            </div>
            {d.expertise.length > 0 && (
              <ul className="dd-tags">{d.expertise.slice(0, 4).map((x) => <li key={x}>{x}</li>)}</ul>
            )}
            <div className="dd-actions">
              <button type="button" className="dd-btn" onClick={() => setSelected(d.id)}>Xem lịch làm việc</button>
              <button type="button" className="dd-btn is-primary" onClick={() => onBook({ departmentId: d.department_id, doctorId: d.id })}>Đặt lịch</button>
            </div>
          </article>
        ))}
      </div>

      {selected && <DoctorProfile id={selected} onClose={() => setSelected(null)} onBook={onBook} />}
    </div>
  );
};

const DoctorProfile = ({ id, onClose, onBook }) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    axios.get(`${API_BASE}/doctors/${id}`)
      .then((res) => setData(res.data.data))
      .catch(() => setError('Không tải được thông tin bác sĩ'));
  }, [id]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const d = data?.doctor;
  const book = (date) => onBook({ departmentId: d.department_id, doctorId: d.id, appointmentDate: date });

  return (
    <div className="dd-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dd-modal" role="dialog" aria-modal="true" aria-label={d ? d.name : 'Thông tin bác sĩ'}>
        <button type="button" className="dd-close" onClick={onClose} aria-label="Đóng">×</button>
        {error && <div className="dd-error">{error}</div>}
        {!data && !error && <div className="dd-muted">Đang tải…</div>}
        {d && (
          <>
            <div className="dd-card-top">
              <div className="dd-avatar is-big" aria-hidden="true">{initials(d.name)}</div>
              <div>
                <h2>{d.name}</h2>
                <div className="dd-sub">{d.degree}{d.experience_years !== null ? ` · ${d.experience_years} năm kinh nghiệm` : ''}</div>
                <div className="dd-dept">{d.department_name}{d.room ? ` · Phòng khám ${d.room}` : ''}</div>
                <div className="dd-meta">
                  {d.avg_rating !== null ? <span className="dd-rating">{stars(d.avg_rating)} {d.avg_rating}/5 · {d.review_count} đánh giá</span> : <span className="dd-muted">Chưa có đánh giá</span>}
                  {d.patients_seen > 0 && <span>· đã khám {d.patients_seen} lượt</span>}
                </div>
              </div>
            </div>

            {d.bio && <p className="dd-bio">{d.bio}</p>}
            {d.expertise.length > 0 && (
              <>
                <h3>Thế mạnh chuyên môn</h3>
                <ul className="dd-tags">{d.expertise.map((x) => <li key={x}>{x}</li>)}</ul>
              </>
            )}

            <h3>Chỗ trống 7 ngày tới <small>– bấm một ngày để đặt lịch</small></h3>
            <div className="dd-days">
              {data.next_days.map((day) => (
                <button
                  key={day.date}
                  type="button"
                  className={`dd-day ${day.free_places > 0 ? '' : 'is-off'}`}
                  disabled={day.free_places === 0}
                  onClick={() => book(day.date)}
                  title={day.closed_reason || (day.first_free ? `Sớm nhất ${day.first_free}` : '')}
                >
                  <b>{SHORT_DAY[day.weekday] || day.weekday}</b>
                  <span>{dm(day.date)}</span>
                  <small>{day.free_places > 0 ? `${day.free_places} chỗ` : (day.closed_reason ? 'Nghỉ' : 'Kín lịch')}</small>
                </button>
              ))}
            </div>

            <h3>Lịch làm việc hằng tuần</h3>
            <table className="dd-week">
              <tbody>
                {data.schedule.weekly.map((w) => (
                  <tr key={w.weekday}>
                    <th scope="row">{w.label}</th>
                    <td>{w.closed ? <span className="dd-muted">Nghỉ</span> : w.hours.length ? w.hours.map((h) => `${h.start}–${h.end}`).join(', ') : <span className="dd-muted">Không trực</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.upcoming_leaves.length > 0 && (
              <p className="dd-leave">📅 Nghỉ phép: {data.upcoming_leaves.map(dm).join(', ')}</p>
            )}

            {data.reviews.length > 0 && (
              <>
                <h3>Bệnh nhân nhận xét</h3>
                <ul className="dd-reviews">
                  {data.reviews.map((r, i) => (
                    <li key={i}><span className="dd-rating">{stars(r.rating)}</span> “{r.comment}” <small>– {r.patient}, {dm(r.at)}</small></li>
                  ))}
                </ul>
              </>
            )}

            <div className="dd-actions">
              <button type="button" className="dd-btn is-primary is-big" onClick={() => book(undefined)}>📅 Đặt lịch với bác sĩ này</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default DoctorDirectory;
export { pad };
