// Di dalam file server.js Anda, sebelum "app.listen()"
const bmkgService = require('./services/bmkgIngestor');

// Ambil URL Webhook n8n dari environment variable (.env)
const webhookUrl = process.env.N8N_GEMPA_WEBHOOK_URL; 

// Start polling setiap 60,000 ms (1 menit)
bmkgService.startPoller(60000, webhookUrl, app.log);