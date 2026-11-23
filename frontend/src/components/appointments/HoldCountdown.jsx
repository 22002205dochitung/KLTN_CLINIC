import React, { useEffect, useState } from 'react';

/** Countdown of the payment hold (online transfer) */
const HoldCountdown = ({ seconds }) => {
  const [left, setLeft] = useState(Math.max(0, Number(seconds) || 0));
  useEffect(() => {
    if (left <= 0) return undefined;
    const t = setInterval(() => setLeft((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, [left]);
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  return left > 0 ? (
    <div className="hold-countdown" role="timer" aria-live="off">
      ⏱️ Đang giữ chỗ cho bạn: <b>{mm}:{ss}</b> – chuyển khoản trong thời gian này, quá hạn lịch sẽ tự huỷ.
    </div>
  ) : (
    <div className="hold-countdown is-over" role="alert">
      ⌛ Đã hết thời gian giữ chỗ. Nếu bạn đã chuyển khoản, bấm "Tôi đã chuyển khoản" để phòng khám kiểm tra.
    </div>
  );
};

export default HoldCountdown;
