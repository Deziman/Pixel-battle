PIXEL BATTLE (CSSD 315 Computer Graphics, Brief 1)

RUN
  1. Install Node.js (version 18 or newer).
  2. In this folder run:   npm install
  3. Then run:            npm start
  4. The terminal prints the addresses. Open http://localhost:3000 on the laptop.
     Phones on the same Wi-Fi open the http://192.168.x.x:3000 address that is printed.
  Optional: COOLDOWN_MS=5000 (default), PORT=3000 (default).
  To start a fresh battle, stop the server and delete actions.jsonl (the stored action log).

LOAD TEST (simulated players)
  With the server running:   node loadtest.js 20 10
  (20 players, 10 rounds). It prints delivery delay, late-joiner check and PASS or FAIL.
  Tip: run the server with COOLDOWN_MS=300 for the test so the bots are not held back.

FILES
  server.js          Node.js + ws: shared canvas, sync, cooldown, team scores, action log
  public/index.html  The client: setPixel, tools, HSB palette, scoreboard, replay
  loadtest.js        Simulated players for the 15+ player test

MAPPING TO THE BRIEF
  1  128 x 128 canvas, drawn only by setPixel()                  index.html: setPixel
  2  Pen, Bresenham line, midpoint circle, scan-line polygon,
     queue-based paint bucket                                    bresenham, midpointCircle, scanlineFill, floodFill
  3  Real-time sync, new player gets the current canvas          server.js (WebSocket 'init' and 'draw')
  4  16-colour HSB palette with H, S, B, RGB and HEX shown,
     4 team colours (thick border)                               PAL, hsb2rgb, palette card
  5  Cooldown per player (5 s) and live team scoreboard          server.js cooldown and counts
  6  Time-lapse replay from the stored action log                actions.jsonl, /log, Replay button
  7  Phones (touch) and laptops, tested with 15+ players         pointer events, loadtest.js
