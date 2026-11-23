const db = require('../config/database');
const { AVG_EXAM_MINUTES } = require('../config/booking');
const ttsService = require('../services/ttsService');

/** "Đỗ Chí Tùng" -> "Đ. C. Tùng": recognisable to the patient, not a full name on a public screen */
const maskName = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ? `${parts[0][0]}.` : '';
  return [...parts.slice(0, -1).map((w) => `${w[0].toUpperCase()}.`), parts[parts.length - 1]].join(' ');
};

/**
 * Today's queue of one or more doctors, hospital style.
 * Ticket number = rank of the check-in among today's check-ins with that doctor (finished
 * patients included, so a number never changes during the day).
 * State of a ticket:
 *  - done     : examination completed
 *  - serving  : called by the doctor (latest call, not marked absent) – "đang mời vào phòng"
 *  - missed   : called but did not show up (doctor pressed "Vắng mặt"); can be called again
 *  - waiting  : checked in, not called yet
 */
const loadQueues = async (doctorId = null, conn = db.pool) => {
  const [rows] = await conn.execute(
    `SELECT a.id, a.doctor_id, a.patient_id, a.status, a.time_slot, a.symptoms,
            COALESCE(a.checked_in_at, a.created_at) AS queue_time,
            a.called_at, a.call_count, a.skipped_at,
            u.fullname AS patient_name, u.phone AS patient_phone,
            du.fullname AS doctor_name, d.room, d.department_id, dep.name AS department_name
     FROM appointments a
     JOIN users u ON u.id = a.patient_id
     JOIN doctors d ON d.id = a.doctor_id
     JOIN users du ON du.id = d.user_id
     LEFT JOIN departments dep ON dep.id = d.department_id
     WHERE a.appointment_date = CURDATE() AND a.status IN ('checked_in', 'completed')
       ${doctorId ? 'AND a.doctor_id = ?' : ''}
     ORDER BY dep.name, du.fullname, a.doctor_id, queue_time, a.id`,
    doctorId ? [doctorId] : []
  );

  const byDoctor = new Map();
  rows.forEach((r) => {
    if (!byDoctor.has(r.doctor_id)) {
      byDoctor.set(r.doctor_id, {
        doctor_id: r.doctor_id,
        doctor_name: r.doctor_name,
        department_name: r.department_name,
        room: r.room,
        tickets: []
      });
    }
    const g = byDoctor.get(r.doctor_id);
    g.tickets.push({ ...r, number: g.tickets.length + 1 });
  });

  byDoctor.forEach((g) => {
    // the most recent call that is still open is the patient being called in
    const called = g.tickets
      .filter((t) => t.status === 'checked_in' && t.called_at && !t.skipped_at)
      .sort((a, b) => new Date(b.called_at) - new Date(a.called_at));
    g.current = called[0] || null;
    g.tickets.forEach((t) => {
      if (t.status === 'completed') t.state = 'done';
      else if (g.current && t.id === g.current.id) t.state = 'serving';
      else if (t.skipped_at) t.state = 'missed';
      else t.state = 'waiting';
    });
    g.waiting = g.tickets.filter((t) => t.state === 'waiting');
    g.missed = g.tickets.filter((t) => t.state === 'missed');
    g.done_count = g.tickets.filter((t) => t.state === 'done').length;
  });
  return byDoctor;
};

/** Ticket of a checked-in / finished appointment today: number, state, people ahead, room. */
const getTicketInfo = async (appointmentId) => {
  const [[a]] = await db.pool.execute(
    `SELECT id, doctor_id, status, (appointment_date = CURDATE()) AS is_today FROM appointments WHERE id = ?`,
    [appointmentId]
  );
  if (!a || !Number(a.is_today) || !['checked_in', 'completed'].includes(a.status)) return null;
  const g = (await loadQueues(a.doctor_id)).get(a.doctor_id);
  const t = g && g.tickets.find((x) => x.id === a.id);
  if (!t) return null;
  let ahead = 0;
  if (t.state === 'waiting') ahead = g.waiting.filter((w) => w.number < t.number).length + (g.current ? 1 : 0);
  return {
    ticket_number: t.number,
    state: t.state,
    patients_ahead: ahead,
    room: g.room,
    call_count: Number(t.call_count) || 0,
    serving_number: g.current ? g.current.number : null
  };
};

const pad2 = (n) => String(n).padStart(2, '0');

