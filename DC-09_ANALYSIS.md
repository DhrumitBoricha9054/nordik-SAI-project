# DC-09 Standard Compliance Analysis

## Overview
This document analyzes the SIA-ENCRYPTED.py and SIA-PLAIN.py scripts against the ANSI/SIA DC-09-2013 standard for Internet Protocol Event Reporting.

## DC-09 Standard Message Format

### Non-Encrypted Message Format (Section 5.5.1)
```
<LF><CRC><0LLL><"id"><seq><Rrcvr><Lpref><#acct>[Data][x..data...]<timestamp><CR>
```

### Encrypted Message Format (Section 5.4)
```
<LF><CRC><0LLL><"*id"><seq><Rrcvr><Lpref><#acct>[<pad>|encrypted data]<encrypted timestamp><CR>
```

### Field Definitions
- **LF**: Line Feed (ASCII 0x0A, `\n`)
- **CRC**: 4 ASCII hexadecimal characters (CRC-16 ARC)
- **0LLL**: Length field - 4 characters: "0" + 3 hex digits representing message length
- **"id"**: Protocol identifier token (e.g., "SIA-DCS")
- **"*id"**: Encrypted message indicator (asterisk prefix)
- **seq**: Sequence number (4 digits, 0000-FFFF)
- **Rrcvr**: Receiver number (optional, 1-2 characters)
- **Lpref**: Account prefix (L0-L9, L10-L99)
- **#acct**: Account number (prefixed with #)
- **[Data]**: Message data field
- **[<pad>|...]**: Encrypted data with padding
- **<timestamp>**: Optional timestamp
- **CR**: Carriage Return (ASCII 0x0D, `\r`)

---

## Analysis: SIA-PLAIN.py

### Current Implementation
```python
text = '\n' + crcstr + '00' + length[1].upper() + type + '\r'
```

### Issues Found

1. **Length Field Format (Line 29)**
   - **Current**: `'00' + length[1].upper()`
   - **Problem**: Length is calculated as hex but may not be 3 digits
   - **Standard**: Should be `0LLL` format (4 chars: "0" + 3 hex digits)
   - **Fix**: Should pad to 3 hex digits: `'0' + f"{len(data):03X}"`

2. **CRC Format (Lines 18-24)**
   - **Current**: Pads CRC to 4 characters correctly
   - **Status**: ✅ Correct

3. **Message Structure (Line 29)**
   - **Current**: `'\n' + crcstr + '00' + length[1].upper() + type + '\r'`
   - **Missing**: Sequence number, receiver number fields
   - **Issue**: The `type` variable should already contain these, but format needs verification

4. **Sequence Number**
   - **Status**: ⚠️ Not implemented - should be 4-digit sequence number (0000-FFFF)
   - **Standard**: Section 5.5.1.5 requires sequence number

5. **Receiver Number (Rrcvr)**
   - **Status**: ⚠️ Not present in message format
   - **Standard**: Optional but may be required by some receivers

---

## Analysis: SIA-ENCRYPTED.py

### Current Implementation
```python
input_string = f'"*SIA-DCS"0005L0#{user_id}[{user_id}|{alarm_command}]{output_coordinates}_{time_part},{date_part}'
```

### Issues Found

1. **Line Feed Format (Line 41)**
   - **Current**: `"\r\n"` (CRLF)
   - **Standard**: Should be `"\n"` (LF only) per Section 5.5.1.1
   - **Fix**: Change to `"\n"`

2. **Sequence Number (Line 20)**
   - **Current**: Hardcoded as `0005`
   - **Problem**: Should be variable and incrementing
   - **Standard**: Section 5.5.1.5 - sequence number should be applied by PE
   - **Fix**: Implement sequence number tracking

3. **CRC Calculation (Line 38)**
   - **Current**: `calculate_crc(before_and_after.encode())`
   - **Issue**: CRC should be calculated on the message data (after length field)
   - **Standard**: Section 5.5.1.2 - CRC is calculated on message content

