import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './SmartBookingSuggestion.css';

import { API_BASE } from '../../config/api';

const DEPARTMENT_KEYWORDS = {
  'Tim mạch': ['đau ngực', 'tim đập nhanh', 'huyết áp', 'khó thở', 'choáng váng', 'ngất xỉu', 'mệt mỏi'],
  'Tiêu hóa': ['đau bụng', 'tiêu chảy', 'táo bón', 'nôn mửa', 'ợ hơi', 'đầy hơi', 'buồn nôn', 'dạ dày'],
  'Hô hấp': ['ho', 'khó thở', 'đau họng', 'sổ mũi', 'nghẹt mũi', 'viêm phổi', 'hen suyễn', 'sốt'],
  'Thần kinh': ['đau đầu', 'chóng mặt', 'mất ngủ', 'căng thẳng', 'lo âu', 'run tay', 'tê liệt', 'buồn ngủ'],
  'Nội tiết': ['tiểu đường', 'tăng cân', 'giảm cân', 'khát nước', 'vô sinh', 'mệt mỏi'],
  'Cơ xương khớp': ['đau khớp', 'đau lưng', 'đau cổ', 'gãy xương', 'bong gân', 'thoái hóa', 'khớp'],
  'Da liễu': ['ngứa', 'phát ban', 'mụn', 'nấm', 'viêm da', 'dị ứng da', 'da đỏ'],
  'Tai mũi họng': ['đau tai', 'ù tai', 'nghe kém', 'chảy máu cam', 'viêm amidan', 'ngạt mũi'],
  'Mắt': ['mờ mắt', 'đau mắt', 'ngứa mắt', 'đỏ mắt', 'chảy nước mắt', 'mỏi mắt'],
  'Răng hàm mặt': ['đau răng', 'sưng lợi', 'chảy máu chân răng', 'sâu răng', 'nướu'],
  'Nhi': ['sốt', 'tiêu chảy ở trẻ', 'ho ở trẻ', 'biếng ăn', 'chậm phát triển', 'đau bụng trẻ'],
  'Phụ sản': ['mang thai', 'khám thai', 'đau bụng dưới', 'rong kinh', 'vô sinh', 'rối loạn kinh nguyệt'],
  'Nội tổng quát': ['sốt', 'mệt mỏi', 'khó ngủ', 'ho', 'đau bụng', 'chán ăn', 'mệt', 'đau người']
};

const getDepartmentLabel = (name) => {
  if (!name) return 'Nội tổng quát';
  return name.charAt(0).toUpperCase() + name.slice(1);
};

