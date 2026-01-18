/**
 * Compare Node.js output with Python output
 */

const { 
  addPadding, 
  encryptAES, 
  calculateCRC, 
  convertCoordinates 
} = require('./src/sia-utils');

// Test values - same as we'd use in Python
const clientId = '555555';
const signalType = 'BA';
const zone = '01';
const latitude = 59.9139;  // User enters as Latitude
const longitude = 10.7522;  // User enters as Longitude
const key = '4B38665033516D3741325A7839524465';

// Fixed timestamp for comparison
const timePart = '12:00:00';
const datePart = '01-18-2026';

const alarmCommand = `Nri/${signalType}${zone}`;

console.log('=== Test Parameters ===');
console.log('ClientID:', clientId);
console.log('Alarm Command:', alarmCommand);
console.log('Latitude:', latitude);
console.log('Longitude:', longitude);
console.log('');

// Python's convert_coordinates receives (latitude, longitude) from send_alarm
// But send_alarm's params are named (longitude, latitude) - they're swapped in main()!
// main() calls: send_alarm(..., float(PosistionLat), float(PositionLong), ...)
// send_alarm signature: send_alarm(alarm_command, user_id, longitude, latitude, ...)
// So: PosistionLat goes to "longitude" param, PositionLong goes to "latitude" param
// Then convert_coordinates(latitude, longitude) uses the swapped values

// In Python's convert_coordinates:
// - longitude param (which is actually user's PositionLong=10.7522) -> X format
// - latitude param (which is actually user's PosistionLat=59.9139) -> Y format

// So the actual Python logic for coordinates:
// X format uses: what user entered as Longitude (10.7522)
// Y format uses: what user entered as Latitude (59.9139)

// Let's trace Python more carefully:
// main(): PosistionLat=59.9139, PositionLong=10.7522
// main() calls: send_alarm(..., float(PosistionLat), float(PositionLong), ...)
//                              = send_alarm(..., 59.9139, 10.7522, ...)
// send_alarm signature: send_alarm(alarm_command, user_id, longitude, latitude, ...)
// So: longitude=59.9139, latitude=10.7522
// Then: convert_coordinates(latitude, longitude) = convert_coordinates(10.7522, 59.9139)
// In convert_coordinates(latitude, longitude):
//   lon_value = longitude = 59.9139
//   lat_value = latitude = 10.7522
// So X format uses 59.9139 (labeled as lon but is actually lat)
// And Y format uses 10.7522 (labeled as lat but is actually lon)

// This matches Python's buggy parameter naming
// Python passes (lat, lon) to (longitude, latitude) params in send_alarm
// Then convert_coordinates(latitude, longitude) makes X use the "longitude" (which is lat) 
// and Y use the "latitude" (which is lon)
// So we call convertCoordinates(longitude, latitude) to match this behavior
console.log('=== Python Behavior (Matching the swap) ===');
const pythonCoords = convertCoordinates(longitude, latitude);  // Match Python: (10.7522, 59.9139)
console.log('Python-style Coordinates:', pythonCoords);

// Build input_string like Python
const inputString = `"*SIA-DCS"0005L0#${clientId}[${clientId}|${alarmCommand}]${pythonCoords}_${timePart},${datePart}`;
console.log('Input String:', inputString);

// Split at '['
const bracketIndex = inputString.indexOf('[');
const partBefore = inputString.substring(0, bracketIndex + 1);
const partAfter = '|' + inputString.substring(bracketIndex + 1);
console.log('Part Before:', partBefore);
console.log('Part After:', partAfter);

// Padding
const paddedData = addPadding(Buffer.from(partAfter, 'ascii'));
console.log('Padded (ASCII):', paddedData.toString('ascii'));
console.log('Padded (Hex):', paddedData.toString('hex'));

// Encrypt
const encryptedHex = encryptAES(paddedData, key);
console.log('Encrypted Hex:', encryptedHex);

// Combine
const beforeAndAfter = `${partBefore}${encryptedHex}`;
console.log('Before+After:', beforeAndAfter);

// CRC and Length
const crcArc = calculateCRC(beforeAndAfter);
const lengthHex = beforeAndAfter.length.toString(16).toUpperCase().padStart(4, '0');
console.log('CRC:', crcArc);
console.log('Length:', lengthHex);
console.log('CRC+Length:', crcArc + lengthHex);

// Final message
const withHash = `${crcArc}${lengthHex}${beforeAndAfter}`;
const fullMessage = `\r\n${withHash}\r`;
console.log('');
console.log('=== Final Message ===');
console.log('ASCII (escaped):', fullMessage.replace(/\r/g, '\\r').replace(/\n/g, '\\n'));
console.log('Hex:', Buffer.from(fullMessage, 'ascii').toString('hex').toUpperCase());
console.log('Length:', fullMessage.length, 'bytes');
