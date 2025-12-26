CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$
BEGIN
    -- Patient Alert History Table
    CREATE OR REPLACE VIEW "patient_alert_events_view" AS
    SELECT
        ev."id",
        ev."sid",
        ev."type",
        ev."level",
        ev."is_resolved",
        ev."patient_id",
        p."first_name" || ' ' || p."last_name" as "patient_name",
        s."id" as "sensor_id",
        ev."value",
        ev."resolved_by",
        u."first_name" || ' ' || u."last_name" as "resolved_by_name",
        u."initials" as "resolved_by_initials",
        ev."resolved_at",
        ev."created_at",
        ev."triggered_at"
    FROM "patient_alert_events" as ev
    LEFT JOIN "patients" as p ON ev."patient_id" = p."id"
    LEFT JOIN "sensors" as s ON ev."sensor_id" = s."id"
    LEFT JOIN "users" as u ON ev."resolved_by" = u."id";
END$$;
