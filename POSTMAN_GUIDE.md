# Postman Testing Guide for SIA DC-09 API

## 🚀 Quick Start

1. **Start the API server:**
   ```bash
   npm start
   # Server runs on http://localhost:3000
   ```

2. **Import these endpoints into Postman**

---

## 📡 API Endpoints

### 1. Health Check
**GET** `http://localhost:3000/health`

**Response:**
```json
{
  "status": "ok",
  "service": "SIA DC-09 API",
  "version": "1.0.0"
}
```

---

### 2. Send Non-Encrypted Message

**POST** `http://localhost:3000/api/sia/plain`

**Body (JSON):**
```json
{
  "receiver": {
    "host": "192.168.1.100",
    "port": 1000,
    "timeout": 5000
  },
  "message": {
    "protocolId": "SIA-DCS",
    "accountPrefix": "L0",
    "account": "1234",
    "data": "Nri1/BA01",
    "sequence": 1
  },
  "send": true
}
```

**Response:**
```json
{
  "success": true,
  "message": {
    "hex": "0A4E670024225349412D44435322303030314C3023313233345B313233347C4E7269312F424130315D0D",
    "ascii": "\\n4E670024\"SIA-DCS\"0001L0#1234[1234|Nri1/BA01]\\r",
    "length": 46,
    "sequence": 1
  },
  "sent": true,
  "tcpResponse": "ACK..."
}
```

**To generate message WITHOUT sending:**
Set `"send": false` or omit `receiver` object.

---

### 3. Send Encrypted Message

**POST** `http://localhost:3000/api/sia/encrypted`

**Body (JSON):**
```json
{
  "receiver": {
    "host": "192.168.1.100",
    "port": 1000,
    "timeout": 5000
  },
  "message": {
    "protocolId": "SIA-DCS",
    "accountPrefix": "L0",
    "account": "1234",
    "alarmCommand": "Nri/BA01",
    "latitude": 59.9139,
    "longitude": 10.7522,
    "sequence": 1
  },
  "encryption": {
    "key": "594162417237323352466D3964673233"
  },
  "send": true
}
```

**Response:**
```json
{
  "success": true,
  "message": {
    "hex": "0A586400D7222A5349412D44435322303030314C3023313233345B...",
    "ascii": "\\n586400D7\"*SIA-DCS\"0001L0#1234[76342658D25127E09E2F...]\\r",
    "length": 225,
    "sequence": 1,
    "encrypted": true,
    "coordinates": "[X010E45.13200000][Y59N54.83400000]",
    "timestamp": "14:30:45, 12-15-2025"
  },
  "sent": true,
  "tcpResponse": "ACK..."
}
```

---

### 4. Analyze Message (No Sending)

**GET** `http://localhost:3000/api/sia/message/analyze?type=plain&account=1234&data=Nri1/BA01&sequence=1`

**Query Parameters:**
- `type`: `plain` or `encrypted`
- `protocolId`: Protocol ID (default: `SIA-DCS`)
- `accountPrefix`: Account prefix (default: `L0`)
- `account`: Account number (required)
- `data`: Message data (required)
- `sequence`: Sequence number (default: `1`)

**Response:**
```json
{
  "type": "plain",
  "message": {
    "hex": "0A4E670024225349412D44435322303030314C3023313233345B313233347C4E7269312F424130315D0D",
    "ascii": "\\n4E670024\"SIA-DCS\"0001L0#1234[1234|Nri1/BA01]\\r",
    "length": 46,
    "breakdown": {
      "lf": true,
      "crc": "4E67",
      "lengthField": "0024",
      "cr": true
    }
  }
}
```

---

### 5. Generate Demo Messages

**POST** `http://localhost:3000/api/sia/demo`

**Body (JSON):**
```json
{
  "type": "both"
}
```

**Options for `type`:**
- `"plain"` - Generate plain message only
- `"encrypted"` - Generate encrypted message only
- `"both"` - Generate both (default)

**Response:**
```json
{
  "success": true,
  "demos": {
    "plain": {
      "hex": "0A4E670024225349412D44435322303030314C3023313233345B313233347C4E7269312F424130315D0D",
      "ascii": "\\n4E670024\"SIA-DCS\"0001L0#1234[1234|Nri1/BA01]\\r",
      "length": 46
    },
    "encrypted": {
      "hex": "0A586400D7222A5349412D44435322303030314C3023313233345B...",
      "ascii": "\\n586400D7\"*SIA-DCS\"0001L0#1234[76342658D25127E09E2F...]\\r",
      "length": 225,
      "coordinates": "[X010E45.13200000][Y59N54.83400000]",
      "timestamp": "14:30:45, 12-15-2025"
    }
  }
}
```

---

## 📋 Postman Collection Examples

### Example 1: Test Plain Message (No Sending)
```json
POST http://localhost:3000/api/sia/plain
Content-Type: application/json

{
  "message": {
    "account": "1234",
    "data": "Nri1/BA01"
  },
  "send": false
}
```

### Example 2: Test Encrypted Message (No Sending)
```json
POST http://localhost:3000/api/sia/encrypted
Content-Type: application/json

{
  "message": {
    "account": "1234",
    "alarmCommand": "Nri/BA01",
    "latitude": 59.9139,
    "longitude": 10.7522
  },
  "encryption": {
    "key": "594162417237323352466D3964673233"
  },
  "send": false
}
```

### Example 3: Send to Real Receiver
```json
POST http://localhost:3000/api/sia/plain
Content-Type: application/json

{
  "receiver": {
    "host": "YOUR_RECEIVER_IP",
    "port": 1000
  },
  "message": {
    "account": "YOUR_ACCOUNT",
    "data": "Nri1/RP0"
  },
  "send": true
}
```

---

## 🎯 Signal Types

Use these in the `data` or `alarmCommand` field:

- **BA** - Burglar Alarm: `Nri1/BA01`
- **PA** - Panic Alarm: `Nri1/PA001`
- **PR** - Panic Restore: `Nri1/PR001`
- **CL** - Close/Set: `Nri1/CL001`
- **OP** - Open/Unset: `Nri1/OP001`
- **RP** - Test Report: `Nri1/RP0`

---

## 🔍 Testing Tips

1. **Start with `send: false`** to see the message format without connecting
2. **Use `/api/sia/demo`** to see example messages
3. **Check `/health`** to verify server is running
4. **Use `/api/sia/message/analyze`** to inspect message structure

---

## ⚠️ Notes

- **Sequence numbers** are auto-incremented per request
- **Timestamps** are generated automatically for encrypted messages
- **GPS coordinates** are optional for encrypted messages
- **TCP connection** timeout defaults to 5000ms (5 seconds)
- Set `send: false` to generate messages without connecting to receiver

---

## 📸 Screenshot Checklist

For your friend, show:
1. ✅ Health check endpoint
2. ✅ Plain message generation (send: false)
3. ✅ Encrypted message generation (send: false)
4. ✅ Demo endpoint output
5. ✅ Message breakdown/analysis

---

*Happy Testing! 🚀*

