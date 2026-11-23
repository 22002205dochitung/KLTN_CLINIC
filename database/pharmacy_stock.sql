-- Xuất kho khi thu tiền thuốc. Chạy sau queue_calling.sql. Idempotent.
-- dispensed_quantity: NULL = chưa thanh toán; 0 = bệnh nhân không lấy thuốc này; >0 = đã xuất kho
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS dispensed_quantity INT NULL DEFAULT NULL AFTER unit_price;

-- Hoàn tiền tiền thuốc có thể nhập lại kho
ALTER TABLE stock_movements MODIFY COLUMN reason ENUM('import', 'dispense', 'adjust', 'return') NOT NULL;
