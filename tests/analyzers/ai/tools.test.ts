import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  safeResolve,
  TOOL_EXECUTORS,
  buildToolDefinitions,
  type ToolContext,
  type FinalAuditPayload,
} from '../../../src/analyzers/ai/tools';
import type { ProjectInfo, Finding } from '../../../src/core/types';

function makeCtx(root: string, overrides: Partial<ToolContext> = {}): ToolContext {
  const info: ProjectInfo = {
    name: 'fixture',
    path: root,
    languages: { TypeScript: 1 },
    frameworks: [],
    totalFiles: 1,
    totalLines: 10,
    hasTests: false,
    hasDependencyFile: true,
    dependencyFile: 'package.json',
    dependencies: { lodash: '1.0.0' },
    testFrameworks: [],
    packageManager: 'npm',
  };
  return {
    projectRoot: root,
    projectInfo: info,
    staticFindings: [],
    onFinalize: () => undefined,
    ...overrides,
  };
}

describe('safeResolve — path sandbox', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-audit-sandbox-'));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('resolves a relative path inside the root', () => {
    fs.writeFileSync(path.join(root, 'a.txt'), 'hi');
    const resolved = safeResolve(root, 'a.txt');
    expect(resolved).toBe(path.resolve(root, 'a.txt'));
  });

  it('rejects traversal with ..', () => {
    expect(safeResolve(root, '../../../etc/passwd')).toBeNull();
  });

  it('rejects absolute paths outside the root', () => {
    expect(safeResolve(root, '/etc/passwd')).toBeNull();
  });

  it('rejects a symlink that points outside the root', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-audit-outside-'));
    fs.writeFileSync(path.join(outside, 'secret.txt'), 'secret');
    fs.symlinkSync(path.join(outside, 'secret.txt'), path.join(root, 'link.txt'));
    fs.symlinkSync(outside, path.join(root, 'linked-dir'));

    expect(safeResolve(root, 'link.txt')).toBeNull();
    expect(safeResolve(root, 'linked-dir/secret.txt')).toBeNull();
    fs.rmSync(outside, { recursive: true, force: true });
  });

  it('accepts a symlink that stays inside the root, and names starting with two dots', () => {
    fs.writeFileSync(path.join(root, 'real.txt'), 'hi');
    fs.symlinkSync(path.join(root, 'real.txt'), path.join(root, 'alias.txt'));
    fs.writeFileSync(path.join(root, '..notes.txt'), 'hi');

    expect(safeResolve(root, 'alias.txt')).toBe(path.join(root, 'alias.txt'));
    expect(safeResolve(root, '..notes.txt')).toBe(path.join(root, '..notes.txt'));
  });

  it('accepts absolute paths inside the root', () => {
    fs.writeFileSync(path.join(root, 'b.txt'), 'hi');
    expect(safeResolve(root, path.join(root, 'b.txt'))).toBe(path.join(root, 'b.txt'));
  });

  it('rejects null-byte smuggling', () => {
    expect(safeResolve(root, 'ok.txt\0/../etc/passwd')).toBeNull();
  });

  it('rejects empty / non-string input', () => {
    expect(safeResolve(root, '')).toBeNull();
    // @ts-expect-error testing runtime guard
    expect(safeResolve(root, 123)).toBeNull();
  });
});

