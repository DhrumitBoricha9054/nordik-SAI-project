/**
 * Alarm Processor Service
 * Polls PostgreSQL for new patient alerts, encrypts them using SIA DC-09, and logs to console
 */

const { Pool } = require('pg');
const {
    buildPlainMessage,
    calculateCRC,
    formatLength,
    formatSequence,
    addPadding,
    encryptAES
} = require('./sia-utils');

// Load environment variables
require('dotenv').config();

// Default encryption key (can be overridden via env)
const DEFAULT_ENCRYPTION_KEY = process.env.SIA_ENCRYPTION_KEY || '594162417237323352466D3964673233';

// Polling interval in milliseconds
const POLL_INTERVAL = process.env.POLL_INTERVAL || 5000;

// Sequence number tracker
let sequenceNumber = 1;

// PostgreSQL connection pool
const pool = new Pool({
    host: process.env.ZH_PG_HOSTNAME,
    port: parseInt(process.env.ZH_PG_PORT || '5432'),
    user: process.env.ZH_PG_USER,
    password: process.env.ZH_PG_PSWD,
    database: process.env.ZH_PG_DB,
    ssl: { rejectUnauthorized: false }
});

/**
 * Generate SIA account ID from patient UUID
 * Takes first 4-6 digits from UUID hash
 */
function generateAccountId(patientId) {
    if (!patientId) return '0000';

    // Simple hash: sum of char codes, then take last 4 digits
    const hash = patientId
        .replace(/-/g, '')
        .split('')
        .reduce((sum, char) => sum + char.charCodeAt(0), 0);

    return String(hash % 10000).padStart(4, '0');
}

/**
 * Build encrypted SIA message for medical alarm
 */
function buildEncryptedMedicalAlarm(alertData, encryptionKey) {
    const accountId = generateAccountId(alertData.patient_id);
    const signalType = 'MA'; // Medical Alarm
    const zone = '001';

    // Get timestamp
    const now = new Date();
    const datePart = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${now.getFullYear()}`;
    const timePart = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    // Build alarm command with alert details
    const alarmCommand = `Nri/${signalType}${zone}^${alertData.type}^${alertData.level || 'normal'}^${alertData.value || ''}`;

    // Build full message string
    const fullMessageString = `"*SIA-DCS"${formatSequence(sequenceNumber)}L0#${accountId}[${accountId}|${alarmCommand}]_${timePart},${datePart}`;

    const bracketIndex = fullMessageString.indexOf('[');
    const partBefore = fullMessageString.substring(0, bracketIndex + 1);
    const partAfter = '|' + fullMessageString.substring(bracketIndex + 1);

    // Encrypt
    const paddedData = addPadding(Buffer.from(partAfter, 'ascii'));
    const encryptedHex = encryptAES(paddedData, encryptionKey);

    const messageBody = `${partBefore}${encryptedHex}]`;
    const length = messageBody.length;
    const lengthField = formatLength(length);
    const crcValue = calculateCRC(messageBody);
    const fullMessage = `\n${crcValue}${lengthField}${messageBody}\r`;

    // Increment sequence
    sequenceNumber = (sequenceNumber + 1) % 65536;

    return {
        message: Buffer.from(fullMessage, 'ascii'),
        crc: crcValue,
        accountId,
        sequence: sequenceNumber - 1
    };
}

/**
 * Build plain (non-encrypted) SIA message for medical alarm
 */
function buildPlainMedicalAlarm(alertData) {
    const accountId = generateAccountId(alertData.patient_id);
    const signalType = 'MA'; // Medical Alarm
    const zone = '001';

    // Build alarm data with alert details
    const alarmData = `Nri/${signalType}${zone}^${alertData.type}^${alertData.level || 'normal'}^${alertData.value || ''}`;

    const message = buildPlainMessage('SIA-DCS', sequenceNumber, 'L0', accountId, alarmData);

    // Get CRC from message
    const messageStr = message.toString('ascii');
    const crc = messageStr.substring(1, 5);

    return {
        message,
        crc,
        accountId,
        sequence: sequenceNumber
    };
}

/**
 * Fetch unprocessed alerts from database
 */
