/* eslint-disable @typescript-eslint/no-explicit-any */
// One-shot analysis with the Anthropic SDK mocked at module level.

let nextMessage: any;

jest.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    constructor(_opts: any) { void _opts; }
    messages = { create: async () => nextMessage };
  }
  return { __esModule: true, default: MockAnthropic };
});

import { analyzeWithClaude } from '../../../src/analyzers/ai/claude-analyzer';
import type { ProjectInfo } from '../../../src/core/types';

const info: ProjectInfo = {
  name: 'p', path: '/p', languages: {}, frameworks: [], totalFiles: 0, totalLines: 0,
  hasTests: false, hasDependencyFile: false, dependencies: {}, testFrameworks: [],
};

const audit = (security: unknown): string => JSON.stringify({ security });

describe('analyzeWithClaude', () => {
  it('reads the text block even when a thinking block comes first', async () => {
    nextMessage = {
      stop_reason: 'end_turn',
      content: [
        { type: 'thinking', thinking: '' },
        { type: 'text', text: audit({ score: 90, summary: 'Fine.', findings: [] }) },
      ],
    };

    const [security] = await analyzeWithClaude([], info, 'key', 'model', ['security']);

    expect(security).toMatchObject({ score: 90, grade: 'A', summary: 'Fine.' });
  });

  it('normalises malformed scores, severities and line numbers', async () => {
    nextMessage = {
      stop_reason: 'end_turn',
      content: [{
        type: 'text',
        text: audit({ summary: 's', findings: [{ severity: 'HIGH', title: 't', description: 'd', line: 'x' }] }),
      }],
    };

    const [security] = await analyzeWithClaude([], info, 'key', 'model', ['security']);

    expect(security.score).toBe(50);
    expect(security.findings[0]).toMatchObject({ severity: 'high', line: undefined });
  });

  it('fails clearly when the reply has no text or is cut off', async () => {
    nextMessage = { stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }] };
    await expect(analyzeWithClaude([], info, 'key', 'model')).rejects.toThrow('no text');

    nextMessage = { stop_reason: 'max_tokens', content: [{ type: 'text', text: '{' }] };
    await expect(analyzeWithClaude([], info, 'key', 'model')).rejects.toThrow('truncated');
  });
});
