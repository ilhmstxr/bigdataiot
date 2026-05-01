// Database configuration
const db = require('../config/database');

async function receiveMitigationData(request, reply) {
  const payload = request.body;

  // Validasi payload yang diterima dari n8n/Gemini
  const requiredFields = ['event_id', 'event_type', 'mitigation_advice', 'confidence_score'];
  for (const field of requiredFields) {
    if (!payload[field]) {
      return reply.code(400).send({
        status: 'error',
        message: `Missing required field: ${field}`
      });
    }
  }

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

  try {
    const [result] = await db.query(query, values);
    
    return reply.code(201).send({
      status: 'success',
      message: 'Mitigation data recorded.',
      insert_id: result.insertId
    });
  } catch (error) {
    request.log.error({ err: error }, 'DB Insert Failed');
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
  getMitigationHistory
};
