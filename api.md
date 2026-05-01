# API Reference — CORE_MITIGATION_OS (server3)

Dokumen ini merangkum seluruh endpoint HTTP yang diekspos oleh Fastify API
Gateway pada `server.js`. Sumber pemetaan URL: `routes/api.js`. Default base
URL pengembangan adalah `http://localhost:3000` (di produksi, Nginx mem-proxy
dari `:3003` lihat `sites-available.md`).

| # | Method | Path                          | Handler / Controller                          | Tujuan |
|---|--------|-------------------------------|-----------------------------------------------|--------|
| 1 | POST   | `/api/sensor/ingest`          | `controllers/sensorLog.js → ingestThermalData`| Menerima ringkasan thermal/humidity dari ESP32 |
| 2 | GET    | `/api/sensor/latest`          | `controllers/sensorLog.js → fetchLatestMetrics`| Mengembalikan metrik thermal terbaru (untuk n8n) |
| 3 | POST   | `/api/mitigasi/log`           | `controllers/mitigationLog.js → logAiMitigation`| Audit trail keputusan AI (Gemini via n8n) |
| 4 | GET    | `/api/dashboard/overview`     | `controllers/dashboard.js → buildOverviewHandler`| Ringkasan untuk header & 2 panel atas dashboard |
| 5 | GET    | `/api/dashboard/thermal-trend`| `controllers/dashboard.js → thermalTrend`     | Data line chart suhu/kelembapan N menit terakhir |
| 6 | GET    | `/api/dashboard/audit`        | `controllers/dashboard.js → auditTrail`       | N keputusan mitigasi terakhir (audit table) |
| 7 | OPTIONS| `/*` (wildcard)               | inline di `server.js`                         | CORS preflight, balas `204 No Content` |
| 8 | GET    | `/health`                     | inline di `routes/api.js`                     | Liveness probe |

> Semua endpoint dibungkus CORS via hook `onSend` di `server.js`
> (`Access-Control-Allow-Origin` = `process.env.CORS_ALLOW_ORIGIN` atau `*`).

---

## 1. `POST /api/sensor/ingest`

Ingestion ringkasan window dari ESP32 (payload ~1 KB, agregat per window).

**Request body** (JSON, semua field wajib):

```json
{
  "device_id": "ESP32-DC-01",
  "window_start": 1730457600,
  "window_end":   1730457660,
  "temperature": {
    "max": 31.4, "max_ts": 1730457612,
    "min": 28.9, "min_ts": 1730457633,
    "avg": 30.1
  },
  "humidity": {
    "max": 71.2, "max_ts": 1730457620,
    "min": 65.0, "min_ts": 1730457640,
    "avg": 68.3
  }
}
```

Validasi schema dilakukan oleh Fastify (lihat `routes/api.js:23-58`). Payload
tidak sesuai DTO akan ditolak otomatis dengan HTTP 400.

**Response 201**:

```json
{ "status": "success", "message": "Edge data recorded.", "insert_id": 123 }
```

**Error**: `400` (validasi field), `500` (`Database failure.`).

---

## 2. `GET /api/sensor/latest`

Mengambil baris terbaru dari `thermal_logs` (LIMIT 1, terindeks `created_at`).
Konsumen utama: workflow n8n.

**Response 200**:

```json
{
  "status": "success",
  "data": {
    "timestamp_sistem": "2025-11-01T08:00:00.000Z",
    "suhu":       { "rata_rata": 30.1, "puncak": 31.4 },
    "kelembapan": { "rata_rata": 68.3, "puncak": 71.2 }
  }
}
```

**Error**: `404` (`No edge data available.`), `500` (`Query failure.`).

---

## 3. `POST /api/mitigasi/log`

Mencatat keputusan Cloud LLM (Gemini) yang dipanggil n8n ke
`mitigation_logs` sebagai audit trail.

**Request body** (semua field wajib):

```json
{
  "magnitudo": 5.6,
  "jarak_km": 87.4,
  "suhu_referensi": 30.1,
  "status_bahaya": "Waspada",
  "rekomendasi_ai": "Aktifkan pendingin cadangan dan monitor selama 30 menit."
}
```

`status_bahaya` dibatasi enum: `"Aman" | "Waspada" | "Kritis"`.

