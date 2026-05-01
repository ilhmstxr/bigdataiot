/* ============================================================
   BigData System Monitor — Main App (Vanilla JS)
   Fetch data dari /api/* → render ke DOM tiap 60 detik
   ============================================================ */
(function () {
  // ─── State ────────────────────────────────────────────────
  const state = {
    stats: null,
    realtime: [],
    trends: [],
    mitigations: [],
    bmkg: null,
    devices: [],
    startTime: Date.now(),
  };

  // ─── Helpers ──────────────────────────────────────────────
  function fmtTime(dt) {
    if (!dt) return '--:--:--';
    return new Date(dt).toTimeString().slice(0, 8);
  }

  function fmtUTC() {
    return new Date().toUTCString().slice(17, 25) + ' UTC';
  }

  function $(id) { return document.getElementById(id); }

  function setText(id, val) {
    const el = $(id);
    if (el) el.textContent = val;
  }

  // ─── System status (header) ──────────────────────────────
  function getSystemStatus(stats) {
    if (!stats) return { label: 'INITIALIZING', color: '#ffcc00' };
    const maxTemp   = stats?.thermal?.max_temp || 0;
    const highCount = stats?.thermal?.high_temp_count || 0;
    if (maxTemp > 40 || highCount > 20) return { label: 'CRITICAL', color: '#ff3366' };
    if (maxTemp > 35 || highCount > 5)  return { label: 'WARNING',  color: '#ff6600' };
    return { label: 'OPTIMAL', color: '#00ff88' };
  }

  function renderSystemStatus() {
    const status = getSystemStatus(state.stats);
    const dot   = $('status-dot');
    const label = $('status-label');
    const head  = $('sys-header');
    if (dot)   dot.style.background  = status.color;
    if (label) {
      label.style.color = status.color;
      label.textContent = '■ SYSTEM STATUS: ' + status.label;
    }
    if (head)  head.style.borderBottomColor = status.color;
  }

  // ─── Climate panel ────────────────────────────────────────
  function renderClimate() {
    const latest = state.realtime[0];
    setText('m-avg-temp', latest?.temp_avg != null
      ? Number(latest.temp_avg).toFixed(1) : '--');
    setText('m-peak-temp', latest?.temp_max != null
      ? Number(latest.temp_max).toFixed(1) : '--');
    setText('m-humidity', latest?.hum_avg != null
      ? Math.round(Number(latest.hum_avg)) : '--');

    const elapsed = Math.round((Date.now() - state.startTime) / 1000);
    setText('last-update', elapsed + 's ago');
  }

  // ─── Threat Radar panel ──────────────────────────────────
  function renderThreatRadar() {
    const b = state.bmkg;
    setText('m-mag', b?.magnitude != null ? b.magnitude : '--');
    let depth = '--';
    if (b?.kedalaman) {
      depth = String(b.kedalaman).replace(' km', '').trim();
    }
    setText('m-depth', depth);
  }

  // ─── Thermal Chart (pure SVG, step-after) ────────────────
  function renderChart() {
    const svg = $('thermal-chart');
    if (!svg) return;

    const W = svg.clientWidth || 800;
    const H = svg.clientHeight || 240;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

    // clear
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // Defs → gradient
    const NS = 'http://www.w3.org/2000/svg';
    const defs = document.createElementNS(NS, 'defs');
    defs.innerHTML =
      '<linearGradient id="cyanGradient" x1="0" y1="0" x2="0" y2="1">' +
      '  <stop offset="0%"   stop-color="#00d4ff" stop-opacity="0.25"/>' +
      '  <stop offset="100%" stop-color="#00d4ff" stop-opacity="0"/>' +
      '</linearGradient>';
    svg.appendChild(defs);

    const data = (state.trends || []).map(t => ({
      time: t.time_period
        ? String(t.time_period).slice(11, 16) || String(t.time_period).slice(0, 10)
        : '--',
      temp: parseFloat(t.avg_temperature) || 0,
    })).filter(d => d.temp > 0);

    if (data.length < 2) {
      // empty placeholder
      const txt = document.createElementNS(NS, 'text');
      txt.setAttribute('x', W / 2);
      txt.setAttribute('y', H / 2);
      txt.setAttribute('text-anchor', 'middle');
      txt.setAttribute('fill', '#2a3a50');
      txt.setAttribute('font-size', '12');
      txt.setAttribute('font-family', 'Courier New, monospace');
      txt.textContent = 'NO_DATA';
      svg.appendChild(txt);
      return;
    }

    const padL = 40, padR = 12, padT = 12, padB = 28;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;

    const temps = data.map(d => d.temp);
    let minT = Math.min.apply(null, temps);
    let maxT = Math.max.apply(null, temps);
    const range = Math.max(1, maxT - minT);
    minT -= range * 0.15;
    maxT += range * 0.15;

    const xAt = (i) => padL + (i / (data.length - 1)) * innerW;
    const yAt = (t) => padT + innerH - ((t - minT) / (maxT - minT)) * innerH;

    // ─ Grid horizontal (5 lines) ─
    const grid = document.createElementNS(NS, 'g');
    grid.setAttribute('class', 'grid');
    for (let i = 0; i <= 4; i++) {
      const y = padT + (innerH / 4) * i;
      const ln = document.createElementNS(NS, 'line');
      ln.setAttribute('x1', padL);
      ln.setAttribute('y1', y);
      ln.setAttribute('x2', W - padR);
      ln.setAttribute('y2', y);
      grid.appendChild(ln);
    }
    svg.appendChild(grid);

    // ─ Y axis labels ─
    const axis = document.createElementNS(NS, 'g');
    axis.setAttribute('class', 'axis');
    for (let i = 0; i <= 4; i++) {
      const t = maxT - ((maxT - minT) / 4) * i;
      const y = padT + (innerH / 4) * i;
      const tx = document.createElementNS(NS, 'text');
      tx.setAttribute('x', padL - 6);
      tx.setAttribute('y', y + 4);
      tx.setAttribute('text-anchor', 'end');
      tx.textContent = t.toFixed(1);
      axis.appendChild(tx);
    }

    // ─ X axis labels (subset) ─
    const xLabelCount = Math.min(6, data.length);
    for (let i = 0; i < xLabelCount; i++) {
      const idx = Math.round((i / (xLabelCount - 1)) * (data.length - 1));
      const tx = document.createElementNS(NS, 'text');
      tx.setAttribute('x', xAt(idx));
      tx.setAttribute('y', H - 8);
      tx.setAttribute('text-anchor', 'middle');
      tx.textContent = data[idx].time;
      axis.appendChild(tx);
    }
    svg.appendChild(axis);

    // ─ Build step-after path ─
    let pathD = '';
    let prevY = 0;
    data.forEach((d, i) => {
      const x = xAt(i);
      const y = yAt(d.temp);
      if (i === 0) {
        pathD = 'M ' + x + ' ' + y;
      } else {
        // step-after: horizontal first to new x at prevY, then vertical to new y
        pathD += ' L ' + x + ' ' + prevY + ' L ' + x + ' ' + y;
      }
      prevY = y;
    });

    // ─ Area fill (gradient) ─
    const baseY = padT + innerH;
    const firstX = xAt(0);
    const lastX  = xAt(data.length - 1);
    const areaD  = 'M ' + firstX + ' ' + baseY + ' L ' + firstX + ' ' + yAt(data[0].temp) +
                   ' ' + pathD.slice(2) + // re-use the line path (drop initial 'M')
                   ' L ' + lastX + ' ' + baseY + ' Z';

    const area = document.createElementNS(NS, 'path');
    area.setAttribute('class', 'area');
    area.setAttribute('d', areaD);
    svg.appendChild(area);

    // ─ Line ─
    const line = document.createElementNS(NS, 'path');
    line.setAttribute('class', 'line');
    line.setAttribute('d', pathD);
    svg.appendChild(line);
  }

  // ─── Mitigation Audit Table ──────────────────────────────
  function getEventColor(type) {
    if (!type) return '#4a5568';
    const t = type.toLowerCase();
    if (t.includes('earthquake') || t.includes('seismic')) return '#ff3366';
    if (t.includes('thermal') || t.includes('temp_spike') || t.includes('power')) return '#ff6600';
    if (t.includes('flood'))      return '#00d4ff';
    if (t.includes('boot'))       return '#00ff88';
    if (t.includes('routine'))    return '#4a5568';
    return '#4a5568';
  }

  function getAiDecision(advice) {
    if (!advice) return 'NO_ACTION';
    const a = String(advice).toUpperCase();
    if (a.includes('EVACUAT'))                       return 'EVACUATE';
    if (a.includes('COOL') || a.includes('VENTIL'))  return 'COOLING_BOOST';
    if (a.includes('REROUTE') || a.includes('POWER')) return 'REROUTE_MAINS';
    if (a.includes('EVALUAT') || a.includes('MONITOR')) return 'EVALUATE_ONLY';
    if (a.includes('INITIALIZ') || a.includes('BOOT')) return 'INITIALIZED';
    return 'EVALUATE_ONLY';
  }

  function renderMitigations() {
    const tbody = $('mit-tbody');
    if (!tbody) return;
    const rows = (state.mitigations || []).slice(0, 6);

    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" class="empty">NO_DATA</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(row => {
      const color    = getEventColor(row.event_type);
      const decision = getAiDecision(row.mitigation_advice);
      const highlighted = Number(row.confidence_score) >= 0.8;
      const eventLabel  = (row.event_type || 'UNKNOWN').toUpperCase();

      const decisionCell = highlighted
        ? '<span class="decision-badge" style="color:' + color + ';border-color:' + color + '">' + decision + '</span>'
        : '<span style="color:#4a5568">' + decision + '</span>';

      return '<tr>' +
        '<td style="color:#4a5568">' + fmtTime(row.processed_at) + '</td>' +
        '<td style="color:' + color + '">' + eventLabel + '</td>' +
        '<td>' + decisionCell + '</td>' +
        '</tr>';
    }).join('');
  }

  // ─── Devices Bar ──────────────────────────────────────────
  function renderDevices() {
    const list = $('device-list');
    if (!list) return;
    const devices = state.devices || [];
    if (devices.length === 0) {
      list.innerHTML = '<span style="color:#2a3a50">—</span>';
      return;
    }
    list.innerHTML = devices.map(d =>
      '<span class="device-item">' +
        '<span class="dot pulse-dot" style="background:#00ff88;width:6px;height:6px"></span>' +
        '<span>' + d.device_id + '</span>' +
        '<span class="count">(' + (d.total_readings || 0) + ')</span>' +
      '</span>'
    ).join('');
  }

  // ─── Fetch all + render ──────────────────────────────────
  async function fetchAll() {
    const errBar = $('error-bar');
    try {
      const results = await Promise.allSettled([
        window.api.stats(),
        window.api.realtime(),
        window.api.trends('24h'),
        window.api.mitigationHistory(20),
        window.api.bmkgLatest(),
        window.api.devices(),
      ]);

      if (results[0].status === 'fulfilled') state.stats       = results[0].value?.data;
      if (results[1].status === 'fulfilled') state.realtime    = results[1].value?.data || [];
      if (results[2].status === 'fulfilled') state.trends      = results[2].value?.data || [];
      if (results[3].status === 'fulfilled') state.mitigations = results[3].value?.data || [];
      if (results[4].status === 'fulfilled') state.bmkg        = results[4].value?.data;
      if (results[5].status === 'fulfilled') state.devices     = results[5].value?.data || [];

      // Hide error if at least one succeeded
      const anyOk = results.some(r => r.status === 'fulfilled');
      if (anyOk && errBar) errBar.classList.add('hidden');

      renderSystemStatus();
      renderClimate();
      renderThreatRadar();
      renderChart();
      renderMitigations();
      renderDevices();
    } catch (e) {
      if (errBar) errBar.classList.remove('hidden');
      console.error('[fetchAll]', e);
    }
  }

  // ─── Init ─────────────────────────────────────────────────
  function init() {
    // First clock tick + interval
    setText('sys-time', 'SYS_TIME: ' + fmtUTC());
    setInterval(() => setText('sys-time', 'SYS_TIME: ' + fmtUTC()), 1000);

    // Initial load
    fetchAll();

    // Refresh data tiap 60 detik
    setInterval(fetchAll, 60000);

    // Re-render chart on resize
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(renderChart, 150);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
