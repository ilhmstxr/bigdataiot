/* ============================================================
   API Service Layer — wrapper untuk fetch ke /api/*
   ============================================================ */
(function () {
  const BASE = '/api';

  async function get(path) {
    const res = await fetch(BASE + path);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  // expose ke global window.api
  window.api = {
    stats:              ()           => get('/dashboard/stats'),
    realtime:           (deviceId)   => get('/dashboard/realtime' + (deviceId ? '?device_id=' + deviceId : '')),
    trends:             (period)     => get('/dashboard/trends?period=' + (period || '24h')),
    overview:           (period)     => get('/dashboard/overview?period=' + (period || '24h')),
    alerts:             (limit)      => get('/dashboard/alerts?limit=' + (limit || 20)),
    devices:            ()           => get('/dashboard/devices'),
    mitigationHistory:  (limit)      => get('/n8n/history?limit=' + (limit || 20)),
    bmkgLatest:         ()           => get('/bmkg/latest'),
    bmkgHistory:        (limit)      => get('/bmkg/history?limit=' + (limit || 10)),
    health:             ()           => get('/dashboard/health'),
  };
})();
