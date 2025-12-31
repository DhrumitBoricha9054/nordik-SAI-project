/**
 * SIA DC-09 Utility Functions
 * Shared utilities for SIA message formatting and CRC calculation
 */

/**
 * Calculate CRC-16 ARC (used by DC-09 standard)
 * CRC-16 ARC uses polynomial 0x8005 (also known as CRC-16 IBM)
 * @param {Buffer|string} data - Data to calculate CRC for
 * @returns {string} 4-character hexadecimal CRC string (uppercase)
 */
function calculateCRC(data) {
  if (typeof data === 'string') {
    data = Buffer.from(data, 'ascii');
  }

  // CRC-16 ARC implementation (polynomial 0x8005)
  let crc = 0x0000;
  const polynomial = 0x8005;

  for (let i = 0; i < data.length; i++) {
    crc ^= data[i] << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ polynomial;
      } else {
        crc <<= 1;
      }
      crc &= 0xFFFF;
    }
  }

  // Format as 4-character hex string (uppercase, zero-padded)
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Format length field as 0LLL (4 characters: "0" + 3 hex digits)
 * @param {number} length - Message length
 * @returns {string} Length field in 0LLL format
 */
function formatLength(length) {
  const hexLength = length.toString(16).toUpperCase().padStart(3, '0');
  return `0${hexLength}`;
}

/**
 * Format sequence number (4 hex digits, 0000-FFFF)
 * @param {number} seq - Sequence number
 * @returns {string} 4-character hex sequence number
 */
