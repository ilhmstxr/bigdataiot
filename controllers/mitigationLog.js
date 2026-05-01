/**
 * Mitigation Log Controller - Native Node.js Version
 * Handles n8n callbacks and mitigation data storage
 */

const db = require('../config/database');

/**
 * Helper internal: insert satu record ke `mitigation_logs`.
 */
async function persistMitigation(payload) {
  const query = `
    INSERT INTO mitigation_logs
    (event_id, event_type, mitigation_advice, confidence_score, raw_response, processed_at)
    VALUES (?, ?, ?, ?, ?, NOW())
  `;
  const values = [
    payload.event_id,
    payload.event_type,
    payload.mitigation_advice,
    payload.confidence_score,
    JSON.stringify(payload.raw_response || {})
  ];
  const [result] = await db.query(query, values);
  return { insertId: result.insertId };
}

/**
 * POST /api/n8n/mitigation
 * Menerima data mitigasi dari n8n/Gemini
 */
async function receiveMitigationData(request, reply) {
  const payload = request.body;

  // Validasi manual
  const requiredFields = ['event_id', 'event_type', 'mitigation_advice', 'confidence_score'];
  for (const field of requiredFields) {
    if (payload[field] === undefined || payload[field] === null) {
      return reply.code(400).send({
        status: 'error',
        message: `Missing required field: ${field}`
      });
    }
  }

  // Validasi event_type enum
  const validEventTypes = ['earthquake', 'thermal_anomaly', 'flood', 'other'];
  if (!validEventTypes.includes(payload.event_type)) {
    return reply.code(400).send({
      status: 'error',
      message: `Invalid event_type. Must be one of: ${validEventTypes.join(', ')}`
    });
  }

  // Validasi confidence_score range
  if (typeof payload.confidence_score !== 'number' || payload.confidence_score < 0 || payload.confidence_score > 1) {
    return reply.code(400).send({
      status: 'error',
      message: 'confidence_score must be a number between 0 and 1'
    });
  }

  try {
    const { insertId } = await persistMitigation(payload);
    return reply.code(201).send({
      status: 'success',
      message: 'Mitigation data received and logged.',
      insert_id: insertId,
      event_id: payload.event_id,
      event_type: payload.event_type
    });
  } catch (error) {
    console.error('DB Insert Failed', { err: error.message });
    return reply.code(500).send({
      status: 'error',
      message: 'Database failure.'
    });
  }
}

/**
 * GET /api/n8n/history
 * Mengambil riwayat data mitigasi
 */
async function getMitigationHistory(request, reply) {
  const { event_id, limit = '50', offset = '0' } = request.query;
  
  const limitNum = parseInt(limit) || 50;
  const offsetNum = parseInt(offset) || 0;

  try {
    let query = 'SELECT * FROM mitigation_logs';
    const values = [];
    
    if (event_id) {
      query += ' WHERE event_id = ?';
      values.push(event_id);
    }
    
    query += ' ORDER BY processed_at DESC LIMIT ? OFFSET ?';
    values.push(limitNum, offsetNum);

    const [rows] = await db.query(query, values);
    
    return reply.send({
      status: 'success',
      count: rows.length,
      data: rows
    });
  } catch (error) {
    console.error('Query Failed', { err: error.message });
    return reply.code(500).send({
      status: 'error',
      message: 'Database query failed.'
    });
  }
}

/**
 * POST /webhook-test/n8n/thermal
 * Callback dari n8n setelah memproses data thermal
 */
async function receiveThermalCallback(request, reply) {
  const body = request.body || {};
  const sourceId = body.source_id;

  if (!sourceId) {
    return reply.code(400).send({
      status: 'error',
      message: 'Missing required field: source_id'
    });
  }

  // Validasi confidence_score jika ada
  if (body.confidence_score !== undefined && (typeof body.confidence_score !== 'number' || body.confidence_score < 0 || body.confidence_score > 1)) {
    return reply.code(400).send({
      status: 'error',
      message: 'confidence_score must be a number between 0 and 1'
    });
  }

  const payload = {
    event_id: `THERMAL_${sourceId}`,
    event_type: 'thermal_anomaly',
    mitigation_advice: body.mitigation_advice || '(no advice provided by n8n)',
    confidence_score: typeof body.confidence_score === 'number' ? body.confidence_score : 1.0,
    raw_response: { ...body, _source_id: sourceId, _callback: 'thermal' }
  };

  console.log('[N8N CALLBACK] Thermal mitigation received', { source_id: sourceId, advice_len: payload.mitigation_advice.length });

  try {
    const { insertId } = await persistMitigation(payload);
    return reply.code(201).send({
      status: 'success',
      message: 'Thermal callback recorded.',
      source_id: sourceId,
      event_id: payload.event_id,
      event_type: payload.event_type,
      insert_id: insertId
    });
  } catch (error) {
    console.error('[N8N CALLBACK] Thermal DB Insert Failed', { err: error.message, source_id: sourceId });
    return reply.code(500).send({
      status: 'error',
      message: 'Database failure.'
    });
  }
}

/**
 * POST /webhook-test/n8n/earthquake
 * Callback dari n8n setelah memproses data gempa
 */
async function receiveEarthquakeCallback(request, reply) {
  const body = request.body || {};
  const sourceId = body.source_id;

  if (!sourceId) {
    return reply.code(400).send({
      status: 'error',
      message: 'Missing required field: source_id'
    });
  }

  // Validasi confidence_score jika ada
  if (body.confidence_score !== undefined && (typeof body.confidence_score !== 'number' || body.confidence_score < 0 || body.confidence_score > 1)) {
    return reply.code(400).send({
      status: 'error',
      message: 'confidence_score must be a number between 0 and 1'
    });
  }

  const payload = {
    event_id: `EARTHQUAKE_${sourceId}`,
    event_type: 'earthquake',
    mitigation_advice: body.mitigation_advice || '(no advice provided by n8n)',
    confidence_score: typeof body.confidence_score === 'number' ? body.confidence_score : 1.0,
    raw_response: { ...body, _source_id: sourceId, _callback: 'earthquake' }
  };

  console.log('[N8N CALLBACK] Earthquake mitigation received', { source_id: sourceId, advice_len: payload.mitigation_advice.length });

  try {
    const { insertId } = await persistMitigation(payload);
    return reply.code(201).send({
      status: 'success',
      message: 'Earthquake callback recorded.',
      source_id: sourceId,
      event_id: payload.event_id,
      event_type: payload.event_type,
      insert_id: insertId
    });
  } catch (error) {
    console.error('[N8N CALLBACK] Earthquake DB Insert Failed', { err: error.message, source_id: sourceId });
    return reply.code(500).send({
      status: 'error',
      message: 'Database failure.'
    });
  }
}

module.exports = {
  receiveMitigationData,
  getMitigationHistory,
  receiveThermalCallback,
  receiveEarthquakeCallback
};
