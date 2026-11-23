import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE } from '../../config/api';
import './SmartSuggestions.css';

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const shortDate = (ymd) => {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  return `${WEEKDAYS[new Date(y, m - 1, d).getDay()]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
};
const ICONS = { followup: '🔁', frequency: '📊', recency: '🕘', symptom: '🩺', similar: '🧩', chronic: '❤️‍🩹', profile: '👤' };
const authHeaders = () => {
  const token = localStorage.getItem('auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/**
 * SmartSuggestions - "Gợi ý cho bạn" panel of the booking form.
 * Asks the recommendation API (history + symptoms) and lets the patient apply a suggestion
 * in one click. Failures are silent: the patient simply chooses by hand (use case 3.2.2.10).
 */
const SmartSuggestions = ({ symptoms, patientPhone, onApply, appliedKey }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      setLoading(true);
      const params = {};
      if (symptoms && symptoms.trim().length >= 2) params.symptoms = symptoms.trim();
      if (patientPhone && /^0\d{9}$/.test(patientPhone)) params.phone = patientPhone;
      axios.get(`${API_BASE}/recommendations/specialties`, { params, headers: authHeaders() })
        .then((res) => { if (!cancelled) setData(res.data.data); })
        .catch(() => { if (!cancelled) setData(null); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, symptoms ? 600 : 0);
    return () => { cancelled = true; clearTimeout(t); };
  }, [symptoms, patientPhone]);

  if (!data || !data.enabled || hidden) {
    return hidden ? (
      <button type="button" className="ss-show" onClick={() => setHidden(false)}>✨ Xem gợi ý lịch khám</button>
    ) : null;
  }

  const list = data.specialties || [];
  const unavailable = data.unavailable || [];
  if (!list.length && !unavailable.length) {
    return (
      <div className="ss ss-empty" role="note">
        ✨ {data.has_history
          ? 'Chưa có gợi ý phù hợp – hãy mô tả triệu chứng để hệ thống gợi ý chuyên khoa.'
          : 'Mô tả triệu chứng ở trên, hệ thống sẽ gợi ý chuyên khoa và lịch khám phù hợp.'}
        {loading && <span className="ss-loading"> Đang phân tích…</span>}
      </div>
    );
  }

  return (
    <section className="ss" aria-label="Gợi ý lịch khám">
      <div className="ss-head">
        <div>
          <strong>✨ Gợi ý cho bạn</strong>
          <span className="ss-sub">
            {data.has_history ? `Dựa trên ${data.analysed.visits} lần khám trong ${data.analysed.months} tháng` : 'Dựa trên triệu chứng bạn mô tả'}
            {data.analysed?.symptoms?.length ? ' và triệu chứng bạn nhập' : ''}
            {loading ? ' · đang cập nhật…' : ''}
          </span>
        </div>
        <button type="button" className="ss-hide" onClick={() => setHidden(true)}>Tự chọn</button>
      </div>

      <div className="ss-list">
        {list.map((s, i) => {
          const key = `${s.department_id}-${s.doctor?.id || ''}`;
          const applied = appliedKey && appliedKey.startsWith(`${s.department_id}-`);
          return (
            <article key={key} className={`ss-card ${i === 0 ? 'is-top' : ''} ${applied ? 'is-applied' : ''}`}>
              <div className="ss-card-head">
                <span className="ss-dept">{s.department_name}</span>
                {i === 0 && <span className="ss-badge">Phù hợp nhất</span>}
                {s.source === 'followup' && <span className="ss-badge is-followup">Tái khám</span>}
              </div>
              <ul className="ss-reasons">
                {s.reasons.slice(0, 3).map((r) => (
                  <li key={r.type + r.text}><span aria-hidden="true">{ICONS[r.type] || '•'}</span> {r.text}</li>
                ))}
              </ul>
              {s.doctor && (
                <div className="ss-doctor">👨‍⚕️ <b>{s.doctor.name}</b> <span>– {s.doctor.reason}</span></div>
              )}
              {s.next_slot && (
                <div className="ss-slot">📅 Lịch trống gần nhất: <b>{shortDate(s.next_slot.date)} · {s.next_slot.time_slot.slice(0, 5)}</b></div>
              )}
              <div className="ss-actions">
                {s.next_slot && s.doctor && (
                  <button
                    type="button"
                    className="ss-btn is-primary"
                    onClick={() => onApply({
                      key,
                      departmentId: s.department_id,
                      doctorId: s.doctor.id,
                      appointmentDate: s.next_slot.date,
                      timeSlot: s.next_slot.time_slot,
                      source: s.source === 'followup' ? 'followup' : 'specialty'
                    })}
                  >
                    {applied ? '✓ Đã chọn' : 'Đặt giờ này'}
                  </button>
                )}
                <button
                  type="button"
                  className="ss-btn"
                  onClick={() => onApply({
                    key,
                    departmentId: s.department_id,
                    doctorId: s.doctor ? s.doctor.id : '',
                    source: s.source === 'followup' ? 'followup' : 'specialty'
                  })}
                >
                  Chọn khoa này
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {unavailable.length > 0 && (
        <p className="ss-note">
          ℹ️ Triệu chứng của bạn cũng phù hợp với {unavailable.map((u) => u.department_name).join(', ')} – hiện chưa có bác sĩ nhận lịch online, vui lòng liên hệ quầy lễ tân.
        </p>
      )}
      <p className="ss-disclaimer">Gợi ý chỉ mang tính tham khảo, không thay thế chẩn đoán của bác sĩ.</p>
    </section>
  );
};

export default SmartSuggestions;
