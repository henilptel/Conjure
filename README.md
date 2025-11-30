# Conjure

A client-side image processing application with AI-powered Generative UI, built with Next.js and ImageMagick WebAssembly. All image processing happens locally in the browser—no server uploads, just pure client-side performance with intelligent AI-generated controls.

## Why This Exists

Most web-based image editors either upload your files to a server or rely on limited browser APIs. This project takes a different approach: it compiles ImageMagick—the industry-standard image processing library—to WebAssembly and runs it entirely in your browser. Your images never leave your machine.

The AI assistant doesn't just answer questions - it generates the exact UI controls you need based on natural language requests.

## Features

### Generative UI
- **AI-Generated Controls**: Ask for an effect and the AI summons the appropriate sliders to the HUD panel
- **Tool Calling**: Uses Vercel AI SDK v5 tool calling to dynamically render UI components
- **Initial Values**: AI can set starting values when creating controls (e.g., "add a strong blur" starts at higher intensity)
- **Glassmorphism HUD Panel**: Floating tool panel overlays the canvas with a modern frosted-glass aesthetic

### Image Processing
- **Client-Side Processing**: All operations run locally using WebAssembly
- **Multiple Effects**: Blur, Grayscale, Sepia, and Contrast controls
- **Non-Destructive Pipeline**: Effects apply to the original source image through a unified pipeline
- **Real-Time Preview**: Debounced processing (300ms) for smooth slider interactions
- **Aspect Ratio Preservation**: Images scale to fit canvas while maintaining proportions
- **File Validation**: Supports PNG, JPEG, GIF, and WebP formats

### AI Assistant
- **Context-Aware Chat**: The AI knows your current image state, active tools, and their values
- **Streaming Responses**: Real-time feedback as the AI generates responses
- **Groq-Powered**: Uses Llama-3.3-70b-versatile for fast, accurate responses

### Privacy & Performance
- **Zero Image Uploads**: Your images never leave your browser
- **Local Processing**: All ImageMagick operations run in WebAssembly
- **Minimal API Calls**: Only chat messages are sent to the cloud (via Groq)

## Technical Architecture

### Core Libraries

- **Next.js 16** with App Router
- **@imagemagick/magick-wasm** for client-side image processing
- **Vercel AI SDK v5** with `useChat`, `streamText`, and tool calling
- **Groq API** with Llama-3.3-70b-versatile model
- **TypeScript** for type safety
- **Tailwind CSS** for styling
- **Lucide React** for icons

### Key Design Decisions

**SharedArrayBuffer Configuration**: HTTP headers (`Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy`) enable SharedArrayBuffer for optimal WebAssembly performance.

**AI SDK v5 Patterns**:
- `useChat` from `@ai-sdk/react` with `DefaultChatTransport`
- `UIMessage` with `parts` array instead of `content` string
- `sendMessage()` with dynamic body for image context
- `toUIMessageStreamResponse()` for streaming

**Tool Calling Architecture**:
- `show_tools` tool defined with Zod schema
- Tools array with optional `initial_value` support
- Client-side tool call detection via `isToolUIPart` helper
- Bounded FIFO cache prevents duplicate tool callbacks

**Modular Architecture**:
- `lib/magick.ts` - WebAssembly initialization and image operations
- `lib/canvas.ts` - Canvas rendering with aspect ratio calculations
- `lib/validation.ts` - File type validation
- `lib/chat.ts` - Chat utilities and system message builder
- `lib/types.ts` - Shared types, tool configs, and state management functions
- `app/components/ImageProcessor.tsx` - Main UI with unified effects pipeline
- `app/components/ChatInterface.tsx` - AI chat with tool call handling
- `app/components/overlay/ToolPanel.tsx` - Glassmorphism HUD panel
- `app/components/ui/Slider.tsx` - Reusable slider component
- `app/api/chat/route.ts` - API route with tool definitions

## Getting Started

### Prerequisites

You'll need a Groq API key for the chat feature. Get one free at [console.groq.com](https://console.groq.com).

### Installation

1. Install dependencies:

```bash
npm install
```

2. Create a `.env.local` file:

