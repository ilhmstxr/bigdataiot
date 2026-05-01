/**
 * IoT Controller - Native Node.js Version
 * Handles thermal sensor data ingestion
 */

const axios = require('axios');
const db = require('../config/database');

/**
 * POST /api/sensor/ingest
 * Menerima data agregat window dari ESP32 dan menyimpan ke thermal_logs
 */
async function ingestThermalData(request, reply, log) {
  const payload = request.body;

  // Validasi manual (schema replacement)
  const requiredFields = ['device_id', 'window_start', 'window_end', 'temperature', 'humidity'];
  for (const field of requiredFields) {
    if (payload[field] === undefined || payload[field] === null) {
      return reply.code(400).send({
        status: 'error',
        message: `Missing required field: ${field}`
      });
    }
  }

  // Validasi nested temperature/humidity
  const requiredStats = ['max', 'max_ts', 'min', 'min_ts', 'avg'];
  for (const stat of requiredStats) {
    if (payload.temperature[stat] === undefined || payload.humidity[stat] === undefined) {
      return reply.code(400).send({
        status: 'error',
        message: `Missing required stat field: ${stat} in temperature/humidity`
      });
    }
  }

  const query = `
    INSERT INTO thermal_logs 
    (device_id, window_start, window_end, temp_max, temp_max_ts, temp_min, temp_min_ts, temp_avg, humidity_max, humidity_max_ts, humidity_min, humidity_min_ts, humidity_avg)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  const values = [
    payload.device_id,
    payload.window_start,
    payload.window_end,
    payload.temperature.max,
    payload.temperature.max_ts,
    payload.temperature.min,
    payload.temperature.min_ts,
    payload.temperature.avg,
    payload.humidity.max,
    payload.humidity.max_ts,
    payload.humidity.min,
    payload.humidity.min_ts,
    payload.humidity.avg
  ];

  try {
    const [result] = await db.query(query, values);

    // Outbound webhook ke n8n (fire-and-forget)
    const thermalWebhookUrl = process.env.N8N_THERMAL_WEBHOOK_URL;
    if (thermalWebhookUrl) {
      axios.post(thermalWebhookUrl, {
        event_type: 'thermal_window',
        device_id: payload.device_id,
        window_start: payload.window_start,
        window_end: payload.window_end,
        temperature: payload.temperature,
        humidity: payload.humidity,
        insert_id: result.insertId,
        callback_url: '/webhook-test/n8n/thermal',
        recorded_at: new Date().toISOString()
      }, { timeout: 10000 }).catch(err => {
        if (log) log.error({ err: err.message }, '[THERMAL] Gagal mengirim webhook ke n8n');
      });
    }

    // HTTP 201 Created
    return reply.code(201).send({
      status: 'success',
      message: 'Edge data recorded.',
      insert_id: result.insertId,
      device_id: payload.device_id,
      window_start: payload.window_start
    });

  } catch (error) {
    if (log) log.error({ err: error.message }, '[DB] Gagal menyimpan thermal data');
    return reply.code(500).send({
      status: 'error',
      message: 'Database operation failed.'
    });
  }
}

module.exports = {
  ingestThermalData
};
