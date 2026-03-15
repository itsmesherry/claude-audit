// ─────────────────────────────────────────────
//  claude-audit — Claude AI Analyzer
// ─────────────────────────────────────────────

import Anthropic from '@anthropic-ai/sdk';
import { scoreToGrade } from '../../core/types';
import type { ScannedFile, ProjectInfo, Finding, CategoryScore, AuditCategory } from '../../core/types';

const MAX_CONTEXT_CHARS = 60_000;
const PRIORITY_EXTENSIONS = ['ts', 'js', 'py', 'go', 'rs', 'java', 'rb'];

function buildCodeContext(files: ScannedFile[], maxChars: number): string {
  // Prioritize entry points, main files, and important dirs
  const prioritized = [...files].sort((a, b) => {
    const aScore = getPriorityScore(a.relativePath);
    const bScore = getPriorityScore(b.relativePath);
    return bScore - aScore;
  });

  const chunks: string[] = [];
  let totalChars = 0;

  for (const file of prioritized) {
    if (totalChars >= maxChars) break;
    const ext = file.relativePath.split('.').pop()?.toLowerCase() ?? '';
    if (!PRIORITY_EXTENSIONS.includes(ext)) continue;

    const header = `\n\n// ═══ FILE: ${file.relativePath} (${file.lines} lines) ═══\n`;
    // Truncate very large files
    const content = file.content.length > 3000
      ? file.content.slice(0, 3000) + '\n// ... [truncated]'
      : file.content;

    const chunk = header + content;
    if (totalChars + chunk.length > maxChars) break;

    chunks.push(chunk);
    totalChars += chunk.length;
  }

  return chunks.join('');
}

function getPriorityScore(filePath: string): number {
  const f = filePath.toLowerCase();
  let score = 0;
  if (f.includes('index.') || f.includes('main.') || f.includes('app.')) score += 10;
  if (f.includes('auth') || f.includes('security') || f.includes('crypto')) score += 8;
  if (f.includes('api') || f.includes('route') || f.includes('controller')) score += 6;
  if (f.includes('config') || f.includes('setting') || f.includes('env')) score += 5;
  if (f.includes('service') || f.includes('util') || f.includes('helper')) score += 4;
  if (f.includes('model') || f.includes('schema') || f.includes('database')) score += 4;
  if (f.includes('middleware') || f.includes('hook') || f.includes('plugin')) score += 3;
  if (f.includes('.test.') || f.includes('.spec.')) score -= 3;
  if (f.includes('node_modules') || f.includes('vendor')) score -= 20;
  return score;
}

interface AIAuditResponse {
  security: { score: number; summary: string; findings: Finding[] };
  quality: { score: number; summary: string; findings: Finding[] };
  performance: { score: number; summary: string; findings: Finding[] };
  architecture: { score: number; summary: string; findings: Finding[] };
  testing: { score: number; summary: string; findings: Finding[] };
  documentation: { score: number; summary: string; findings: Finding[] };
}

const SYSTEM_PROMPT = `You are Claude Audit — an expert senior software engineer conducting a comprehensive codebase audit. 
Your job is to identify real, actionable issues across 6 dimensions with the precision of a principal engineer at a top-tier tech company.

Be specific, accurate, and brutal-but-constructive. Prioritize findings that actually matter.
Return ONLY valid JSON — no prose, no markdown, no code fences.`;

function buildAuditPrompt(info: ProjectInfo, codeContext: string, filterCategories?: AuditCategory[]): string {
  const depsStr = Object.entries(info.dependencies).slice(0, 30)
    .map(([k, v]) => `${k}@${v}`).join(', ');

  const allCategories: AuditCategory[] = ['security', 'quality', 'performance', 'architecture', 'testing', 'documentation'];
  const cats = filterCategories ?? allCategories;

  const jsonShape = cats.map(cat => `  "${cat}": {
    "score": <0-100>,
    "summary": "<2-3 sentence executive summary>",
    "findings": [<Finding objects>]
  }`).join(',\n');

  return `Audit this codebase and return a JSON object with exactly this structure:

{
${jsonShape}
}

Each Finding object must have:
{
  "id": "CAT-NNN",
  "category": "<security|quality|performance|architecture|testing|documentation>",
  "severity": "<critical|high|medium|low|info>",
  "title": "<concise title>",
  "description": "<specific description with why it matters>",
  "file": "<relative path if applicable>",
  "line": <line number if applicable>,
  "snippet": "<relevant code snippet if applicable, max 100 chars>",
  "fix": "<specific, actionable fix with code example if possible>"
}

PROJECT INFO:
- Name: ${info.name}
- Languages: ${Object.entries(info.languages).map(([l, c]) => `${l} (${c} files)`).join(', ')}
- Frameworks: ${info.frameworks.join(', ') || 'None detected'}
- Total Files: ${info.totalFiles}
- Total Lines: ${info.totalLines}
- Has Tests: ${info.hasTests}
- Test Frameworks: ${info.testFrameworks.join(', ') || 'None'}
- Package Manager: ${info.packageManager ?? 'Unknown'}
- Dependencies: ${depsStr || 'None'}

CODEBASE:
${codeContext}

Focus on REAL issues you can see in the code. Do not hallucinate findings. If the code is clean, say so and give a high score.
Return at most 5 findings per category. Prioritize critical and high severity issues.`;
}

export async function analyzeWithClaude(
  files: ScannedFile[],
  info: ProjectInfo,
  apiKey: string,
  model: string,
  filterCategories?: AuditCategory[],
): Promise<CategoryScore[]> {
  const client = new Anthropic({ apiKey });
  const codeContext = buildCodeContext(files, MAX_CONTEXT_CHARS);

  const prompt = buildAuditPrompt(info, codeContext, filterCategories);

  let response: string;
  try {
    const message = await client.messages.create({
      model,
      max_tokens: 16384,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    if (message.stop_reason === 'max_tokens') {
      throw new Error('Response truncated — audit output exceeded token limit');
    }

    response = (message.content[0] as { type: string; text: string }).text;
  } catch (err: unknown) {
    throw new Error(`Claude API error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Parse JSON
  let parsed: AIAuditResponse;
  try {
    // Strip potential markdown fences
    const cleaned = response.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Failed to parse Claude response as JSON. Raw: ${response.slice(0, 200)}`);
  }

  const allCategoryOrder: AuditCategory[] = ['security', 'quality', 'performance', 'architecture', 'testing', 'documentation'];
  const categoryOrder = filterCategories ?? allCategoryOrder;

  return categoryOrder.map(cat => {
    const data = parsed[cat as keyof AIAuditResponse];
    if (!data) {
      return {
        category: cat,
        score: 50,
        grade: 'C' as const,
        findings: [],
        summary: 'Analysis unavailable.',
      };
    }

    const score = Math.max(0, Math.min(100, Math.round(data.score)));
    return {
      category: cat,
      score,
      grade: scoreToGrade(score),
      findings: (data.findings ?? []).map((f: Partial<Finding>, i: number) => ({
        id: f.id ?? `${cat.toUpperCase().slice(0, 3)}-AI-${i + 1}`,
        category: cat,
        severity: f.severity ?? 'medium',
        title: f.title ?? 'Untitled finding',
        description: f.description ?? '',
        file: f.file,
        line: f.line,
        snippet: f.snippet,
        fix: f.fix,
      })),
      summary: data.summary ?? '',
    };
  });
}

