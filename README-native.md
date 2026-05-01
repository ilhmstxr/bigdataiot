# BigData API Server - Native Node.js HTTPS

Server API BigData yang sepenuhnya menggunakan **native Node.js** `http`/`https` modules (tanpa Fastify/Express), dengan **Force HTTPS** secara default.

## 🚀 Quick Start

### Prerequisites
- Node.js >= 18.0.0
- MySQL/MariaDB
- OpenSSL (untuk generate SSL cert)

### 1. Install & Setup

```bash
# Install dependencies
npm install axios dotenv mysql2

# Generate SSL certificate (development)
mkdir ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout ssl/key.pem \
  -out ssl/cert.pem \
  -subj '/CN=localhost' \
  -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1'

# Copy environment config
cp .env.example .env
# Edit .env sesuai database config Anda
```

### 2. Run Server

```bash
node native-server.js
```

Server akan berjalan di:
- **HTTPS**: `https://localhost:3443` (primary)
- **HTTP**: `http://localhost:3000` (auto-redirect ke HTTPS)

### 3. Test

```bash
# Health check (HTTPS dengan self-signed cert)
curl https://localhost:3443/api/health --insecure

# Atau via HTTP redirect
curl -L http://localhost:3000/api/health
```

## 📁 File Structure

```
server4/
├── native-server.js          # Entry point - HTTPS server + router
├── config/
│   └── database.js           # MySQL connection pool
├── controllers/
│   ├── iot-controller-native.js      # Sensor data ingestion
│   ├── mitigationLog-native.js       # n8n callbacks
│   └── earthquakeLog-native.js       # BMKG data retrieval
├── bmkg-service-native.js    # Background poller untuk BMKG
├── ssl/                      # SSL certificates
│   ├── key.pem
│   └── cert.pem
├── public/                   # Static frontend files
├── .env                      # Environment variables
└── api-fix.md               # Full API documentation
```

## 🔒 HTTPS Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT_HTTPS` | `3443` | HTTPS server port |
| `PORT_HTTP` | `3000` | HTTP redirect port |
| `FORCE_HTTPS` | `true` | Auto-redirect HTTP → HTTPS |
| `SSL_KEY_PATH` | `./ssl/key.pem` | Private key path |
| `SSL_CERT_PATH` | `./ssl/cert.pem` | Certificate path |

### Production SSL

Untuk production, ganti dengan certificate dari CA yang valid (Let's Encrypt, dll):

```bash
# Let's Encrypt (example)
SSL_KEY_PATH=/etc/letsencrypt/live/yourdomain.com/privkey.pem
SSL_CERT_PATH=/etc/letsencrypt/live/yourdomain.com/fullchain.pem
```

## 🔌 API Endpoints

### Health Checks
- `GET /api/health` - Server health
- `GET /api/n8n/health` - n8n service health
- `GET /api/bmkg/health` - BMKG service health

### IoT Sensor
- `POST /api/sensor/ingest` - Ingest thermal data dari ESP32

### n8n Integration
- `POST /api/n8n/mitigation` - Terima data mitigasi
- `POST /api/n8n/webhook` - Webhook alias
- `GET /api/n8n/history` - Riwayat mitigasi
- `POST /webhook-test/n8n/thermal` - Callback dari n8n (thermal)
- `POST /webhook-test/n8n/earthquake` - Callback dari n8n (gempa)

### BMKG
- `GET /api/bmkg/latest` - Data gempa terbaru
- `GET /api/bmkg/history` - Riwayat gempa

### Static Files
- `GET /` - Serve `public/index.html`
- `GET /{file}` - Serve static assets dari folder `public/`

## 🔄 Data Flow (Round-Trip)

```
[ESP32] → POST https://localhost:3443/api/sensor/ingest
    ↓
[Server] → Insert DB (thermal_logs) + Outbound webhook ke n8n
    ↓
[n8n] → Proses AI/rule engine
    ↓
[n8n] → POST https://localhost:3443/webhook-test/n8n/thermal
    ↓
[Server] → Insert DB (mitigation_logs)
```

## 🛠️ Architecture

```
native-server.js
├── HTTPS Server (3443)
│   ├── Body Parser (native stream)
│   ├── Router (object-based routes)
│   ├── Controllers (async handlers)
│   └── Static Serving (fs + mime-types)
├── HTTP Redirect Server (3000)
└── BMKG Poller (60s interval)
```

### Native vs Fastify

| Aspek | Native (Ini) | Fastify (Lama) |
|-------|--------------|----------------|
| Framework | None | Fastify |
| Dependencies | 3 (axios, dotenv, mysql2) | 10+ |
| Body Parsing | Native stream | `@fastify/body-parser` |
| Routing | Object table | Plugin system |
| Static Files | `fs` module | `@fastify/static` |
| Validation | Manual | JSON Schema |
| Bundle Size | ~50KB | ~2MB |

## 📝 Environment Variables

```bash
# Server
PORT_HTTPS=3443
PORT_HTTP=3000
FORCE_HTTPS=true
SSL_KEY_PATH=./ssl/key.pem
SSL_CERT_PATH=./ssl/cert.pem

# Database
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=bigdata

# Webhooks (opsional)
N8N_GEMPA_WEBHOOK_URL=https://demo-n8n.isslab.web.id/webhook-test/gempa-baru
N8N_THERMAL_WEBHOOK_URL=https://demo-n8n.isslab.web.id/webhook-test/sk
```

## 🧪 Testing

```bash
# Sensor ingest
curl -X POST https://localhost:3443/api/sensor/ingest --insecure \
  -H "Content-Type: application/json" \
  -d '{"device_id": "ESP32_001", "window_start": 1714550400, "window_end": 1714554000, "temperature": {"max": 35.5, "max_ts": 1714552000, "min": 28.2, "min_ts": 1714550600, "avg": 31.85}, "humidity": {"max": 75.0, "max_ts": 1714551000, "min": 65.0, "min_ts": 1714553000, "avg": 70.0}}'

# n8n callback simulation
curl -X POST https://localhost:3443/webhook-test/n8n/thermal --insecure \
  -H "Content-Type: application/json" \
  -d '{"source_id": "42", "mitigation_advice": "Aktifkan AC", "confidence_score": 0.92}'
```

## 📚 Documentation

Lihat [`api-fix.md`](api-fix.md) untuk dokumentasi API lengkap.

## 🔄 Migration dari Fastify

Jika Anda sebelumnya menggunakan Fastify (`server.js`):

1. Backup `.env` Anda
2. Generate SSL certificates
3. Update `package.json` atau gunakan `package-native.json`
4. Jalankan `node native-server.js` (bukan `node server.js`)

**Breaking Changes:**
- Port default berubah: 3000 → 3443 (HTTPS)
- Semua request sekarang HTTPS (wajib --insecure untuk self-signed)
- HTTP port 3000 sekarang auto-redirect ke HTTPS

## 📄 License

MIT
