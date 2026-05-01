# Nginx — `sites-available/bigdata.conf`

Konfigurasi reverse proxy untuk **BigData IoT Monitoring System**.

- **Frontend** (React/Vite build): static files dari `/var/www/bigdata-dashboard`
- **Backend** (Fastify): proxy ke `127.0.0.1:3000`
- **Path file**: `/etc/nginx/sites-available/bigdata.conf`

---

## Prasyarat di Server

```bash
# Install nginx
sudo apt update && sudo apt install -y nginx

# Pastikan node + pm2 (untuk backend) atau systemd service sudah jalan
node --version    # >= 18
pm2 --version     # opsional, untuk daemonize Fastify

# Build frontend & deploy ke /var/www
cd /path/ke/dashboard-ui
npm ci && npm run build
sudo mkdir -p /var/www/bigdata-dashboard
sudo cp -r dist/* /var/www/bigdata-dashboard/
sudo chown -R www-data:www-data /var/www/bigdata-dashboard
```

---

## Struktur File

```
/etc/nginx/
├── nginx.conf                  ← konfigurasi global (jangan diubah)
├── sites-available/
│   └── bigdata.conf            ← FILE KITA (source of truth)
└── sites-enabled/
    └── bigdata.conf            ← symlink → ../sites-available/bigdata.conf
```

---

## Isi File `bigdata.conf`

```nginx
# =========================================================================
#  BigData IoT Monitoring System — Nginx reverse proxy
#  Frontend: React (static)   ┐
#  Backend:  Fastify :3000    ┘  digabung di satu domain
# =========================================================================

# Rate limiting zones (definisikan di nginx.conf http{} block, atau di sini)
# limit_req_zone $binary_remote_addr zone=iot_ingest:10m rate=30r/s;
# limit_req_zone $binary_remote_addr zone=api_general:10m rate=100r/s;

upstream bigdata_api {
    server 127.0.0.1:3000;
    keepalive 32;
}

# ─── HTTP server (port 80) ────────────────────────────────────────────────
server {
    listen 80;
    listen [::]:80;
    server_name bigdata.example.com;   # GANTI dengan domain Anda

    # Setelah SSL terpasang, aktifkan baris berikut untuk auto-redirect:
    # return 301 https://$host$request_uri;

    # === Frontend React build ===
    root /var/www/bigdata-dashboard;
    index index.html;

    # Logs
    access_log /var/log/nginx/bigdata.access.log;
    error_log  /var/log/nginx/bigdata.error.log warn;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types
        text/plain
        text/css
        application/json
        application/javascript
        text/xml
        application/xml
        text/javascript
        image/svg+xml;

    # Body size (untuk POST sensor ingest)
    client_max_body_size 2m;

    # === SPA routing (React Router fallback) ===
    location / {
        try_files $uri $uri/ /index.html;
    }

    # === Static asset caching (aggressive) ===
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
        try_files $uri =404;
    }

    # === Backend API — proxy ke Fastify ===
    location /api/ {
        # limit_req zone=api_general burst=50 nodelay;

        proxy_pass         http://bigdata_api;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
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

    # === Endpoint khusus: IoT sensor ingest (rate limit ketat) ===
    location = /api/sensor/ingest {
        # limit_req zone=iot_ingest burst=20 nodelay;

        proxy_pass         http://bigdata_api;
        proxy_http_version 1.1;
        proxy_set_header   Host            $host;
        proxy_set_header   X-Real-IP       $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        client_max_body_size 1m;
    }

    # === Endpoint khusus: n8n webhook (timeout lebih panjang) ===
    location = /api/n8n/webhook {
        proxy_pass         http://bigdata_api;
        proxy_http_version 1.1;
        proxy_set_header   Host            $host;
        proxy_set_header   X-Real-IP       $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 120s;

        # Whitelist IP n8n (uncomment & sesuaikan):
        # allow 192.168.1.100;
        # allow 10.0.0.0/24;
        # deny  all;
    }

    # === Health check — no logging ===
    location = /api/dashboard/health {
        proxy_pass http://bigdata_api;
        access_log off;
    }

    # === Block file sensitif ===
    location ~ /\.(env|git|ht|htaccess|htpasswd) {
        deny all;
        return 404;
    }
}

# ─── HTTPS server (port 443) — aktifkan setelah jalankan certbot ──────────
# server {
#     listen 443 ssl http2;
#     listen [::]:443 ssl http2;
#     server_name bigdata.example.com;
#
#     ssl_certificate     /etc/letsencrypt/live/bigdata.example.com/fullchain.pem;
#     ssl_certificate_key /etc/letsencrypt/live/bigdata.example.com/privkey.pem;
#     ssl_protocols       TLSv1.2 TLSv1.3;
#     ssl_ciphers         HIGH:!aNULL:!MD5;
#     ssl_prefer_server_ciphers on;
#
#     # HSTS
#     add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
#
#     # ... salin semua location {} block dari server :80 di atas ...
# }
```

