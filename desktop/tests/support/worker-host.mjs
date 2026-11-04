// Runs the application's utility process (src/media-worker.ts) under plain Node for tests/media-worker.test.mjs:
// Electron's parent port is stood in for by Node's own message channel to the test, nothing else changes.
import { EventEmitter } from 'node:events';

const port = new EventEmitter();
port.postMessage = (m) => process.send(m);
process.on('message', (data) => port.emit('message', { data }));
process.parentPort = port;
await import('../../src/media-worker.ts');
