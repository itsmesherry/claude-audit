// ─────────────────────────────────────────────
//  claude-audit — Normalising model output
// ─────────────────────────────────────────────
//
// What the model returns is untrusted input: it may be shaped wrongly, and a
// hostile repository can steer it. Only well-typed fields get into a report.

import type { Finding, AuditCategory, AuditCoverage, DismissedFinding, Severity } from '../../core/types';
import { maskSnippet, maskTokens } from '../static/secrets';

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
const CONFIDENCES = ['high', 'medium', 'low'] as const;

/** Coerce a score to an integer in 0–100, or use the fallback. */
export function normalizeScore(score: unknown, fallback: number): number {
  return typeof score === 'number' && Number.isFinite(score)
    ? Math.max(0, Math.min(100, Math.round(score)))
    : fallback;
}

// The model may quote a credential it read in the project
function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? maskTokens(value) : undefined;
}

/** Keep the well-typed fields of a finding and default the rest. */
export function normalizeFinding(raw: unknown, category: AuditCategory, fallbackId: string): Finding {
  const f = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const severity = String(f['severity'] ?? '').toLowerCase() as Severity;
  // Models sometimes send the line number as a string
  const line = typeof f['line'] === 'string' && /^\d+$/.test(f['line']) ? Number(f['line']) : f['line'];

  return {
    id: text(f['id']) ?? fallbackId,
    category,
    severity: SEVERITIES.includes(severity) ? severity : 'medium',
    title: text(f['title']) ?? 'Untitled finding',
    description: text(f['description']) ?? '',
    file: text(f['file']),
    line: typeof line === 'number' && Number.isInteger(line) && line > 0 ? line : undefined,
    snippet: typeof f['snippet'] === 'string' && f['snippet'] ? maskSnippet(f['snippet']) : undefined,
    fix: text(f['fix']),
    cwe: typeof f['cwe'] === 'string' && /^CWE-\d+$/i.test(f['cwe'].trim()) ? f['cwe'].trim().toUpperCase() : undefined,
    confidence: CONFIDENCES.find(c => c === String(f['confidence'] ?? '').toLowerCase()),
  };
}

/** Normalise a findings array; anything that is not an array becomes empty. */
export function normalizeFindings(raw: unknown, category: AuditCategory, idPrefix: string): Finding[] {
  return Array.isArray(raw)
    ? raw.map((f, i) => normalizeFinding(f, category, `${idPrefix}-${i + 1}`))
    : [];
}

/**
 * Resolve the model's dismissals to the static findings they name. A bad ref
 * or an empty reason is dropped. Critical findings stay: a hostile repository
 * could ask the model to dismiss the finding that would fail the CI run.
 */
export function normalizeDismissals(raw: unknown, staticFindings: Finding[]): DismissedFinding[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<Finding>();
  const out: DismissedFinding[] = [];
  for (const item of raw) {
    const d = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const finding = typeof d['ref'] === 'number' && Number.isInteger(d['ref']) ? staticFindings[d['ref'] - 1] : undefined;
    const reason = text(d['reason']);
    if (!finding || !reason || finding.severity === 'critical' || seen.has(finding)) continue;
    seen.add(finding);
    out.push({ finding, reason });
  }
  return out;
}

export function normalizeCoverage(raw: unknown): AuditCoverage | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const c = raw as Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? v.map(text).filter((s): s is string => !!s) : []);
  const coverage = { checked: list(c['checked']), notChecked: list(c['not_checked']) };
  return coverage.checked.length || coverage.notChecked.length ? coverage : undefined;
}