---

## Cara Pasang

```bash
# 1. Tulis file ini ke sites-available
sudo nano /etc/nginx/sites-available/bigdata.conf

# 2. Aktifkan dengan symlink ke sites-enabled (lihat sites-enabled.md)
sudo ln -s /etc/nginx/sites-available/bigdata.conf /etc/nginx/sites-enabled/bigdata.conf

# 3. Test syntax config
sudo nginx -t

# 4. Reload nginx (tanpa downtime)
sudo systemctl reload nginx
```

---

## Force HTTPS — Panduan Lengkap

Force HTTPS = setiap request `http://` otomatis dialihkan ke `https://`, dan browser dipaksa selalu pakai HTTPS untuk domain ini.

### Langkah 1 — Install Certbot & dapatkan SSL Certificate

```bash
# Install certbot dengan plugin nginx
sudo apt update
sudo apt install -y certbot python3-certbot-nginx

# Pastikan domain sudah pointing ke IP server (cek dengan: dig bigdata.example.com)
# Lalu jalankan certbot
sudo certbot --nginx -d bigdata.example.com -d www.bigdata.example.com

# Saat ditanya:
#   1. Email      → masukkan email kamu (untuk notifikasi expiry)
#   2. ToS        → ketik 'A' (Agree)
#   3. Redirect   → pilih "2: Redirect" (otomatis force HTTPS)
```

Certbot akan:
- Buat sertifikat di `/etc/letsencrypt/live/bigdata.example.com/`
- Update `bigdata.conf` otomatis dengan blok `server { listen 443 ssl ... }`
- Tambah `301 redirect` di blok `server { listen 80 ... }`
- Setup auto-renewal lewat systemd timer (cek: `sudo systemctl list-timers | grep certbot`)

### Langkah 2 — Verifikasi config setelah certbot

Buka ulang `/etc/nginx/sites-available/bigdata.conf`, harusnya jadi seperti ini:

```nginx
# === HTTP server — REDIRECT SEMUA ke HTTPS ===
server {
    listen 80;
    listen [::]:80;
    server_name bigdata.example.com www.bigdata.example.com;

    # Force redirect 301 ke HTTPS
    return 301 https://$host$request_uri;
}

# === HTTPS server — yang benar-benar melayani traffic ===
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name bigdata.example.com www.bigdata.example.com;

    # SSL certificates (otomatis di-set certbot)
    ssl_certificate     /etc/letsencrypt/live/bigdata.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bigdata.example.com/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    # === HSTS — paksa browser SELALU pakai HTTPS untuk domain ini ===
    # max-age=63072000 = 2 tahun, includeSubDomains = berlaku ke subdomain juga
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;

    # Security headers tambahan
    add_header X-Frame-Options          "SAMEORIGIN" always;
    add_header X-Content-Type-Options   "nosniff" always;
    add_header Referrer-Policy          "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy       "geolocation=(), microphone=(), camera=()" always;

    # === Frontend React build (sama seperti config :80 sebelumnya) ===
    root /var/www/bigdata-dashboard;
    index index.html;

    access_log /var/log/nginx/bigdata.access.log;
    error_log  /var/log/nginx/bigdata.error.log warn;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;

    client_max_body_size 2m;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
        try_files $uri =404;
    }

    # === Backend API proxy ===
    location /api/ {
        proxy_pass         http://bigdata_api;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;       # ← KRITIS: kasih tahu Fastify ini HTTPS
        proxy_set_header   X-Forwarded-Host  $host;
        proxy_set_header   Connection        "";

        proxy_connect_timeout 30s;
        proxy_send_timeout    60s;
        proxy_read_timeout    60s;
    }

    location = /api/n8n/webhook {
        proxy_pass         http://bigdata_api;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    location = /api/dashboard/health {
        proxy_pass http://bigdata_api;
        access_log off;
    }

    location ~ /\.(env|git|ht) {
        deny all;
        return 404;
    }
}
```

### Langkah 3 — Update Fastify supaya percaya header dari Nginx

