import '@testing-library/jest-dom';

// Polyfill for TransformStream which is required by AI SDK
import { TransformStream, ReadableStream, WritableStream } from 'stream/web';

Object.assign(globalThis, {
  TransformStream,
  ReadableStream,
  WritableStream,
});

// Mock window.scrollTo to suppress JSDOM "Not implemented" warnings
Object.defineProperty(window, 'scrollTo', {
  value: jest.fn(),
  writable: true,
});
