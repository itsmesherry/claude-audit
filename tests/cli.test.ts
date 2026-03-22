import { execFileSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

const CLI_PATH = path.resolve(__dirname, '../dist/index.js');
const ROOT = path.resolve(__dirname, '..');
const NODE = process.execPath;

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function run(args: string[], options?: { cwd?: string }): RunResult {
  try {
    const stdout = execFileSync(NODE, [CLI_PATH, ...args], {
      cwd: options?.cwd ?? ROOT,
      encoding: 'utf-8',
      timeout: 30_000,
      env: { ...process.env, FORCE_COLOR: '0' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
      exitCode: e.status ?? 1,
    };
  }
}

describe('CLI', () => {
  describe('basic flags', () => {
    it('--help shows usage, description, and all flags', () => {
      const { stdout, exitCode } = run(['--help']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('claude-audit');
      expect(stdout).toContain('AI-powered codebase auditor');
      expect(stdout).toContain('--static');
      expect(stdout).toContain('--api-key');
      expect(stdout).toContain('--output');
      expect(stdout).toContain('--categories');
      expect(stdout).toContain('--model');
      expect(stdout).toContain('--max-files');
      expect(stdout).toContain('--quiet');
      expect(stdout).toContain('--json');
    });

    it('--version outputs a valid semver string', () => {
      const { stdout, exitCode } = run(['--version']);
      expect(exitCode).toBe(0);
      expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('--version matches package.json version', () => {
      const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
      const { stdout } = run(['--version']);
      expect(stdout.trim()).toBe(pkg.version);
    });
  });

  describe('static analysis', () => {
    it('runs successfully on the project itself', () => {
      const { exitCode } = run(['--static', '-o', 'terminal', '-q', '.']);
      expect(exitCode).toBeLessThanOrEqual(1);
    });

    it('--quiet suppresses progress output', () => {
      const { stdout } = run(['--static', '-o', 'terminal', '-q', '.']);
      expect(stdout).not.toContain('Initializing');
      expect(stdout).not.toContain('Scanning');
    });
  });

  describe('JSON output', () => {
    it('--json outputs valid parseable JSON', () => {
      const { stdout, exitCode } = run(['--static', '--json', '.']);
      expect(exitCode).toBeLessThanOrEqual(1);
      expect(() => JSON.parse(stdout)).not.toThrow();
    });

    it('JSON report has required top-level fields', () => {
      const { stdout } = run(['--static', '--json', '.']);
      const report = JSON.parse(stdout);
      expect(report).toHaveProperty('version');
      expect(report).toHaveProperty('timestamp');
      expect(report).toHaveProperty('project');
      expect(report).toHaveProperty('overallScore');
      expect(report).toHaveProperty('overallGrade');
      expect(report).toHaveProperty('categories');
      expect(report).toHaveProperty('allFindings');
      expect(report).toHaveProperty('durationMs');
      expect(report.aiPowered).toBe(false);
    });

    it('JSON report fields have correct types', () => {
      const { stdout } = run(['--static', '--json', '.']);
      const report = JSON.parse(stdout);
      expect(typeof report.overallScore).toBe('number');
      expect(typeof report.overallGrade).toBe('string');
      expect(Array.isArray(report.categories)).toBe(true);
      expect(Array.isArray(report.allFindings)).toBe(true);
      expect(typeof report.project.name).toBe('string');
      expect(typeof report.project.totalFiles).toBe('number');
      expect(typeof report.durationMs).toBe('number');
    });

    it('JSON report categories have expected shape', () => {
      const { stdout } = run(['--static', '--json', '.']);
      const report = JSON.parse(stdout);
      for (const cat of report.categories) {
        expect(cat).toHaveProperty('category');
        expect(cat).toHaveProperty('score');
        expect(cat).toHaveProperty('grade');
        expect(cat).toHaveProperty('findings');
        expect(cat).toHaveProperty('summary');
        expect(typeof cat.score).toBe('number');
        expect(['A', 'B', 'C', 'D', 'F']).toContain(cat.grade);
      }
    });
  });

  describe('category filtering', () => {
    it('--categories security only includes security', () => {
      const { stdout } = run(['--static', '--json', '--categories', 'security', '.']);
      const report = JSON.parse(stdout);
      const catNames = report.categories.map((c: { category: string }) => c.category);
      expect(catNames).toContain('security');
      expect(catNames).not.toContain('performance');
      expect(catNames).not.toContain('architecture');
    });
  });

  describe('output directory', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-audit-cli-test-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('--output-dir writes reports to specified directory', () => {
      const { exitCode } = run([
        '--static', '-o', 'markdown,html', '--output-dir', tmpDir, '-q', '.',
      ]);
      expect(exitCode).toBeLessThanOrEqual(1);
      expect(fs.existsSync(path.join(tmpDir, 'audit-report.md'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'audit-report.html'))).toBe(true);
    });
  });

  describe('error handling', () => {
    it('exits with code 2 on nonexistent path', () => {
      const { exitCode, stderr } = run(['--static', '/nonexistent/path/that/does/not/exist']);
      expect(exitCode).toBe(2);
      expect(stderr).toContain('Error');
    });

    it('stderr suggests --static when audit fails', () => {
      const { stderr } = run(['--static', '/nonexistent/path/that/does/not/exist']);
      expect(stderr).toContain('--static');
    });
  });
});
