// Database configuration
const db = require('../config/database');

async function getDashboardOverview(request, reply) {
  try {
    // Get latest thermal data summary
    const [thermalSummary] = await db.query(`
      SELECT 
        COUNT(*) as total_records,
        AVG(temp_avg) as avg_temperature,
        AVG(hum_avg) as avg_humidity,
        MAX(temp_max) as max_temperature,
        MIN(temp_min) as min_temperature,
        MAX(created_at) as latest_reading
      FROM thermal_logs 
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
    `);

    // Get latest mitigation data
    const [mitigationSummary] = await db.query(`
      SELECT 
        COUNT(*) as total_mitigations,
        AVG(confidence_score) as avg_confidence,
        COUNT(CASE WHEN processed_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as recent_mitigations
      FROM mitigation_logs
    `);

    // Get device status
    const [deviceStatus] = await db.query(`
      SELECT 
        device_id,
        MAX(created_at) as last_seen,
        COUNT(*) as readings_count
      FROM thermal_logs 
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      GROUP BY device_id
      ORDER BY last_seen DESC
    `);

    return reply.code(200).send({
      status: 'success',
      data: {
        thermal_summary: thermalSummary[0],
        mitigation_summary: mitigationSummary[0],
        device_status: deviceStatus,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    request.log.error({ err: error }, 'Dashboard Query Failed');
    return reply.code(500).send({ 
      status: 'error', 
      message: 'Database failure.' 
    });
  }
}

async function getThermalTrends(request, reply) {
  const { period = '24h', device_id } = request.query;
  
  try {
    let timeInterval = '1 HOUR';
    if (period === '7d') timeInterval = '1 DAY';
    if (period === '30d') timeInterval = '1 DAY';

    let query = `
      SELECT 
        DATE_FORMAT(created_at, '%Y-%m-%d %H:00:00') as time_period,
        AVG(temp_avg) as avg_temperature,
        AVG(hum_avg) as avg_humidity,
        MAX(temp_max) as max_temperature,
        MIN(temp_min) as min_temperature,
        COUNT(*) as readings_count
      FROM thermal_logs 
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL ${period === '24h' ? '24 HOUR' : period === '7d' ? '7 DAY' : '30 DAY'})
    `;
    
    const params = [];
    if (device_id) {
      query += ' AND device_id = ?';
      params.push(device_id);
    }

    query += ` GROUP BY time_period ORDER BY time_period ASC`;

    const [results] = await db.query(query, params);
    
    return reply.code(200).send({
      status: 'success',
      data: results,
      period,
      device_id: device_id || 'all'
    });
  } catch (error) {
    request.log.error({ err: error }, 'Thermal Trends Query Failed');
    return reply.code(500).send({ 
      status: 'error', 
      message: 'Database failure.' 
    });
  }
}

async function getAlertHistory(request, reply) {
  const { limit = 20, offset = 0, severity } = request.query;

  try {
    let query = `
      SELECT 
        ml.*,
        tl.device_id,
        tl.temp_max,
        tl.temp_avg
      FROM mitigation_logs ml
      LEFT JOIN thermal_logs tl ON ml.event_id = tl.device_id
      WHERE 1=1
    `;
    const params = [];

    if (severity) {
      query += ' AND ml.confidence_score ' + (severity === 'high' ? '>= 0.8' : severity === 'medium' ? '>= 0.5 AND < 0.8' : '< 0.5');
    }

    query += ' ORDER BY ml.processed_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [results] = await db.query(query, params);
    
    return reply.code(200).send({
      status: 'success',
      data: results,
      total: results.length
    });
  } catch (error) {
    request.log.error({ err: error }, 'Alert History Query Failed');
    return reply.code(500).send({ 
      status: 'error', 
      message: 'Database failure.' 
    });
  }
}

async function getRealtimeData(request, reply) {
  const { device_id } = request.query;

  try {
    let query = `
      SELECT 
        device_id,
        temp_max,
        temp_min,
        temp_avg,
        hum_max,
        hum_min,
        hum_avg,
        window_start,
        window_end,
        created_at
      FROM thermal_logs 
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
    `;
    
    const params = [];
    if (device_id) {
      query += ' AND device_id = ?';
      params.push(device_id);
    }

    query += ' ORDER BY created_at DESC LIMIT 100';

    const [results] = await db.query(query, params);
    
    return reply.code(200).send({
      status: 'success',
      data: results,
      device_id: device_id || 'all'
    });
  } catch (error) {
    request.log.error({ err: error }, 'Realtime Data Query Failed');
    return reply.code(500).send({ 
      status: 'error', 
      message: 'Database failure.' 
    });
  }
}

module.exports = {
  getDashboardOverview,
  getThermalTrends,
  getAlertHistory,
  getRealtimeData
};
