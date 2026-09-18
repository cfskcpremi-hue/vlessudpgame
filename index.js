const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const net = require('net');
const url = require('url');
const udpManager = require('./udp');

const PORT = process.env.PORT || 3000;
const SYSTEM_UUID = process.env.SYSTEM_UUID || "c48619fe-8f02-49e0-b9e9-edf763e17e21";

// Mapping Custom Path ke IP Target
const PROXY_MAP = {
  "id-akamai": "172.232.249.224:2053",
  "id-deneva": "202.155.95.132:443",
  "sg-ovh": "51.79.177.53:443",
  "sg-oracle": "138.2.64.229:443"
};

const horse = Buffer.from("dHJvamFu", 'base64').toString(); // trojan
const flash = Buffer.from("dm1lc3M=", 'base64').toString(); // vmess
const RELAY_MAGIC = Buffer.from('VLRLY004', 'ascii');

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
  "Access-Control-Max-Age": "86400",
};

class GatewayServer {
  constructor() {
    this.prxIP = "104.64.192.116:443";
    this.wss = null;
  }

  handleHttpRequest(req, res) {
    const parsedUrl = url.parse(req.url, true);

    if (req.method === 'OPTIONS') {
      res.writeHead(200, CORS_HEADERS);
      res.end();
      return;
    }

    if (parsedUrl.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json', ...CORS_HEADERS });
      res.end(JSON.stringify({ status: 'healthy', uptime: Math.floor(process.uptime()), udpGameSupport: 'XUDP_ACTIVE 🟢' }));
      return;
    }

    if (parsedUrl.pathname === '/' || parsedUrl.pathname === '/dashboard') {
      const uptime = Math.floor(process.uptime());
      const ramUsed = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>KANCIL VPN // CYBERPUNK GATEWAY + GAME UDP</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap');
    body { font-family: 'JetBrains Mono', monospace; background-color: #07080e; color: #cbd5e1; }
    .glow-box { box-shadow: 0 0 20px rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); }
    .neon-card { background: #0d0f1a; border: 1px solid #1e293b; }
  </style>
</head>
<body class="min-h-screen pb-12">
  <header class="border-b border-slate-800 bg-[#0a0c16]/90 backdrop-blur sticky top-0 z-50 px-6 py-4">
    <div class="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <div class="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
          <i class="fa-solid fa-gamepad text-lg"></i>
        </div>
        <div>
          <h1 class="text-lg font-bold tracking-wider text-white">KANCIL_VPN<span class="text-emerald-400">.sys</span></h1>
          <p class="text-[10px] text-slate-500">RAILWAY HIGH-SPEED + GAME UDP RELAY</p>
        </div>
      </div>
      <div class="flex items-center gap-2 bg-emerald-950/60 border border-emerald-800 px-4 py-1.5 rounded-lg">
        <span class="h-2 w-2 rounded-full bg-emerald-400 animate-ping"></span>
        <span class="text-xs font-semibold text-emerald-300">UDP GAME READY 🟢</span>
      </div>
    </div>
  </header>

  <main class="max-w-6xl mx-auto px-6 pt-8 space-y-6">
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="neon-card p-4 rounded-xl">
        <p class="text-[10px] text-slate-500 font-bold mb-1">UPTIME</p>
        <p class="text-lg font-bold text-white">${uptime}s</p>
      </div>
      <div class="neon-card p-4 rounded-xl">
        <p class="text-[10px] text-slate-500 font-bold mb-1">RAM USED</p>
        <p class="text-lg font-bold text-emerald-400">${ramUsed} MB</p>
      </div>
      <div class="neon-card p-4 rounded-xl">
        <p class="text-[10px] text-slate-500 font-bold mb-1">PROTOKOL</p>
        <p class="text-lg font-bold text-purple-400">VLESS / TROJAN</p>
      </div>
      <div class="neon-card p-4 rounded-xl">
        <p class="text-[10px] text-slate-500 font-bold mb-1">UDP GAME</p>
        <p class="text-lg font-bold text-amber-400">XUDP ACTIVE</p>
      </div>
    </div>

    <div class="glow-box bg-[#0c0e18] rounded-2xl p-6">
      <div class="flex items-center gap-2 border-b border-slate-800 pb-3 mb-6">
        <i class="fa-solid fa-sliders text-emerald-400"></i>
        <h2 class="text-sm font-bold tracking-wide text-white">CONFIG GENERATOR</h2>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="space-y-4">
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="text-xs text-slate-400">UUID / Password</label>
              <button onclick="genUUID()" class="text-[10px] text-emerald-400 hover:text-emerald-300">
                <i class="fa-solid fa-arrows-rotate"></i> ACAK UUID
              </button>
            </div>
            <input id="uuid" type="text" value="${SYSTEM_UUID}" class="w-full bg-[#06070c] border border-slate-800 rounded-lg p-2.5 text-xs text-emerald-300 font-mono">
          </div>

          <div>
            <label class="text-xs text-slate-400 block mb-1">Username / Remark</label>
            <input id="remark" type="text" value="Kancil-Game-VPN" class="w-full bg-[#06070c] border border-slate-800 rounded-lg p-2.5 text-xs text-white font-mono">
          </div>

          <div>
            <label class="text-xs text-slate-400 block mb-1">Pilih Target Path Proxy</label>
            <select id="path" class="w-full bg-[#06070c] border border-slate-800 rounded-lg p-2.5 text-xs text-emerald-300 font-mono">
              <option value="id-akamai">🇮🇩 /id-akamai</option>
              <option value="id-deneva" selected>🇮🇩 /id-deneva</option>
              <option value="sg-ovh">🇸🇬 /sg-ovh</option>
              <option value="sg-oracle">🇸🇬 /sg-oracle</option>
            </select>
          </div>

          <button onclick="genAcc()" class="w-full bg-emerald-600 hover:bg-emerald-500 text-black font-bold py-3 rounded-lg text-xs transition active:scale-95">
            GENERATE CONFIG LINKS
          </button>
        </div>

        <div class="space-y-4">
          <div>
            <div class="flex items-center justify-between mb-1">
              <span class="text-[10px] text-purple-400 font-bold">VLESS WS TLS</span>
              <button onclick="copyId('vless')" class="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded">COPY</button>
            </div>
            <textarea id="vless" readonly class="w-full bg-[#06070c] border border-slate-800 rounded-lg p-2.5 text-xs text-purple-300 font-mono h-28 resize-none"></textarea>
          </div>
          <div>
            <div class="flex items-center justify-between mb-1">
              <span class="text-[10px] text-amber-400 font-bold">TROJAN WS TLS</span>
              <button onclick="copyId('trojan')" class="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded">COPY</button>
            </div>
            <textarea id="trojan" readonly class="w-full bg-[#06070c] border border-slate-800 rounded-lg p-2.5 text-xs text-amber-300 font-mono h-28 resize-none"></textarea>
          </div>
        </div>
      </div>
    </div>
  </main>

  <script>
    const currentHost = location.host.split(':')[0];

    function genUUID() {
      document.getElementById('uuid').value = crypto.randomUUID();
      genAcc();
    }

    function genAcc() {
      const u = document.getElementById('uuid').value.trim();
      const p = document.getElementById('path').value.trim();
      const r = document.getElementById('remark').value.trim() || 'Kancil-Game';
      const cleanPath = "/" + p;
      const remarkTag = encodeURIComponent(\`\${r}[\${p}]-GAME\`);

      document.getElementById('vless').value = \`vless://\${u}@\${currentHost}:443?encryption=none&security=tls&sni=\${currentHost}&type=ws&host=\${currentHost}&path=\${encodeURIComponent(cleanPath)}#\${remarkTag}\`;
      document.getElementById('trojan').value = \`trojan://\${u}@\${currentHost}:443?security=tls&sni=\${currentHost}&type=ws&host=\${currentHost}&path=\${encodeURIComponent(cleanPath)}#\${remarkTag}\`;
    }

    function copyId(id) {
      const el = document.getElementById(id);
      el.select();
      navigator.clipboard.writeText(el.value);
      alert('Config berhasil disalin!');
    }

    window.onload = genAcc;
  </script>
</body>
</html>`);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }

  async handleWebSocketConnection(ws, request) {
    try {
      ws.id = Math.random().toString(36).substring(2, 9);
      const parsedUrl = url.parse(request.url, true);
      const rawPath = parsedUrl.pathname.replace("/", "");

      if (PROXY_MAP[rawPath]) {
        this.prxIP = PROXY_MAP[rawPath];
      }

      await this.websocketHandler(ws);
    } catch (err) {
      if (ws.readyState === WebSocket.OPEN) ws.close(1011, 'Internal Error');
    }
  }

  async websocketHandler(ws) {
    let remoteSocketWrapper = { value: null };
    let isXudpRelay = false;

    ws.on('message', async (message) => {
      try {
        const chunk = Buffer.from(message);

        // Deteksi handshake XUDP / Game Relay (`VLRLY004`)
        if (!isXudpRelay && chunk.length >= 8 && chunk.subarray(0, 8).equals(RELAY_MAGIC)) {
          isXudpRelay = true;
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(Buffer.from([0]));
          }
          return;
        }

        if (isXudpRelay) {
          // Parsing paket XUDP game secara dinamis ke target IP/Port asli
          if (chunk.length > 4) {
            const dataLen = chunk.readUInt16BE(0);
            let cursor = 2;
            
            if (cursor + 2 > chunk.length) return;
            const targetPort = chunk.readUInt16BE(cursor);
            cursor += 2;

            if (cursor >= chunk.length) return;
            const atyp = chunk[cursor];
            cursor += 1;

            let targetAddress = "";
            if (atyp === 0x01) { // IPv4
              if (cursor + 4 > chunk.length) return;
              targetAddress = `${chunk[cursor]}.${chunk[cursor+1]}.${chunk[cursor+2]}.${chunk[cursor+3]}`;
              cursor += 4;
            } else if (atyp === 0x02) { // Domain
              if (cursor >= chunk.length) return;
              const domainLen = chunk[cursor];
              cursor += 1;
              if (cursor + domainLen > chunk.length) return;
              targetAddress = chunk.subarray(cursor, cursor + domainLen).toString('utf8');
              cursor += domainLen;
            } else if (atyp === 0x03) { // IPv6
              if (cursor + 16 > chunk.length) return;
              targetAddress = "::1";
              cursor += 16;
            }

            const packetData = chunk.subarray(cursor, cursor + dataLen);
            if (targetAddress && targetPort && packetData.length > 0) {
              udpManager.handleOutbound(targetAddress, targetPort, packetData, ws, null, true);
            }
          }
          return;
        }

        if (remoteSocketWrapper.value) {
          if (remoteSocketWrapper.value.writable) remoteSocketWrapper.value.write(chunk);
          return;
        }

        const protocol = await this.protocolSniffer(chunk);
        let header;

        if (protocol === horse) header = this.readHorseHeader(chunk);
        else if (protocol === flash) header = this.readFlashHeader(chunk);
        else header = this.readSsHeader(chunk);

        if (header.hasError) throw new Error(header.message);

        if (header.isUDP) {
          return udpManager.handleOutbound(
            header.addressRemote,
            header.portRemote,
            chunk.slice(header.rawDataIndex),
            ws,
            header.version
          );
        }

        this.handleTCPOutBound(remoteSocketWrapper, header.addressRemote, header.portRemote, header.rawClientData, ws, header.version);
      } catch (err) {
        if (ws.readyState === WebSocket.OPEN) ws.close(1011, err.message);
      }
    });

    ws.on('close', () => {
      if (remoteSocketWrapper.value) remoteSocketWrapper.value.end();
      udpManager.cleanupForWebSocket(ws);
    });

    ws.on('error', () => udpManager.cleanupForWebSocket(ws));
  }

  async protocolSniffer(buffer) {
    if (buffer.length >= 62) {
      const d = buffer.slice(56, 60);
      if (d[0] === 0x0d && d[1] === 0x0a && [0x01,0x03,0x7f].includes(d[2]) && [0x01,0x03,0x04].includes(d[3])) return horse;
    }
    const h = buffer.slice(1, 17).toString('hex');
    if (h.match(/^[0-9a-f]{8}[0-9a-f]{4}4[0-9a-f]{3}[89ab][0-9a-f]{3}[0-9a-f]{12}$/i)) return flash;
    return "ss";
  }

  async handleTCPOutBound(remoteSocket, addressRemote, portRemote, rawClientData, webSocket, responseHeader) {
    const connectAndWrite = (address, port) => new Promise((resolve, reject) => {
      const s = net.createConnection({ host: address, port }, () => {
        s.write(rawClientData);
        resolve(s);
      });
      s.on('error', reject);
    });

    const retry = async () => {
      try {
        const parts = this.prxIP.split(":");
        const s = await connectAndWrite(parts[0], parseInt(parts[1], 10) || 443);
        remoteSocket.value = s;
        s.on('close', () => { if (webSocket.readyState === WebSocket.OPEN) webSocket.close(); });
        s.on('error', () => { if (webSocket.readyState === WebSocket.OPEN) webSocket.close(); });
        this.remoteSocketToWS(s, webSocket, responseHeader, null);
      } catch (e) {
        if (webSocket.readyState === WebSocket.OPEN) webSocket.close();
      }
    };

    try {
      const s = await connectAndWrite(addressRemote, portRemote);
      remoteSocket.value = s;
      s.on('close', () => { if (webSocket.readyState === WebSocket.OPEN) webSocket.close(); });
      s.on('error', () => { if (webSocket.readyState === WebSocket.OPEN) webSocket.close(); });
      this.remoteSocketToWS(s, webSocket, responseHeader, retry);
    } catch (e) {
      await retry();
    }
  }

  readSsHeader(buf) {
    const at = buf[0]; let al = 0, avi = 1, av = "";
    if (at === 1) { al = 4; av = Array.from(buf.slice(avi, avi+al)).join("."); }
    else if (at === 3) { al = buf[avi]; avi += 1; av = buf.slice(avi, avi+al).toString(); }
    else if (at === 4) { al = 16; const ip = []; for(let i=0;i<8;i++) ip.push(buf.readUInt16BE(avi+i*2).toString(16)); av = ip.join(":"); }
    else return { hasError: true, message: `Invalid addr type: ${at}` };
    const pi = avi + al;
    const pr = buf.readUInt16BE(pi);
    return { hasError: false, addressRemote: av, portRemote: pr, rawDataIndex: pi+2, rawClientData: buf.slice(pi+2), version: null, isUDP: pr === 53 || pr > 1024 };
  }

  readFlashHeader(buf) {
    const v = buf[0]; let udp = false;
    const ol = buf[17]; const cmd = buf[18+ol];
    if (cmd === 2) udp = true;
    const pi = 18+ol+1; const pr = buf.readUInt16BE(pi);
    let ai = pi+2; const at = buf[ai]; let al = 0, avi = ai+1, av = "";
    if (at === 1) { al = 4; av = Array.from(buf.slice(avi, avi+al)).join("."); }
    else if (at === 2) { al = buf[avi]; avi += 1; av = buf.slice(avi, avi+al).toString(); }
    else if (at === 3) { al = 16; const ip = []; for(let i=0;i<8;i++) ip.push(buf.readUInt16BE(avi+i*2).toString(16)); av = ip.join(":"); }
    return { hasError: false, addressRemote: av, portRemote: pr, rawDataIndex: avi+al, rawClientData: buf.slice(avi+al), version: Buffer.from([v,0]), isUDP: udp };
  }

  readHorseHeader(buf) {
    const db = buf.slice(58);
    if (db.length < 6) return { hasError: true, message: "Invalid data" };
    let udp = db[0] === 3;
    let at = db[1]; let al = 0, avi = 2, av = "";
    if (at === 1) { al = 4; av = Array.from(db.slice(avi, avi+al)).join("."); }
    else if (at === 3) { al = db[avi]; avi += 1; av = db.slice(avi, avi+al).toString(); }
    else if (at === 4) { al = 16; const ip = []; for(let i=0;i<8;i++) ip.push(db.readUInt16BE(avi+i*2).toString(16)); av = ip.join(":"); }
    const pi = avi + al;
    const pr = db.readUInt16BE(pi);
    return { hasError: false, addressRemote: av, portRemote: pr, rawDataIndex: pi+4, rawClientData: db.slice(pi+4), version: null, isUDP: udp };
  }

  remoteSocketToWS(remoteSocket, webSocket, responseHeader, retry) {
    let header = responseHeader, hasData = false;
    remoteSocket.on('data', (chunk) => {
      hasData = true;
      if (webSocket.readyState !== WebSocket.OPEN) { remoteSocket.destroy(); return; }
      if (header) {
        webSocket.send(Buffer.concat([Buffer.from(header), chunk]));
        header = null;
      } else {
        webSocket.send(chunk);
      }
    });
    remoteSocket.on('close', () => { if (!hasData && retry) retry(); });
  }

  start(port = PORT) {
    const server = http.createServer((req, res) => {
      this.handleHttpRequest(req, res);
    });

    this.wss = new WebSocketServer({ server, perMessageDeflate: false });
    this.wss.on('connection', (ws, req) => {
      this.handleWebSocketConnection(ws, req);
    });

    server.listen(port, '0.0.0.0', () => {
      console.log(`Kancil Gateway running on port ${port} with Full Game UDP Support`);
    });
  }
}

if (require.main === module) {
  const server = new GatewayServer();
  server.start();
}
