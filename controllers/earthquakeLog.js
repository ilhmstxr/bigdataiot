/**
 * Earthquake Log Controller - Native Node.js Version
 * Handles BMKG earthquake data retrieval
 */

const db = require('../config/database');

/**
 * Helper: save earthquake data (for BMKG service)
 */
async function saveEarthquakeData(gempa) {
  // Generate quake_id dari Tanggal dan Jam
  const quakeId = `${gempa.Tanggal}_${gempa.Jam}`;
  
  const query = `
    INSERT IGNORE INTO earthquake_logs
    (quake_id, tanggal, jam, datetime, coordinates, lintang, bujur, magnitude, kedalaman, wilayah, potensi, dirasakan)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  const values = [
    quakeId,
    gempa.Tanggal,
    gempa.Jam,
    gempa.DateTime,
    gempa.Coordinates,
    gempa.Lintang,
    gempa.Bujur,
    gempa.Magnitude,
    gempa.Kedalaman,
    gempa.Wilayah,
    gempa.Potensi || null,
    gempa.Dirasakan || null
  ];

  const [result] = await db.query(query, values);
  return result;
}

/**
 * GET /api/bmkg/latest
 * Mengambil data gempa terbaru dari database
 */
async function getLatestEarthquake(request, reply) {
  try {
    const [rows] = await db.query(
      'SELECT * FROM earthquake_logs ORDER BY datetime DESC LIMIT 1'
    );
    
    if (rows.length === 0) {
      return reply.code(404).send({
        status: 'error',
        message: 'No earthquake data found'
      });
    }
    
    return reply.send({
      status: 'success',
      data: rows[0]
    });
  } catch (error) {
    console.error('[BMKG] Get Latest Error', { err: error.message });
    return reply.code(500).send({
      status: 'error',
      message: 'Database query failed.'
    });
  }
}

/**
 * GET /api/bmkg/history
 * Mengambil riwayat gempa dengan pagination dan filter
 */
async function getEarthquakeHistory(request, reply) {
  const { limit = '20', offset = '0', min_magnitude } = request.query;
  
  const limitNum = parseInt(limit) || 20;
  const offsetNum = parseInt(offset) || 0;

  try {
    let query = 'SELECT * FROM earthquake_logs WHERE 1=1';
    const values = [];
    
    if (min_magnitude) {
      query += ' AND magnitude >= ?';
      values.push(parseFloat(min_magnitude));
    }
    
    query += ' ORDER BY datetime DESC LIMIT ? OFFSET ?';
    values.push(limitNum, offsetNum);

    const [rows] = await db.query(query, values);
    
    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM earthquake_logs WHERE 1=1';
    const countValues = [];
    if (min_magnitude) {
      countQuery += ' AND magnitude >= ?';
      countValues.push(parseFloat(min_magnitude));
    }
    const [countResult] = await db.query(countQuery, countValues);
    
    return reply.send({
      status: 'success',
      count: rows.length,
      total: countResult[0].total,
      offset: offsetNum,
      limit: limitNum,
      data: rows
    });
  } catch (error) {
    console.error('[BMKG] Get History Error', { err: error.message });
    return reply.code(500).send({
      status: 'error',
      message: 'Database query failed.'
    });
  }
}

module.exports = {
  saveEarthquakeData,
  getLatestEarthquake,
  getEarthquakeHistory
};