**Response 201**:

```json
{ "status": "success", "message": "AI mitigation decision logged.", "insert_id": 456 }
```

**Error**: `400` (validasi/enum), `500` (`Audit trail failure.`).

---

## 4. `GET /api/dashboard/overview`

Mengagregasi data terbaru untuk dashboard React (header + 2 panel atas):
thermal terbaru, mitigation terbaru, gempa BMKG terbaru (in-memory dari
`services/bmkgIngestor`), serta jarak haversine ke datacenter.

Koordinat datacenter dibaca dari `process.env.DATACENTER_LAT` /
`DATACENTER_LON` (lihat `controllers/dashboard.js:20-29`).

**Response 200** (contoh):

```json
{
  "status": "success",
  "data": {
    "server_time": "2025-11-01T08:00:00.000Z",
    "datacenter": { "name": "CORE_MITIGATION_DC", "coords": { "lat": -7.95, "lon": 112.61 } },
    "global_status": "Waspada",
    "thermal":    { "timestamp": "...", "temp_avg": 30.1, "temp_max": 31.4, "hum_avg": 68.3, "hum_max": 71.2 },
    "mitigation": { "timestamp": "...", "magnitudo": 5.6, "jarak_km": 87.4, "suhu_referensi": 30.1, "status_bahaya": "Waspada", "rekomendasi_ai": "..." },
    "seismic": {
      "tanggal": "01 Nov 2025", "jam": "14:23:11 WIB",
      "datetime": "2025-11-01T07:23:11+00:00",
      "magnitudo": 5.6, "kedalaman": "10 km",
      "wilayah": "Pusat gempa berada di laut ...",
      "potensi": "Tidak berpotensi tsunami",
      "coordinates": { "lat": -8.12, "lon": 113.05 },
      "jarak_km": 87.4,
      "fetched_at": "2025-11-01T08:00:00.000Z"
    }
  }
}
```

`global_status` mengikuti `mitigation.status_bahaya` terbaru, default `"Aman"`
bila `mitigation_logs` masih kosong. Field bisa `null` bila belum ada data
(`thermal`, `mitigation`, `seismic`).

**Error**: `500` (`Overview query failure.`).

---

## 5. `GET /api/dashboard/thermal-trend`

Data line chart suhu/kelembapan untuk N menit terakhir.

**Query string**:

| Param     | Tipe    | Default | Batas        | Catatan |
|-----------|---------|---------|--------------|---------|
| `minutes` | integer | `60`    | `1..1440`    | Di luar batas / non-numerik akan di-fallback ke `60`. |

**Response 200**:

```json
{
  "status": "success",
  "data": {
    "minutes": 60,
    "points": [
      { "t": "2025-11-01T07:01:00.000Z", "temp_avg": 30.0, "temp_max": 30.9, "hum_avg": 68.1 },
      { "t": "2025-11-01T07:02:00.000Z", "temp_avg": 30.1, "temp_max": 31.0, "hum_avg": 68.2 }
    ]
  }
}
```

Urutan ascending (oldest → newest), siap pakai untuk Chart.js.

**Error**: `500` (`Trend query failure.`).

---

## 6. `GET /api/dashboard/audit`

N keputusan mitigasi terakhir untuk tabel Audit Trail.

**Query string**:

| Param   | Tipe    | Default | Batas      | Catatan |
|---------|---------|---------|------------|---------|
| `limit` | integer | `5`     | `1..100`   | Di luar batas / non-numerik akan di-fallback ke `5`. |

**Response 200**:

```json
{
  "status": "success",
  "data": [
    {
      "id": 456,
      "timestamp": "2025-11-01T08:00:00.000Z",
      "magnitudo": 5.6,
      "jarak_km": 87.4,
      "suhu_referensi": 30.1,
      "status_bahaya": "Waspada",
      "rekomendasi_ai": "Aktifkan pendingin cadangan ..."
    }
  ]
}
```

**Error**: `500` (`Audit query failure.`).

---

## 7. `OPTIONS /*` (CORS preflight)

Didefinisikan inline di `server.js:34`:

```js
app.options('/*', async (_req, reply) => reply.code(204).send());
```

