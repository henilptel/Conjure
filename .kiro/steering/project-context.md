---
inclusion: always
---
# Project Context: MagickFlow (Generative UI for ImageMagick)

## 1. Project Goal
We are building a web-based image editor that uses "Generative UI".
- Users describe an edit ("Make it look vintage").
- An LLM (Groq/Llama-3) generates the specific UI controls (sliders, toggles) for that task.
- The actual image processing happens purely Client-Side using Magick.WASM.

## 2. Tech Stack (Strict Constraints)
- **Framework:** Next.js (App Router).
- **Language:** TypeScript.
- **Styling:** Tailwind CSS + ShadcnUI (Lucide React for icons).
- **Image Engine:** @dlemstra/magick-wasm (Must run in browser/worker, NOT on server).
- **AI Provider:** Vercel AI SDK (Use `streamUI` and `tool calling`).
- **LLM:** Groq API.

## 3. Critical Architecture Decisions
- **SharedArrayBuffer:** You MUST configure `next.config.js` headers immediately to allow `SharedArrayBuffer` or Magick.WASM will fail.
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Embedder-Policy: require-corp`
- **No Server Processing:** Do not use `sharp` or upload images to an S3 bucket. All processing is local.
- **Incremental Build:** We will build this in versions. Do not hallucinate features ahead of the current version instructions.

## 4. The Roadmap (For Context Only)
- v0.1: Initialize Magick.WASM and prove basic grayscale conversion works.
- v0.2: Create manual React components (Sliders) that control Magick parameters.
- v0.3: Connect Groq API via Vercel AI SDK for text chat.
- v0.4: Implement Generative UI (LLM streaming the Slider components).

## 5. Current Task
(Wait for my specific version prompt).