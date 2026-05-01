// Asumsi pool koneksi database diekspor dari config/database.js
const db = require('../config/database');

async function ingestThermalData(request, reply) {
  const payload = request.body;

  // Prepared Statement: Cegah SQL Injection & parsing efisien
  const query = `
    INSERT INTO thermal_logs 
    (device_id, window_start, window_end, temp_max, temp_min, temp_avg, hum_max, hum_min, hum_avg)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  // Membongkar (flatten) struktur JSON dari ESP32
  const values = [
    payload.device_id,
    payload.window_start,
    payload.window_end,
    payload.temperature.max,
    payload.temperature.min,
    payload.temperature.avg,
    payload.humidity.max,
    payload.humidity.min,
    payload.humidity.avg
  ];

  try {
    const [result] = await db.query(query, values);
    
    // HTTP 201 Created
    return reply.code(201).send({
      status: 'success',
      message: 'Edge data recorded.',
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

module.exports = {
  ingestThermalData
};