/** What the loudspeaker says for a call (same text for the FPT.AI voice and the browser fallback). */
const announceText = (number, fullName, room, callCount) => {
  const who = String(fullName || '').trim();
  return `${callCount > 1 ? 'Kính mời lại' : 'Kính mời'} bệnh nhân số ${number}${who ? `, ${who}` : ''}, vào phòng khám số ${room}.`;
};
/**
 * What the check-in desk says after a scan (FPT.AI voice and browser fallback use the same text).
 * Built only from a fixed result + numbers, so the public audio endpoint cannot be fed free text.
 */
const checkinAnnounceText = (result, number, room) => {
  const n = Number.isInteger(number) && number > 0 ? `Số thứ tự của bạn là số ${number}. ` : '';
  const where = room ? `vào phòng khám số ${room}` : 'vào khám';
  if (result === 'ok') return `Check-in thành công. ${n}Mời bạn ngồi chờ, hệ thống sẽ gọi số thứ tự để ${where}.`;
  if (result === 'already') return `Bạn đã check-in rồi. ${n}Mời bạn ngồi chờ hệ thống gọi số.`;
  return 'Quét mã không thành công. Vui lòng quét lại.';
};

const callError = (status, code, message) => Object.assign(new Error(message), { status, code });
const ensureNoCurrent = (g) => {
  if (g.current) {
    throw callError(409, 'CURRENT_IN_PROGRESS',
      `Số ${pad2(g.current.number)} (${g.current.patient_name}) đang được mời vào phòng. Khám xong (hoàn tất) hoặc bấm "Vắng mặt" trước khi gọi số khác.`);
  }
};

/**
 * Runs a calling action for the logged-in doctor inside a transaction. The doctor row is locked
 * so two clicks (or two devices) cannot call two patients at the same time.
 */
const runCallAction = async (req, res, action) => {
  const conn = await db.pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[doc]] = await conn.execute('SELECT id FROM doctors WHERE user_id = ? FOR UPDATE', [req.user.id]);
    if (!doc) throw callError(403, 'NOT_A_DOCTOR', 'Tài khoản không phải bác sĩ');
    const g = (await loadQueues(doc.id, conn)).get(doc.id)
      || { tickets: [], waiting: [], missed: [], current: null, room: null };
    const result = await action(conn, g, doc.id);
    await conn.commit();
    const { announce, ...body } = result;
    if (announce) ttsService.prefetch(announce); // audio is ready by the time the lobby TV asks for it
    return res.json({ success: true, ...body });
  } catch (error) {
    await conn.rollback().catch(() => {});
    if (error.status) {
      return res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } });
    }
    console.error('Queue call action failed:', error);
    return res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Không thể gọi số. Vui lòng thử lại.' } });
  } finally {
    conn.release();
  }
};

/**
 * Queue Controller - Manages doctor patient queues
 * 
 * Handles:
 * - Retrieving doctor's patient queue (checked-in appointments)
 * - Queue ordering by check-in time
 * - Patient queue position tracking
 * 
 * Requirements: 11.1-11.5, 12.1-12.6
 */

