/**
 * Unit tests for Chat API utilities
 * Tests request body parsing and error handling
 * _Requirements: 2.1, 2.6_
 */

import { parseRequestBody, buildSystemMessage } from '@/lib/chat';
import { defaultImageState } from '@/lib/types';

describe('parseRequestBody', () => {
  it('should parse valid request body with messages and imageContext', () => {
    const body = {
      messages: [{ role: 'user', content: 'Hello' }],
      imageContext: defaultImageState,
    };

    const result = parseRequestBody(body);

    expect(result.messages).toEqual([{ role: 'user', content: 'Hello' }]);
    expect(result.imageContext).toEqual(defaultImageState);
  });

  it('should throw error for null body', () => {
    expect(() => parseRequestBody(null)).toThrow('Invalid request body');
  });

  it('should throw error for undefined body', () => {
    expect(() => parseRequestBody(undefined)).toThrow('Invalid request body');
  });

  it('should throw error when messages is not an array', () => {
    const body = {
      messages: 'not an array',
      imageContext: defaultImageState,
    };

    expect(() => parseRequestBody(body)).toThrow('Messages must be an array');
  });

  it('should throw error when messages is missing', () => {
    const body = {
      imageContext: defaultImageState,
    };

    expect(() => parseRequestBody(body)).toThrow('Messages must be an array');
  });

  it('should throw error when imageContext is missing', () => {
    const body = {
      messages: [{ role: 'user', content: 'Hello' }],
    };

    expect(() => parseRequestBody(body)).toThrow('imageContext is required');
  });

  it('should throw error when imageContext is not an object', () => {
    const body = {
      messages: [{ role: 'user', content: 'Hello' }],
      imageContext: 'not an object',
    };

    expect(() => parseRequestBody(body)).toThrow('imageContext is required');
  });
});

describe('buildSystemMessage', () => {
  it('should build system message with no image loaded', () => {
    const message = buildSystemMessage(defaultImageState);

    expect(message).toContain('Image loaded: false');
    expect(message).toContain('No image loaded');
    expect(message).toContain('Blur level: 0');
    expect(message).toContain('Grayscale: false');
  });

  it('should build system message with image loaded', () => {
    const imageState = {
      hasImage: true,
      width: 800,
      height: 600,
      blur: 5,
      isGrayscale: true,
    };

    const message = buildSystemMessage(imageState);

    expect(message).toContain('Image loaded: true');
    expect(message).toContain('800x600 pixels');
    expect(message).toContain('Blur level: 5');
    expect(message).toContain('Grayscale: true');
  });
});
