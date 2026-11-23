const { pool } = require('../config/database');

/**
 * GET /api/notifications
 * In-app notifications, computed from current data for the logged-in user's role (no table:
 * they appear and disappear with the situation). Each item has a stable `id`, so the client
 * can remember which ones were read.
 *
 * item: { id, level: 'info'|'warning'|'success', icon, title, message, page, at }
 */

const pad = (n) => String(n).padStart(2, '0');
const dmy = (ymd) => (ymd ? String(ymd).split('-').reverse().join('/') : '');
const money = (v) => `${Number(v || 0).toLocaleString('vi-VN')} đ`;

const patientNotifications = async (userId) => {
  const items = [];

  // Upcoming visits today / tomorrow
  const [soon] = await pool.execute(
    `SELECT a.id, DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS d, a.time_slot, a.status,
            (a.appointment_date = CURDATE()) AS is_today, du.fullname AS doctor_name
     FROM appointments a
     JOIN doctors doc ON doc.id = a.doctor_id
     JOIN users du ON du.id = doc.user_id
     WHERE a.patient_id = ? AND a.status IN ('booked', 'checked_in')
       AND a.appointment_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 1 DAY)
     ORDER BY a.appointment_date, a.time_slot`,
    [userId]
  );
  soon.forEach((a) => {
    const today = Number(a.is_today);
    items.push({
      id: `visit-${a.id}-${a.d}-${a.status}`,
      level: 'info',
      icon: today ? '🏥' : '📅',
      title: today ? 'Hôm nay bạn có lịch khám' : 'Ngày mai bạn có lịch khám',
      message: `${a.time_slot} · ${a.doctor_name}. ${a.status === 'checked_in' ? 'Bạn đã check-in, theo dõi số thứ tự trên Dashboard.' : 'Đến sớm 10–15 phút và quét mã QR tại quầy.'}`,
      page: today ? 'dashboard' : 'appointment-history',
      at: a.d
    });
  });

  // In today's queue: called in now / only 1–2 people left
  const { getTicketInfo } = require('./queueController');
  for (const a of soon.filter((x) => Number(x.is_today) && x.status === 'checked_in')) {
    const t = await getTicketInfo(a.id);
    if (!t) continue;
    const num = String(t.ticket_number).padStart(2, '0');
    if (t.state === 'serving') {
      items.push({
        id: `queue-called-${a.id}-${t.call_count}`,
        level: 'warning',
        icon: '🔔',
        title: `Đến lượt bạn – số ${num}`,
        message: `Mời vào phòng khám ${t.room} (${a.doctor_name}).`,
        page: 'dashboard',
        at: a.d
      });
    } else if (t.state === 'waiting' && t.patients_ahead <= 2) {
      items.push({
        id: `queue-near-${a.id}`,
        level: 'warning',
        icon: '⏰',
        title: `Sắp đến lượt bạn – số ${num}`,
        message: t.patients_ahead === 0
          ? `Bạn là người tiếp theo, vui lòng ngồi trước phòng khám ${t.room}.`
          : `Còn ${t.patients_ahead} người nữa, vui lòng ngồi gần phòng khám ${t.room}.`,
        page: 'dashboard',
        at: a.d
      });
    }
  }

  // Booked on a day the doctor is now off
  const [onLeave] = await pool.execute(
    `SELECT a.id, DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS d, a.time_slot, du.fullname AS doctor_name
     FROM appointments a
     JOIN doctor_leaves l ON l.doctor_id = a.doctor_id AND l.leave_date = a.appointment_date
     JOIN doctors doc ON doc.id = a.doctor_id
     JOIN users du ON du.id = doc.user_id
     WHERE a.patient_id = ? AND a.status = 'booked' AND a.appointment_date >= CURDATE()`,
    [userId]
  );
  onLeave.forEach((a) => items.push({
    id: `leave-${a.id}-${a.d}`,
    level: 'warning',
    icon: '⚠️',
    title: 'Bác sĩ nghỉ đúng ngày bạn hẹn',
    message: `${a.doctor_name} nghỉ ngày ${dmy(a.d)} (${a.time_slot}). Vui lòng đổi sang ngày khác.`,
    page: 'appointment-history',
    at: a.d
  }));

  // Follow-up due within 3 days (or up to 7 days overdue) and not booked after that visit
  const [follow] = await pool.execute(
    `SELECT mr.id, DATE_FORMAT(mr.reexamination_date, '%Y-%m-%d') AS d, du.fullname AS doctor_name
     FROM medical_records mr
     JOIN appointments a ON a.id = mr.appointment_id
     JOIN doctors doc ON doc.id = a.doctor_id
     JOIN users du ON du.id = doc.user_id
     WHERE a.patient_id = ?
       AND mr.reexamination_date BETWEEN DATE_SUB(CURDATE(), INTERVAL 7 DAY) AND DATE_ADD(CURDATE(), INTERVAL 3 DAY)
       AND NOT EXISTS (
         SELECT 1 FROM appointments b
         WHERE b.patient_id = a.patient_id AND b.doctor_id = a.doctor_id AND b.id <> a.id
           AND b.appointment_date > a.appointment_date AND b.created_at >= mr.created_at
           AND (b.status = 'completed' OR (b.status IN ('booked', 'checked_in') AND b.appointment_date >= CURDATE()))
       )`,
    [userId]
  );
  follow.forEach((f) => items.push({
    id: `followup-${f.id}`,
    level: 'warning',
    icon: '🔁',
    title: 'Đến hẹn tái khám',
    message: `${f.doctor_name} hẹn bạn tái khám ngày ${dmy(f.d)}. Bấm để đặt lịch.`,
    page: 'dashboard',
    at: f.d
  }));

  // Finished visits of the last 7 days not reviewed yet
  const [toReview] = await pool.execute(
    `SELECT a.id, DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS d, du.fullname AS doctor_name
     FROM appointments a
     JOIN doctors doc ON doc.id = a.doctor_id
     JOIN users du ON du.id = doc.user_id
     LEFT JOIN appointment_reviews r ON r.appointment_id = a.id
     WHERE a.patient_id = ? AND a.status = 'completed' AND r.id IS NULL
       AND a.appointment_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`,
    [userId]
  );
  toReview.forEach((a) => items.push({
    id: `review-${a.id}`,
    level: 'info',
    icon: '⭐',
    title: 'Đánh giá buổi khám',
    message: `Buổi khám ngày ${dmy(a.d)} với ${a.doctor_name} thế nào? Bấm để đánh giá.`,
    page: 'appointment-history',
    at: a.d
  }));

  // Payments confirmed in the last 3 days
  const [paid] = await pool.execute(
    `SELECT id, transaction_type, amount, DATE_FORMAT(paid_at, '%Y-%m-%d %H:%i') AS t
     FROM payment_transactions
     WHERE patient_id = ? AND payment_status = 'completed' AND paid_at >= DATE_SUB(NOW(), INTERVAL 3 DAY)
     ORDER BY paid_at DESC LIMIT 5`,
    [userId]
  );
  paid.forEach((p) => items.push({
    id: `paid-${p.id}`,
    level: 'success',
    icon: '✅',
    title: 'Thanh toán thành công',
    message: `${p.transaction_type === 'medication' ? 'Tiền thuốc' : 'Phí khám'} ${money(p.amount)} đã được xác nhận.`,
    page: 'payment-history',
    at: p.t
  }));

  // Cancelled automatically: online payment not made within the hold time
  const [expired] = await pool.execute(
    `SELECT a.id, DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS d, a.time_slot, DATE_FORMAT(a.hold_expires_at, '%Y-%m-%d') AS at
     FROM appointments a
     WHERE a.patient_id = ? AND a.status = 'cancelled' AND a.payment_status = 'unpaid'
       AND a.hold_expires_at IS NOT NULL AND a.hold_expires_at BETWEEN DATE_SUB(NOW(), INTERVAL 3 DAY) AND NOW()`,
    [userId]
  );
  expired.forEach((a) => items.push({
    id: `hold-expired-${a.id}`,
    level: 'warning',
    icon: '⌛',
    title: 'Lịch hẹn đã tự huỷ do quá hạn thanh toán',
    message: `Lịch #${a.id} (${dmy(a.d)} · ${a.time_slot}) chưa được thanh toán trong thời gian giữ chỗ. Bạn có thể đặt lại.`,
    page: 'booking',
    at: a.at
  }));

  // Chose bank transfer for an upcoming visit but not paid yet
  const [unpaid] = await pool.execute(
    `SELECT a.id, DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS d, a.consultation_fee, a.transfer_reported_at,
            DATE_FORMAT(a.hold_expires_at, '%H:%i') AS hold_until, (a.hold_expires_at > NOW()) AS holding
     FROM appointments a
     WHERE a.patient_id = ? AND a.status = 'booked' AND a.payment_status = 'unpaid'
       AND a.payment_method = 'bank_transfer' AND a.appointment_date >= CURDATE()`,
    [userId]
  );
  unpaid.forEach((a) => items.push(a.transfer_reported_at
    ? {
      id: `transfer-wait-${a.id}`,
      level: 'info',
      icon: '⏳',
      title: 'Đang chờ xác nhận chuyển khoản',
      message: `Lịch #${a.id}: phòng khám sẽ xác nhận khi nhận được tiền.`,
      page: 'appointment-history',
      at: a.d
    }
    : Number(a.holding) ? {
      id: `transfer-hold-${a.id}`,
      level: 'warning',
      icon: '⏱️',
      title: `Thanh toán trước ${a.hold_until} để giữ lịch`,
      message: `Lịch #${a.id} ngày ${dmy(a.d)}: chuyển khoản ${money(a.consultation_fee)}. Quá giờ chưa thanh toán, lịch sẽ tự huỷ.`,
      page: 'appointment-history',
      at: a.d
    }
    : {
      id: `transfer-due-${a.id}`,
      level: 'info',
      icon: '🏦',
      title: 'Chưa chuyển khoản phí khám',
      message: `Lịch #${a.id} ngày ${dmy(a.d)}: ${money(a.consultation_fee)}. Mở "Lịch hẹn của tôi" → Chuyển khoản.`,
      page: 'appointment-history',
      at: a.d
    }));

  return items;
};

