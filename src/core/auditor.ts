// ─────────────────────────────────────────────
//  claude-audit — Main Auditor Orchestrator
// ─────────────────────────────────────────────

import { scoreToGrade } from './types';
import type { AuditReport, CategoryScore, AuditOptions, Finding, AuditCategory, AgentTrace } from './types';
import { scanProject } from './scanner';
import { analyzeSecrets } from '../analyzers/static/secrets';
import { analyzeDependencies } from '../analyzers/static/dependencies';
import { analyzeComplexity } from '../analyzers/static/complexity';
import { analyzeWithClaude, analyzeWithClaudeAgent } from '../analyzers/ai/claude-analyzer';
import type { AgentLoopHooks } from '../analyzers/ai/agent-loop';

export interface AuditHooks {
  /** Hooks forwarded into the agentic loop (turn start/end, tool calls, etc.). */
  agent?: AgentLoopHooks;
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version: VERSION } = require('../../package.json');

function mergeStaticIntoCategories(
  categories: CategoryScore[],
  staticFindings: Finding[],
): CategoryScore[] {
  const categoryMap = new Map(categories.map(c => [c.category, c]));

  for (const finding of staticFindings) {
    const cat = categoryMap.get(finding.category);
    if (cat) {
      cat.findings.push(finding);
      const penalty = finding.severity === 'critical' ? 15
        : finding.severity === 'high' ? 8
        : finding.severity === 'medium' ? 4
        : finding.severity === 'low' ? 2 : 0;
      cat.score = Math.max(0, cat.score - penalty);
      cat.grade = scoreToGrade(cat.score);
    } else {
      categoryMap.set(finding.category, {
        category: finding.category,
        score: 70,
        grade: 'C',
        findings: [finding],
        summary: 'Static analysis findings.',
      });
    }
  }

  return Array.from(categoryMap.values());
}

function buildStaticOnlyCategories(staticFindings: Finding[], filterCategories?: AuditCategory[]): CategoryScore[] {
  const allCategories: AuditCategory[] = ['security', 'quality', 'performance', 'architecture', 'dependencies', 'testing', 'documentation'];
  const categories = filterCategories ?? allCategories;
  const catFindings = new Map<AuditCategory, Finding[]>();
  categories.forEach(c => catFindings.set(c, []));

  for (const f of staticFindings) {
    catFindings.get(f.category)?.push(f);
  }

  return categories.map(cat => {
    const findings = catFindings.get(cat) ?? [];
    let score = 80;
    for (const f of findings) {
      score -= f.severity === 'critical' ? 20 : f.severity === 'high' ? 10 : f.severity === 'medium' ? 5 : 2;
    }
    score = Math.max(0, score);
    return { category: cat, score, grade: scoreToGrade(score), findings, summary: '' };
  });
}