Header CORS ditambahkan pada semua respons via hook `onSend`
(`server.js:28-33`).

---

## 8. `GET /health`

Liveness probe sederhana.

**Response 200**:

```json
{ "status": "ok", "service": "datacenter-api" }
```

---

## Catatan Operasional

- **Polling BMKG**: Bukan endpoint HTTP. `services/bmkgIngestor` melakukan
  polling ke `https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json` setiap
  `BMKG_POLL_INTERVAL_MS` (default 60000ms) dan menyimpan hasil terakhir di
  memori. State ini dibaca oleh `/api/dashboard/overview`.
- **Variabel env penting**: `PORT`, `HOST`, `LOG_LEVEL`, `CORS_ALLOW_ORIGIN`,
  `BMKG_POLL_ENABLED`, `BMKG_POLL_INTERVAL_MS`, `DATACENTER_LAT`,
  `DATACENTER_LON`, `DATACENTER_NAME` (lihat `.env.example`).
- **Body limit**: 32 KB (`server.js:20`). Cukup besar untuk payload IoT yang
  ~1 KB per window.

---

# Integrasi IoT (ESP32 → Server)

Bagian ini merangkum **kontrak komunikasi langsung dari perangkat IoT
(ESP32 + sensor DHT22 / DS18B20) ke Fastify API**. IoT punya **dua jalur
upstream** yang berbeda — keduanya tidak boleh tertukar:

| Tujuan        | Endpoint                          | Owner   | Frekuensi tipikal | Tujuan data |
|---------------|-----------------------------------|---------|-------------------|-------------|
| **Server**    | `POST http://server3bigdata.isslab.web.id:3003/api/sensor/ingest`         | Fastify | tiap window (60s) | Audit thermal/humidity → MySQL `thermal_logs` |
| **n8n**       | `POST http://server3bigdata.isslab.web.id:3003/webhook/gempa-baru`        | n8n     | event-driven      | Trigger pipeline AI saat ada gempa BMKG (lihat §B di "Integrasi n8n") |

> Endpoint `/api/sensor/latest` **bukan** dipakai IoT — itu dikonsumsi oleh
> workflow n8n untuk mengambil suhu referensi terbaru saat membangun prompt
> Gemini.

## I. Diagram Alur IoT

```
                     ┌─────────────────────────┐
                     │       ESP32 (IoT)       │
                     │  + DHT22 / DS18B20      │
                     └────┬────────────────┬───┘
        sampling tiap     │                │   trigger event gempa
        2-5 detik (loop)  │                │   (mis. dipicu data BMKG
                          ▼                │    yang di-relay perangkat)
                ┌──────────────────┐       │
                │  Aggregate window│       │
                │  60 detik:       │       │
                │  max/min/avg + ts│       │
                └────────┬─────────┘       │
                         │                 │
   POST /api/sensor/     │                 │  POST /webhook/gempa-baru
   ingest (per window)   ▼                 ▼  (event)
                 ┌──────────────┐    ┌──────────┐
                 │ Fastify API  │    │   n8n    │
                 │ (server3)    │    │ Webhook  │
                 └──────┬───────┘    └────┬─────┘
                        │                 │ (lihat "Integrasi n8n")
                        ▼
                 ┌──────────────┐
                 │ thermal_logs │
                 └──────────────┘
```

## II. `POST /api/sensor/ingest` — Detail Integrasi

Schema lengkap & response codes ada di **§1**. Section ini menambahkan
konteks operasional yang tidak ada di reference endpoint:

### II.1 Strategi window aggregation (di sisi ESP32)

Server **tidak** menerima sample mentah per detik. ESP32 wajib melakukan
agregasi lokal:

1. **Sample**: baca sensor tiap 2–5 detik di dalam loop.
2. **Akumulasi window 60 detik**: simpan `max`, `min`, `avg`, dan timestamp
   epoch (detik UTC) dari `max` & `min`.
3. **Flush**: kirim 1× `POST /api/sensor/ingest` di akhir window, lalu
   reset akumulator.

Rasional: payload tetap ~1 KB/menit (cocok dengan `bodyLimit` 32 KB),
beban DB rendah (1 INSERT/menit per device), tetap cukup granular untuk
trend chart `/api/dashboard/thermal-trend`.