const frontDeskNotifications = async () => {
  const items = [];
  const [reported] = await pool.execute(
    `SELECT a.id, a.consultation_fee, DATE_FORMAT(a.transfer_reported_at, '%Y-%m-%d %H:%i') AS t, u.fullname AS patient_name
     FROM appointments a JOIN users u ON u.id = a.patient_id
     WHERE a.transfer_reported_at IS NOT NULL AND a.payment_status = 'unpaid' AND a.status <> 'cancelled'
     ORDER BY a.transfer_reported_at`
  );
  reported.forEach((a) => items.push({
    id: `transfer-check-${a.id}`,
    level: 'warning',
    icon: '🔔',
    title: 'Bệnh nhân báo đã chuyển khoản',
    message: `${a.patient_name} · lịch #${a.id} · ${money(a.consultation_fee)} (nội dung THCT${a.id}). Kiểm tra tài khoản rồi xác nhận.`,
    page: 'cashier',
    at: a.t
  }));

  const [onLeave] = await pool.execute(
    `SELECT COUNT(*) AS n, MIN(DATE_FORMAT(a.appointment_date, '%Y-%m-%d')) AS first_day
     FROM appointments a
     JOIN doctor_leaves l ON l.doctor_id = a.doctor_id AND l.leave_date = a.appointment_date
     WHERE a.status = 'booked' AND a.appointment_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)`
  );
  if (Number(onLeave[0].n) > 0) {
    items.push({
      id: `leave-calls-${onLeave[0].n}-${onLeave[0].first_day}`,
      level: 'warning',
      icon: '📞',
      title: 'Có lịch hẹn rơi vào ngày bác sĩ nghỉ',
      message: `${onLeave[0].n} lịch hẹn (sớm nhất ${dmy(onLeave[0].first_day)}) cần gọi bệnh nhân đổi lịch.`,
      page: 'doctor-leaves',
      at: onLeave[0].first_day
    });
  }
  return items;
};