const SmartBookingSuggestion = ({ onBookAppointment, onClose }) => {
  const [step, setStep] = useState(1);
  const [symptoms, setSymptoms] = useState('');
  const [suggestions, setSuggestions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [doctors, setDoctors] = useState([]);

  useEffect(() => {
    loadDepartmentsAndDoctors();
  }, []);

  const loadDepartmentsAndDoctors = async () => {
    try {
      const response = await axios.get(`${API_BASE}/appointments/doctors`);
      if (response.data.success) {
        setDepartments(response.data.departments || []);
        setDoctors(response.data.doctors || []);
      }
    } catch (error) {
      console.error('Error loading doctors data:', error);
    }
  };

  const getDepartmentByName = (departmentName) => {
    if (!departmentName) return null;

    return departments.find((dept) => {
      const normalizedDeptName = dept.name?.toLowerCase() || '';
      const normalizedTarget = departmentName.toLowerCase();
      return normalizedDeptName === normalizedTarget || normalizedDeptName.includes(normalizedTarget) || normalizedTarget.includes(normalizedDeptName);
    }) || null;
  };

  const analyzeSymptomsAI = (symptomText) => {
    const text = symptomText.toLowerCase();
    const scores = [];

    Object.entries(DEPARTMENT_KEYWORDS).forEach(([departmentName, keywords]) => {
      let matchingCount = 0;
      const matchedKeywords = [];

      keywords.forEach((keyword) => {
        if (text.includes(keyword.toLowerCase())) {
          matchingCount += 1;
          matchedKeywords.push(keyword);
        }
      });

      if (matchingCount > 0) {
        const deptInfo = getDepartmentByName(departmentName) || {
          id: null,
          name: departmentName,
          doctor_count: 0
        };

        scores.push({
          department: departmentName,
          departmentId: deptInfo.id,
          confidence: Math.min(95, 60 + matchingCount * 12),
          reason: `Phát hiện ${matchingCount} triệu chứng phù hợp với ${departmentName}`,
          matchedKeywords: matchedKeywords.slice(0, 3)
        });
      }
    });

    if (!scores.length) {
      const fallbackDept = departments.find((dept) => dept.name?.toLowerCase().includes('nội')) || departments[0];
      return [{
        department: fallbackDept?.name || 'Nội tổng quát',
        departmentId: fallbackDept?.id || null,
        confidence: 70,
        reason: 'Triệu chứng chung, nên khám nội tổng quát để được tư vấn sơ bộ.',
        matchedKeywords: ['triệu chứng chung']
      }];
    }

    return scores
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3);
  };

  const getRecommendedDoctors = (departmentName) => {
    if (!departmentName) {
      return doctors.slice(0, 2);
    }

    const departmentDoctors = doctors.filter((doctor) => {
      const deptName = (doctor.department_name || '').toLowerCase();
      const target = departmentName.toLowerCase();
      return deptName === target || deptName.includes(target) || target.includes(deptName);
    });

    return departmentDoctors.length ? departmentDoctors.slice(0, 2) : doctors.slice(0, 2);
  };

  const getOptimalTime = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const date = tomorrow.toISOString().split('T')[0];
    const isUrgent = /cấp cứu|đau dữ dội|đau rất nhiều|khó thở nghiêm trọng/.test(symptoms.toLowerCase());

    return {
      date,
      time: isUrgent ? '07:30' : '08:00',
      reason: isUrgent
        ? 'Khẩn cấp nên ưu tiên khám sớm để được đánh giá kịp thời.'
        : 'Buổi sáng ít người, bác sĩ có thời gian thăm khám kỹ hơn.'
    };
  };

  const handleAnalyze = () => {
    if (!symptoms.trim()) {
      alert('Vui lòng nhập triệu chứng!');
      return;
    }

    setLoading(true);

    setTimeout(() => {
      const analysis = analyzeSymptomsAI(symptoms);
      const topSuggestion = analysis[0];
      const recommendationDoctors = getRecommendedDoctors(topSuggestion.department);

      setSuggestions({
        departments: analysis,
        doctors: recommendationDoctors,
        optimalTime: getOptimalTime(),
        urgency: /cấp cứu|đau dữ dội|khó thở|choáng váng|ngất/.test(symptoms.toLowerCase())
          ? 'Cao - Nên khám ngay'
          : 'Bình thường'
      });

      setLoading(false);
      setStep(2);
    }, 1200);
  };

  const handleBooking = () => {
    const topDept = suggestions?.departments?.[0];
    const topDoctor = suggestions?.doctors?.[0];

    if (!topDept) return;

    if (onBookAppointment) {
      onBookAppointment({
        departmentId: topDept.departmentId || null,
        department: topDept.department,
        doctorId: topDoctor?.doctor_id || null,
        doctorName: topDoctor ? `${topDoctor.degree || 'BS'} ${topDoctor.full_name}` : null,
        appointmentDate: suggestions.optimalTime.date,
        timeSlot: suggestions.optimalTime.time,
        symptoms: symptoms.trim()
      });
    }
  };

  return (
    <div className="smart-booking-container">
      <div className="smart-booking-header">
        <h2>🤖 Gợi ý khám thông minh</h2>
        <p>AI phân tích triệu chứng và gợi ý khoa, bác sĩ, thời gian phù hợp nhất</p>
        {onClose && (
          <button className="close-btn" onClick={onClose}>✕</button>
        )}
      </div>

      {step === 1 && (
        <div className="symptoms-input-section">
          <h3>Bước 1: Mô tả triệu chứng của bạn</h3>
          <textarea
            className="symptoms-textarea"
            placeholder="Ví dụ: Tôi bị đau ngực, khó thở và mệt mỏi trong 2 ngày qua..."
            value={symptoms}
            onChange={(e) => setSymptoms(e.target.value)}
            rows="6"
          />

          <div className="common-symptoms">
            <p><strong>Gợi ý:</strong> Chọn triệu chứng phổ biến</p>
            <div className="symptom-tags">
              {['Đau đầu', 'Sốt', 'Ho', 'Đau bụng', 'Khó thở', 'Đau ngực', 'Mệt mỏi'].map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className="symptom-tag"
                  onClick={() => setSymptoms((prev) => `${prev}${prev ? ', ' : ''}${tag.toLowerCase()}`)}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            className="btn-analyze"
            onClick={handleAnalyze}
            disabled={loading}
          >
            {loading ? '🔄 Đang phân tích...' : '🔍 Phân tích triệu chứng'}
          </button>
        </div>
      )}

      {step === 2 && suggestions && (
        <div className="suggestions-section">
          <h3>Bước 2: Kết quả phân tích AI</h3>

          {suggestions.urgency === 'Cao - Nên khám ngay' && (
            <div className="urgency-alert">
              ⚠️ <strong>Khẩn cấp:</strong> Triệu chứng của bạn cần được khám sớm!
            </div>
          )}

          <div className="dept-suggestions">
            <h4>Chuyên khoa gợi ý:</h4>
            {suggestions.departments.map((dept, idx) => (
              <div key={`${dept.department}-${idx}`} className={`dept-card ${idx === 0 ? 'recommended' : ''}`}>
                <div className="dept-header">
                  <span className="dept-name">{getDepartmentLabel(dept.department)}</span>
                  <span
                    className="confidence-badge"
                    style={{
                      backgroundColor: dept.confidence >= 80 ? '#10b981' : dept.confidence >= 60 ? '#f59e0b' : '#6b7280'
                    }}
                  >
                    {dept.confidence}% phù hợp
                  </span>
                </div>
                <p className="dept-reason">{dept.reason}</p>
                {dept.matchedKeywords && (
                  <div className="matched-keywords">
                    {dept.matchedKeywords.map((keyword, index) => (
                      <span key={`${keyword}-${index}`} className="keyword-chip">{keyword}</span>
                    ))}
                  </div>
                )}
                {idx === 0 && <span className="recommended-badge">⭐ Khuyến nghị</span>}
              </div>
            ))}
          </div>

          <div className="doctor-suggestions">
            <h4>Bác sĩ đề xuất:</h4>
            {suggestions.doctors.map((doctor, idx) => (
              <div key={`${doctor.doctor_id || idx}`} className="doctor-card">
                <div className="doctor-avatar">👨‍⚕️</div>
                <div className="doctor-info">
                  <strong>{doctor.degree || 'BS'} {doctor.full_name}</strong>
                  <p>Khoa: {doctor.department_name || 'Chuyên khoa phù hợp'}</p>
                  <p>⭐ {doctor.rating || '4.8'}/5.0</p>
                </div>
              </div>
            ))}
          </div>

          <div className="time-suggestion">
            <h4>⏰ Thời gian khám tối ưu:</h4>
            <div className="time-card">
              <p><strong>Ngày:</strong> {new Date(suggestions.optimalTime.date).toLocaleDateString('vi-VN')}</p>
              <p><strong>Giờ:</strong> {suggestions.optimalTime.time}</p>
              <p className="time-reason">💡 {suggestions.optimalTime.reason}</p>
            </div>
          </div>

          <div className="action-buttons">
            <button type="button" className="btn-back" onClick={() => setStep(1)}>
              ← Sửa triệu chứng
            </button>
            <button type="button" className="btn-book" onClick={handleBooking}>
              📅 Đặt lịch ngay
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SmartBookingSuggestion;