async function fetchNewAlerts() {
    const query = `
    SELECT 
      e.id,
      e.type,
      e.level,
      e.patient_id,
      e.sensor_id,
      e.value,
      e.triggered_at,
      e.created_at
    FROM patient_alert_events e
    LEFT JOIN sia_alert_log s ON e.id = s.alert_event_id
    WHERE s.id IS NULL
    ORDER BY e.created_at ASC
    LIMIT 10
  `;

    const result = await pool.query(query);
    return result.rows;
}

/**
 * Save processed alert to sia_alert_log
 */
async function saveProcessedAlert(alertEventId, patientId, accountId, plainMessage, encryptedMessage, crc, encryptionKey) {
    const query = `
    INSERT INTO sia_alert_log 
      (alert_event_id, patient_id, sia_account, sia_signal_type, sia_message_plain, sia_message_encrypted, sia_crc, encryption_key)
    VALUES 
      ($1, $2, $3, 'MA', $4, $5, $6, $7)
    ON CONFLICT (alert_event_id) DO NOTHING
  `;

    await pool.query(query, [
        alertEventId,
        patientId,
        accountId,
        plainMessage,
        encryptedMessage,
        crc,
        encryptionKey
    ]);
}

/**
 * Process a single alert
 */
async function processAlert(alert) {
    console.log('\n📢 NEW ALARM | Type: ' + alert.type + ' | Level: ' + (alert.level || 'normal') + ' | Patient: ' + alert.patient_id.substring(0, 8) + '...');

    // Build plain message
    const plain = buildPlainMedicalAlarm(alert);

    // Build encrypted message
    const encrypted = buildEncryptedMedicalAlarm(alert, DEFAULT_ENCRYPTION_KEY);

    // Simple output - just the two messages
    console.log('\n📝 PLAIN:     ' + plain.message.toString('ascii').replace(/\n/g, '\\n').replace(/\r/g, '\\r'));
    console.log('🔐 ENCRYPTED: ' + encrypted.message.toString('ascii').replace(/\n/g, '\\n').replace(/\r/g, '\\r'));

    // Save to database
    await saveProcessedAlert(
        alert.id,
        alert.patient_id,
        plain.accountId,
        plain.message.toString('hex').toUpperCase(),
        encrypted.message.toString('hex').toUpperCase(),
        encrypted.crc,
        DEFAULT_ENCRYPTION_KEY
    );

    console.log('✅ Saved\n');
}

/**
 * Main polling loop
 */
async function pollForAlerts() {
    try {
        const alerts = await fetchNewAlerts();

        if (alerts.length > 0) {
            console.log(`\n🔍 Found ${alerts.length} new alert(s) to process...`);

            for (const alert of alerts) {
                await processAlert(alert);
            }
        }
    } catch (error) {
        console.error('❌ Error polling for alerts:', error.message);
    }
}

/**
 * Start the alarm processor service
 */
async function start() {
    console.clear();
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                                                                              ║');
    console.log('║              SIA DC-09 Medical Alarm Processor                               ║');
    console.log('║                                                                              ║');
    console.log('║              Polling for patient alerts...                                   ║');
    console.log('║                                                                              ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
    console.log('\n');

    console.log('📡 Configuration:');
    console.log(`   Database:    ${process.env.ZH_PG_HOSTNAME}:${process.env.ZH_PG_PORT}`);
    console.log(`   Poll Rate:   Every ${POLL_INTERVAL / 1000} seconds`);
    console.log(`   Encryption:  AES-128-CBC (DC-09 compliant)`);
    console.log(`   Signal Type: MA (Medical Alarm)`);
    console.log('\n');

    // Test database connection
    try {
        await pool.query('SELECT 1');
        console.log('✅ Database connected successfully\n');
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        process.exit(1);
    }

    console.log('👀 Watching for new alerts...\n');

    // Initial poll
    await pollForAlerts();

    // Start polling loop
    setInterval(pollForAlerts, POLL_INTERVAL);
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n\n🛑 Shutting down alarm processor...');
    await pool.end();
    process.exit(0);
});

// Run if executed directly
if (require.main === module) {
    start().catch(console.error);
}

module.exports = { start, processAlert, fetchNewAlerts };
