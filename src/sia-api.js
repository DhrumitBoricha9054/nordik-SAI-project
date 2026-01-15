/**
 * SIA DC-09 HTTP API
 * REST API wrapper for SIA DC-09 message sending
 * Allows testing via Postman or other HTTP clients
 * 
 * Alarm24 Test Settings:
 * - IP: 213.167.121.142
 * - Port: 12004
 * - Account ID: 555555
 *
 */

const fastify = require('fastify')({
  logger: true
});

// Add content type parser to handle empty body
fastify.addContentTypeParser('application/json', { parseAs: 'string' }, function (req, body, done) {
  try {
    const json = body ? JSON.parse(body) : {};
    done(null, json);
  } catch (err) {
    done(null, {});
  }
});

const {
  buildPlainMessage,
  convertCoordinates,
  calculateCRC,
  formatLength,
  formatSequence,
  addPadding,
  encryptAES
} = require('./sia-utils');

// ============================================
// ALARM24 DEFAULT SETTINGS
// ============================================
const ALARM24_CONFIG = {
  host: '213.167.121.142',
  port: 12004,
  account: '555555',
  timeout: 10000
};

const DEFAULT_ENCRYPTION_KEY = '4B38665033516D3741325A7839524465'; // Alarm24 key

// Sequence number tracker
let sequenceNumber = 1;

/**
 * Send TCP message helper
 */
function sendTCPMessage(message, host, port, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const net = require('net');
    const client = new net.Socket();
    client.setTimeout(timeout);

    let responseData = Buffer.alloc(0);

    client.connect(port, host, () => {
      console.log(`[TCP] Connected to ${host}:${port}`);
      try {
        client.write(message);
        console.log(`[TCP] Sent ${message.length} bytes to ${host}:${port}`);
      } catch (err) {
        console.error(`[TCP] Error while sending to ${host}:${port}: ${err.message}`);
      }
    });

    client.on('data', (data) => {
      responseData = Buffer.concat([responseData, data]);
      try {
        console.log(`[TCP] Received ${data.length} bytes from ${host}:${port}: ${data.toString('ascii').replace(/\r/g, '\\r').replace(/\n/g, '\\n')}`);
      } catch (e) {
        console.log(`[TCP] Received ${data.length} bytes from ${host}:${port}`);
      }
    });

    client.on('error', (err) => {
      console.error(`[TCP] Error on connection to ${host}:${port}: ${err.message}`);
      client.destroy();
      reject(err);
    });

    client.on('timeout', () => {
      console.error(`[TCP] Connection timeout to ${host}:${port}`);
      client.destroy();
      reject(new Error('Connection timeout'));
    });

    client.on('close', () => {
      console.log(`[TCP] Connection to ${host}:${port} closed`);
      resolve(responseData.length > 0 ? responseData.toString('ascii') : null);
    });
  });
}

/**
 * Build encrypted alarm message - EXACTLY like Python SIA-ENCRYPTED.py
 * @param {string} clientId - Client ID (user_id in Python)
 * @param {string} signalType - Signal type (e.g., "BA", "PA", "MA")
 * @param {string} zone - Zone number (e.g., "01", "001")
 * @param {number} latitude - Latitude
 * @param {number} longitude - Longitude
 * @param {string} encryptionKey - Hex encryption key
 */
