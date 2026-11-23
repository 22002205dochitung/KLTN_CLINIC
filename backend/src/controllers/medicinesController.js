const { pool } = require('../config/database');
const auditLogService = require('../services/auditLogService');

/**
 * Medicine catalogue & stock (kho thuốc).
 *
 *  GET    /api/medicines                 staff: active catalogue (?q=, ?all=1 for admin incl. inactive)
 *  POST   /api/medicines                 admin: add a medicine (optional opening stock -> 'import')
 *  PUT    /api/medicines/:id             admin: name / unit / price / min_stock / active
 *  DELETE /api/medicines/:id             admin: delete a medicine that was never prescribed
 *  POST   /api/medicines/:id/import      admin: goods received (+quantity)
 *  POST   /api/medicines/:id/adjust      admin: stock count (set the real quantity on the shelf)
 *  GET    /api/medicines/:id/movements   admin: stock history
 *
 * Stock only goes down when the cashier collects the medication payment (see paymentService).
 */

const fail = (res, status, code, message) => res.status(status).json({ success: false, error: { code, message } });

const toMedicine = (m) => ({
  id: m.id,
  name: m.name,
  unit: m.unit,
  price: parseFloat(m.price),
  stock: Number(m.stock),
  min_stock: Number(m.min_stock),
  active: Boolean(m.active),
  low_stock: Number(m.stock) <= Number(m.min_stock),
  updated_at: m.updated_at || m.created_at
});

const audit = (req, eventType, eventDetails) => {
  auditLogService.logActivity({
    userId: req.user.id,
    eventType,
    eventDetails,
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  }).catch(() => undefined);
};

/** Validate the editable fields; returns { value } or { error } */
const readFields = (body, { partial }) => {
  const out = {};
  if (!partial || body.name !== undefined) {
    const name = String(body.name || '').trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > 150) return { error: 'Tên thuốc phải từ 2 đến 150 ký tự' };
    out.name = name;
  }
  if (!partial || body.unit !== undefined) {
    const unit = String(body.unit || '').trim();
    if (!unit || unit.length > 30) return { error: 'Đơn vị tính không hợp lệ (VD: viên, gói, chai)' };
    out.unit = unit;
  }
  if (!partial || body.price !== undefined) {
    const price = Number(body.price);
    if (!Number.isFinite(price) || price < 0 || price > 100000000) return { error: 'Giá bán không hợp lệ' };
    out.price = Math.round(price);
  }
  if (!partial || body.min_stock !== undefined) {
    const min = Number(body.min_stock ?? 0);
    if (!Number.isInteger(min) || min < 0 || min > 1000000) return { error: 'Mức tồn tối thiểu phải là số nguyên ≥ 0' };
    out.min_stock = min;
  }
  if (body.active !== undefined) out.active = body.active ? 1 : 0;
  return { value: out };
};

const positiveInt = (v, max = 1000000) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n <= max ? n : null;
};

class MedicinesController {
  async list(req, res) {
    try {
      const showAll = req.user.role === 'admin' && req.query.all === '1';
      const q = String(req.query.q || '').trim();
      const where = [];
      const params = [];
      if (!showAll) where.push('active = 1');
      if (q) { where.push('name LIKE ?'); params.push(`%${q}%`); }
      const [rows] = await pool.execute(
        `SELECT * FROM medicines ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY active DESC, name ASC`,
        params
      );
      const items = rows.map(toMedicine);
      res.json({
        success: true,
        data: {
          items,
          low_stock_count: items.filter((m) => m.active && m.low_stock).length,
          stock_value: items.reduce((s, m) => s + (m.active ? m.price * m.stock : 0), 0)
        }
      });
    } catch (error) {
      console.error('List medicines error:', error);
      fail(res, 500, 'DATABASE_ERROR', 'Không thể tải danh mục thuốc');
    }
  }