Karena Fastify dengar di `127.0.0.1:3000` (HTTP biasa), tapi sebenarnya di-proxy lewat Nginx HTTPS, kamu perlu kasih tahu Fastify untuk **trust proxy headers**. Edit `server.js`:

```js
// SEBELUM
const fastify = require('fastify')({ logger: true });

// SESUDAH
const fastify = require('fastify')({
  logger: true,
  trustProxy: true,   // ← percaya X-Forwarded-* headers dari Nginx
});
```

Efek `trustProxy: true`:
- `request.protocol` jadi `'https'` (bukan `'http'`) → cocok untuk redirect/cookie logic
- `request.ip` jadi IP user asli (bukan `127.0.0.1` Nginx)
- `request.hostname` ambil dari `X-Forwarded-Host`

### Langkah 4 — Test & Reload

```bash
# Test syntax nginx
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx

# Restart Fastify (dengan pm2 / systemd)
pm2 restart bigdata-server         # jika pakai pm2
# atau
sudo systemctl restart bigdata     # jika pakai systemd

# Verifikasi redirect
curl -I http://bigdata.example.com
# Harusnya output:
# HTTP/1.1 301 Moved Permanently
# Location: https://bigdata.example.com/

# Verifikasi HSTS header aktif
curl -I https://bigdata.example.com | grep -i strict
# Harusnya: strict-transport-security: max-age=63072000; includeSubDomains; preload
```

### Langkah 5 — Auto-renewal SSL (sudah di-setup certbot, ini cuma verifikasi)

```bash
# Test renewal (dry run, tidak benar-benar memperbarui)
sudo certbot renew --dry-run

# Cek timer-nya jalan
sudo systemctl status certbot.timer
```

Sertifikat Let's Encrypt valid 90 hari, certbot akan auto-renew di hari ke-60.

---

## Checklist Force HTTPS

- [ ] Certbot terpasang & sertifikat berhasil di-issue
- [ ] Blok `server { listen 80 ... return 301 https://... }` ada di `bigdata.conf`
- [ ] Blok `server { listen 443 ssl ... }` punya cert + HSTS header
- [ ] `proxy_set_header X-Forwarded-Proto $scheme;` ada di setiap `location /api/`
- [ ] `server.js` pakai `trustProxy: true`
- [ ] `curl -I http://...` return `301` ke `https://`
- [ ] Browser tampilkan **gembok hijau** + tidak ada warning "mixed content"
- [ ] Test di [SSL Labs](https://www.ssllabs.com/ssltest/) → minimal grade **A**

---

## Bonus — HSTS Preload (Paling Strict)

Setelah HTTPS jalan stabil minimal 1 minggu, kamu bisa daftar ke [hstspreload.org](https://hstspreload.org/) supaya domain kamu **hardcoded di Chrome/Firefox/Safari** sebagai HTTPS-only. Setelah masuk preload list, browser **TIDAK AKAN PERNAH** request via HTTP — bahkan request pertama pun langsung HTTPS.

Syarat preload (sudah di-handle config di atas):
- `max-age` minimal `31536000` (1 tahun) — kita pakai 2 tahun ✓
- `includeSubDomains` — ada ✓
- `preload` keyword — ada ✓
- Redirect HTTP → HTTPS aktif — ada ✓

⚠ **Hati-hati**: setelah masuk preload list, sulit dihapus (butuh berbulan-bulan). Hanya daftar kalau yakin domain akan **selamanya** pakai HTTPS.

---

## Catatan Khusus Project Ini

| Endpoint | Catatan Nginx |
|---|---|
| `POST /api/sensor/ingest` | Body kecil (~1 KB), butuh **rate limit** untuk anti-spam dari ESP32 jahat |
| `POST /api/n8n/webhook` | Bisa lambat (Gemini AI), `proxy_read_timeout 120s` |
| `GET /api/bmkg/*` | Dipanggil dari frontend, tidak perlu treatment khusus |
| `GET /api/dashboard/realtime` | Dipoll setiap 60 detik dari React, aman dengan default |
| BMKG poller (internal) | Tidak lewat Nginx — Fastify panggil langsung ke `data.bmkg.go.id` |

---

## CORS Note

`server.js` sudah pakai `@fastify/cors`, tapi karena frontend & backend **satu domain** lewat Nginx, CORS tidak diperlukan di production. Untuk dev (Vite di `:5173` hit Fastify di `:3000`), proxy sudah ditangani di `vite.config.js`.
