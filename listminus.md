Berikut **catatan (note) apa yang masih kurang/harus disesuaikan di website/dokumentasi repo `ilhmstxr/server3bigdata`** supaya benar‑benar *nyambung* dengan workflow n8n JSON yang kamu lampirkan (Webhook `POST /gempa-baru` → panggil Gemini → callback ke server `POST /api/mitigasi/log`).

---

## ✅ Status Perbaikan (arah: **Opsi B — n8n ikut kontrak server**)

| # | Gap                                           | Status | Lokasi perbaikan |
|---|-----------------------------------------------|--------|------------------|
| 1 | Endpoint `/gempa-baru` milik n8n, belum dijelaskan | **DONE** | `api.md` §B (Integrasi n8n) |
| 2 | Format payload IoT → n8n belum dijelaskan     | **DONE** | `api.md` §B.1 + §B.2 (contoh curl) |
| 3 | Mismatch payload callback n8n → server        | **DONE (docs)** | `api.md` §C — ditambahkan "Action Item Migrasi": workflow n8n harus diubah agar kirim `{magnitudo, jarak_km, suhu_referensi, status_bahaya, rekomendasi_ai}`. Server **tidak** diubah. |
| 4 | Env variables integrasi n8n belum di `.env.example` | **DONE** | `.env.example` (tambah `MITIGATION_CALLBACK_TOKEN` + komentar pada `N8N_GEMPA_WEBHOOK_URL`) + `api.md` §D |
| 5 | Keamanan webhook & callback belum dibahas     | **DONE (docs)** | `api.md` §E. **Catatan**: guard `MITIGATION_CALLBACK_TOKEN` belum terpasang di `routes/api.js` — masih TODO implementasi (preHandler). |
| 6 | Quickstart end-to-end belum ada               | **DONE** | `api.md` §F + §G (troubleshooting) |
| 7 | Diagram arsitektur/alur data                  | **DONE** | `api.md` §A (ASCII diagram) |

### Sisa pekerjaan (tidak dokumentasi)
- [ ] **Ubah workflow n8n** (JSON): node "Callback ke Server" harus mengirim 5 field sesuai `api.md` §C (bukan `rekomendasi_aksi` / `id_sensor`). Tanpa ini, callback akan ditolak `400 Bad Request`.
- [ ] (Opsional) Pasang preHandler auth di `routes/api.js` untuk `POST /api/mitigasi/log` yang memvalidasi header `x-api-key` terhadap `MITIGATION_CALLBACK_TOKEN`.

---

## Catatan asli (arsip — sebelum perbaikan)

## 1) Endpoint yang dipakai n8n belum ada/ belum didokumentasikan: `/gempa-baru` (Webhook receiver)
Di n8n kamu pakai node Webhook dengan:
- **Method**: `POST`
- **Path**: `gempa-baru`
Artinya URL webhook n8n akan seperti:
- `https://<N8N_HOST>/webhook/gempa-baru` (atau `/webhook-test/gempa-baru` kalau mode test)

**Yang kurang di repo website/dokumen**:
- Jelaskan bahwa **endpoint `/gempa-baru` itu milik n8n, bukan milik server Fastify**.
- Tambahkan diagram/alur bahwa server Fastify **bukan menerima POST gempa langsung dari IoT** pada path itu, melainkan **IoT → n8n webhook**.

> Repo saat ini mendokumentasikan endpoint server Fastify di `api.md`, tapi tidak menjelaskan “webhook n8n `/gempa-baru`” sebagai pintu masuk data gempa.

## 2) Format payload yang diharapkan n8n dari IoT belum dijelaskan (kontrak request body)
Di prompt Gemini kamu memakai field berikut:
- `{{$json.body.gempa_data.Magnitude}}`
- `{{$json.body.jarak_km}}`
- `{{$json.body.suhu}}`
- `{{$json.body.id_sensor}}`

**Yang kurang di repo website/dokumen**:
- Buat bagian “**Payload IoT → n8n**” yang menjelaskan struktur JSON minimal, contoh misalnya:

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

Kalau `gempa_data` kamu ambil dari BMKG atau dari alat lain, dokumentasikan juga sumbernya dan field wajibnya.

