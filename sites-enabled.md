# Nginx — `sites-enabled/`

Folder ini **WAJIB ADA** dan harus berisi **symlink** ke file di `sites-available/`. Tanpa symlink, Nginx tidak akan memuat konfigurasi.

- **Path folder**: `/etc/nginx/sites-enabled/`
- **Isi**: hanya symlink, **bukan** file asli

---

## Kenapa Pisah `sites-available` & `sites-enabled`?

| Folder | Fungsi | Yang ada di sini |
|---|---|---|
| `sites-available/` | Gudang **semua** konfigurasi (aktif maupun tidak) | File asli `.conf` |
| `sites-enabled/` | Daftar konfigurasi yang **sedang aktif** | Symlink ke `sites-available/` |

Pola ini memungkinkan kamu **mengaktifkan/menonaktifkan** sebuah site cukup dengan membuat/menghapus symlink — tanpa mengedit/menghapus file aslinya.

> **Cek di `nginx.conf`**: pastikan ada baris `include /etc/nginx/sites-enabled/*;` di dalam blok `http { }`. Jika tidak ada, Nginx tidak akan memuat folder ini.

---

## Cara Aktifkan `bigdata.conf`

```bash
# 1. Buat symlink
sudo ln -s /etc/nginx/sites-available/bigdata.conf /etc/nginx/sites-enabled/bigdata.conf

# 2. Hapus default config jika konflik di port 80
sudo rm -f /etc/nginx/sites-enabled/default

# 3. Verifikasi struktur
ls -la /etc/nginx/sites-enabled/
# Output yang diharapkan:
# lrwxrwxrwx 1 root root 36 ... bigdata.conf -> /etc/nginx/sites-available/bigdata.conf

# 4. Test syntax
sudo nginx -t

# 5. Reload
sudo systemctl reload nginx
```

---

## Cara Nonaktifkan (tanpa hapus konfigurasi)

```bash
# Hapus HANYA symlink-nya, file asli tetap aman di sites-available/
sudo rm /etc/nginx/sites-enabled/bigdata.conf
sudo nginx -t && sudo systemctl reload nginx
```

File `bigdata.conf` tetap utuh di `sites-available/`, bisa diaktifkan ulang kapan saja.

---

## Verifikasi Symlink Berhasil

```bash
# Cek apakah ini benar-benar symlink (bukan copy file)
file /etc/nginx/sites-enabled/bigdata.conf
# Output: ... symbolic link to /etc/nginx/sites-available/bigdata.conf

# Lihat isi config yang aktif
sudo nginx -T | grep -A 5 "server_name bigdata"
```

---

## Pitfall yang Sering Terjadi

### 1. Lupa buat symlink
**Gejala**: edit file di `sites-available/` tapi `nginx -t` tidak menampilkan error / config tidak aktif.  
**Solusi**: jalankan `ln -s` seperti di atas.

### 2. Copy file (bukan symlink) ke `sites-enabled/`
**Gejala**: edit di `sites-available/` tidak nyambung — karena yang dibaca Nginx adalah copy-an, bukan source.  
**Solusi**: hapus copy-nya, ganti dengan symlink.
```bash
sudo rm /etc/nginx/sites-enabled/bigdata.conf
sudo ln -s /etc/nginx/sites-available/bigdata.conf /etc/nginx/sites-enabled/bigdata.conf
```

### 3. Konflik port 80 dengan `default`
**Gejala**: `nginx: [emerg] a duplicate default server for 0.0.0.0:80`.  
**Solusi**: hapus symlink default:
```bash
sudo rm /etc/nginx/sites-enabled/default
```

### 4. CentOS/RHEL/Amazon Linux **tidak punya** struktur ini secara default
Distro non-Debian biasanya hanya punya `/etc/nginx/conf.d/*.conf`.  
**Solusi A** (rekomendasi): taruh `bigdata.conf` langsung di `/etc/nginx/conf.d/`.  
**Solusi B**: buat folder manual & tambahkan ke `nginx.conf`:
```bash
sudo mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
# Edit /etc/nginx/nginx.conf, tambahkan dalam blok http{}:
#   include /etc/nginx/sites-enabled/*;
```

---

## Khusus Windows / Laragon (Workspace Ini)

Project ini ada di `C:\Users\Ilhamstxr\Documents\laragon\www\bigdata\`. Jika ingin pakai Nginx Laragon:

- Laragon biasanya **tidak memakai** pola `sites-available` / `sites-enabled`.
- Path config: `C:\laragon\etc\nginx\sites-enabled\auto.bigdata.conf` (auto-generated) atau buat manual `C:\laragon\etc\nginx\sites-enabled\bigdata.conf`.
- Tidak butuh symlink — Windows cukup taruh file langsung di `sites-enabled/`.
- Restart via Laragon GUI: **Menu → Nginx → Reload**.

Contoh adaptasi untuk Laragon (path Windows):

```nginx
# C:\laragon\etc\nginx\sites-enabled\bigdata.conf
server {
    listen 8080;
    server_name bigdata.test;

    root "C:/Users/Ilhamstxr/Documents/laragon/www/bigdata/dashboard-ui/dist";
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
    }
}
```

Lalu tambahkan ke `C:\Windows\System32\drivers\etc\hosts`:
```
127.0.0.1   bigdata.test
```

---

## Ringkasan Workflow Production (Linux)

```bash
# Pertama kali deploy
sudo cp bigdata.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/bigdata.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# Update config
sudo nano /etc/nginx/sites-available/bigdata.conf   # edit di SINI
sudo nginx -t && sudo systemctl reload nginx        # symlink otomatis ikut

# Disable sementara
sudo rm /etc/nginx/sites-enabled/bigdata.conf
sudo systemctl reload nginx

# Enable kembali
sudo ln -s /etc/nginx/sites-available/bigdata.conf /etc/nginx/sites-enabled/
sudo systemctl reload nginx
```
