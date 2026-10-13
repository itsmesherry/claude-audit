// ─────────────────────────────────────────────
//  claude-audit — Terminal Reporter
// ─────────────────────────────────────────────

import chalk from 'chalk';
import path from 'path';
import type { AuditReport, Finding, Severity } from '../core/types';

// Warm amber palette, shared with the live agent log
const amber = chalk.hex('#E8A87C');
const coral = chalk.hex('#D97757');
const ember = chalk.hex('#C44536');
const dim = chalk.hex('#A67B5B');

const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
const SEVERITY_COLOR: Record<Severity, chalk.Chalk> = {
  critical: chalk.bgHex('#C44536').hex('#FFF5EC').bold,
  high:     ember.bold,
  medium:   coral.bold,
  low:      amber,
  info:     dim,
};
const MAX_SHOWN_PER_SEVERITY = 20;

function scoreColor(score: number): chalk.Chalk {
  return score >= 80 ? amber : score >= 60 ? coral : ember;
}

function scoreBar(score: number, width = 20): string {
  const filled = Math.round((score / 100) * width);
  return scoreColor(score)('█'.repeat(filled)) + dim('░'.repeat(width - filled));
}

function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function printReport(report: AuditReport): void {
  const { project, categories, allFindings } = report;

  // ── Header ────────────────────────────────────────────
  const relative = path.relative(process.cwd(), project.path) || '.';
  const stack = [...Object.keys(project.languages), ...project.frameworks].join(', ');
  const mode = report.agentic ? 'agentic audit'
    : report.aiPowered ? 'one-shot AI audit'
    : 'static analysis only';

  console.log();
  console.log(`  ${amber.bold(project.name)}  ${dim(relative.startsWith('..') ? project.path : relative)}`);
  console.log(dim(`  ${plural(project.totalFiles, 'file')}, ${project.totalLines.toLocaleString()} lines${stack ? ' · ' + stack : ''} · ${mode}`));

  // ── Findings ──────────────────────────────────────────
  for (const severity of SEVERITY_ORDER) {
    const findings = allFindings.filter(f => f.severity === severity);
    for (const finding of findings.slice(0, MAX_SHOWN_PER_SEVERITY)) {
      printFinding(finding);
    }
    if (findings.length > MAX_SHOWN_PER_SEVERITY) {
      console.log();
      console.log(dim(`  … and ${findings.length - MAX_SHOWN_PER_SEVERITY} more ${severity} findings in the report files`));
    }
  }

  // ── Scores ────────────────────────────────────────────
  console.log();
  for (const cat of categories) {
    const name = (cat.category.charAt(0).toUpperCase() + cat.category.slice(1)).padEnd(14);
    const count = cat.findings.length > 0 ? dim(`  ${plural(cat.findings.length, 'finding')}`) : '';
    console.log(`  ${name} ${scoreBar(cat.score)}  ${scoreColor(cat.score)(String(cat.score).padStart(3))}  ${cat.grade}${count}`);
    if (cat.summary) {
      console.log(dim(`  ${' '.repeat(14)} ${cat.summary}`));
    }
  }

  // ── Agent run ─────────────────────────────────────────
  if (report.agentTrace) {
    const s = report.agentTrace.summary;
    console.log();
    console.log(dim(
      `  ${report.agentTrace.model} · ${s.turns}/${report.agentTrace.maxTurns} turns · ${plural(s.toolCalls, 'tool call')} · ` +
      `${(s.inputTokens + s.outputTokens + s.cacheReadTokens).toLocaleString()} tokens · stopped: ${s.stopReason}`,
    ));
  }

  // ── Summary ───────────────────────────────────────────
  const counts = [
    `${report.criticalCount} critical`,
    `${report.highCount} high`,
    `${report.mediumCount} medium`,
    `${report.lowCount} low`,
  ].join(', ');
  console.log();
  console.log(
    `  ${chalk.bold('Score')} ${scoreColor(report.overallScore).bold(`${report.overallScore}/100`)} ${chalk.bold(`(${report.overallGrade})`)}` +
    dim(`  ${allFindings.length === 0 ? 'no findings' : counts} · ${formatDuration(report.durationMs)}`),
  );
  console.log();
}

function printFinding(f: Finding): void {
  const label = SEVERITY_COLOR[f.severity](` ${f.severity.toUpperCase()} `.padEnd(10));
  const location = f.file ? dim(f.line ? `${f.file}:${f.line}` : f.file) : '';
  const indent = ' '.repeat(13);

  console.log();
  console.log(`  ${label} ${chalk.bold(f.title)}${location ? '  ' + location : ''}`);
  // Static secret findings carry a description that only repeats the title
  if (f.description && f.description !== `Potential ${f.title} found in source code.`) {
    console.log(`${indent}${f.description}`);
  }
  if (f.snippet) {
    console.log(dim(`${indent}${f.snippet}`));
  }
  if (f.fix) {
    console.log(`${indent}${amber('fix:')} ${f.fix}`);
  }
}
