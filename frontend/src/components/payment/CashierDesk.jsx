import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PaymentMethodSelector from './PaymentMethodSelector';
import {
  paymentApi,
  getErrorMessage,
  formatCurrency,
  formatDate,
  formatDateTime,
  toInputDate,
  PAYMENT_METHOD_LABELS
} from './paymentUtils';
import './CashierDesk.css';

/**
 * CashierDesk - Màn hình thu ngân (Lễ tân / Admin)
 *
 * - Tab "Phí khám": lịch hẹn chưa thanh toán -> thu phí khám tại quầy
 * - Tab "Tiền thuốc": hồ sơ có đơn thuốc chưa thanh toán -> nhập đơn giá, thu tiền thuốc
 */
const CashierDesk = ({ onBack }) => {
  const [tab, setTab] = useState('consultation');
  const [search, setSearch] = useState('');
  const [date, setDate] = useState('');
  const [data, setData] = useState({ consultations: [], medications: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [checkout, setCheckout] = useState(null); // { type, item }
  const [receipt, setReceipt] = useState(null);

  const load = useCallback(async (params) => {
    try {
      setLoading(true);
      setError('');
      const res = await paymentApi.get('/cashier/pending', { params });
      setData(res.data.data || { consultations: [], medications: [] });
    } catch (err) {
      setError(getErrorMessage(err, 'Không thể tải danh sách chờ thanh toán'));
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced reload on filter change
  useEffect(() => {
    const timer = setTimeout(() => {
      load({ search: search.trim() || undefined, date: date || undefined });
    }, 300);
    return () => clearTimeout(timer);
  }, [search, date, load]);

  const reload = () => load({ search: search.trim() || undefined, date: date || undefined });

  const handlePaid = (result) => {
    setCheckout(null);
    setReceipt(result);
    reload();
  };

  const totals = useMemo(() => ({
    consultation: data.consultations.reduce((s, c) => s + Number(c.consultation_fee || 0), 0),
    medication: data.medications.reduce((s, m) => s + Number(m.estimated_total || 0), 0)
  }), [data]);

  return (
    <div className="cashier-container">
      <div className="cashier-header">
        <div>
          <h1>💰 Thu ngân</h1>
          <p className="cashier-subtitle">Thu phí khám và tiền thuốc tại quầy</p>
        </div>
        {onBack && (
          <button className="cashier-btn cashier-btn-secondary" onClick={onBack}>← Về Dashboard</button>
        )}
      </div>

      <div className="cashier-filters">
        <input
          type="search"
          className="cashier-input cashier-search"
          placeholder="Tìm theo tên, số điện thoại hoặc mã…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <input
          type="date"
          className="cashier-input"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Lọc theo ngày"
        />
        <button className="cashier-btn cashier-btn-secondary" onClick={() => setDate(toInputDate())}>Hôm nay</button>
        {date && (
          <button className="cashier-btn cashier-btn-ghost" onClick={() => setDate('')}>Tất cả ngày</button>
        )}
        <button className="cashier-btn cashier-btn-ghost" onClick={reload} disabled={loading}>⟳ Làm mới</button>
      </div>

      <div className="cashier-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'consultation'}
          className={`cashier-tab ${tab === 'consultation' ? 'active' : ''}`}
          onClick={() => setTab('consultation')}
        >
          Phí khám <span className="cashier-count">{data.consultations.length}</span>
        </button>
        <button
          role="tab"
          aria-selected={tab === 'medication'}
          className={`cashier-tab ${tab === 'medication' ? 'active' : ''}`}
          onClick={() => setTab('medication')}
        >
          Tiền thuốc <span className="cashier-count">{data.medications.length}</span>
        </button>
        <div className="cashier-tab-total">
          Tổng chờ thu: <strong>{formatCurrency(tab === 'consultation' ? totals.consultation : totals.medication)}</strong>
          {tab === 'medication' && <span className="cashier-hint"> (ước tính)</span>}
        </div>
      </div>

      {error && <div className="cashier-alert cashier-alert-error">⚠️ {error}</div>}

      {data.consultations.some((c) => c.transfer_reported_at) && (
        <div className="cashier-alert cashier-alert-transfer" role="status">
          🔔 <strong>{data.consultations.filter((c) => c.transfer_reported_at).length}</strong> bệnh nhân báo đã chuyển khoản
          (đưa lên đầu danh sách). Mở app ngân hàng kiểm tra tiền về với đúng nội dung <strong>THCT…</strong> rồi bấm
          <strong> Xác nhận đã nhận</strong>.
        </div>
      )}

      {loading ? (
        <div className="cashier-empty">Đang tải…</div>
      ) : tab === 'consultation' ? (
        <ConsultationTable items={data.consultations} onCollect={(item) => setCheckout({ type: 'consultation', item })} />
      ) : (
        <MedicationTable items={data.medications} onCollect={(item) => setCheckout({ type: 'medication', item })} />
      )}

      {checkout?.type === 'consultation' && (
        <ConsultationCheckout item={checkout.item} onClose={() => setCheckout(null)} onPaid={handlePaid} />
      )}
      {checkout?.type === 'medication' && (
        <MedicationCheckout recordId={checkout.item.medical_record_id} onClose={() => setCheckout(null)} onPaid={handlePaid} />
      )}
      {receipt && <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />}
    </div>
  );
};

// ---------------------------------------------------------------------------

const ConsultationTable = ({ items, onCollect }) => {
  if (items.length === 0) {
    return <div className="cashier-empty">🎉 Không có lịch hẹn nào chờ thu phí khám</div>;
  }
  return (
    <div className="cashier-table-wrap">
      <table className="cashier-table cashier-table-cards">
        <thead>
          <tr>
            <th>Mã LH</th>
            <th>Bệnh nhân</th>
            <th>Ngày khám</th>
            <th>Bác sĩ / Chuyên khoa</th>
            <th>Trạng thái</th>
            <th className="num">Phí khám</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((c) => (
            <tr key={c.appointment_id} className={c.transfer_reported_at ? 'row-reported' : undefined}>
              <td data-label="Mã LH">#{c.appointment_id}</td>
              <td data-label="Bệnh nhân">
                <div className="cell-main">{c.patient_name || '—'}</div>
                <div className="cell-sub">{c.patient_phone}</div>
              </td>
              <td data-label="Ngày khám">
                <div className="cell-main">{formatDate(c.appointment_date)}</div>
                <div className="cell-sub">{c.time_slot}</div>
              </td>
              <td data-label="Bác sĩ">
                <div className="cell-main">{c.doctor_name || '—'}</div>
                <div className="cell-sub">{c.department_name}</div>
              </td>
              <td data-label="Trạng thái">
                <span className={`cashier-chip chip-${c.status}`}>
                  {c.status === 'checked_in' ? 'Đã check-in' : c.status === 'completed' ? 'Đã khám' : 'Đã đặt'}
                </span>
                {c.payment_method === 'bank_transfer' && (
                  <div className="cell-sub" title="Đối chiếu nội dung này trên sao kê ngân hàng trước khi xác nhận">
                    🏦 Chuyển khoản · ND: <strong>{c.transfer_content}</strong>
                  </div>
                )}
                {c.transfer_reported_at && (
                  <div className="cashier-reported">
                    🔔 BN báo đã chuyển lúc {new Date(c.transfer_reported_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
              </td>
              <td data-label="Phí khám" className="num strong">{formatCurrency(c.consultation_fee)}</td>
              <td data-label="" className="actions">
                <button className="cashier-btn cashier-btn-primary" onClick={() => onCollect(c)}>
                  {c.transfer_reported_at ? 'Xác nhận đã nhận' : 'Thu tiền'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const MedicationTable = ({ items, onCollect }) => {
  if (items.length === 0) {
    return <div className="cashier-empty">🎉 Không có đơn thuốc nào chờ thanh toán</div>;
  }
  return (
    <div className="cashier-table-wrap">
      <table className="cashier-table cashier-table-cards">
        <thead>
          <tr>
            <th>Mã HS</th>
            <th>Bệnh nhân</th>
            <th>Ngày kê đơn</th>
            <th>Bác sĩ / Chẩn đoán</th>
            <th className="num">Số thuốc</th>
            <th className="num">Tạm tính</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((m) => (
            <tr key={m.medical_record_id}>
              <td data-label="Mã HS">#{m.medical_record_id}</td>
              <td data-label="Bệnh nhân">
                <div className="cell-main">{m.patient_name || '—'}</div>
                <div className="cell-sub">{m.patient_phone}</div>
              </td>
              <td data-label="Ngày kê đơn">{formatDate(m.created_at)}</td>
              <td data-label="Bác sĩ">
                <div className="cell-main">{m.doctor_name || '—'}</div>
                <div className="cell-sub">{m.diagnosis}</div>
              </td>
              <td data-label="Số thuốc" className="num">{m.item_count}</td>
              <td data-label="Tạm tính" className="num">
                {m.unpriced_items > 0
                  ? <span className="cashier-hint">Chưa có giá ({m.unpriced_items})</span>
                  : <strong>{formatCurrency(m.estimated_total)}</strong>}
              </td>
              <td data-label="" className="actions">
                <button className="cashier-btn cashier-btn-primary" onClick={() => onCollect(m)}>Thu tiền</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ---------------------------------------------------------------------------

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

const ConsultationCheckout = ({ item, onClose, onPaid }) => {
  // Pre-select what the patient chose when booking (e.g. bank transfer)
  const [method, setMethod] = useState(item.payment_method || 'cash');
  const [amount, setAmount] = useState(String(Math.round(item.consultation_fee || 0)));
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    const value = Number(amount);
    if (!value || value <= 0) {
      setError('Số tiền phải lớn hơn 0');
      return;
    }
    try {
      setSubmitting(true);
      setError('');
      const res = await paymentApi.post('/consultation', {
        appointment_id: item.appointment_id,
        amount: value,
        payment_method: method,
        notes: notes.trim() || undefined
      });
      onPaid({
        type: 'Phí khám',
        transactionId: res.data.transaction_id,
        amount: res.data.amount,
        method,
        patientName: item.patient_name,
        detail: `${item.department_name || ''} · ${item.doctor_name || ''} · ${formatDate(item.appointment_date)} ${item.time_slot}`
      });
    } catch (err) {
      setError(getErrorMessage(err, 'Thanh toán thất bại'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={`Thu phí khám · Lịch hẹn #${item.appointment_id}`}
      onClose={onClose}
      footer={
        <>
          <button className="cashier-btn cashier-btn-secondary" onClick={onClose} disabled={submitting}>Hủy</button>
          <button className="cashier-btn cashier-btn-primary" onClick={submit} disabled={submitting}>
            {submitting ? 'Đang xử lý…' : `Xác nhận thu ${formatCurrency(amount)}`}
          </button>
        </>
      }
    >
      <dl className="cashier-info">
        <dt>Bệnh nhân</dt><dd>{item.patient_name} · {item.patient_phone}</dd>
        <dt>Chuyên khoa</dt><dd>{item.department_name || '—'}</dd>
        <dt>Bác sĩ</dt><dd>{item.doctor_name || '—'}</dd>
        {item.payment_method === 'bank_transfer' && (
          <>
            <dt>Chuyển khoản</dt>
            <dd>Kiểm tra tài khoản đã nhận tiền với nội dung <strong>{item.transfer_content}</strong> rồi mới xác nhận</dd>
          </>
        )}
        <dt>Thời gian</dt><dd>{formatDate(item.appointment_date)} · {item.time_slot}</dd>
      </dl>

      <label className="cashier-label" htmlFor="consult-amount">Số tiền (VNĐ)</label>
      <input
        id="consult-amount"
        type="number"
        min="0"
        step="1000"
        className="cashier-input cashier-amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />

      <div className="cashier-label">Phương thức thanh toán</div>
      <PaymentMethodSelector selectedMethod={method} onSelect={setMethod} disabled={submitting} />

      <label className="cashier-label" htmlFor="consult-notes">Ghi chú</label>
      <input
        id="consult-notes"
        className="cashier-input"
        placeholder="Không bắt buộc"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />

      {error && <div className="cashier-alert cashier-alert-error">⚠️ {error}</div>}
    </Modal>
  );
};

const MedicationCheckout = ({ recordId, onClose, onPaid }) => {
  const [bill, setBill] = useState(null);
  const [prices, setPrices] = useState({});
  const [taken, setTaken] = useState({}); // prescription id -> patient takes it (false = buys elsewhere)
  const [method, setMethod] = useState('cash');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await paymentApi.get(`/medication/${recordId}`);
        const b = res.data.data;
        setBill(b);
        setPrices(Object.fromEntries(b.items.map((i) => [i.id, i.unit_price === null ? '' : String(Math.round(i.unit_price))])));
        // handed over by default: catalogue items with enough stock (outside items are bought elsewhere)
        setTaken(Object.fromEntries(b.items.map((i) => [i.id, i.in_catalogue ? i.enough_stock !== false : i.unit_price !== null])));
      } catch (err) {
        setError(getErrorMessage(err, 'Không thể tải đơn thuốc'));
      } finally {
        setLoading(false);
      }
    })();
  }, [recordId]);

  const total = useMemo(() => {
    if (!bill) return 0;
    return bill.items.reduce((sum, i) => sum + (taken[i.id] ? (Number(prices[i.id]) || 0) * i.quantity : 0), 0);
  }, [bill, prices, taken]);

  const missing = bill ? bill.items.filter((i) => taken[i.id] && (prices[i.id] === '' || Number(prices[i.id]) < 0)).length : 0;
  const takenCount = bill ? bill.items.filter((i) => taken[i.id]).length : 0;

  const submit = async () => {
    if (takenCount === 0) {
      setError('Bệnh nhân không lấy thuốc nào – không có gì để thu');
      return;
    }
    if (missing > 0) {
      setError('Vui lòng nhập đơn giá cho các thuốc bệnh nhân lấy');
      return;
    }
    if (total <= 0) {
      setError('Tổng tiền thuốc phải lớn hơn 0');
      return;
    }
    try {
      setSubmitting(true);
      setError('');
      const res = await paymentApi.post('/medication', {
        medical_record_id: recordId,
        payment_method: method,
        items: bill.items.map((i) => (taken[i.id]
          ? { prescription_id: i.id, unit_price: Number(prices[i.id]) }
          : { prescription_id: i.id, skip: true })),
        notes: notes.trim() || undefined
      });
      onPaid({
        type: 'Tiền thuốc',
        transactionId: res.data.transaction_id,
        amount: res.data.amount,
        method,
        patientName: bill.patient_name,
        detail: `Hồ sơ #${bill.id} · ${takenCount}/${bill.items.length} loại thuốc`,
        items: bill.items.filter((i) => taken[i.id]).map((i) => ({ name: i.medicine_name, quantity: i.quantity, price: Number(prices[i.id]) }))
      });
    } catch (err) {
      setError(getErrorMessage(err, 'Thanh toán thất bại'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={`Thu tiền thuốc · Hồ sơ #${recordId}`}
      onClose={onClose}
      footer={
        <>
          <button className="cashier-btn cashier-btn-secondary" onClick={onClose} disabled={submitting}>Hủy</button>
          <button className="cashier-btn cashier-btn-primary" onClick={submit} disabled={submitting || loading || !bill}>
            {submitting ? 'Đang xử lý…' : `Xác nhận thu ${formatCurrency(total)}`}
          </button>
        </>
      }
    >
      {loading && <div className="cashier-empty">Đang tải đơn thuốc…</div>}
      {bill && (
        <>
          <dl className="cashier-info">
            <dt>Bệnh nhân</dt><dd>{bill.patient_name} · {bill.patient_phone}</dd>
            <dt>Bác sĩ</dt><dd>{bill.doctor_name || '—'} {bill.department_name ? `· ${bill.department_name}` : ''}</dd>
            <dt>Chẩn đoán</dt><dd>{bill.diagnosis || '—'}</dd>
          </dl>

          <div className="cashier-table-wrap">
            <table className="cashier-table cashier-table-compact">
              <thead>
                <tr>
                  <th>Lấy</th>
                  <th>Thuốc</th>
                  <th className="num">SL</th>
                  <th className="num">Đơn giá (VNĐ)</th>
                  <th className="num">Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                {bill.items.map((i) => (
                  <tr key={i.id} className={taken[i.id] ? '' : 'cashier-row-skipped'}>
                    <td>
                      <input
                        type="checkbox"
                        checked={Boolean(taken[i.id])}
                        onChange={(e) => setTaken((t) => ({ ...t, [i.id]: e.target.checked }))}
                        aria-label={`Bệnh nhân lấy ${i.medicine_name}`}
                      />
                    </td>
                    <td>
                      <div className="cell-main">{i.medicine_name}</div>
                      <div className="cell-sub">{i.dosage}{i.instructions ? ` · ${i.instructions}` : ''}</div>
                      <div className={`cell-sub ${i.enough_stock === false ? 'cashier-stock-short' : ''}`}>
                        {i.in_catalogue
                          ? (i.enough_stock === false
                            ? `⚠️ Kho chỉ còn ${i.stock} ${i.unit || ''} – bỏ chọn nếu bệnh nhân mua ngoài`
                            : `Kho còn ${i.stock} ${i.unit || ''}`)
                          : 'Ngoài danh mục – nhập giá nếu nhà thuốc có bán'}
                      </div>
                    </td>
                    <td className="num">{i.quantity}{i.unit ? ` ${i.unit}` : ''}</td>
                    <td className="num">
                      <input
                        type="number"
                        min="0"
                        step="500"
                        className="cashier-input cashier-price"
                        value={prices[i.id]}
                        placeholder="0"
                        onChange={(e) => setPrices((p) => ({ ...p, [i.id]: e.target.value }))}
                        disabled={!taken[i.id]}
                        aria-label={`Đơn giá ${i.medicine_name}`}
                      />
                    </td>
                    <td className="num">{taken[i.id] ? formatCurrency((Number(prices[i.id]) || 0) * i.quantity) : 'Không lấy'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} className="num">Tổng cộng</td>
                  <td className="num strong">{formatCurrency(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="cashier-label">Phương thức thanh toán</div>
          <PaymentMethodSelector selectedMethod={method} onSelect={setMethod} disabled={submitting} />

          <label className="cashier-label" htmlFor="med-notes">Ghi chú</label>
          <input
            id="med-notes"
            className="cashier-input"
            placeholder="Không bắt buộc"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </>
      )}
      {error && <div className="cashier-alert cashier-alert-error">⚠️ {error}</div>}
    </Modal>
  );
};

const ReceiptModal = ({ receipt, onClose }) => (
  <Modal
    title="Thanh toán thành công"
    onClose={onClose}
    footer={
      <>
        <button className="cashier-btn cashier-btn-secondary" onClick={() => window.print()}>🖨 In biên lai</button>
        <button className="cashier-btn cashier-btn-primary" onClick={onClose}>Xong</button>
      </>
    }
  >
    <div className="cashier-receipt">
      <div className="receipt-check">✓</div>
      <div className="receipt-amount">{formatCurrency(receipt.amount)}</div>
      <dl className="cashier-info">
        <dt>Mã giao dịch</dt><dd>#{receipt.transactionId}</dd>
        <dt>Loại</dt><dd>{receipt.type}</dd>
        <dt>Bệnh nhân</dt><dd>{receipt.patientName}</dd>
        <dt>Chi tiết</dt><dd>{receipt.detail}</dd>
        <dt>Phương thức</dt><dd>{PAYMENT_METHOD_LABELS[receipt.method] || receipt.method}</dd>
        <dt>Thời gian</dt><dd>{formatDateTime(new Date())}</dd>
      </dl>
      {receipt.items && (
        <ul className="receipt-items">
          {receipt.items.map((i, idx) => (
            <li key={idx}>
              <span>{i.name} × {i.quantity}</span>
              <span>{formatCurrency(i.price * i.quantity)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  </Modal>
);

export default CashierDesk;