export async function runAudit(
  options: AuditOptions,
  onProgress: (msg: string) => void,
  hooks: AuditHooks = {},
): Promise<AuditReport> {
  const startTime = Date.now();

  // ── 1. Scan files ─────────────────────────
  onProgress('Scanning project files...');
  const { files, info } = await scanProject(options.path, options.maxFiles, options.maxFileSize);

  // ── 2. Static analysis ────────────────────
  onProgress('Running static security analysis...');
  const secretFindings = analyzeSecrets(files);

  onProgress('Analyzing dependencies...');
  const depFindings = analyzeDependencies(info);

  onProgress('Checking code complexity & quality...');
  const complexityFindings = analyzeComplexity(files);

  const allStaticFindings = ([...secretFindings, ...depFindings, ...complexityFindings])
    .filter(f => !options.categories || options.categories.includes(f.category));

  // ── 3. AI analysis ────────────────────────
  let categories: CategoryScore[];
  let aiPowered = false;
  let agentic = false;
  let agentTrace: AgentTrace | undefined;
  const warnings: string[] = [];

  if (info.filesOverLimit) {
    warnings.push(
      `Only ${options.maxFiles} of ${options.maxFiles + info.filesOverLimit} files were scanned. ` +
      'Raise --max-files to cover the rest.',
    );
  }

  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;

  if (!options.noAi && apiKey) {
    if (options.agentic) {
      onProgress('Starting agentic audit (Claude will investigate via tools)...');
      try {
        const result = await analyzeWithClaudeAgent({
          projectRoot: options.path,
          info,
          staticFindings: allStaticFindings,
          apiKey,
          model: options.model,
          maxTurns: options.maxTurns,
          maxBudgetTokens: options.maxBudgetTokens,
          filterCategories: options.categories,
          files,
          hooks: {
            onProgress: (m) => {
              hooks.agent?.onProgress?.(m);
              onProgress(m);
            },
            onToolCall:    hooks.agent?.onToolCall,
            onTurnStart:   hooks.agent?.onTurnStart,
            onTurnEnd:     hooks.agent?.onTurnEnd,
            onApiResponse: hooks.agent?.onApiResponse,
            onFinish:      hooks.agent?.onFinish,
          },
        });
        agentTrace = result.trace;

        if (result.finalized) {
          categories = mergeStaticIntoCategories(result.categories, allStaticFindings);
          agentic = true;
          aiPowered = true;
        } else {
          // Nothing was submitted (API error, or the budget ran out), so there
          // is no AI verdict to show: report the static results and say why.
          const { stopReason, stopDetail } = result.trace.summary;
          warnings.push(
            `The AI audit did not finish (${stopReason}${stopDetail ? ': ' + stopDetail : ''}). ` +
            'This report contains static analysis only.',
          );
          categories = buildStaticOnlyCategories(allStaticFindings, options.categories);
        }
      } catch (err) {
        warnings.push(`The AI audit failed (${err instanceof Error ? err.message : 'unknown error'}). This report contains static analysis only.`);
        categories = buildStaticOnlyCategories(allStaticFindings, options.categories);
      }
    } else {
      onProgress('Sending codebase to Claude for one-shot analysis...');
      try {
        categories = await analyzeWithClaude(files, info, apiKey, options.model, options.categories);
        categories = mergeStaticIntoCategories(categories, allStaticFindings);
        aiPowered = true;
      } catch (err) {
        warnings.push(`The AI audit failed (${err instanceof Error ? err.message : 'unknown error'}). This report contains static analysis only.`);
        categories = buildStaticOnlyCategories(allStaticFindings, options.categories);
      }
    }
  } else {
    if (!options.quiet && !apiKey && !options.noAi) {
      onProgress('⚡ Running fast static analysis (15+ built-in rules)...');
      onProgress('💡 Tip: Set ANTHROPIC_API_KEY for deep AI-powered analysis → https://console.anthropic.com/keys');
    } else if (!options.quiet && options.noAi) {
      onProgress('⚡ Running static analysis (--static mode)...');
    }
    categories = buildStaticOnlyCategories(allStaticFindings, options.categories);
  }

  // Filter to requested categories
  if (options.categories) {
    categories = categories.filter(c => options.categories!.includes(c.category));
  }

  // ── 4. Compute overall score ───────────────
  const categoryWeights: Record<AuditCategory, number> = {
    security:      0.25,
    quality:       0.20,
    performance:   0.15,
    architecture:  0.15,
    dependencies:  0.10,
    testing:       0.10,
    documentation: 0.05,
  };

  let weightedSum = 0;
  let totalWeight = 0;
  for (const cat of categories) {
    const weight = categoryWeights[cat.category] ?? 0.1;
    weightedSum += cat.score * weight;
    totalWeight += weight;
  }

  const overallScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 50;
  const allFindings = categories.flatMap(c => c.findings);

  return {
    version: VERSION,
    timestamp: new Date().toISOString(),
    project: info,
    overallScore,
    overallGrade: scoreToGrade(overallScore),
    categories,
    allFindings,
    criticalCount: allFindings.filter(f => f.severity === 'critical').length,
    highCount: allFindings.filter(f => f.severity === 'high').length,
    mediumCount: allFindings.filter(f => f.severity === 'medium').length,
    lowCount: allFindings.filter(f => f.severity === 'low').length,
    aiPowered,
    agentic: agentic || undefined,
    agentTrace,
    warnings: warnings.length > 0 ? warnings : undefined,
    durationMs: Date.now() - startTime,
  };
}
