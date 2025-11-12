// Quick WebSocket test for cloud backend
const WebSocket = require('ws');

console.log('\n========================================');
console.log('TESTING CLOUD BACKEND CONNECTION');
console.log('========================================\n');

const cloudUrl = 'wss://interview-ai.breakable-benny.koyeb.app';

console.log(`Connecting to: ${cloudUrl}...`);

const ws = new WebSocket(cloudUrl, {
    headers: {
        'User-Agent': 'InterviewAI-Desktop/0.1.0'
    }
});

ws.on('open', () => {
    console.log('✅ Connected successfully!');
    console.log('\nBackend is READY for desktop app connection.\n');
    
    // Send a test message
    ws.send(JSON.stringify({
        type: 'ping',
        timestamp: Date.now()
    }));
});

ws.on('message', (data) => {
    console.log('📨 Received message from backend:');
    console.log(data.toString());
});

ws.on('error', (error) => {
    console.log('❌ Connection failed:');
    console.log(`   ${error.message}`);
    console.log('\nPossible issues:');
    console.log('   • Backend server may be down');
    console.log('   • Network connectivity issues');
    console.log('   • Firewall blocking WSS connections\n');
});

ws.on('close', () => {
    console.log('\n✅ Connection closed.');
    console.log('========================================\n');
    process.exit(0);
});

// Timeout after 10 seconds
setTimeout(() => {
    console.log('\n⚠️ Connection timeout (10s)');
    console.log('Backend may be slow or unavailable.\n');
    ws.close();
    process.exit(1);
}, 10000);