```bash
GROQ_API_KEY=your_api_key_here
```

3. Run the development server:

```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000)

## Testing

The project uses a dual testing approach:

**Property-Based Testing** with fast-check validates universal properties:
- Aspect ratio preservation across arbitrary dimensions
- File validation behavior for any MIME type
- Canvas dimension constraints
- Blur/effect processing idempotence
- Tool state management (add, update, remove)
- Chat message styling consistency

**Unit Testing** with Jest covers specific scenarios:
- Chat interface rendering and interaction
- Tool call detection and handling
- Component integration

Run tests:

```bash
npm test
```

## Project Structure

```
├── app/
│   ├── api/chat/route.ts         # Groq API with show_tools tool
│   ├── components/
│   │   ├── ImageProcessor.tsx    # Main processor with effects pipeline
│   │   ├── ChatInterface.tsx     # AI chat with tool call handling
│   │   ├── LoadingIndicator.tsx  # Loading state component
│   │   ├── overlay/
│   │   │   └── ToolPanel.tsx     # Glassmorphism HUD panel
│   │   └── ui/
│   │       └── Slider.tsx        # Reusable slider component
│   ├── page.tsx                  # Home page with state management
│   └── layout.tsx                # Root layout
├── lib/
│   ├── magick.ts                 # ImageMagick WASM wrapper
│   ├── canvas.ts                 # Canvas rendering utilities
│   ├── validation.ts             # File validation logic
│   ├── chat.ts                   # Chat utilities
│   └── types.ts                  # Types and tool state functions
├── __tests__/
│   ├── properties/               # Property-based tests
│   ├── ChatInterface.test.tsx    # Chat component tests
│   └── chat.test.ts              # Chat utilities tests
└── public/
    └── magick.wasm               # ImageMagick WebAssembly binary
```

## How It Works

### Generative UI Flow

1. **User Request**: "Add a blur effect" or "Make it look soft"
2. **Tool Calling**: The AI invokes `show_tools` with appropriate parameters
3. **HUD Panel**: Tool controls appear as sliders in the floating panel
4. **Initial Values**: AI can set starting values based on intent
5. **Real-Time Editing**: Adjust sliders to fine-tune the effect

### Image Processing Flow

1. **Initialization**: ImageMagick WASM binary (~8MB) loads on first image upload
2. **Image Loading**: File is read as Uint8Array and processed for RGBA pixel data
3. **Canvas Rendering**: Pixels render to canvas, scaled to fit 800×600px max
4. **Effects Pipeline**: All active tools process through a unified pipeline
5. **Debounced Updates**: 300ms debounce prevents excessive computation

### AI Chat Flow

1. **Context Injection**: Current image state (dimensions, active tools, values) sent with each message
2. **System Message**: API route builds context-aware system prompt
3. **Tool Detection**: Client monitors for `show_tools` tool calls in response parts
4. **State Update**: New tools added to activeTools array with initial values

## Usage Examples

**Upload and Edit**:
1. Upload a PNG, JPEG, GIF, or WebP image
2. Ask: "Add a blur effect" → Blur slider appears in HUD
3. Ask: "Make it sepia toned" → Sepia slider joins the panel
4. Adjust sliders to fine-tune

**Context-Aware Queries**:
- "What effects are currently active?"
- "What's my blur level set to?"
- "What are my image dimensions?"

**Natural Language Editing**:
- "Add a strong blur" → Blur slider at high value
- "Give me contrast control" → Contrast slider appears
- "I want to adjust the grayscale" → Grayscale slider added

## Browser Compatibility

Requires WebAssembly and SharedArrayBuffer support:
- Chrome/Edge 92+
- Firefox 89+
- Safari 15.2+

## Development Roadmap

**Current Version: v0.4** - Generative UI with tool calling

### Completed Features
- v0.1: ImageMagick WASM initialization and grayscale conversion
- v0.2: Manual slider controls for blur adjustment
- v0.3: AI-powered chat with real-time image state awareness
- v0.4: Generative UI (AI generates controls via tool calling)

### Planned Features
- Additional image operations (brightness, saturation, rotation)
- Image export functionality
- Batch processing support
- Undo/redo functionality
