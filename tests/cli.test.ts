import { execFileSync } from 'child_process';
import path from 'path';

const CLI_PATH = path.resolve(__dirname, '../dist/index.js');
const ROOT = path.resolve(__dirname, '..');
const NODE = process.execPath;

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function run(args: string[]): RunResult {
  try {
    const stdout = execFileSync(NODE, [CLI_PATH, ...args], {
      cwd: ROOT,
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
  it('shows help text', () => {
    const { stdout } = run(['--help']);
    expect(stdout).toContain('claude-audit');
    expect(stdout).toContain('AI-powered codebase auditor');
    expect(stdout).toContain('--static');
    expect(stdout).toContain('--api-key');
    expect(stdout).toContain('--output');
    expect(stdout).toContain('--categories');
  });

  it('shows version', () => {
    const { stdout } = run(['--version']);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('runs static analysis on the project itself', () => {
    const { exitCode } = run(['--static', '-o', 'terminal', '-q', '.']);
    expect(exitCode).toBeLessThanOrEqual(1);
  });

  it('accepts --json flag and outputs valid JSON', () => {
    const { stdout, exitCode } = run(['--static', '--json', '.']);
    expect(exitCode).toBeLessThanOrEqual(1);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('overallScore');
    expect(parsed).toHaveProperty('categories');
    expect(parsed).toHaveProperty('allFindings');
    expect(parsed).toHaveProperty('project');
    expect(parsed.aiPowered).toBe(false);
  });

  it('JSON output has expected structure', () => {
    const { stdout } = run(['--static', '--json', '.']);
    const report = JSON.parse(stdout);
    expect(typeof report.overallScore).toBe('number');
    expect(typeof report.overallGrade).toBe('string');
    expect(Array.isArray(report.categories)).toBe(true);
    expect(Array.isArray(report.allFindings)).toBe(true);
    expect(typeof report.project.name).toBe('string');
    expect(typeof report.project.totalFiles).toBe('number');
    expect(typeof report.durationMs).toBe('number');
    expect(typeof report.version).toBe('string');
  });

  it('filters by category', () => {
    const { stdout } = run(['--static', '--json', '--categories', 'security', '.']);
    const report = JSON.parse(stdout);
    const catNames = report.categories.map((c: { category: string }) => c.category);
    expect(catNames).toContain('security');
    expect(catNames).not.toContain('performance');
  });

  it('exits with code 2 on invalid path', () => {
    const { exitCode } = run(['--static', '/nonexistent/path/that/does/not/exist']);
    expect(exitCode).toBe(2);
  });
});
