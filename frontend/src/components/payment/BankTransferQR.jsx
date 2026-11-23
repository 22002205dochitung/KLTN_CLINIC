import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE } from '../../config/api';
import './BankTransferQR.css';
import { SepayPayButton } from './SepayGateway';

const formatCurrency = (v) => `${Number(v || 0).toLocaleString('vi-VN')} đ`;

// Banking apps supported by VietQR deeplinks (https://api.vietqr.io/v2/android-app-deeplinks)
const BANK_APPS = [
  { id: 'mb', name: 'MB Bank' },
  { id: 'vcb', name: 'Vietcombank' },
  { id: 'tcb', name: 'Techcombank' },
  { id: 'bidv', name: 'BIDV' },
  { id: 'icb', name: 'VietinBank' },
  { id: 'vba', name: 'Agribank' },
  { id: 'acb', name: 'ACB' },
  { id: 'tpb', name: 'TPBank' }
];

/** Deeplink that opens a banking app with account, amount and description pre-filled */
const bankAppLink = (appId, info) => {
  const params = new URLSearchParams({
    app: appId,
    ba: `${info.bank.account_no}@${info.bank.code || info.bank.bin}`,
    am: String(Math.round(info.amount)),
    tn: info.content
  });
  return `https://dl.vietqr.io/pay?${params.toString()}`;
};

const CopyButton = ({ value, label }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      // clipboard blocked (http / old browser): the value stays visible to copy by hand
    }
  };
  return (
    <button type="button" className={`btqr-copy ${copied ? 'is-copied' : ''}`} onClick={copy} aria-label={`Sao chép ${label}`}>
      {copied ? '✓ Đã chép' : 'Sao chép'}
    </button>
  );
};

/**
 * BankTransferQR - dynamic VietQR to pay one booking's consultation fee by bank transfer.
 *
 * The QR carries the clinic account, the exact amount and the transfer description, so the
 * patient only scans and confirms in their banking app. The cashier confirms receipt; this
 * component polls the status so the patient sees "Đã thanh toán" without reloading.
 */
