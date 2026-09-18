const dgram = require('dgram');
const net = require('net');

const DNS_SERVERS = ["8.8.8.8", "1.1.1.1"];
const UDP_TIMEOUT_MS = 30000; // 30 detik idle timeout
const MAX_PACKET_LEN = 65535;

const ATYP_IPV4 = 0x01;
const ATYP_DOMAIN = 0x02;
const ATYP_IPV6 = 0x03;

function formatIPv6(bytes) {
  const parts = [];
  for (let i = 0; i < 16; i += 2) {
    parts.push(bytes.readUInt16BE(i).toString(16));
  }
  return parts.join(':');
}

function ipv6ToBytes(address) {
  let input = address;
  const zone = input.indexOf('%');
  if (zone >= 0) input = input.slice(0, zone);
  let ipv4Tail = null;
  const lastColon = input.lastIndexOf(':');
  if (input.includes('.') && lastColon >= 0) {
    const ipv4 = input.slice(lastColon + 1).split('.').map(Number);
    ipv4Tail = [((ipv4[0] << 8) | ipv4[1]).toString(16), ((ipv4[2] << 8) | ipv4[3]).toString(16)];
    input = input.slice(0, lastColon) + ':' + ipv4Tail.join(':');
  }
  const halves = input.split('::');
  const left = halves[0] ? halves[0].split(':').filter(Boolean) : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':').filter(Boolean) : [];
  const missing = 8 - left.length - right.length;
  const words = [...left, ...Array(Math.max(0, missing)).fill('0'), ...right];
  const out = Buffer.alloc(16);
  words.forEach((word, i) => {
    out.writeUInt16BE(parseInt(word, 16), i * 2);
  });
  return out;
}

class UDPManager {
  constructor() {
    this.sessions = new Map();
  }

  encodeUDPSource(rinfo) {
    const port = Number(rinfo.port);
    const family = net.isIP(rinfo.address);
    const head = Buffer.alloc(3);
    head.writeUInt16BE(port, 0);
    if (family === 4) {
      head[2] = ATYP_IPV4;
      return Buffer.concat([head, Buffer.from(rinfo.address.split('.').map(Number))]);
    }
    if (family === 6) {
      head[2] = ATYP_IPV6;
      return Buffer.concat([head, ipv6ToBytes(rinfo.address)]);
    }
    return head;
  }

  handleOutbound(targetAddress, targetPort, dataChunk, webSocket, responseHeader, isGamePacket = false) {
    let destAddress = targetAddress;

    if (targetPort === 53) {
      destAddress = DNS_SERVERS[Math.floor(Math.random() * DNS_SERVERS.length)];
    }

    const wsId = webSocket.id || 'default';
    const sessionKey = `${targetAddress}:${targetPort}:${wsId}`;
    let session = this.sessions.get(sessionKey);

    if (!session) {
      const sock = dgram.createSocket('udp4');

      session = {
        socket: sock,
        webSocket: webSocket,
        header: responseHeader,
        timer: null
      };

      sock.on('message', (msg, rinfo) => {
        if (webSocket.readyState === 1) {
          if (session.header) {
            webSocket.send(Buffer.concat([Buffer.from(session.header), msg]));
            session.header = null;
          } else {
            // Jika ini format packet UDP game dengan source header
            webSocket.send(msg);
          }
        }
        this.refreshTimeout(sessionKey);
      });

      sock.on('error', () => {
        this.closeSession(sessionKey);
      });

      this.sessions.set(sessionKey, session);
    }

    if (dataChunk && dataChunk.length > 0) {
      session.socket.send(dataChunk, targetPort, destAddress, (err) => {
        if (err) {
          this.closeSession(sessionKey);
        }
      });
    }

    this.refreshTimeout(sessionKey);
  }

  refreshTimeout(sessionKey) {
    const session = this.sessions.get(sessionKey);
    if (!session) return;
    if (session.timer) clearTimeout(session.timer);
    session.timer = setTimeout(() => {
      this.closeSession(sessionKey);
    }, UDP_TIMEOUT_MS);
  }

  closeSession(sessionKey) {
    const session = this.sessions.get(sessionKey);
    if (session) {
      if (session.timer) clearTimeout(session.timer);
      try {
        session.socket.close();
      } catch (_) {}
      this.sessions.delete(sessionKey);
    }
  }

  cleanupForWebSocket(webSocket) {
    for (const [key, session] of this.sessions.entries()) {
      if (session.webSocket === webSocket) {
        this.closeSession(key);
      }
    }
  }
}

module.exports = new UDPManager();