function formatSequence(seq) {
  return seq.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Build non-encrypted SIA message frame
 * Format: <LF><CRC><0LLL><"id"><seq><Rrcvr><Lpref><#acct>[Data]<CR>
 * @param {string} id - Protocol identifier (e.g., "SIA-DCS")
 * @param {number} seq - Sequence number
 * @param {string} accountPrefix - Account prefix (e.g., "L0")
 * @param {string|number} account - Account number
 * @param {string} data - Message data (without brackets)
 * @param {string} receiver - Receiver number (optional)
 * @returns {Buffer} Complete message frame
 */
function buildPlainMessage(id, seq, accountPrefix, account, data, receiver = '') {
  // Build message body (without CRC and length)
  const accountStr = typeof account === 'number' ? account.toString() : account;
  const messageBody = `"${id}"${formatSequence(seq)}${receiver}${accountPrefix}#${accountStr}[${accountStr}|${data}]`;

  // Calculate length (message body only, for 0LLL field)
  const length = messageBody.length;
  const lengthField = formatLength(length);

  // Calculate CRC on message body
  const crcValue = calculateCRC(messageBody);

  // Build complete message: LF + CRC + 0LLL + message body + CR
  const fullMessage = `\n${crcValue}${lengthField}${messageBody}\r`;

  return Buffer.from(fullMessage, 'ascii');
}

/**
 * Generate pseudo-random padding bytes
 * Per DC-09: bytes 0-255 excluding "|" (124), "[" (91), "]" (93)
 * @param {number} length - Number of padding bytes needed
 * @returns {Buffer} Padding bytes
 */
function generatePadding(length) {
  const padding = Buffer.alloc(length);
  const excluded = [91, 93, 124]; // [, ], |

  for (let i = 0; i < length; i++) {
    let byte;
    do {
      byte = Math.floor(Math.random() * 256);
    } while (excluded.includes(byte));
    padding[i] = byte;
  }

  return padding;
}

/**
 * Add padding to data for encryption (matches Python exactly)
 * Padding goes BEFORE the data, uses ASCII A-Z pattern like Python
 * @param {Buffer|string} data - Data to pad
 * @returns {Buffer} Padded data
 */
function addPadding(data) {
  if (typeof data === 'string') {
    data = Buffer.from(data, 'ascii');
  }

  const dataLength = data.length;
  // Python: pad_length = 16 - len(input_bytes) % 16; pad_length = pad_length if pad_length != 16 else 0
  let padLength = 16 - (dataLength % 16);
  if (padLength === 16) padLength = 0;

  // Python uses ASCII A-Z pattern: bytes([i % 26 + 65 for i in range(pad_length)])
  const padding = Buffer.alloc(padLength);
  for (let i = 0; i < padLength; i++) {
    padding[i] = (i % 26) + 65; // A=65, B=66, etc.
  }

  return Buffer.concat([padding, data]);
}

/**
 * Encrypt data using AES-CBC
 * @param {Buffer|string} data - Data to encrypt
 * @param {Buffer|string} key - Encryption key (hex string or Buffer)
 * @returns {string} Encrypted data as ASCII hex string
 */
function encryptAES(data, key) {
  const crypto = require('crypto');

  // Convert key to Buffer if it's a hex string
  let keyBuffer;
  if (typeof key === 'string') {
    keyBuffer = Buffer.from(key, 'hex');
  } else {
    keyBuffer = key;
  }

  // Convert data to Buffer if it's a string
  let dataBuffer;
  if (typeof data === 'string') {
    dataBuffer = Buffer.from(data, 'ascii');
  } else {
    dataBuffer = data;
  }

  // IV is all zeros per DC-09 standard
  const iv = Buffer.alloc(16, 0);

  const cipher = crypto.createCipheriv('aes-128-cbc', keyBuffer.slice(0, 16), iv);
  let encrypted = cipher.update(dataBuffer);
  encrypted = Buffer.concat([encrypted, cipher.final()]);

  // Return as ASCII hex string
  return encrypted.toString('hex').toUpperCase();
}

/**
 * Build encrypted SIA message frame
 * Format: <LF><CRC><0LLL><"*id"><seq><Rrcvr><Lpref><#acct>[<pad>|encrypted_data]<CR>
 * @param {string} id - Protocol identifier (e.g., "SIA-DCS")
 * @param {number} seq - Sequence number
 * @param {string} accountPrefix - Account prefix (e.g., "L0")
 * @param {string|number} account - Account number
 * @param {string} data - Message data to encrypt
 * @param {Buffer|string} key - Encryption key
 * @param {string} receiver - Receiver number (optional)
 * @returns {Buffer} Complete encrypted message frame
 */
function buildEncryptedMessage(id, seq, accountPrefix, account, data, key, receiver = '') {
  const crypto = require('crypto');

  // Build data part that will be encrypted: |account|data|timestamp
  const accountStr = typeof account === 'number' ? account.toString() : account;
  const dataToEncrypt = `|${accountStr}|${data}`;

  // Add padding
  const paddedData = addPadding(Buffer.from(dataToEncrypt, 'ascii'));

  // Encrypt
  const encryptedHex = encryptAES(paddedData, key);

  // Build message body: "*id" + seq + receiver + prefix + account + [encrypted]
  const messageBody = `"*${id}"${formatSequence(seq)}${receiver}${accountPrefix}#${accountStr}[${encryptedHex}]`;

  // Calculate length
  const length = messageBody.length;
  const lengthField = formatLength(length);

  // Calculate CRC on message body
  const crcValue = calculateCRC(messageBody);

  // Build complete message: LF + CRC + 0LLL + message body + CR
  const fullMessage = `\n${crcValue}${lengthField}${messageBody}\r`;

  return Buffer.from(fullMessage, 'ascii');
}

/**
 * Convert coordinates to SIA format
 * @param {number} latitude - Latitude in decimal degrees
 * @param {number} longitude - Longitude in decimal degrees
 * @returns {string} Formatted coordinates [XdddEmm.mmmmmm][YddNmm.mmmmmm]
 */
function convertCoordinates(latitude, longitude) {
  // Longitude
  const lonDegrees = Math.floor(longitude);
  const lonMinutes = (longitude - lonDegrees) * 60;
  const lonFormat = `[X${lonDegrees.toString().padStart(3, '0')}E${lonMinutes.toFixed(8)}]`;

  // Latitude
  const latDegrees = Math.floor(latitude);
  const latMinutes = (latitude - latDegrees) * 60;
  const latFormat = `[Y${latDegrees.toString().padStart(2, '0')}N${latMinutes.toFixed(8)}]`;

  return lonFormat + latFormat;
}

module.exports = {
  calculateCRC,
  formatLength,
  formatSequence,
  buildPlainMessage,
  buildEncryptedMessage,
  generatePadding,
  addPadding,
  encryptAES,
  convertCoordinates
};

