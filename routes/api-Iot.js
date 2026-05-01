const sensorController = require('../controllers/iot-controller');

async function apiRoutes(fastify, options) {
  
  // 1. Skema Validasi Ketat untuk Payload IoT (Zero-Gap Data Integrity)
  const sensorIngestSchema = {
    body: {
      type: 'object',
      required: ['device_id', 'window_start', 'window_end', 'temperature', 'humidity'],
      properties: {
        device_id: { type: 'string' },
        window_start: { type: 'integer' }, // Unix Timestamp
        window_end: { type: 'integer' },   // Unix Timestamp
        temperature: {
          type: 'object',
          required: ['max', 'max_ts', 'min', 'min_ts', 'avg'],
          properties: {
            max: { type: 'number' }, max_ts: { type: 'integer' },
            min: { type: 'number' }, min_ts: { type: 'integer' },
            avg: { type: 'number' }
          }
        },
        humidity: {
          type: 'object',
          required: ['max', 'max_ts', 'min', 'min_ts', 'avg'],
          properties: {
            max: { type: 'number' }, max_ts: { type: 'integer' },
            min: { type: 'number' }, min_ts: { type: 'integer' },
            avg: { type: 'number' }
          }
        }
      }
    }
  };

  // 2. Endpoint: Menerima Data dari ESP32
  fastify.post('/api/sensor/ingest', { schema: sensorIngestSchema }, sensorController.ingestThermalData);

}

module.exports = apiRoutes;