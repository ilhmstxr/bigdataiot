// Database configuration
const db = require('../config/database');

/**
 * Helper internal: insert satu record ke `mitigation_logs`.
 * Dipakai oleh `receiveMitigationData` (POST /api/n8n/mitigation, /api/n8n/webhook)
 * dan callback handler (POST /api/webhook/n8n/thermal|earthquake/:id).
 *
 * @param {{
 *   event_id: string,
 *   event_type: string,
 *   mitigation_advice: string,
 *   confidence_score: number,
 *   raw_response?: object
 * }} payload
 * @returns {Promise<{insertId:number}>}
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

async function receiveMitigationData(request, reply) {
  const payload = request.body;

  // Validasi payload yang diterima dari n8n/Gemini
  const requiredFields = ['event_id', 'event_type', 'mitigation_advice', 'confidence_score'];
  for (const field of requiredFields) {
    if (payload[field] === undefined || payload[field] === null) {
      return reply.code(400).send({
        status: 'error',
        message: `Missing required field: ${field}`
      });
    }
  }

  try {
    const { insertId } = await persistMitigation(payload);
    return reply.code(201).send({
      status: 'success',
      message: 'Mitigation data recorded.',
      insert_id: insertId
    });
  } catch (error) {
    request.log.error({ err: error }, 'DB Insert Failed');
    return reply.code(500).send({
      status: 'error',
      message: 'Database failure.'
    });
  }
}

/**
 * POST /api/webhook/n8n/thermal
 * Callback dari n8n setelah memproses data thermal (event_type: thermal_anomaly).
 * `source_id` di-body = referensi insert_id dari `thermal_logs` (record sensor asli).
 * Body fleksibel: hanya `mitigation_advice` dan `confidence_score` yang dipakai langsung;
 * field lain disimpan di `raw_response` untuk audit trail.
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

  const payload = {
    event_id: `THERMAL_${sourceId}`,
    event_type: 'thermal_anomaly',
    mitigation_advice: body.mitigation_advice || '(no advice provided by n8n)',
    confidence_score: typeof body.confidence_score === 'number' ? body.confidence_score : 1.0,
    raw_response: { ...body, _source_id: sourceId, _callback: 'thermal' }
  };

  request.log.info({ source_id: sourceId, advice_len: payload.mitigation_advice.length },
    '[N8N CALLBACK] Thermal mitigation received');

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
    request.log.error({ err: error, source_id: sourceId }, '[N8N CALLBACK] Thermal DB Insert Failed');
    return reply.code(500).send({
      status: 'error',
      message: 'Database failure.'
    });
  }
}

/**
 * POST /api/webhook/n8n/earthquake
 * Callback dari n8n setelah memproses data gempa (event_type: earthquake).
 * `source_id` di-body = referensi insert_id dari `earthquake_logs` (record gempa asli).
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

  const payload = {
    event_id: `EARTHQUAKE_${sourceId}`,
    event_type: 'earthquake',
    mitigation_advice: body.mitigation_advice || '(no advice provided by n8n)',
    confidence_score: typeof body.confidence_score === 'number' ? body.confidence_score : 1.0,
    raw_response: { ...body, _source_id: sourceId, _callback: 'earthquake' }
  };

  request.log.info({ source_id: sourceId, advice_len: payload.mitigation_advice.length },
    '[N8N CALLBACK] Earthquake mitigation received');

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
    request.log.error({ err: error, source_id: sourceId }, '[N8N CALLBACK] Earthquake DB Insert Failed');
    return reply.code(500).send({
      status: 'error',
      message: 'Database failure.'
    });
  }
}

async function getMitigationHistory(request, reply) {
  const { event_id, limit = 50, offset = 0 } = request.query;

  try {
    let query = `
      SELECT * FROM mitigation_logs 
      WHERE 1=1
    `;
    const params = [];

    if (event_id) {
      query += ' AND event_id = ?';
      params.push(event_id);
    }

    query += ' ORDER BY processed_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [results] = await db.query(query, params);
    
    return reply.code(200).send({
      status: 'success',
      data: results,
      total: results.length
    });
  } catch (error) {
    request.log.error({ err: error }, 'DB Query Failed');
    return reply.code(500).send({ 
      status: 'error', 
      message: 'Database failure.' 
    });
  }
}

module.exports = {
  receiveMitigationData,
  receiveThermalCallback,
  receiveEarthquakeCallback,
  getMitigationHistory,
  persistMitigation
};
