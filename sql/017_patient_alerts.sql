CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$
BEGIN
    -- Patient Alerts Table
    CREATE TABLE IF NOT EXISTS "patient_alerts" (
        "patient_id" UUID REFERENCES "patients"("id") ON DELETE CASCADE,
        "type" VARCHAR(12) NOT NULL,
        "enabled" BOOLEAN DEFAULT TRUE,
        "start_time" TIME,
        "end_time" TIME,
        "min_value" REAL,
        "max_value" REAL,
        "phones" TEXT[] DEFAULT '{}',
        "duration" INT DEFAULT 0,
        "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

        PRIMARY KEY ("patient_id", "type")
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS "patient_alerts_patient_id_index" ON "patient_alerts" ("patient_id");
    CREATE INDEX IF NOT EXISTS "patient_alerts_type_index" ON "patient_alerts" ("type");
    CREATE INDEX IF NOT EXISTS "patient_alerts_enabled_index" ON "patient_alerts" ("enabled");
    CREATE INDEX IF NOT EXISTS "patient_alerts_created_at_index" ON "patient_alerts" ("created_at");
    CREATE INDEX IF NOT EXISTS "patient_alerts_updated_at_index" ON "patient_alerts" ("updated_at");

    -- Triggers
    CREATE OR REPLACE TRIGGER update_patient_alerts_updated_at
    BEFORE UPDATE ON "patient_alerts"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
END$$;
