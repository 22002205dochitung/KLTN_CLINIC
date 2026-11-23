-- Bank transfer (VietQR) confirmation support. Idempotent: safe to run more than once.
-- Run after logic_fixes.sql.

-- When the patient pressed "Tôi đã chuyển khoản" (cashier then verifies and confirms)
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS transfer_reported_at TIMESTAMP NULL DEFAULT NULL AFTER payment_method;

-- Bank reference of an automatically matched transfer (SePay webhook); unique so a
-- webhook delivered twice can never record the same transfer twice
ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS bank_reference VARCHAR(100) NULL DEFAULT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_bank_reference ON payment_transactions (bank_reference);
