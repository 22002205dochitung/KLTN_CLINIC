import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { API_BASE } from '../../config/api';
import './HomeStore.css';

const SLIDES = ['bia.png', 'bia2.png', 'bia3.png'];
// icon per specialty (matched on the name, works for specialties added later too)
const DEPT_ICONS = [
  [/tim/i, '❤️'], [/nhi/i, '🧸'], [/sản|phụ/i, '🤰'], [/mắt/i, '👁️'], [/da/i, '🧴'],
  [/tai|mũi|họng/i, '👂'], [/ngoại/i, '🩹'], [/răng|nha/i, '🦷'], [/thần kinh/i, '🧠'], [/nội|khám bệnh/i, '🩺']
];
const deptIcon = (name) => (DEPT_ICONS.find(([re]) => re.test(name)) || [null, '🏥'])[1];
const shortDept = (name) => String(name).replace(/^Khoa\s+/i, '').replace(/^Khám Bệnh - /i, '');
const initials = (name) => String(name || '').replace(/^(ThS\.)?\s*BS\.\s*/i, '').split(/\s+/).slice(-2).map((w) => w[0]).join('').toUpperCase();
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * HomeStore - trang chủ kiểu thương mại điện tử: banner + đặt lịch nhanh, cam kết dịch vụ,
 * danh mục chuyên khoa, bác sĩ nổi bật, quy trình khám và số liệu.
 */