function buildEncryptedAlarmPython(clientId, signalType, zone, latitude, longitude, encryptionKey) {
  const now = new Date();
  const datePart = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${now.getFullYear()}`;
  const timePart = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

  // Python: alarm_command = SignalType + Zone = "Nri/" + signalType + zone
  const alarmCommand = `Nri/${signalType}${zone}`;

  // Python: output_coordinates = self.convert_coordinates(latitude, longitude)
  const outputCoordinates = convertCoordinates(latitude, longitude);

  // Python line 20: input_string = f'"*SIA-DCS"0005L0#{user_id}[{user_id}|{alarm_command}]{output_coordinates}_{time_part},{date_part}'
  // NOTE: Python uses hardcoded "0005" not variable sequence
  const inputString = `"*SIA-DCS"0005L0#${clientId}[${clientId}|${alarmCommand}]${outputCoordinates}_${timePart},${datePart}`;

  // Python line 24-27: part_before, part_after = input_string.split('[', 1)
  const bracketIndex = inputString.indexOf('[');
  const partBefore = inputString.substring(0, bracketIndex + 1);
  const partAfter = '|' + inputString.substring(bracketIndex + 1);

  // Python line 29: encryption_part = self.add_padding(part_after)
  const paddedData = addPadding(Buffer.from(partAfter, 'ascii'));

  // Python line 32: encrypted_hex = self.encrypt(encryption_part, key)
  const encryptedHex = encryptAES(paddedData, encryptionKey);

  // Python line 36: before_and_after = f"{part_before}{encrypted_hex}"
  const beforeAndAfter = `${partBefore}${encryptedHex}`;

  // Python line 38: crc_hash = self.calculate_crc(before_and_after.encode())
  // Python line 125: return f"{crc_value_hex.upper()}{len(input_bytes):04X}"
  const crcArc = calculateCRC(beforeAndAfter);
  const lengthHex = beforeAndAfter.length.toString(16).toUpperCase().padStart(4, '0');
  const crcHash = `${crcArc}${lengthHex}`;

  // Python line 39: with_hash = f"{crc_hash}{before_and_after}"
  const withHash = `${crcHash}${beforeAndAfter}`;

  // Python line 41: with_line_feed_and_return = f"\r\n{with_hash}\r"
  const fullMessage = `\r\n${withHash}\r`;

  return {
    message: Buffer.from(fullMessage, 'ascii'),
    crc: crcArc,
    sequence: '0005',
    inputString,
    partBefore,
    partAfter
  };
}

/**
 * Build encrypted medical alarm message (matches Python SIA-ENCRYPTED.py exactly)
 */
function buildEncryptedMedicalAlarm(account, alertType, alertLevel, alertValue, encryptionKey) {
  const signalType = 'MA'; // Medical Alarm
  const zone = '001';

  const now = new Date();
  const datePart = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${now.getFullYear()}`;
  const timePart = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

  const alarmCommand = `Nri/${signalType}${zone}^${alertType}^${alertLevel}^${alertValue || ''}`;

  // Build input_string exactly like Python line 20:
  const inputString = `"*SIA-DCS"${formatSequence(sequenceNumber)}L0#${account}[${account}|${alarmCommand}]_${timePart},${datePart}`;

  const bracketIndex = inputString.indexOf('[');
  const partBefore = inputString.substring(0, bracketIndex + 1);
  const partAfter = '|' + inputString.substring(bracketIndex + 1);

  const paddedData = addPadding(Buffer.from(partAfter, 'ascii'));
  const encryptedHex = encryptAES(paddedData, encryptionKey);

  const beforeAndAfter = `${partBefore}${encryptedHex}`;

  const crcArc = calculateCRC(beforeAndAfter);
  const lengthHex = beforeAndAfter.length.toString(16).toUpperCase().padStart(4, '0');
  const crcHash = `${crcArc}${lengthHex}`;

  const withHash = `${crcHash}${beforeAndAfter}`;
  const fullMessage = `\r\n${withHash}\r`;

  sequenceNumber = (sequenceNumber + 1) % 65536;

  return {
    message: Buffer.from(fullMessage, 'ascii'),
    crc: crcArc,
    sequence: sequenceNumber - 1
  };
}

/**
 * Build plain medical alarm message
 */
function buildPlainMedicalAlarm(account, alertType, alertLevel, alertValue) {
  const signalType = 'MA';
  const zone = '001';
  const alarmData = `Nri/${signalType}${zone}^${alertType}^${alertLevel}^${alertValue || ''}`;

  const message = buildPlainMessage('SIA-DCS', sequenceNumber, 'L0', account, alarmData);
  const messageStr = message.toString('ascii');
  const crc = messageStr.substring(1, 5);

  sequenceNumber = (sequenceNumber + 1) % 65536;

  return {
    message,
    crc,
    sequence: sequenceNumber - 1
  };
}

// ============================================
// API ENDPOINTS
// ============================================

// Health check
fastify.get('/health', async (request, reply) => {
  return {
    status: 'ok',
    service: 'SIA DC-09 API',
    version: '1.0.0',
    alarm24: {
      host: ALARM24_CONFIG.host,
      port: ALARM24_CONFIG.port,
      clientId: ALARM24_CONFIG.account,
    }
  };
});

