import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE } from '../../config/api';
import '../payment/CashierDesk.css';

const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('auth_token')}` });
const errorText = (err, fallback) =>
  err?.response?.data?.error?.message || err?.response?.data?.message || fallback;

/**
 * ClinicCatalog - Quản lý chuyên khoa & bác sĩ (Admin)
 * Dùng các API có sẵn: /api/admin/departments (CRUD), /api/admin/doctors (GET, PUT).
 * Thêm bác sĩ mới: đổi vai trò tài khoản thành "Bác sĩ" trong Quản lý người dùng,
 * sau đó gán chuyên khoa tại đây.
 */
const ClinicCatalog = ({ initialTab = 'departments', onBack, onNavigate }) => {
  const [tab, setTab] = useState(initialTab);

  return (
    <div className="cashier-container">
      <div className="cashier-header">
        <div>
          <h1>🏥 Chuyên khoa & Bác sĩ</h1>
          <p className="cashier-subtitle">Quản lý danh mục khoa phòng và phân công bác sĩ</p>
        </div>
        {onBack && <button className="cashier-btn cashier-btn-secondary" onClick={onBack}>← Về Dashboard</button>}
      </div>

      <div className="cashier-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'departments'} className={`cashier-tab ${tab === 'departments' ? 'active' : ''}`} onClick={() => setTab('departments')}>
          Chuyên khoa
        </button>
        <button role="tab" aria-selected={tab === 'doctors'} className={`cashier-tab ${tab === 'doctors' ? 'active' : ''}`} onClick={() => setTab('doctors')}>
          Bác sĩ
        </button>
      </div>

      {tab === 'departments' ? <DepartmentsTab /> : <DoctorsTab onNavigate={onNavigate} />}
    </div>
  );
};

const DepartmentsTab = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ id: null, name: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_BASE}/admin/departments`, { headers: authHeader() });
      setItems(res.data.data || []);
    } catch (err) {
      setError(errorText(err, 'Không thể tải danh sách chuyên khoa'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Tên chuyên khoa không được để trống');
      return;
    }
    try {
      setSaving(true);
      setError('');
      const body = { name: form.name.trim(), description: form.description.trim() || null };
      if (form.id) {
        await axios.put(`${API_BASE}/admin/departments/${form.id}`, body, { headers: authHeader() });
        setMessage(`Đã cập nhật "${body.name}"`);
      } else {
        await axios.post(`${API_BASE}/admin/departments`, body, { headers: authHeader() });
        setMessage(`Đã thêm "${body.name}"`);
      }
      setForm({ id: null, name: '', description: '' });
      load();
    } catch (err) {
      setError(errorText(err, 'Không thể lưu chuyên khoa'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (dept) => {
    try {
      setError('');
      await axios.delete(`${API_BASE}/admin/departments/${dept.id}`, { headers: authHeader() });
      setMessage(`Đã xoá "${dept.name}"`);
      setConfirmDelete(null);
      load();
    } catch (err) {
      setError(errorText(err, 'Không thể xoá chuyên khoa'));
      setConfirmDelete(null);
    }
  };

  return (
    <>
      {message && <div className="cashier-alert cashier-alert-success">✓ {message}</div>}
      {error && <div className="cashier-alert cashier-alert-error">⚠️ {error}</div>}

      <form className="cashier-filters" onSubmit={save}>
        <input
          className="cashier-input"
          style={{ flex: '1 1 220px' }}
          placeholder="Tên chuyên khoa"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <input
          className="cashier-input"
          style={{ flex: '2 1 300px' }}
          placeholder="Mô tả (không bắt buộc)"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
        <button type="submit" className="cashier-btn cashier-btn-primary" disabled={saving}>
          {form.id ? 'Lưu thay đổi' : '+ Thêm chuyên khoa'}
        </button>
        {form.id && (
          <button type="button" className="cashier-btn cashier-btn-ghost" onClick={() => setForm({ id: null, name: '', description: '' })}>
            Huỷ sửa
          </button>
        )}
      </form>

      {loading ? (
        <div className="cashier-empty">Đang tải…</div>
      ) : (
        <div className="cashier-table-wrap">
          <table className="cashier-table">
            <thead>
              <tr>
                <th>Chuyên khoa</th>
                <th className="num">Số bác sĩ</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.id}>
                  <td>
                    <div className="cell-main">{d.name}</div>
                    <div className="cell-sub">{d.description}</div>
                  </td>
                  <td className="num">{d.doctor_count}</td>
                  <td className="actions">
                    {confirmDelete === d.id ? (
                      <>
                        <button className="cashier-btn cashier-btn-secondary cashier-btn-sm" onClick={() => setConfirmDelete(null)}>Không</button>{' '}
                        <button className="cashier-btn cashier-btn-danger cashier-btn-sm" onClick={() => remove(d)}>Xác nhận xoá</button>
                      </>
                    ) : (
                      <>
                        <button
                          className="cashier-btn cashier-btn-secondary cashier-btn-sm"
                          onClick={() => { setForm({ id: d.id, name: d.name, description: d.description || '' }); setMessage(''); }}
                        >
                          Sửa
                        </button>{' '}
                        <button
                          className="cashier-btn cashier-btn-danger cashier-btn-sm"
                          disabled={Number(d.doctor_count) > 0}
                          title={Number(d.doctor_count) > 0 ? 'Còn bác sĩ trong khoa, chuyển bác sĩ sang khoa khác trước' : ''}
                          onClick={() => { setConfirmDelete(d.id); setMessage(''); }}
                        >
                          Xoá
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};

const DoctorsTab = ({ onNavigate }) => {
  const [doctors, setDoctors] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [profileOf, setProfileOf] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [docRes, depRes] = await Promise.all([
        axios.get(`${API_BASE}/admin/doctors`, { headers: authHeader() }),
        axios.get(`${API_BASE}/admin/departments`, { headers: authHeader() })
      ]);
      setDoctors(docRes.data.data || []);
      setDepartments(depRes.data.data || []);
      setDrafts({});
    } catch (err) {
      setError(errorText(err, 'Không thể tải danh sách bác sĩ'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const draftOf = (doc) => drafts[doc.doctor_id] || { department_id: doc.department_id ?? '', degree: doc.degree ?? '' };
  const setDraft = (doc, patch) => setDrafts((d) => ({ ...d, [doc.doctor_id]: { ...draftOf(doc), ...patch } }));

  const save = async (doc) => {
    const draft = draftOf(doc);
    if (!draft.department_id) {
      setError('Vui lòng chọn chuyên khoa cho bác sĩ');
      return;
    }
    try {
      setSaving(doc.doctor_id);
      setError('');
      await axios.put(
        `${API_BASE}/admin/doctors/${doc.doctor_id}`,
        { department_id: Number(draft.department_id), degree: draft.degree.trim() || null },
        { headers: authHeader() }
      );
      setMessage(`Đã cập nhật ${doc.fullname}`);
      load();
    } catch (err) {
      setError(errorText(err, 'Không thể cập nhật bác sĩ'));
    } finally {
      setSaving(null);
    }
  };

  const unassigned = doctors.filter((d) => !d.department_id).length;

  return (
    <>
      <p className="cashier-subtitle" style={{ margin: '0 0 12px', fontSize: 14 }}>
        Thêm bác sĩ: vào{' '}
        <button type="button" className="cashier-btn cashier-btn-ghost cashier-btn-sm" onClick={() => onNavigate && onNavigate('user-management')}>
          Quản lý người dùng
        </button>{' '}
        đổi vai trò tài khoản thành "Bác sĩ", rồi gán chuyên khoa tại đây. Bác sĩ chưa có chuyên khoa sẽ không xuất hiện khi đặt lịch.
      </p>
      {unassigned > 0 && (
        <div className="cashier-alert cashier-alert-error">⚠️ {unassigned} bác sĩ chưa được gán chuyên khoa</div>
      )}
      {message && <div className="cashier-alert cashier-alert-success">✓ {message}</div>}
      {error && <div className="cashier-alert cashier-alert-error">⚠️ {error}</div>}

      {loading ? (
        <div className="cashier-empty">Đang tải…</div>
      ) : (
        <div className="cashier-table-wrap">
          <table className="cashier-table">
            <thead>
              <tr>
                <th>Bác sĩ</th>
                <th>Chuyên khoa</th>
                <th>Học vị</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {doctors.map((doc) => {
                const draft = draftOf(doc);
                const changed = String(draft.department_id) !== String(doc.department_id ?? '') || (draft.degree || '') !== (doc.degree || '');
                return (
                  <tr key={doc.doctor_id}>
                    <td>
                      <div className="cell-main">{doc.fullname}</div>
                      <div className="cell-sub">{doc.email} · {doc.phone}{doc.role !== 'doctor' ? ' · (không còn vai trò bác sĩ)' : ''}</div>
                    </td>
                    <td>
                      <select
                        className="cashier-input"
                        value={draft.department_id}
                        onChange={(e) => setDraft(doc, { department_id: e.target.value })}
                        aria-label={`Chuyên khoa của ${doc.fullname}`}
                      >
                        <option value="">— Chưa gán —</option>
                        {departments.map((dep) => <option key={dep.id} value={dep.id}>{dep.name}</option>)}
                      </select>
                    </td>
                    <td>
                      <input
                        className="cashier-input"
                        value={draft.degree}
                        placeholder="VD: Bác sĩ CKI"
                        onChange={(e) => setDraft(doc, { degree: e.target.value })}
                        aria-label={`Học vị của ${doc.fullname}`}
                      />
                    </td>
                    <td className="actions">
                      <button className="cashier-btn cashier-btn-primary cashier-btn-sm" disabled={!changed || saving !== null} onClick={() => save(doc)}>
                        {saving === doc.doctor_id ? 'Đang lưu…' : 'Lưu'}
                      </button>{' '}
                      <button className="cashier-btn cashier-btn-ghost cashier-btn-sm" disabled={!doc.department_id} onClick={() => setProfileOf(doc)}
                        title={doc.department_id ? 'Giới thiệu, kinh nghiệm, phòng khám – hiện ở trang "Bác sĩ"' : 'Gán chuyên khoa trước'}>
                        Hồ sơ
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {profileOf && (
        <DoctorProfileDialog
          doc={profileOf}
          onClose={() => setProfileOf(null)}
          onSaved={(text) => { setProfileOf(null); setMessage(text); load(); }}
        />
      )}
    </>
  );
};

/** Public profile of a doctor (shown on the "Bác sĩ" page): room, bio, experience, expertise */
const DoctorProfileDialog = ({ doc, onClose, onSaved }) => {
  const [form, setForm] = useState({
    room: doc.room || '',
    experience_years: doc.experience_years ?? '',
    expertise: doc.expertise || '',
    bio: doc.bio || ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await axios.put(`${API_BASE}/admin/doctors/${doc.doctor_id}`, {
        department_id: doc.department_id,
        degree: doc.degree,
        room: form.room,
        experience_years: form.experience_years === '' ? null : Number(form.experience_years),
        expertise: form.expertise,
        bio: form.bio
      }, { headers: authHeader() });
      onSaved(`Đã cập nhật hồ sơ ${doc.fullname}`);
    } catch (err) {
      setError(errorText(err, 'Không thể lưu hồ sơ'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cashier-modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="cashier-modal" role="dialog" aria-modal="true" aria-label={`Hồ sơ ${doc.fullname}`} onSubmit={submit}>
        <div className="cashier-modal-header">
          <h2>Hồ sơ: {doc.fullname}</h2>
          <button type="button" className="cashier-modal-close" onClick={onClose} aria-label="Đóng">×</button>
        </div>
        <div className="cashier-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label className="cashier-label">Phòng khám
              <input className="cashier-input" value={form.room} maxLength={20} onChange={(e) => set('room', e.target.value)} placeholder="VD: 101" />
            </label>
            <label className="cashier-label">Số năm kinh nghiệm
              <input className="cashier-input" type="number" min="0" max="70" value={form.experience_years} onChange={(e) => set('experience_years', e.target.value)} />
            </label>
          </div>
          <label className="cashier-label">Thế mạnh chuyên môn (cách nhau dấu phẩy)
            <input className="cashier-input" value={form.expertise} maxLength={255} onChange={(e) => set('expertise', e.target.value)} placeholder="VD: Tăng huyết áp, Suy tim" />
          </label>
          <label className="cashier-label">Giới thiệu
            <textarea className="cashier-input" rows="4" maxLength={2000} value={form.bio} onChange={(e) => set('bio', e.target.value)} />
          </label>
          {error && <div className="cashier-alert cashier-alert-error">{error}</div>}
        </div>
        <div className="cashier-modal-footer">
          <button type="button" className="cashier-btn cashier-btn-secondary" onClick={onClose} disabled={saving}>Huỷ</button>
          <button type="submit" className="cashier-btn cashier-btn-primary" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu hồ sơ'}</button>
        </div>
      </form>
    </div>
  );
};

export default ClinicCatalog;
