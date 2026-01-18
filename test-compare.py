"""
Compare Python output with Node.js
"""
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend
import binascii
from crccheck.crc import CrcArc

# Test values
client_id = '555555'
signal_type = 'BA'
zone = '01'
latitude = 59.9139
longitude = 10.7522
key = '4B38665033516D3741325A7839524465'
key_bytes = bytes.fromhex(key)

# Fixed timestamp
time_part = '12:00:00'
date_part = '01-18-2026'

alarm_command = f'Nri/{signal_type}{zone}'

print('=== Test Parameters ===')
print(f'ClientID: {client_id}')
print(f'Alarm Command: {alarm_command}')
print(f'Latitude: {latitude}')
print(f'Longitude: {longitude}')
print('')

# Python's send_alarm receives (longitude, latitude) but main() passes (lat, lon)
# So we simulate: send_alarm(..., lat_as_longitude, lon_as_latitude, ...)
def convert_coordinates(latitude, longitude):
    lon_value = float(longitude)
    lat_value = float(latitude)
    
    lon_degrees = int(lon_value)
    lon_minutes = (lon_value - lon_degrees) * 60
    lon_format = f"[X{lon_degrees:03d}E{lon_minutes:.8f}]"
    
    lat_degrees = int(lat_value)
    lat_minutes = (lat_value - lat_degrees) * 60
    lat_format = f"[Y{lat_degrees:02d}N{lat_minutes:.8f}]"
    
    return lon_format + lat_format

# In real Python code: send_alarm is called with (lat, lon) in (longitude, latitude) params
# Then convert_coordinates(latitude, longitude) swaps them back
# So we simulate: convert_coordinates(lon, lat) to match the actual behavior
output_coordinates = convert_coordinates(longitude, latitude)
print(f'=== Python Behavior ===')
print(f'Coordinates: {output_coordinates}')

input_string = f'"*SIA-DCS"0005L0#{client_id}[{client_id}|{alarm_command}]{output_coordinates}_{time_part},{date_part}'
print(f'Input String: {input_string}')

# Split at '['
part_before, part_after = input_string.split('[', 1)
part_before = f"{part_before}["
part_after = "|" + part_after
print(f'Part Before: {part_before}')
print(f'Part After: {part_after}')

# Padding
def add_padding(input_string):
    input_bytes = input_string.encode()
    pad_length = 16 - len(input_bytes) % 16
    pad_length = pad_length if pad_length != 16 else 0
    padding_ascii = bytes([i % 26 + 65 for i in range(pad_length)])
    padded_bytes = padding_ascii + input_bytes
    return padded_bytes

padded_data = add_padding(part_after)
print(f'Padded (ASCII): {padded_data.decode("ascii")}')
print(f'Padded (Hex): {padded_data.hex()}')

# Encrypt
iv = b'\x00' * 16
cipher = Cipher(algorithms.AES(key_bytes), modes.CBC(iv), backend=default_backend())
encryptor = cipher.encryptor()
encrypted_data = encryptor.update(padded_data) + encryptor.finalize()
encrypted_hex = binascii.hexlify(encrypted_data).decode('ascii').upper()
print(f'Encrypted Hex: {encrypted_hex}')

# Combine
before_and_after = f"{part_before}{encrypted_hex}"
print(f'Before+After: {before_and_after}')

# CRC and Length
crc_arc = CrcArc()
crc_arc.process(before_and_after.encode())
crc_value = crc_arc.finalhex().upper()
length_hex = f'{len(before_and_after.encode()):04X}'
print(f'CRC: {crc_value}')
print(f'Length: {length_hex}')
print(f'CRC+Length: {crc_value}{length_hex}')

# Final message
with_hash = f"{crc_value}{length_hex}{before_and_after}"
full_message = f"\r\n{with_hash}\r"
message_bytes = full_message.encode()

print('')
print('=== Final Message ===')
print(f'ASCII (escaped): {full_message.replace(chr(13), chr(92)+"r").replace(chr(10), chr(92)+"n")}')
print(f'Hex: {message_bytes.hex().upper()}')
print(f'Length: {len(message_bytes)} bytes')
