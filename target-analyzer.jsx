import { useState, useRef, useEffect, useCallback } from "react";

// ── Markdown → HTML converter ──────────────────────────────────────
function md(text) {
  if (!text) return "";
  let html = text;
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="code-block"><code>$2</code></pre>');
  html = html.replace(/^(\|.+\|)\n(\|[\s\-:|]+\|)\n((?:\|.+\|\n?)*)/gm, (_, hdr, sep, body) => {
    const ths = hdr.split("|").filter(c => c.trim()).map(c => `<th>${c.trim()}</th>`).join("");
    const rows = body.trim().split("\n").map(r => {
      const tds = r.split("|").filter(c => c.trim()).map(c => {
        let cell = c.trim();
        cell = cell.replace(/\[Inferred\]/g, '<span class="tag tag-inferred">[Inferred]</span>');
        cell = cell.replace(/\[Not reported\]/g, '<span class="tag tag-missing">[Not reported]</span>');
        cell = cell.replace(/\[Assumed\]/g, '<span class="tag tag-inferred">[Assumed]</span>');
        return `<td>${cell}</td>`;
      }).join("");
      return `<tr>${tds}</tr>`;
    }).join("");
    return `<div class="table-wrap"><table><thead><tr>${ths}</tr></thead><tbody>${rows}</tbody></table></div>`;
  });
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/\[Inferred\]/g, '<span class="tag tag-inferred">[Inferred]</span>');
  html = html.replace(/\[Not reported\]/g, '<span class="tag tag-missing">[Not reported]</span>');
  html = html.replace(/\[Assumed\]/g, '<span class="tag tag-inferred">[Assumed]</span>');
  html = html.replace(/\[INCOMPATIBLE\]/g, '<span class="tag tag-error">[INCOMPATIBLE]</span>');
  html = html.replace(/\[WARNING\]/g, '<span class="tag tag-warn">[WARNING]</span>');
  html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
  html = html.replace(/^\d+\. (.+)$/gm, '<oli>$1</oli>');
  html = html.replace(/((?:<oli>.*<\/oli>\n?)+)/g, (m) => {
    return '<ol>' + m.replace(/<\/?oli>/g, (t) => t.replace('oli', 'li')) + '</ol>';
  });
  html = html.replace(/^---+$/gm, '<hr/>');
  html = html.replace(/\n\n/g, '</p><p>');
  html = '<p>' + html + '</p>';
  html = html.replace(/<p>\s*<(h[1-4]|ul|ol|pre|blockquote|div|hr)/g, '<$1');
  html = html.replace(/<\/(h[1-4]|ul|ol|pre|blockquote|div)>\s*<\/p>/g, '</$1>');
  html = html.replace(/<p>\s*<\/p>/g, '');
  html = html.replace(/<p>\s*<hr\/>\s*<\/p>/g, '<hr/>');
  return html;
}

// ── System prompt builder ──────────────────────────────────────────
function buildSystemPrompt(aggressiveness) {
  const aggressivenessInstructions = aggressiveness === "aggressive"
    ? `CRITIQUE STANCE: Be aggressive in flagging issues. Err on the side of raising concerns. Flag all potential biases, all missing items, all ambiguities. The user will follow up selectively. However, remain fair and objective — do not manufacture problems that aren't there. Every concern raised must be grounded in methodological reasoning.`
    : `CRITIQUE STANCE: Be balanced and fair. Flag genuine methodological concerns and important completeness gaps, but don't nitpick minor or debatable points. Focus on issues that would materially affect the validity or interpretation of results. Still be thorough — just calibrate the threshold for raising a concern.`;

  return `You are an expert epidemiologist and methodologist specializing in causal inference, target trial emulation, and pharmacoepidemiology. You have deep knowledge of the TARGET 2025 reporting guideline (Cashin et al., JAMA 2025).

Your task is to analyze a research paper and produce a structured extraction and critique based on the TARGET 2025 checklist.

${aggressivenessInstructions}

## STEP 1: COMPATIBILITY CHECK
First, assess whether this paper's study design is compatible with the TARGET framework. TARGET covers observational studies of interventions explicitly emulating a parallel-group, individually randomized target trial, with adjustment for baseline confounders.

INCOMPATIBLE designs (flag and explain why, but still attempt extraction if possible):
- Case-control studies (unless nested within a cohort with TTE framing)
- Difference-in-differences designs
- Instrumental variable / Mendelian randomization approaches
- Cross-sectional studies with no temporal component
- Mediation analyses (causal mediation, not confounding adjustment)
- Cluster-randomized designs
- Regression discontinuity designs

If the design is incompatible, output a clear warning at the top but still attempt to extract what you can.

## STEP 2: INDEX TRIAL DETECTION
Check whether the paper explicitly references a specific completed or ongoing randomized trial it is designed to emulate. If yes:
- Note the trial name and registration number (e.g., NCT number)
- Use Template 2 (three-column: Index Trial | Target Trial | Observational Emulation)
If no index trial is referenced, use Template 1 (two-column: Target Trial | Observational Emulation).

## STEP 3: PROTOCOL EXTRACTION
If the paper is NOT explicitly framed as a TTE, reverse-engineer the implicit target trial protocol from the study design. Note this clearly.

Fill out the template table in markdown. For each cell:
- If explicitly stated → extract verbatim or close paraphrase
- If not stated but inferable from context → infer and flag with [Inferred]
- If not reported and not inferable → mark as [Not reported]

TARGET checklist items to map to table rows:
| Row | TARGET Items |
|-----|-------------|
| Eligibility criteria | 6a / 7a |
| Treatment strategies | 6b / 7b |
| Assignment procedures | 6c / 7c |
| Follow-up | 6d / 7d |
| Outcome(s) | 6e / 7e |
| Causal contrast(s) | 6f / 7f |
| Identifying assumptions | 6g / 7g.i, 7g.ii |
| Data analysis plan | 6h / 7h.i, 7h.ii |

## STEP 4: STRUCTURED CRITIQUE
Organize the critique into three sections:

### (a) Completeness Gaps
TARGET checklist items not reported or inadequately reported. Reference specific item numbers (e.g., Item 6a, Item 7g.ii).

### (b) Methodological Concerns
Address these potential issues systematically:
- Time zero alignment / misalignment
- Immortal time bias risk
- Competing events handling
- Confounding (measured and unmeasured)
- Selection bias / collider bias
- Censoring mechanisms and informative censoring
- Measurement error in treatment/outcome
- Effect measure choice appropriateness
- Grace period justification (if applicable)
- Sequential trials approach (if applicable)
- Missing data handling

### (c) Reporting Clarity Issues
- Ambiguous language or terminology
- Missing operational definitions
- Unclear variable measurement/ascertainment
- Insufficient detail for reproducibility

## OUTPUT FORMAT
Structure your output as follows (use these exact headers):

# TARGET Trial Protocol Extraction & Critique

## Paper Summary
[Brief citation-style summary: authors, title, journal, year, PMID if available]

## Summary Assessment
[2-3 sentence overall assessment of the study's alignment with TTE best practices. This orients the reader before the detailed extraction and critique below.]

## Compatibility Assessment
[Compatible / Incompatible / Partially compatible — with explanation]

## Index Trial Detection
[Detected / Not detected — with details if detected]

## Target Trial Protocol Extraction
[The filled template table in markdown]

## Critique

### (a) Completeness Gaps
[Organized list with TARGET item references]

### (b) Methodological Concerns
[Systematic assessment]

### (c) Reporting Clarity Issues
[Specific issues]

IMPORTANT: Be precise. Reference TARGET item numbers. Distinguish between what is stated vs. inferred. Be fair but thorough.

METADATA: Your very first line of output MUST be a metadata comment in this exact format (no spaces around =):
<!-- META:leadAuthor=lastname,year=YYYY -->
For example: <!-- META:leadAuthor=cashin,year=2025 -->
Use the first/lead author's lowercase surname and the publication year. This line will be parsed and hidden from display.

## HANDLING WEB-FETCHED ARTICLES
If the article was provided via URL/DOI rather than PDF, you may receive it as fetched web text. This may include navigation elements, ads, or partial content. Focus on the actual article content. If the full text appears truncated or paywalled, clearly state this limitation at the top of your analysis and work with what is available (abstract, methods summary, etc.), noting which extractions are based on limited information.`;
}

