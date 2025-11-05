// Simple development server for testing authentication and payment flows
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 3000;

// MIME types for static files
const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf'
};

const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    let pathname = parsedUrl.pathname;

    // Handle API routes
    if (pathname.startsWith('/api/')) {
        handleApiRoute(req, res, pathname);
        return;
    }

    // Default to index.html for root
    if (pathname === '/') {
        pathname = '/public/index.html';
    } else if (!pathname.startsWith('/public/')) {
        // Assume all other requests are for public folder
        pathname = '/public' + pathname;
    }

    // Serve static files
    serveStaticFile(req, res, pathname);
});

function handleApiRoute(req, res, pathname) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // Extract API function name
    const apiFunction = pathname.replace('/api/', '').replace('.js', '');
    const apiFilePath = path.join(__dirname, 'api', `${apiFunction}.js`);

    // Check if API file exists
    if (!fs.existsSync(apiFilePath)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'API endpoint not found' }));
        return;
    }

    // Read request body for POST requests
    if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                executeApiFunction(apiFilePath, data, res);
            } catch (error) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
        });
    } else {
        executeApiFunction(apiFilePath, parsedUrl.query, res);
    }
}

function executeApiFunction(apiFilePath, data, res) {
    try {
        // Clear require cache to get fresh version
        delete require.cache[require.resolve(apiFilePath)];
        
        const apiModule = require(apiFilePath);
        
        // Create mock Vercel request/response objects
        const mockReq = {
            method: 'POST',
            body: data,
            query: data,
            headers: {}
        };

        const mockRes = {
            status: (code) => {
                res.writeHead(code, { 'Content-Type': 'application/json' });
                return mockRes;
            },
            json: (data) => {
                res.end(JSON.stringify(data));
            },
            send: (data) => {
                res.end(typeof data === 'string' ? data : JSON.stringify(data));
            }
        };

        // Execute the API function
        if (typeof apiModule === 'function') {
            apiModule(mockReq, mockRes);
        } else if (apiModule.default && typeof apiModule.default === 'function') {
            apiModule.default(mockReq, mockRes);
        } else {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid API module' }));
        }
    } catch (error) {
        console.error('API execution error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
    }
}

function serveStaticFile(req, res, pathname) {
    const filePath = path.join(__dirname, pathname);

    fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
            return;
        }

        const ext = path.extname(filePath);
        const contentType = mimeTypes[ext] || 'application/octet-stream';

        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('500 Internal Server Error');
                return;
            }

            res.writeHead(200, { 'Content-Type': contentType });
            res.end(data);
        });
    });
}

server.listen(PORT, () => {
    console.log('\n🚀 Development Server Started!\n');
    console.log(`   Local:   http://localhost:${PORT}`);
    console.log(`   Network: http://127.0.0.1:${PORT}`);
    console.log('\n📄 Pages available:');
    console.log(`   - http://localhost:${PORT}/auth.html`);
    console.log(`   - http://localhost:${PORT}/payment.html`);
    console.log(`   - http://localhost:${PORT}/index.html`);
    console.log('\n📡 API endpoints:');
    console.log(`   - http://localhost:${PORT}/api/create-razorpay-order`);
    console.log(`   - http://localhost:${PORT}/api/verify-razorpay-payment`);
    console.log('\n✨ Press Ctrl+C to stop the server\n');
});
