// ─────────────────────────────────────────────
//  claude-audit — Normalising model output
// ─────────────────────────────────────────────
//
// What the model returns is untrusted input: it may be shaped wrongly, and a
// hostile repository can steer it. Only well-typed fields get into a report.

import type { Finding, AuditCategory, Severity } from '../../core/types';
import { maskSnippet, maskTokens } from '../static/secrets';

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

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
  };
}

/** Normalise a findings array; anything that is not an array becomes empty. */
export function normalizeFindings(raw: unknown, category: AuditCategory, idPrefix: string): Finding[] {
  return Array.isArray(raw)
    ? raw.map((f, i) => normalizeFinding(f, category, `${idPrefix}-${i + 1}`))
    : [];
}
