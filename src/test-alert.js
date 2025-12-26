/**
 * Test Script - Insert a fake alert to test the alarm processor
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

async function insertTestAlert() {
    console.log('🧪 Inserting test alert...\n');

    try {
        // First, get a valid patient_id from the database
        const patientResult = await pool.query('SELECT id FROM patients LIMIT 1');

        if (patientResult.rows.length === 0) {
            console.log('❌ No patients found in database. Creating test without patient reference...');

            // Insert without patient reference (if your schema allows)
            const insertQuery = `
                INSERT INTO patient_alert_events (type, level, value, triggered_at)
                VALUES ($1, $2, $3, NOW())
                RETURNING id, type, level, value, triggered_at
            `;

            const result = await pool.query(insertQuery, [
                'heart_rate',
                'critical',
                150.5
            ]);

            console.log('✅ Test alert inserted:');
            console.log(result.rows[0]);
        } else {
            const patientId = patientResult.rows[0].id;
            console.log(`📋 Using patient ID: ${patientId}\n`);

            // Insert test alert
            const insertQuery = `
                INSERT INTO patient_alert_events (patient_id, type, level, value, triggered_at)
                VALUES ($1, $2, $3, $4, NOW())
                RETURNING id, patient_id, type, level, value, triggered_at
            `;

            const alertTypes = ['heart_rate', 'temperature', 'fall', 'oxygen', 'blood_pressure'];
            const alertLevels = ['normal', 'warning', 'critical'];

            const randomType = alertTypes[Math.floor(Math.random() * alertTypes.length)];
            const randomLevel = alertLevels[Math.floor(Math.random() * alertLevels.length)];
            const randomValue = Math.floor(Math.random() * 100) + 50;

            const result = await pool.query(insertQuery, [
                patientId,
                randomType,
                randomLevel,
                randomValue
            ]);

            console.log('✅ Test alert inserted:');
            console.log(`   ID:         ${result.rows[0].id}`);
            console.log(`   Patient:    ${result.rows[0].patient_id}`);
            console.log(`   Type:       ${result.rows[0].type}`);
            console.log(`   Level:      ${result.rows[0].level}`);
            console.log(`   Value:      ${result.rows[0].value}`);
            console.log(`   Triggered:  ${result.rows[0].triggered_at}`);
        }

        console.log('\n🚀 Now run "npm run alarm-processor" to see it get processed!\n');

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await pool.end();
    }
}

insertTestAlert();
