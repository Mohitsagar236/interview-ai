// Enhanced WebSocket test with proper headers
const WebSocket = require('ws');

console.log('\n========================================');
console.log('ENHANCED CLOUD BACKEND TEST');
console.log('========================================\n');

const cloudUrl = 'wss://interview-ai-breakable-benny.koyeb.app';

console.log(`Testing: ${cloudUrl}`);
console.log('Attempting connection with headers...\n');

const ws = new WebSocket(cloudUrl, {
    headers: {
        'User-Agent': 'InterviewAI-Desktop/0.1.0',
        'Origin': 'electron://interview-ai',
        'Sec-WebSocket-Protocol': 'websocket'
    },
    rejectUnauthorized: false // Allow self-signed certs
});

let connected = false;

ws.on('open', () => {
    connected = true;
    console.log('✅ Connection SUCCESSFUL!');
    console.log('\n Backend is ready for desktop app connection.\n');
    
    // Send test ping
    const testMessage = JSON.stringify({
        type: 'ping',
        timestamp: Date.now(),
        client: 'desktop-test'
    });
    
    console.log('Sending test message:', testMessage);
    ws.send(testMessage);
    
    // Close after 2 seconds if no response
    setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
            console.log('\n✅ Connection stable. Closing test.\n');
            ws.close();
        }
    }, 2000);
});

ws.on('message', (data) => {
    console.log('\n📨 Received from backend:');
    try {
        const parsed = JSON.parse(data.toString());
        console.log(JSON.stringify(parsed, null, 2));
    } catch {
        console.log(data.toString());
    }
});

ws.on('error', (error) => {
    console.log('❌ Connection failed:');
    console.log(`   ${error.message}`);
    
    if (error.message.includes('EPROTO') || error.message.includes('SSL')) {
        console.log('\n🔍 SSL/TLS Error Detected');
        console.log('   This might mean:');
        console.log('   • Koyeb is still provisioning SSL certificate');
        console.log('   • Try again in a few minutes');
        console.log('   • Or use local backend temporarily\n');
    } else if (error.message.includes('403')) {
        console.log('\n🔍 403 Forbidden');
        console.log('   Backend is running but blocking connections');
        console.log('   Check Koyeb environment variables:\n');
        console.log('   • CLOUD_MODE=true');
        console.log('   • ALLOWED_ORIGINS=*\n');
    }
});

ws.on('close', (code, reason) => {
    if (connected) {
        console.log('✅ Test complete. Connection closed gracefully.\n');
    } else {
        console.log(`\n⚠️  Connection closed before establishing`);
        console.log(`   Code: ${code}`);
        if (reason) console.log(`   Reason: ${reason}`);
    }
    console.log('========================================\n');
    process.exit(connected ? 0 : 1);
});

// Timeout
setTimeout(() => {
    if (!connected) {
        console.log('\n⏱️  Connection timeout (10s)');
        console.log('   Backend might be slow or down.\n');
        console.log('========================================\n');
        ws.close();
        process.exit(1);
    }
}, 10000);
