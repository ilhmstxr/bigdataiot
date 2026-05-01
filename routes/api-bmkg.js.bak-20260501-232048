const earthquakeController = require('../controllers/earthquakeLog');

async function bmkgRoutes(fastify, options) {

  const historyQuerySchema = {
    querystring: {
      type: 'object',
      properties: {
        limit: { type: 'string', default: '20' },
        offset: { type: 'string', default: '0' },
        min_magnitude: { type: 'string' }
      }
    }
  };

  // Riwayat gempa dari database
  fastify.get('/api/bmkg/history', {
    schema: historyQuerySchema
  }, earthquakeController.getEarthquakeHistory);

  // Gempa terbaru
  fastify.get('/api/bmkg/latest', earthquakeController.getLatestEarthquake);

  // Health check
  fastify.get('/api/bmkg/health', async (request, reply) => {
    return {
      status: 'OK',
      service: 'bmkg-api',
      timestamp: new Date().toISOString()
    };
  });

}

module.exports = bmkgRoutes;
