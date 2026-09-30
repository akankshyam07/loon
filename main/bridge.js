// Bridge between the Chrome extension and the app (DESIGN.md §1, §4.4): a WebSocket server bound to 127.0.0.1.
// Only a client that knows the pairing code *and* comes from a chrome-extension:// origin may connect,
// so ordinary web pages (which can also open localhost sockets) are refused.
const crypto = require('crypto');
const { EventEmitter } = require('events');
const { WebSocketServer } = require('ws');

const PORT = 47631;

function newPairingCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I confusion
  return Array.from(crypto.randomBytes(6), (b) => alphabet[b % alphabet.length]).join('');
}

class Bridge extends EventEmitter {
  constructor({ pairingCode, port = PORT }) {
    super();
    this.pairingCode = pairingCode;
    this.port = port;
    this.clients = new Set();
    this.pending = new Map();
    this.nextId = 1;
  }

  start() {
    this.server = new WebSocketServer({
      host: '127.0.0.1',
      port: this.port,
      maxPayload: 8 * 1024 * 1024,
      verifyClient: ({ req, origin }) => {
        const token = new URL(req.url, 'http://localhost').searchParams.get('token') || '';
        const expected = Buffer.from(this.pairingCode);
        const given = Buffer.from(token.toUpperCase());
        const tokenOk = given.length === expected.length && crypto.timingSafeEqual(given, expected);
        return tokenOk && typeof origin === 'string' && origin.startsWith('chrome-extension://');
      },
    });
    this.listening = false;
    this.server.on('listening', () => { this.listening = true; });
    this.server.on('error', (err) => {
      console.error(`[bridge] ${err.message}${err.code === 'EADDRINUSE' ? ' (is another copy of Loon running?)' : ''}`);
    });
    this.server.on('connection', (socket) => {
      this.clients.add(socket);
      this.emit('status', { connected: this.clients.size });
      socket.on('message', (raw) => this.onMessage(socket, raw));
      socket.on('close', () => {
        this.clients.delete(socket);
        this.emit('status', { connected: this.clients.size });
      });
    });
  }

  onMessage(socket, raw) {
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (message.type === 'ping') return socket.send(JSON.stringify({ type: 'pong' }));
    if (message.replyTo && this.pending.has(message.replyTo)) {
      const { resolve, timer } = this.pending.get(message.replyTo);
      clearTimeout(timer);
      this.pending.delete(message.replyTo);
      return resolve(message);
    }
    this.emit('message', message);
  }

  broadcast(message) {
    const data = JSON.stringify(message);
    for (const socket of this.clients) socket.send(data);
  }

  // Request/response to the extension, e.g. { type: 'get-page', tabId }.
  request(message, timeoutMs = 8000) {
    if (!this.clients.size) return Promise.reject(new Error('The Loon browser extension is not connected'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('The browser did not answer in time'));
      }, timeoutMs);
      this.pending.set(id, { resolve, timer });
      this.broadcast({ ...message, requestId: id });
    });
  }

  stop() {
    this.server?.close();
  }
}

module.exports = { Bridge, newPairingCode, PORT };
