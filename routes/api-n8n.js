const mitigationController = require('../controllers/mitigationLog');

async function n8nRoutes(fastify, options) {
  
  // Schema untuk menerima data dari n8n/Gemini
  const mitigationReceiveSchema = {
    body: {
      type: 'object',
      required: ['event_id', 'event_type', 'mitigation_advice', 'confidence_score'],
      properties: {
        event_id: { type: 'string' },
        event_type: { type: 'string', enum: ['earthquake', 'thermal_anomaly', 'flood', 'other'] },
        mitigation_advice: { type: 'string' },
        confidence_score: { type: 'number', minimum: 0, maximum: 1 },
        raw_response: { type: 'object' },
        metadata: { type: 'object' }
      }
    }
  };

  // Schema untuk query parameters
  const historyQuerySchema = {
    querystring: {
      type: 'object',
      properties: {
        event_id: { type: 'string' },
        limit: { type: 'string', default: '50' },
        offset: { type: 'string', default: '0' }
      }
    }
  };

  // Endpoint untuk menerima data dari n8n/Gemini
  fastify.post('/api/n8n/mitigation', { 
    schema: mitigationReceiveSchema 
  }, mitigationController.receiveMitigationData);

  // Endpoint untuk mendapatkan history mitigasi
  fastify.get('/api/n8n/history', { 
    schema: historyQuerySchema 
  }, mitigationController.getMitigationHistory);

  // Webhook endpoint untuk n8n automation
  fastify.post('/api/n8n/webhook', { 
    schema: mitigationReceiveSchema 
  }, async (request, reply) => {
    // Log incoming webhook
    request.log.info('Webhook received from n8n', { body: request.body });
    
    // Process the mitigation data
    return mitigationController.receiveMitigationData(request, reply);
  });

  // Schema untuk callback dari n8n (lebih permissive).
  // ID referensi (source_id) sekarang di-body, bukan di URL path.
  // additionalProperties=true supaya n8n bebas append field lain ke raw_response.
  const callbackSchema = {
    body: {
      type: 'object',
      required: ['source_id'],
      properties: {
        source_id: { type: 'string', minLength: 1, description: 'Referensi insert_id dari thermal_logs atau earthquake_logs' },
        mitigation_advice: { type: 'string' },
        confidence_score: { type: 'number', minimum: 0, maximum: 1 },
        raw_response: { type: 'object' },
        metadata: { type: 'object' }
      },
      additionalProperties: true
    }
  };

  // Callback dari n8n: hasil proses data thermal.
  // Trigger upstream: POST /api/sensor/ingest -> outbound webhook ke N8N_THERMAL_WEBHOOK_URL
  // -> n8n proses (AI / rule) -> POST balik ke sini dengan body.source_id = thermal_logs.insert_id.
  fastify.post('/api/webhook/n8n/thermal', {
    schema: callbackSchema
  }, mitigationController.receiveThermalCallback);

  // Callback dari n8n: hasil proses data gempa.
  // Trigger upstream: bmkg-service.checkBMKG (poller 60s) -> outbound webhook ke N8N_GEMPA_WEBHOOK_URL
  // -> n8n proses -> POST balik ke sini dengan body.source_id = earthquake_logs.insert_id.
  fastify.post('/api/webhook/n8n/earthquake', {
    schema: callbackSchema
  }, mitigationController.receiveEarthquakeCallback);

  // Health check untuk n8n service
  fastify.get('/api/n8n/health', async (request, reply) => {
    return { 
      status: 'OK', 
      service: 'n8n-webhook',
      timestamp: new Date().toISOString()
    };
  });

}

module.exports = n8nRoutes;
