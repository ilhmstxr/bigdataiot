# Nginx — `sites-available/bigdata.conf`

Konfigurasi reverse proxy untuk **BigData IoT Monitoring System**.

> **Arsitektur baru**: Fastify sudah serve **frontend (vanilla JS) + API** sekaligus di port `3000` lewat `@fastify/static`. Nginx hanya bertugas sebagai **reverse proxy + SSL termination**, **tidak perlu lagi** serve static files terpisah.

- **Backend + Frontend** (Fastify): `127.0.0.1:3000` (semua di satu proses)
- **Path file Nginx**: `/etc/nginx/sites-available/bigdata.conf`

---

## Prasyarat di Server

```bash
# 1. Install nginx
sudo apt update && sudo apt install -y nginx

# 2. Install Node.js (>=18) dan pm2 untuk daemonize Fastify
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2

# 3. Deploy source code (clone / rsync project ke server)
sudo mkdir -p /var/www/bigdata
sudo chown -R $USER:$USER /var/www/bigdata
git clone <repo> /var/www/bigdata
cd /var/www/bigdata/server4

# 4. Install dependency & setup .env
npm ci --production
cp .env.example .env
nano .env   # isi DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, dll

# 5. Setup database
mysql -u root -p < schema.sql

# 6. Jalankan Fastify dengan pm2
pm2 start server.js --name bigdata-api
pm2 save
pm2 startup   # ikuti instruksi yang muncul agar auto-start saat reboot

# Cek status
pm2 status
curl http://127.0.0.1:3000/api/health   # harus return {"status":"OK",...}
```

> Tidak perlu `npm run build` atau copy ke `/var/www/bigdata-dashboard` — UI vanilla JS sudah ada di `server4/public/` dan otomatis di-serve oleh Fastify.

---

## Struktur File Nginx

```
/etc/nginx/
├── nginx.conf                  ← konfigurasi global (jangan diubah)
├── sites-available/
│   └── bigdata.conf            ← FILE KITA (source of truth)
└── sites-enabled/
    └── bigdata.conf            ← symlink → ../sites-available/bigdata.conf
```

---

## Isi File `bigdata.conf` — HTTP only (sebelum SSL)

```nginx
# =========================================================================
#  BigData IoT Monitoring System — Nginx reverse proxy
#  Fastify (UI + API) di 127.0.0.1:3000 → di-proxy semua via Nginx
# =========================================================================

# Rate limit zones (definisikan SEKALI di /etc/nginx/nginx.conf http{} block,
# atau di sini jika hanya satu site)
# limit_req_zone $binary_remote_addr zone=iot_ingest:10m rate=30r/s;
# limit_req_zone $binary_remote_addr zone=api_general:10m rate=100r/s;

upstream bigdata_app {
    server 127.0.0.1:3000;
    keepalive 32;
}

server {
    listen 80;
    listen [::]:80;
    server_name bigdata.example.com;          # GANTI domain Anda

    # Logs
    access_log /var/log/nginx/bigdata.access.log;
    error_log  /var/log/nginx/bigdata.error.log warn;

    # Body size — IoT POST kecil tapi siapkan margin
    client_max_body_size 2m;

    # Gzip compression (untuk JSON & static yang dilewatkan dari Fastify)
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_types
        text/plain
        text/css
        text/javascript
        application/javascript
        application/json
        application/xml
        image/svg+xml;

    # Security headers global
    add_header X-Frame-Options          "SAMEORIGIN" always;
    add_header X-Content-Type-Options   "nosniff" always;
    add_header Referrer-Policy          "strict-origin-when-cross-origin" always;
    add_header X-XSS-Protection         "1; mode=block" always;

    # === Cache static assets dari Fastify (CSS/JS/gambar) ===
    # Nginx simpan di RAM/disk supaya hit kedua tidak perlu hit Fastify
    location ~* ^/(css|js|img|fonts)/.*\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        proxy_pass         http://bigdata_app;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_cache_valid  200 1d;
        expires            7d;
        add_header         Cache-Control "public, max-age=604800";
        access_log         off;
    }

    # === Endpoint khusus: IoT sensor ingest (rate limit ketat anti-spam) ===
    location = /api/sensor/ingest {
        # limit_req zone=iot_ingest burst=20 nodelay;
        proxy_pass         http://bigdata_app;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        client_max_body_size 1m;
    }

    # === Endpoint khusus: n8n webhook (timeout panjang karena Gemini AI) ===
    location = /api/n8n/webhook {
        proxy_pass         http://bigdata_app;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;

        # Whitelist IP n8n (uncomment & sesuaikan):
        # allow 192.168.1.100;
        # allow 10.0.0.0/24;
        # deny  all;
    }

    # === Health check (no logging, ringan) ===
    location = /api/health             { proxy_pass http://bigdata_app; access_log off; }
    location = /api/dashboard/health   { proxy_pass http://bigdata_app; access_log off; }
    location = /api/n8n/health         { proxy_pass http://bigdata_app; access_log off; }
    location = /api/bmkg/health        { proxy_pass http://bigdata_app; access_log off; }

    # === Default: semua request lain (UI + API) → Fastify ===
    location / {
        # limit_req zone=api_general burst=50 nodelay;

        proxy_pass         http://bigdata_app;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   X-Forwarded-Host  $host;
        proxy_set_header   Connection        "";

        # Timeouts
        proxy_connect_timeout 30s;
        proxy_send_timeout    60s;
        proxy_read_timeout    60s;

        # Buffering
        proxy_buffering   on;
        proxy_buffer_size 16k;
        proxy_buffers     8 16k;
    }

    # === Block file sensitif ===
    location ~ /\.(env|git|ht|htaccess|htpasswd) {
        deny all;
        return 404;
    }
}
```

