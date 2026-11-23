import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  paymentApi,
  getErrorMessage,
  formatCurrency,
  formatCompact,
  formatDate,
  formatDateTime,
  toInputDate,
  PAYMENT_METHOD_LABELS,
  TRANSACTION_TYPE_LABELS,
  TRANSACTION_STATUS
} from './paymentUtils';
import './CashierDesk.css';
import './PaymentManagement.css';

/**
 * PaymentManagement - Quản lý thanh toán (Admin)
 * Tabs: Doanh thu · Giao dịch · Bảng giá khám
 */
const PaymentManagement = ({ onBack }) => {
  const [tab, setTab] = useState('revenue');

  return (
    <div className="pm-container">
      <div className="cashier-header">
        <div>
          <h1>📊 Quản lý thanh toán</h1>
          <p className="cashier-subtitle">Doanh thu, giao dịch và bảng giá khám</p>
        </div>
        {onBack && (
          <button className="cashier-btn cashier-btn-secondary" onClick={onBack}>← Về Dashboard</button>
        )}
      </div>

      <div className="cashier-tabs" role="tablist">
        {[
          ['revenue', 'Doanh thu'],
          ['transactions', 'Giao dịch'],
          ['fees', 'Bảng giá khám']
        ].map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={`cashier-tab ${tab === id ? 'active' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'revenue' && <RevenueTab />}
      {tab === 'transactions' && <TransactionsTab />}
      {tab === 'fees' && <FeesTab />}
    </div>
  );
};

// ===========================================================================
// Date range helpers
// ===========================================================================

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

const RANGE_PRESETS = [
  { id: '7d', label: '7 ngày', get: () => [toInputDate(daysAgo(6)), toInputDate()] },
  { id: '30d', label: '30 ngày', get: () => [toInputDate(daysAgo(29)), toInputDate()] },
  {
    id: 'month',
    label: 'Tháng này',
    get: () => {
      const now = new Date();
      return [toInputDate(new Date(now.getFullYear(), now.getMonth(), 1)), toInputDate()];
    }
  },
  { id: 'all', label: 'Tất cả', get: () => ['', ''] }
];

const DateRangeFilter = ({ range, onChange }) => {
  const [start, end] = range.value;
  return (
    <div className="pm-range">
      <div className="pm-segmented" role="group" aria-label="Khoảng thời gian">
        {RANGE_PRESETS.map((p) => (
          <button
            key={p.id}
            className={range.preset === p.id ? 'active' : ''}
            onClick={() => onChange({ preset: p.id, value: p.get() })}
          >
            {p.label}
          </button>
        ))}
      </div>
      <input
        type="date"
        className="cashier-input"
        value={start}
        max={end || undefined}
        onChange={(e) => onChange({ preset: 'custom', value: [e.target.value, end] })}
        aria-label="Từ ngày"
      />
      <span className="pm-range-sep">→</span>
      <input
        type="date"
        className="cashier-input"
        value={end}
        min={start || undefined}
        onChange={(e) => onChange({ preset: 'custom', value: [start, e.target.value] })}
        aria-label="Đến ngày"
      />
    </div>
  );
};

// ===========================================================================
// Revenue tab
// ===========================================================================

const RevenueTab = () => {
  const [range, setRange] = useState({ preset: '30d', value: RANGE_PRESETS[1].get() });
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const [start_date, end_date] = range.value;
        const res = await paymentApi.get('/admin/payments/revenue', {
          params: { start_date: start_date || undefined, end_date: end_date || undefined }
        });
        if (!cancelled) setStats(res.data);
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err, 'Không thể tải thống kê doanh thu'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [range]);

  const byType = useMemo(() => {
    const map = Object.fromEntries((stats?.by_type || []).map((t) => [t.transaction_type, t]));
    return {
      consultation: map.consultation || { revenue: 0, count: 0 },
      medication: map.medication || { revenue: 0, count: 0 }
    };
  }, [stats]);

  return (
    <>
      <DateRangeFilter range={range} onChange={setRange} />
      {error && <div className="cashier-alert cashier-alert-error">⚠️ {error}</div>}
      {loading && !stats ? (
        <div className="cashier-empty">Đang tải…</div>
      ) : stats && (
        <div className={loading ? 'pm-loading' : ''}>
          <div className="pm-kpis">
            <div className="pm-kpi">
              <div className="pm-kpi-label">Tổng doanh thu</div>
              <div className="pm-kpi-value">{formatCurrency(stats.total.revenue)}</div>
              <div className="pm-kpi-sub">{stats.total.transactions} giao dịch</div>
            </div>
            <div className="pm-kpi">
              <div className="pm-kpi-label"><span className="pm-swatch pm-swatch-1" />Phí khám</div>
              <div className="pm-kpi-value">{formatCurrency(byType.consultation.revenue)}</div>
              <div className="pm-kpi-sub">{byType.consultation.count} lượt</div>
            </div>
            <div className="pm-kpi">
              <div className="pm-kpi-label"><span className="pm-swatch pm-swatch-2" />Tiền thuốc</div>
              <div className="pm-kpi-value">{formatCurrency(byType.medication.revenue)}</div>
              <div className="pm-kpi-sub">{byType.medication.count} đơn</div>
            </div>
            <div className="pm-kpi">
              <div className="pm-kpi-label">Đã hoàn tiền</div>
              <div className="pm-kpi-value">{formatCurrency(stats.refunds.amount)}</div>
              <div className="pm-kpi-sub">{stats.refunds.count} giao dịch</div>
            </div>
          </div>

          <section className="pm-card">
            <div className="pm-card-head">
              <h3>Doanh thu theo ngày</h3>
              <div className="pm-legend">
                <span><span className="pm-swatch pm-swatch-1" />Phí khám</span>
                <span><span className="pm-swatch pm-swatch-2" />Tiền thuốc</span>
              </div>
            </div>
            <DailyRevenueChart data={stats.by_day} range={range.value} />
          </section>

          <div className="pm-grid-2">
            <section className="pm-card">
              <h3>Theo phương thức thanh toán</h3>
              <BarList
                rows={stats.by_method.map((m) => ({
                  label: PAYMENT_METHOD_LABELS[m.payment_method] || m.payment_method,
                  value: m.revenue,
                  count: m.count
                }))}
              />
            </section>
            <section className="pm-card">
              <h3>Theo chuyên khoa</h3>
              <BarList
                rows={stats.by_department.map((d) => ({
                  label: d.department_name,
                  value: d.revenue,
                  count: d.count
                }))}
              />
            </section>
          </div>
        </div>
      )}
    </>
  );
};

/** Fill missing days so the time axis is continuous (only for bounded ranges) */
const fillDays = (rows, [start, end]) => {
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const first = start || rows[0]?.date;
  const last = end || rows[rows.length - 1]?.date;
  if (!first || !last) return rows;

  const out = [];
  const cur = new Date(`${first}T00:00:00`);
  const stop = new Date(`${last}T00:00:00`);
  let guard = 0;
  while (cur <= stop && guard < 400) {
    const key = toInputDate(cur);
    out.push(byDate.get(key) || { date: key, consultation: 0, medication: 0, revenue: 0, count: 0 });
    cur.setDate(cur.getDate() + 1);
    guard += 1;
  }
  return guard >= 400 ? rows : out;
};

/** Pick a "nice" axis max and tick step */
const niceScale = (max) => {
  if (max <= 0) return { top: 100000, step: 25000 };
  const rough = max / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough);
  return { top: Math.ceil(max / step) * step, step };
};

const DailyRevenueChart = ({ data, range }) => {
  const [hover, setHover] = useState(null);
  const days = useMemo(() => fillDays(data || [], range), [data, range]);

  if (days.length === 0) {
    return <div className="pm-chart-empty">Chưa có doanh thu trong khoảng thời gian này</div>;
  }

  const { top, step } = niceScale(Math.max(...days.map((d) => d.revenue)));
  const ticks = [];
  for (let v = 0; v <= top + 1; v += step) ticks.push(v);

  const labelEvery = Math.ceil(days.length / 10);
  const pct = (v) => `${(v / top) * 100}%`;

  return (
    <div className="pm-chart" onMouseLeave={() => setHover(null)}>
      <div className="pm-chart-y">
        {ticks.slice().reverse().map((t) => <span key={t}>{formatCompact(t)}</span>)}
      </div>
      <div className="pm-chart-plot">
        <div className="pm-chart-grid">
          {ticks.map((t) => <div key={t} className="pm-gridline" style={{ bottom: pct(t) }} />)}
        </div>
        <div className="pm-chart-bars">
          {days.map((d, i) => (
            <div
              key={d.date}
              className={`pm-bar-slot ${hover === i ? 'hover' : ''}`}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              tabIndex={0}
              aria-label={`${formatDate(d.date)}: ${formatCurrency(d.revenue)}`}
            >
              <div className="pm-bar" style={{ height: pct(d.revenue) }}>
                {d.medication > 0 && <div className="pm-seg pm-seg-2" style={{ flexGrow: d.medication }} />}
                {d.consultation > 0 && <div className="pm-seg pm-seg-1" style={{ flexGrow: d.consultation }} />}
              </div>
              {i % labelEvery === 0 && (
                <span className="pm-bar-label">{d.date.slice(8, 10)}/{d.date.slice(5, 7)}</span>
              )}
              {hover === i && (
                <div className={`pm-tooltip ${i > days.length / 2 ? 'left' : ''}`}>
                  <div className="pm-tooltip-title">{formatDate(d.date)}</div>
                  <div className="pm-tooltip-row"><span><span className="pm-swatch pm-swatch-1" />Phí khám</span><b>{formatCurrency(d.consultation)}</b></div>
                  <div className="pm-tooltip-row"><span><span className="pm-swatch pm-swatch-2" />Tiền thuốc</span><b>{formatCurrency(d.medication)}</b></div>
                  <div className="pm-tooltip-row total"><span>Tổng · {d.count} GD</span><b>{formatCurrency(d.revenue)}</b></div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const BarList = ({ rows }) => {
  if (!rows.length) return <div className="pm-chart-empty">Chưa có dữ liệu</div>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  const total = rows.reduce((s, r) => s + r.value, 0) || 1;
  return (
    <ul className="pm-barlist">
      {rows.map((r) => (
        <li key={r.label} title={`${r.count} giao dịch`}>
          <div className="pm-barlist-head">
            <span>{r.label}</span>
            <span><b>{formatCurrency(r.value)}</b> <span className="pm-muted">· {Math.round((r.value / total) * 100)}%</span></span>
          </div>
          <div className="pm-barlist-track">
            <div className="pm-barlist-fill" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
};

// ===========================================================================
// Transactions tab
// ===========================================================================

const TransactionsTab = () => {
  const [range, setRange] = useState({ preset: 'all', value: ['', ''] });
  const [filters, setFilters] = useState({ transaction_type: '', payment_status: '', payment_method: '', search: '' });
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [refunding, setRefunding] = useState(null); // transaction id being confirmed
  const [refundReason, setRefundReason] = useState('');
  const [refundBusy, setRefundBusy] = useState(false);

  const [exporting, setExporting] = useState(false);

  const buildParams = useCallback((extra) => {
    const [start_date, end_date] = range.value;
    const params = { start_date: start_date || undefined, end_date: end_date || undefined, ...extra };
    Object.entries(filters).forEach(([k, v]) => { if (v && v.trim()) params[k] = v.trim(); });
    return params;
  }, [range, filters]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await paymentApi.get('/admin/payments', { params: buildParams({ page, limit: 20 }) });
      setResult(res.data);
    } catch (err) {
      setError(getErrorMessage(err, 'Không thể tải danh sách giao dịch'));
    } finally {
      setLoading(false);
    }
  }, [buildParams, page]);

  /** Export every transaction matching the current filters to a CSV file (opens in Excel) */
  const exportCsv = async () => {
    try {
      setExporting(true);
      setError('');
      const all = [];
      let current = 1;
      let totalPages = 1;
      do {
        const res = await paymentApi.get('/admin/payments', { params: buildParams({ page: current, limit: 200 }) });
        all.push(...(res.data.data || []));
        totalPages = res.data.pagination?.totalPages || 1;
        current += 1;
      } while (current <= totalPages && current <= 50);

      const header = ['Mã GD', 'Thời gian', 'Bệnh nhân', 'SĐT', 'Loại', 'Mã tham chiếu', 'Phương thức', 'Trạng thái', 'Số tiền (VNĐ)', 'Người thu', 'Ghi chú'];
      const lines = all.map((tx) => [
        tx.id,
        formatDateTime(tx.paid_at || tx.created_at),
        tx.patient_name || '',
        tx.patient_phone || '',
        TRANSACTION_TYPE_LABELS[tx.transaction_type] || tx.transaction_type,
        tx.reference_id,
        PAYMENT_METHOD_LABELS[tx.payment_method] || tx.payment_method,
        TRANSACTION_STATUS[tx.payment_status]?.label || tx.payment_status,
        Math.round(tx.amount),
        tx.created_by_name || '',
        tx.notes || ''
      ]);
      const escape = (v) => {
        const s = String(v ?? '');
        return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const csv = '﻿' + [header, ...lines].map((row) => row.map(escape).join(',')).join('\r\n');

      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `giao-dich_${toInputDate()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMessage(`Đã xuất ${all.length} giao dịch`);
    } catch (err) {
      setError(getErrorMessage(err, 'Không thể xuất file'));
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  const setFilter = (key, value) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };

  const confirmRefund = async (tx) => {
    try {
      setRefundBusy(true);
      setError('');
      await paymentApi.post(`/admin/payments/${tx.id}/refund`, { reason: refundReason.trim() || undefined });
      setMessage(`Đã hoàn ${formatCurrency(tx.amount)} cho giao dịch #${tx.id}`);
      setRefunding(null);
      setRefundReason('');
      load();
    } catch (err) {
      setError(getErrorMessage(err, 'Hoàn tiền thất bại'));
    } finally {
      setRefundBusy(false);
    }
  };

  const rows = result?.data || [];
  const pagination = result?.pagination;

  return (
    <>
      <DateRangeFilter range={range} onChange={(r) => { setRange(r); setPage(1); }} />
      <div className="cashier-filters">
        <input
          type="search"
          className="cashier-input cashier-search"
          placeholder="Tìm theo tên, SĐT bệnh nhân hoặc mã GD…"
          value={filters.search}
          onChange={(e) => setFilter('search', e.target.value)}
        />
        <select className="cashier-input" value={filters.transaction_type} onChange={(e) => setFilter('transaction_type', e.target.value)} aria-label="Loại">
          <option value="">Tất cả loại</option>
          {Object.entries(TRANSACTION_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="cashier-input" value={filters.payment_status} onChange={(e) => setFilter('payment_status', e.target.value)} aria-label="Trạng thái">
          <option value="">Tất cả trạng thái</option>
          {Object.entries(TRANSACTION_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className="cashier-input" value={filters.payment_method} onChange={(e) => setFilter('payment_method', e.target.value)} aria-label="Phương thức">
          <option value="">Tất cả phương thức</option>
          {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {message && <div className="cashier-alert cashier-alert-success">✓ {message}</div>}
      {error && <div className="cashier-alert cashier-alert-error">⚠️ {error}</div>}

      {pagination && (
        <div className="pm-summary-line">
          <span>{pagination.total} giao dịch · Tổng giá trị <b>{formatCurrency(result.summary?.total_amount)}</b></span>
          <button
            className="cashier-btn cashier-btn-secondary cashier-btn-sm"
            onClick={exportCsv}
            disabled={exporting || pagination.total === 0}
          >
            {exporting ? 'Đang xuất…' : '⬇ Xuất Excel (CSV)'}
          </button>
        </div>
      )}

      {loading && !result ? (
        <div className="cashier-empty">Đang tải…</div>
      ) : rows.length === 0 ? (
        <div className="cashier-empty">Không có giao dịch phù hợp</div>
      ) : (
        <div className={`cashier-table-wrap ${loading ? 'pm-loading' : ''}`}>
          <table className="cashier-table">
            <thead>
              <tr>
                <th>Mã GD</th>
                <th>Thời gian</th>
                <th>Bệnh nhân</th>
                <th>Loại</th>
                <th>Phương thức</th>
                <th>Trạng thái</th>
                <th>Người thu</th>
                <th className="num">Số tiền</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((tx) => {
                const status = TRANSACTION_STATUS[tx.payment_status] || { label: tx.payment_status, className: '', icon: '' };
                return (
                  <React.Fragment key={tx.id}>
                    <tr>
                      <td>#{tx.id}</td>
                      <td>{formatDateTime(tx.paid_at || tx.created_at)}</td>
                      <td>
                        <div className="cell-main">{tx.patient_name || '—'}</div>
                        <div className="cell-sub">{tx.patient_phone}</div>
                      </td>
                      <td>
                        <div className="cell-main">{TRANSACTION_TYPE_LABELS[tx.transaction_type] || tx.transaction_type}</div>
                        <div className="cell-sub">
                          {tx.transaction_type === 'consultation' ? 'Lịch hẹn' : 'Hồ sơ'} #{tx.reference_id}
                        </div>
                      </td>
                      <td>{PAYMENT_METHOD_LABELS[tx.payment_method] || tx.payment_method}</td>
                      <td><span className={`pm-status ${status.className}`}>{status.icon} {status.label}</span></td>
                      <td>
                        <div className="cell-main">{tx.created_by_name || '—'}</div>
                        {tx.notes && <div className="cell-sub" title={tx.notes}>{tx.notes}</div>}
                      </td>
                      <td className="num strong">{formatCurrency(tx.amount)}</td>
                      <td className="actions">
                        {tx.payment_status === 'completed' && refunding !== tx.id && (
                          <button
                            className="cashier-btn cashier-btn-danger cashier-btn-sm"
                            onClick={() => { setRefunding(tx.id); setRefundReason(''); setMessage(''); }}
                          >
                            Hoàn tiền
                          </button>
                        )}
                      </td>
                    </tr>
                    {refunding === tx.id && (
                      <tr className="pm-confirm-row">
                        <td colSpan={9}>
                          <div className="pm-confirm">
                            <span>Hoàn <b>{formatCurrency(tx.amount)}</b> cho <b>{tx.patient_name}</b>?</span>
                            <input
                              className="cashier-input"
                              placeholder="Lý do hoàn tiền (không bắt buộc)"
                              value={refundReason}
                              onChange={(e) => setRefundReason(e.target.value)}
                              autoFocus
                            />
                            <button className="cashier-btn cashier-btn-secondary cashier-btn-sm" onClick={() => setRefunding(null)} disabled={refundBusy}>
                              Hủy
                            </button>
                            <button className="cashier-btn cashier-btn-danger cashier-btn-sm" onClick={() => confirmRefund(tx)} disabled={refundBusy}>
                              {refundBusy ? 'Đang xử lý…' : 'Xác nhận hoàn tiền'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pagination && pagination.totalPages > 1 && (
        <div className="pm-pagination">
          <button className="cashier-btn cashier-btn-secondary cashier-btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Trước</button>
          <span>Trang {pagination.page} / {pagination.totalPages}</span>
          <button className="cashier-btn cashier-btn-secondary cashier-btn-sm" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}>Sau →</button>
        </div>
      )}
    </>
  );
};

// ===========================================================================
// Consultation fees tab
// ===========================================================================

const FeesTab = () => {
  const [fees, setFees] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await paymentApi.get('/consultation-fees');
      setFees(res.data.data || []);
      setDrafts({});
    } catch (err) {
      setError(getErrorMessage(err, 'Không thể tải bảng giá khám'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (fee) => {
    const value = Number(drafts[fee.department_id]);
    if (!value || value <= 0) {
      setError('Giá khám phải lớn hơn 0');
      return;
    }
    try {
      setSaving(fee.department_id);
      setError('');
      setMessage('');
      await paymentApi.put(`/consultation-fees/${fee.department_id}`, { fee_amount: value });
      setMessage(`Đã cập nhật giá khám ${fee.department_name}: ${formatCurrency(value)}`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Không thể cập nhật giá khám'));
    } finally {
      setSaving(null);
    }
  };

  if (loading && fees.length === 0) return <div className="cashier-empty">Đang tải…</div>;

  return (
    <>
      <p className="cashier-subtitle pm-fees-note">
        Giá mới áp dụng từ hôm nay cho các lịch hẹn đặt sau thời điểm cập nhật. Giá cũ được lưu lại trong lịch sử.
      </p>
      {message && <div className="cashier-alert cashier-alert-success">✓ {message}</div>}
      {error && <div className="cashier-alert cashier-alert-error">⚠️ {error}</div>}
      <div className="cashier-table-wrap">
        <table className="cashier-table">
          <thead>
            <tr>
              <th>Chuyên khoa</th>
              <th>Áp dụng từ</th>
              <th className="num">Giá hiện tại</th>
              <th className="num">Giá mới (VNĐ)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {fees.map((fee) => {
              const draft = drafts[fee.department_id];
              const changed = draft !== undefined && draft !== '' && Number(draft) !== Number(fee.fee_amount);
              return (
                <tr key={fee.department_id}>
                  <td>
                    <div className="cell-main">{fee.department_name}</div>
                    {fee.is_default === 1 && <div className="cell-sub">Chưa cấu hình – đang dùng giá mặc định</div>}
                  </td>
                  <td>{fee.effective_from ? formatDate(fee.effective_from) : '—'}</td>
                  <td className="num strong">{formatCurrency(fee.fee_amount)}</td>
                  <td className="num">
                    <input
                      type="number"
                      min="0"
                      step="10000"
                      className="cashier-input cashier-price"
                      placeholder={String(Math.round(fee.fee_amount))}
                      value={draft ?? ''}
                      onChange={(e) => setDrafts((d) => ({ ...d, [fee.department_id]: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && changed && save(fee)}
                      aria-label={`Giá mới ${fee.department_name}`}
                    />
                  </td>
                  <td className="actions">
                    <button
                      className="cashier-btn cashier-btn-primary cashier-btn-sm"
                      disabled={!changed || saving !== null}
                      onClick={() => save(fee)}
                    >
                      {saving === fee.department_id ? 'Đang lưu…' : 'Lưu'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
};

export default PaymentManagement;
