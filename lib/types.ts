/**
 * Shared types for the MagickFlow image editor
 */

/**
 * Represents the current state of the image being processed.
 * This state is shared between ImageProcessor and ChatInterface
 * to enable context-aware AI responses.
 */
export interface ImageState {
  /** Whether an image is currently loaded */
  hasImage: boolean;
  /** Width of the loaded image in pixels, null if no image */
  width: number | null;
  /** Height of the loaded image in pixels, null if no image */
  height: number | null;
  /** Current blur level (0 = no blur) */
  blur: number;
  /** Whether grayscale conversion has been applied */
  isGrayscale: boolean;
}

/**
 * Default state when no image is loaded
 */
export const defaultImageState: ImageState = {
  hasImage: false,
  width: null,
  height: null,
  blur: 0,
  isGrayscale: false,
};
