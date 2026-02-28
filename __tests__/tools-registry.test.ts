import { TOOL_REGISTRY, EFFECT_ORDER, getAllToolIds, getToolConfig } from '../lib/tools-registry';
import { IMagickImage, Percentage } from '@imagemagick/magick-wasm';

// Mock ImageMagick types
const mockImage = {
  blur: jest.fn(),
  grayscale: jest.fn(),
  modulate: jest.fn(),
  sepiaTone: jest.fn(),
  brightnessContrast: jest.fn(),
  negate: jest.fn(),
  sharpen: jest.fn(),
  charcoal: jest.fn(),
  rotate: jest.fn(),
  solarize: jest.fn(),
  vignette: jest.fn(),
  cannyEdge: jest.fn(),
  wave: jest.fn(),
} as unknown as IMagickImage;

describe('Tools Registry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('EFFECT_ORDER should be correct', () => {
    expect(EFFECT_ORDER).toEqual([
      'rotate',
      'brightness',
      'saturation',
      'hue',
      'invert',
      'blur',
      'sharpen',
      'charcoal',
      'edge_detect',
      'grayscale',
      'sepia',
      'contrast',
      'solarize',
      'vignette',
      'wave',
    ]);
  });

  test('getAllToolIds should return all tool IDs', () => {
    const ids = getAllToolIds();
    expect(ids).toEqual(expect.arrayContaining(EFFECT_ORDER));
    expect(ids.length).toBe(EFFECT_ORDER.length);
  });

  test('getToolConfig should return correct config', () => {
    const blurConfig = getToolConfig('blur');
    expect(blurConfig).toBeDefined();
    expect(blurConfig?.id).toBe('blur');
    expect(blurConfig?.label).toBe('Blur');
    expect(blurConfig?.min).toBe(0);
    expect(blurConfig?.max).toBe(20);
    expect(blurConfig?.defaultValue).toBe(0);
  });

  test('Tool execution: blur', () => {
    const tool = TOOL_REGISTRY.blur;
    tool.execute(mockImage, 5);
    expect(mockImage.blur).toHaveBeenCalledWith(0, 5);
  });

  test('Tool execution: grayscale (full)', () => {
    const tool = TOOL_REGISTRY.grayscale;
    tool.execute(mockImage, 100);
    expect(mockImage.grayscale).toHaveBeenCalled();
  });

  test('Tool execution: grayscale (partial)', () => {
    const tool = TOOL_REGISTRY.grayscale;
    tool.execute(mockImage, 50);
    // 100 - 50 = 50 saturation
    expect(mockImage.modulate).toHaveBeenCalledWith(
      expect.any(Percentage),
      expect.objectContaining({ _value: 50 }),
      expect.any(Percentage)
    );
  });

  test('Tool execution: brightness', () => {
    const tool = TOOL_REGISTRY.brightness;
    tool.execute(mockImage, 150);
    expect(mockImage.modulate).toHaveBeenCalledWith(
      expect.objectContaining({ _value: 150 }),
      expect.any(Percentage),
      expect.any(Percentage)
    );
  });

  // Add more tests for other tools as needed to ensure coverage
});
