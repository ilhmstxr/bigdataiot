server {
    listen 3010;
    listen [::]:3010;
    server_name server3bigdata.isslab.web.id;          # GANTI dengan domain Anda

    # Logs
    access_log /var/log/nginx/bigdata.access.log;
    error_log  /var/log/nginx/bigdata.error.log warn;

    # Body size — IoT POST kecil tapi siapkan margin
    client_max_body_size 2m;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_types text/plain text/css text/javascript application/javascript application/json application/xml image/svg+xml;

    # Security headers global
    add_header X-Frame-Options          "SAMEORIGIN" always;
    add_header X-Content-Type-Options   "nosniff" always;
    add_header Referrer-Policy          "strict-origin-when-cross-origin" always;
    add_header X-XSS-Protection         "1; mode=block" always;

    # === Cache static assets dari Fastify (CSS/JS/gambar) ===
    location ~* ^/(css|js|img|fonts)/.*\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_cache_valid  200 1d;
        expires            7d;
        add_header         Cache-Control "public, max-age=604800";
        access_log         off;
    }

    # === Endpoint khusus: IoT sensor ingest ===
    location = /api/sensor/ingest {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        client_max_body_size 1m;
    }

    # === Endpoint khusus: n8n webhook (timeout panjang karena AI) ===
    location ~ ^/api/webhook/n8n/(earthquake|thermal)$ {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    # === Health checks ===
    location = /api/health             { proxy_pass http://127.0.0.1:3000; access_log off; }
    location = /api/dashboard/health   { proxy_pass http://127.0.0.1:3000; access_log off; }
    location = /api/n8n/health         { proxy_pass http://127.0.0.1:3000; access_log off; }

    # === Default: semua request lain (UI + API) → Fastify ===
    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   X-Forwarded-Host  $host;
        proxy_set_header   Connection        "";

        proxy_connect_timeout 30s;
        proxy_send_timeout    60s;
        proxy_read_timeout    60s;

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
