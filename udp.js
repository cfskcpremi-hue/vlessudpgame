const dgram = require('dgram');

const DNS_SERVERS = ["8.8.8.8", "1.1.1.1"];
const UDP_TIMEOUT_MS = 30000;

class UDPManager {
  constructor() {
    this.sessions = new Map();
  }

  handleOutbound(targetAddress, targetPort, dataChunk, webSocket, responseHeader) {
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

      sock.on('message', (msg) => {
        if (webSocket.readyState === 1) {
          if (session.header) {
            webSocket.send(Buffer.concat([Buffer.from(session.header), msg]));
            session.header = null;
          } else {
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
