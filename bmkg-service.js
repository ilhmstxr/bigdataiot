const axios = require('axios');
const { saveEarthquakeData } = require('./controllers/earthquakeLog');

// RAM State: Menyimpan memori gempa terakhir (Deduplication)
let lastQuakeId = null;

async function checkBMKG(fastifyLogger, n8nWebhookUrl) {
  try {
    // Timeout HTTP 10s: BMKG sering lambat, jangan biarkan proses menggantung
    const response = await axios.get('https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json', { 
        timeout: 10000 
    });
    
    const gempa = response.data?.Infogempa?.gempa;
    if (!gempa) return;

    // Membuat ID Unik dari Tanggal dan Jam kejadian
    const currentQuakeId = `${gempa.Tanggal}_${gempa.Jam}`;

    // LOGIKA DEDUPLIKASI: Jika data sama seperti menit lalu, ABAIKAN.
    if (currentQuakeId === lastQuakeId) {
      return; 
    }

    // --- GEMPA BARU TERDETEKSI ---
    lastQuakeId = currentQuakeId;
    if (fastifyLogger) fastifyLogger.info(`[SEISMIC] Gempa baru terdeteksi: ${currentQuakeId} Mag: ${gempa.Magnitude}`);

    // Simpan raw data gempa ke database
    try {
      await saveEarthquakeData(gempa);
      if (fastifyLogger) fastifyLogger.info(`[SEISMIC] Raw data gempa disimpan ke DB: ${currentQuakeId}`);
    } catch (dbErr) {
      if (fastifyLogger) fastifyLogger.error(`[SEISMIC] Gagal simpan ke DB: ${dbErr.message}`);
    }

    // Trigger n8n Webhook secara asinkron (jangan tunggu balasan n8n)
    if (n8nWebhookUrl) {
      axios.post(n8nWebhookUrl, {
        event_type: 'gempa_baru',
        gempa_data: gempa
        // Catatan: Jika server bertugas hitung jarak Haversine, kalkulasi dan tambahkan 'jarak_km' ke sini
      }).catch(err => {
        if (fastifyLogger) fastifyLogger.error('Gagal mengirim Webhook ke n8n');
      });
    }

  } catch (error) {
    if (fastifyLogger) fastifyLogger.error(`[BMKG] Fetch Error: ${error.message}`);
  }
}

// Fungsi ini dipanggil SATU KALI saat server.js melakukan booting
function startPoller(intervalMs, n8nWebhookUrl, logger) {
  logger.info(`Memulai BMKG Poller (Interval: ${intervalMs}ms)`);
  
  // Eksekusi tarikan pertama sesaat setelah server menyala
  checkBMKG(logger, n8nWebhookUrl);
  
  // Eksekusi berulang setiap N milidetik
  const timer = setInterval(() => checkBMKG(logger, n8nWebhookUrl), intervalMs);
  
  // unref(): Memastikan timer ini tidak menahan server saat proses shutdown (SIGTERM)
  timer.unref(); 
  return timer;
}

module.exports = {
  startPoller
};