/**
 * POST /api/sia/alarm24/send-encrypted
 * Send encrypted alarm to Alarm24 - SAME FIELDS AS PYTHON
 * 
 * Body:
 * {
 *   "clientId": "555555",
 *   "signalType": "BA",
 *   "zone": "01",
 *   "latitude": 59.9139,
 *   "longitude": 10.7522
 * }
 */
fastify.post('/api/sia/alarm24/send-encrypted', async (request, reply) => {
  try {
    const {
      clientId = ALARM24_CONFIG.account,
      signalType = 'BA',
      zone = '01',
      latitude = 59.9139,
      longitude = 10.7522
    } = request.body || {};

    // Build message exactly like Python
    const result = buildEncryptedAlarmPython(
      clientId,
      signalType,
      zone,
      parseFloat(latitude),
      parseFloat(longitude),
      DEFAULT_ENCRYPTION_KEY
    );

    const response = {
      success: true,
      input: {
        clientId,
        signalType,
        zone,
        latitude,
        longitude,
        alarmCommand: `Nri/${signalType}${zone}`
      },
      message: {
        ascii: result.message.toString('ascii').replace(/\n/g, '\\n').replace(/\r/g, '\\r'),
        hex: result.message.toString('hex').toUpperCase(),
        crc: result.crc,
        length: result.message.length
      },
      debug: {
        inputString: result.inputString,
        partBefore: result.partBefore,
        partAfter: result.partAfter
      },
      receiver: {
        host: ALARM24_CONFIG.host,
        port: ALARM24_CONFIG.port
      }
    };

    // Send to Alarm24
    try {
      const tcpResponse = await sendTCPMessage(
        result.message,
        ALARM24_CONFIG.host,
        ALARM24_CONFIG.port,
        ALARM24_CONFIG.timeout
      );
      response.sent = true;
      response.tcpResponse = tcpResponse || 'No response (message may still be received)';
    } catch (error) {
      response.sent = false;
      response.error = error.message;
    }

    return response;

  } catch (error) {
    fastify.log.error(error);
    return reply.code(500).send({ error: error.message });
  }
});

/**
 * POST /api/sia/alarm24/test
 * Quick test endpoint - sends a test alarm to Alarm24
 */
fastify.post('/api/sia/alarm24/test', async (request, reply) => {
  try {
    const { type = 'plain', alertType = 'test', alertLevel = 'normal', alertValue = '' } = request.body || {};

    const account = ALARM24_CONFIG.account;
    let siaMessage, crc;

    if (type === 'encrypted') {
      const result = buildEncryptedMedicalAlarm(account, alertType, alertLevel, alertValue, DEFAULT_ENCRYPTION_KEY);
      siaMessage = result.message;
      crc = result.crc;
    } else {
      const result = buildPlainMedicalAlarm(account, alertType, alertLevel, alertValue);
      siaMessage = result.message;
      crc = result.crc;
    }

    const response = {
      success: true,
      type,
      account,
      message: {
        plain: siaMessage.toString('ascii').replace(/\n/g, '\\n').replace(/\r/g, '\\r'),
        hex: siaMessage.toString('hex').toUpperCase(),
        crc
      },
      receiver: {
        host: ALARM24_CONFIG.host,
        port: ALARM24_CONFIG.port
      }
    };

    // Send to Alarm24
    try {
      const tcpResponse = await sendTCPMessage(
        siaMessage,
        ALARM24_CONFIG.host,
        ALARM24_CONFIG.port,
        ALARM24_CONFIG.timeout
      );
      response.sent = true;
      response.tcpResponse = tcpResponse || 'No response (message may still be received)';
    } catch (error) {
      response.sent = false;
      response.error = error.message;
    }

    return response;

  } catch (error) {
    fastify.log.error(error);
    return reply.code(500).send({ error: error.message });
  }
});

/**
 * POST /api/sia/alarm24/send
 * Send medical alarm to Alarm24
 * 
 * Body:
 * {
 *   "type": "plain" or "encrypted",
 *   "alertType": "heart_rate",
 *   "alertLevel": "critical",
 *   "alertValue": "150",
 *   "account": "555555" (optional, uses default)
 * }
 */
