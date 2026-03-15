// ─────────────────────────────────────────────
//  claude-audit — JSON Reporter
// ─────────────────────────────────────────────

import fs from 'fs';
import type { AuditReport } from '../core/types';

export function generateJsonReport(report: AuditReport, outputPath: string): void {
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf-8');
}
