// Require the fastify framework and instantiate it
const fastify = require('fastify')({ logger: true,  trustProxy: true,   // percaya X-Forwarded-* headers dari Nginx
 });
const path = require('path');

// Require dotenv untuk environment variables
require('dotenv').config();

// Register plugins
fastify.register(require('@fastify/cors'));

// Serve frontend static files dari folder public/
fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, 'public'),
  prefix: '/',
});
fastify.register(require('@fastify/env'), {
  dotenv: true,
  schema: {
    type: 'object',
    required: ['PORT', 'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'],
    properties: {
      PORT: { type: 'string', default: '3000' },
      DB_HOST: { type: 'string' },
      DB_PORT: { type: 'string', default: '3306' },
      DB_USER: { type: 'string' },
      DB_PASSWORD: { type: 'string' },
      DB_NAME: { type: 'string' },
      N8N_GEMPA_WEBHOOK_URL: { type: 'string' }
    }
  }
});

// Register routes
fastify.register(require('./routes/api-Iot'));
fastify.register(require('./routes/api-n8n'));
fastify.register(require('./routes/api-dashboard'));
fastify.register(require('./routes/api-bmkg'));

// Health check endpoint (di-pindah ke /api/health karena `/` sekarang dipakai untuk index.html)
fastify.get('/api/health', async (request, reply) => {
  return { status: 'OK', message: 'BigData Server is running' };
});

// BMKG Service setup (jika file exists)
try {
  const bmkgService = require('./bmkg-service');
  const webhookUrl = process.env.N8N_GEMPA_WEBHOOK_URL;
  
  if (webhookUrl) {
    bmkgService.startPoller(60000, webhookUrl, fastify.log);
    fastify.log.info('BMKG service started');
  }
} catch (error) {
  fastify.log.warn('BMKG service not available');
}

// Start the server
const start = async () => {
  try {
    await fastify.listen({ port: parseInt(process.env.PORT) || 3000, host: '0.0.0.0' });
    fastify.log.info(`Server listening on ${fastify.server.address().port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();