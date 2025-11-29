import '@testing-library/jest-dom';

// Polyfill for TransformStream which is required by AI SDK
import { TransformStream, ReadableStream, WritableStream } from 'stream/web';

Object.assign(globalThis, {
  TransformStream,
  ReadableStream,
  WritableStream,
});
