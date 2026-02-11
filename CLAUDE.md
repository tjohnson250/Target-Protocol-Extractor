# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TARGET Protocol Extractor is a single-file React component (`target-analyzer.jsx`, ~1300 lines) that analyzes observational research papers against the **TARGET 2025 reporting guideline** (Cashin et al., JAMA 2025) for target trial emulation studies. It uses the Anthropic Claude API with vision capability to extract structured protocol information and provide methodological critique.

The tool is deployed as a Claude artifact and hosted via GitHub Pages at:
https://tjohnson250.github.io/Target-Protocol-Extractor/

Related project: [Target Trial Design Assistant (TTDA)](https://github.com/tjohnson250/TTDA) — helps *design* new target trial emulations, whereas this tool helps *evaluate* published papers.

## Repository Structure

- `target-analyzer.jsx` — The entire React application (single-file component)
- `target-protocol-extractor.qmd` — Quarto launch page that embeds the Claude artifact via iframe
- `target-protocol-extractor.html` — Rendered Quarto output (served by GitHub Pages)
- `target-protocol-extractor_files/` — Quarto rendering assets (Bootstrap, JS libs)
- `index.html` — Redirect to `target-protocol-extractor.html`
- `references.bib` — BibTeX references (Cashin 2025, van Hal 2025)
- `Target-Protocol-Extractor.Rproj` — RStudio project file

## Rendering the Launch Page

Open the project in RStudio and render `target-protocol-extractor.qmd`, or from the command line:

```
quarto render target-protocol-extractor.qmd
```

This produces `target-protocol-extractor.html` and the `target-protocol-extractor_files/` directory. Both must be committed and pushed for the GitHub Pages site to update.

## Architecture of target-analyzer.jsx

The entire application lives in a single file as one React component with helper functions. It is designed to run as a Claude artifact — no package.json, build system, or separate config.

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

- The component runs as a Claude artifact — no npm dependencies beyond React 18+ (useState, useRef, useEffect, useCallback)
- The Claude API call uses `web_search_20250305` as a tool for reference fetching
- When updating the artifact, the embed URL in `target-protocol-extractor.qmd` must be updated to match the new Claude artifact URL, then re-rendered

## Domain Context

TARGET 2025 is a reporting guideline for observational studies that emulate randomized trials (target trial emulation / TTE). The tool extracts a structured protocol table mapping TARGET checklist items (eligibility, treatment strategies, assignment, follow-up, outcomes, causal contrasts, identifying assumptions, data analysis plan) into either a 2-column format (Target Trial | Emulation) or 3-column format when an index trial is detected.