describe('TOOL_EXECUTORS', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-audit-tools-'));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  describe('list_files', () => {
    it('lists files matching a glob', async () => {
      fs.mkdirSync(path.join(root, 'src'));
      fs.writeFileSync(path.join(root, 'src/app.ts'), '1');
      fs.writeFileSync(path.join(root, 'src/lib.ts'), '1');
      fs.writeFileSync(path.join(root, 'readme.md'), '1');
      const ctx = makeCtx(root);
      const res = await TOOL_EXECUTORS.list_files(ctx, { pattern: 'src/**/*.ts' });
      expect(res.isError).toBe(false);
      expect(res.content).toContain('src/app.ts');
      expect(res.content).toContain('src/lib.ts');
      expect(res.content).not.toContain('readme.md');
    });

    it('excludes node_modules by default', async () => {
      fs.mkdirSync(path.join(root, 'node_modules/foo'), { recursive: true });
      fs.writeFileSync(path.join(root, 'node_modules/foo/index.js'), '1');
      fs.writeFileSync(path.join(root, 'app.ts'), '1');
      const ctx = makeCtx(root);
      const res = await TOOL_EXECUTORS.list_files(ctx, {});
      expect(res.content).not.toContain('node_modules');
      expect(res.content).toContain('app.ts');
    });
  });

  describe('read_file', () => {
    it('returns numbered lines', async () => {
      fs.writeFileSync(path.join(root, 'a.ts'), 'const x = 1;\nconst y = 2;\n');
      const ctx = makeCtx(root);
      const res = await TOOL_EXECUTORS.read_file(ctx, { path: 'a.ts' });
      expect(res.isError).toBe(false);
      expect(res.content).toContain('const x = 1;');
      expect(res.content).toMatch(/ {4}1\| const x/);
    });

    it('respects line range', async () => {
      const lines = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join('\n');
      fs.writeFileSync(path.join(root, 'a.ts'), lines);
      const ctx = makeCtx(root);
      const res = await TOOL_EXECUTORS.read_file(ctx, { path: 'a.ts', start_line: 3, end_line: 5 });
      expect(res.content).toContain('line 3');
      expect(res.content).toContain('line 5');
      expect(res.content).not.toContain('line 2');
      expect(res.content).not.toContain('line 6');
    });

    it('refuses to read outside the project root', async () => {
      const ctx = makeCtx(root);
      const res = await TOOL_EXECUTORS.read_file(ctx, { path: '../../../etc/passwd' });
      expect(res.isError).toBe(true);
      expect(res.content).toMatch(/outside project root/i);
    });

    it('refuses files larger than the cap', async () => {
      const big = 'x'.repeat(300 * 1024);
      fs.writeFileSync(path.join(root, 'big.ts'), big);
      const ctx = makeCtx(root);
      const res = await TOOL_EXECUTORS.read_file(ctx, { path: 'big.ts' });
      expect(res.isError).toBe(true);
      expect(res.content).toMatch(/start_line\/end_line/);
    });

    it('requires a path argument', async () => {
      const ctx = makeCtx(root);
      const res = await TOOL_EXECUTORS.read_file(ctx, {});
      expect(res.isError).toBe(true);
    });
  });

  describe('search_code', () => {
    it('finds literal matches with file:line format', async () => {
      fs.mkdirSync(path.join(root, 'src'));
      fs.writeFileSync(path.join(root, 'src/a.ts'), 'x\neval("bad")\ny');
      fs.writeFileSync(path.join(root, 'src/b.ts'), 'ok');
      const ctx = makeCtx(root);
      const res = await TOOL_EXECUTORS.search_code(ctx, { pattern: 'eval(' });
      expect(res.isError).toBe(false);
      expect(res.content).toMatch(/src\/a\.ts:2:/);
    });

    it('escapes metacharacters when not in regex mode', async () => {
      fs.writeFileSync(path.join(root, 'a.ts'), 'foo.bar()');
      const ctx = makeCtx(root);
      const res = await TOOL_EXECUTORS.search_code(ctx, { pattern: 'foo.bar' });
      expect(res.content).toContain('foo.bar');
    });

    it('honours regex mode', async () => {
      fs.writeFileSync(path.join(root, 'a.ts'), 'const x = 1;\nfunction y(){}');
      const ctx = makeCtx(root);
      const res = await TOOL_EXECUTORS.search_code(ctx, {
        pattern: '^function\\s+\\w+',
        regex: true,
      });
      expect(res.content).toMatch(/a\.ts:2/);
    });

    it('scopes search to file_pattern', async () => {
      fs.mkdirSync(path.join(root, 'src'));
      fs.mkdirSync(path.join(root, 'lib'));
      fs.writeFileSync(path.join(root, 'src/a.ts'), 'TARGET');
      fs.writeFileSync(path.join(root, 'lib/b.ts'), 'TARGET');
      const ctx = makeCtx(root);
      const res = await TOOL_EXECUTORS.search_code(ctx, {
        pattern: 'TARGET',
        file_pattern: 'src/**',
      });
      expect(res.content).toContain('src/a.ts');
      expect(res.content).not.toContain('lib/b.ts');
    });

    it('returns error for invalid regex', async () => {
      const ctx = makeCtx(root);
      const res = await TOOL_EXECUTORS.search_code(ctx, { pattern: '[unclosed', regex: true });
      expect(res.isError).toBe(true);
    });
  });

  describe('get_project_summary & get_static_findings', () => {
    it('returns summary', async () => {
      const ctx = makeCtx(root);
      const res = await TOOL_EXECUTORS.get_project_summary(ctx, {});
      expect(res.content).toContain('fixture');
      expect(res.content).toContain('TypeScript');
    });

    it('reports absence of static findings', async () => {
      const ctx = makeCtx(root);
      const res = await TOOL_EXECUTORS.get_static_findings(ctx, {});
      expect(res.content).toMatch(/No static-analysis findings/);
    });

    it('groups static findings by category', async () => {
      const findings: Finding[] = [
        { id: 'SEC-1', category: 'security', severity: 'high', title: 'eval use', description: 'x' },
        { id: 'DEP-1', category: 'dependencies', severity: 'medium', title: 'outdated', description: 'x' },
      ];
      const ctx = makeCtx(root, { staticFindings: findings });
      const res = await TOOL_EXECUTORS.get_static_findings(ctx, {});
      expect(res.content).toContain('[security]');
      expect(res.content).toContain('[dependencies]');
      expect(res.content).toContain('eval use');
    });
  });

  describe('finalize_audit', () => {
    it('invokes onFinalize with the payload', async () => {
      let received: FinalAuditPayload | null = null;
      const ctx = makeCtx(root, {
        onFinalize: (p) => { received = p; },
      });
      const payload: FinalAuditPayload = {
        security: { score: 80, summary: 'ok', findings: [] },
      };
      const res = await TOOL_EXECUTORS.finalize_audit(ctx, payload as Record<string, unknown>);
      expect(res.isError).toBe(false);
      expect(received).toEqual(payload);
    });
  });
});

describe('buildToolDefinitions', () => {
  it('produces one definition per executor', () => {
    const defs = buildToolDefinitions();
    const defNames = defs.map(d => d.name).sort();
    const execNames = Object.keys(TOOL_EXECUTORS).sort();
    expect(defNames).toEqual(execNames);
  });

  it('each tool has an input_schema', () => {
    for (const d of buildToolDefinitions()) {
      expect(d.input_schema).toBeDefined();
      expect(d.input_schema.type).toBe('object');
    }
  });
});
