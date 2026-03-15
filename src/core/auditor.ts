// ─────────────────────────────────────────────
//  claude-audit — Main Auditor Orchestrator
// ─────────────────────────────────────────────

import { scoreToGrade } from './types';
import type { AuditReport, CategoryScore, AuditOptions, Finding, AuditCategory } from './types';
import { scanProject } from './scanner';
import { analyzeSecrets } from '../analyzers/static/secrets';
import { analyzeDependencies } from '../analyzers/static/dependencies';
import { analyzeComplexity } from '../analyzers/static/complexity';
import { analyzeWithClaude } from '../analyzers/ai/claude-analyzer';

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

  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;

  if (!options.noAi && apiKey) {
    onProgress('Sending codebase to Claude for deep analysis...');
    try {
      categories = await analyzeWithClaude(files, info, apiKey, options.model, options.categories);
      categories = mergeStaticIntoCategories(categories, allStaticFindings);
      aiPowered = true;

      // Ensure dependencies category exists if we have dep findings
      if (depFindings.length > 0 && !categories.find(c => c.category === 'dependencies')) {
        const depScore = Math.max(0, 80 - depFindings.length * 8);
        categories.push({
          category: 'dependencies',
          score: depScore,
          grade: scoreToGrade(depScore),
          findings: depFindings,
          summary: `${depFindings.length} dependency issue(s) found.`,
        });
      }
    } catch (err) {
      onProgress(`⚠ AI analysis failed (${err instanceof Error ? err.message : 'unknown error'}). Falling back to static analysis only.`);
      categories = buildStaticOnlyCategories(allStaticFindings, options.categories);
    }
  } else {
    if (!options.quiet && !apiKey) {
      onProgress('ℹ No ANTHROPIC_API_KEY found — running static analysis only. Set your key for AI-powered insights.');
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
    durationMs: Date.now() - startTime,
  };
}