// ── API call helper ────────────────────────────────────────────────
async function callClaude(messages, systemPrompt, tools) {
  const body = {
    model: "claude-sonnet-4-20250514",
    max_tokens: 8000,
    system: systemPrompt,
    messages,
  };
  if (tools) body.tools = tools;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`API error ${resp.status}: ${errText}`);
  }
  return resp.json();
}

function extractText(data) {
  return (data.content || [])
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("\n");
}

// ── Input parsing helpers ──────────────────────────────────────────
function classifyInput(text) {
  const trimmed = text.trim();
  if (/^10\.\d{4,}\//.test(trimmed)) return { type: "doi", value: trimmed };
  if (/doi\.org\/10\.\d{4,}/.test(trimmed)) {
    const match = trimmed.match(/(10\.\d{4,}\/.+?)(?:\s|$)/);
    return { type: "doi", value: match ? match[1] : trimmed.replace(/.*doi\.org\//, "") };
  }
  if (/^PMC\d+$/i.test(trimmed)) return { type: "pmcid", value: trimmed.toUpperCase() };
  if (/^(?:PMID[:\s]*)?\d{7,8}$/i.test(trimmed)) {
    const id = trimmed.replace(/^PMID[:\s]*/i, "");
    return { type: "pmid", value: id };
  }
  if (/^https?:\/\//i.test(trimmed)) return { type: "url", value: trimmed };
  return { type: "unknown", value: trimmed };
}

function buildFetchUrl(parsed) {
  switch (parsed.type) {
    case "doi": return `https://doi.org/${parsed.value}`;
    case "pmcid": return `https://www.ncbi.nlm.nih.gov/pmc/articles/${parsed.value}/`;
    case "pmid": return `https://pubmed.ncbi.nlm.nih.gov/${parsed.value}/`;
    case "url": return parsed.value;
    default: return null;
  }
}

// ── Download helpers ───────────────────────────────────────────────
function parseMeta(text) {
  const m = text.match(/<!--\s*META:leadAuthor=(\w+),year=(\d{4})\s*-->/);
  return m ? `${m[1]}${m[2]}` : "analysis";
}

function stripMeta(text) {
  return text.replace(/<!--\s*META:leadAuthor=\w+,year=\d{4}\s*-->\n?/, "");
}

function downloadMd(content, prefix) {
  const clean = stripMeta(content);
  const filename = `${prefix}-target-analysis.md`;
  const blob = new Blob([clean], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

function downloadDocx(content, prefix) {
  const clean = stripMeta(content);
  const htmlContent = md(clean);
  const filename = `${prefix}-target-analysis.doc`;
  const fullHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${filename}</title>
<style>
body { font-family: Cambria, Georgia, serif; font-size: 11pt; line-height: 1.6; max-width: 7in; margin: 1in auto; color: #1a1a1a; }
h1 { font-size: 16pt; color: #1e3a5f; border-bottom: 2px solid #1e3a5f; padding-bottom: 4pt; }
h2 { font-size: 13pt; color: #1e3a5f; margin-top: 18pt; }
h3 { font-size: 11pt; color: #2d5986; margin-top: 14pt; }
table { border-collapse: collapse; width: 100%; margin: 12pt 0; }
th, td { border: 1px solid #999; padding: 6pt 8pt; font-size: 10pt; vertical-align: top; }
th { background: #e8eef5; font-weight: bold; }
blockquote { border-left: 3px solid #ccc; margin-left: 0; padding-left: 12pt; color: #555; }
code { font-family: Consolas, monospace; font-size: 10pt; background: #f3f4f6; padding: 1px 4px; }
</style></head><body>${htmlContent}</body></html>`;
  const blob = new Blob([fullHtml], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

// ── Icons ──────────────────────────────────────────────────────────
const UploadIcon = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
);
const FileIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
  </svg>
);
const SendIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>
);
const DownloadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);

const Spinner = ({ text }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: 48 }}>
    <div className="spinner" />
    <p style={{ color: "#64748b", fontSize: 14, fontStyle: "italic" }}>{text}</p>
  </div>
);

// ── TARGET Checklist data ──────────────────────────────────────────
const CHECKLIST = [
  { section: "Abstract", items: [
    { id: "1a", text: "Identify that the study attempts to emulate a target trial using observational data. State the study objectives and briefly summarize the specified target trial." },
    { id: "1b", text: "Report the data sources used for emulation." },
    { id: "1c", text: "Summarize key assumptions, statistical methods, findings and conclusions." },
  ]},
  { section: "Introduction", items: [
    { id: "2", label: "Background", text: "Describe the scientific background of the study and the gap in knowledge." },
    { id: "3", label: "Causal question", text: "Summarize the causal question." },
    { id: "4", label: "Rationale", text: "Describe the rationale for emulating a target trial with the available data. Cite randomized trials informing the design of the target trial if applicable." },
  ]},
  { section: "Methods", items: [
    { id: "5", label: "Data sources", text: "Cite the data sources contributing to the analyses and for each one describe the following: original purpose, type, the geographic locations, setting and time-period. If relevant, describe how the data were linked or pooled." },
  ]},
  { section: "Methods — Target Trial Protocol (Items 6–7)", paired: true, items: [
    { id: "6a / 7a", label: "Eligibility criteria",
      trial: "Describe the eligibility criteria.",
      emulation: "Describe how the eligibility criteria were operationalized with the data." },
    { id: "6b / 7b", label: "Treatment strategies",
      trial: "Describe the treatment strategies that would be compared.",
      emulation: "Describe how the treatment strategies were operationalized with the data." },
    { id: "6c / 7c", label: "Assignment procedures",
      trial: "Report that eligible individuals would be randomly assigned to treatment strategies and may be aware of their treatment allocation.",
      emulation: "Describe how assignment to treatment strategies was operationalized with the data." },
    { id: "6d / 7d", label: "Follow-up",
      trial: "Clarify that follow-up would start at time of assignment to the treatment strategies. Specify when follow-up would end.",
      emulation: "Clarify that follow-up starts at the time individuals were assigned to the treatment strategies. Describe how the end of follow-up was operationalized with the data." },
    { id: "6e / 7e", label: "Outcomes",
      trial: "Describe the outcomes.",
      emulation: "Describe how the outcomes were operationalized with the data." },
    { id: "6f / 7f", label: "Causal contrasts",
      trial: "Describe the causal contrasts of interest, including effect measures.",
      emulation: "Describe how the causal contrasts were operationalized with the data, including effect measures." },
    { id: "6g / 7g", label: "Identifying assumptions",
      trial: "Describe assumptions that would be made to identify each causal estimand. Describe the variables, if any, related to these assumptions.",
      emulation: "7g.i: For each causal estimand, describe assumptions made to identify it, including assumptions regarding baseline confounding due to lack of randomization.\n7g.ii: Describe how the variables related to these assumptions were operationalized with the data." },
    { id: "6h / 7h", label: "Data analysis plan",
      trial: "For each causal estimand, describe the data analysis procedures and any associated statistical modeling assumptions, including approaches for handling missing data.",
      emulation: "7h.i: For each causal estimand, describe the data analysis procedures and any associated statistical modeling assumptions, including approaches for handling missing data.\n7h.ii: For each causal estimand, describe any additional analyses conducted to assess the sensitivity of the results to the choice of operationalizations, assumptions and analysis." },
  ]},
  { section: "Results", items: [
    { id: "8", label: "Participant selection", text: "Report numbers of individuals assessed for eligibility, eligible, and assigned to each treatment strategy. A flow diagram is strongly recommended." },
    { id: "9", label: "Baseline data", text: "Describe the distribution of characteristics of individuals at baseline, by treatment strategy." },
    { id: "10", label: "Follow-up", text: "Summarize length of follow-up and describe reasons for end of follow-up for each treatment strategy and causal contrast." },
    { id: "11", label: "Missing data", text: "Describe the frequency of missing data in all variables, by treatment strategy when applicable." },
    { id: "12", label: "Outcomes", text: "Describe the frequency or distribution of each outcome, by treatment strategy." },
    { id: "13", label: "Effect estimates", text: "Report the effect estimates for each causal contrast with corresponding measures of precision, including both absolute and relative measures of effect, when applicable." },
    { id: "14", label: "Additional analyses", text: "Report results of all analyses to assess the sensitivity of the estimates to choices in operationalizations, assumptions and analysis." },
  ]},
  { section: "Discussion", items: [
    { id: "15", label: "Interpretation", text: "Provide an interpretation of the key findings." },
    { id: "16", label: "Limitations", text: "Discuss the limitations of the study considering differences between the target trial and its emulation and the plausibility of assumptions, including assumptions regarding baseline confounding due to lack of randomization." },
  ]},
  { section: "Other Information", items: [
    { id: "17", label: "Ethics", text: "Provide the institutional research board or ethics committee that approved the study and approval numbers, if relevant." },
    { id: "18", label: "Registration", text: "State whether, when and where the study protocol was registered." },
    { id: "19", label: "Sharing of study materials", text: "Provide information on whether data, analytic code and/or other materials are accessible, and where and how they can be accessed." },
    { id: "20", label: "Funding sources", text: "Provide the sources of funding and detail the role of the funders in the design, conduct and reporting of the study." },
    { id: "21", label: "Conflicts of interest", text: "State any conflicts of interest and financial disclosures for all authors." },
  ]},
];

const BookIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>
  </svg>
);

const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

function ChecklistContent() {
  return (
    <div className="checklist-content">
      {CHECKLIST.map((sec) => (
        <div key={sec.section} className="cl-section">
          <h3 className="cl-section-title">{sec.section}</h3>
          {sec.paired ? (
            <table className="cl-paired-table">
              <thead>
                <tr><th style={{width:"12%"}}>Item</th><th style={{width:"14%"}}>Element</th><th style={{width:"37%"}}>Target Trial Specification</th><th style={{width:"37%"}}>Observational Emulation</th></tr>
              </thead>
              <tbody>
                {sec.items.map((item) => (
                  <tr key={item.id}>
                    <td className="cl-item-id">{item.id}</td>
                    <td className="cl-item-label">{item.label}</td>
                    <td>{item.trial}</td>
                    <td style={{whiteSpace:"pre-line"}}>{item.emulation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="cl-items">
              {sec.items.map((item) => (
                <div key={item.id} className="cl-item">
                  <span className="cl-item-id">Item {item.id}</span>
                  {item.label && <span className="cl-item-label">{item.label}</span>}
                  <p>{item.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      <p className="cl-source">Source: Cashin AG, Hansford HJ, Hernán MA, et al. TARGET Statement. <em>JAMA</em>. 2025;334(12):1084–1093. <a href="https://doi.org/10.1001/jama.2025.13350" target="_blank" rel="noopener">doi:10.1001/jama.2025.13350</a></p>
    </div>
  );
}

function ChecklistPanel({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="checklist-overlay" onClick={onClose}>
      <div className="checklist-panel" onClick={(e) => e.stopPropagation()}>
        <div className="checklist-panel-header">
          <h2>TARGET 2025 Checklist Reference</h2>
          <button className="checklist-close" onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="checklist-panel-body">
          <ChecklistContent />
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────
export default function TargetTrialAnalyzer() {
  const [phase, setPhase] = useState("upload");
  const [inputMode, setInputMode] = useState("pdf");
  const [files, setFiles] = useState([]); // [{file, base64, size}]
  const [refs, setRefs] = useState([]); // [{value, type, label}]
  const [refInput, setRefInput] = useState("");
  const [aggressiveness, setAggressiveness] = useState("aggressive");
  const [analysisResult, setAnalysisResult] = useState("");
  const [conversationHistory, setConversationHistory] = useState([]);
  const [followUp, setFollowUp] = useState("");
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [followUpMessages, setFollowUpMessages] = useState([]);
  const [error, setError] = useState(null);
  const [sizeWarning, setSizeWarning] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [showChecklist, setShowChecklist] = useState(false);
  const fileInputRef = useRef(null);
  const chatEndRef = useRef(null);
  const resultRef = useRef(null);

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [followUpMessages]);

  const addFiles = useCallback((fileList) => {
    const newFiles = Array.from(fileList || []);
    let hasError = false;
    newFiles.forEach((f) => {
      if (!f.type.includes("pdf")) { hasError = true; return; }
      if (f.size > 20 * 1024 * 1024) { hasError = true; return; }
      const reader = new FileReader();
      reader.onload = () => {
        setFiles(prev => {
          if (prev.some(p => p.file.name === f.name && p.size === f.size)) return prev;
          const updated = [...prev, { file: f, base64: reader.result.split(",")[1], size: f.size }];
          setSizeWarning(updated.reduce((s, x) => s + x.size, 0) > 5 * 1024 * 1024);
          return updated;
        });
      };
      reader.readAsDataURL(f);
    });
    if (hasError) setError("Only PDF files under 20MB are accepted.");
    else setError(null);
  }, []);

  const removeFile = (idx) => {
    setFiles(prev => {
      const updated = prev.filter((_, i) => i !== idx);
      setSizeWarning(updated.reduce((s, x) => s + x.size, 0) > 5 * 1024 * 1024);
      return updated;
    });
  };

  const addRef = () => {
    const trimmed = refInput.trim();
    if (!trimmed || trimmed.length < 4) return;
    const parsed = classifyInput(trimmed);
    const label = { doi: "DOI", pmcid: "PMCID", pmid: "PMID", url: "URL", unknown: "?" }[parsed.type];
    if (refs.some(r => r.value === trimmed)) return;
    setRefs(prev => [...prev, { value: trimmed, type: parsed.type, label }]);
    setRefInput("");
    setError(null);
  };

  const removeRef = (idx) => setRefs(prev => prev.filter((_, i) => i !== idx));

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    addFiles(e.dataTransfer?.files);
  }, [addFiles]);

  const hasInput = inputMode === "pdf" ? files.length > 0 : refs.length > 0;

  const runPdfAnalysis = async () => {
    const systemPrompt = buildSystemPrompt(aggressiveness);
    const docBlocks = files.map((f, i) => ({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: f.base64 },
    }));
    const fileDesc = files.length === 1
      ? "this paper"
      : `these ${files.length} documents (the main paper and ${files.length - 1} supplement${files.length > 2 ? "s" : ""})`;
    const userMessage = {
      role: "user",
      content: [
        ...docBlocks,
        { type: "text", text: `Please analyze ${fileDesc} following the TARGET 2025 protocol extraction and critique workflow. Consider ALL uploaded documents together — supplementary materials often contain the target trial protocol table, variable definitions, sensitivity analyses, and DAGs that are essential to the extraction. If the paper references a specific randomized trial (index trial), detect it and note any registration number (e.g., NCT number). If the paper is not explicitly framed as a target trial emulation, reverse-engineer the implicit target trial protocol and note deviations from TTE best practices.` },
      ],
    };
    const data = await callClaude([userMessage], systemPrompt);
    const result = extractText(data);
    if (!result) throw new Error("Empty response from analysis.");
    return { result, userMessage };
  };

  const runRefAnalysis = async () => {
    const systemPrompt = buildSystemPrompt(aggressiveness);

    setStatusText("Fetching article(s) from the web…");

    const refDescriptions = refs.map((r, i) => {
      const url = buildFetchUrl(classifyInput(r.value));
      return `${i + 1}. ${r.label}: ${r.value}${url ? ` (resolves to: ${url})` : ""}`;
    }).join("\n");

    const isMultiple = refs.length > 1;
    const fetchPrompt = `I need you to retrieve and read the full text of ${isMultiple ? "these research documents (main paper and supplement(s))" : "this research article"}. The identifier${isMultiple ? "s" : ""} provided:

${refDescriptions}

Please use the web_search tool to:
1. Search for ${isMultiple ? "each document" : "this article"} to find the best freely available full-text version(s) (PMC, preprint server, or open access journal page)
2. Once you have the content, analyze ${isMultiple ? "all documents together" : "it"} following the TARGET 2025 protocol extraction and critique workflow

${isMultiple ? "IMPORTANT: Consider ALL documents together — supplementary materials often contain the target trial protocol table, variable definitions, sensitivity analyses, and DAGs that are essential to the extraction.\n\n" : ""}If the paper references a specific randomized trial (index trial), detect it and note any registration number (e.g., NCT number). If the paper is not explicitly framed as a target trial emulation, reverse-engineer the implicit target trial protocol and note deviations from TTE best practices.

IMPORTANT: If you cannot access the full text of any document, clearly state this limitation at the top. Work with whatever content is available and note which parts of the extraction are based on limited information. Do NOT fabricate content you cannot see.`;

    const userMessage = { role: "user", content: fetchPrompt };
    const data = await callClaude(
      [userMessage],
      systemPrompt,
      [{ type: "web_search_20250305", name: "web_search" }]
    );
    const result = extractText(data);
    if (!result) throw new Error("Empty response from analysis.");
    return { result, userMessage };
  };

  const runAnalysis = async () => {
    setPhase("analyzing");
    setError(null);
    setAnalysisResult("");
    setFollowUpMessages([]);
    setConversationHistory([]);
    setStatusText(inputMode === "pdf"
      ? `Analyzing ${files.length === 1 ? "paper" : files.length + " documents"} against TARGET 2025 checklist…`
      : `Fetching and analyzing ${refs.length === 1 ? "article" : refs.length + " documents"}…`);

    try {
      const { result, userMessage } = inputMode === "pdf"
        ? await runPdfAnalysis()
        : await runRefAnalysis();

      setAnalysisResult(result);
      setConversationHistory([userMessage, { role: "assistant", content: result }]);

      const nctMatch = result.match(/NCT\d{8}/);
      if (nctMatch) {
        setStatusText(`Looking up index trial ${nctMatch[0]} on ClinicalTrials.gov…`);
        try {
          const systemPrompt = buildSystemPrompt(aggressiveness);
          const lookupData = await callClaude(
            [
              userMessage,
              { role: "assistant", content: result },
              { role: "user", content: `You detected the index trial ${nctMatch[0]}. Please search ClinicalTrials.gov for this trial and provide a brief summary of the trial design (title, status, arms, primary outcome, sample size) so we can compare it to the target trial specification. Format as a concise addendum.` },
            ],
            systemPrompt,
            [{ type: "web_search_20250305", name: "web_search" }]
          );
          const lookupResult = extractText(lookupData);
          if (lookupResult) {
            const updatedResult = result + "\n\n---\n\n## Index Trial Registry Lookup\n\n" + lookupResult;
            setAnalysisResult(updatedResult);
            setConversationHistory(prev => [
              ...prev,
              { role: "user", content: `Look up ${nctMatch[0]} on ClinicalTrials.gov.` },
              { role: "assistant", content: lookupResult },
            ]);
          }
        } catch (e) {
          console.warn("Index trial lookup failed:", e);
        }
      }
      setPhase("results");
    } catch (e) {
      setError(e.message);
      setPhase("upload");
    }
  };

  const sendFollowUp = async () => {
    if (!followUp.trim() || followUpLoading) return;
    const userMsg = followUp.trim();
    setFollowUp("");
    setFollowUpMessages(prev => [...prev, { role: "user", text: userMsg }]);
    setFollowUpLoading(true);

    const systemPrompt = buildSystemPrompt(aggressiveness);
    const messages = [...conversationHistory, { role: "user", content: userMsg }];

    try {
      const data = await callClaude(messages, systemPrompt, [
        { type: "web_search_20250305", name: "web_search" },
      ]);
      const reply = extractText(data);
      setFollowUpMessages(prev => [...prev, { role: "assistant", text: reply }]);
      setConversationHistory(prev => [...prev, { role: "user", content: userMsg }, { role: "assistant", content: reply }]);
    } catch (e) {
      setFollowUpMessages(prev => [...prev, { role: "assistant", text: `Error: ${e.message}` }]);
    } finally {
      setFollowUpLoading(false);
    }
  };

  const resetAll = () => {
    setPhase("upload");
    setFiles([]);
    setRefs([]);
    setRefInput("");
    setAnalysisResult("");
    setConversationHistory([]);
    setFollowUpMessages([]);
    setFollowUp("");
    setError(null);
    setSizeWarning(false);
    setStatusText("");
    setShowChecklist(false);
    setCopyFeedback("");
  };

  const [copyFeedback, setCopyFeedback] = useState("");

  const handleCopy = () => {
    try {
      const ta = document.createElement("textarea");
      ta.value = stripMeta(analysisResult);
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "-9999px";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopyFeedback("Copied!");
      setTimeout(() => setCopyFeedback(""), 2000);
    } catch {
      setCopyFeedback("Copy failed");
      setTimeout(() => setCopyFeedback(""), 2000);
    }
  };

  const handleDownloadMd = () => downloadMd(analysisResult, parseMeta(analysisResult));
  const handleDownloadDoc = () => downloadDocx(analysisResult, parseMeta(analysisResult));

  const parsedRef = refInput.trim() ? classifyInput(refInput) : null;
  const refTypeLabel = parsedRef
    ? { doi: "DOI", pmcid: "PMCID", pmid: "PMID", url: "URL", unknown: "Search term" }[parsedRef.type]
    : null;

  return (
    <div className="app-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Literata:opsz,wght@7..72,400;7..72,500;7..72,700&family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .app-root {
          font-family: 'DM Sans', system-ui, sans-serif;
          min-height: 100vh;
          background: #f8f6f1;
          color: #1c1917;
          display: flex;
          flex-direction: column;
        }
        .app-header {
          background: #1e293b;
          color: #f1f5f9;
          padding: 20px 32px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          border-bottom: 3px solid #d97706;
        }
        .app-header h1 {
          font-family: 'Literata', Georgia, serif;
          font-size: 20px;
          font-weight: 700;
          letter-spacing: -0.3px;
        }
        .app-header .subtitle { font-size: 12px; color: #94a3b8; font-weight: 400; margin-top: 2px; }
        .upload-container {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 48px 24px;
          max-width: 720px;
          margin: 0 auto;
          width: 100%;
        }
        .scope-box {
          background: #fff;
          border: 1px solid #e2e0db;
          border-radius: 8px;
          padding: 24px;
          margin-bottom: 32px;
          width: 100%;
          font-size: 14px;
          line-height: 1.7;
          color: #44403c;
        }
        .scope-box h2 { font-family: 'Literata', Georgia, serif; font-size: 16px; color: #1e293b; margin-bottom: 12px; }
        .scope-box .scope-label { font-weight: 600; color: #1e293b; display: inline; }
        .details-row { display: flex; flex-direction: column; gap: 0; margin-top: 14px; border-top: 1px solid #e2e0db; }
        .details-row details {
          border-bottom: 1px solid #e2e0db;
          padding: 0;
        }
        .details-row details:last-child { border-bottom: none; }
        .details-row summary {
          padding: 10px 14px;
          font-size: 13px;
          font-weight: 600;
          color: #1e293b;
          cursor: pointer;
          list-style: none;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: background 0.15s;
        }
        .details-row summary:hover { background: #fafaf9; }
        .details-row summary::before {
          content: "▸";
          font-size: 11px;
          color: #a8a29e;
          transition: transform 0.15s;
        }
        .details-row details[open] summary::before { transform: rotate(90deg); }
        .details-row summary::-webkit-details-marker { display: none; }
        .details-row details > p {
          padding: 0 14px 12px;
          font-size: 13px;
          line-height: 1.65;
          color: #57534e;
          margin: 0;
        }
        .input-tabs { display: flex; width: 100%; gap: 0; }
        .input-tab {
          flex: 1;
          padding: 12px 16px;
          font-size: 14px;
          font-weight: 600;
          font-family: inherit;
          border: 1px solid #e2e0db;
          background: #f5f5f0;
          color: #78716c;
          cursor: pointer;
          transition: all 0.15s;
          text-align: center;
        }
        .input-tab:first-child { border-radius: 8px 0 0 0; border-right: none; }
        .input-tab:last-child { border-radius: 0 8px 0 0; }
        .input-tab.active { background: #fff; color: #1e293b; border-bottom-color: #fff; position: relative; z-index: 1; }
        .input-panel { border: 1px solid #e2e0db; border-top: none; border-radius: 0 0 8px 8px; background: #fff; width: 100%; }
        .drop-zone {
          border: 2px dashed #c4b99e;
          border-radius: 8px;
          padding: 40px 32px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s;
          margin: 16px;
          background: #fffef9;
        }
        .drop-zone:hover, .drop-zone.dragover { border-color: #d97706; background: #fef9ee; }
        .drop-zone .icon { color: #a8a29e; margin-bottom: 12px; }
        .drop-zone p { color: #78716c; font-size: 14px; }
        .ref-panel-inner { padding: 24px; }
        .ref-input-wrap { display: flex; gap: 0; align-items: stretch; }
        .ref-input {
          flex: 1;
          padding: 12px 16px;
          font-size: 14px;
          font-family: 'JetBrains Mono', monospace;
          border: 1px solid #d6d3d1;
          border-radius: 6px 0 0 6px;
          outline: none;
          transition: border-color 0.15s;
        }
        .ref-input:focus { border-color: #d97706; }
        .ref-type-badge {
          display: flex;
          align-items: center;
          padding: 0 14px;
          background: #f5f5f0;
          border: 1px solid #d6d3d1;
          border-left: none;
          border-radius: 0;
          font-size: 12px;
          font-weight: 600;
          color: #64748b;
          white-space: nowrap;
          min-width: 60px;
          justify-content: center;
        }
        .ref-type-badge.detected { color: #16a34a; background: #f0fdf4; }
        .ref-examples { margin-top: 12px; font-size: 12px; color: #78716c; line-height: 1.8; }
        .ref-examples code { font-family: 'JetBrains Mono', monospace; background: #f5f5f0; padding: 2px 6px; border-radius: 3px; font-size: 11px; }

        .file-list { padding: 0 16px 16px; display: flex; flex-direction: column; gap: 6px; }
        .file-list-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          background: #fafaf9;
          border: 1px solid #e7e5e4;
          border-radius: 6px;
          font-size: 13px;
        }
        .file-list-name { font-weight: 500; color: #1e293b; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .file-list-size { font-size: 11px; color: #a8a29e; white-space: nowrap; }
        .file-list-tag {
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.4px;
          padding: 2px 6px;
          border-radius: 3px;
          background: #dbeafe;
          color: #1e40af;
          white-space: nowrap;
        }
        .file-list-tag.supplement { background: #f3e8ff; color: #7c3aed; }
        .file-list-remove {
          background: none;
          border: none;
          font-size: 18px;
          line-height: 1;
          color: #a8a29e;
          cursor: pointer;
          padding: 0 2px;
          transition: color 0.15s;
        }
        .file-list-remove:hover { color: #dc2626; }

        .ref-add-btn {
          padding: 0 16px;
          background: #1e293b;
          color: #fff;
          border: none;
          border-radius: 0 6px 6px 0;
          font-size: 13px;
          font-weight: 600;
          font-family: inherit;
          cursor: pointer;
          transition: background 0.15s;
          white-space: nowrap;
        }
        .ref-add-btn:hover { background: #334155; }
        .ref-add-btn:disabled { background: #d6d3d1; cursor: not-allowed; }

        .ref-list { margin-top: 12px; display: flex; flex-direction: column; gap: 6px; }
        .ref-list-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          background: #fafaf9;
          border: 1px solid #e7e5e4;
          border-radius: 6px;
          font-size: 13px;
        }
        .ref-list-badge {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          font-weight: 600;
          padding: 2px 6px;
          border-radius: 3px;
          background: #f1f5f9;
          color: #1e293b;
          white-space: nowrap;
        }
        .ref-list-value {
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
          color: #44403c;
        }
        .settings-row { display: flex; align-items: center; gap: 16px; margin-top: 24px; width: 100%; justify-content: space-between; }
        .toggle-group { display: flex; background: #e7e5e4; border-radius: 6px; overflow: hidden; }
        .toggle-btn { padding: 8px 16px; font-size: 13px; border: none; cursor: pointer; font-family: inherit; font-weight: 500; background: transparent; color: #78716c; transition: all 0.15s; }
        .toggle-btn.active { background: #1e293b; color: #fff; }
        .analyze-btn { padding: 10px 28px; background: #d97706; color: #fff; border: none; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit; transition: background 0.15s; }
        .analyze-btn:hover { background: #b45309; }
        .analyze-btn:disabled { background: #d6d3d1; cursor: not-allowed; }
        .analyzing-container { flex: 1; display: flex; align-items: center; justify-content: center; }
        .spinner { width: 40px; height: 40px; border: 3px solid #e7e5e4; border-top-color: #d97706; border-radius: 50%; animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .results-layout { flex: 1; display: flex; flex-direction: column; max-width: 1100px; margin: 0 auto; width: 100%; padding: 24px; gap: 24px; }
        .toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .toolbar-btn { display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; font-size: 12px; font-family: inherit; font-weight: 600; border: 1px solid #d6d3d1; border-radius: 5px; background: #fff; color: #44403c; cursor: pointer; transition: all 0.15s; }
        .toolbar-btn:hover { border-color: #a8a29e; background: #fafaf9; }
        .toolbar-btn.primary { background: #1e293b; color: #fff; border-color: #1e293b; }
        .toolbar-btn.primary:hover { background: #334155; }
        .toolbar-spacer { flex: 1; }
        .result-card { background: #fff; border: 1px solid #e2e0db; border-radius: 8px; overflow: hidden; }
        .result-body { padding: 32px; max-height: 65vh; overflow-y: auto; }
        .rendered h1 { font-family: 'Literata', Georgia, serif; font-size: 22px; font-weight: 700; color: #1e293b; margin: 28px 0 16px; padding-bottom: 8px; border-bottom: 2px solid #e2e0db; }
        .rendered h1:first-child { margin-top: 0; }
        .rendered h2 { font-family: 'Literata', Georgia, serif; font-size: 17px; font-weight: 700; color: #1e293b; margin: 24px 0 12px; }
        .rendered h3 { font-size: 15px; font-weight: 600; color: #44403c; margin: 18px 0 8px; }
        .rendered h4 { font-size: 14px; font-weight: 600; color: #57534e; margin: 14px 0 6px; }
        .rendered p { font-size: 14px; line-height: 1.75; margin: 8px 0; color: #292524; }
        .rendered strong { font-weight: 600; color: #1c1917; }
        .rendered em { font-style: italic; }
        .rendered ul, .rendered ol { padding-left: 24px; margin: 8px 0; }
        .rendered li { font-size: 14px; line-height: 1.7; margin: 4px 0; color: #292524; }
        .rendered blockquote { border-left: 3px solid #d97706; padding: 8px 16px; margin: 12px 0; background: #fefce8; font-size: 14px; color: #713f12; border-radius: 0 4px 4px 0; }
        .rendered hr { border: none; border-top: 1px solid #e2e0db; margin: 24px 0; }
        .rendered .code-block { background: #1e293b; color: #e2e8f0; padding: 16px; border-radius: 6px; overflow-x: auto; font-family: 'JetBrains Mono', monospace; font-size: 13px; margin: 12px 0; }
        .tag { font-size: 12px; font-weight: 600; padding: 2px 6px; border-radius: 3px; font-family: 'JetBrains Mono', monospace; white-space: nowrap; }
        .tag-inferred { background: #fef3c7; color: #92400e; }
        .tag-missing { background: #fee2e2; color: #991b1b; }
        .tag-error { background: #dc2626; color: #fff; }
        .tag-warn { background: #f59e0b; color: #fff; }
        .rendered .table-wrap { overflow-x: auto; margin: 16px 0; }
        .rendered table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .rendered th { background: #1e293b; color: #f1f5f9; padding: 10px 12px; text-align: left; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.3px; }
        .rendered td { padding: 10px 12px; border-bottom: 1px solid #e7e5e4; vertical-align: top; line-height: 1.6; }
        .rendered tr:nth-child(even) td { background: #fafaf9; }
        .rendered td:first-child { font-weight: 600; color: #1e293b; white-space: nowrap; min-width: 140px; }
        .followup-section { background: #fff; border: 1px solid #e2e0db; border-radius: 8px; overflow: hidden; }
        .followup-header { padding: 14px 20px; border-bottom: 1px solid #e2e0db; font-weight: 600; font-size: 14px; color: #1e293b; background: #fafaf9; }
        .followup-messages { max-height: 300px; overflow-y: auto; padding: 16px 20px; }
        .followup-msg { margin-bottom: 16px; display: flex; gap: 10px; }
        .followup-msg .avatar { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0; margin-top: 2px; }
        .followup-msg.user .avatar { background: #dbeafe; color: #1e40af; }
        .followup-msg.assistant .avatar { background: #fef3c7; color: #92400e; }
        .followup-msg .msg-body { font-size: 14px; line-height: 1.7; color: #292524; flex: 1; min-width: 0; }
        .followup-msg.user .msg-body { font-weight: 500; }
        .followup-input-row { display: flex; gap: 8px; padding: 12px 20px; border-top: 1px solid #e2e0db; background: #fafaf9; }
        .followup-input { flex: 1; padding: 10px 14px; border: 1px solid #d6d3d1; border-radius: 6px; font-size: 14px; font-family: inherit; outline: none; transition: border-color 0.15s; }
        .followup-input:focus { border-color: #d97706; }
        .followup-send { padding: 10px 16px; background: #1e293b; color: #fff; border: none; border-radius: 6px; cursor: pointer; display: flex; align-items: center; font-family: inherit; transition: background 0.15s; }
        .followup-send:hover { background: #334155; }
        .followup-send:disabled { background: #94a3b8; cursor: not-allowed; }
        .error-box { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; padding: 12px 16px; border-radius: 6px; font-size: 13px; margin-top: 16px; width: 100%; }
        .warning-box { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; padding: 12px 16px; border-radius: 6px; font-size: 13px; margin-top: 12px; width: 100%; }
        @media (max-width: 700px) {
          .app-header { padding: 16px; }
          .app-header h1 { font-size: 16px; }
          .results-layout { padding: 12px; }
          .result-body { padding: 16px; }
          .settings-row { flex-direction: column; align-items: stretch; }
          .toolbar { gap: 6px; }
          .app-footer { flex-direction: column; text-align: center; }
        }
        .app-footer {
          padding: 16px 32px;
          font-size: 11px;
          color: #a8a29e;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          border-top: 1px solid #e2e0db;
          margin-top: auto;
        }
        .footer-disclaimer {
          font-style: italic;
        }

        /* ── Checklist reference ── */
        .checklist-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.4);
          z-index: 1000;
          display: flex;
          justify-content: flex-end;
          animation: fadeIn 0.15s ease;
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .checklist-panel {
          width: min(640px, 90vw);
          height: 100%;
          background: #fff;
          display: flex;
          flex-direction: column;
          box-shadow: -4px 0 24px rgba(0,0,0,0.15);
          animation: slideIn 0.2s ease;
        }
        @keyframes slideIn { from { transform: translateX(40px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .checklist-panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 18px 24px;
          border-bottom: 1px solid #e2e0db;
          background: #fafaf9;
        }
        .checklist-panel-header h2 {
          font-family: 'Literata', Georgia, serif;
          font-size: 16px;
          font-weight: 700;
          color: #1e293b;
        }
        .checklist-close {
          background: none;
          border: none;
          cursor: pointer;
          color: #78716c;
          padding: 4px;
          border-radius: 4px;
          display: flex;
          transition: background 0.15s;
        }
        .checklist-close:hover { background: #e7e5e4; }
        .checklist-panel-body {
          flex: 1;
          overflow-y: auto;
          padding: 24px;
        }
        .checklist-content .cl-section { margin-bottom: 24px; }
        .checklist-content .cl-section-title {
          font-family: 'Literata', Georgia, serif;
          font-size: 14px;
          font-weight: 700;
          color: #1e293b;
          padding-bottom: 6px;
          border-bottom: 2px solid #d97706;
          margin-bottom: 12px;
        }
        .checklist-content .cl-items { display: flex; flex-direction: column; gap: 10px; }
        .checklist-content .cl-item {
          font-size: 13px;
          line-height: 1.65;
          color: #44403c;
        }
        .checklist-content .cl-item-id {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          font-weight: 600;
          color: #1e293b;
          background: #f1f5f9;
          padding: 2px 6px;
          border-radius: 3px;
          margin-right: 6px;
          white-space: nowrap;
        }
        .checklist-content .cl-item-label {
          font-weight: 600;
          color: #1e293b;
          margin-right: 4px;
        }
        .checklist-content .cl-item-label::after { content: " \\2014  "; font-weight: 400; color: #a8a29e; }
        .checklist-content .cl-item p { display: inline; }
        .checklist-content .cl-paired-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
          margin-bottom: 8px;
        }
        .checklist-content .cl-paired-table th {
          background: #1e293b;
          color: #f1f5f9;
          padding: 8px 10px;
          text-align: left;
          font-weight: 600;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }
        .checklist-content .cl-paired-table td {
          padding: 8px 10px;
          border-bottom: 1px solid #e7e5e4;
          vertical-align: top;
          line-height: 1.6;
          color: #44403c;
        }
        .checklist-content .cl-paired-table tr:nth-child(even) td { background: #fafaf9; }
        .checklist-content .cl-paired-table .cl-item-id { background: transparent; padding: 0; }
        .checklist-content .cl-paired-table .cl-item-label { font-size: 12px; }
        .checklist-content .cl-paired-table .cl-item-label::after { content: ""; }
        .checklist-content .cl-source {
          font-size: 11px;
          color: #a8a29e;
          margin-top: 16px;
          padding-top: 12px;
          border-top: 1px solid #e2e0db;
        }
        .checklist-content .cl-source a { color: #b45309; }
      `}</style>

      <header className="app-header">
        <div>
          <h1>TARGET Protocol Extractor</h1>
          <div className="subtitle">Target Trial Emulation Analysis · TARGET 2025 Checklist</div>
        </div>
      </header>

      {phase === "upload" && (
        <div className="upload-container">
          <div className="scope-box">
            <h2>Why use this tool?</h2>
            <p>
              Many observational studies estimate intervention effects — some explicitly as target trial
              emulations, others behind "association" language while clearly aiming for causal conclusions.
              This tool audits both types: it extracts the target trial protocol (or reverse-engineers
              the one the authors are implicitly emulating), then critiques it against the
              <strong> TARGET 2025 checklist</strong> (<a href="https://doi.org/10.1001/jama.2025.13350" target="_blank" rel="noopener" style={{ color: "#b45309", textDecoration: "underline", textUnderlineOffset: "2px" }}>Cashin et al., JAMA 2025</a>) — so you can see where the design holds up and where it doesn't.
            </p>

            <div className="details-row">
              <details>
                <summary>Use cases</summary>
                <p>Peer review, journal clubs, systematic reviews (ROBINS-I pre-work), grant/protocol development, teaching TTE methodology, or pressure-testing your own study before submission.</p>
              </details>
              <details>
                <summary>How it works</summary>
                <p>Upload a PDF (or provide a DOI/link). The tool extracts protocol elements into a structured table, then produces a critique organized by completeness gaps, methodological concerns, and reporting clarity — all referenced to specific TARGET checklist item numbers. For papers not framed as TTE, it reverse-engineers the implicit target trial and flags deviations from best practices.</p>
              </details>
              <details>
                <summary>Scope & limitations</summary>
                <p style={{ marginBottom: 6 }}><strong>Designed for:</strong> Observational studies of interventions emulating a parallel-group, individually randomized target trial — including cohort studies, sequential trial emulations, and new-user/active-comparator designs.</p>
                <p><strong>Not designed for</strong> (will be flagged as incompatible): case-control studies (unless nested with TTE framing), difference-in-differences, instrumental variable / Mendelian randomization, regression discontinuity, cross-sectional studies without temporal structure, causal mediation analyses, and cluster-randomized emulations.</p>
              </details>
              <details>
                <summary>TARGET checklist reference</summary>
                <div style={{ padding: "0 14px 12px" }}>
                  <ChecklistContent />
                </div>
              </details>
            </div>
          </div>

          <div className="input-tabs">
            <button className={`input-tab ${inputMode === "pdf" ? "active" : ""}`} onClick={() => { setInputMode("pdf"); setError(null); }}>
              Upload PDF(s)
            </button>
            <button className={`input-tab ${inputMode === "reference" ? "active" : ""}`} onClick={() => { setInputMode("reference"); setError(null); }}>
              DOI / URL / PMCID
            </button>
          </div>

          <div className="input-panel">
            {inputMode === "pdf" ? (
              <div>
                <div
                  className="drop-zone"
                  onClick={() => fileInputRef.current?.click()}
                  onDrop={handleDrop}
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("dragover"); }}
                  onDragLeave={(e) => e.currentTarget.classList.remove("dragover")}
                >
                  <div className="icon"><UploadIcon /></div>
                  <p>Drop PDF(s) here or click to browse</p>
                  <p style={{ fontSize: 12, color: "#a8a29e", marginTop: 4 }}>Main paper + supplements accepted</p>
                  <input ref={fileInputRef} type="file" accept=".pdf" multiple style={{ display: "none" }} onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
                </div>
                {files.length > 0 && (
                  <div className="file-list">
                    {files.map((f, i) => (
                      <div key={i} className="file-list-item">
                        <FileIcon />
                        <span className="file-list-name">{f.file.name}</span>
                        <span className="file-list-size">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                        {i === 0 && <span className="file-list-tag">Main</span>}
                        {i > 0 && <span className="file-list-tag supplement">Supplement</span>}
                        <button className="file-list-remove" onClick={() => removeFile(i)} title="Remove">×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="ref-panel-inner">
                <div className="ref-input-wrap">
                  <input
                    className="ref-input"
                    placeholder="10.1001/jama.2025.13350"
                    value={refInput}
                    onChange={(e) => setRefInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRef(); } }}
                  />
                  <div className={`ref-type-badge ${parsedRef && parsedRef.type !== "unknown" ? "detected" : ""}`}>
                    {refTypeLabel || "\u2014"}
                  </div>
                  <button className="ref-add-btn" onClick={addRef} disabled={!refInput.trim() || refInput.trim().length < 4}>Add</button>
                </div>
                {refs.length > 0 && (
                  <div className="ref-list">
                    {refs.map((r, i) => (
                      <div key={i} className="ref-list-item">
                        <span className="ref-list-badge">{r.label}</span>
                        <span className="ref-list-value">{r.value}</span>
                        {i === 0 && <span className="file-list-tag">Main</span>}
                        {i > 0 && <span className="file-list-tag supplement">Supplement</span>}
                        <button className="file-list-remove" onClick={() => removeRef(i)} title="Remove">×</button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="ref-examples">
                  <strong>Accepted formats:</strong> DOI (<code>10.1001/...</code>), PMCID (<code>PMC...</code>), PMID (<code>39073849</code>), or direct URL.<br />
                  Add the main paper first, then any supplements. Press Enter or click Add for each one.<br />
                  <em>Full text must be publicly accessible. Paywalled articles will be analyzed from available metadata only.</em>
                </div>
              </div>
            )}
          </div>

          {sizeWarning && (
            <div className="warning-box">⚠ Total upload size exceeds 5MB. Analysis may take longer and some content may be truncated.</div>
          )}
          {error && <div className="error-box">⚠ {error}</div>}

          <div className="settings-row">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#44403c" }}>Critique level:</span>
              <div className="toggle-group">
                <button className={`toggle-btn ${aggressiveness === "standard" ? "active" : ""}`} onClick={() => setAggressiveness("standard")}>Balanced</button>
                <button className={`toggle-btn ${aggressiveness === "aggressive" ? "active" : ""}`} onClick={() => setAggressiveness("aggressive")}>Aggressive</button>
              </div>
            </div>
            <button className="analyze-btn" disabled={!hasInput} onClick={runAnalysis}>Analyze Paper</button>
          </div>
        </div>
      )}

      {phase === "analyzing" && (
        <div className="analyzing-container">
          <Spinner text={statusText || "Analyzing\u2026"} />
        </div>
      )}

      {phase === "results" && (
        <div className="results-layout">
          <div className="toolbar">
            <button className="toolbar-btn primary" onClick={resetAll}>← New Analysis</button>
            <button className="toolbar-btn" onClick={() => setShowChecklist(true)}><BookIcon /> Checklist Reference</button>
            <div className="toolbar-spacer" />
            {copyFeedback && <span style={{ fontSize: 12, color: "#16a34a", fontWeight: 500 }}>{copyFeedback}</span>}
            <button className="toolbar-btn" onClick={handleCopy}>Copy Markdown</button>
            <button className="toolbar-btn" onClick={handleDownloadMd}><DownloadIcon /> .md</button>
            <button className="toolbar-btn" onClick={handleDownloadDoc}><DownloadIcon /> .doc</button>
          </div>

          <div className="result-card">
            <div className="result-body rendered" ref={resultRef} dangerouslySetInnerHTML={{ __html: md(stripMeta(analysisResult)) }} />
          </div>

          <div className="followup-section">
            <div className="followup-header">Ask follow-up questions, challenge findings, or request revisions</div>
            {followUpMessages.length > 0 && (
              <div className="followup-messages">
                {followUpMessages.map((m, i) => (
                  <div key={i} className={`followup-msg ${m.role}`}>
                    <div className="avatar">{m.role === "user" ? "Y" : "C"}</div>
                    <div className="msg-body rendered" dangerouslySetInnerHTML={{ __html: m.role === "assistant" ? md(m.text) : m.text }} />
                  </div>
                ))}
                {followUpLoading && (
                  <div className="followup-msg assistant">
                    <div className="avatar">C</div>
                    <div className="msg-body"><em style={{ color: "#78716c" }}>Thinking…</em></div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            )}
            <div className="followup-input-row">
              <input
                className="followup-input"
                placeholder="e.g., 'Expand on the time zero concern' or 'Draft a letter to authors about Item 7d'"
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendFollowUp()}
              />
              <button className="followup-send" disabled={!followUp.trim() || followUpLoading} onClick={sendFollowUp}>
                <SendIcon />
              </button>
            </div>
          </div>
        </div>
      )}
      <ChecklistPanel open={showChecklist} onClose={() => setShowChecklist(false)} />
      {/* ── Footer ── */}
      <footer className="app-footer">
        <span>Created by Todd R. Johnson, PhD · McWilliams School of Biomedical Informatics, UTHealth Houston · Powered by Claude (Anthropic)</span>
        <span className="footer-disclaimer">Not affiliated with the TARGET guideline group.</span>
      </footer>
    </div>
  );
}
