# API Documentation — BigData Server (server4)

Framework: **Native Node.js** (`http`/`https` modules - No Fastify/Express)  
Protocol: **HTTPS** (Force HTTPS - auto-redirect HTTP to HTTPS)  
Base URL: `https://localhost:3443` (HTTPS) | `http://localhost:3000` (HTTP → redirect HTTPS)  
Database: **MySQL/MariaDB** (`big_data_sitasi`)

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT_HTTPS` | No | `3443` | Port HTTPS server |
| `PORT_HTTP` | No | `3000` | Port HTTP redirect server (redirect ke HTTPS jika FORCE_HTTPS=true) |
| `FORCE_HTTPS` | No | `true` | Force redirect semua HTTP ke HTTPS (set 'false' untuk disable) |
| `SSL_KEY_PATH` | No | `./ssl/key.pem` | Path ke SSL private key |
| `SSL_CERT_PATH` | No | `./ssl/cert.pem` | Path ke SSL certificate |
| `DB_HOST` | Yes | — | Host database MySQL |
| `DB_USER` | Yes | — | Username database |
| `DB_PASSWORD` | Yes | — | Password database |
| `DB_NAME` | Yes | — | Nama database |
| `N8N_GEMPA_WEBHOOK_URL` | No | — | URL outbound webhook ke n8n untuk data gempa baru. |
| `N8N_THERMAL_WEBHOOK_URL` | No | — | URL outbound webhook ke n8n untuk sensor data masuk. |

---

## Database Schema

### Tabel `thermal_logs`
Menyimpan data sensor IoT dari ESP32.

### Tabel `mitigation_logs`
Menyimpan data mitigasi dari n8n/Gemini AI.

### Tabel `earthquake_logs`
Menyimpan data gempa dari BMKG.

---

## 1. Health Checks

### `GET /api/health`
**cURL Test:**
```bash
curl -k -X GET https://localhost:3443/api/health
```

### `GET /api/n8n/health`
**cURL Test:**
```bash
curl -k -X GET https://localhost:3443/api/n8n/health
```

### `GET /api/bmkg/health`
**cURL Test:**
```bash
curl -k -X GET https://localhost:3443/api/bmkg/health
```

---

## 2. IoT Routes

### `POST /api/sensor/ingest`
Menerima data sensor aggregated dari perangkat ESP32.

**cURL Test:**
```bash
curl -k -X POST https://localhost:3443/api/sensor/ingest \
-H "Content-Type: application/json" \
-d '{
  "device_id": "ESP32_001",
  "window_start": 1714550400,
  "window_end": 1714554000,
  "temperature": {
    "max": 35.5,
    "max_ts": 1714552000,
    "min": 28.2,
    "min_ts": 1714550600,
    "avg": 31.85
  },
  "humidity": {
    "max": 75.0,
    "max_ts": 1714551000,
    "min": 65.0,
    "min_ts": 1714553000,
    "avg": 70.0
  }
}'
```

---

## 3. n8n / AI Routes

### `POST /api/n8n/mitigation`
Menerima data mitigasi dari n8n/Gemini AI.

**cURL Test:**
```bash
curl -k -X POST https://localhost:3443/api/n8n/mitigation \
-H "Content-Type: application/json" \
-d '{
  "event_id": "EVT_001",
  "event_type": "thermal_anomaly",
  "mitigation_advice": "High temperature detected. Ensure proper ventilation.",
  "confidence_score": 0.85,
  "raw_response": { "source": "gemini" }
}'
```

### `POST /api/n8n/webhook`
Alias webhook untuk n8n automation. Sama seperti mitigasi di atas.

**cURL Test:**
```bash
curl -k -X POST https://localhost:3443/api/n8n/webhook \
-H "Content-Type: application/json" \
-d '{
  "event_id": "EVT_002",
  "event_type": "flood",
  "mitigation_advice": "Evacuate the area.",
  "confidence_score": 0.99
}'
```

### `GET /api/n8n/history`
Mengambil riwayat data mitigasi (dengan pagination filter).

**cURL Test:**
```bash
curl -k -X GET "https://localhost:3443/api/n8n/history?limit=5"
```

---

## 4. Webhook Callbacks

### `POST /webhook-test/n8n/thermal`
Callback dari n8n setelah memproses data **thermal**.

**cURL Test:**
```bash
curl -k -X POST https://localhost:3443/webhook-test/n8n/thermal \
-H "Content-Type: application/json" \
-d '{
  "source_id": "1",
  "mitigation_advice": "Aktifkan AC zona A",
  "confidence_score": 0.92
}'
```

### `POST /webhook-test/n8n/earthquake`
Callback dari n8n setelah memproses data **gempa**.

**cURL Test:**
```bash
curl -k -X POST https://localhost:3443/webhook-test/n8n/earthquake \
-H "Content-Type: application/json" \
-d '{
  "source_id": "2",
  "mitigation_advice": "Berlindung di bawah meja.",
  "confidence_score": 0.95
}'
```

---

## 5. BMKG Routes

### `GET /api/bmkg/latest`
Mengambil data gempa terbaru yang tersimpan.

**cURL Test:**
```bash
curl -k -X GET https://localhost:3443/api/bmkg/latest
```

### `GET /api/bmkg/history`
Mengambil riwayat data gempa (dengan pagination filter).

**cURL Test:**
```bash
curl -k -X GET "https://localhost:3443/api/bmkg/history?limit=10"
```