const doctorNotifications = async (userId) => {
  const items = [];
  const [[doc]] = await pool.execute('SELECT id FROM doctors WHERE user_id = ?', [userId]);
  if (!doc) return items;
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  const [[waiting]] = await pool.execute(
    `SELECT COUNT(*) AS n FROM appointments
     WHERE doctor_id = ? AND status = 'checked_in' AND appointment_date = CURDATE()`,
    [doc.id]
  );
  if (Number(waiting.n) > 0) {
    items.push({
      id: `queue-${todayKey}-${waiting.n}`,
      level: 'warning',
      icon: '⏳',
      title: `${waiting.n} bệnh nhân đang chờ khám`,
      message: 'Mở hàng đợi để gọi bệnh nhân theo thứ tự check-in.',
      page: 'doctor-queue',
      at: todayKey
    });
  }

  const [[tomorrow]] = await pool.execute(
    `SELECT COUNT(*) AS n FROM appointments
     WHERE doctor_id = ? AND status = 'booked' AND appointment_date = DATE_ADD(CURDATE(), INTERVAL 1 DAY)`,
    [doc.id]
  );
  if (Number(tomorrow.n) > 0) {
    items.push({
      id: `tomorrow-${todayKey}-${tomorrow.n}`,
      level: 'info',
      icon: '📅',
      title: `Ngày mai có ${tomorrow.n} lịch hẹn`,
      message: 'Xem chi tiết trong Lịch làm việc.',
      page: 'doctor-schedule',
      at: todayKey
    });
  }

  const [[overdue]] = await pool.execute(
    `SELECT COUNT(*) AS n
     FROM medical_records mr
     JOIN appointments a ON a.id = mr.appointment_id
     WHERE a.doctor_id = ? AND mr.reexamination_date BETWEEN DATE_SUB(CURDATE(), INTERVAL 30 DAY) AND DATE_SUB(CURDATE(), INTERVAL 1 DAY)
       AND NOT EXISTS (
         SELECT 1 FROM appointments b
         WHERE b.patient_id = a.patient_id AND b.doctor_id = a.doctor_id AND b.id <> a.id
           AND b.appointment_date > a.appointment_date AND b.created_at >= mr.created_at
           AND (b.status = 'completed' OR (b.status IN ('booked', 'checked_in') AND b.appointment_date >= CURDATE()))
       )`,
    [doc.id]
  );
  if (Number(overdue.n) > 0) {
    items.push({
      id: `followup-overdue-${todayKey}-${overdue.n}`,
      level: 'warning',
      icon: '🔁',
      title: `${overdue.n} bệnh nhân quá hạn tái khám`,
      message: 'Chưa đặt lịch tái khám – có thể gọi nhắc bệnh nhân.',
      page: 'doctor-follow-ups',
      at: todayKey
    });
  }
  return items;
};

