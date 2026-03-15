// ─────────────────────────────────────────────
//  claude-audit — Terminal Reporter
// ─────────────────────────────────────────────

import chalk from 'chalk';
import boxen from 'boxen';
import type { AuditReport, Finding, CategoryScore, Severity, AuditCategory } from '../core/types';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version: VERSION } = require('../../package.json');

const CATEGORY_ICONS: Record<AuditCategory, string> = {
  security:      '🔒',
  quality:       '📊',
  performance:   '⚡',
  architecture:  '🏗️ ',
  dependencies:  '📦',
  testing:       '🧪',
  documentation: '📚',
};

const SEVERITY_COLOR: Record<Severity, chalk.Chalk> = {
  critical: chalk.bgRed.white.bold,
  high:     chalk.red.bold,
  medium:   chalk.yellow.bold,
  low:      chalk.cyan,
  info:     chalk.gray,
};

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: ' CRITICAL ',
  high:     '  HIGH    ',
  medium:   '  MEDIUM  ',
  low:      '   LOW    ',
  info:     '   INFO   ',
};

const GRADE_COLOR: Record<string, chalk.Chalk> = {
  A: chalk.greenBright.bold,
  B: chalk.green.bold,
  C: chalk.yellow.bold,
  D: chalk.red,
  F: chalk.bgRed.white.bold,
};