const formatTime = (value) => {
  if (!value) return '';
  const d = new Date(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
};

const BankTransferQR = ({ appointmentId }) => {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [reporting, setReporting] = useState(false);
  const [reportError, setReportError] = useState('');

  const reported = !!info?.transfer_reported_at;

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      axios.get(`${API_BASE}/payments/bank-transfer/${appointmentId}`)
        .then((res) => { if (!cancelled) { setInfo(res.data.data); setError(''); } })
        .catch((err) => {
          if (!cancelled) setError(err.response?.data?.error?.message || 'Không thể tải thông tin chuyển khoản');
        });
    };
    load();
    // Check more often once the patient says they paid, so "Đã thanh toán" shows up quickly
    const timer = setInterval(load, reported ? 8000 : 15000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [appointmentId, reported]);

  const reportTransfer = async () => {
    try {
      setReporting(true);
      setReportError('');
      const res = await axios.post(`${API_BASE}/payments/bank-transfer/${appointmentId}/report`);
      setInfo((i) => ({
        ...i,
        transfer_reported_at: res.data.transfer_reported_at || new Date().toISOString(),
        payment_status: res.data.already_paid ? 'paid' : i.payment_status
      }));
    } catch (err) {
      setReportError(err.response?.data?.error?.message || 'Không gửi được, vui lòng thử lại');
    } finally {
      setReporting(false);
    }
  };

  if (error) return <div className="btqr-notice is-error">⚠️ {error}</div>;
  if (!info) return <div className="btqr-notice">Đang tạo mã thanh toán…</div>;

  if (info.payment_status === 'paid') {
    return (
      <div className="btqr-notice is-paid">
        <span className="btqr-paid-icon">✓</span>
        <div>
          <strong>Đã thanh toán {formatCurrency(info.amount)}</strong>
          <div>Phòng khám đã xác nhận nhận tiền cho lịch hẹn #{info.appointment_id}.</div>
        </div>
      </div>
    );
  }
  if (info.appointment_status === 'cancelled') {
    return <div className="btqr-notice">Lịch hẹn đã huỷ, không cần thanh toán.</div>;
  }
  if (!info.configured) {
    return (
      <div className="btqr-notice is-error">
        Phòng khám chưa cấu hình tài khoản nhận chuyển khoản. Vui lòng thanh toán {formatCurrency(info.amount)} tại quầy.
      </div>
    );
  }

  return (
    <section className="btqr" aria-label="Thanh toán phí khám bằng chuyển khoản">
      <header className="btqr-header">
        <div>
          <div className="btqr-eyebrow">Thanh toán phí khám</div>
          <div className="btqr-amount">{formatCurrency(info.amount)}</div>
        </div>
        <span className={`btqr-status ${reported ? 'is-reported' : ''}`}>
          <span className="btqr-dot" aria-hidden="true" />
          {reported ? 'Đang kiểm tra thanh toán' : 'Chờ thanh toán'}
        </span>
      </header>

      {/* Fastest: SePay payment gateway (card / VietQR / NAPAS), confirmed automatically */}
      <SepayPayButton appointmentId={appointmentId} />

      {/* Phones: open the banking app directly (QR can't be scanned on the same screen) */}
      <div className="btqr-apps">
        <div className="btqr-apps-title">📱 Đang dùng điện thoại? Bấm để mở app ngân hàng, thông tin đã điền sẵn:</div>
        <div className="btqr-apps-grid">
          {BANK_APPS.map((app) => (
            <a key={app.id} className="btqr-app" href={bankAppLink(app.id, info)} rel="noopener noreferrer">
              {app.name}
            </a>
          ))}
        </div>
        <div className="btqr-apps-hint">
          App không tự điền? Bấm <strong>Mở ảnh mã QR</strong> bên dưới, lưu ảnh rồi chọn “Quét QR từ ảnh” trong app ngân hàng.
        </div>
      </div>

      <div className="btqr-body">
        <figure className="btqr-qr">
          <img
            src={info.qr_url}
            alt={`Mã VietQR chuyển ${formatCurrency(info.amount)} với nội dung ${info.content}`}
            width="240"
            height="240"
          />
          <figcaption>Quét bằng app ngân hàng hoặc ví hỗ trợ VietQR</figcaption>
          <a className="btqr-download" href={info.qr_url} target="_blank" rel="noopener noreferrer">
            Mở ảnh mã QR ↗
          </a>
        </figure>

        <div className="btqr-details">
          <div className="btqr-row">
            <span className="btqr-label">Ngân hàng</span>
            <span className="btqr-value">{info.bank.bank_name || `Mã NH ${info.bank.bin}`}</span>
          </div>
          <div className="btqr-row">
            <span className="btqr-label">Chủ tài khoản</span>
            <span className="btqr-value">{info.bank.account_name}</span>
          </div>
          <div className="btqr-row">
            <span className="btqr-label">Số tài khoản</span>
            <span className="btqr-value mono">{info.bank.account_no}</span>
            <CopyButton value={info.bank.account_no} label="số tài khoản" />
          </div>
          <div className="btqr-row">
            <span className="btqr-label">Số tiền</span>
            <span className="btqr-value">{formatCurrency(info.amount)}</span>
            <CopyButton value={String(Math.round(info.amount))} label="số tiền" />
          </div>
          <div className="btqr-row is-highlight">
            <span className="btqr-label">Nội dung</span>
            <span className="btqr-value mono">{info.content}</span>
            <CopyButton value={info.content} label="nội dung chuyển khoản" />
          </div>

          <ol className="btqr-steps">
            <li>Mở app ngân hàng, chọn <strong>Quét QR</strong>.</li>
            <li>Kiểm tra tên <strong>{info.bank.account_name}</strong> và số tiền, giữ nguyên nội dung <strong>{info.content}</strong>.</li>
            <li>Chuyển xong, bấm <strong>Tôi đã chuyển khoản</strong> bên dưới.</li>
          </ol>
        </div>
      </div>

      <footer className="btqr-footer">
        {reported ? (
          <div className="btqr-reported" role="status">
            <span className="btqr-spinner" aria-hidden="true" />
            <div>
              <strong>Đã báo chuyển khoản lúc {formatTime(info.transfer_reported_at)}</strong>
              <div>
                {info.auto_confirm
                  ? 'Hệ thống sẽ tự xác nhận khi tiền về tài khoản (thường dưới 1 phút).'
                  : 'Thu ngân đang kiểm tra tài khoản. Trang này tự cập nhật khi được xác nhận.'}
              </div>
            </div>
          </div>
        ) : (
          <>
            <button type="button" className="btqr-confirm" onClick={reportTransfer} disabled={reporting}>
              {reporting ? 'Đang gửi…' : '✅ Tôi đã chuyển khoản'}
            </button>
            <p className="btqr-confirm-hint">
              {info.auto_confirm
                ? 'Không bấm cũng được: hệ thống tự nhận diện khi tiền về.'
                : 'Bấm sau khi app ngân hàng báo chuyển thành công để thu ngân xác nhận nhanh hơn.'}
            </p>
            {reportError && <p className="btqr-confirm-error">{reportError}</p>}
          </>
        )}
      </footer>
    </section>
  );
};

export default BankTransferQR;
