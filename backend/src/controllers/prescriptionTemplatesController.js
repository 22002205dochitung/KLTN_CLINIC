const { pool } = require('../config/database');

/**
 * Prescription templates – đơn thuốc mẫu (mounted at /api/prescription-templates, doctors only)
 *
 *   GET    /                 the doctor's templates (most used first)
 *   POST   /                 {name, diagnosis?, items[]}  create; same name -> 409 TEMPLATE_EXISTS
 *   PUT    /:id              {name?, diagnosis?, items?}   replace (own template only)
 *   POST   /:id/use          count one use (sorts the list)
 *   DELETE /:id
 *
 * Each doctor only sees and changes their own templates.
 */

const MAX_ITEMS = 30;
const fail = (res, status, code, message) => res.status(status).json({ success: false, error: { code, message } });

const doctorIdOfUser = async (userId) => {
  const [rows] = await pool.execute('SELECT id FROM doctors WHERE user_id = ?', [userId]);
  return rows.length ? rows[0].id : null;
};

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Validated items, or a string describing the first problem */
const cleanItems = (items) => {
  if (!Array.isArray(items) || items.length === 0) return 'Đơn mẫu cần ít nhất 1 thuốc';
  if (items.length > MAX_ITEMS) return `Đơn mẫu tối đa ${MAX_ITEMS} thuốc`;
  const out = [];
  for (let i = 0; i < items.length; i += 1) {
    const it = items[i] || {};
    const name = str(it.medicine_name, 150);
    if (!name) return `Thuốc thứ ${i + 1}: chưa nhập tên thuốc`;
    const quantity = parseInt(it.quantity, 10);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) {
      return `Thuốc thứ ${i + 1}: số lượng phải từ 1 đến 1000`;
    }
    const medicineId = parseInt(it.medicine_id, 10);
    out.push({
      medicine_id: Number.isInteger(medicineId) && medicineId > 0 ? medicineId : null,
      medicine_name: name,
      unit: str(it.unit, 30) || null,
      dosage: str(it.dosage, 100),
      quantity,
      instructions: str(it.instructions, 500) || null
    });
  }
  return out;
};

const toDto = (row) => {
  let items = [];
  try { items = JSON.parse(row.items); } catch (e) { items = []; }
  return {
    id: row.id,
    name: row.name,
    diagnosis: row.diagnosis,
    items: Array.isArray(items) ? items : [],
    use_count: row.use_count,
    updated_at: row.updated_at
  };
};

const ownTemplate = async (doctorId, id) => {
  const [rows] = await pool.execute(
    'SELECT * FROM prescription_templates WHERE id = ? AND doctor_id = ?',
    [id, doctorId]
  );
  return rows[0] || null;
};

const withDoctor = (handler) => async (req, res) => {
  try {
    const doctorId = await doctorIdOfUser(req.user.id);
    if (!doctorId) return fail(res, 403, 'NOT_A_DOCTOR', 'Chỉ bác sĩ mới có đơn thuốc mẫu');
    return await handler(req, res, doctorId);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return fail(res, 409, 'TEMPLATE_EXISTS', 'Bạn đã có đơn mẫu cùng tên');
    }
    if (error.code === 'ER_NO_SUCH_TABLE') {
      return fail(res, 500, 'MIGRATION_MISSING', 'Chưa chạy database/prescription_templates.sql');
    }
    console.error('Prescription template error:', error);
    return fail(res, 500, 'INTERNAL_ERROR', 'Lỗi server khi xử lý đơn thuốc mẫu');
  }
};

module.exports = {
  list: withDoctor(async (req, res, doctorId) => {
    const [rows] = await pool.execute(
      `SELECT * FROM prescription_templates WHERE doctor_id = ?
       ORDER BY use_count DESC, updated_at DESC, id DESC`,
      [doctorId]
    );
    res.json({ success: true, data: { templates: rows.map(toDto) } });
  }),

  create: withDoctor(async (req, res, doctorId) => {
    const name = str(req.body?.name, 120);
    if (!name) return fail(res, 400, 'VALIDATION_ERROR', 'Vui lòng đặt tên cho đơn mẫu');
    const items = cleanItems(req.body?.items);
    if (typeof items === 'string') return fail(res, 400, 'VALIDATION_ERROR', items);
    const [result] = await pool.execute(
      'INSERT INTO prescription_templates (doctor_id, name, diagnosis, items) VALUES (?, ?, ?, ?)',
      [doctorId, name, str(req.body?.diagnosis, 255) || null, JSON.stringify(items)]
    );
    const row = await ownTemplate(doctorId, result.insertId);
    res.status(201).json({ success: true, data: { template: toDto(row) } });
  }),

  update: withDoctor(async (req, res, doctorId) => {
    const id = parseInt(req.params.id, 10);
    const current = Number.isInteger(id) ? await ownTemplate(doctorId, id) : null;
    if (!current) return fail(res, 404, 'TEMPLATE_NOT_FOUND', 'Không tìm thấy đơn mẫu');

    const name = req.body?.name !== undefined ? str(req.body.name, 120) : current.name;
    if (!name) return fail(res, 400, 'VALIDATION_ERROR', 'Vui lòng đặt tên cho đơn mẫu');
    let items = current.items;
    if (req.body?.items !== undefined) {
      const cleaned = cleanItems(req.body.items);
      if (typeof cleaned === 'string') return fail(res, 400, 'VALIDATION_ERROR', cleaned);
      items = JSON.stringify(cleaned);
    }
    const diagnosis = req.body?.diagnosis !== undefined ? (str(req.body.diagnosis, 255) || null) : current.diagnosis;

    await pool.execute(
      'UPDATE prescription_templates SET name = ?, diagnosis = ?, items = ? WHERE id = ? AND doctor_id = ?',
      [name, diagnosis, items, id, doctorId]
    );
    res.json({ success: true, data: { template: toDto(await ownTemplate(doctorId, id)) } });
  }),

  markUsed: withDoctor(async (req, res, doctorId) => {
    const id = parseInt(req.params.id, 10);
    await pool.execute(
      'UPDATE prescription_templates SET use_count = use_count + 1, updated_at = updated_at WHERE id = ? AND doctor_id = ?',
      [Number.isInteger(id) ? id : 0, doctorId]
    );
    res.json({ success: true });
  }),

  remove: withDoctor(async (req, res, doctorId) => {
    const id = parseInt(req.params.id, 10);
    const [result] = await pool.execute(
      'DELETE FROM prescription_templates WHERE id = ? AND doctor_id = ?',
      [Number.isInteger(id) ? id : 0, doctorId]
    );
    if (!result.affectedRows) return fail(res, 404, 'TEMPLATE_NOT_FOUND', 'Không tìm thấy đơn mẫu');
    res.json({ success: true });
  })
};