function scoreBar(score: number, width = 20): string {
  const filled = Math.round((score / 100) * width);
  const empty = width - filled;
  const color = score >= 80 ? chalk.green : score >= 60 ? chalk.yellow : chalk.red;
  return color('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

export function printBanner(): void {
  const banner = [
    chalk.cyan.bold('   ██████╗██╗      █████╗ ██╗   ██╗██████╗ ███████╗'),
    chalk.cyan.bold('  ██╔════╝██║     ██╔══██╗██║   ██║██╔══██╗██╔════╝'),
    chalk.cyan.bold('  ██║     ██║     ███████║██║   ██║██║  ██║█████╗  '),
    chalk.cyan.bold('  ██║     ██║     ██╔══██║██║   ██║██║  ██║██╔══╝  '),
    chalk.cyan.bold('  ╚██████╗███████╗██║  ██║╚██████╔╝██████╔╝███████╗'),
    chalk.cyan.bold('   ╚═════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝╚══════╝'),
    '',
    chalk.white.bold('         ██████╗ ██╗   ██╗██████╗ ██╗████████╗'),
    chalk.white.bold('         ██╔══██╗██║   ██║██╔══██╗██║╚══██╔══╝'),
    chalk.white.bold('         ███████║██║   ██║██║  ██║██║   ██║   '),
    chalk.white.bold('         ██╔══██║██║   ██║██║  ██║██║   ██║   '),
    chalk.white.bold('         ██║  ██║╚██████╔╝██████╔╝██║   ██║   '),
    chalk.white.bold('         ╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚═╝   ╚═╝   '),
    '',
    chalk.gray(`     AI-Powered Codebase Auditor  ·  v${VERSION}`),
    chalk.gray('     github.com/itsmesherry/claude-audit'),
  ].join('\n');

  console.log(
    boxen(banner, {
      padding: 1,
      borderStyle: 'double',
      borderColor: 'cyan',
    }),
  );
  console.log();
}

export function printReport(report: AuditReport): void {
  const { project, overallScore, overallGrade, categories, allFindings } = report;

  // ── Header ────────────────────────────────────────────
  const gradeColor = GRADE_COLOR[overallGrade] ?? chalk.white;
  const scoreColor = overallScore >= 80 ? chalk.greenBright : overallScore >= 60 ? chalk.yellow : chalk.red;

  const headerContent = [
    chalk.white.bold(`  Project: ${chalk.cyan(project.name)}`),
    chalk.white(`  Path:    ${chalk.gray(project.path)}`),
    chalk.white(`  Scanned: ${chalk.cyan(project.totalFiles + ' files')} · ${chalk.cyan(project.totalLines.toLocaleString() + ' lines')}`),
    chalk.white(`  Stack:   ${chalk.cyan(Object.keys(project.languages).join(', ') || 'Unknown')}`),
    project.frameworks.length > 0
      ? chalk.white(`  Frameworks: ${chalk.cyan(project.frameworks.join(', '))}`)
      : '',
    '',
    chalk.white('  ┌────────────────────────────────────┐'),
    chalk.white('  │') +
      '   OVERALL SCORE: ' + scoreColor.bold(overallScore + '/100') +
      '  Grade: ' + gradeColor(overallGrade) +
      chalk.white('   │'),
    chalk.white('  └────────────────────────────────────┘'),
    '',
    chalk.white('  ') + (report.aiPowered
      ? chalk.greenBright('✦ AI-Powered Analysis (Claude)')
      : chalk.yellow('⚡ Static Analysis Mode')),
    chalk.white('  ') + chalk.gray(`Duration: ${formatDuration(report.durationMs)} · ${new Date(report.timestamp).toLocaleString()}`),
  ].filter(l => l !== '').join('\n');

  console.log(boxen(headerContent, {
    padding: { top: 0, bottom: 0, left: 1, right: 2 },
    borderStyle: 'round',
    borderColor: overallScore >= 80 ? 'green' : overallScore >= 60 ? 'yellow' : 'red',
    title: ' AUDIT REPORT ',
    titleAlignment: 'center',
  }));

  console.log();

  // ── Category Scores ───────────────────────────────────
  console.log(chalk.white.bold(' CATEGORY SCORES\n'));

  for (const cat of categories) {
    const icon = CATEGORY_ICONS[cat.category] ?? '  ';
    const grade = GRADE_COLOR[cat.grade]?.(` ${cat.grade} `) ?? ` ${cat.grade} `;
    const bar = scoreBar(cat.score);
    const scoreStr = cat.score >= 80
      ? chalk.green(`${cat.score}/100`)
      : cat.score >= 60
      ? chalk.yellow(`${cat.score}/100`)
      : chalk.red(`${cat.score}/100`);

    const issueCount = cat.findings.length;
    const issueStr = issueCount > 0
      ? chalk.gray(` · ${issueCount} issue${issueCount === 1 ? '' : 's'}`)
      : chalk.gray(' · Clean');

    const label = (cat.category.charAt(0).toUpperCase() + cat.category.slice(1)).padEnd(14);
    console.log(
      `  ${icon}  ${chalk.white.bold(label)}  ${bar}  ${scoreStr}  ${grade}${issueStr}`,
    );
  }

  // ── Summary Stats ─────────────────────────────────────
  console.log();
  console.log(chalk.white.bold(' FINDINGS SUMMARY\n'));

  const stats = [
    { label: '🔴 Critical', count: report.criticalCount, color: chalk.red.bold },
    { label: '🟠 High',     count: report.highCount,     color: chalk.red },
    { label: '🟡 Medium',   count: report.mediumCount,   color: chalk.yellow },
    { label: '🔵 Low',      count: report.lowCount,      color: chalk.cyan },
  ];

  const statLine = stats
    .map(s => `  ${s.label}: ${s.color(String(s.count))}`)
    .join('   ');
  console.log(statLine);

  // ── Findings ──────────────────────────────────────────
  if (allFindings.length === 0) {
    console.log();
    console.log(chalk.greenBright.bold('  ✓ No issues found! Excellent codebase.'));
  } else {
    const grouped = groupBySeverity(allFindings);

    for (const [severity, findings] of grouped) {
      if (findings.length === 0) continue;
      const label = SEVERITY_LABEL[severity];
      const color = SEVERITY_COLOR[severity] ?? chalk.white;
      const icon = severity === 'critical' ? '🚨' : severity === 'high' ? '⚠️ ' : severity === 'medium' ? '📋' : '💡';

      console.log();
      console.log(`\n  ${icon}  ${color(label)}  ${chalk.bold(severity.toUpperCase() + ' ISSUES')} (${findings.length})`);
      console.log(chalk.gray('  ' + '─'.repeat(70)));

      for (const finding of findings.slice(0, 20)) { // max 20 shown per severity
        printFinding(finding);
      }

      if (findings.length > 20) {
        console.log(chalk.gray(`  ... and ${findings.length - 20} more. See full report in audit-report.md`));
      }
    }
  }

  // ── Category AI Summaries ─────────────────────────────
  const summaries = categories.filter(c => c.summary && c.summary.length > 10);
  if (summaries.length > 0) {
    console.log();
    console.log(chalk.white.bold('\n  AI INSIGHTS\n'));
    for (const cat of summaries) {
      const icon = CATEGORY_ICONS[cat.category] ?? '';
      console.log(`  ${icon}  ${chalk.bold(cat.category.toUpperCase())}`);
      console.log(`  ${chalk.gray(cat.summary)}`);
      console.log();
    }
  }

  // ── Footer ────────────────────────────────────────────
  console.log(chalk.gray('  ' + '─'.repeat(70)));
  console.log();

  if (report.criticalCount > 0) {
    console.log(chalk.red.bold('  ⛔ ' + report.criticalCount + ' CRITICAL issue(s) require immediate attention!'));
  } else if (overallScore >= 90) {
    console.log(chalk.greenBright.bold('  🎉 Excellent! Your codebase is in great shape.'));
  } else if (overallScore >= 70) {
    console.log(chalk.yellow.bold('  👍 Good codebase. Address the flagged issues to level up.'));
  } else {
    console.log(chalk.red.bold('  🛠  Significant work needed. Start with critical and high severity issues.'));
  }
  console.log();
}

function printFinding(f: Finding): void {
  const severity = SEVERITY_COLOR[f.severity] ?? chalk.white;
  const icon = CATEGORY_ICONS[f.category] ?? '';
  console.log();
  console.log(`    ${icon} ${chalk.white.bold(f.title)}`);
  console.log(`    ${chalk.gray(truncate(f.description, 100))}`);

  if (f.file) {
    const loc = f.line ? `${f.file}:${f.line}` : f.file;
    console.log(`    ${chalk.dim('File:')} ${chalk.cyan(loc)}`);
  }

  if (f.snippet) {
    console.log(`    ${chalk.dim('Code:')} ${chalk.gray.italic(truncate(f.snippet, 90))}`);
  }

  if (f.fix) {
    console.log(`    ${chalk.dim('Fix: ')} ${chalk.greenBright(truncate(f.fix, 100))}`);
  }
}

function groupBySeverity(findings: Finding[]): Map<Severity, Finding[]> {
  const order: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
  const map = new Map<Severity, Finding[]>();
  for (const sev of order) map.set(sev, []);
  for (const f of findings) {
    map.get(f.severity)?.push(f);
  }
  return map;
}