4. **CRC Format (Line 125)**
   - **Current**: `f"{crc_value_hex.upper()}{len(input_bytes):04X}"`
   - **Problem**: Includes length in CRC field
   - **Standard**: CRC should be 4 ASCII hex characters only
   - **Length**: Should be in separate `0LLL` field
   - **Fix**: Return only CRC: `f"{crc_value_hex.upper():>04s}"`

5. **Length Field**
   - **Status**: ⚠️ Not explicitly calculated or included
   - **Standard**: Required `0LLL` format (4 characters)
   - **Fix**: Calculate and include length field

6. **Padding Implementation (Lines 53-64)**
   - **Current**: Adds padding before data
   - **Issue**: Padding uses ASCII A-Z pattern
   - **Standard**: Section 5.4.4.2 - Pad data should be pseudo-random bytes (0-255) excluding "|", "[", "]"
   - **Fix**: Use random bytes, not ASCII pattern

7. **Encryption IV (Line 75)**
   - **Current**: `iv = b'\x00' * 16`
   - **Status**: ✅ Correct - zero IV is standard for DC-09

8. **Encryption Mode (Line 77)**
   - **Current**: `modes.CBC(iv)`
   - **Status**: ✅ Correct - CBC mode required by standard

9. **Encrypted Data Format (Line 82)**
   - **Current**: `binascii.hexlify(encrypted_data).decode('ascii')`
   - **Status**: ✅ Correct - ASCII-encoded hex per Section 5.4.7

10. **Message Structure**
    - **Missing**: Receiver number (Rrcvr) field
    - **Missing**: Proper length field (0LLL)
    - **Issue**: Message assembly doesn't follow standard format exactly

---

## Critical Issues Summary

### SIA-PLAIN.py
1. ❌ Length field format incorrect (should be `0LLL` with 3 hex digits)
2. ⚠️ Sequence number not implemented
3. ⚠️ Receiver number field missing

### SIA-ENCRYPTED.py
1. ❌ Line feed should be `\n` not `\r\n`
2. ❌ Sequence number hardcoded (should be variable)
3. ❌ CRC format includes length (should be CRC only)
4. ❌ Length field (`0LLL`) not properly calculated/included
5. ❌ Padding uses ASCII pattern instead of pseudo-random bytes
6. ⚠️ Receiver number field missing
7. ⚠️ CRC calculation may be on wrong data

---

## Recommendations

### Priority 1 (Critical - Standard Compliance)
1. Fix line feed format in encrypted script
2. Implement proper length field (`0LLL`) in both scripts
3. Fix CRC format to be 4 hex characters only
4. Implement sequence number tracking
5. Fix padding to use pseudo-random bytes

### Priority 2 (Important - Functionality)
1. Add receiver number field support
2. Verify CRC calculation is on correct data
3. Add proper error handling for responses (ACK, NAK, DUH)

### Priority 3 (Enhancement)
1. Add support for supervision messages (NULL polling)
2. Add timestamp validation
3. Add support for extended data fields
4. Implement retry logic per standard

---

## Standard References

- **Section 4.1**: UDP/TCP support
- **Section 5.4.1**: Encryption Standard (AES 128/192/256 bit)
- **Section 5.4.4**: Padding requirements
- **Section 5.4.6**: Cipher Block Chaining (CBC mode)
- **Section 5.4.7**: Encoding (ASCII hex for encrypted data)
- **Section 5.5.1**: Event Messages format
- **Section 5.5.1.2**: CRC format (4 ASCII characters)
- **Section 5.5.1.5**: Sequence number requirements
- **Section 5.5.3**: Acknowledgement messages (ACK, NAK, DUH)

---

## Example Correct Message Format

### Non-Encrypted:
```
\nCCCC002A"SIA-DCS"0001L0#1234[1234|Nri1/BA01]\r
```

### Encrypted:
```
\nCCCC002A"*SIA-DCS"0001L0#1234[<pad>|encrypted_hex_data]\r
```

Where:
- `CCCC` = 4-char CRC
- `002A` = Length field (0 + 3 hex digits)
- `0001` = Sequence number
- `L0` = Account prefix
- `#1234` = Account number