  async create(req, res) {
    const { value, error } = readFields(req.body || {}, { partial: false });
    if (error) return fail(res, 400, 'VALIDATION_ERROR', error);
    const opening = req.body.stock === undefined || req.body.stock === '' ? 0 : Number(req.body.stock);
    if (!Number.isInteger(opening) || opening < 0 || opening > 1000000) {
      return fail(res, 400, 'VALIDATION_ERROR', 'Tồn kho ban đầu phải là số nguyên ≥ 0');
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [result] = await conn.execute(
        'INSERT INTO medicines (name, unit, price, stock, min_stock) VALUES (?, ?, ?, ?, ?)',
        [value.name, value.unit, value.price, opening, value.min_stock]
      );
      if (opening > 0) {
        await conn.execute(
          `INSERT INTO stock_movements (medicine_id, quantity_change, stock_after, reason, note, created_by)
           VALUES (?, ?, ?, 'import', 'Tồn đầu kỳ', ?)`,
          [result.insertId, opening, opening, req.user.id]
        );
      }
      await conn.commit();
      audit(req, 'medicine_created', { medicineId: result.insertId, name: value.name, stock: opening });
      const [[row]] = await pool.execute('SELECT * FROM medicines WHERE id = ?', [result.insertId]);
      res.status(201).json({ success: true, message: `Đã thêm ${value.name}`, data: toMedicine(row) });
    } catch (err) {
      await conn.rollback().catch(() => undefined);
      if (err.code === 'ER_DUP_ENTRY') return fail(res, 409, 'DUPLICATE_NAME', `Thuốc "${value.name}" đã có trong danh mục`);
      console.error('Create medicine error:', err);
      fail(res, 500, 'DATABASE_ERROR', 'Không thể thêm thuốc');
    } finally {
      conn.release();
    }
  }

  async update(req, res) {
    const id = positiveInt(req.params.id, 2147483647);
    if (!id) return fail(res, 400, 'VALIDATION_ERROR', 'Mã thuốc không hợp lệ');
    const { value, error } = readFields(req.body || {}, { partial: true });
    if (error) return fail(res, 400, 'VALIDATION_ERROR', error);
    const fields = Object.keys(value);
    if (fields.length === 0) return fail(res, 400, 'VALIDATION_ERROR', 'Không có gì để cập nhật');
    try {
      const [result] = await pool.execute(
        `UPDATE medicines SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`,
        [...fields.map((f) => value[f]), id]
      );
      if (result.affectedRows === 0) return fail(res, 404, 'MEDICINE_NOT_FOUND', 'Không tìm thấy thuốc');
      audit(req, 'medicine_updated', { medicineId: id, changes: value });
      const [[row]] = await pool.execute('SELECT * FROM medicines WHERE id = ?', [id]);
      res.json({ success: true, message: `Đã cập nhật ${row.name}`, data: toMedicine(row) });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') return fail(res, 409, 'DUPLICATE_NAME', 'Tên thuốc đã tồn tại');
      console.error('Update medicine error:', err);
      fail(res, 500, 'DATABASE_ERROR', 'Không thể cập nhật thuốc');
    }
  }

  async remove(req, res) {
    const id = positiveInt(req.params.id, 2147483647);
    if (!id) return fail(res, 400, 'VALIDATION_ERROR', 'Mã thuốc không hợp lệ');
    try {
      const [[m]] = await pool.execute(
        `SELECT m.name, (SELECT COUNT(*) FROM prescriptions p WHERE p.medicine_id = m.id) AS used
         FROM medicines m WHERE m.id = ?`,
        [id]
      );
      if (!m) return fail(res, 404, 'MEDICINE_NOT_FOUND', 'Không tìm thấy thuốc');
      if (Number(m.used) > 0) {
        return fail(res, 409, 'MEDICINE_IN_USE', `"${m.name}" đã được kê trong ${m.used} đơn thuốc – không xoá được, hãy chọn "Ngừng bán".`);
      }
      await pool.execute('DELETE FROM medicines WHERE id = ?', [id]);
      audit(req, 'medicine_deleted', { medicineId: id, name: m.name });
      res.json({ success: true, message: `Đã xoá ${m.name}` });
    } catch (err) {
      console.error('Delete medicine error:', err);
      fail(res, 500, 'DATABASE_ERROR', 'Không thể xoá thuốc');
    }
  }

