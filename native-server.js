/**
 * Native Node.js HTTPS Server
 * Force HTTPS - HTTP requests auto-redirect to HTTPS
 * No Fastify dependency - pure http/https modules
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const querystring = require('querystring');

// Load environment variables
require('dotenv').config();

// Database config
const db = require('./config/database');

// Controllers
const sensorController = require('./controllers/iot-controller-native');
const mitigationController = require('./controllers/mitigationLog-native');
const earthquakeController = require('./controllers/earthquakeLog-native');

// BMKG Service
const bmkgService = require('./bmkg-service-native');

// Logger utility
const logger = {
  info: (msg, meta = {}) => console.log(`[INFO] ${new Date().toISOString()} ${msg}`, meta),
  error: (msg, meta = {}) => console.error(`[ERROR] ${new Date().toISOString()} ${msg}`, meta),
  warn: (msg, meta = {}) => console.warn(`[WARN] ${new Date().toISOString()} ${msg}`, meta)
};

// Configuration
const PORT_HTTPS = parseInt(process.env.PORT_HTTPS) || 3443;
const PORT_HTTP = parseInt(process.env.PORT_HTTP) || 3000;
const FORCE_HTTPS = process.env.FORCE_HTTPS !== 'false'; // default true

// SSL Certificate paths (set in .env or default locations)
const SSL_KEY_PATH = process.env.SSL_KEY_PATH || './ssl/key.pem';
const SSL_CERT_PATH = process.env.SSL_CERT_PATH || './ssl/cert.pem';

// ============================================
// MIDDLEWARE & UTILITIES
// ============================================

// CORS Headers
function setCORSHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// Parse JSON body
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        if (body && req.headers['content-type']?.includes('application/json')) {
          resolve(JSON.parse(body));
        } else {
          resolve({});
        }
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

// Parse query string
function parseQuery(reqUrl) {
  const parsed = url.parse(reqUrl, true);
  return parsed.query;
}

// Static file serving
function serveStatic(reqPath, res) {
  const publicDir = path.join(__dirname, 'public');
  let filePath = path.join(publicDir, reqPath === '/' ? 'index.html' : reqPath);
  
  // Security: prevent directory traversal
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'error', message: 'Forbidden' }));
    return;
  }

  const ext = path.extname(filePath);
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
  };
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', message: 'Not Found' }));
      } else {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', message: 'Server Error' }));
      }
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

// Response helpers
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(data));
}

// Request context creator (simulates Fastify request/reply)
function createContext(req, res, body = {}, query = {}) {
  return {
    request: {
      body,
      query,
      params: {},
      log: logger,
      headers: req.headers,
      method: req.method,
      url: req.url
    },
    reply: {
      code: (code) => ({
        send: (data) => sendJSON(res, code, data)
      }),
      send: (data) => sendJSON(res, 200, data)
    },
    log: logger
  };
}

// ============================================
// ROUTER
// ============================================

const routes = {
  // Health checks
  'GET /api/health': async (ctx) => {
    return { status: 'OK', message: 'BigData Server is running', timestamp: new Date().toISOString() };
  },
  
  'GET /api/n8n/health': async (ctx) => ({
    status: 'OK', service: 'n8n-webhook', timestamp: new Date().toISOString()
  }),
  
  'GET /api/bmkg/health': async (ctx) => ({
    status: 'OK', service: 'bmkg-api', timestamp: new Date().toISOString()
  }),

  // IoT / Sensor
  'POST /api/sensor/ingest': async (ctx) => {
    const result = await sensorController.ingestThermalData(ctx.request, ctx.reply, ctx.log);
    return result;
  },

  // n8n Mitigation
  'POST /api/n8n/mitigation': async (ctx) => {
    return await mitigationController.receiveMitigationData(ctx.request, ctx.reply);
  },
  
  'POST /api/n8n/webhook': async (ctx) => {
    logger.info('Webhook received from n8n', { body: ctx.request.body });
    return await mitigationController.receiveMitigationData(ctx.request, ctx.reply);
  },
  
  'GET /api/n8n/history': async (ctx) => {
    return await mitigationController.getMitigationHistory(ctx.request, ctx.reply);
  },

  // n8n Callbacks (no :id in path, source_id in body)
  'POST /webhook-test/n8n/thermal': async (ctx) => {
    return await mitigationController.receiveThermalCallback(ctx.request, ctx.reply);
  },
  
  'POST /webhook-test/n8n/earthquake': async (ctx) => {
    return await mitigationController.receiveEarthquakeCallback(ctx.request, ctx.reply);
  },

  // BMKG
  'GET /api/bmkg/latest': async (ctx) => {
    return await earthquakeController.getLatestEarthquake(ctx.request, ctx.reply);
  },
  
  'GET /api/bmkg/history': async (ctx) => {
    return await earthquakeController.getEarthquakeHistory(ctx.request, ctx.reply);
  },
};

// Route matcher with params support
function matchRoute(method, pathname) {
  const key = `${method} ${pathname}`;
  
  // Exact match
  if (routes[key]) {
    return { handler: routes[key], params: {} };
  }
  
  return null;
}

// ============================================
// REQUEST HANDLER
// ============================================

async function handleRequest(req, res) {
  const startTime = Date.now();
  
  // Set CORS
  setCORSHeaders(res);
  
  // Handle OPTIONS (preflight)
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query;
  
  logger.info(`${req.method} ${pathname}`, { query });
  
  try {
    // Parse body for POST/PUT
    let body = {};
    if (req.method === 'POST' || req.method === 'PUT') {
      try {
        body = await parseBody(req);
      } catch (err) {
        sendJSON(res, 400, { status: 'error', message: 'Invalid JSON body' });
        return;
      }
    }
    
    // Create context
    const ctx = createContext(req, res, body, query);
    
    // Match route
    const routeMatch = matchRoute(req.method, pathname);
    
    if (routeMatch) {
      const result = await routeMatch.handler(ctx);
      // If handler didn't send response, send result
      if (result && !res.writableEnded) {
        sendJSON(res, 200, result);
      }
    } else {
      // Try static files (GET only)
      if (req.method === 'GET') {
        serveStatic(pathname, res);
      } else {
        sendJSON(res, 404, { status: 'error', message: 'Not Found' });
      }
    }
    
    const duration = Date.now() - startTime;
    logger.info(`${req.method} ${pathname} ${res.statusCode || 200} ${duration}ms`);
    
  } catch (err) {
    logger.error('Request handler error', { error: err.message, stack: err.stack });
    if (!res.writableEnded) {
      sendJSON(res, 500, { status: 'error', message: 'Internal Server Error' });
    }
  }
}

// ============================================
// HTTP -> HTTPS REDIRECT SERVER
// ============================================

function createRedirectServer() {
  const redirectServer = http.createServer((req, res) => {
    const httpsUrl = `https://${req.headers.host?.split(':')[0] || 'localhost'}:${PORT_HTTPS}${req.url}`;
    res.writeHead(301, { 'Location': httpsUrl });
    res.end(`Redirecting to ${httpsUrl}`);
  });
  
  redirectServer.listen(PORT_HTTP, '0.0.0.0', () => {
    logger.info(`HTTP redirect server listening on port ${PORT_HTTP} -> redirecting to HTTPS ${PORT_HTTPS}`);
  });
  
  return redirectServer;
}

// ============================================
// HTTPS SERVER
// ============================================

function createHTTPSServer() {
  // Check for SSL certificates
  let sslOptions;
  try {
    sslOptions = {
      key: fs.readFileSync(SSL_KEY_PATH),
      cert: fs.readFileSync(SSL_CERT_PATH)
    };
    logger.info('SSL certificates loaded successfully');
  } catch (err) {
    logger.error('Failed to load SSL certificates', { 
      keyPath: SSL_KEY_PATH, 
      certPath: SSL_CERT_PATH,
      error: err.message 
    });
    logger.warn('Falling back to HTTP only mode (not recommended for production)');
    return null;
  }
  
  const server = https.createServer(sslOptions, handleRequest);
  
  server.listen(PORT_HTTPS, '0.0.0.0', () => {
    logger.info(`HTTPS Server listening on port ${PORT_HTTPS}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`FORCE_HTTPS: ${FORCE_HTTPS}`);
  });
  
  server.on('error', (err) => {
    logger.error('Server error', { error: err.message });
  });
  
  return server;
}

// ============================================
// STARTUP
// ============================================

async function start() {
  logger.info('Starting BigData Native Node.js Server...');
  
  // Test database connection
  try {
    await db.query('SELECT 1');
    logger.info('Database connection successful');
  } catch (err) {
    logger.error('Database connection failed', { error: err.message });
    process.exit(1);
  }
  
  // Start BMKG service if configured
  const webhookUrl = process.env.N8N_GEMPA_WEBHOOK_URL;
  if (webhookUrl) {
    bmkgService.startPoller(60000, webhookUrl, logger);
    logger.info('BMKG service started (60s interval)');
  } else {
    logger.warn('BMKG service not started: N8N_GEMPA_WEBHOOK_URL not configured');
  }
  
  // Create HTTPS server
  const httpsServer = createHTTPSServer();
  
  // Create HTTP redirect server if HTTPS is running and FORCE_HTTPS is true
  if (httpsServer && FORCE_HTTPS) {
    createRedirectServer();
  } else if (!httpsServer) {
    // Fallback to HTTP only
    const httpServer = http.createServer(handleRequest);
    httpServer.listen(PORT_HTTP, '0.0.0.0', () => {
      logger.info(`HTTP Server (fallback) listening on port ${PORT_HTTP}`);
    });
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start
start().catch(err => {
  logger.error('Failed to start server', { error: err.message });
  process.exit(1);
});
