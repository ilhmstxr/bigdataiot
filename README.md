# BigData Server 4 - Fastify API

Fastify-based API server for IoT data collection, n8n integration, and dashboard services.

## 🚀 Features

- **IoT Data Ingestion**: Receive thermal sensor data from ESP32 devices
- **n8n Integration**: Process mitigation data from n8n/Gemini AI workflows
- **Dashboard API**: Serve data for React dashboard UI
- **MySQL Database**: Persistent storage with connection pooling
- **Environment Configuration**: Secure configuration via .env files

## 📋 Prerequisites

- Node.js 16+ 
- MySQL/MariaDB 8.0+
- npm or yarn

## 🛠 Installation

1. **Clone and install dependencies:**
   ```bash
   cd server4
   npm install
   ```

2. **Setup database:**
   ```bash
   mysql -u root -p < schema.sql
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials
   ```

4. **Start the server:**
   ```bash
   # Development
   npm run dev
   
   # Production
   npm start
   ```

## 📡 API Endpoints

### IoT Sensor Data
- `POST /api/sensor/ingest` - Receive thermal data from ESP32
- `GET /api/sensor/health` - IoT service health check

### n8n Integration
- `POST /api/n8n/mitigation` - Receive mitigation data from n8n/Gemini
- `GET /api/n8n/history` - Get mitigation history
- `POST /api/n8n/webhook` - Webhook endpoint for n8n automation
- `GET /api/n8n/health` - n8n service health check

### Dashboard API (React UI)
- `GET /api/dashboard/overview` - Dashboard overview data
- `GET /api/dashboard/trends` - Thermal trends (24h/7d/30d)
- `GET /api/dashboard/alerts` - Alert history
- `GET /api/dashboard/realtime` - Realtime sensor data
- `GET /api/dashboard/devices` - Active device list
- `GET /api/dashboard/stats` - Statistics summary
- `GET /api/dashboard/health` - Dashboard service health check

### General
- `GET /` - Server health check

## 🗄 Database Schema

### thermal_logs
Stores IoT sensor data from ESP32 devices:
- `device_id` - Device identifier
- `window_start/end` - Measurement window timestamps
- `temp_max/min/avg` - Temperature readings
- `hum_max/min/avg` - Humidity readings
- `created_at` - Record timestamp

### mitigation_logs
Stores AI-generated mitigation data:
- `event_id` - Reference to triggering event
- `event_type` - Type of event (earthquake, thermal_anomaly, etc.)
- `mitigation_advice` - AI-generated advice
- `confidence_score` - AI confidence (0.00-1.00)
- `raw_response` - Complete AI response (JSON)
- `processed_at` - Processing timestamp

## 🔧 Configuration

Environment variables in `.env`:

```env
# Server Configuration
PORT=3000

# Database Configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=bigdata

# n8n Webhook URL (optional)
N8N_GEMPA_WEBHOOK_URL=https://your-n8n-instance.com/webhook/...
```

## 📝 Example Requests

### IoT Data Ingestion
```bash
curl -X POST http://localhost:3000/api/sensor/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "ESP32_001",
    "window_start": 1704067200,
    "window_end": 1704070800,
    "temperature": {
      "max": 35.50,
      "min": 28.20,
      "avg": 31.85
    },
    "humidity": {
      "max": 75.00,
      "min": 65.00,
      "avg": 70.00
    }
  }'
```

### n8n Mitigation Data
```bash
curl -X POST http://localhost:3000/api/n8n/mitigation \
  -H "Content-Type: application/json" \
  -d '{
    "event_id": "EVT_001",
    "event_type": "thermal_anomaly",
    "mitigation_advice": "High temperature detected. Ensure proper ventilation.",
    "confidence_score": 0.85,
    "raw_response": {"source": "gemini"}
  }'
```

### Dashboard Overview
```bash
curl http://localhost:3000/api/dashboard/overview
```

## 🚀 Deployment

### Using Docker (Recommended)
```bash
# Build image
docker build -t bigdata-server .

# Run container
docker run -p 3000:3000 --env-file .env bigdata-server
```

### Manual Deployment
1. Setup MySQL database
2. Install dependencies: `npm ci --production`
3. Set environment variables
4. Run with PM2: `pm2 start server.js --name bigdata-server`

## 🔍 Monitoring

- Server logs include request/response details
- Database connection status logged on startup
- Health check endpoints available for monitoring
- Error handling with proper HTTP status codes

## 🛡 Security

- Input validation with JSON schemas
- SQL injection prevention with prepared statements
- CORS configuration for cross-origin requests
- Environment-based configuration

## 📚 Development

### Project Structure
```
server4/
├── config/
│   └── database.js          # Database connection
├── controllers/
│   ├── iot-controller.js    # IoT data handling
│   ├── mitigationLog.js     # n8n data handling
│   └── dashboard.js         # Dashboard data
├── routes/
│   ├── api-Iot.js          # IoT routes
│   ├── api-n8n.js          # n8n routes
│   └── api-dashboard.js    # Dashboard routes
├── server.js               # Main server file
├── schema.sql              # Database schema
├── package.json            # Dependencies
└── .env                    # Environment config
```

### Adding New Endpoints
1. Create controller function in `controllers/`
2. Add route in appropriate `routes/` file
3. Register route in `server.js`
4. Update documentation

## 📄 License

ISC License