  /** Stock change inside a transaction with the medicine row locked */
  async changeStock(req, res, kind) {
    const id = positiveInt(req.params.id, 2147483647);
    if (!id) return fail(res, 400, 'VALIDATION_ERROR', 'Mã thuốc không hợp lệ');
    const note = String(req.body?.note || '').trim().slice(0, 255) || null;
    let amount;
    if (kind === 'import') {
      amount = positiveInt(req.body?.quantity);
      if (!amount) return fail(res, 400, 'VALIDATION_ERROR', 'Số lượng nhập phải là số nguyên > 0');
    } else {
      amount = Number(req.body?.stock);
      if (!Number.isInteger(amount) || amount < 0 || amount > 1000000) {
        return fail(res, 400, 'VALIDATION_ERROR', 'Số lượng thực tế phải là số nguyên ≥ 0');
      }
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [[m]] = await conn.execute('SELECT * FROM medicines WHERE id = ? FOR UPDATE', [id]);
      if (!m) { await conn.rollback(); return fail(res, 404, 'MEDICINE_NOT_FOUND', 'Không tìm thấy thuốc'); }
      const before = Number(m.stock);
      const after = kind === 'import' ? before + amount : amount;
      const change = after - before;
      if (kind === 'adjust' && change === 0) {
        await conn.rollback();
        return fail(res, 400, 'NO_CHANGE', `Tồn kho đã đúng ${before} ${m.unit}`);
      }
      await conn.execute('UPDATE medicines SET stock = ? WHERE id = ?', [after, id]);
      await conn.execute(
        `INSERT INTO stock_movements (medicine_id, quantity_change, stock_after, reason, note, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, change, after, kind, note || (kind === 'import' ? 'Nhập kho' : 'Kiểm kho'), req.user.id]
      );
      await conn.commit();
      audit(req, kind === 'import' ? 'medicine_stock_import' : 'medicine_stock_adjust', { medicineId: id, change, stockAfter: after, note });
      const [[row]] = await pool.execute('SELECT * FROM medicines WHERE id = ?', [id]);
      res.json({
        success: true,
        message: kind === 'import'
          ? `Đã nhập ${amount} ${m.unit} ${m.name} – tồn ${after}`
          : `Đã kiểm kho ${m.name}: ${before} → ${after} ${m.unit} (${change > 0 ? '+' : ''}${change})`,
        data: toMedicine(row)
      });
    } catch (err) {
      await conn.rollback().catch(() => undefined);
      console.error('Stock change error:', err);
      fail(res, 500, 'DATABASE_ERROR', 'Không thể cập nhật tồn kho');
    } finally {
      conn.release();
    }
  }

  importStock(req, res) { return this.changeStock(req, res, 'import'); }

  adjustStock(req, res) { return this.changeStock(req, res, 'adjust'); }

  async movements(req, res) {
    const id = positiveInt(req.params.id, 2147483647);
    if (!id) return fail(res, 400, 'VALIDATION_ERROR', 'Mã thuốc không hợp lệ');
    try {
      const [rows] = await pool.execute(
        `SELECT sm.id, sm.quantity_change, sm.stock_after, sm.reason, sm.note, sm.medical_record_id,
                sm.created_at, u.fullname AS created_by_name
         FROM stock_movements sm
         LEFT JOIN users u ON u.id = sm.created_by
         WHERE sm.medicine_id = ?
         ORDER BY sm.id DESC
         LIMIT 100`,
        [id]
      );
      res.json({ success: true, data: rows });
    } catch (err) {
      console.error('Stock movements error:', err);
      fail(res, 500, 'DATABASE_ERROR', 'Không thể tải lịch sử kho');
    }
  }
}

const controller = new MedicinesController();
// keep `this` when Express calls the handlers
Object.getOwnPropertyNames(MedicinesController.prototype)
  .filter((k) => k !== 'constructor')
  .forEach((k) => { controller[k] = controller[k].bind(controller); });

module.exports = controller;
