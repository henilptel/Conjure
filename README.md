# Conjure

A client-side image processing application with AI-powered assistance, built with Next.js and ImageMagick WebAssembly. All image processing happens locally in the browser—no server uploads for images, just pure client-side performance with intelligent AI guidance.

## Why This Exists

Most web-based image editors either upload your files to a server or rely on limited browser APIs. This project takes a different approach: it compiles ImageMagick—the industry-standard image processing library—to WebAssembly and runs it entirely in your browser. Your images never leave your machine.

## Features

### Image Processing
- **Client-Side Processing**: All operations run locally using WebAssembly
- **Grayscale Conversion**: Transform images to grayscale with ImageMagick's proven algorithms
- **Blur Slider Control**: Adjust Gaussian blur intensity (0-20 radius) with real-time preview and debounced processing
- **Non-Destructive Editing**: All effects apply to the original source image, so adjusting sliders never compounds effects
- **Aspect Ratio Preservation**: Images are automatically scaled to fit the canvas while maintaining their original proportions
- **File Validation**: Supports PNG, JPEG, GIF, and WebP formats with proper validation

### AI Assistant
- **Context-Aware Chat**: Ask questions about your image and get intelligent responses
- **Real-Time State Awareness**: The AI knows your current blur level, image dimensions, and processing state
- **Streaming Responses**: Get instant feedback as the AI generates responses
- **Groq-Powered**: Uses Llama-3.1-70b-versatile for fast, accurate responses

### Privacy & Performance
- **Zero Image Uploads**: Your images never leave your browser
- **Local Processing**: All ImageMagick operations run in WebAssembly
- **Minimal API Calls**: Only chat messages are sent to the cloud (via Groq)

## Technical Architecture

### Core Libraries

- **Next.js 16** with App Router for the React framework
- **@imagemagick/magick-wasm** for client-side image processing
- **Vercel AI SDK** for streaming chat responses
- **Groq API** with Llama-3.3-70b-versatile model
- **TypeScript** for type safety
- **Tailwind CSS** for styling

### Key Design Decisions

**SharedArrayBuffer Configuration**: The project configures specific HTTP headers (`Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy`) to enable SharedArrayBuffer, which is required for optimal WebAssembly performance.

**Modular Architecture**: The codebase is organized into focused modules:
- `lib/magick.ts` - WebAssembly initialization and image operations (grayscale, blur)
- `lib/canvas.ts` - Canvas rendering with aspect ratio calculations
- `lib/validation.ts` - File type validation
- `lib/chat.ts` - Chat message styling utilities
- `lib/types.ts` - Shared TypeScript types for image state
- `app/components/ImageProcessor.tsx` - Main UI component with state management and debounced processing
- `app/components/ChatInterface.tsx` - AI chat interface with streaming support
- `app/components/LoadingIndicator.tsx` - Loading state feedback component
- `app/components/ui/Slider.tsx` - Reusable slider component for parameter controls
- `app/api/chat/route.ts` - API route for Groq LLM integration with context injection

**Idempotent Initialization**: The Magick.WASM library is initialized once and reused across operations, with proper promise handling to prevent race conditions.

## Getting Started

### Prerequisites

You'll need a Groq API key to use the chat feature. Get one free at [console.groq.com](https://console.groq.com).

### Installation

1. Install dependencies:

```bash
npm install
```

2. Create a `.env.local` file in the root directory:

```bash
GROQ_API_KEY=your_api_key_here
```

3. Run the development server:

```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) to use the application.

## Testing

The project uses a dual testing approach:

**Property-Based Testing** with fast-check validates universal properties across randomized inputs:
- Aspect ratio preservation across arbitrary image dimensions
- File validation behavior for any MIME type
- Canvas dimension constraints
- Blur processing idempotence
- Chat message styling consistency
- State callback behavior

**Unit Testing** with Jest covers specific scenarios and edge cases:
- Chat interface rendering and interaction
- Message streaming and error handling
- Component integration

Run tests:

```bash
npm test
```

## Project Structure

```
├── app/
│   ├── api/
│   │   └── chat/
│   │       └── route.ts          # Groq API integration with context injection
│   ├── components/
│   │   ├── ImageProcessor.tsx    # Main image processing UI with blur controls
│   │   ├── ChatInterface.tsx     # AI chat interface with streaming
│   │   ├── LoadingIndicator.tsx  # Loading state component
│   │   └── ui/
│   │       └── Slider.tsx        # Reusable slider component
│   ├── page.tsx                  # Home page with state management
│   └── layout.tsx                # Root layout
├── lib/
│   ├── magick.ts                 # ImageMagick WASM wrapper (grayscale, blur)
│   ├── canvas.ts                 # Canvas rendering utilities
│   ├── validation.ts             # File validation logic
│   ├── chat.ts                   # Chat message styling utilities
│   └── types.ts                  # Shared TypeScript types
├── __tests__/
│   ├── properties/               # Property-based tests
│   ├── ChatInterface.test.tsx    # Chat component unit tests
│   └── chat.test.ts              # Chat utilities unit tests
└── public/
    └── magick.wasm              # ImageMagick WebAssembly binary
```

## How It Works

### Image Processing Flow

1. **Initialization**: When you first upload an image, the app fetches the ImageMagick WASM binary (~8MB) and initializes it in the browser.

2. **Image Loading**: Your selected image is read into memory as a Uint8Array and processed by ImageMagick to extract pixel data in RGBA format.

3. **Canvas Rendering**: The pixel data is rendered to an HTML canvas element, with automatic scaling to fit within 800×600px while preserving the original aspect ratio.

4. **Image Processing**: Apply effects like grayscale or blur. All operations process the original image data (not previously processed results) to ensure quality and prevent compounding artifacts.

5. **Blur Control**: Drag the blur slider to adjust intensity. The UI updates immediately, but actual WASM processing is debounced (300ms) to prevent excessive computation during rapid adjustments.

### AI Chat Flow

1. **Context Injection**: When you send a message, the current image state (dimensions, blur level, etc.) is automatically included in the request.

2. **System Message**: The API route constructs a system message that informs the LLM about your current image state.

3. **Streaming Response**: The Groq API (Llama-3.1-70b-versatile) generates a response that's streamed back in real-time.

4. **State Awareness**: The AI can answer questions like "What's my current blur level?" or "What are my image dimensions?" accurately based on the injected context.

## Usage Example

1. **Upload an Image**: Click the file input and select a PNG, JPEG, GIF, or WebP image
2. **Apply Effects**: 
   - Click "Make Grayscale" to convert to grayscale
   - Drag the blur slider (0-20) to adjust blur intensity
3. **Chat with AI**:
   - Ask "What's my current blur level?"
   - Ask "What are my image dimensions?"
   - Ask "What effects have I applied?"
   - Request suggestions: "How can I make this image look vintage?"

The AI assistant is aware of your current image state and can provide contextual responses.

## Browser Compatibility

Requires a modern browser with WebAssembly and SharedArrayBuffer support:
- Chrome/Edge 92+
- Firefox 89+
- Safari 15.2+

## Development Roadmap

**Current Version: v0.3** - Context-aware AI chat integration

### Completed Features
- v0.1: ImageMagick WASM initialization and grayscale conversion
- v0.2: Manual slider controls for blur adjustment
- v0.3: AI-powered chat with real-time image state awareness

### Planned Features
- v0.4: Generative UI (LLM generates appropriate controls based on natural language)
- Additional image operations (brightness, contrast, saturation, rotation, etc.)
- More slider controls for fine-tuning various parameters
- Image export functionality
- Batch processing support
- Undo/redo functionality
