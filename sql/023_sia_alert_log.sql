CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$
BEGIN
    -- SIA Alert Log Table - Tracks processed alerts
    CREATE TABLE IF NOT EXISTS "sia_alert_log" (
        "id" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
        "alert_event_id" UUID REFERENCES "patient_alert_events"("id") ON DELETE CASCADE,
        "patient_id" UUID,
        "sia_account" VARCHAR(10) NOT NULL,
        "sia_signal_type" VARCHAR(4) DEFAULT 'MA',
        "sia_message_plain" TEXT,
        "sia_message_encrypted" TEXT,
        "sia_crc" VARCHAR(4),
        "encryption_key" VARCHAR(64),
        "processed_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        
        UNIQUE("alert_event_id")
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS "sia_alert_log_alert_event_id_index" ON "sia_alert_log" ("alert_event_id");
    CREATE INDEX IF NOT EXISTS "sia_alert_log_patient_id_index" ON "sia_alert_log" ("patient_id");
    CREATE INDEX IF NOT EXISTS "sia_alert_log_processed_at_index" ON "sia_alert_log" ("processed_at");
END$$;