---

## Cara Pasang

```bash
# 1. Tulis file config ini ke sites-available
sudo nano /etc/nginx/sites-available/bigdata.conf

# 2. Aktifkan dengan symlink ke sites-enabled (lihat sites-enabled.md)
sudo ln -s /etc/nginx/sites-available/bigdata.conf /etc/nginx/sites-enabled/bigdata.conf

# 3. Hapus default config jika ada konflik di port 80
sudo rm -f /etc/nginx/sites-enabled/default

# 4. Test syntax
sudo nginx -t

# 5. Reload nginx (tanpa downtime)
sudo systemctl reload nginx

# 6. Verifikasi
curl http://bigdata.example.com/                  # → harusnya HTML dashboard
curl http://bigdata.example.com/api/health        # → {"status":"OK",...}
curl http://bigdata.example.com/api/dashboard/stats
```

---

## Force HTTPS — Panduan Lengkap

Force HTTPS = setiap request `http://` otomatis dialihkan ke `https://`, dan browser dipaksa selalu pakai HTTPS untuk domain ini.

### Langkah 1 — Install Certbot & dapatkan SSL Certificate

```bash
sudo apt install -y certbot python3-certbot-nginx

# Pastikan domain sudah pointing ke IP server (cek: dig bigdata.example.com)
sudo certbot --nginx -d bigdata.example.com -d www.bigdata.example.com

# Saat ditanya:
#   1. Email      → masukkan email kamu (untuk notifikasi expiry)
#   2. ToS        → ketik 'A' (Agree)
#   3. Redirect   → pilih "2: Redirect" (otomatis force HTTPS)
```

Certbot akan:
- Buat sertifikat di `/etc/letsencrypt/live/bigdata.example.com/`
- Update `bigdata.conf` otomatis (tambah blok `server { listen 443 ssl }`)
- Tambah `301 redirect` di blok `server { listen 80 }`
- Setup auto-renewal lewat systemd timer

### Langkah 2 — Verifikasi Config Setelah Certbot

Buka ulang `/etc/nginx/sites-available/bigdata.conf`, harusnya jadi seperti ini:

