/**
 * Database Setup Script
 * Creates the sia_alert_log table
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.ZH_PG_HOSTNAME,
    port: parseInt(process.env.ZH_PG_PORT || '5432'),
    user: process.env.ZH_PG_USER,
    password: process.env.ZH_PG_PSWD,
    database: process.env.ZH_PG_DB,
    ssl: { rejectUnauthorized: false }
});

async function setup() {
    console.log('🔧 Setting up SIA Alert Log table...\n');
    console.log(`📡 Connecting to: ${process.env.ZH_PG_HOSTNAME}:${process.env.ZH_PG_PORT}`);

    try {
        // Test connection
        await pool.query('SELECT 1');
        console.log('✅ Database connected\n');

        // Create table
        const createTableSQL = `
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      
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

      CREATE INDEX IF NOT EXISTS "sia_alert_log_alert_event_id_index" ON "sia_alert_log" ("alert_event_id");
      CREATE INDEX IF NOT EXISTS "sia_alert_log_patient_id_index" ON "sia_alert_log" ("patient_id");
      CREATE INDEX IF NOT EXISTS "sia_alert_log_processed_at_index" ON "sia_alert_log" ("processed_at");
    `;

        await pool.query(createTableSQL);
        console.log('✅ Table "sia_alert_log" created successfully!\n');

        // Verify table exists
        const result = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'sia_alert_log'
      ORDER BY ordinal_position
    `);

        console.log('📋 Table columns:');
        result.rows.forEach(row => {
            console.log(`   - ${row.column_name}: ${row.data_type}`);
        });

        console.log('\n✅ Setup complete! You can now run: npm run alarm-processor\n');

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await pool.end();
    }
}

setup();
