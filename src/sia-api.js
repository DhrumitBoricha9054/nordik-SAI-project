/**
 * SIA DC-09 HTTP API
 * REST API wrapper for SIA DC-09 message sending
 * Allows testing via Postman or other HTTP clients
 */

const fastify = require('fastify')({
  logger: true
});

const {
  buildPlainMessage,
  buildEncryptedMessage,
  convertCoordinates,
  calculateCRC,
  formatLength
} = require('./sia-utils');

// Sequence number tracker (in-memory, should be persisted in production)
let sequenceNumber = 1;

/**
 * Send TCP message helper
 */
function sendTCPMessage(message, host, port, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const net = require('net');
    const client = new net.Socket();
    client.setTimeout(timeout);

    let responseData = Buffer.alloc(0);

    client.connect(port, host, () => {
      client.write(message);
    });

    client.on('data', (data) => {
      responseData = Buffer.concat([responseData, data]);
    });

    client.on('error', (err) => {
      client.destroy();
      reject(err);
    });

    client.on('timeout', () => {
      client.destroy();
      reject(new Error('Connection timeout'));
    });

    client.on('close', () => {
      resolve(responseData.length > 0 ? responseData.toString('ascii') : null);
    });
  });
}

// Health check
fastify.get('/health', async (request, reply) => {
  return {
    status: 'ok',
    service: 'SIA DC-09 API',
    version: '1.0.0'
  };
});

/**
 * POST /api/sia/plain
 * Send non-encrypted SIA message
 * 
 * Body:
 * {
 *   "receiver": { "host": "192.168.1.100", "port": 1000 },
 *   "message": {
 *     "protocolId": "SIA-DCS",
 *     "accountPrefix": "L0",
 *     "account": "1234",
 *     "data": "Nri1/BA01"
 *   },
 *   "send": true  // if false, just returns the message without sending
 * }
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
      account,
      data,
      sequence = sequenceNumber
    } = message;

    if (!account || !data) {
      return reply.code(400).send({
        error: 'Account and data fields are required'
      });
    }

    // Build message
    const siaMessage = buildPlainMessage(
      protocolId,
      sequence,
      accountPrefix,
      account,
      data
    );

    // Increment sequence number
    sequenceNumber = (sequenceNumber + 1) % 65536;

    const response = {
      success: true,
      message: {
        hex: siaMessage.toString('hex').toUpperCase(),
        ascii: siaMessage.toString('ascii').replace(/\r/g, '\\r').replace(/\n/g, '\\n'),
        length: siaMessage.length,
        sequence: sequence
      },
      sent: false
    };

    // Send if requested
    if (send && receiver) {
      if (!receiver.host || !receiver.port) {
        return reply.code(400).send({
          error: 'Receiver host and port are required when send=true'
        });
      }

      try {
        const tcpResponse = await sendTCPMessage(
          siaMessage,
          receiver.host,
          receiver.port,
          receiver.timeout || 5000
        );

        response.sent = true;
        response.tcpResponse = tcpResponse;
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
 * Send encrypted SIA message with GPS coordinates
 * 
 * Body:
 * {
 *   "receiver": { "host": "192.168.1.100", "port": 1000 },
 *   "message": {
 *     "protocolId": "SIA-DCS",
 *     "accountPrefix": "L0",
 *     "account": "1234",
 *     "alarmCommand": "Nri/BA01",
 *     "latitude": 59.9139,
 *     "longitude": 10.7522
 *   },
 *   "encryption": {
 *     "key": "594162417237323352466D3964673233"
 *   },
 *   "send": true
 * }
 */