/** Admin: medicines at or below their minimum stock (kho thuốc) */
const stockNotifications = async () => {
  const [low] = await pool.execute(
    `SELECT id, name, unit, stock, min_stock FROM medicines
     WHERE active = 1 AND stock <= min_stock
     ORDER BY (stock = 0) DESC, stock / GREATEST(min_stock, 1) ASC, name
     LIMIT 50`
  );
  if (low.length === 0) return [];
  const out = low.filter((m) => Number(m.stock) === 0);
  const list = low.slice(0, 4).map((m) => `${m.name} (${m.stock} ${m.unit})`).join(', ');
  return [{
    id: `low-stock-${low.map((m) => `${m.id}:${m.stock}`).join(',')}`,
    level: 'warning',
    icon: '💊',
    title: out.length ? `${out.length} thuốc đã hết, ${low.length - out.length} thuốc sắp hết` : `${low.length} thuốc sắp hết trong kho`,
    message: `${list}${low.length > 4 ? ` và ${low.length - 4} thuốc khác` : ''}. Nhập thêm kho.`,
    page: 'medicine-management',
    at: new Date().toISOString().slice(0, 10)
  }];
};

const notificationsController = {
  async getNotifications(req, res) {
    try {
      const { role, id } = req.user;
      let items = [];
      if (role === 'patient') items = await patientNotifications(id);
      else if (role === 'doctor') items = await doctorNotifications(id);
      else if (role === 'receptionist' || role === 'admin') items = await frontDeskNotifications();
      if (role === 'admin') items = items.concat(await stockNotifications());

      // warnings first, then by date
      const rank = { warning: 0, info: 1, success: 2 };
      items.sort((a, b) => (rank[a.level] - rank[b.level]) || String(a.at).localeCompare(String(b.at)));
      res.json({ success: true, data: { items, count: items.length } });
    } catch (error) {
      console.error('Get notifications error:', error);
      res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Không thể tải thông báo' } });
    }
  }
};

module.exports = notificationsController;