### II.2 Cadence yang disarankan

| Parameter        | Nilai default | Catatan |
|------------------|---------------|---------|
| Sampling rate    | 2 detik       | Sesuaikan dengan latency sensor (DHT22 ≥ 2s). |
| Window length    | 60 detik      | Match dengan resolusi `thermal-trend`. |
| HTTP timeout     | 5–10 detik    | Server di belakang Nginx; jaringan VPS bisa lambat. |
| Retry on failure | 3× exponential backoff (1s, 2s, 4s) | Buffer payload di RAM/SPIFFS jika offline. |

### II.3 Header yang dikirim ESP32

```
POST /api/sensor/ingest HTTP/1.1
Host: server3bigdata.isslab.web.id:3003
Content-Type: application/json
Connection: close
User-Agent: ESP32-DC-01/1.0
```

> Jika auth diaktifkan (lihat §II.6), tambah header `X-Api-Key: <token>`.

### II.4 Mapping field sensor → payload

| Field payload          | Sumber di ESP32                         |
|------------------------|-----------------------------------------|
| `device_id`            | konstanta firmware, mis. `"ESP32-DC-01"` |
| `window_start`         | `epoch_now()` saat window dibuka (detik UTC) |
| `window_end`           | `epoch_now()` saat window ditutup |
| `temperature.max/min`  | tracker `max(t)` / `min(t)` selama window |
| `temperature.max_ts`   | epoch detik saat `max` terjadi |
| `temperature.avg`      | `sum(t) / count` selama window |
| `humidity.*`           | identik dengan `temperature.*`, sumber DHT22 |

> **Penting**: semua timestamp **wajib epoch detik (integer)**, bukan
> milidetik dan bukan ISO string. Schema AJV menolak tipe lain dengan
> `400 Bad Request`.

### II.5 Contoh request (curl simulasi)

```bash
NOW=$(date +%s)
curl -X POST "http://localhost:3000/api/sensor/ingest" \
  -H "Content-Type: application/json" \
  -d "{
    \"device_id\": \"ESP32-DC-01\",
    \"window_start\": $((NOW - 60)),
    \"window_end\":   $NOW,
    \"temperature\": {
      \"max\": 31.4, \"max_ts\": $((NOW - 48)),
      \"min\": 28.9, \"min_ts\": $((NOW - 27)),
      \"avg\": 30.1
    },
    \"humidity\": {
      \"max\": 71.2, \"max_ts\": $((NOW - 40)),
      \"min\": 65.0, \"min_ts\": $((NOW - 20)),
      \"avg\": 68.3
    }
  }"
```

Sukses → `201 Created` dengan `{ "insert_id": <n> }`. Verifikasi cepat:

```bash
curl "http://localhost:3000/api/sensor/latest"
```

### II.6 Keamanan (saat ini terbuka)

Endpoint `/api/sensor/ingest` belum punya auth. Untuk produksi, opsi
ringan yang kompatibel dengan ESP32:

1. **Shared secret**: ESP32 kirim header `X-Api-Key: <token>`, server
   cek di preHandler Fastify (env `INGEST_API_TOKEN`, terpisah dari
   `MITIGATION_CALLBACK_TOKEN`).
2. **mTLS**: berat untuk ESP32 standar — hanya jika MCU mendukung.
3. **Allowlist IP** di Nginx: simpel jika gateway IoT punya IP statis.

> Status implementasi: **belum** ada guard di `routes/api.js`. Skema env
> `INGEST_API_TOKEN` belum disediakan di `.env.example`; tambahkan saat
> auth diaktifkan.

### II.7 Contoh ringkas firmware (Arduino-ESP32)

Pseudokode HTTP POST per window (gunakan `HTTPClient` + `ArduinoJson`):

