# Conjure

A client-side image processing application built with Next.js and ImageMagick WebAssembly. All image processing happens locally in the browser—no server uploads, no external APIs, just pure client-side performance.

## Why This Exists

Most web-based image editors either upload your files to a server or rely on limited browser APIs. This project takes a different approach: it compiles ImageMagick—the industry-standard image processing library—to WebAssembly and runs it entirely in your browser. Your images never leave your machine.

## Features

- **Client-Side Processing**: All operations run locally using WebAssembly
- **Grayscale Conversion**: Transform images to grayscale with ImageMagick's proven algorithms
- **Blur Slider Control**: Adjust Gaussian blur intensity (0-20 radius) with real-time preview and debounced processing
- **Non-Destructive Editing**: All effects apply to the original source image, so adjusting sliders never compounds effects
- **Aspect Ratio Preservation**: Images are automatically scaled to fit the canvas while maintaining their original proportions
- **File Validation**: Supports PNG, JPEG, GIF, and WebP formats with proper validation
- **Zero Server Dependencies**: No image uploads, no cloud processing, no privacy concerns

## Technical Architecture

### Core Libraries

- **Next.js 16** with App Router for the React framework
- **@imagemagick/magick-wasm** for image processing
- **TypeScript** for type safety
- **Tailwind CSS** for styling

### Key Design Decisions

**SharedArrayBuffer Configuration**: The project configures specific HTTP headers (`Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy`) to enable SharedArrayBuffer, which is required for optimal WebAssembly performance.

**Modular Architecture**: The codebase is organized into focused modules:
- `lib/magick.ts` - WebAssembly initialization and image operations (grayscale, blur)
- `lib/canvas.ts` - Canvas rendering with aspect ratio calculations
- `lib/validation.ts` - File type validation
- `app/components/ImageProcessor.tsx` - Main UI component with state management and debounced processing
- `app/components/LoadingIndicator.tsx` - Loading state feedback component
- `app/components/ui/Slider.tsx` - Reusable slider component for parameter controls

**Idempotent Initialization**: The Magick.WASM library is initialized once and reused across operations, with proper promise handling to prevent race conditions.

## Getting Started

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to use the application.

## Testing

The project uses a dual testing approach:

**Property-Based Testing** with fast-check validates universal properties across randomized inputs:
- Aspect ratio preservation across arbitrary image dimensions
- File validation behavior for any MIME type
- Canvas dimension constraints

**Unit Testing** with Jest covers specific scenarios and edge cases.

Run tests:

```bash
npm test
```

## Project Structure

```
├── app/
│   ├── components/
│   │   ├── ImageProcessor.tsx    # Main image processing UI with blur controls
│   │   ├── LoadingIndicator.tsx  # Loading state component
│   │   └── ui/
│   │       └── Slider.tsx        # Reusable slider component
│   ├── page.tsx                  # Home page
│   └── layout.tsx                # Root layout
├── lib/
│   ├── magick.ts                 # ImageMagick WASM wrapper (grayscale, blur)
│   ├── canvas.ts                 # Canvas rendering utilities
│   └── validation.ts             # File validation logic
├── __tests__/
│   └── properties/               # Property-based tests
└── public/
    └── magick.wasm              # ImageMagick WebAssembly binary
```

## How It Works

1. **Initialization**: When you first upload an image, the app fetches the ImageMagick WASM binary (~8MB) and initializes it in the browser.

2. **Image Loading**: Your selected image is read into memory as a Uint8Array and processed by ImageMagick to extract pixel data in RGBA format.

3. **Canvas Rendering**: The pixel data is rendered to an HTML canvas element, with automatic scaling to fit within 800×600px while preserving the original aspect ratio.

4. **Image Processing**: Apply effects like grayscale or blur. All operations process the original image data (not previously processed results) to ensure quality and prevent compounding artifacts.

5. **Blur Control**: Drag the blur slider to adjust intensity. The UI updates immediately, but actual WASM processing is debounced (300ms) to prevent excessive computation during rapid adjustments.

## Browser Compatibility

Requires a modern browser with WebAssembly and SharedArrayBuffer support:
- Chrome/Edge 92+
- Firefox 89+
- Safari 15.2+

## Future Enhancements

This is v0.2—now with manual slider controls for image processing. Planned features include:
- Additional image operations (brightness, contrast, saturation, etc.)
- More slider controls for fine-tuning various parameters
- AI-powered generative UI (LLM generates appropriate controls based on natural language descriptions)
- Batch processing support
