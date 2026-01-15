/**
 * SIA-PLAIN.js
 * Non-encrypted SIA-DCS message sender
 * Interactive CLI tool for testing SIA-DCS messages
 */

const net = require('net');
const readline = require('readline');
const { buildPlainMessage, calculateCRC, formatLength } = require('./sia-utils');

// Sequence number tracker (should persist across messages)
let sequenceNumber = 1;

/**
 * Send SIA message via TCP
 * @param {Buffer} message - Complete message frame
 * @param {string} host - Receiver IP address
 * @param {number} port - Receiver port
 * @returns {Promise<string>} Response from server
 */
function sendSiaMessage(message, host, port) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    client.setTimeout(10000); // 10 second timeout
    
    client.connect(port, host, () => {
      console.log(`[TCP] Connected to ${host}:${port}`);
      console.log('Sent signal:', message.toString('ascii').replace(/\r/g, '\\r').replace(/\n/g, '\\n'));
      try {
        client.write(message);
        console.log(`[TCP] Sent ${message.length} bytes to ${host}:${port}`);
      } catch (err) {
        console.error(`[TCP] Error while sending to ${host}:${port}: ${err.message}`);
      }
    });
    
    client.on('data', (data) => {
      console.log('Received from server:', data.toString('ascii'));
      client.destroy();
      resolve(data.toString('ascii'));
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
    });
  });
}

/**
 * Clear console screen
 */
function clearScreen() {
  console.clear();
}

/**
 * Main program loop
 */
async function program() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const question = (query) => new Promise(resolve => rl.question(query, resolve));
  
  try {
    clearScreen();
    console.log('### SIA-DCS TESTER v1.0 (Node.js) ###\n');
    
    let host = '';
    let port = '';
    
    // Get receiver info
    host = await question('Enter receiver IP: ');
    port = parseInt(await question('Enter receiver port: '), 10);
    
    console.log('\n1. SIA-DCS (Auto Generated) | 2. SIA-DCS (Full String)');
    const inputType = await question('Select signal type: ');
    
    let messageBody = '';
    
    if (inputType === '1') {
      // Auto-generated mode
      const clientId = await question('Enter Client ID: ');
      const signalType = await question('Enter signal type (e.g., BA, PA, CL, OP, RP): ');
      const zone = await question('Enter zone number: ');
      
      let imageUrl = '';
      if (signalType === 'BA') {
        imageUrl = await question('Enter image URL: ');
      }
      
      // Build message data
      const signalData = `Nri1/${signalType}${zone}`;
      if (imageUrl) {
        messageBody = `${signalData}][V${imageUrl}]`;
      } else {
        messageBody = signalData;
      }
      
      // Build message using utility function
      const message = buildPlainMessage('SIA-DCS', sequenceNumber, 'L0', clientId, messageBody);
      sequenceNumber = (sequenceNumber + 1) % 65536; // Wrap at 65535
      
      await sendSiaMessage(message, host, port);
      
    } else if (inputType === '2') {
      // Full string mode
      console.log('Example string: "SIA-DCS"0001L0#1234[1234|Nri1/RP0]');
      const fullString = await question('Enter full SIA string: ');
      
      // Parse the full string to extract components
      // Format: "SIA-DCS"0001L0#1234[1234|Nri1/RP0]
      const match = fullString.match(/^"([^"]+)"(\d{4})(L\d+)#(\d+)\[(\d+)\|(.+)\]$/);
      
      if (match) {
        const [, id, seq, accountPrefix, account, accountInData, data] = match;
        const message = buildPlainMessage(id, parseInt(seq, 16), accountPrefix, account, data);
        await sendSiaMessage(message, host, port);
      } else {
        // If parsing fails, try to send as-is (legacy behavior)
        console.log('Warning: Could not parse string, sending as-is...');
        const data = fullString;
        const crcValue = calculateCRC(data);
        const lengthField = formatLength(data.length);
        const messageBody = Buffer.from(`\n${crcValue}${lengthField}${data}\r`, 'ascii');
        await sendSiaMessage(messageBody, host, port);
      }
    } else {
      console.log('Invalid selection. Please choose 1 or 2.');
      rl.close();
      return;
    }
    
    // Ask if user wants to send another message
    const check = await question('\nSend new signal? y/n: ');
    rl.close();
    
    if (check.toLowerCase() === 'y') {
      await program();
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    rl.close();
  }
}

// Signal types reference:
// BA - Burglar Alarm (can include image URL)
// PA - Panic Alarm
// PR - Panic Restore
// CL - Close/Set
// OP - Open/Unset
// RP - Test Report

// Run program
if (require.main === module) {
  program().catch(console.error);
}

module.exports = { sendSiaMessage, program };

