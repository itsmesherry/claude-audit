/* eslint-disable @typescript-eslint/no-explicit-any */
// runAudit with the Anthropic SDK mocked: what the report says when the AI step fails.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// What the mocked API does next: fail (the default), or return these messages in order.
const replies: any[] = [];

jest.mock('@anthropic-ai/sdk', () => {
  const next = (): any => {
    if (replies.length === 0) throw new Error('401 invalid x-api-key');
    return replies.shift();
  };
  class MockAnthropic {
    constructor(_opts: any) { void _opts; }
    messages = {
      stream: () => { const message = next(); return { finalMessage: async () => message }; },
      create: async () => next(),
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
    replies.length = 0;
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

describe('runAudit when the AI step succeeds', () => {
  let dir: string;
  beforeEach(() => {
    replies.length = 0;
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-audit-auditor-'));
    fs.writeFileSync(path.join(dir, 'config.js'), 'const password = "p@ssw0rd!Hunter#2";\n');
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { request: '2.88.0' } }));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const security = { score: 90, summary: 'Reviewed.', findings: [{ severity: 'low', title: 'AI finding', description: 'd' }] };
  const usage = { input_tokens: 10, output_tokens: 10 };

  it('merges static findings into the one-shot AI result', async () => {
    replies.push({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ security }) }], usage });

    const report = await runAudit(options(dir, { agentic: false }), () => undefined);

    expect(report.aiPowered).toBe(true);
    expect(report.warnings).toBeUndefined();
    const sec = report.categories.find(c => c.category === 'security')!;
    expect(sec.findings.map(f => f.title)).toEqual(expect.arrayContaining(['AI finding', 'Hardcoded Secret / Password']));
    expect(sec.score).toBeLessThan(90);
    // Static findings in a category the model did not return are kept
    expect(report.categories.find(c => c.category === 'dependencies')?.findings.length).toBeGreaterThan(0);
  });

  it('reports an agentic audit that called finalize_audit', async () => {
    replies.push({
      stop_reason: 'tool_use', usage,
      content: [{ type: 'tool_use', id: 'tu_1', name: 'finalize_audit', input: { security } }],
    });

    const report = await runAudit(options(dir, { categories: ['security'] }), () => undefined);

    expect(report).toMatchObject({ aiPowered: true, agentic: true });
    expect(report.agentTrace?.summary.stopReason).toBe('completed');
    expect(report.categories.map(c => c.category)).toEqual(['security']);
    expect(report.criticalCount).toBeGreaterThan(0);
  });

  it('says which mode it is running in when there is no API key', async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const messages: string[] = [];
    try {
      await runAudit(options(dir, { apiKey: undefined, quiet: false }), m => messages.push(m));
      await runAudit(options(dir, { noAi: true, quiet: false }), m => messages.push(m));
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    }

    expect(messages.join('\n')).toMatch(/Set ANTHROPIC_API_KEY/);
    expect(messages.join('\n')).toMatch(/--static mode/);
  });
});