class QueueController {
  /**
   * Get queue for a specific doctor
   * Returns all checked-in appointments ordered by check-in time
   * 
   * GET /api/queue/doctor/:doctorId
   * 
   * Requirements: 11.1, 11.2, 11.3, 11.4, 12.1, 12.2, 12.3, 12.6, 7.3
   */
  async getQueueForDoctor(req, res) {
    try {
      const { doctorId } = req.params;
      const requestingUserId = req.user.id;
      const requestingUserRole = req.user.role;

      // Authorization: doctor can only view their own queue (Requirement 7.3)
      // admin can view any doctor's queue
      if (requestingUserRole === 'doctor') {
        // Verify the requesting doctor owns this queue - filter by authenticated doctor
        const [doctorCheck] = await db.pool.execute(
          'SELECT id FROM doctors WHERE id = ? AND user_id = ?',
          [doctorId, requestingUserId]
        );

        if (doctorCheck.length === 0) {
          return res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Bạn chỉ có thể xem hàng đợi của mình'
            }
          });
        }
      }

      // Get doctor information
      const [doctorInfo] = await db.pool.execute(
        `SELECT 
          d.id,
          u.fullname as doctor_name,
          d.degree,
          dep.name as department_name
        FROM doctors d
        JOIN users u ON d.user_id = u.id
        JOIN departments dep ON d.department_id = dep.id
        WHERE d.id = ?`,
        [doctorId]
      );

      if (doctorInfo.length === 0) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'DOCTOR_NOT_FOUND',
            message: 'Không tìm thấy bác sĩ'
          }
        });
      }

      // Get queue (all checked-in appointments for today)
      const queueQuery = `
        SELECT 
          a.id as appointment_id,
          a.patient_id,
          a.appointment_date,
          a.time_slot,
          a.status,
          COALESCE(a.checked_in_at, a.created_at) as checked_in_time,
          u.fullname as patient_name,
          u.phone as patient_phone,
          u.email as patient_email,
          mr.symptoms
        FROM appointments a
        JOIN users u ON a.patient_id = u.id
        LEFT JOIN medical_records mr ON a.id = mr.appointment_id
        WHERE a.doctor_id = ?
          AND a.status = 'checked_in'
          AND a.appointment_date = CURDATE()
        ORDER BY COALESCE(a.checked_in_at, a.created_at) ASC, a.id ASC
      `;

      const [queueResults] = await db.pool.execute(queueQuery, [doctorId]);

      // Add position number to each queue entry
      const queueWithPositions = queueResults.map((entry, index) => ({
        ...entry,
        queue_position: index + 1
      }));

      res.json({
        success: true,
        doctor: {
          id: doctorInfo[0].id,
          name: doctorInfo[0].doctor_name,
          degree: doctorInfo[0].degree,
          department: doctorInfo[0].department_name
        },
        queue: queueWithPositions,
        queue_count: queueWithPositions.length,
        date: new Date().toISOString().split('T')[0]
      });
    } catch (error) {
      console.error('Error getting doctor queue:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Không thể lấy hàng đợi. Vui lòng thử lại sau.'
        }
      });
    }
  }

  /**
   * Get queue position for a specific patient/appointment
   * 
   * GET /api/queue/position/:appointmentId
   * 
   * Requirements: 12.4
   */
  async getQueuePosition(req, res) {
    try {
      const { appointmentId } = req.params;

      // Get appointment details
      const [appointmentResults] = await db.pool.execute(
        `SELECT 
          a.id,
          a.doctor_id,
          a.patient_id,
          a.status,
          a.appointment_date,
          COALESCE(a.checked_in_at, a.created_at) AS queue_time,
          u.fullname as patient_name,
          du.fullname as doctor_name
        FROM appointments a
        JOIN users u ON a.patient_id = u.id
        JOIN doctors d ON a.doctor_id = d.id
        JOIN users du ON d.user_id = du.id
        WHERE a.id = ?`,
        [appointmentId]
      );

      if (appointmentResults.length === 0) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'APPOINTMENT_NOT_FOUND',
            message: 'Không tìm thấy lịch hẹn'
          }
        });
      }

      const appointment = appointmentResults[0];

      if (req.user && req.user.role === 'patient' && appointment.patient_id !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Bạn chỉ có thể xem vị trí hàng đợi của lịch hẹn của mình'
          }
        });
      }

      if (appointment.status !== 'checked_in') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'NOT_IN_QUEUE',
            message: 'Lịch hẹn chưa check-in hoặc đã hoàn thành'
          }
        });
      }

      // Count how many appointments are ahead in the queue
      const [positionResults] = await db.pool.execute(
        `SELECT COUNT(*) as position
        FROM appointments
        WHERE doctor_id = ?
          AND status = 'checked_in'
          AND appointment_date = CURDATE()
          AND (COALESCE(checked_in_at, created_at) < ?
               OR (COALESCE(checked_in_at, created_at) = ? AND id < ?))`,
        [appointment.doctor_id, appointment.queue_time, appointment.queue_time, appointment.id]
      );

      const position = positionResults[0].position + 1; // +1 because this patient is also in queue

      // Get total queue count
      const [countResults] = await db.pool.execute(
        `SELECT COUNT(*) as total
        FROM appointments
        WHERE doctor_id = ?
          AND status = 'checked_in'
          AND appointment_date = CURDATE()`,
        [appointment.doctor_id]
      );

      const totalInQueue = countResults[0].total;

      res.json({
        success: true,
        appointment: {
          id: appointment.id,
          patient_name: appointment.patient_name,
          doctor_name: appointment.doctor_name
        },
        queue_position: position,
        total_in_queue: totalInQueue,
        patients_ahead: position - 1
      });
    } catch (error) {
      console.error('Error getting queue position:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Không thể lấy vị trí hàng đợi. Vui lòng thử lại sau.'
        }
      });
    }
  }

  /**
   * Remove appointment from queue (called after completion)
   * This is handled automatically when appointment status changes to 'completed'
   * 
   * POST /api/queue/remove/:appointmentId
   * 
   * Requirements: 11.5
   */
  async removeFromQueue(req, res) {
    try {
      const { appointmentId } = req.params;

      // Get appointment details
      // Only the doctor who owns the appointment may close it
      const [appointmentResults] = await db.pool.execute(
        `SELECT a.id, a.status
         FROM appointments a
         JOIN doctors d ON a.doctor_id = d.id
         WHERE a.id = ? AND d.user_id = ?`,
        [appointmentId, req.user.id]
      );

      if (appointmentResults.length === 0) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'APPOINTMENT_NOT_FOUND',
            message: 'Không tìm thấy lịch hẹn'
          }
        });
      }

      const appointment = appointmentResults[0];

      if (appointment.status !== 'checked_in') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'NOT_IN_QUEUE',
            message: 'Lịch hẹn không ở trong hàng đợi'
          }
        });
      }

      // Update status to completed (this removes from queue)
      await db.pool.execute(
        'UPDATE appointments SET status = ? WHERE id = ?',
        ['completed', appointmentId]
      );

      res.json({
        success: true,
        message: 'Đã xóa khỏi hàng đợi'
      });
    } catch (error) {
      console.error('Error removing from queue:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Không thể xóa khỏi hàng đợi. Vui lòng thử lại sau.'
        }
      });
    }
  }

  /**
   * Get queue statistics for a doctor
   * 
   * GET /api/queue/stats/:doctorId
   */
  async getQueueStats(req, res) {
    try {
      const { doctorId } = req.params;

      const statsQuery = `
        SELECT 
          COUNT(*) as total_in_queue,
          MIN(COALESCE(a.checked_in_at, a.created_at)) as first_checkin_time,
          MAX(COALESCE(a.checked_in_at, a.created_at)) as last_checkin_time
        FROM appointments a
        WHERE a.doctor_id = ?
          AND a.status = 'checked_in'
          AND a.appointment_date = CURDATE()
      `;

      const [statsResults] = await db.pool.execute(statsQuery, [doctorId]);
      const stats = statsResults[0];

      // Calculate estimated wait time (rough estimate: 15 minutes per patient)
      const estimatedWaitTimeMinutes = stats.total_in_queue * 15;

      res.json({
        success: true,
        stats: {
          total_in_queue: stats.total_in_queue,
          first_checkin_time: stats.first_checkin_time,
          last_checkin_time: stats.last_checkin_time,
          estimated_wait_time_minutes: estimatedWaitTimeMinutes
        }
      });
    } catch (error) {
      console.error('Error getting queue stats:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Không thể lấy thống kê hàng đợi. Vui lòng thử lại sau.'
        }
      });
    }
  }

  /**
   * GET /api/queue/board   (public - lobby TV screen)
   * Per doctor: room, the number being called in (only after the doctor presses "Gọi số"),
   * the next numbers, numbers that missed their call, and the latest calls across all rooms.
   * Names are masked ("Đ. C. Tùng"); no phone numbers or ids are exposed.
   */
  async getQueueBoard(req, res) {
    try {
      const queues = await loadQueues();
      const doctors = [...queues.values()].map((g) => ({
        doctor_id: g.doctor_id,
        doctor_name: g.doctor_name,
        department_name: g.department_name,
        room: g.room,
        serving: g.current
          ? {
            number: g.current.number,
            name: maskName(g.current.patient_name),
            // full name only for the patient being called in: it is read out on the loudspeaker
            // (the screen keeps showing the masked name)
            speak_name: String(g.current.patient_name || '').trim(),
            announce: announceText(g.current.number, g.current.patient_name, g.room, Number(g.current.call_count) || 1),
            called_at: g.current.called_at,
            call_count: Number(g.current.call_count) || 0
          }
          : null,
        waiting: g.waiting.map((t) => ({ number: t.number, name: maskName(t.patient_name) })),
        missed: g.missed.map((t) => ({ number: t.number, name: maskName(t.patient_name) })),
        waiting_count: g.waiting.length,
        done_count: g.done_count,
        last_number: g.tickets.length
      }));

      const recent_calls = [...queues.values()]
        .flatMap((g) => g.tickets
          .filter((t) => t.called_at)
          .map((t) => ({ number: t.number, room: g.room, doctor_name: g.doctor_name, called_at: t.called_at, state: t.state })))
        .sort((a, b) => new Date(b.called_at) - new Date(a.called_at))
        .slice(0, 6);

      res.json({
        success: true,
        data: { generated_at: new Date().toISOString(), doctors, recent_calls, voice: ttsService.isConfigured() ? 'fpt' : 'browser' }
      });
    } catch (error) {
      console.error('Error building queue board:', error);
      res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Không thể tải bảng hàng đợi' } });
    }
  }

  /**
   * GET /api/queue/call-audio/:doctorId   (public, used by the lobby TV)
   * MP3 of the current call of that doctor, read by the FPT.AI voice (default: lannhi, nữ miền Nam).
   * The text is built on the server from the queue, so this cannot be used to synthesize arbitrary text.
   * 503 when no TTS key is configured -> the TV falls back to the browser voice.
   */
  /** GET /api/queue/voice (public): which voice the screens should use */
  async getVoice(req, res) {
    res.json({ success: true, data: { voice: ttsService.isConfigured() ? 'fpt' : 'browser' } });
  }

  /**
   * GET /api/queue/checkin-audio?result=ok|already|fail&number=5&room=101   (public)
   * MP3 (FPT.AI voice) of the check-in result read at the reception desk. 503 when no TTS key:
   * the page then uses the browser's own Vietnamese voice.
   */
  async getCheckinAudio(req, res) {
    try {
      if (!ttsService.isConfigured()) {
        return res.status(503).json({ success: false, error: { code: 'TTS_NOT_CONFIGURED', message: 'Chưa cấu hình giọng đọc FPT.AI (FPT_TTS_API_KEY)' } });
      }
      const result = ['ok', 'already', 'fail'].includes(req.query.result) ? req.query.result : 'fail';
      const number = parseInt(req.query.number, 10);
      const room = /^[A-Za-z0-9-]{1,10}$/.test(String(req.query.room || '')) ? String(req.query.room) : '';
      const text = checkinAnnounceText(result, number > 0 && number < 1000 ? number : null, room);
      const file = await ttsService.getAudioFile(text);
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.sendFile(file);
    } catch (error) {
      console.error('Check-in audio failed:', error.message);
      return res.status(502).json({ success: false, error: { code: 'TTS_FAILED', message: 'Không tạo được giọng đọc' } });
    }
  }

  async getCallAudio(req, res) {
    try {
      if (!ttsService.isConfigured()) {
        return res.status(503).json({ success: false, error: { code: 'TTS_NOT_CONFIGURED', message: 'Chưa cấu hình giọng đọc FPT.AI (FPT_TTS_API_KEY)' } });
      }
      const doctorId = parseInt(req.params.doctorId, 10);
      const g = doctorId ? (await loadQueues(doctorId)).get(doctorId) : null;
      if (!g || !g.current) {
        return res.status(404).json({ success: false, error: { code: 'NO_CURRENT', message: 'Không có số nào đang được gọi' } });
      }
      const text = announceText(g.current.number, g.current.patient_name, g.room, Number(g.current.call_count) || 1);
      const file = await ttsService.getAudioFile(text);
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'no-store');
      return res.sendFile(file);
    } catch (error) {
      console.error('Queue call audio failed:', error.message);
      return res.status(502).json({ success: false, error: { code: 'TTS_FAILED', message: 'Không tạo được giọng đọc' } });
    }
  }

  /**
   * GET /api/queue/console   (doctor)
   * The doctor's calling desk: patient being called in, waiting list, absent list.
   */
  async getDoctorConsole(req, res) {
    try {
      const [[doc]] = await db.pool.execute(
        `SELECT d.id, d.room, u.fullname AS name, dep.name AS department
         FROM doctors d JOIN users u ON u.id = d.user_id
         LEFT JOIN departments dep ON dep.id = d.department_id
         WHERE d.user_id = ?`,
        [req.user.id]
      );
      if (!doc) {
        return res.status(403).json({ success: false, error: { code: 'NOT_A_DOCTOR', message: 'Tài khoản không phải bác sĩ' } });
      }
      const g = (await loadQueues(doc.id)).get(doc.id);
      const view = (t) => ({
        appointment_id: t.id,
        number: t.number,
        state: t.state,
        patient_id: t.patient_id,
        patient_name: t.patient_name,
        patient_fullname: t.patient_name,
        patient_phone: t.patient_phone,
        time_slot: t.time_slot,
        symptoms: t.symptoms,
        checked_in_at: t.queue_time,
        called_at: t.called_at,
        call_count: Number(t.call_count) || 0
      });
      res.json({
        success: true,
        data: {
          doctor: { id: doc.id, name: doc.name, room: doc.room, department: doc.department },
          current: g?.current ? view(g.current) : null,
          waiting: g ? g.waiting.map(view) : [],
          missed: g ? g.missed.map(view) : [],
          done_count: g ? g.done_count : 0,
          total: g ? g.tickets.length : 0
        }
      });
    } catch (error) {
      console.error('Error loading doctor queue console:', error);
      res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Không thể tải hàng đợi' } });
    }
  }

  /** POST /api/queue/call-next  - call the lowest waiting number into the room */
  async callNext(req, res) {
    return runCallAction(req, res, async (conn, g) => {
      ensureNoCurrent(g);
      const next = g.waiting[0];
      if (!next) {
        throw callError(404, 'QUEUE_EMPTY', g.missed.length
          ? `Không còn ai chờ. Có ${g.missed.length} số vắng mặt – bấm "Gọi" ở danh sách lỡ lượt nếu họ đã quay lại.`
          : 'Không còn bệnh nhân nào chờ khám.');
      }
      await conn.execute(
        `UPDATE appointments SET called_at = NOW(), call_count = call_count + 1, skipped_at = NULL
         WHERE id = ? AND status = 'checked_in'`,
        [next.id]
      );
      return {
        message: `Đã gọi số ${pad2(next.number)} – ${next.patient_name} vào phòng ${g.room}`,
        number: next.number,
        appointment_id: next.id,
        announce: announceText(next.number, next.patient_name, g.room, Number(next.call_count) + 1)
      };
    });
  }

  /** POST /api/queue/call/:appointmentId  - call a specific waiting/absent patient (priority, came back) */
  async callPatient(req, res) {
    const appointmentId = parseInt(req.params.appointmentId, 10);
    return runCallAction(req, res, async (conn, g) => {
      const t = g.tickets.find((x) => x.id === appointmentId);
      if (!t || !['waiting', 'missed'].includes(t.state)) {
        throw callError(404, 'NOT_IN_QUEUE', 'Bệnh nhân không có trong hàng chờ của bạn hôm nay');
      }
      ensureNoCurrent(g);
      await conn.execute(
        `UPDATE appointments SET called_at = NOW(), call_count = call_count + 1, skipped_at = NULL
         WHERE id = ? AND status = 'checked_in'`,
        [t.id]
      );
      return {
        message: `Đã gọi số ${pad2(t.number)} – ${t.patient_name} vào phòng ${g.room}`,
        number: t.number,
        appointment_id: t.id,
        announce: announceText(t.number, t.patient_name, g.room, Number(t.call_count) + 1)
      };
    });
  }

  /** POST /api/queue/recall  - announce the current number again */
  async recall(req, res) {
    return runCallAction(req, res, async (conn, g) => {
      if (!g.current) throw callError(409, 'NO_CURRENT', 'Chưa gọi số nào – bấm "Gọi số tiếp theo".');
      await conn.execute('UPDATE appointments SET called_at = NOW(), call_count = call_count + 1 WHERE id = ?', [g.current.id]);
      return {
        message: `Đã gọi lại số ${pad2(g.current.number)} (lần ${Number(g.current.call_count) + 1})`,
        number: g.current.number,
        appointment_id: g.current.id,
        announce: announceText(g.current.number, g.current.patient_name, g.room, Number(g.current.call_count) + 1)
      };
    });
  }

  /** POST /api/queue/skip  - the called patient is not here: move them to the absent list */
  async skip(req, res) {
    return runCallAction(req, res, async (conn, g) => {
      if (!g.current) throw callError(409, 'NO_CURRENT', 'Không có số nào đang được gọi.');
      await conn.execute('UPDATE appointments SET skipped_at = NOW() WHERE id = ?', [g.current.id]);
      return { message: `Số ${pad2(g.current.number)} vắng mặt – đã chuyển sang danh sách lỡ lượt`, number: g.current.number, appointment_id: g.current.id };
    });
  }

  /**
   * GET /api/queue/estimate/:appointmentId
   * Expected time to be seen, for a patient with an appointment today.
   *
   * Pace = average gap between the doctor's consecutive finished examinations today
   * (medical records saved), ignoring breaks over 60 min; with fewer than 2 gaps the
   * AVG_EXAM_MINUTES default is used. Patients are seen in check-in order.
   *  - checked_in: wait = patients checked in before me x pace
   *  - booked (today): how many are waiting now, and the wait if I checked in now
   */
  async getWaitEstimate(req, res) {
    try {
      const appointmentId = parseInt(req.params.appointmentId, 10);
      if (!appointmentId) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Mã lịch hẹn không hợp lệ' } });
      }

      const [rows] = await db.pool.execute(
        `SELECT a.id, a.patient_id, a.doctor_id, a.status, a.time_slot,
                (a.appointment_date = CURDATE()) AS is_today,
                du.fullname AS doctor_name
         FROM appointments a
         JOIN doctors d ON d.id = a.doctor_id
         JOIN users du ON du.id = d.user_id
         WHERE a.id = ?`,
        [appointmentId]
      );
      if (rows.length === 0) {
        return res.status(404).json({ success: false, error: { code: 'APPOINTMENT_NOT_FOUND', message: 'Không tìm thấy lịch hẹn' } });
      }
      const appt = rows[0];
      if (req.user.role === 'patient' && appt.patient_id !== req.user.id) {
        return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Bạn chỉ xem được lịch hẹn của mình' } });
      }

      const base = { appointment_id: appt.id, doctor_name: appt.doctor_name, time_slot: appt.time_slot };
      if (!Number(appt.is_today) || !['booked', 'checked_in'].includes(appt.status)) {
        return res.json({ success: true, data: { ...base, state: Number(appt.is_today) ? appt.status : 'not_today' } });
      }

      // Pace of this doctor today
      const [finished] = await db.pool.execute(
        `SELECT mr.created_at
         FROM medical_records mr
         JOIN appointments a ON a.id = mr.appointment_id
         WHERE a.doctor_id = ? AND DATE(mr.created_at) = CURDATE()
         ORDER BY mr.created_at ASC`,
        [appt.doctor_id]
      );
      const gaps = [];
      for (let i = 1; i < finished.length; i++) {
        const minutes = (new Date(finished[i].created_at) - new Date(finished[i - 1].created_at)) / 60000;
        if (minutes > 0 && minutes <= 60) gaps.push(minutes);
      }
      const measured = gaps.length >= 2;
      const pace = measured
        ? Math.min(Math.max(Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length), 2), 60)
        : AVG_EXAM_MINUTES;

      const g = (await loadQueues(appt.doctor_id)).get(appt.doctor_id);
      // people in front of a new arrival: everyone not called yet + the one in the room
      const waitingNow = g ? g.waiting.length + (g.current ? 1 : 0) : 0;

      let ahead;
      let ticket = null;
      if (appt.status === 'checked_in') {
        ticket = await getTicketInfo(appt.id);
        ahead = ticket ? ticket.patients_ahead : 0;
      } else {
        ahead = waitingNow; // if they checked in right now
      }

      const waitMinutes = ahead * pace;
      const eta = new Date(Date.now() + waitMinutes * 60000);
      const p = (n) => String(n).padStart(2, '0');

      res.json({
        success: true,
        data: {
          ...base,
          state: appt.status,               // 'checked_in' | 'booked'
          in_queue: appt.status === 'checked_in',
          queue_position: appt.status === 'checked_in' ? ahead + 1 : null,
          ticket_number: ticket ? ticket.ticket_number : null,
          queue_state: ticket ? ticket.state : null,     // 'waiting' | 'serving' | 'missed'
          room: g?.room || null,
          call_count: ticket ? ticket.call_count : 0,
          serving_number: g?.current ? g.current.number : null,
          patients_ahead: ahead,
          waiting_now: waitingNow,
          minutes_per_patient: pace,
          pace_source: measured ? 'today' : 'default',
          estimated_wait_minutes: waitMinutes,
          estimated_time: `${p(eta.getHours())}:${p(eta.getMinutes())}`
        }
      });
    } catch (error) {
      console.error('Error estimating wait time:', error);
      res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Không thể ước tính thời gian chờ' } });
    }
  }
}

// Export singleton instance
module.exports = new QueueController();
module.exports.getTicketInfo = getTicketInfo;
module.exports.maskName = maskName;
module.exports.checkinAnnounceText = checkinAnnounceText;