## 3) Mismatch payload callback n8n → server pada `/api/mitigasi/log`
Di n8n node “Callback ke Server” kamu kirim:

```json
{
  "status_bahaya": "...",
  "rekomendasi_aksi": "System Auto-Mitigation Triggered",
  "id_sensor": "..."
}
```

Tapi di repo (`api.md`) untuk `POST /api/mitigasi/log` yang didokumentasikan adalah:

```json
{
  "magnitudo": 5.6,
  "jarak_km": 87.4,
  "suhu_referensi": 30.1,
  "status_bahaya": "Waspada",
  "rekomendasi_ai": "..."
}
```

**Yang kurang/harus diputuskan di website repo** (pilih salah satu, lalu konsisten):

- **Opsi A (ubah n8n supaya cocok dengan API server):**
  - n8n callback harus mengirim `magnitudo`, `jarak_km`, `suhu_referensi`, `rekomendasi_ai` (bukan `rekomendasi_aksi`) dan tidak hanya `id_sensor`.

- **Opsi B (ubah API server & dokumentasinya supaya cocok dengan n8n):**
  - Update dokumentasi endpoint `/api/mitigasi/log` agar menerima `id_sensor` dan `rekomendasi_aksi`, dan jelaskan field mana yang optional.

Saat ini **dokumen repo dan workflow n8n “belum satu kontrak”**, jadi ini poin paling penting.

## 4) Variabel environment penting untuk integrasi n8n + Gemini belum ada di `.env.example`/docs
Di n8n kamu butuh:
- `GEMINI_API_KEY`
- `SERVER_BASE_URL` (untuk callback `http://<IP_SERVER_ANDA>/api/mitigasi/log`)
- (opsional) secret/token untuk mengamankan callback/webhook

**Yang kurang di repo website/dokumen**:
- Tambahkan section “Integrasi n8n” berisi daftar env/konfigurasi yang harus di-set, misalnya:
  - `N8N_WEBHOOK_URL` / base URL n8n
  - `GEMINI_API_KEY`
  - `MITIGATION_CALLBACK_URL` atau `API_BASE_URL`
  - (kalau pakai) `CALLBACK_AUTH_TOKEN` dan cara mengirimnya via header.

## 5) Keamanan (auth) belum dibahas: webhook & callback masih terbuka
Dari n8n JSON:
- Webhook receiver tidak pakai auth
- Callback ke server juga tidak terlihat pakai header auth

**Yang kurang di repo website/dokumen**:
- Minimal dokumentasikan salah satu metode:
  - shared secret di header (`X-Signature` / `X-Api-Key`)
  - allowlist IP n8n
  - basic auth / token
- Jelaskan bahwa endpoint `/api/mitigasi/log` sebaiknya tidak publik tanpa proteksi.

## 6) “Cara menjalankan end-to-end” (IoT → n8n → Gemini → server → dashboard) belum ada sebagai panduan langkah
Repo punya `api.md`, `config.md`, dll, tapi agar cocok dengan workflow n8n kamu, di website repo perlu halaman “Quickstart Integrasi n8n”, berisi:
1. Jalankan server (`npm install`, `npm start`, set `.env`)
2. Jalankan n8n
3. Import workflow JSON n8n
4. Set credential Gemini API key
5. Set URL callback ke server
6. Test dengan contoh `curl` POST ke webhook n8n `/gempa-baru`
7. Cek server menerima log di `/api/mitigasi/log` dan tampil di dashboard/audit

## 7) Tambahkan diagram arsitektur/alur data agar pembaca tidak salah paham
Yang perlu ditambahkan di halaman repo:
- Diagram sederhana:
  - IoT Sensor → (HTTP POST) → n8n `/gempa-baru`
  - n8n → Gemini generateContent
  - n8n → server `POST /api/mitigasi/log`
  - web dashboard → server `GET /api/dashboard/*`

---

Kalau kamu mau, kirim juga **target yang kamu inginkan**:
- Kamu mau **server mengikuti payload n8n** (lebih simple), atau
- n8n yang disesuaikan agar **mengikuti API server** yang ada di `api.md`?

Nanti aku bisa bikinkan “Note + revisi kontrak API” yang paling rapi (versi final payload dan contoh request untuk kedua arah).