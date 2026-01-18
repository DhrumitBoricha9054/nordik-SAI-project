/**
 * Simple TCP connection test to Alarm24
 * Tests if we can reach 213.167.121.142:12004
 */

const net = require('net');

const ALARM24_HOST = '213.167.121.142';
const ALARM24_PORT = 12004;

console.log('Testing TCP connection to Alarm24...\n');
console.log(`Host: ${ALARM24_HOST}`);
console.log(`Port: ${ALARM24_PORT}\n`);

const client = new net.Socket();
client.setTimeout(10000);

client.connect(ALARM24_PORT, ALARM24_HOST, () => {
    console.log('✅ Connected successfully!');
    console.log('Connection established to Alarm24\n');

    // Send a simple test message
    const testMessage = Buffer.from('\r\nTEST\r', 'ascii');
    client.write(testMessage);
    console.log('Sent test message');
});

client.on('data', (data) => {
    console.log('✅ Received response from server:');
    console.log(data.toString('ascii'));
    client.destroy();
});

client.on('error', (err) => {
    console.error('❌ Connection error:');
    console.error(`   ${err.message}\n`);

    if (err.code === 'ECONNREFUSED') {
        console.log('Possible reasons:');
        console.log('   - Server is not running');
        console.log('   - Port 12004 is blocked');
        console.log('   - Wrong IP address');
    } else if (err.code === 'ETIMEDOUT') {
        console.log('Possible reasons:');
        console.log('   - Firewall blocking connection');
        console.log('   - Network issue');
        console.log('   - IP needs to be whitelisted');
    }

    client.destroy();
});

client.on('timeout', () => {
    console.error('❌ Connection timeout\n');
    console.log('Possible reasons:');
    console.log('   - Firewall blocking outbound connections on port 12004');
    console.log('   - Your IP needs to be whitelisted by Alarm24');
    console.log('   - Network routing issue\n');
    console.log('💡 Try:');
    console.log('   1. Run Python script on SAME PC - does it work?');
    console.log('   2. Check Windows Firewall settings');
    console.log('   3. Try from different network (mobile hotspot)');
    console.log('   4. Call Alarm24 at 761 14 100 to whitelist your IP\n');

    client.destroy();
});

client.on('close', () => {
    console.log('Connection closed');
    process.exit(0);
});
