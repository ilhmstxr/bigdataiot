/**
 * BMKG Service - Native Node.js Version
 * Poller untuk data gempa dari BMKG
 */

const axios = require('axios');
const { saveEarthquakeData } = require('./controllers/earthquakeLog-native');

// RAM State: Menyimpan memori gempa terakhir (Deduplication)
let lastQuakeId = null;
let pollerInterval = null;

/**
 * Check BMKG untuk data gempa baru
 */
async function checkBMKG(logger, n8nWebhookUrl) {
  try {
    // Timeout HTTP 10s: BMKG sering lambat, jangan biarkan proses menggantung
    const response = await axios.get('https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json', { 
        timeout: 10000 
    });
    
    const gempa = response.data?.Infogempa?.gempa;
    if (!gempa) {
      if (logger) logger('[BMKG] No gempa data in response');
      return;
    }

    // Membuat ID Unik dari Tanggal dan Jam kejadian
    const currentQuakeId = `${gempa.Tanggal}_${gempa.Jam}`;

    // LOGIKA DEDUPLIKASI: Jika data sama seperti menit lalu, ABAIKAN.
    if (currentQuakeId === lastQuakeId) {
      return; 
    }

    // --- GEMPA BARU TERDETEKSI ---
    lastQuakeId = currentQuakeId;
    if (logger) logger(`[SEISMIC] Gempa baru terdeteksi: ${currentQuakeId} Mag: ${gempa.Magnitude}`);

    // Simpan raw data gempa ke database
    let earthquakeInsertId = 0;
    try {
      const result = await saveEarthquakeData(gempa);
      earthquakeInsertId = result?.insertId || 0;
      if (logger) logger(`[SEISMIC] Raw data gempa disimpan ke DB: ${currentQuakeId} (insert_id=${earthquakeInsertId})`);
    } catch (dbErr) {
      if (logger) logger(`[SEISMIC] Gagal simpan ke DB: ${dbErr.message}`);
    }

    // Trigger n8n Webhook secara asinkron (jangan tunggu balasan n8n).
    // n8n diharapkan POST balik ke `/webhook-test/n8n/earthquake`
    // dengan body.source_id = insert_id setelah selesai memproses
    if (n8nWebhookUrl) {
      axios.post(n8nWebhookUrl, {
        event_type: 'gempa_baru',
        quake_id: currentQuakeId,
        insert_id: earthquakeInsertId,
        callback_url: '/webhook-test/n8n/earthquake',
        gempa_data: gempa
        // Catatan: Jika server bertugas hitung jarak Haversine, kalkulasi dan tambahkan 'jarak_km' ke sini
      }, { timeout: 10000 }).catch(err => {
        if (logger) logger(`[SEISMIC] Gagal mengirim Webhook ke n8n: ${err.message}`);
      });
    }

  } catch (error) {
    if (logger) logger(`[BMKG] Fetch Error: ${error.message}`);
  }
}

/**
 * Start BMKG poller
 */
function startPoller(intervalMs, n8nWebhookUrl, logger) {
  // Jalankan segera sekali
  checkBMKG(logger, n8nWebhookUrl);
  
  // Schedule interval
  pollerInterval = setInterval(() => {
    checkBMKG(logger, n8nWebhookUrl);
  }, intervalMs);
  
  if (logger) logger(`[BMKG] Poller started with ${intervalMs}ms interval`);
  
  return pollerInterval;
}

/**
 * Stop BMKG poller
 */
function stopPoller(logger) {
  if (pollerInterval) {
    clearInterval(pollerInterval);
    pollerInterval = null;
    if (logger) logger('[BMKG] Poller stopped');
  }
}

module.exports = {
  checkBMKG,
  startPoller,
  stopPoller
};
