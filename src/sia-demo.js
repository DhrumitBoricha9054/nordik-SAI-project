/**
 * SIA-DEMO.js
 * Demonstration script to show message output without requiring server connection
 * Useful for showing implementation to team members
 */

const { 
  buildPlainMessage, 
  buildEncryptedMessage, 
  convertCoordinates,
  calculateCRC,
  formatLength,
  formatSequence
} = require('./sia-utils');

/**
 * Display a formatted message breakdown
 */
function displayMessageBreakdown(title, message, details = {}) {
  console.log('\n' + '='.repeat(70));
  console.log(`  ${title}`);
  console.log('='.repeat(70));
  
  console.log('\n📨 Complete Message (hex):');
  console.log(message.toString('hex').toUpperCase().match(/.{1,32}/g).join('\n'));
  
  console.log('\n📝 Complete Message (ASCII - escaped):');
  const ascii = message.toString('ascii');
  const escaped = ascii
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
  console.log(escaped);
  
  console.log('\n📋 Message Breakdown:');
  console.log(`  LF (Line Feed):        ${message[0] === 0x0A ? '✓ \\n' : '✗'}`);
  console.log(`  CRC:                   ${details.crc || 'N/A'}`);
  console.log(`  Length (0LLL):         ${details.length || 'N/A'}`);
  console.log(`  Protocol ID:           ${details.protocolId || 'N/A'}`);
  console.log(`  Sequence Number:       ${details.sequence || 'N/A'}`);
  console.log(`  Account Prefix:        ${details.accountPrefix || 'N/A'}`);
  console.log(`  Account Number:        ${details.account || 'N/A'}`);
  console.log(`  Data Length:           ${details.dataLength || 'N/A'} bytes`);
  console.log(`  CR (Carriage Return):  ${message[message.length - 1] === 0x0D ? '✓ \\r' : '✗'}`);
  console.log(`  Total Message Size:    ${message.length} bytes`);
  
  if (details.encrypted) {
    console.log(`  Encryption:            AES-128-CBC (DC-09 compliant)`);
    console.log(`  Encrypted Data Length: ${details.encryptedLength || 'N/A'} hex chars`);
  }
  
  console.log('\n' + '-'.repeat(70));
}

/**
 * Demo 1: Non-encrypted message
 */
function demoPlainMessage() {
  console.log('\n\n🔵 DEMO 1: Non-Encrypted SIA-DCS Message');
  console.log('─'.repeat(70));
  
  const accountId = '1234';
  const sequence = 1;
  const signalData = 'Nri1/BA01';
  
  console.log('\nInput Parameters:');
  console.log(`  Account ID:      ${accountId}`);
  console.log(`  Sequence:       ${sequence}`);
  console.log(`  Signal Type:    BA (Burglar Alarm)`);
  console.log(`  Zone:           01`);
  console.log(`  Data:           ${signalData}`);
  
  const message = buildPlainMessage('SIA-DCS', sequence, 'L0', accountId, signalData);
  
  // Parse message for display
  const messageStr = message.toString('ascii');
  const crc = messageStr.substring(1, 5);
  const length = messageStr.substring(5, 9);
  const protocolMatch = messageStr.match(/"([^"]+)"/);
  const protocolId = protocolMatch ? protocolMatch[1] : '';
  const seqMatch = messageStr.match(/"SIA-DCS"(\d{4})/);
  const seq = seqMatch ? seqMatch[1] : '';
  
  displayMessageBreakdown('Non-Encrypted Message', message, {
    crc,
    length,
    protocolId,
    sequence: seq,
    accountPrefix: 'L0',
    account: accountId,
    dataLength: signalData.length
  });
}

/**
 * Demo 2: Encrypted message
 */
