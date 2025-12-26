CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$
BEGIN
    -- Patient Alert History Table
    CREATE TABLE IF NOT EXISTS "patient_alert_events" (
        "id" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
        "sid" INT GENERATED ALWAYS AS IDENTITY,
        "type" VARCHAR(12) NOT NULL,
        "level" VARCHAR(12) DEFAULT 'normal',
        "is_resolved" BOOLEAN DEFAULT FALSE,
        "patient_id" UUID REFERENCES "patients"("id") ON DELETE CASCADE,
        "sensor_id" VARCHAR(20) REFERENCES "sensors"("id") ON DELETE SET NULL,
        "value" REAL,
        "resolved_by" UUID REFERENCES "users"("id") ON DELETE SET NULL,
        "resolved_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        "triggered_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS "patient_alert_events_patient_id_index" ON "patient_alert_events" ("patient_id");
    CREATE INDEX IF NOT EXISTS "patient_alert_events_type_index" ON "patient_alert_events" ("type");
    CREATE INDEX IF NOT EXISTS "patient_alert_events_created_at_index" ON "patient_alert_events" ("created_at");
    CREATE INDEX IF NOT EXISTS "patient_alert_events_triggered_at_index" ON "patient_alert_events" ("triggered_at");
END$$;
