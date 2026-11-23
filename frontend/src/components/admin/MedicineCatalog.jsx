import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { API_BASE } from '../../config/api';
import { formatCurrency } from '../payment/paymentUtils';
import '../payment/CashierDesk.css';
import './MedicineCatalog.css';

const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('auth_token')}` });
const errorText = (err, fallback) =>
  err?.response?.data?.error?.message || err?.response?.data?.message || fallback;
const fmtTime = (v) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
};
const REASONS = { import: 'Nhập kho', dispense: 'Xuất bán', adjust: 'Kiểm kho', return: 'Nhập lại (hoàn tiền)' };
const UNITS = ['viên', 'vỉ', 'hộp', 'gói', 'chai', 'lọ', 'ống', 'tuýp'];

const Modal = ({ title, onClose, children, footer }) => {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="cashier-modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cashier-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="cashier-modal-header">
          <h2>{title}</h2>
          <button className="cashier-modal-close" onClick={onClose} aria-label="Đóng">×</button>
        </div>
        <div className="cashier-modal-body">{children}</div>
        {footer && <div className="cashier-modal-footer">{footer}</div>}
      </div>
    </div>
  );
};

/**
 * MedicineCatalog - Kho thuốc (admin)
 * Danh mục thuốc bác sĩ chọn khi kê đơn; tồn kho tự trừ khi thu ngân thu tiền thuốc.
 */
const MedicineCatalog = ({ onBack }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all | low | inactive
  const [dialog, setDialog] = useState(null);   // { type: 'form'|'import'|'adjust'|'history', item? }

  const load = useCallback(async () => {
    try {
      setError('');
      const res = await axios.get(`${API_BASE}/medicines`, { params: { all: 1 }, headers: authHeader() });
      setItems(res.data.data.items || []);
    } catch (err) {
      setError(errorText(err, 'Không thể tải danh mục thuốc'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const done = (message) => {
    setDialog(null);
    setNotice(message);
    load();
  };

  const stats = useMemo(() => {
    const active = items.filter((m) => m.active);
    return {
      total: active.length,
      low: active.filter((m) => m.low_stock && m.stock > 0).length,
      out: active.filter((m) => m.stock === 0).length,
      value: active.reduce((s, m) => s + m.price * m.stock, 0)
    };
  }, [items]);

  const shown = items.filter((m) => {
    if (search && !m.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
    if (filter === 'low') return m.active && m.low_stock;
    if (filter === 'inactive') return !m.active;
    return true;
  });

  const toggleActive = async (m) => {
    try {
      const res = await axios.put(`${API_BASE}/medicines/${m.id}`, { active: !m.active }, { headers: authHeader() });
      setNotice(m.active ? `Đã ngừng bán ${m.name} – bác sĩ không chọn được nữa` : res.data.message);
      load();
    } catch (err) {
      setError(errorText(err, 'Không thể cập nhật'));
    }
  };

  const remove = async (m) => {
    if (!window.confirm(`Xoá "${m.name}" khỏi danh mục?`)) return;
    try {
      const res = await axios.delete(`${API_BASE}/medicines/${m.id}`, { headers: authHeader() });
      setNotice(res.data.message);
      load();
    } catch (err) {
      setError(errorText(err, 'Không thể xoá thuốc'));
    }
  };

  return (
    <div className="cashier-container">
      <div className="cashier-header">
        <div>
          <h1>💊 Kho thuốc</h1>
          <p className="cashier-subtitle">Danh mục thuốc để bác sĩ kê đơn · tồn kho tự trừ khi thu ngân thu tiền thuốc</p>
        </div>
        <div className="med-head-actions">
          <button className="cashier-btn cashier-btn-primary" onClick={() => setDialog({ type: 'form' })}>＋ Thêm thuốc</button>
          {onBack && <button className="cashier-btn cashier-btn-secondary" onClick={onBack}>← Về Dashboard</button>}
        </div>
      </div>

      <div className="med-stats">
        <div><b>{stats.total}</b><span>Thuốc đang bán</span></div>
        <div className={stats.low ? 'is-warn' : ''}><b>{stats.low}</b><span>Sắp hết</span></div>
        <div className={stats.out ? 'is-danger' : ''}><b>{stats.out}</b><span>Hết hàng</span></div>
        <div><b>{formatCurrency(stats.value)}</b><span>Giá trị tồn kho</span></div>
      </div>

      <div className="cashier-filters">
        <input
          className="cashier-input cashier-search"
          placeholder="🔍 Tìm tên thuốc…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Tìm thuốc"
        />
        <select className="cashier-input" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Lọc">
          <option value="all">Tất cả</option>
          <option value="low">Sắp hết / hết hàng</option>
          <option value="inactive">Ngừng bán</option>
        </select>
      </div>

      {notice && (
        <div className="cashier-alert cashier-alert-success" role="status">
          {notice} <button className="med-x" onClick={() => setNotice('')} aria-label="Đóng">×</button>
        </div>
      )}
      {error && (
        <div className="cashier-alert cashier-alert-error" role="alert">
          {error} <button className="med-x" onClick={() => setError('')} aria-label="Đóng">×</button>
        </div>
      )}

      {loading ? (
        <div className="cashier-empty">Đang tải kho thuốc…</div>
      ) : shown.length === 0 ? (
        <div className="cashier-empty">Không có thuốc nào</div>
      ) : (
        <div className="cashier-table-wrap">
          <table className="cashier-table cashier-table-cards">
            <thead>
              <tr>
                <th>Thuốc</th>
                <th className="num">Giá bán</th>
                <th className="num">Tồn kho</th>
                <th className="num">Tối thiểu</th>
                <th>Trạng thái</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((m) => (
                <tr key={m.id} className={!m.active ? 'med-row-off' : ''}>
                  <td data-label="Thuốc">
                    <div className="cell-main">{m.name}</div>
                    <div className="cell-sub">Đơn vị: {m.unit}</div>
                  </td>
                  <td data-label="Giá bán" className="num">{formatCurrency(m.price)}</td>
                  <td data-label="Tồn kho" className="num">
                    <span className={`med-stock ${m.stock === 0 ? 'is-out' : m.low_stock ? 'is-low' : ''}`}>{m.stock}</span>
                  </td>
                  <td data-label="Tối thiểu" className="num">{m.min_stock}</td>
                  <td data-label="Trạng thái">
                    {!m.active ? <span className="med-badge is-off">Ngừng bán</span>
                      : m.stock === 0 ? <span className="med-badge is-out">Hết hàng</span>
                        : m.low_stock ? <span className="med-badge is-low">Sắp hết</span>
                          : <span className="med-badge">Còn hàng</span>}
                  </td>
                  <td data-label="" className="actions med-actions">
                    <button className="cashier-btn cashier-btn-primary cashier-btn-sm" onClick={() => setDialog({ type: 'import', item: m })}>＋ Nhập kho</button>
                    <button className="cashier-btn cashier-btn-secondary cashier-btn-sm" onClick={() => setDialog({ type: 'adjust', item: m })}>Kiểm kho</button>
                    <button className="cashier-btn cashier-btn-ghost cashier-btn-sm" onClick={() => setDialog({ type: 'history', item: m })}>Lịch sử</button>
                    <button className="cashier-btn cashier-btn-ghost cashier-btn-sm" onClick={() => setDialog({ type: 'form', item: m })}>Sửa</button>
                    <button className="cashier-btn cashier-btn-ghost cashier-btn-sm" onClick={() => toggleActive(m)}>{m.active ? 'Ngừng bán' : 'Bán lại'}</button>
                    <button className="cashier-btn cashier-btn-danger cashier-btn-sm" onClick={() => remove(m)} title="Chỉ xoá được thuốc chưa từng kê đơn">Xoá</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dialog?.type === 'form' && <MedicineForm item={dialog.item} onClose={() => setDialog(null)} onDone={done} />}
      {(dialog?.type === 'import' || dialog?.type === 'adjust') && (
        <StockDialog kind={dialog.type} item={dialog.item} onClose={() => setDialog(null)} onDone={done} />
      )}
      {dialog?.type === 'history' && <HistoryDialog item={dialog.item} onClose={() => setDialog(null)} />}
    </div>
  );
};

const MedicineForm = ({ item, onClose, onDone }) => {
  const editing = Boolean(item);
  const [form, setForm] = useState({
    name: item?.name || '',
    unit: item?.unit || 'viên',
    price: item ? String(item.price) : '',
    min_stock: item ? String(item.min_stock) : '20',
    stock: ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = { name: form.name, unit: form.unit, price: Number(form.price), min_stock: Number(form.min_stock || 0) };
      const res = editing
        ? await axios.put(`${API_BASE}/medicines/${item.id}`, body, { headers: authHeader() })
        : await axios.post(`${API_BASE}/medicines`, { ...body, stock: Number(form.stock || 0) }, { headers: authHeader() });
      onDone(res.data.message);
    } catch (err) {
      setError(errorText(err, 'Không thể lưu'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={editing ? `Sửa: ${item.name}` : 'Thêm thuốc mới'}
      onClose={onClose}
      footer={(
        <>
          <button className="cashier-btn cashier-btn-secondary" onClick={onClose} disabled={saving}>Huỷ</button>
          <button className="cashier-btn cashier-btn-primary" form="med-form" type="submit" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu'}</button>
        </>
      )}
    >
      <form id="med-form" className="med-form" onSubmit={submit}>
        <label className="cashier-label">Tên thuốc (kèm hàm lượng)
          <input className="cashier-input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="VD: Paracetamol 500mg" required maxLength={150} autoFocus />
        </label>
        <div className="med-form-row">
          <label className="cashier-label">Đơn vị tính
            <input className="cashier-input" list="med-units" value={form.unit} onChange={(e) => set('unit', e.target.value)} required maxLength={30} />
            <datalist id="med-units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
          </label>
          <label className="cashier-label">Giá bán / {form.unit || 'đơn vị'} (VNĐ)
            <input className="cashier-input" type="number" min="0" step="100" value={form.price} onChange={(e) => set('price', e.target.value)} required />
          </label>
        </div>
        <div className="med-form-row">
          <label className="cashier-label">Mức tồn tối thiểu (báo sắp hết)
            <input className="cashier-input" type="number" min="0" value={form.min_stock} onChange={(e) => set('min_stock', e.target.value)} />
          </label>
          {!editing && (
            <label className="cashier-label">Tồn kho ban đầu
              <input className="cashier-input" type="number" min="0" value={form.stock} onChange={(e) => set('stock', e.target.value)} placeholder="0" />
            </label>
          )}
        </div>
        {editing && <p className="cashier-hint">Đổi giá chỉ áp dụng cho đơn kê sau này; đơn đã kê giữ giá cũ. Muốn đổi số lượng tồn, dùng "Nhập kho" hoặc "Kiểm kho".</p>}
        {error && <div className="cashier-alert cashier-alert-error" role="alert">{error}</div>}
      </form>
    </Modal>
  );
};

const StockDialog = ({ kind, item, onClose, onDone }) => {
  const isImport = kind === 'import';
  const [value, setValue] = useState(isImport ? '' : String(item.stock));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const n = Number(value);
  const after = isImport ? item.stock + (Number.isFinite(n) ? n : 0) : n;

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await axios.post(
        `${API_BASE}/medicines/${item.id}/${kind}`,
        isImport ? { quantity: n, note } : { stock: n, note },
        { headers: authHeader() }
      );
      onDone(res.data.message);
    } catch (err) {
      setError(errorText(err, 'Không thể cập nhật kho'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`${isImport ? 'Nhập kho' : 'Kiểm kho'}: ${item.name}`}
      onClose={onClose}
      footer={(
        <>
          <button className="cashier-btn cashier-btn-secondary" onClick={onClose} disabled={saving}>Huỷ</button>
          <button className="cashier-btn cashier-btn-primary" form="stock-form" type="submit" disabled={saving || value === ''}>{saving ? 'Đang lưu…' : 'Xác nhận'}</button>
        </>
      )}
    >
      <form id="stock-form" className="med-form" onSubmit={submit}>
        <p>Tồn hiện tại: <b>{item.stock} {item.unit}</b></p>
        <label className="cashier-label">{isImport ? `Số lượng nhập thêm (${item.unit})` : `Số lượng thực tế đếm được (${item.unit})`}
          <input className="cashier-input" type="number" min={isImport ? 1 : 0} value={value} onChange={(e) => setValue(e.target.value)} required autoFocus />
        </label>
        <label className="cashier-label">Ghi chú {isImport ? '(số lô, nhà cung cấp…)' : '(lý do chênh lệch)'}
          <input className="cashier-input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={255} />
        </label>
        {value !== '' && Number.isFinite(n) && (
          <p className="cashier-hint">Sau khi lưu: <b>{after} {item.unit}</b>{!isImport && ` (${after - item.stock >= 0 ? '+' : ''}${after - item.stock})`}</p>
        )}
        {error && <div className="cashier-alert cashier-alert-error" role="alert">{error}</div>}
      </form>
    </Modal>
  );
};

const HistoryDialog = ({ item, onClose }) => {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    axios.get(`${API_BASE}/medicines/${item.id}/movements`, { headers: authHeader() })
      .then((res) => setRows(res.data.data))
      .catch((err) => setError(errorText(err, 'Không thể tải lịch sử')));
  }, [item.id]);

  return (
    <Modal title={`Lịch sử kho: ${item.name}`} onClose={onClose}>
      {error && <div className="cashier-alert cashier-alert-error">{error}</div>}
      {!rows && !error && <div className="cashier-empty">Đang tải…</div>}
      {rows && rows.length === 0 && <div className="cashier-empty">Chưa có biến động kho</div>}
      {rows && rows.length > 0 && (
        <div className="cashier-table-wrap">
          <table className="cashier-table cashier-table-compact">
            <thead>
              <tr><th>Thời gian</th><th>Loại</th><th className="num">Thay đổi</th><th className="num">Tồn sau</th><th>Ghi chú</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{fmtTime(r.created_at)}</td>
                  <td>{REASONS[r.reason] || r.reason}</td>
                  <td className={`num ${r.quantity_change > 0 ? 'med-plus' : 'med-minus'}`}>{r.quantity_change > 0 ? '+' : ''}{r.quantity_change}</td>
                  <td className="num">{r.stock_after}</td>
                  <td>
                    <div>{r.note || '—'}</div>
                    {r.created_by_name && <div className="cell-sub">{r.created_by_name}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
};

export default MedicineCatalog;
