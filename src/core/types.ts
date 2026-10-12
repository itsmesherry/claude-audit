// ─────────────────────────────────────────────
//  claude-audit — Types
// ─────────────────────────────────────────────

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type AuditCategory =
  | 'security'
  | 'quality'
  | 'performance'
  | 'architecture'
  | 'dependencies'
  | 'testing'
  | 'documentation';

export interface Finding {
  id: string;
  category: AuditCategory;
  severity: Severity;
  title: string;
  description: string;
  file?: string;
  line?: number;
  snippet?: string;
  fix?: string;
  references?: string[];
}

export interface CategoryScore {
  category: AuditCategory;
  score: number;          // 0–100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  findings: Finding[];
  summary: string;
}

export interface ProjectInfo {
  name: string;
  path: string;
  languages: Record<string, number>;   // lang → file count
  frameworks: string[];
  totalFiles: number;
  /** Files left unscanned because the project has more than --max-files. */
  filesOverLimit?: number;
  totalLines: number;
  hasTests: boolean;
  hasDependencyFile: boolean;
  dependencyFile?: string;
  dependencies: Record<string, string>;
  testFrameworks: string[];
  packageManager?: 'npm' | 'yarn' | 'pnpm' | 'pip' | 'poetry' | 'cargo' | 'go' | 'maven' | 'gradle';
}

export interface ScannedFile {
  path: string;
  relativePath: string;
  language: string;
  lines: number;
  size: number;
  content: string;
}

// ─── Agentic audit telemetry ────────────────────────────
// Each tool invocation during an agentic audit is recorded so operators
// can review, debug, and satisfy compliance/audit-trail requirements.
export interface ToolCallRecord {
  turn: number;                  // 1-based turn index
  toolUseId: string;             // Claude-provided id (correlation key)
  name: string;                  // tool name
  input: Record<string, unknown>;
  outputPreview: string;         // first N chars of tool_result (for trace)
  outputBytes: number;           // full size before truncation
  durationMs: number;
  isError: boolean;
  timestamp: string;             // ISO-8601
}

export interface AgentTraceSummary {
  turns: number;
  toolCalls: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  stopReason: 'completed' | 'max_turns' | 'max_budget' | 'repetition' | 'error';
  stopDetail?: string;
  durationMs: number;
  toolUsage: Record<string, number>;  // per-tool call counts
}

export interface AgentTrace {
  enabled: true;
  model: string;
  maxTurns: number;
  maxBudgetTokens: number;
  summary: AgentTraceSummary;
  calls: ToolCallRecord[];
}

export interface AuditReport {
  version: string;
  timestamp: string;
  project: ProjectInfo;
  overallScore: number;
  overallGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  categories: CategoryScore[];
  allFindings: Finding[];
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  aiPowered: boolean;
  agentic?: boolean;       // true when agentic loop was used
  agentTrace?: AgentTrace; // present when agentic mode ran
  /** Things the reader must know to trust the report, e.g. the AI step failed. */
  warnings?: string[];
  durationMs: number;
}

export interface AuditOptions {
  path: string;
  apiKey?: string;
  output: ('terminal' | 'markdown' | 'html' | 'json')[];
  categories?: AuditCategory[];
  maxFileSize: number;    // KB
  maxFiles: number;
  model: string;
  noAi: boolean;
  quiet: boolean;
  // ── Agentic controls ─────────────────────────────
  agentic: boolean;        // default true when API key + !fast
  maxTurns: number;        // hard ceiling on tool-use iterations
  maxBudgetTokens: number; // cumulative input+output token cap
  trace: boolean;          // write .claude-audit/agent-trace.jsonl
}

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

export function scoreToGrade(score: number): Grade {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 45) return 'D';
  return 'F';
}
