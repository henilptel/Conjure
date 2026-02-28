# Contributing to Conjure

Thank you for your interest in contributing! This guide will get you set up quickly.

## Table of Contents
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Making Changes](#making-changes)
- [Testing](#testing)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Coding Standards](#coding-standards)

---

## Development Setup

### Prerequisites
- Node.js 20+
- A [Groq API key](https://console.groq.com/keys) (free)

### Steps

```bash
# 1. Fork and clone
git clone https://github.com/YOUR_USERNAME/Conjure.git
cd Conjure

# 2. Install dependencies
npm install

# 3. Set up environment
cp .env.example .env.local
# Add your GROQ_API_KEY to .env.local

# 4. Run dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Project Structure

```
app/
  api/chat/route.ts       # Groq API + tool calling
  components/             # React components
  contexts/               # React contexts
lib/
  magick.ts               # ImageMagick WASM wrapper
  tools-registry.ts       # Add new tools here
  tools-definitions.ts    # Effect executors and order
  store.ts                # Zustand global state
  hooks.ts                # Custom React hooks
__tests__/                # Jest + fast-check tests
```

---

## Making Changes

### Adding a New Image Effect

1. Add an executor in `lib/tools-definitions.ts`
2. Register it in `lib/tools-registry.ts` (id, label, min, max, defaultValue, icon, execute)
3. Add it to `EFFECT_ORDER` in `lib/tools-definitions.ts`
4. Write a property-based test in `__tests__/properties/`

That's it — the pipeline, AI prompt, and UI update automatically.

### Branch Naming

```
feature/short-description
fix/short-description
chore/short-description
```

---

## Testing

```bash
npm test              # Run all tests
npm test -- --watch   # Watch mode
```

The test suite uses **Jest** with **fast-check** for property-based testing. When adding features, add corresponding property tests.

---

## Submitting a Pull Request

1. Fork the repo and create a branch from `main`
2. Make your changes with clear, atomic commits
3. Run `npm test` — all tests must pass
4. Run `npm run lint` — no lint errors
5. Open a PR against `main` with a clear description of what and why

### PR Title Format
```
feat: add vignette intensity control
fix: prevent memory leak in buffer pool
chore: update dependencies
```

---

## Coding Standards

- **TypeScript strict mode** — no `any` unless absolutely necessary
- **No server-side image processing** — all WASM runs in the browser
- **Zustand for state** — don't add component-local state for shared data
- **Test your changes** — property-based tests preferred over unit tests
- **No new dependencies** without strong justification — keep the bundle lean
