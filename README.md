# SIA DC-09 Message Sender (Node.js)

Node.js implementation of SIA DC-09-2013 compliant message senders for testing and integration.

## Overview

This project provides two command-line tools for sending SIA-DCS messages:

1. **SIA-PLAIN.js** - Sends non-encrypted SIA-DCS messages
2. **SIA-ENCRYPTED.js** - Sends encrypted SIA-DCS messages with GPS coordinates

Both tools are DC-09 compliant and include fixes for standard compliance issues found in the original Python scripts.

## Installation

```bash
npm install
```

## Usage

### SIA-PLAIN.js - Non-Encrypted Messages

Interactive CLI tool for sending non-encrypted SIA-DCS messages.

```bash
npm run sia-plain
```

**Features:**
- Auto-generated messages (option 1)
- Full string input (option 2)
- Supports all signal types (BA, PA, PR, CL, OP, RP)
- Image URL support for BA (Burglar Alarm) signals

**Example Signal Types:**
- `BA` - Burglar Alarm (can include image URL)
- `PA` - Panic Alarm
- `PR` - Panic Restore
- `CL` - Close/Set
- `OP` - Open/Unset
- `RP` - Test Report

### SIA-ENCRYPTED.js - Encrypted Messages

Sends encrypted SIA-DCS alarm messages with GPS coordinates and timestamps.

```bash
npm run sia-encrypted
```

**Features:**
- AES-128-CBC encryption
- GPS coordinate formatting
- Automatic timestamp generation
- Sequence number tracking

**Input Required:**
- Client ID
- Signal Type (e.g., BA, PA, CL, OP, RP)
- Zone number
- Latitude (decimal degrees)
- Longitude (decimal degrees)
- Encryption key (hex string, optional - defaults provided)
- Receiver IP and port (optional - defaults provided)

## DC-09 Compliance Fixes

The Node.js implementation includes the following DC-09 standard compliance fixes:

1. ✅ **Line Feed Format** - Uses `\n` (LF) instead of `\r\n` (CRLF)
2. ✅ **CRC Format** - Properly formatted as 4 ASCII hex characters
3. ✅ **Length Field** - Correct `0LLL` format (4 characters: "0" + 3 hex digits)
4. ✅ **Sequence Numbers** - Variable sequence numbers (0000-FFFF) with proper tracking
5. ✅ **Padding** - Pseudo-random padding bytes (excluding `|`, `[`, `]`)
6. ✅ **Encryption** - AES-CBC with zero IV as per standard
7. ✅ **Message Structure** - Proper DC-09 message frame format

## Project Structure

```
src/
├── sia-utils.js       # Shared utilities (CRC, encryption, formatting)
├── sia-plain.js       # Non-encrypted message sender
├── sia-encrypted.js   # Encrypted message sender
└── server.js          # Fastify API server
```

## Message Format

### Non-Encrypted Format
```
<LF><CRC><0LLL><"id"><seq><Rrcvr><Lpref><#acct>[Data]<CR>
```

### Encrypted Format
```
<LF><CRC><0LLL><"*id"><seq><Rrcvr><Lpref><#acct>[<pad>|encrypted_data]<CR>
```

Where:
- `LF` = Line Feed (`\n`)
- `CRC` = 4-character hexadecimal CRC-16 ARC
- `0LLL` = Length field (4 chars: "0" + 3 hex digits)
- `id` = Protocol identifier (e.g., "SIA-DCS")
- `seq` = Sequence number (4 hex digits)
- `Rrcvr` = Receiver number (optional)
- `Lpref` = Account prefix (e.g., "L0")
- `#acct` = Account number
- `CR` = Carriage Return (`\r`)

## Dependencies

- `crc` - CRC-16 ARC calculation
- `net` - TCP socket communication (built-in)
- `crypto` - AES encryption (built-in)
- `readline` - CLI interface (built-in)

## Example Usage

### Non-Encrypted Example
```bash
$ npm run sia-plain
### SIA-DCS TESTER v1.0 (Node.js) ###

Enter receiver IP: 192.168.1.100
Enter receiver port: 1000

1. SIA-DCS (Auto Generated) | 2. SIA-DCS (Full String)
Select signal type: 1
Enter Client ID: 1234
Enter signal type (e.g., BA, PA, CL, OP, RP): BA
Enter zone number: 01
Enter image URL: https://example.com/image.jpg
```

### Encrypted Example
```bash
$ npm run sia-encrypted
### SIA-ENCRYPTED Message Sender ###

ClientID: 1234
SignalType: BA
Zone: 01
Latitude: 59.9139
Longitude: 10.7522
Use default settings? (y/n) [y]: y
```

## API Usage

You can also import and use these modules programmatically:

```javascript
const { sendSiaMessage } = require('./src/sia-plain');
const { buildPlainMessage } = require('./src/sia-utils');

const message = buildPlainMessage('SIA-DCS', 1, 'L0', '1234', 'Nri1/BA01');
sendSiaMessage(message, '192.168.1.100', 1000);
```

## References

- ANSI/SIA DC-09-2013: Internet Protocol Event Reporting
- SIA DC-07: Protocol Identifier Tokens

## License

Private project - All rights reserved