const HomeStore = ({ user, onNavigate, onBook }) => {
  const [slide, setSlide] = useState(0);
  const [data, setData] = useState({ departments: [], doctors: [] });
  const [quick, setQuick] = useState({ departmentId: '', doctorId: '', date: '' });

  useEffect(() => {
    const t = setInterval(() => setSlide((s) => (s + 1) % SLIDES.length), 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    axios.get(`${API_BASE}/doctors`)
      .then((res) => setData({ departments: res.data.data.departments || [], doctors: res.data.data.doctors || [] }))
      .catch(() => {});
  }, []);

  const openDepartments = data.departments.filter((d) => d.doctor_count > 0);
  const quickDoctors = data.doctors.filter((d) => !quick.departmentId || String(d.department_id) === String(quick.departmentId));
  const featured = useMemo(() => [...data.doctors]
    .sort((a, b) => (b.avg_rating || 0) - (a.avg_rating || 0) || (b.experience_years || 0) - (a.experience_years || 0))
    .slice(0, 4), [data.doctors]);
  const stats = {
    doctors: data.doctors.length,
    departments: openDepartments.length,
    visits: data.doctors.reduce((s, d) => s + (d.patients_seen || 0), 0),
    rating: (() => {
      const rated = data.doctors.filter((d) => d.avg_rating !== null);
      return rated.length ? (rated.reduce((s, d) => s + d.avg_rating, 0) / rated.length).toFixed(1) : '5.0';
    })()
  };
  const canBook = !user || user.role !== 'doctor';

  const submitQuick = (e) => {
    e.preventDefault();
    onBook({
      departmentId: quick.departmentId || undefined,
      doctorId: quick.doctorId || undefined,
      appointmentDate: quick.date || undefined
    });
  };

  return (
    <div className="hs">
      {/* ---------- Hero: banner + quick booking ---------- */}
      <section className="hs-hero">
        <div className="hs-banner" aria-label="Banner">
          {SLIDES.map((img, i) => (
            <div
              key={img}
              className={`hs-slide ${i === slide ? 'is-on' : ''}`}
              style={{ backgroundImage: `url(${process.env.PUBLIC_URL}/img/${img})` }}
              aria-hidden={i !== slide}
            />
          ))}
          <div className="hs-dots">
            {SLIDES.map((img, i) => (
              <button key={img} type="button" className={i === slide ? 'is-on' : ''} onClick={() => setSlide(i)} aria-label={`Ảnh ${i + 1}`} />
            ))}
          </div>
        </div>

        <aside className="hs-quick">
          {canBook ? (
            <form onSubmit={submitQuick}>
              <h2>📅 Đặt lịch nhanh</h2>
              <p>Chọn chuyên khoa – hệ thống gợi ý giờ trống phù hợp.</p>
              <label>
                <span>Chuyên khoa</span>
                <select value={quick.departmentId} onChange={(e) => setQuick({ departmentId: e.target.value, doctorId: '', date: quick.date })}>
                  <option value="">Tất cả chuyên khoa</option>
                  {openDepartments.map((d) => <option key={d.id} value={d.id}>{shortDept(d.name)}</option>)}
                </select>
              </label>
              <label>
                <span>Bác sĩ</span>
                <select value={quick.doctorId} onChange={(e) => setQuick({ ...quick, doctorId: e.target.value })}>
                  <option value="">Bác sĩ bất kỳ</option>
                  {quickDoctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </label>
              <label>
                <span>Ngày khám</span>
                <input type="date" value={quick.date} min={ymd(new Date())} onChange={(e) => setQuick({ ...quick, date: e.target.value })} />
              </label>
              <button type="submit" className="hs-btn-cta">Tìm giờ trống →</button>
            </form>
          ) : (
            <div>
              <h2>👨‍⚕️ Xin chào bác sĩ</h2>
              <p>Gọi bệnh nhân vào khám từ bàn gọi số.</p>
              <button type="button" className="hs-btn-cta" onClick={() => onNavigate('doctor-queue')}>📢 Mở bàn gọi số</button>
            </div>
          )}
          <div className="hs-quick-links">
            <button type="button" onClick={() => onNavigate(user ? 'appointment-history' : 'booking')}>🗓️<span>Lịch hẹn</span></button>
            <button type="button" onClick={() => onNavigate(user ? 'my-qr' : 'booking')}>🔳<span>Mã QR</span></button>
            <button type="button" onClick={() => onNavigate('queue-board')}>📺<span>Hàng đợi</span></button>
            <button type="button" onClick={() => onNavigate('doctors')}>👨‍⚕️<span>Bác sĩ</span></button>
          </div>
        </aside>
      </section>

      {/* ---------- USP strip ---------- */}
      <section className="hs-usp">
        {[
          ['⚡', 'Đặt lịch 30 giây', 'Không cần xếp hàng lấy số'],
          ['✨', 'Gợi ý thông minh', 'Chuyên khoa & giờ phù hợp với bạn'],
          ['🔳', 'Check-in bằng QR', 'Quét mã, nhận số thứ tự ngay'],
          ['💳', 'Thanh toán VietQR', 'Chuyển khoản nhanh, an toàn']
        ].map(([icon, title, text]) => (
          <div key={title} className="hs-usp-item">
            <span aria-hidden="true">{icon}</span>
            <div><b>{title}</b><small>{text}</small></div>
          </div>
        ))}
      </section>

      {/* ---------- Specialties ---------- */}
      <section className="hs-section">
        <div className="hs-section-head">
          <h2>Chuyên khoa</h2>
          <button type="button" onClick={() => onNavigate('doctors')}>Xem tất cả →</button>
        </div>
        <div className="hs-depts">
          {data.departments.map((d) => (
            <button
              key={d.id}
              type="button"
              className={`hs-dept ${d.doctor_count ? '' : 'is-off'}`}
              onClick={() => onNavigate('doctors', { departmentId: d.id })}
              disabled={!d.doctor_count}
              title={d.description || ''}
            >
              <span className="hs-dept-icon" aria-hidden="true">{deptIcon(d.name)}</span>
              <b>{shortDept(d.name)}</b>
              <small>{d.doctor_count ? `${d.doctor_count} bác sĩ` : 'Sắp mở'}</small>
            </button>
          ))}
        </div>
      </section>

      {/* ---------- Featured doctors ---------- */}
      {featured.length > 0 && (
        <section className="hs-section">
          <div className="hs-section-head">
            <h2>Bác sĩ nổi bật</h2>
            <button type="button" onClick={() => onNavigate('doctors')}>Tìm bác sĩ khác →</button>
          </div>
          <div className="hs-doctors">
            {featured.map((d) => (
              <article key={d.id} className="hs-doc">
                <div className="hs-doc-avatar" aria-hidden="true">{initials(d.name)}</div>
                <h3>{d.name}</h3>
                <div className="hs-doc-dept">{shortDept(d.department_name)}</div>
                <div className="hs-doc-meta">
                  {d.avg_rating !== null ? <span className="hs-star">★ {d.avg_rating}</span> : <span className="hs-new">Mới</span>}
                  {d.experience_years !== null && <span>{d.experience_years} năm KN</span>}
                  {d.room && <span>P.{d.room}</span>}
                </div>
                {d.expertise.length > 0 && <p className="hs-doc-exp">{d.expertise.slice(0, 2).join(' · ')}</p>}
                {canBook && (
                  <button type="button" className="hs-btn-outline" onClick={() => onBook({ departmentId: d.department_id, doctorId: d.id })}>
                    Đặt lịch
                  </button>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {/* ---------- How it works ---------- */}
      <section className="hs-section">
        <div className="hs-section-head"><h2>Khám bệnh chỉ với 4 bước</h2></div>
        <ol className="hs-steps">
          {[
            ['Đặt lịch online', 'Chọn chuyên khoa, bác sĩ, giờ trống – hoặc để hệ thống gợi ý.'],
            ['Thanh toán', 'Chuyển khoản VietQR, trả tại quầy hoặc khám BHYT.'],
            ['Quét QR check-in', 'Đưa mã QR cho lễ tân, nhận số thứ tự.'],
            ['Vào khám', 'Theo dõi số trên điện thoại & màn hình, nghe loa gọi số.']
          ].map(([title, text], i) => (
            <li key={title}>
              <span className="hs-step-no">{i + 1}</span>
              <b>{title}</b>
              <small>{text}</small>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------- Numbers ---------- */}
      <section className="hs-stats">
        <div><b>{stats.doctors}</b><span>Bác sĩ</span></div>
        <div><b>{stats.departments}</b><span>Chuyên khoa</span></div>
        <div><b>{stats.visits}+</b><span>Lượt khám</span></div>
        <div><b>★ {stats.rating}</b><span>Đánh giá trung bình</span></div>
      </section>
    </div>
  );
};

export default HomeStore;
