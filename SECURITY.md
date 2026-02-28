# Security Policy

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability, please email **henildevs@proton.me** with:

- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes (optional)

We will work with you to understand the issue and release a fix as quickly as possible.

## Scope

Since Conjure processes all images **entirely client-side in the browser**, the attack surface is limited. Key areas of concern include:

- **API route** (`/api/chat`): Prompt injection via crafted image metadata or chat messages
- **WASM execution**: Malformed image files causing unexpected behaviour in ImageMagick WASM
- **Dependency vulnerabilities**: Issues in third-party packages

## Out of Scope

- Issues requiring local machine access
- Self-XSS
- Social engineering attacks
