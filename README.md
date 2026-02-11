# TARGET Protocol Extractor

A React-based tool that analyzes observational research papers against the **TARGET 2025 reporting guideline** (Cashin et al., JAMA 2025) for target trial emulation studies. It uses the Anthropic Claude API to extract structured protocol information, assess methodological rigor, and provide critique organized around the TARGET checklist.

## What It Does

- **Accepts input** via PDF upload (up to 20MB per file, multiple files supported for supplements) or article identifier (DOI, PMCID, PMID, URL)
- **Extracts a structured protocol table** mapping TARGET checklist items — eligibility criteria, treatment strategies, assignment procedures, follow-up, outcomes, causal contrasts, identifying assumptions, and data analysis plan
- **Detects index trials** — when a paper references a specific randomized trial (e.g., NCT number), it automatically looks it up on ClinicalTrials.gov and produces a 3-column comparison (Index Trial | Target Trial | Emulation)
- **Assesses compatibility** with the TARGET framework and flags incompatible study designs (case-control, IV/MR, DiD, etc.)
- **Provides methodological critique** in balanced or aggressive mode, covering completeness gaps, methodological concerns, and reporting clarity
- **Supports follow-up questions** through a chat interface for iterative refinement
- **Exports results** as Markdown (.md) or Word (.doc) with auto-generated filenames based on lead author and year

## Requirements

- A React 18+ project with a bundler (Vite, Next.js, Create React App, etc.)
- An [Anthropic API key](https://console.anthropic.com/) — the component calls the Claude API directly from the browser via `fetch`

## Usage

The component is a single file (`target-analyzer.jsx`) that exports a default React component:

```jsx
import TargetTrialAnalyzer from "./target-analyzer";

function App() {
  return <TargetTrialAnalyzer />;
}
```

The component has no npm dependencies beyond React itself. It uses:
- `claude-sonnet-4-20250514` for analysis (with vision capability for PDFs)
- `web_search_20250305` tool for fetching articles by DOI/PMCID/PMID and ClinicalTrials.gov lookups
- Google Fonts loaded via CSS import (Literata, DM Sans, JetBrains Mono)

## TARGET 2025 Checklist

The tool covers all 21 items from the TARGET 2025 guideline, organized by manuscript section:

| Section | Items |
|---------|-------|
| Abstract | Structured summary of emulation framework |
| Introduction | Objectives with causal inference framing |
| Methods | Eligibility, treatment strategies, assignment, follow-up, outcomes, causal contrasts, identifying assumptions, data analysis, data sources, deviations |
| Results | Participants, descriptives, outcome data, main results, sensitivity/supplementary |
| Discussion | Key results, limitations, interpretation |
| Other | Funding, protocol access, registration |

## Reference

TARGET 2025: Cashin AG, et al. *Guidelines for Reporting Target Trial Emulation Studies (TARGET): A Targeted Minimum Set of Items for Reporting.* JAMA. 2025. DOI: [10.1001/jama.2025.13350](https://doi.org/10.1001/jama.2025.13350)

## Author

Todd R. Johnson, PhD — McWilliams School of Biomedical Informatics, UTHealth Houston

## License

This tool is not affiliated with the TARGET guideline development group. Powered by Claude (Anthropic).