```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

const char* INGEST_URL =
  "http://server3bigdata.isslab.web.id:3003/api/sensor/ingest";

void flushWindow(const Window& w) {
  StaticJsonDocument<512> doc;
  doc["device_id"]    = "ESP32-DC-01";
  doc["window_start"] = w.start_epoch;
  doc["window_end"]   = w.end_epoch;

  JsonObject t = doc.createNestedObject("temperature");
  t["max"]    = w.t_max;
  t["max_ts"] = w.t_max_ts;
  t["min"]    = w.t_min;
  t["min_ts"] = w.t_min_ts;
  t["avg"]    = w.t_avg;

  JsonObject h = doc.createNestedObject("humidity");
  h["max"]    = w.h_max;
  h["max_ts"] = w.h_max_ts;
  h["min"]    = w.h_min;
  h["min_ts"] = w.h_min_ts;
  h["avg"]    = w.h_avg;

  String body;
  serializeJson(doc, body);

  HTTPClient http;
  http.begin(INGEST_URL);
  http.addHeader("Content-Type", "application/json");
  // http.addHeader("X-Api-Key", INGEST_API_TOKEN);  // jika auth aktif
  int code = http.POST(body);
  if (code != 201) {
    // TODO: simpan ke buffer (SPIFFS/NVS) untuk retry
  }
  http.end();
}
```

### II.8 Troubleshooting (sisi ESP32)

| Gejala                                    | Penyebab umum                                                |
|-------------------------------------------|--------------------------------------------------------------|
| `400 Bad Request` "Field ... wajib"       | Tipe salah (mis. timestamp dikirim sebagai string / float).  |
| `400 Bad Request` dari AJV                | Field hilang di sub-object `temperature` / `humidity`.       |
| `413 Payload Too Large`                   | Payload > 32 KB (`server.js:20`) — periksa loop akumulator yang bocor. |
| Timeout / `ECONNRESET`                    | Nginx upstream timeout; cek `sites-available.md` untuk `proxy_read_timeout`. |
| Tidak muncul di `/api/sensor/latest`      | Insert sukses tetapi `created_at` tidak diisi — pastikan kolom `DEFAULT CURRENT_TIMESTAMP` di `schema.sql`. |

---

# Integrasi n8n (Pipeline Gempa → AI → Server)

Bagian ini menjelaskan **pipeline end-to-end** gempa: bagaimana data sensor
masuk ke n8n, diproses LLM (Gemini), lalu keputusan AI dikirim balik ke
Fastify API via `POST /api/mitigasi/log`. Fastify server **tidak** menjadi
entry point webhook gempa; peran itu dipegang oleh n8n.

## A. Arsitektur Alur Data

```
 ┌──────────┐   POST /webhook/gempa-baru   ┌───────┐   generateContent   ┌────────┐
 │  IoT     │ ───────────────────────────▶ │  n8n  │ ──────────────────▶ │ Gemini │
 │  ESP32   │        (JSON payload)        │       │ ◀────────────────── │  API   │
 └──────────┘                              └───┬───┘     AI response     └────────┘
                                               │
                                               │ POST /api/mitigasi/log
                                               ▼
                                        ┌──────────────┐     GET /api/dashboard/*
                                        │ Fastify API  │ ◀────────────────── React UI
                                        │  (server3)   │                    (web/)
                                        └──────┬───────┘
                                               │
                                               ▼
                                        ┌──────────────┐
                                        │    MySQL     │
                                        │ mitigation_  │
                                        │    logs      │
                                        └──────────────┘
```

Alur ringkas:
1. **IoT ESP32** kirim data gempa + telemetri thermal ke **n8n webhook**
   `POST /webhook/gempa-baru`.
2. **n8n** memanggil **Gemini** dengan prompt berisi field-field dari payload
   (`Magnitude`, `jarak_km`, `suhu`, `id_sensor`).
3. **n8n** menerima balasan AI, lalu **callback** ke server Fastify di
   `POST /api/mitigasi/log` untuk ditulis ke tabel `mitigation_logs`.
4. **React dashboard** membaca hasil via `GET /api/dashboard/overview` &
   `GET /api/dashboard/audit`.

## B. Endpoint Webhook n8n — `POST /webhook/gempa-baru`

> ⚠️ **Endpoint ini bukan milik server Fastify.** Endpoint ini di-host oleh
> instance n8n (node `Webhook`, method `POST`, path `gempa-baru`). Server
> Fastify tidak punya route `/gempa-baru`.

URL webhook n8n (sesuaikan host):
- Production: `https://<N8N_HOST>/webhook/gempa-baru`
- Test mode:  `https://<N8N_HOST>/webhook-test/gempa-baru`

