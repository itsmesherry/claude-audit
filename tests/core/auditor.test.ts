/* eslint-disable @typescript-eslint/no-explicit-any */
// runAudit with the Anthropic SDK mocked: what the report says when the AI step fails.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    constructor(_opts: any) { void _opts; }
    messages = {
      stream: () => { throw new Error('401 invalid x-api-key'); },
      create: async () => { throw new Error('401 invalid x-api-key'); },
    };
  }
  return { __esModule: true, default: MockAnthropic };
});

import { runAudit } from '../../src/core/auditor';
import type { AuditOptions } from '../../src/core/types';

function options(dir: string, overrides: Partial<AuditOptions> = {}): AuditOptions {
  return {
    path: dir, apiKey: 'bad-key', output: ['json'], maxFileSize: 100, maxFiles: 500,
    model: 'model', noAi: false, quiet: true, agentic: true, maxTurns: 3,
    maxBudgetTokens: 1000, trace: false, ...overrides,
  };
}

describe('runAudit when the AI step fails', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-audit-auditor-'));
    fs.writeFileSync(path.join(dir, 'index.js'), 'export const add = (a, b) => a + b;\n');
    fs.writeFileSync(path.join(dir, 'other.js'), 'export const sub = (a, b) => a - b;\n');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it.each([true, false])('reports static results, not placeholder AI scores (agentic=%s)', async (agentic) => {
    const report = await runAudit(options(dir, { agentic }), () => undefined);

    expect(report.aiPowered).toBe(false);
    expect(report.agentic).toBeUndefined();
    expect(report.warnings?.[0]).toMatch(/static analysis only/);
    // Same scores as a run with no API key at all
    const staticReport = await runAudit(options(dir, { noAi: true }), () => undefined);
    expect(report.overallScore).toBe(staticReport.overallScore);
    expect(staticReport.warnings).toBeUndefined();
  });

  it('keeps the agent trace so the failure can be inspected', async () => {
    const report = await runAudit(options(dir), () => undefined);

    expect(report.agentTrace?.summary.stopReason).toBe('error');
  });

  it('warns when the project has more files than --max-files', async () => {
    const report = await runAudit(options(dir, { noAi: true, maxFiles: 1 }), () => undefined);

    expect(report.project.filesOverLimit).toBe(1);
    expect(report.warnings).toEqual(['Only 1 of 2 files were scanned. Raise --max-files to cover the rest.']);
  });
});
