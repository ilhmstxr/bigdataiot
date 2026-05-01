const db = require('../config/database');

async function saveEarthquakeData(gempaData) {
  const quakeId = `${gempaData.Tanggal}_${gempaData.Jam}`;

  const query = `
    INSERT IGNORE INTO earthquake_logs
    (quake_id, tanggal, jam, datetime_utc, coordinates, lintang, bujur,
     magnitude, kedalaman, wilayah, potensi, dirasakan, shakemap, raw_data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const values = [
    quakeId,
    gempaData.Tanggal,
    gempaData.Jam,
    new Date(gempaData.DateTime),
    gempaData.Coordinates,
    gempaData.Lintang,
    gempaData.Bujur,
    parseFloat(gempaData.Magnitude),
    gempaData.Kedalaman,
    gempaData.Wilayah,
    gempaData.Potensi,
    gempaData.Dirasakan,
    gempaData.Shakemap,
    JSON.stringify(gempaData)
  ];

  const [result] = await db.query(query, values);
  return result;
}

async function getEarthquakeHistory(request, reply) {
  const { limit = 20, offset = 0, min_magnitude } = request.query;

  try {
    let query = `SELECT * FROM earthquake_logs WHERE 1=1`;
    const params = [];

    if (min_magnitude) {
      query += ' AND magnitude >= ?';
      params.push(parseFloat(min_magnitude));
    }

    query += ' ORDER BY datetime_utc DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [results] = await db.query(query, params);

    return reply.code(200).send({
      status: 'success',
      data: results,
      total: results.length
    });
  } catch (error) {
    request.log.error({ err: error }, 'Earthquake History Query Failed');
    return reply.code(500).send({
      status: 'error',
      message: 'Database failure.'
    });
  }
}

async function getLatestEarthquake(request, reply) {
  try {
    const [results] = await db.query(
      `SELECT * FROM earthquake_logs ORDER BY datetime_utc DESC LIMIT 1`
    );

    if (results.length === 0) {
      return reply.code(404).send({ status: 'error', message: 'No earthquake data found.' });
    }

    return reply.code(200).send({
      status: 'success',
      data: results[0]
    });
  } catch (error) {
    request.log.error({ err: error }, 'Latest Earthquake Query Failed');
    return reply.code(500).send({
      status: 'error',
      message: 'Database failure.'
    });
  }
}

module.exports = {
  saveEarthquakeData,
  getEarthquakeHistory,
  getLatestEarthquake
};
