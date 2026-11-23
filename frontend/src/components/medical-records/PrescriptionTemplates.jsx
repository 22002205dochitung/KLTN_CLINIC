import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE } from '../../config/api';
import SearchSelect from '../common/SearchSelect';
import './PrescriptionTemplates.css';

const API = `${API_BASE}/prescription-templates`;
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` } });
const errText = (err, fallback) => err?.response?.data?.error?.message || fallback;

/** Rows of the prescription form -> template items (rows without a medicine name are dropped) */
const toItems = (rows) => rows
  .filter((r) => String(r.medicine_name || '').trim())
  .map((r) => ({
    medicine_id: r.medicine_id || null,
    medicine_name: r.medicine_name.trim(),
    unit: r.unit || null,
    dosage: String(r.dosage || '').trim(),
    quantity: parseInt(r.quantity, 10) || 1,
    instructions: String(r.instructions || '').trim() || null
  }));

/**
 * "Đơn thuốc mẫu" toolbar on top of the prescription form.
 *  - pick a saved template -> its medicines fill the form (still editable)
 *  - save the medicines currently in the form as a named template, to reuse for other patients
 *  - manage (view / delete) the doctor's templates
 */
const PrescriptionTemplates = ({ rows, diagnosis, onApply, disabled }) => {
  const [templates, setTemplates] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [picked, setPicked] = useState('');
  const [saving, setSaving] = useState(false);
  const [showSave, setShowSave] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [name, setName] = useState('');
  const [message, setMessage] = useState(null); // { type: 'ok' | 'error', text }

  const load = useCallback(() => {
    axios.get(API, auth())
      .then((res) => { setTemplates(res.data?.data?.templates || []); setLoadError(''); })
      .catch((err) => setLoadError(errText(err, 'Không tải được đơn mẫu')));
  }, []);

  useEffect(() => { load(); }, [load]);

  const hasContent = rows.some((r) => String(r.medicine_name || '').trim());
  const itemCount = toItems(rows).length;

  const apply = (id) => {
    const t = templates.find((x) => String(x.id) === String(id));
    if (!t) return;
    if (hasContent && !window.confirm(`Thay các thuốc đang nhập bằng đơn mẫu "${t.name}"?`)) {
      setPicked('');
      return;
    }
    onApply(t.items);
    setPicked(String(t.id));
    setMessage({ type: 'ok', text: `Đã điền ${t.items.length} thuốc từ đơn mẫu "${t.name}". Bạn có thể sửa trước khi lưu.` });
    axios.post(`${API}/${t.id}/use`, null, auth()).catch(() => {});
  };

  const openSave = () => {
    setMessage(null);
    if (!itemCount) {
      setMessage({ type: 'error', text: 'Nhập ít nhất 1 thuốc (tên + số lượng) rồi mới lưu làm mẫu.' });
      return;
    }
    const current = templates.find((x) => String(x.id) === picked);
    setName(current ? current.name : String(diagnosis || '').slice(0, 120));
    setShowSave(true);
  };

  // not a <form>: this block sits inside the prescription form, and nested forms submit the outer one
  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setMessage({ type: 'error', text: 'Vui lòng đặt tên cho đơn mẫu.' }); return; }
    const body = { name: trimmed, diagnosis: diagnosis || null, items: toItems(rows) };
    setSaving(true);
    setMessage(null);
    try {
      await axios.post(API, body, auth());
      setMessage({ type: 'ok', text: `Đã lưu đơn mẫu "${trimmed}" (${body.items.length} thuốc).` });
      setShowSave(false);
      load();
    } catch (err) {
      if (err?.response?.data?.error?.code === 'TEMPLATE_EXISTS') {
        const existing = templates.find((x) => x.name.toLowerCase() === trimmed.toLowerCase());
        if (existing && window.confirm(`Đã có đơn mẫu "${existing.name}". Ghi đè bằng các thuốc hiện tại?`)) {
          try {
            await axios.put(`${API}/${existing.id}`, body, auth());
            setMessage({ type: 'ok', text: `Đã cập nhật đơn mẫu "${existing.name}".` });
            setShowSave(false);
            load();
          } catch (err2) {
            setMessage({ type: 'error', text: errText(err2, 'Không cập nhật được đơn mẫu') });
          }
        } else {
          setMessage({ type: 'error', text: 'Tên này đã có. Hãy đặt tên khác.' });
        }
      } else {
        setMessage({ type: 'error', text: errText(err, 'Không lưu được đơn mẫu') });
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = async (t) => {
    if (!window.confirm(`Xoá đơn mẫu "${t.name}"? Các đơn đã kê cho bệnh nhân không bị ảnh hưởng.`)) return;
    try {
      await axios.delete(`${API}/${t.id}`, auth());
      if (picked === String(t.id)) setPicked('');
      load();
    } catch (err) {
      setMessage({ type: 'error', text: errText(err, 'Không xoá được đơn mẫu') });
    }
  };

  const options = templates.map((t) => ({
    value: String(t.id),
    label: t.name,
    hint: `${t.items.length} thuốc${t.use_count ? ` · đã dùng ${t.use_count} lần` : ''}`
  }));

  return (
    <section className="ptpl" aria-label="Đơn thuốc mẫu">
      <div className="ptpl-bar">
        <div className="ptpl-title">📋 Đơn thuốc mẫu</div>
        <div className="ptpl-pick">
          <SearchSelect
            id="ptpl-select"
            value={picked}
            options={options}
            onChange={apply}
            placeholder={templates.length ? `Chọn đơn mẫu để điền nhanh (${templates.length} đơn)` : 'Chưa có đơn mẫu nào'}
            emptyText="Không có đơn mẫu phù hợp"
            disabled={disabled || !templates.length}
          />
        </div>
        <button type="button" className="ptpl-btn is-save" onClick={openSave} disabled={disabled || saving}>
          💾 Lưu đơn này làm mẫu
        </button>
        {templates.length > 0 && (
          <button type="button" className="ptpl-btn" onClick={() => setShowManage((v) => !v)} aria-expanded={showManage}>
            {showManage ? 'Ẩn danh mục' : `Danh mục (${templates.length})`}
          </button>
        )}
      </div>

      {loadError && <div className="ptpl-msg is-error">{loadError}</div>}
      {message && <div className={`ptpl-msg is-${message.type}`} role="status">{message.text}</div>}

      {showSave && (
        <div className="ptpl-save" role="group" aria-label="Lưu đơn mẫu">
          <label htmlFor="ptpl-name">Tên đơn mẫu</label>
          <input
            id="ptpl-name"
            type="text"
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="VD: Viêm họng cấp – người lớn"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); if (!saving) save(); }
              if (e.key === 'Escape') setShowSave(false);
            }}
          />
          <span className="ptpl-save-count">{itemCount} thuốc</span>
          <button type="button" className="ptpl-btn is-save" onClick={save} disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu'}</button>
          <button type="button" className="ptpl-btn" onClick={() => setShowSave(false)}>Huỷ</button>
        </div>
      )}

      {showManage && (
        <ul className="ptpl-list">
          {templates.map((t) => (
            <li key={t.id}>
              <div className="ptpl-item-head">
                <b>{t.name}</b>
                <span className="ptpl-muted">{t.items.length} thuốc{t.use_count ? ` · dùng ${t.use_count} lần` : ''}</span>
                <button type="button" className="ptpl-link" onClick={() => apply(t.id)} disabled={disabled}>Dùng</button>
                <button type="button" className="ptpl-link is-danger" onClick={() => remove(t)}>Xoá</button>
              </div>
              <div className="ptpl-item-meds">
                {t.items.map((it) => `${it.medicine_name} × ${it.quantity}${it.unit ? ` ${it.unit}` : ''}`).join(' · ')}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default PrescriptionTemplates;