fastify.post('/api/sia/alarm24/send', async (request, reply) => {
  try {
    const {
      type = 'plain',
      alertType = 'medical',
      alertLevel = 'normal',
      alertValue = '',
      account = ALARM24_CONFIG.account
    } = request.body || {};

    let siaMessage, crc, seq;

    if (type === 'encrypted') {
      const result = buildEncryptedMedicalAlarm(account, alertType, alertLevel, alertValue, DEFAULT_ENCRYPTION_KEY);
      siaMessage = result.message;
      crc = result.crc;
      seq = result.sequence;
    } else {
      const result = buildPlainMedicalAlarm(account, alertType, alertLevel, alertValue);
      siaMessage = result.message;
      crc = result.crc;
      seq = result.sequence;
    }

    const response = {
      success: true,
      alarm: {
        type,
        account,
        alertType,
        alertLevel,
        alertValue,
        sequence: seq
      },
      message: {
        plain: siaMessage.toString('ascii').replace(/\n/g, '\\n').replace(/\r/g, '\\r'),
        crc
      },
      receiver: {
        host: ALARM24_CONFIG.host,
        port: ALARM24_CONFIG.port
      }
    };

    // Send to Alarm24
    try {
      const tcpResponse = await sendTCPMessage(
        siaMessage,
        ALARM24_CONFIG.host,
        ALARM24_CONFIG.port,
        ALARM24_CONFIG.timeout
      );
      response.sent = true;
      response.tcpResponse = tcpResponse || 'No response';
    } catch (error) {
      response.sent = false;
      response.error = error.message;
    }

    return response;

  } catch (error) {
    fastify.log.error(error);
    return reply.code(500).send({ error: error.message });
  }
});

/**
 * POST /api/sia/plain
 * Send non-encrypted SIA message (original endpoint)
 */
fastify.post('/api/sia/plain', async (request, reply) => {
  try {
    const { receiver, message, send = false } = request.body;

    if (!message) {
      return reply.code(400).send({ error: 'Message object is required' });
    }

    const {
      protocolId = 'SIA-DCS',
      accountPrefix = 'L0',
      account = ALARM24_CONFIG.account,
      data,
      sequence = sequenceNumber
    } = message;

    if (!data) {
      return reply.code(400).send({ error: 'Data field is required' });
    }

    const siaMessage = buildPlainMessage(protocolId, sequence, accountPrefix, account, data);
    sequenceNumber = (sequenceNumber + 1) % 65536;

    const response = {
      success: true,
      message: {
        hex: siaMessage.toString('hex').toUpperCase(),
        ascii: siaMessage.toString('ascii').replace(/\r/g, '\\r').replace(/\n/g, '\\n'),
        length: siaMessage.length,
        sequence
      },
      sent: false
    };

    // Use Alarm24 as default receiver if not specified
    const targetReceiver = receiver || (send ? { host: ALARM24_CONFIG.host, port: ALARM24_CONFIG.port } : null);

    if (send && targetReceiver) {
      try {
        const tcpResponse = await sendTCPMessage(
          siaMessage,
          targetReceiver.host,
          targetReceiver.port,
          targetReceiver.timeout || ALARM24_CONFIG.timeout
        );
        response.sent = true;
        response.tcpResponse = tcpResponse;
        response.receiver = targetReceiver;
      } catch (error) {
        response.sent = false;
        response.error = error.message;
      }
    }

    return response;

  } catch (error) {
    fastify.log.error(error);
    return reply.code(500).send({ error: error.message });
  }
});

/**
 * POST /api/sia/encrypted
 * Send encrypted SIA message (original endpoint)
 */
