require('@testing-library/jest-dom');

// jsdom@29 doesn't expose crypto.randomUUID — polyfill from Node's built-in
if (typeof crypto.randomUUID !== 'function') {
  const { randomUUID } = require('crypto');
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    value: randomUUID,
    writable: false,
    configurable: true
  });
}
