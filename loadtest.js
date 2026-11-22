'use strict';
// Load test: many simulated players join, draw, and we check that every one of them
// receives every change quickly and ends with the same canvas as the server.
// Usage: node loadtest.js [players=20] [rounds=10] [url=ws://localhost:3000]
const WebSocket = require('ws');
const http = require('http');

const N = +process.argv[2] || 20;
const ROUNDS = +process.argv[3] || 10;
const URL_WS = process.argv[4] || 'ws://localhost:3000';
const W = 128, H = 128;

const bots = [];
const delays = [];
let sentAt = 0, probeIdx = -1, seenBy = 0;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function makeBot(k) {
  return new Promise(resolve => {
    const ws = new WebSocket(URL_WS);
    const bot = { ws, canvas: new Uint8Array(W * H), id: 'bot' + k, waits: 0, ok: 0 };
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', id: bot.id })));
    ws.on('message', d => {
      const m = JSON.parse(d);
      if (m.t === 'init') { Buffer.from(m.canvas, 'base64').forEach((v, i) => { bot.canvas[i] = v; }); resolve(bot); }
      else if (m.t === 'draw') {
        for (const i of m.px) bot.canvas[i] = m.c;
        if (m.px.includes(probeIdx)) { delays.push(Date.now() - sentAt); seenBy++; }
      } else if (m.t === 'wait') bot.waits++;
      else if (m.t === 'ok') bot.ok++;
    });
    bots.push(bot);
  });
}

function getLog() {
  return new Promise(res => {
    const u = URL_WS.replace('ws://', 'http://') + '/log';
    http.get(u, r => { let s = ''; r.on('data', c => s += c); r.on('end', () => res(JSON.parse(s))); });
  });
}

(async () => {
  console.log('Connecting ' + N + ' players to ' + URL_WS);
  await Promise.all(Array.from({ length: N }, (_, k) => makeBot(k)));

  for (let r = 0; r < ROUNDS; r++) {
    const bot = bots[r % N];
    probeIdx = Math.floor(Math.random() * W * H);
    seenBy = 0; sentAt = Date.now();
    bot.ws.send(JSON.stringify({ t: 'draw', c: 4 + (r % 4), px: [probeIdx] }));
    // the same player acting again at once must be refused by the cooldown
    if (r === 0) bot.ws.send(JSON.stringify({ t: 'draw', c: 5, px: [1] }));
    await sleep(400);
  }
  // a big action (a fill-sized update) from one player
  probeIdx = 5000; sentAt = Date.now(); seenBy = 0;
  bots[N - 1].ws.send(JSON.stringify({ t: 'draw', c: 6, px: Array.from({ length: 3000 }, (_, i) => 5000 + i) }));
  await sleep(800);

  // a late joiner must receive the current canvas
  const late = await makeBot(999);
  await sleep(200);

  const log = await getLog();
  const expect = new Uint8Array(W * H);
  for (const e of log) for (const i of e.px) expect[i] = e.c;
  const same = b => b.canvas.every((v, i) => v === expect[i]);
  const allSame = bots.every(same);

  delays.sort((a, b) => a - b);
  const avg = delays.reduce((s, v) => s + v, 0) / delays.length;
  console.log('Players connected:            ' + N + ' (+1 late joiner)');
  const expected = (ROUNDS + 1) * N;
  console.log('Updates received:             ' + delays.length + ' of ' + expected + ' expected (every player sees every change)');
  console.log('Delivery delay avg / max:     ' + avg.toFixed(1) + ' ms / ' + delays[delays.length - 1] + ' ms (target: under 1000 ms)');
  console.log('Cooldown refusals seen:       ' + bots.reduce((s, b) => s + b.waits, 0));
  console.log('Late joiner got full canvas:  ' + same(late));
  console.log('All canvases match the log:   ' + allSame);
  const pass = allSame && same(late) && delays.length === expected && delays[delays.length - 1] < 1000;
  console.log(pass ? 'RESULT: PASS' : 'RESULT: FAIL');
  bots.forEach(b => b.ws.close());
  process.exit(pass ? 0 : 1);
})();
