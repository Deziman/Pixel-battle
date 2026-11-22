'use strict';
// Pixel Battle server: one shared canvas, WebSocket sync, per-player cooldown,
// team scores and a stored action log (actions.jsonl).
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');

const W = 128, H = 128, NCOL = 16;
const TEAMS = [4, 5, 6, 7];                       // palette indices of the four team colours
const PORT = +process.env.PORT || 3000;
const COOLDOWN = +process.env.COOLDOWN_MS || 5000; // one action per player every 5 s
const LOGFILE = process.env.LOG_FILE || path.join(__dirname, 'actions.jsonl');

const canvas = new Uint8Array(W * H);             // palette index per cell, 0 = white
const counts = TEAMS.map(() => 0);                // pixels currently on the canvas per team colour
const log = [];                                   // [{ts, c, px:[cell indexes]}]
const lastAction = new Map();                     // player id -> time of last accepted action

function valid(c, px) {
  return Number.isInteger(c) && c >= 0 && c < NCOL && Array.isArray(px) &&
    px.length > 0 && px.length <= W * H &&
    px.every(i => Number.isInteger(i) && i >= 0 && i < W * H);
}

function apply(c, px) {
  const to = TEAMS.indexOf(c);
  for (const i of px) {
    const old = canvas[i];
    if (old === c) continue;
    const from = TEAMS.indexOf(old);
    if (from >= 0) counts[from]--;
    canvas[i] = c;
    if (to >= 0) counts[to]++;
  }
}

// Rebuild the battle from the stored action log when the server restarts.
if (fs.existsSync(LOGFILE)) {
  for (const line of fs.readFileSync(LOGFILE, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      if (valid(e.c, e.px) && Number.isFinite(e.ts)) { apply(e.c, e.px); log.push(e); }
    } catch (_) { /* skip a damaged line */ }
  }
}
const logStream = fs.createWriteStream(LOGFILE, { flags: 'a' });

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    fs.readFile(path.join(__dirname, 'public', 'index.html'), (err, buf) => {
      if (err) { res.writeHead(500); res.end('index.html missing'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(buf);
    });
  } else if (req.url === '/log') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(log));
  } else {
    res.writeHead(404); res.end('Not found');
  }
});

const wss = new WebSocketServer({ server, maxPayload: 256 * 1024 });

wss.on('connection', ws => {
  ws.pid = null;
  ws.on('message', data => {
    let m;
    try { m = JSON.parse(data); } catch (_) { return; }

    if (m.t === 'hello') {
      ws.pid = String(m.id || '').slice(0, 64) || crypto.randomBytes(8).toString('hex');
      // a new (or reconnecting) player receives the current canvas
      ws.send(JSON.stringify({
        t: 'init', w: W, h: H, cooldown: COOLDOWN, scores: counts,
        canvas: Buffer.from(canvas).toString('base64')
      }));
      return;
    }

    if (m.t === 'draw' && ws.pid) {
      const now = Date.now();
      const wait = (lastAction.get(ws.pid) || 0) + COOLDOWN - now;
      if (wait > 0) { ws.send(JSON.stringify({ t: 'wait', ms: wait })); return; }
      if (!valid(m.c, m.px)) { ws.send(JSON.stringify({ t: 'wait', ms: 0 })); return; }
      lastAction.set(ws.pid, now);
      apply(m.c, m.px);
      const entry = { ts: now, c: m.c, px: m.px };
      log.push(entry);
      logStream.write(JSON.stringify(entry) + '\n');
      ws.send(JSON.stringify({ t: 'ok', cooldown: COOLDOWN }));
      const msg = JSON.stringify({ t: 'draw', c: m.c, px: m.px, scores: counts });
      for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) client.send(msg);
      }
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('Pixel Battle running. Open one of these on any device on the same Wi-Fi:');
  console.log('  http://localhost:' + PORT);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const n of list) if (n.family === 'IPv4' && !n.internal) console.log('  http://' + n.address + ':' + PORT);
  }
  console.log('Cooldown: ' + COOLDOWN / 1000 + ' s per action. Action log: ' + LOGFILE);
});