### B.1 Request body (kontrak IoT → n8n)

Field yang **wajib** ada karena dirujuk di prompt Gemini
(`{{$json.body.gempa_data.Magnitude}}`, `{{$json.body.jarak_km}}`,
`{{$json.body.suhu}}`, `{{$json.body.id_sensor}}`):

```json
{
  "id_sensor": "ESP32-DC-01",
  "suhu": 30.1,
  "jarak_km": 87.4,
  "gempa_data": {
    "Magnitude": 5.6
  }
}
```

| Field                   | Tipe    | Wajib | Sumber tipikal |
|-------------------------|---------|-------|----------------|
| `id_sensor`             | string  | ✔     | identitas perangkat ESP32 |
| `suhu`                  | number  | ✔     | rata-rata suhu window terakhir dari sensor |
| `jarak_km`              | number  | ✔     | haversine episentrum BMKG ↔ datacenter |
| `gempa_data.Magnitude`  | number  | ✔     | magnitudo dari feed BMKG (mis. `autogempa.json`) |

> Jika IoT tidak dapat menghitung `jarak_km` sendiri, hitung di sisi n8n
> sebelum node Gemini, atau ambil dari `GET /api/dashboard/overview` lalu
> map ke payload.

### B.2 Contoh request (curl)

```bash
curl -X POST "https://<N8N_HOST>/webhook/gempa-baru" \
  -H "Content-Type: application/json" \
  -d '{
    "id_sensor": "ESP32-DC-01",
    "suhu": 30.1,
    "jarak_km": 87.4,
    "gempa_data": { "Magnitude": 5.6 }
  }'
```

## C. Kontrak Callback n8n → Server (`POST /api/mitigasi/log`)

Setelah n8n mendapat jawaban Gemini, node **"Callback ke Server"** harus
memanggil endpoint Fastify di §3 (`POST /api/mitigasi/log`). Skema body
**mengikuti kontrak server**, bukan sebaliknya:

```json
{
  "magnitudo": 5.6,
  "jarak_km": 87.4,
  "suhu_referensi": 30.1,
  "status_bahaya": "Waspada",
  "rekomendasi_ai": "Aktifkan pendingin cadangan dan monitor selama 30 menit."
}
```

Pemetaan yang disarankan di node HTTP n8n (`Body Parameters`, mode JSON):

| Field server      | Sumber di n8n                                   |
|-------------------|-------------------------------------------------|
| `magnitudo`       | `{{$json.body.gempa_data.Magnitude}}`           |
| `jarak_km`        | `{{$json.body.jarak_km}}`                       |
| `suhu_referensi`  | `{{$json.body.suhu}}`                           |
| `status_bahaya`   | hasil parsing respon Gemini (enum: `Aman` / `Waspada` / `Kritis`) |
| `rekomendasi_ai`  | teks rekomendasi dari respon Gemini             |

> ⚠️ **Action Item Migrasi**: Workflow n8n eksisting mengirim
> `{ status_bahaya, rekomendasi_aksi, id_sensor }`. Schema ini **akan ditolak**
> oleh Fastify dengan HTTP 400 (validasi AJV). Sebelum deploy, **ubah node
> callback n8n** agar menggunakan lima field di atas. Field `id_sensor` boleh
> diteruskan, tapi saat ini **diabaikan** server (tidak disimpan).

## D. Environment Variables untuk Integrasi n8n

Yang relevan di sisi **server Fastify** (lihat `.env.example`):

| Var                         | Dipakai oleh                  | Keterangan |
|-----------------------------|-------------------------------|------------|
| `N8N_GEMPA_WEBHOOK_URL`     | `services/bmkgIngestor`       | URL webhook n8n yang di-trigger saat ada gempa BMKG baru. |
| `CORS_ALLOW_ORIGIN`         | `server.js`                   | Origin dashboard yang diizinkan memanggil API. |
| `MITIGATION_CALLBACK_TOKEN` | (opsional) guard untuk `/api/mitigasi/log` | Bila diset, n8n wajib kirim header `X-Api-Key`. |

Yang harus diset di sisi **n8n** (Credentials / Variables):

