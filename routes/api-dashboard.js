const dashboardController = require('../controllers/dashboard');

async function dashboardRoutes(fastify, options) {
  
  // Schema untuk query parameters dashboard
  const dashboardQuerySchema = {
    querystring: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: ['24h', '7d', '30d'], default: '24h' },
        device_id: { type: 'string' },
        limit: { type: 'string', default: '20' },
        offset: { type: 'string', default: '0' },
        severity: { type: 'string', enum: ['high', 'medium', 'low'] }
      }
    }
  };

  // Schema untuk trends query
  const trendsQuerySchema = {
    querystring: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: ['24h', '7d', '30d'], default: '24h' },
        device_id: { type: 'string' }
      }
    }
  };

  // Schema untuk realtime query
  const realtimeQuerySchema = {
    querystring: {
      type: 'object',
      properties: {
        device_id: { type: 'string' }
      }
    }
  };

  // Dashboard Overview - Main dashboard data for React UI
  fastify.get('/api/dashboard/overview', { 
    schema: dashboardQuerySchema 
  }, dashboardController.getDashboardOverview);

  // Thermal Trends - Temperature and humidity trends over time
  fastify.get('/api/dashboard/thermal-trend', { 
    schema: trendsQuerySchema 
  }, dashboardController.getThermalTrends);

  // Alert History - Historical alerts and mitigations
  fastify.get('/api/dashboard/alerts', { 
    schema: dashboardQuerySchema 
  }, dashboardController.getAlertHistory);

  // Realtime Data - Latest sensor readings
  fastify.get('/api/dashboard/realtime', { 
    schema: realtimeQuerySchema 
  }, dashboardController.getRealtimeData);

  // Device List - All active devices
  fastify.get('/api/dashboard/devices', async (request, reply) => {
    try {
      const db = require('../config/database');
      const [devices] = await db.query(`
        SELECT DISTINCT device_id, 
               MAX(created_at) as last_seen,
               COUNT(*) as total_readings
        FROM thermal_logs 
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        GROUP BY device_id 
        ORDER BY last_seen DESC
      `);
      
      return reply.code(200).send({
        status: 'success',
        data: devices
      });
    } catch (error) {
      request.log.error({ err: error }, 'Devices Query Failed');
      return reply.code(500).send({ 
        status: 'error', 
        message: 'Database failure.' 
      });
    }
  });

  // Statistics Summary - Quick stats for dashboard widgets
  fastify.get('/api/dashboard/stats', async (request, reply) => {
    try {
      const db = require('../config/database');
      
      const [thermalStats] = await db.query(`
        SELECT 
          COUNT(*) as total_readings,
          AVG(temp_avg) as avg_temp,
          MAX(temp_max) as max_temp,
          MIN(temp_min) as min_temp,
          COUNT(CASE WHEN temp_avg > 35 THEN 1 END) as high_temp_count
        FROM thermal_logs 
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      `);

      const [mitigationStats] = await db.query(`
        SELECT 
          COUNT(*) as total_mitigations,
          AVG(confidence_score) as avg_confidence,
          COUNT(CASE WHEN processed_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as recent_mitigations
        FROM mitigation_logs
      `);

      return reply.code(200).send({
        status: 'success',
        data: {
          thermal: thermalStats[0],
          mitigation: mitigationStats[0],
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      request.log.error({ err: error }, 'Stats Query Failed');
      return reply.code(500).send({ 
        status: 'error', 
        message: 'Database failure.' 
      });
    }
  });

  // Health check untuk dashboard service
  fastify.get('/api/dashboard/health', async (request, reply) => {
    return { 
      status: 'OK', 
      service: 'dashboard-api',
      timestamp: new Date().toISOString()
    };
  });

}

module.exports = dashboardRoutes;
