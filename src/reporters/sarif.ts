// ─────────────────────────────────────────────
//  claude-audit — SARIF Reporter
// ─────────────────────────────────────────────
//
// SARIF 2.1.0, the format GitHub code scanning imports. One rule per CWE (or
// per title when there is none), so a static match and an AI finding for the
// same weakness share a rule.

import fs from 'fs';
import path from 'path';
import type { AuditReport, Finding, Severity } from '../core/types';

const LEVEL: Record<Severity, 'error' | 'warning' | 'note'> = {
  critical: 'error',
  high: 'error',
  medium: 'warning',
  low: 'note',
  info: 'note',
};

// GitHub maps this score to its own critical/high/medium/low for security rules
const SECURITY_SEVERITY: Partial<Record<Severity, string>> = {
  critical: '9.5',
  high: '7.5',
  medium: '5.0',
  low: '2.0',
};

function ruleId(f: Finding): string {
  const slug = f.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${f.category}/${f.cwe ?? slug}`;
}

// Code scanning resolves paths against the repository root, which is the
// working directory in CI; fall back to project-relative paths elsewhere
function uri(report: AuditReport, file: string): string {
  const fromCwd = path.relative(process.cwd(), path.resolve(report.project.path, file));
  return (fromCwd.startsWith('..') || path.isAbsolute(fromCwd) ? file : fromCwd).split(path.sep).join('/');
}

export function buildSarif(report: AuditReport): object {
  const rules = new Map<string, object>();
  const results: object[] = [];

  for (const f of report.allFindings) {
    // ponytail: code scanning needs a location, so project-wide findings
    // ("no tests", "no README") stay in the other reports only
    const file = f.file ?? (f.category === 'dependencies' ? report.project.dependencyFile : undefined);
    if (!file) continue;

    const id = ruleId(f);
    if (!rules.has(id)) {
      const severity = f.category === 'security' ? SECURITY_SEVERITY[f.severity] : undefined;
      rules.set(id, {
        id,
        name: f.title,
        shortDescription: { text: f.title },
        properties: {
          tags: [f.category, ...(f.cwe ? [`external/cwe/${f.cwe.toLowerCase()}`] : [])],
          ...(severity ? { 'security-severity': severity } : {}),
        },
      });
    }

    results.push({
      ruleId: id,
      level: LEVEL[f.severity],
      message: { text: [f.title, f.description, f.fix && `Fix: ${f.fix}`].filter(Boolean).join('\n\n') },
      locations: [{
        physicalLocation: {
          artifactLocation: { uri: uri(report, file) },
          ...(f.line ? { region: { startLine: f.line } } : {}),
        },
      }],
      ...(f.confidence ? { properties: { confidence: f.confidence } } : {}),
    });
  }

  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [{
      tool: {
        driver: {
          name: 'claude-audit',
          version: report.version,
          informationUri: 'https://github.com/itsmesherry/claude-audit',
          rules: [...rules.values()],
        },
      },
      results,
    }],
  };
}

export function generateSarifReport(report: AuditReport, outputPath: string): void {
  fs.writeFileSync(outputPath, JSON.stringify(buildSarif(report), null, 2), 'utf-8');
}