fastify.post('/api/sia/encrypted', async (request, reply) => {
  try {
    const { receiver, message, encryption, send = false } = request.body;

    if (!message) {
      return reply.code(400).send({ error: 'Message object is required' });
    }

    const key = encryption?.key || DEFAULT_ENCRYPTION_KEY;

    const {
      protocolId = 'SIA-DCS',
      accountPrefix = 'L0',
      account = ALARM24_CONFIG.account,
      alarmCommand,
      latitude,
      longitude,
      sequence = sequenceNumber
    } = message;

    if (!alarmCommand) {
      return reply.code(400).send({ error: 'alarmCommand field is required' });
    }

    const now = new Date();
    const datePart = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${now.getFullYear()}`;
    const timePart = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    let coordinates = '';
    if (latitude !== undefined && longitude !== undefined) {
      coordinates = convertCoordinates(latitude, longitude);
    }

    const userIdStr = account.toString();
    const fullMessageString = `"*${protocolId}"${sequence.toString(16).toUpperCase().padStart(4, '0')}${accountPrefix}#${userIdStr}[${userIdStr}|${alarmCommand}]${coordinates}_${timePart},${datePart}`;

    const bracketIndex = fullMessageString.indexOf('[');
    const partBefore = fullMessageString.substring(0, bracketIndex + 1);
    const partAfter = '|' + fullMessageString.substring(bracketIndex + 1);

    const paddedData = addPadding(Buffer.from(partAfter, 'ascii'));
    const encryptedHex = encryptAES(paddedData, key);

    const messageBody = `${partBefore}${encryptedHex}]`;
    const length = messageBody.length;
    const lengthField = formatLength(length);
    const crcValue = calculateCRC(messageBody);
    const fullMessage = `\n${crcValue}${lengthField}${messageBody}\r`;
    const siaMessage = Buffer.from(fullMessage, 'ascii');

    sequenceNumber = (sequenceNumber + 1) % 65536;

    const response = {
      success: true,
      message: {
        hex: siaMessage.toString('hex').toUpperCase(),
        ascii: siaMessage.toString('ascii').replace(/\r/g, '\\r').replace(/\n/g, '\\n'),
        length: siaMessage.length,
        sequence,
        encrypted: true,
        coordinates: coordinates || null,
        timestamp: `${timePart}, ${datePart}`
      },
      sent: false
    };

    const targetReceiver = receiver || (send ? { host: ALARM24_CONFIG.host, port: ALARM24_CONFIG.port } : null);

    if (send && targetReceiver) {
      try {
        const tcpResponse = await sendTCPMessage(
          siaMessage,
          targetReceiver.host,
          targetReceiver.port,
          targetReceiver.timeout || ALARM24_CONFIG.timeout
        );
        response.sent = true;
        response.tcpResponse = tcpResponse;
        response.receiver = targetReceiver;
      } catch (error) {
        response.sent = false;
        response.error = error.message;
      }
    }

    return response;

  } catch (error) {
    fastify.log.error(error);
    return reply.code(500).send({ error: error.message });
  }
});

/**
 * GET /api/sia/config
 * Get current Alarm24 configuration
 */
fastify.get('/api/sia/config', async (request, reply) => {
  return {
    alarm24: ALARM24_CONFIG,
    encryptionKey: DEFAULT_ENCRYPTION_KEY.substring(0, 8) + '...',
    signalType: 'MA (Medical Alarm)'
  };
});

/**
 * POST /api/sia/demo
 * Generate demo messages
 */
fastify.post('/api/sia/demo', async (request, reply) => {
  try {
    const { type = 'both' } = request.body || {};
    const results = {};
    const account = ALARM24_CONFIG.account;

    if (type === 'plain' || type === 'both') {
      const result = buildPlainMedicalAlarm(account, 'test', 'normal', '');
      results.plain = {
        ascii: result.message.toString('ascii').replace(/\r/g, '\\r').replace(/\n/g, '\\n'),
        hex: result.message.toString('hex').toUpperCase(),
        crc: result.crc
      };
    }

    if (type === 'encrypted' || type === 'both') {
      const result = buildEncryptedMedicalAlarm(account, 'test', 'normal', '', DEFAULT_ENCRYPTION_KEY);
      results.encrypted = {
        ascii: result.message.toString('ascii').replace(/\r/g, '\\r').replace(/\n/g, '\\n'),
        hex: result.message.toString('hex').toUpperCase(),
        crc: result.crc
      };
    }

    return {
      success: true,
      account,
      demos: results
    };

  } catch (error) {
    fastify.log.error(error);
    return reply.code(500).send({ error: error.message });
  }
});

module.exports = fastify;