```nginx
# =========================================================================
#  BigData IoT Monitoring System — HTTPS-enabled
# =========================================================================

upstream bigdata_app {
    server 127.0.0.1:3000;
    keepalive 32;
}

# === HTTP server — REDIRECT 301 ke HTTPS ===
server {
    listen 80;
    listen [::]:80;
    server_name bigdata.example.com www.bigdata.example.com;

    # Force redirect ke HTTPS
    return 301 https://$host$request_uri;
}

# === HTTPS server — yang melayani traffic ===
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name bigdata.example.com www.bigdata.example.com;

    # SSL certificates (otomatis di-set certbot)
    ssl_certificate     /etc/letsencrypt/live/bigdata.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bigdata.example.com/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    # === HSTS — paksa browser SELALU pakai HTTPS ===
    # max-age=63072000 = 2 tahun, includeSubDomains, preload-ready
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;

    # Security headers
    add_header X-Frame-Options          "SAMEORIGIN" always;
    add_header X-Content-Type-Options   "nosniff" always;
    add_header Referrer-Policy          "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy       "geolocation=(), microphone=(), camera=()" always;

    # Logs
    access_log /var/log/nginx/bigdata.access.log;
    error_log  /var/log/nginx/bigdata.error.log warn;

    # Body size & compression
    client_max_body_size 2m;
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_types text/plain text/css text/javascript application/javascript application/json application/xml image/svg+xml;

    # === Cache static assets dari Fastify ===
    location ~* ^/(css|js|img|fonts)/.*\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        proxy_pass         http://bigdata_app;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Forwarded-Proto $scheme;
        expires            7d;
        add_header         Cache-Control "public, max-age=604800";
        access_log         off;
    }

    # === Endpoint khusus dengan setting per-route ===
    location = /api/sensor/ingest {
        proxy_pass         http://bigdata_app;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        client_max_body_size 1m;
    }

    location = /api/n8n/webhook {
        proxy_pass         http://bigdata_app;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    # === Health checks (no logging) ===
    location = /api/health           { proxy_pass http://bigdata_app; access_log off; }
    location = /api/dashboard/health { proxy_pass http://bigdata_app; access_log off; }
    location = /api/n8n/health       { proxy_pass http://bigdata_app; access_log off; }
    location = /api/bmkg/health      { proxy_pass http://bigdata_app; access_log off; }

    # === Default: semua (UI + API) → Fastify ===
    location / {
        proxy_pass         http://bigdata_app;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;        # ← KRITIS untuk trustProxy
        proxy_set_header   X-Forwarded-Host  $host;
        proxy_set_header   Connection        "";

        proxy_connect_timeout 30s;
        proxy_send_timeout    60s;
        proxy_read_timeout    60s;
    }

    location ~ /\.(env|git|ht) {
        deny all;
        return 404;
    }
}
```

### Langkah 3 — Update Fastify supaya Percaya Header Nginx

Edit `server.js` agar Fastify membaca `X-Forwarded-Proto`/`X-Forwarded-For` dari Nginx:

```js
// SEBELUM
const fastify = require('fastify')({ logger: true });

// SESUDAH
const fastify = require('fastify')({
  logger: true,
  trustProxy: true,   // percaya X-Forwarded-* headers dari Nginx
});
```

Efek `trustProxy: true`:
- `request.protocol` = `'https'` (bukan `'http'`)
- `request.ip` = IP user asli (bukan `127.0.0.1` Nginx)
- `request.hostname` ambil dari `X-Forwarded-Host`

### Langkah 4 — Test & Reload

```bash
# Test syntax nginx
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx

# Restart Fastify (pm2)
pm2 restart bigdata-api

# Verifikasi redirect HTTP → HTTPS
curl -I http://bigdata.example.com
# Output yang diharapkan:
#   HTTP/1.1 301 Moved Permanently
#   Location: https://bigdata.example.com/

# Verifikasi HSTS aktif
curl -I https://bigdata.example.com | grep -i strict
# Output: strict-transport-security: max-age=63072000; includeSubDomains; preload

# Verifikasi UI ter-serve
curl https://bigdata.example.com/ | grep "BigData"

# Verifikasi API jalan
curl https://bigdata.example.com/api/health
```

### Langkah 5 — Auto-renewal SSL (otomatis di-setup certbot)

