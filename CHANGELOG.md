# Changelog

All notable changes to Conjure are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/). Versions follow [Semantic Versioning](https://semver.org/).

---

## [1.1.0] - 2026-02-28

### Added
- `BufferPool` for optimized WebAssembly memory reuse — reduces GC pressure during effect processing
- `SharedArrayBuffer` support with automatic fallback to regular `ArrayBuffer`
- `warmPool()` method for pre-allocating buffers at startup
- `cloneIfNeeded()` and `transferOwnership()` buffer utilities
- `getBufferPoolStats()` diagnostics on `ImageEngine`
- CSS filter preview during slider drag for instant visual feedback (no WASM call)
- WASM processing fires on pointer release — non-blocking UI
- 25+ property-based tests using fast-check
- GitHub Actions CI/CD → auto-deploys to Vercel on every push to `main`

### Changed
- `ImageEngine` now uses pooled buffers for all intermediate processing
- Slider fires `onCommit` synchronously on pointer release (not debounced)
- Optimized store selectors with `useShallow` to reduce re-renders
- Optimized tools fingerprint creation using template literals over `JSON.stringify`
- Optimized history entry creation with structural sharing and deduplication
- Optimized message scanning by tracking last scanned index

### Fixed
- Memory leaks from unreleased WASM pixel buffers
- Redundant processing timeout removed for immediate response

---

## [1.0.0] - 2025-12-07

### Added
- Undo/redo with full history stack (Ctrl+Z / Ctrl+Shift+Z)
- Undo/Redo UI buttons in the dock
- Compare mode — hold Space to toggle original image preview
- `DEFAULT_HISTORY_STATE`, `canUndo` / `canRedo` selectors
- Snapshot restoration for compare mode

---

## [0.9.0] - 2025-12-07

### Added
- VisionOS-style glassmorphism design tokens (`lib/design-tokens.ts`)
- Magnetic button animations across interactive components
- `GhostToast` notifications
- Glass scrollbar across all panels
- Image zoom and pan with mouse and touch gestures
- Canvas transformation utilities
- Instant original/processed swap in compare mode
- Double-click reset for sliders
- Slider value formatting

---

## [0.8.0] - 2025-12-05

### Changed
- Full architecture overhaul — Zustand replaces component-local state
- Centralized `TOOL_REGISTRY` following Open-Closed Principle
- `EFFECT_ORDER` array ensures deterministic processing order
- `ImageEngine` class extracts all processing logic from the component
- Unified pipeline eliminates hybrid state

### Removed
- Web Worker (`magick.worker.js`) — replaced by synchronous `ImageEngine`

---

## [0.7.0] - 2025-11-30

### Added
- `ActiveToolsPanel` — left-side HUD showing active tool sliders
- `EffectsFAB` — floating action button for tool browsing
- `ToolBrowser` — searchable tool selection panel
- `DynamicDock` floating dock container
- `ChatHistory` component
- App icons and favicon assets (192px, 512px, apple-touch)

---

## [0.4.0] - 2025-11-30

### Added
- Generative UI — AI calls `show_tools` to render sliders dynamically
- 15 image effects: Blur, Sharpen, Brightness, Saturation, Hue, Contrast, Grayscale, Sepia, Invert, Charcoal, Edge Detect, Solarize, Vignette, Rotate, Wave
- `remove_tools` AI function to dismiss controls
- Groq API integration via Vercel AI SDK v5
- Streaming chat responses
- Context-aware system prompt dynamically generated from `TOOL_REGISTRY`
- `useChat` from `@ai-sdk/react` with `DefaultChatTransport`

---

## [0.2.0] - 2025-11-29

### Added
- Manual slider controls for blur, brightness, saturation
- Debounced WASM processing (300ms) on slider change
- Canvas rendering with aspect ratio preservation
- File upload and validation (PNG, JPEG, GIF, WebP)
- Non-destructive pipeline — effects always apply to original source

---

## [0.1.0] - 2025-11-29

### Added
- Initial Next.js project setup with App Router
- ImageMagick WASM initialisation (`@imagemagick/magick-wasm`)
- Basic grayscale conversion proof-of-concept
- `Cross-Origin-Opener-Policy` + `Cross-Origin-Embedder-Policy` headers enabling SharedArrayBuffer
