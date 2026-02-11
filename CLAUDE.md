# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TARGET Protocol Extractor is a single-file React component (`target-analyzer.jsx`, ~1300 lines) that analyzes observational research papers against the **TARGET 2025 reporting guideline** (Cashin et al., JAMA 2025) for target trial emulation studies. It uses the Anthropic Claude API with vision capability to extract structured protocol information and provide methodological critique.

## Architecture

The entire application lives in `target-analyzer.jsx` as one React component with helper functions. There is no build system, package.json, or separate config — this component is designed to be integrated into an existing React project with its own bundler.

### Code Organization (top to bottom)

1. **`md()` function** — Custom markdown-to-HTML converter with special tag support (`[Inferred]`, `[Not reported]`, `[INCOMPATIBLE]`, `[WARNING]`)
2. **`buildSystemPrompt()`** — Constructs the Claude system prompt with TARGET methodology instructions; supports "balanced" vs "aggressive" critique modes
3. **`callClaude()`** — Anthropic API integration using `claude-sonnet-4-20250514` with web search tool
4. **Input parsing** — `classifyInput()` detects DOI/PMCID/PMID/URL; `buildFetchUrl()` resolves to fetchable URLs
5. **Export utilities** — `parseMeta()`, `stripMeta()`, `downloadMd()`, `downloadDocx()` for result export
6. **Icon components** — Small SVG icon components (Upload, File, Send, Download, Book, Close)
7. **Spinner** — Loading indicator with status text
8. **TARGET checklist data** — Embedded array of 21 checklist items organized by manuscript section
9. **`TargetTrialAnalyzer`** — Main React component (~900 lines) containing all UI state, analysis workflows, and inline CSS

### Key Workflows in TargetTrialAnalyzer

- **PDF analysis** — Uploads PDF to Claude using vision/document capability
- **Reference analysis** — Fetches articles via DOI/PMCID/PMID, sends content to Claude
- **Index trial lookup** — Auto-detects NCT numbers in results and queries ClinicalTrials.gov
- **Follow-up chat** — Maintains conversation history for iterative refinement with Claude

### Styling

All CSS is inline via a `<style>` JSX block within the component (~440 lines). Uses Google Fonts (Literata, DM Sans, JetBrains Mono). Dark header (#1e293b) with amber accent (#d97706). Responsive with mobile breakpoints.

## Development Notes

- No package.json, test framework, linter, or build config exists yet — the component requires a React 18+ environment with a bundler (Vite, Next.js, etc.) to run
- The component imports only `{ useState, useRef, useEffect, useCallback }` from React; no other npm dependencies
- API key handling is done within the component (passed to `callClaude`)
- The Claude API call uses `web_search_20250305` as a tool for reference fetching

## Domain Context

TARGET 2025 is a reporting guideline for observational studies that emulate randomized trials (target trial emulation / TTE). The tool extracts a structured protocol table mapping TARGET checklist items (eligibility, treatment strategies, assignment, follow-up, outcomes, causal contrasts, identifying assumptions, data analysis plan) into either a 2-column format (Target Trial | Emulation) or 3-column format when an index trial is detected.
