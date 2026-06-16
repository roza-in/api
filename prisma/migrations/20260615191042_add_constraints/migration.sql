-- Enable btree_gist extension (required for exclusion constraints with non-GiST types)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Prevent overlapping appointments per staff member
ALTER TABLE appointments ADD CONSTRAINT appointments_no_time_overlap
  EXCLUDE USING gist (
    "staffId" WITH =,
    tstzrange("startTime", "endTime", '[)') WITH &&
  )
  WHERE ("deletedAt" IS NULL AND status != 'CANCELLED');

-- Add CHECK constraints
ALTER TABLE appointments ADD CONSTRAINT chk_appointment_time_order 
  CHECK ("startTime" < "endTime");

ALTER TABLE leaves ADD CONSTRAINT chk_leave_time_order 
  CHECK ("startTime" < "endTime");

ALTER TABLE payments ADD CONSTRAINT chk_payment_amount_positive 
  CHECK (amount > 0);

ALTER TABLE refunds ADD CONSTRAINT chk_refund_amount_positive 
  CHECK (amount > 0);

ALTER TABLE reviews ADD CONSTRAINT chk_review_rating_range 
  CHECK (rating >= 1 AND rating <= 5);

ALTER TABLE services ADD CONSTRAINT chk_service_duration_positive 
  CHECK (duration > 0);

ALTER TABLE services ADD CONSTRAINT chk_service_price_non_negative 
  CHECK (price >= 0);