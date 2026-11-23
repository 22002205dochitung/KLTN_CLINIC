import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE } from '../../config/api';
import '../payment/CashierDesk.css';
import './RecommendationSettings.css';

const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('auth_token')}` });
const errorText = (err, fallback) => err?.response?.data?.error?.message || fallback;

// Groups shown on the page (keys of recommendation_settings)
const GROUPS = [
  { title: 'Chung', keys: ['enabled', 'history_months', 'min_score', 'max_suggestions', 'slot_suggestions'] },
  { title: 'Luật dựa trên lịch sử khám (rule-based)', keys: ['w_followup', 'w_frequency', 'w_recency', 'recency_days'] },
  { title: 'Dựa trên nội dung & hồ sơ (content-based)', keys: ['w_symptom', 'w_chronic', 'w_profile', 'child_age'] }
];
const ICONS = { followup: '🔁', frequency: '📊', recency: '🕘', symptom: '🩺', similar: '🧩', chronic: '❤️‍🩹', profile: '👤' };

/**
 * RecommendationSettings - admin page for the smart recommendation module:
 * weights & thresholds, specialty keywords, a dry run for a patient, and effectiveness stats.
 */
const RecommendationSettings = ({ onBack }) => {
  const [values, setValues] = useState(null);
  const [labels, setLabels] = useState({});
  const [departments, setDepartments] = useState([]);
  const [keywords, setKeywords] = useState({});
  const [stats, setStats] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    try {
      const [s, st] = await Promise.all([
        axios.get(`${API_BASE}/recommendations/settings`, { headers: authHeader() }),
        axios.get(`${API_BASE}/recommendations/stats`, { params: { days: 30 }, headers: authHeader() })
      ]);
      setValues(s.data.data.values);
      setLabels(s.data.data.labels);
      setDepartments(s.data.data.departments);
      setKeywords(Object.fromEntries(s.data.data.departments.map((d) => [d.id, d.keywords || ''])));
      setStats(st.data.data);
    } catch (err) {
      setNotice({ type: 'error', text: errorText(err, 'Không thể tải cấu hình gợi ý') });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const res = await axios.put(`${API_BASE}/recommendations/settings`, { values, keywords }, { headers: authHeader() });
      setNotice({ type: 'success', text: res.data.message });
      load();
    } catch (err) {
      setNotice({ type: 'error', text: errorText(err, 'Không thể lưu') });
    } finally {
      setSaving(false);
    }
  };

  if (!values) {
    return <div className="cashier-container"><div className="cashier-empty">{notice?.text || 'Đang tải…'}</div></div>;
  }

  return (
    <div className="cashier-container">
      <div className="cashier-header">
        <div>
          <h1>✨ Gợi ý lịch khám thông minh</h1>
          <p className="cashier-subtitle">Kết hợp luật (rule-based) và nội dung (content-based) – mỗi gợi ý đều có lý do giải thích được</p>
        </div>
        <div className="rs-head-actions">
          <button className="cashier-btn cashier-btn-primary" onClick={save} disabled={saving}>{saving ? 'Đang lưu…' : '💾 Lưu cấu hình'}</button>
          {onBack && <button className="cashier-btn cashier-btn-secondary" onClick={onBack}>← Về Dashboard</button>}
        </div>
      </div>

      {notice && <div className={`cashier-alert cashier-alert-${notice.type}`} role="status">{notice.text}</div>}

      {stats && (
        <div className="rs-stats">
          <div><b>{stats.total_bookings}</b><span>Lịch đặt 30 ngày qua</span></div>
          <div><b>{stats.from_suggestion}</b><span>Đặt từ gợi ý</span></div>
          <div className="is-main"><b>{stats.rate}%</b><span>Tỉ lệ chấp nhận gợi ý</span></div>
          <div><b>{stats.by_type.specialty} / {stats.by_type.slot} / {stats.by_type.followup}</b><span>Chuyên khoa / Khung giờ / Tái khám</span></div>
          <div><b>{stats.attended_from_suggestion}</b><span>Lịch từ gợi ý đã đến khám</span></div>
        </div>
      )}

      <div className="rs-layout">
        <section className="rs-card">
          <h2>Tham số & trọng số</h2>
          {GROUPS.map((g) => (
            <fieldset key={g.title} className="rs-group">
              <legend>{g.title}</legend>
              {g.keys.map((k) => (
                <label key={k} className="rs-row">
                  <span>{labels[k] || k}</span>
                  {k === 'enabled' ? (
                    <input type="checkbox" checked={Boolean(values.enabled)} onChange={(e) => setValues((v) => ({ ...v, enabled: e.target.checked ? 1 : 0 }))} />
                  ) : (
                    <input
                      className="cashier-input"
                      type="number"
                      value={values[k]}
                      onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value === '' ? '' : Number(e.target.value) }))}
                    />
                  )}
                </label>
              ))}
            </fieldset>
          ))}
          <p className="cashier-hint">
            Điểm của một chuyên khoa = tổng điểm các luật khớp. Chỉ hiện chuyên khoa đạt điểm tối thiểu, sắp xếp từ cao xuống thấp.
            Hẹn tái khám nên có trọng số lớn nhất để luôn đứng đầu.
          </p>
        </section>

        <section className="rs-card">
          <h2>Từ khoá triệu chứng theo chuyên khoa</h2>
          <p className="cashier-hint">Ngăn cách bằng dấu phẩy. Triệu chứng bệnh nhân nhập chứa từ khoá nào thì chuyên khoa đó được cộng điểm.</p>
          {departments.map((d) => (
            <label key={d.id} className="rs-kw">
              <span>{d.name} {Number(d.doctor_count) === 0 && <em>(chưa có bác sĩ)</em>}</span>
              <textarea
                className="cashier-input"
                rows="2"
                value={keywords[d.id] || ''}
                onChange={(e) => setKeywords((k) => ({ ...k, [d.id]: e.target.value }))}
              />
            </label>
          ))}
        </section>
      </div>

      <PreviewPanel />
    </div>
  );
};

/** Dry run: what would a patient (by phone) see for given symptoms */
const PreviewPanel = () => {
  const [phone, setPhone] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await axios.get(`${API_BASE}/recommendations/preview`, { params: { phone, symptoms }, headers: authHeader() });
      setResult(res.data.data);
    } catch (err) {
      setError(errorText(err, 'Không chạy được'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rs-card rs-preview">
      <h2>🧪 Chạy thử gợi ý</h2>
      <form className="rs-preview-form" onSubmit={run}>
        <input className="cashier-input" placeholder="SĐT bệnh nhân (bỏ trống = khách mới)" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} />
        <input className="cashier-input" placeholder="Triệu chứng, VD: ho, đau họng" value={symptoms} onChange={(e) => setSymptoms(e.target.value)} />
        <button className="cashier-btn cashier-btn-primary" type="submit" disabled={busy}>{busy ? 'Đang chạy…' : 'Chạy thử'}</button>
      </form>
      {error && <div className="cashier-alert cashier-alert-error">{error}</div>}
      {result && (
        <div className="rs-result">
          <p className="cashier-hint">
            {phone && !result.patient_found ? 'Không tìm thấy bệnh nhân có SĐT này – chạy như khách mới. ' : ''}
            Đã phân tích {result.analysed?.visits || 0} lần khám{result.analysed?.age !== null && result.analysed?.age !== undefined ? ` · ${result.analysed.age} tuổi` : ''}
            {result.analysed?.symptoms?.length ? ` · từ khoá: ${result.analysed.symptoms.join(', ')}` : ''}
          </p>
          {result.specialties.length === 0 && <p>Không có gợi ý nào đạt điểm tối thiểu.</p>}
          {result.specialties.map((s, i) => (
            <div key={s.department_id} className="rs-item">
              <div className="rs-item-head"><b>#{i + 1} {s.department_name}</b><span className="rs-score">{s.score} điểm</span></div>
              <ul>
                {s.reasons.map((r) => <li key={r.type + r.text}>{ICONS[r.type] || '•'} <b>+{r.points}</b> {r.text}</li>)}
              </ul>
              {s.doctor && <div className="cell-sub">👨‍⚕️ {s.doctor.name} – {s.doctor.reason}</div>}
              {s.next_slot && <div className="cell-sub">📅 {s.next_slot.date} · {s.next_slot.time_slot} – {s.next_slot.reasons.join(', ')}</div>}
            </div>
          ))}
          {(result.unavailable || []).map((u) => (
            <div key={u.department_id} className="rs-item is-off"><b>{u.department_name}</b> – {u.score} điểm nhưng chưa có bác sĩ</div>
          ))}
        </div>
      )}
    </section>
  );
};

export default RecommendationSettings;
