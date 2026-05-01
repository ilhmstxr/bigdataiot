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
