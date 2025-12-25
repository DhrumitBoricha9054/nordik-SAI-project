/**
 * SIA-ENCRYPTED.js
 * Encrypted SIA-DCS message sender with GPS coordinates
 * Sends encrypted alarm messages with timestamp and location data
 */

const net = require('net');
const readline = require('readline');
const { buildEncryptedMessage, convertCoordinates } = require('./sia-utils');

// Sequence number tracker
let sequenceNumber = 1;

/**
 * Send encrypted SIA message via TCP
 * @param {Buffer} message - Complete encrypted message frame
 * @param {string} host - Receiver IP address
 * @param {number} port - Receiver port
 * @returns {Promise<string>} Response from server
 */
function sendEncryptedMessage(message, host, port) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    client.setTimeout(5000); // 5 second timeout
    
    client.connect(port, host, () => {
      console.log('Sent encrypted message:', message.toString('ascii').replace(/\r/g, '\\r').replace(/\n/g, '\\n'));
      client.write(message);
    });
    
    client.on('data', (data) => {
      console.log('Received from server:', data.toString('ascii'));
      client.destroy();
      resolve(data.toString('ascii'));
    });
    
    client.on('error', (err) => {
      console.error('Error:', err.message);
      client.destroy();
      reject(err);
    });
    
    client.on('timeout', () => {
      console.error('Connection timeout');
      client.destroy();
      reject(new Error('Connection timeout'));
    });
    
    client.on('close', () => {
      // Connection closed
    });
  });
}

/**
 * Send alarm with encrypted message
 * @param {string} alarmCommand - Alarm command (e.g., "Nri/BA01")
 * @param {number} userId - User/Account ID
 * @param {number} longitude - Longitude in decimal degrees
 * @param {number} latitude - Latitude in decimal degrees
 * @param {string} key - Encryption key (hex string)
 * @param {string} host - Receiver IP address
 * @param {number} port - Receiver port
 * @returns {Promise<string>} Response from server
 */
async function sendAlarm(alarmCommand, userId, longitude, latitude, key, host, port) {
  // Get current timestamp
  const now = new Date();
  const datePart = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${now.getFullYear()}`;
  const timePart = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  
  // Convert coordinates to SIA format
  const coordinates = convertCoordinates(latitude, longitude);
  
  // Build the full message string first (matching Python script logic)
  // Format: "*SIA-DCS"0005L0#{userId}[{userId}|{alarmCommand}]{coordinates}_{time},{date}
  const userIdStr = userId.toString();
  const fullMessageString = `"*SIA-DCS"${sequenceNumber.toString(16).toUpperCase().padStart(4, '0')}L0#${userIdStr}[${userIdStr}|${alarmCommand}]${coordinates}_${timePart},${datePart}`;
  
  // Split at '[' to separate header from data (matching Python script)
  const bracketIndex = fullMessageString.indexOf('[');
  const partBefore = fullMessageString.substring(0, bracketIndex + 1); // Includes '['
  const partAfter = '|' + fullMessageString.substring(bracketIndex + 1); // Adds '|' prefix
  
  // Pad and encrypt the data part
  const { addPadding, encryptAES } = require('./sia-utils');
  const paddedData = addPadding(Buffer.from(partAfter, 'ascii'));
  const encryptedHex = encryptAES(paddedData, key);
  
  // Build final message: partBefore + encryptedHex
  const messageBody = `${partBefore}${encryptedHex}]`;
  
  // Calculate length and CRC
  const { calculateCRC, formatLength } = require('./sia-utils');
  const length = messageBody.length;
  const lengthField = formatLength(length);
  const crcValue = calculateCRC(messageBody);
  
  // Build complete message: LF + CRC + 0LLL + message body + CR
  const fullMessage = `\n${crcValue}${lengthField}${messageBody}\r`;
  const message = Buffer.from(fullMessage, 'ascii');
  
  // Increment sequence number (wrap at 65535)
  sequenceNumber = (sequenceNumber + 1) % 65536;
  
  // Send message
  const response = await sendEncryptedMessage(message, host, port);
  return response || 'No data from receiver';
}

/**
 * Main program
 */
async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const question = (query) => new Promise(resolve => rl.question(query, resolve));
  
  try {
    // Default values (can be overridden)
    const defaultKey = '594162417237323352466D3964673233';
    const defaultHost = '1.1.1.1';
    const defaultPort = 1000;
    
    console.log('### SIA-ENCRYPTED Message Sender ###\n');
    
    const clientId = await question('ClientID: ');
    const signalType = await question('SignalType (e.g., BA, PA, CL, OP, RP): ');
    const zone = await question('Zone: ');
    const latitude = parseFloat(await question('Latitude: '));
    const longitude = parseFloat(await question('Longitude: '));
    
    // Optional: allow override of key, host, port
    const useDefaults = await question('Use default settings? (y/n) [y]: ');
    let key = defaultKey;
    let host = defaultHost;
    let port = defaultPort;
    
    if (useDefaults.toLowerCase() !== 'y' && useDefaults !== '') {
      key = await question(`Encryption key (hex) [${defaultKey}]: `) || defaultKey;
      host = await question(`Receiver IP [${defaultHost}]: `) || defaultHost;
      port = parseInt(await question(`Receiver port [${defaultPort}]: `) || defaultPort, 10);
    }
    
    const alarmCommand = `Nri/${signalType}${zone}`;
    
    console.log('\nSending encrypted alarm...');
    const result = await sendAlarm(
      alarmCommand,
      parseInt(clientId, 10),
      longitude,
      latitude,
      key,
      host,
      port
    );
    
    console.log('\nResult:', result);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    rl.close();
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { sendAlarm, sendEncryptedMessage };