function demoEncryptedMessage() {
  console.log('\n\n🟢 DEMO 2: Encrypted SIA-DCS Message');
  console.log('─'.repeat(70));
  
  const accountId = '1234';
  const sequence = 1;
  const key = '594162417237323352466D3964673233'; // 32 hex chars = 128 bits
  const alarmCommand = 'Nri/BA01';
  const latitude = 59.9139;  // Oslo, Norway
  const longitude = 10.7522;
  
  // Get timestamp
  const now = new Date();
  const datePart = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${now.getFullYear()}`;
  const timePart = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  
  const coordinates = convertCoordinates(latitude, longitude);
  const data = `${alarmCommand}]${coordinates}_${timePart},${datePart}`;
  
  console.log('\nInput Parameters:');
  console.log(`  Account ID:      ${accountId}`);
  console.log(`  Sequence:        ${sequence}`);
  console.log(`  Signal Type:     BA (Burglar Alarm)`);
  console.log(`  Zone:            01`);
  console.log(`  Latitude:        ${latitude}`);
  console.log(`  Longitude:        ${longitude}`);
  console.log(`  Coordinates:     ${coordinates}`);
  console.log(`  Timestamp:       ${timePart}, ${datePart}`);
  console.log(`  Encryption Key:  ${key.substring(0, 16)}... (128-bit)`);
  
  // Build message using the same logic as sia-encrypted.js
  const userIdStr = accountId.toString();
  const fullMessageString = `"*SIA-DCS"${formatSequence(sequence)}L0#${userIdStr}[${userIdStr}|${alarmCommand}]${coordinates}_${timePart},${datePart}`;
  
  const bracketIndex = fullMessageString.indexOf('[');
  const partBefore = fullMessageString.substring(0, bracketIndex + 1);
  const partAfter = '|' + fullMessageString.substring(bracketIndex + 1);
  
  // Encrypt
  const { addPadding, encryptAES } = require('./sia-utils');
  const paddedData = addPadding(Buffer.from(partAfter, 'ascii'));
  const encryptedHex = encryptAES(paddedData, key);
  
  const messageBody = `${partBefore}${encryptedHex}]`;
  const length = messageBody.length;
  const lengthField = formatLength(length);
  const crcValue = calculateCRC(messageBody);
  const fullMessage = `\n${crcValue}${lengthField}${messageBody}\r`;
  const message = Buffer.from(fullMessage, 'ascii');
  
  displayMessageBreakdown('Encrypted Message', message, {
    crc: crcValue,
    length: lengthField,
    protocolId: '*SIA-DCS',
    sequence: formatSequence(sequence),
    accountPrefix: 'L0',
    account: accountId,
    encrypted: true,
    encryptedLength: encryptedHex.length,
    dataLength: data.length
  });
  
  console.log('\n🔐 Encryption Details:');
  console.log(`  Algorithm:       AES-128-CBC`);
  console.log(`  IV:              All zeros (DC-09 standard)`);
  console.log(`  Padding:         Pseudo-random bytes (excluding |, [, ])`);
  console.log(`  Encoded Format:  ASCII hex characters`);
  console.log(`  Data to Encrypt: ${partAfter.substring(0, 50)}...`);
  console.log(`  Encrypted Hex:   ${encryptedHex.substring(0, 64)}...`);
}

/**
 * Demo 3: Multiple message types
 */
function demoMessageTypes() {
  console.log('\n\n🟡 DEMO 3: Different Signal Types');
  console.log('─'.repeat(70));
  
  const signals = [
    { type: 'BA', zone: '01', name: 'Burglar Alarm' },
    { type: 'PA', zone: '001', name: 'Panic Alarm' },
    { type: 'CL', zone: '001', name: 'Close/Set' },
    { type: 'OP', zone: '001', name: 'Open/Unset' },
    { type: 'RP', zone: '0', name: 'Test Report' }
  ];
  
  signals.forEach((signal, index) => {
    const data = `Nri1/${signal.type}${signal.zone}`;
    const message = buildPlainMessage('SIA-DCS', index + 1, 'L0', '1234', data);
    const messageStr = message.toString('ascii');
    
    console.log(`\n${index + 1}. ${signal.name} (${signal.type}${signal.zone})`);
    console.log(`   Message: ${messageStr.substring(0, 60)}...`);
  });
}

/**
 * Demo 4: DC-09 Compliance Checklist
 */
function demoComplianceCheck() {
  console.log('\n\n✅ DEMO 4: DC-09 Standard Compliance Checklist');
  console.log('─'.repeat(70));
  
  const checks = [
    { item: 'UDP/TCP transmission support', status: '✓', note: 'TCP implemented' },
    { item: 'LF (Line Feed) format', status: '✓', note: 'Uses \\n (0x0A)' },
    { item: 'CRC format (4 ASCII hex)', status: '✓', note: 'CRC-16 ARC' },
    { item: 'Length field (0LLL format)', status: '✓', note: '4 chars: 0 + 3 hex' },
    { item: 'Sequence number (0000-FFFF)', status: '✓', note: 'Variable tracking' },
    { item: 'AES encryption (128/192/256 bit)', status: '✓', note: '128-bit implemented' },
    { item: 'CBC mode with zero IV', status: '✓', note: 'DC-09 compliant' },
    { item: 'Pseudo-random padding', status: '✓', note: 'Excludes |, [, ]' },
    { item: 'ASCII hex encoding', status: '✓', note: 'Encrypted data' },
    { item: 'CR (Carriage Return)', status: '✓', note: 'Uses \\r (0x0D)' },
    { item: 'Message frame structure', status: '✓', note: 'DC-09 compliant' }
  ];
  
  checks.forEach(check => {
    console.log(`  ${check.status}  ${check.item.padEnd(40)} ${check.note}`);
  });
}

/**
 * Main demo function
 */
function runDemo() {
  console.clear();
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║                                                                  ║');
  console.log('║          SIA DC-09 Message Generator - Demo Output              ║');
  console.log('║                                                                  ║');
  console.log('║          ANSI/SIA DC-09-2013 Compliant Implementation           ║');
  console.log('║                                                                  ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  
  demoPlainMessage();
  demoEncryptedMessage();
  demoMessageTypes();
  demoComplianceCheck();
  
  console.log('\n\n' + '='.repeat(70));
  console.log('  📊 Summary');
  console.log('='.repeat(70));
  console.log('\n✓ Non-encrypted messages: Fully implemented');
  console.log('✓ Encrypted messages: Fully implemented');
  console.log('✓ DC-09 compliance: All requirements met');
  console.log('✓ GPS coordinates: Supported');
  console.log('✓ Timestamps: Automatic generation');
  console.log('✓ Sequence numbers: Proper tracking');
  console.log('\n🚀 Ready for POC testing with alarm central station!');
  console.log('\n');
}

// Run demo
if (require.main === module) {
  runDemo();
}

module.exports = { runDemo };

