import os
import sys
import socket
from time import sleep
from crccheck.crc import Crc16, CrcArc

# Signal Types
# Send with image: "SIA-DCS"0001L0#9998[9998|Nri1/BA01^Dette er sone 1^][Vhttps://granitebeltchristmasfarm.com.au/wp-content/uploads/2023/08/Grinch-1.jpg]
# PANIC: "SIA-DCS"0001L0#1234[1234|Nri1/PA001][X010E57.5698080][Y59N12.8358840]
# PANIC RESTORE: "SIA-DCS"0001L0#1234[1234|Nri1/PR001][X010E57.5698080][Y59N12.8358840]
# Set: "SIA-DCS"0001L0#1234[1234|Nri1/CL001]
# Unset: "SIA-DCS"0001L0#1234[1234|Nri1/OP001]
# Test Report: "SIA-DCS"0001L0#1234[1234|Nri1/RP0]

def sendSia(type, host, port):
    #type = '"NULL"0000L0#107504[]'
    data = type.encode()
    crc = CrcArc.calc(data)
    crcstr = str(hex(crc)).split('x')
    crcstr = str(crcstr[1].upper())
    if len(crcstr) == 2:
        crcstr = '00' + crcstr
    if len(crcstr) == 3:
        crcstr = '0' + crcstr
    length = str(hex(len(data))).split('x')
    client_socket = socket.socket()
    client_socket.connect((host, port))
    client_socket.settimeout(10)
    text = '\n' + crcstr + '00' + length[1].upper() + type + '\r'
    print('Sent signal: ' + f'{text}')
    message = bytes(text, 'ASCII')
    client_socket.send(message)
    data = client_socket.recv(64)
    print("Received from server: " + f'{data}')
    client_socket.close()

def clear_screen():
    os.system('cls' if os.name == 'nt' else 'clear')

host = ""
port = ""
def program():
    print('### SIA-DCS TESTER v1.0 ###\n')
    global host
    global port
    if not host:
        host = input('Enter reciever IP: ')
        port = int(input('Enter reciever port: '))
    print('1. SIA-DCS(Auto Generated) | 2. SIA-DCS (Full String)')
    inputType = input('Select signal type: ')
    if inputType == '1':
        id = input('Enter Client ID: ')
        signalType = input('Enter signal type: ')
        zone = input('Enter zone number: ')
        if signalType == "BA":
            image = input('Enter image URL: ')
        else:
            image = ""
        type = '"SIA-DCS"0005L0#' + id + '[' + id + '|Nri1/' + signalType + zone + '][V' + image + ']'
    if inputType == '2':
        print('Example string: "SIA-DCS"0005L0#1234[1234|Nri1/RP0]')
        type = input('Enter full SIA string: ')
    while inputType not in ['1', '2']:
        program()

    sendSia(type, host, port)

    check = input('\nSend new signal? y/n: ')
    if check == 'y':
        clear_screen()
        program()
    else:
        clear_screen()
        pass

program()
