import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE } from '../../config/api';
import MedicalRecordDetails from './MedicalRecordDetails';
import '../payment/CashierDesk.css';

const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('auth_token')}` });
const errorText = (err, fallback) =>
  err?.response?.data?.error?.message || err?.response?.data?.message || fallback;
const formatDate = (value) => (value ? new Date(value).toLocaleDateString('vi-VN') : '—');

/**
 * PatientRecordsLookup - Tra cứu hồ sơ y tế cho nhân viên (lễ tân, bác sĩ, admin)
 *   1. Tìm bệnh nhân theo tên / SĐT / email
 *   2. Xem danh sách hồ sơ khám của bệnh nhân
 *   3. Mở chi tiết hồ sơ (chẩn đoán, đơn thuốc)
 *
 * Trước đây trang "Hồ sơ y tế" luôn gọi API dành cho bệnh nhân nên nhân viên chỉ thấy lỗi 403.
 */
const PatientRecordsLookup = ({ initialPatient = null }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [patient, setPatient] = useState(initialPatient);
  const [records, setRecords] = useState([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState(null);
  const [error, setError] = useState('');

  const search = async (e) => {
    e?.preventDefault();
    if (query.trim().length < 2) {
      setError('Nhập ít nhất 2 ký tự để tìm kiếm');
      return;
    }
    try {
      setSearching(true);
      setError('');
      const res = await axios.get(`${API_BASE}/users/search`, { params: { query: query.trim() }, headers: authHeader() });
      setResults(res.data.users || []);
      setSearched(true);
    } catch (err) {
      setError(errorText(err, 'Không thể tìm kiếm bệnh nhân'));
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    if (!patient) return;
    let cancelled = false;
    (async () => {
      try {
        setLoadingRecords(true);
        setError('');
        const res = await axios.get(`${API_BASE}/medical-records/patient/${patient.id}`, { headers: authHeader() });
        if (!cancelled) setRecords(res.data.data?.records || []);
      } catch (err) {
        if (!cancelled) setError(errorText(err, 'Không thể tải hồ sơ bệnh nhân'));
      } finally {
        if (!cancelled) setLoadingRecords(false);
      }
    })();
    return () => { cancelled = true; };
  }, [patient]);

  if (selectedRecordId) {
    return <MedicalRecordDetails medicalRecordId={selectedRecordId} onBack={() => setSelectedRecordId(null)} />;
  }

  return (
    <div className="cashier-container">
      <div className="cashier-header">
        <div>
          <h1>🔍 Tra cứu hồ sơ bệnh nhân</h1>
          <p className="cashier-subtitle">Tìm theo họ tên, số điện thoại hoặc email</p>
        </div>
        {patient && (
          <button className="cashier-btn cashier-btn-secondary" onClick={() => { setPatient(null); setRecords([]); }}>
            ← Danh sách tìm kiếm
          </button>
        )}
      </div>

      {error && <div className="cashier-alert cashier-alert-error">⚠️ {error}</div>}

      {!patient && (
        <>
          <form className="cashier-filters" onSubmit={search}>
            <input
              type="search"
              className="cashier-input cashier-search"
              placeholder="VD: Nguyễn Văn An, 0912345678…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            <button type="submit" className="cashier-btn cashier-btn-primary" disabled={searching}>
              {searching ? 'Đang tìm…' : 'Tìm kiếm'}
            </button>
          </form>

          {searched && results.length === 0 && (
            <div className="cashier-empty">Không tìm thấy bệnh nhân phù hợp</div>
          )}

          {results.length > 0 && (
            <div className="cashier-table-wrap">
              <table className="cashier-table">
                <thead>
                  <tr>
                    <th>Bệnh nhân</th>
                    <th>Số điện thoại</th>
                    <th className="num">Lịch hẹn</th>
                    <th>Lần khám gần nhất</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {results.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div className="cell-main">{u.fullName}</div>
                        <div className="cell-sub">{u.isGuest ? 'Khách (chưa có tài khoản)' : u.email}</div>
                      </td>
                      <td>{u.phone}</td>
                      <td className="num">{u.appointmentCount}</td>
                      <td>{formatDate(u.lastAppointmentDate)}</td>
                      <td className="actions">
                        <button className="cashier-btn cashier-btn-primary cashier-btn-sm" onClick={() => setPatient(u)}>
                          Xem hồ sơ
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {patient && (
        <>
          <dl className="cashier-info" style={{ marginBottom: 16 }}>
            <dt>Bệnh nhân</dt><dd><b>{patient.fullName}</b></dd>
            <dt>Số điện thoại</dt><dd>{patient.phone}</dd>
          </dl>
          {loadingRecords ? (
            <div className="cashier-empty">Đang tải hồ sơ…</div>
          ) : records.length === 0 ? (
            <div className="cashier-empty">Bệnh nhân chưa có hồ sơ khám nào</div>
          ) : (
            <div className="cashier-table-wrap">
              <table className="cashier-table">
                <thead>
                  <tr>
                    <th>Ngày khám</th>
                    <th>Bác sĩ / Chuyên khoa</th>
                    <th>Chẩn đoán</th>
                    <th>Tái khám</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r.medical_record_id}>
                      <td>
                        <div className="cell-main">{formatDate(r.appointment_date)}</div>
                        <div className="cell-sub">{r.time_slot}</div>
                      </td>
                      <td>
                        <div className="cell-main">{r.doctor_fullname}</div>
                        <div className="cell-sub">{r.department_name || '—'}</div>
                      </td>
                      <td>{r.diagnosis}</td>
                      <td>{formatDate(r.reexamination_date)}</td>
                      <td className="actions">
                        <button className="cashier-btn cashier-btn-secondary cashier-btn-sm" onClick={() => setSelectedRecordId(r.medical_record_id)}>
                          Chi tiết
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default PatientRecordsLookup;