```bash
# Test renewal (dry run)
sudo certbot renew --dry-run

# Cek timer-nya jalan
sudo systemctl status certbot.timer
```

Sertifikat Let's Encrypt valid 90 hari, certbot auto-renew di hari ke-60.

---

## Checklist Force HTTPS

- [ ] Certbot terpasang & sertifikat ter-issue
- [ ] Blok `server { listen 80 ... return 301 https://... }` ada di `bigdata.conf`
- [ ] Blok `server { listen 443 ssl ... }` punya cert + HSTS header
- [ ] `proxy_set_header X-Forwarded-Proto $scheme;` ada di setiap `location`
- [ ] `server.js` pakai `trustProxy: true`
- [ ] `pm2 restart bigdata-api` sudah dijalankan
- [ ] `curl -I http://...` return `301` ke `https://`
- [ ] Browser tampilkan **gembok hijau** + tidak ada warning "mixed content"
- [ ] Test di [SSL Labs](https://www.ssllabs.com/ssltest/) → minimal grade **A**

---

## Bonus — HSTS Preload

Setelah HTTPS jalan stabil minimal 1 minggu, daftarkan domain ke [hstspreload.org](https://hstspreload.org/) supaya **hardcoded di Chrome/Firefox/Safari** sebagai HTTPS-only. Browser tidak akan pernah request via HTTP — bahkan request pertama.

Syarat preload (sudah di-handle config di atas):
- `max-age` minimal `31536000` (1 tahun) — kita pakai 2 tahun ✓
- `includeSubDomains` ✓
- `preload` keyword ✓
- Redirect HTTP → HTTPS aktif ✓

⚠ **Hati-hati**: setelah masuk preload list, sulit dihapus (butuh berbulan-bulan). Hanya daftar kalau yakin domain selamanya pakai HTTPS.

---

## Catatan Khusus Project Ini

| Endpoint | Catatan Nginx |
|---|---|
| `GET /` (dashboard UI) | Di-serve Fastify via `@fastify/static` dari `server4/public/` |
| `GET /css/*`, `/js/*` | Static assets di-cache Nginx 7 hari |
| `POST /api/sensor/ingest` | Body kecil (~1 KB), butuh **rate limit** untuk anti-spam ESP32 |
| `POST /api/n8n/webhook` | Bisa lambat (Gemini AI), `proxy_read_timeout 120s` |
| `GET /api/bmkg/*` | Dipanggil dari frontend, tidak perlu treatment khusus |
| `GET /api/dashboard/realtime` | Dipoll setiap 60 detik dari UI |
| BMKG poller (internal) | Tidak lewat Nginx — Fastify panggil langsung ke `data.bmkg.go.id` |

---

## CORS Note

`server.js` masih register `@fastify/cors`, tapi karena UI **dan** API **satu origin** (sama-sama dari Fastify lewat Nginx), CORS **tidak dibutuhkan** di production. Kamu bisa hapus `@fastify/cors` registration jika mau lebih ringan. Untuk dev mode lokal pun tidak butuh karena UI dibuka dari `http://localhost:3000` yang sama dengan API.

---

## Perbedaan dari Versi Sebelumnya (React + dashboard-ui)

| Aspek | Versi React | Versi Vanilla (sekarang) |
|---|---|---|
| `/var/www/bigdata-dashboard` | Wajib (host static) | **Tidak perlu** |
| `npm run build` di server | Wajib | **Tidak perlu** |
| `root` directive di Nginx | Wajib | **Tidak perlu** |
| `try_files $uri /index.html` | Wajib (SPA fallback) | **Tidak perlu** (Fastify handle) |
| Jumlah `proxy_pass` block | 3-4 (api + sebagian) | Semua proxy ke Fastify |
| Nginx workload | Static + proxy | **Pure proxy** |
| Deploy ulang frontend | Build + copy ke `/var/www` | Cukup `pm2 restart bigdata-api` |

Konfigurasi Nginx jadi **30% lebih sedikit** dan deployment **jauh lebih simpel**.