fastify.post('/api/sia/encrypted', async (request, reply) => {
  try {
    const { receiver, message, encryption, send = false } = request.body;

    if (!message) {
      return reply.code(400).send({ error: 'Message object is required' });
    }

    if (!encryption || !encryption.key) {
      return reply.code(400).send({ error: 'Encryption key is required' });
    }

    const {
      protocolId = 'SIA-DCS',
      accountPrefix = 'L0',
      account,
      alarmCommand,
      latitude,
      longitude,
      sequence = sequenceNumber
    } = message;

    if (!account || !alarmCommand) {
      return reply.code(400).send({
        error: 'Account and alarmCommand fields are required'
      });
    }

    // Get timestamp
    const now = new Date();
    const datePart = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${now.getFullYear()}`;
    const timePart = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    // Convert coordinates if provided
    let coordinates = '';
    if (latitude !== undefined && longitude !== undefined) {
      coordinates = convertCoordinates(latitude, longitude);
    }

    // Build encrypted message (matching sia-encrypted.js logic)
    const userIdStr = account.toString();
    const data = `${alarmCommand}]${coordinates}_${timePart},${datePart}`;
    const fullMessageString = `"*${protocolId}"${sequence.toString(16).toUpperCase().padStart(4, '0')}${accountPrefix}#${userIdStr}[${userIdStr}|${alarmCommand}]${coordinates}_${timePart},${datePart}`;

    const bracketIndex = fullMessageString.indexOf('[');
    const partBefore = fullMessageString.substring(0, bracketIndex + 1);
    const partAfter = '|' + fullMessageString.substring(bracketIndex + 1);

    // Encrypt
    const { addPadding, encryptAES } = require('./sia-utils');
    const paddedData = addPadding(Buffer.from(partAfter, 'ascii'));
    const encryptedHex = encryptAES(paddedData, encryption.key);

    const messageBody = `${partBefore}${encryptedHex}]`;
    const length = messageBody.length;
    const lengthField = formatLength(length);
    const crcValue = calculateCRC(messageBody);
    const fullMessage = `\n${crcValue}${lengthField}${messageBody}\r`;
    const siaMessage = Buffer.from(fullMessage, 'ascii');

    // Increment sequence number
    sequenceNumber = (sequenceNumber + 1) % 65536;

    const response = {
      success: true,
      message: {
        hex: siaMessage.toString('hex').toUpperCase(),
        ascii: siaMessage.toString('ascii').replace(/\r/g, '\\r').replace(/\n/g, '\\n'),
        length: siaMessage.length,
        sequence: sequence,
        encrypted: true,
        coordinates: coordinates || null,
        timestamp: `${timePart}, ${datePart}`
      },
      sent: false
    };

    // Send if requested
    if (send && receiver) {
      if (!receiver.host || !receiver.port) {
        return reply.code(400).send({
          error: 'Receiver host and port are required when send=true'
        });
      }

      try {
        const tcpResponse = await sendTCPMessage(
          siaMessage,
          receiver.host,
          receiver.port,
          receiver.timeout || 5000
        );

        response.sent = true;
        response.tcpResponse = tcpResponse;
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
 * GET /api/sia/message/analyze
 * Analyze a message without sending
 * Query params: type (plain|encrypted), and message fields
 */
fastify.get('/api/sia/message/analyze', async (request, reply) => {
  try {
    const { type = 'plain' } = request.query;

    if (type === 'plain') {
      const { protocolId = 'SIA-DCS', accountPrefix = 'L0', account, data, sequence = 1 } = request.query;

      if (!account || !data) {
        return reply.code(400).send({
          error: 'Account and data query parameters are required'
        });
      }

      const message = buildPlainMessage(
        protocolId,
        parseInt(sequence, 10),
        accountPrefix,
        account,
        data
      );

      const messageStr = message.toString('ascii');
      const crc = messageStr.substring(1, 5);
      const length = messageStr.substring(5, 9);

      return {
        type: 'plain',
        message: {
          hex: message.toString('hex').toUpperCase(),
          ascii: messageStr.replace(/\r/g, '\\r').replace(/\n/g, '\\n'),
          length: message.length,
          breakdown: {
            lf: message[0] === 0x0A,
            crc,
            lengthField: length,
            cr: message[message.length - 1] === 0x0D
          }
        }
      };
    }

    return reply.code(400).send({ error: 'Invalid type. Use "plain" or "encrypted"' });

  } catch (error) {
    fastify.log.error(error);
    return reply.code(500).send({ error: error.message });
  }
});

/**
 * POST /api/sia/demo
 * Generate demo messages without sending
 */
fastify.post('/api/sia/demo', async (request, reply) => {
  try {
    const { type = 'both' } = request.body;
    const results = {};

    if (type === 'plain' || type === 'both') {
      const plainMessage = buildPlainMessage('SIA-DCS', 1, 'L0', '1234', 'Nri1/BA01');
      results.plain = {
        hex: plainMessage.toString('hex').toUpperCase(),
        ascii: plainMessage.toString('ascii').replace(/\r/g, '\\r').replace(/\n/g, '\\n'),
        length: plainMessage.length
      };
    }

    if (type === 'encrypted' || type === 'both') {
      // Encrypted demo
      const key = '594162417237323352466D3964673233';
      const account = '1234';
      const alarmCommand = 'Nri/BA01';
      const latitude = 59.9139;
      const longitude = 10.7522;

      const now = new Date();
      const datePart = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${now.getFullYear()}`;
      const timePart = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

      const coordinates = convertCoordinates(latitude, longitude);
      const userIdStr = account.toString();
      const fullMessageString = `"*SIA-DCS"0001L0#${userIdStr}[${userIdStr}|${alarmCommand}]${coordinates}_${timePart},${datePart}`;

      const bracketIndex = fullMessageString.indexOf('[');
      const partBefore = fullMessageString.substring(0, bracketIndex + 1);
      const partAfter = '|' + fullMessageString.substring(bracketIndex + 1);

      const { addPadding, encryptAES } = require('./sia-utils');
      const paddedData = addPadding(Buffer.from(partAfter, 'ascii'));
      const encryptedHex = encryptAES(paddedData, key);

      const messageBody = `${partBefore}${encryptedHex}]`;
      const length = messageBody.length;
      const lengthField = formatLength(length);
      const crcValue = calculateCRC(messageBody);
      const fullMessage = `\n${crcValue}${lengthField}${messageBody}\r`;
      const encryptedMessage = Buffer.from(fullMessage, 'ascii');

      results.encrypted = {
        hex: encryptedMessage.toString('hex').toUpperCase(),
        ascii: encryptedMessage.toString('ascii').replace(/\r/g, '\\r').replace(/\n/g, '\\n'),
        length: encryptedMessage.length,
        coordinates,
        timestamp: `${timePart}, ${datePart}`
      };
    }

    return {
      success: true,
      demos: results
    };

  } catch (error) {
    fastify.log.error(error);
    return reply.code(500).send({ error: error.message });
  }
});

module.exports = fastify;

