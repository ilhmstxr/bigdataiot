-- bigdata Server Database Schema
-- MySQL/MariaDB DDL for thermal_logs and mitigation_logs tables

-- Create database if not exists
CREATE DATABASE IF NOT EXISTS bigdata 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

-- Use the database
USE bigdata;

-- Drop tables if they exist (for clean re-deployment)
DROP TABLE IF EXISTS mitigation_logs;
DROP TABLE IF EXISTS thermal_logs;

-- Table for IoT thermal sensor data from ESP32
CREATE TABLE thermal_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  device_id VARCHAR(50) NOT NULL COMMENT 'Unique identifier for the IoT device',
  window_start INT NOT NULL COMMENT 'Unix timestamp for the start of the measurement window',
  window_end INT NOT NULL COMMENT 'Unix timestamp for the end of the measurement window',
  temp_max DECIMAL(5,2) NOT NULL COMMENT 'Maximum temperature in Celsius',
  temp_min DECIMAL(5,2) NOT NULL COMMENT 'Minimum temperature in Celsius',
  temp_avg DECIMAL(5,2) NOT NULL COMMENT 'Average temperature in Celsius',
  hum_max DECIMAL(5,2) NOT NULL COMMENT 'Maximum humidity percentage',
  hum_min DECIMAL(5,2) NOT NULL COMMENT 'Minimum humidity percentage',
  hum_avg DECIMAL(5,2) NOT NULL COMMENT 'Average humidity percentage',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'When the record was created',
  
  INDEX idx_device_id (device_id),
  INDEX idx_created_at (created_at),
  INDEX idx_device_time (device_id, created_at),
  INDEX idx_window_time (window_start, window_end)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
COMMENT='Thermal sensor data from IoT devices';

-- Table for mitigation data from n8n/Gemini AI
CREATE TABLE mitigation_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  event_id VARCHAR(50) NOT NULL COMMENT 'Reference to the triggering event',
  event_type VARCHAR(50) NOT NULL COMMENT 'Type of event (earthquake, thermal_anomaly, flood, other)',
  mitigation_advice TEXT NOT NULL COMMENT 'AI-generated mitigation advice',
  confidence_score DECIMAL(3,2) NOT NULL COMMENT 'AI confidence score (0.00 to 1.00)',
  raw_response JSON COMMENT 'Complete raw response from AI service',
  processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'When the mitigation was processed',
  
  INDEX idx_event_id (event_id),
  INDEX idx_event_type (event_type),
  INDEX idx_processed_at (processed_at),
  INDEX idx_confidence (confidence_score),
  INDEX idx_event_time (event_id, processed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
COMMENT='Mitigation data from AI services via n8n';

-- Create a user for the application (optional, for production)
-- CREATE USER IF NOT EXISTS 'bigdata_user'@'localhost' IDENTIFIED BY 'your_secure_password';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON bigdata.* TO 'bigdata_user'@'localhost';
-- FLUSH PRIVILEGES;

-- Insert sample data for testing (optional)
-- INSERT INTO thermal_logs (device_id, window_start, window_end, temp_max, temp_min, temp_avg, hum_max, hum_min, hum_avg) VALUES
-- ('ESP32_001', UNIX_TIMESTAMP(DATE_SUB(NOW(), INTERVAL 1 HOUR)), UNIX_TIMESTAMP(NOW()), 35.50, 28.20, 31.85, 75.00, 65.00, 70.00),
-- ('ESP32_002', UNIX_TIMESTAMP(DATE_SUB(NOW(), INTERVAL 30 MINUTE)), UNIX_TIMESTAMP(NOW()), 33.80, 26.50, 30.15, 72.00, 62.00, 67.00);

-- INSERT INTO mitigation_logs (event_id, event_type, mitigation_advice, confidence_score, raw_response) VALUES
-- ('EVT_001', 'thermal_anomaly', 'High temperature detected. Ensure proper ventilation and check for heat sources.', 0.85, '{"source": "gemini", "model": "gemini-pro", "timestamp": "2024-01-01T12:00:00Z"}');

-- View for dashboard overview (optional)
CREATE VIEW v_thermal_summary AS
SELECT 
  device_id,
  COUNT(*) as total_readings,
  AVG(temp_avg) as avg_temperature,
  AVG(hum_avg) as avg_humidity,
  MAX(temp_max) as max_temperature,
  MIN(temp_min) as min_temperature,
  MAX(created_at) as last_reading
FROM thermal_logs 
GROUP BY device_id;

-- View for recent mitigations (optional)
CREATE VIEW v_recent_mitigations AS
SELECT 
  ml.*,
  DATEDIFF(NOW(), ml.processed_at) as days_ago
FROM mitigation_logs ml
WHERE ml.processed_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
ORDER BY ml.processed_at DESC;

-- Show table structure
DESCRIBE thermal_logs;
DESCRIBE mitigation_logs;

-- Show created views
SHOW TABLES LIKE 'v_%';

-- Success message
SELECT 'Database schema created successfully!' as status;
