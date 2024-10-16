import { WebSocketServer } from 'ws';
import { RealtimeClient } from '@openai/realtime-api-beta';
import axios from 'axios';

const MAX_CONNECTIONS = 100; // OpenAI's limit
const QUEUE_TIMEOUT = 60000; // 1 minute timeout for queued connections

export class RealtimeRelay {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.sockets = new WeakMap();
    this.wss = null;
    this.connectionQueue = [];
    this.activeConnections = 0;
    this.isInitialized = false;
  }

  listen(port) {
    this.wss = new WebSocketServer({ port });
    this.wss.on('connection', this.connectionHandler.bind(this));
    this.log(`Listening on ws://localhost:${port}`);
    this.isInitialized = true;
  }

  async connectionHandler(ws, req) {
    if (!this.isInitialized) {
      ws.send(JSON.stringify({ type: 'cold_start', message: 'Server is initializing. Please wait.' }));
      await this.waitForInitialization();
    }

    if (this.activeConnections >= MAX_CONNECTIONS) {
      this.addToQueue(ws);
      return;
    }

    this.activeConnections++;
    this.processConnection(ws, req);
  }

  async waitForInitialization() {
    while (!this.isInitialized) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  addToQueue(ws) {
    this.connectionQueue.push(ws);
    ws.send(JSON.stringify({ type: 'queued', message: 'Server is at capacity. You are in the queue.' }));
    
    setTimeout(() => {
      const index = this.connectionQueue.indexOf(ws);
      if (index > -1) {
        this.connectionQueue.splice(index, 1);
        ws.close();
      }
    }, QUEUE_TIMEOUT);
  }

  processNextInQueue() {
    if (this.connectionQueue.length > 0 && this.activeConnections < MAX_CONNECTIONS) {
      const ws = this.connectionQueue.shift();
      this.activeConnections++;
      this.processConnection(ws, { url: '/' });
    }
  }

  async processConnection(ws, req) {
    if (!req.url) {
      this.log('No URL provided, closing connection.');
      ws.close();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    if (pathname !== '/') {
      this.log(`Invalid pathname: "${pathname}"`);
      ws.close();
      return;
    }

    // Instantiate new client
    this.log(`Connecting with key "${this.apiKey.slice(0, 3)}..."`);
    const client = new RealtimeClient({ apiKey: this.apiKey });

    // Relay: OpenAI Realtime API Event -> Browser Event
    client.realtime.on('server.*', (event) => {
      this.log(`Relaying "${event.type}" to Client`);
      ws.send(JSON.stringify(event));
    });
    client.realtime.on('close', () => ws.close());

    // Relay: Browser Event -> OpenAI Realtime API Event
    // We need to queue data waiting for the OpenAI connection
    const messageQueue = [];
    const messageHandler = (data) => {
      try {
        const event = JSON.parse(data);
        this.log(`Relaying "${event.type}" to OpenAI`);
        client.realtime.send(event.type, event);
      } catch (e) {
        console.error(e.message);
        this.log(`Error parsing event from client: ${data}`);
      }
    };
    ws.on('message', (data) => {
      if (!client.isConnected()) {
        messageQueue.push(data);
      } else {
        messageHandler(data);
      }
    });
    ws.on('close', () => {
      this.activeConnections--;
      client.disconnect();
      this.processNextInQueue();
    });

    // Connect to OpenAI Realtime API
    try {
      this.log(`Connecting to OpenAI...`);
      await client.connect();
    } catch (e) {
      this.log(`Error connecting to OpenAI: ${e.message}`);
      ws.close();
      return;
    }
    this.log(`Connected to OpenAI successfully!`);
    while (messageQueue.length) {
      messageHandler(messageQueue.shift());
    }
  }

  log(...args) {
    console.log(`[RealtimeRelay]`, ...args);
  }
}

// Note: We're not exporting the router here as it's not being used in this file.
// If you need to add routes, you should do it in the index.js file.