| Var                       | Keterangan |
|---------------------------|------------|
| `GEMINI_API_KEY`          | Credential di node "Google Gemini" untuk `generateContent`. |
| `MITIGATION_CALLBACK_URL` | Full URL callback, mis. `https://server3bigdata.isslab.web.id:3003/api/mitigasi/log` (ikuti `sites-available.md`). |
| `CALLBACK_AUTH_TOKEN`     | (opsional) token yang dikirim sebagai header `X-Api-Key` agar match dengan `MITIGATION_CALLBACK_TOKEN` di server. |

## E. Keamanan (Webhook & Callback)

Saat ini webhook n8n dan callback `/api/mitigasi/log` **tidak punya
auth**. Untuk produksi, minimal pilih salah satu skema berikut:

1. **Shared secret via header** (rekomendasi ringan):
   - Server cek `req.headers['x-api-key'] === process.env.MITIGATION_CALLBACK_TOKEN`.
   - n8n set header yang sama di node callback.
2. **Allowlist IP** di Nginx (lihat `sites-available.md`): hanya izinkan IP
   n8n yang boleh hit `/api/mitigasi/log`.
3. **Basic auth** di node HTTP Request n8n + cek di Fastify preHandler.

Endpoint webhook n8n sendiri (`/webhook/gempa-baru`) juga sebaiknya diberi
auth (Header Auth atau Query Auth) di node Webhook — default `none`.

> Catatan implementasi: guard `MITIGATION_CALLBACK_TOKEN` di server **belum**
> terpasang di `routes/api.js`. Bila env tersebut diset tanpa memasang guard,
> efeknya nihil. Tambahkan preHandler di route `POST /api/mitigasi/log` saat
> auth diaktifkan.

## F. Quickstart End-to-End

1. **Server Fastify**
   ```bash
   cp .env.example .env   # isi DB_*, DATACENTER_*, N8N_GEMPA_WEBHOOK_URL
   npm install
   npm start              # listen di :3000 (atau sesuai PORT)
   ```
2. **n8n**
   - Jalankan instance n8n (Docker / npm / cloud).
   - Import workflow JSON gempa kamu.
   - Set credential **Google Gemini** (paste `GEMINI_API_KEY`).
   - Edit node **"Callback ke Server"**:
     - URL = `http://<SERVER_IP>:3000/api/mitigasi/log`
       (atau domain publik via Nginx `:3003`, lihat `sites-available.md`).
     - Body JSON = lihat §C di atas (5 field wajib).
3. **Uji webhook masuk (IoT simulasi)**
   ```bash
   curl -X POST "http://<N8N_HOST>:5678/webhook-test/gempa-baru" \
     -H "Content-Type: application/json" \
     -d '{
       "id_sensor":"ESP32-DC-01",
       "suhu":30.1,
       "jarak_km":87.4,
       "gempa_data":{"Magnitude":5.6}
     }'
   ```
4. **Verifikasi callback tersimpan**
   ```bash
   curl "http://localhost:3000/api/dashboard/audit?limit=1"
   ```
   Respons harus berisi baris baru di `data[]` dengan `status_bahaya` dan
   `rekomendasi_ai` hasil Gemini.
5. **Dashboard**: buka React app (`web/`), panel Audit Trail akan menampilkan
   entry paling baru dan `global_status` di header mengikuti `status_bahaya`
   terakhir.

## G. Troubleshooting Cepat

| Gejala                                       | Kemungkinan penyebab                                   |
|----------------------------------------------|--------------------------------------------------------|
| n8n callback → `400 Bad Request`             | Body belum sesuai schema §3 (field salah nama / hilang). |
| n8n callback → `404 Not Found`               | URL callback salah (mis. masih `/gempa-baru` padahal itu milik n8n, bukan server). |
| n8n callback → `500 Audit trail failure.`    | MySQL down / kredensial salah — cek `config/database.js`. |
| Dashboard `global_status` selalu `"Aman"`    | Belum ada row di `mitigation_logs` (callback belum pernah sukses). |
| CORS error di browser                        | `CORS_ALLOW_ORIGIN` tidak mencakup origin dashboard. |


1. IoT -> api -> (web)server -> db -> n8n -> mengolah -> output (setiap 1 min)
2. (bmkg)gempa -> (web)server -> cek function -> db -> n8n -> mengolah -> output ()