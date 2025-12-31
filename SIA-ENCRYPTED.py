from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend
import os
import socket
import datetime
import struct
from crccheck.crc import Crc16, CrcArc
import binascii

class StringMaker:
    def __init__(self):
        pass

    def send_alarm(self, alarm_command, user_id, longitude, latitude, key, host, port):
        key = bytes.fromhex(key)
        now = datetime.datetime.now()
        date_part = now.strftime("%m-%d-%Y")
        time_part = now.strftime("%H:%M:%S")
        output_coordinates = self.convert_coordinates(latitude, longitude)
        input_string = f'"*SIA-DCS"0005L0#{user_id}[{user_id}|{alarm_command}]{output_coordinates}_{time_part},{date_part}'



        part_before, part_after = input_string.split('[', 1)
        part_before = f"{part_before}["
        #part_before = f'"*SIA-DCS"0021L0#9999['
        part_after = "|" + part_after
        #part_after = '|9999|Nri1/BA01][Vwww.google.no]_12:10:07,12-13-2024'

        encryption_part = self.add_padding(part_after)
        print(f"Padded Input: {encryption_part}")

        encrypted_hex = self.encrypt(encryption_part, key)
        print(f"Encrypted Hex: {encrypted_hex}")

        before_and_after = f"{part_before}{encrypted_hex}"

        crc_hash = self.calculate_crc(before_and_after.encode())
        with_hash = f"{crc_hash}{before_and_after}"

        with_line_feed_and_return = f"\r\n{with_hash}\r"
        message_bytes = with_line_feed_and_return.encode()

        print(message_bytes)

        tcp_response = self.send_bytes_with_tcp(host, port, message_bytes)
        return tcp_response.decode() if tcp_response is not None else "No data from Patriot"

    def to_ascii_hex(self, byte_array):
        return byte_array.hex()


    def add_padding(self, input_string):
        # Convert the input string to bytes
        input_bytes = input_string.encode()
        # Calculate the pad length
        pad_length = 16 - len(input_bytes) % 16
        pad_length = pad_length if pad_length != 16 else 0
        # Generate padding with ASCII characters
        padding_ascii = bytes([i % 26 + 65 for i in range(pad_length)])
        # Concatenate padding and input bytes
        padded_bytes = padding_ascii + input_bytes

        return padded_bytes

    def get_string_after_first_occurrence(self, input_string, character):
        index = input_string.find(character)
        return input_string[index + 1:] if index != -1 else ""

    def encrypt(self, input_bytes, key):
        key_bytes = key
        data_bytes = input_bytes

        # Use the same initialization vector (IV) as in your decryption function
        iv = b'\x00' * 16

        cipher = Cipher(algorithms.AES(key_bytes), modes.CBC(iv), backend=default_backend())
        encryptor = cipher.encryptor()

        encrypted_data = encryptor.update(data_bytes) + encryptor.finalize()

        return binascii.hexlify(encrypted_data).decode('ascii')

    def decrypt(self, input_bytes, key):
        cipher = Cipher(algorithms.AES(key), modes.CFB(os.urandom(16)), backend=default_backend())
        decryptor = cipher.decryptor()
        decrypted = decryptor.update(input_bytes) + decryptor.finalize()
        return decrypted.decode()

    def send_bytes_with_tcp(self, ip_address, port, data):
        try:
            with socket.create_connection((ip_address, port), timeout=5) as client:
                client.sendall(data)
                response = client.recv(1024)
                return response
        except Exception as ex:
            print(f"Error: {ex}")
            return None

    def convert_coordinates(self, latitude, longitude):
        # Extract numerical values for longitude and latitude
        lon_value = float(longitude)
        lat_value = float(latitude)

        # Convert longitude to the desired format
        lon_degrees = int(lon_value)
        lon_minutes = (lon_value - lon_degrees) * 60
        lon_format = f"[X{lon_degrees:03d}E{lon_minutes:.8f}]"

        # Convert latitude to the desired format
        lat_degrees = int(lat_value)
        lat_minutes = (lat_value - lat_degrees) * 60
        lat_format = f"[Y{lat_degrees:02d}N{lat_minutes:.8f}]"

        # Combine the formatted coordinates
        result = lon_format + lat_format

        return result


    def calculate_crc(self, input_bytes):
        crc_arc = CrcArc()
        crc_arc.process(input_bytes)
        crc_value_hex = crc_arc.finalhex()
        return f"{crc_value_hex.upper()}{len(input_bytes):04X}"


def main():
    string_maker = StringMaker()
    key = "594162417237323352466D3964673233"
    host = "1.1.1.1"
    port = 1000
    ClientID = input("ClientID: ")
    SignalType = "Nri/" + input("SignalType: ")
    Zone = input("Zone: ")
    SignalAndZone = SignalType + Zone
    PosistionLat = input("Latitude: ")
    PositionLong = input("Longitude: ")

    result = string_maker.send_alarm(SignalAndZone, int(ClientID), float(PosistionLat), float(PositionLong), key, host, port)
    print(result)


if __name__ == "__main__":
    main()
