import path from 'path';
import fs from 'fs';
import os from 'os';
import { scanProject } from '../../src/core/scanner';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-audit-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeFile(relativePath: string, content: string): void {
  const abs = path.join(tmpDir, relativePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf-8');
}

describe('scanProject', () => {
  it('scans TypeScript files', async () => {
    writeFile('src/app.ts', 'const x = 1;');
    const { files, info } = await scanProject(tmpDir, 500, 100);
    expect(files.length).toBe(1);
    expect(files[0].language).toBe('TypeScript');
    expect(files[0].relativePath).toBe('src/app.ts');
  });

  it('scans JavaScript files', async () => {
    writeFile('index.js', 'module.exports = {};');
    const { files } = await scanProject(tmpDir, 500, 100);
    expect(files.length).toBe(1);
    expect(files[0].language).toBe('JavaScript');
  });

  it('scans Python files', async () => {
    writeFile('app.py', 'print("hello")');
    const { files } = await scanProject(tmpDir, 500, 100);
    expect(files.length).toBe(1);
    expect(files[0].language).toBe('Python');
  });

  it('detects multiple languages', async () => {
    writeFile('app.ts', 'const a = 1;');
    writeFile('main.py', 'x = 1');
    writeFile('lib.go', 'package main');
    const { info } = await scanProject(tmpDir, 500, 100);
    expect(Object.keys(info.languages)).toContain('TypeScript');
    expect(Object.keys(info.languages)).toContain('Python');
    expect(Object.keys(info.languages)).toContain('Go');
  });

  it('counts total files and lines', async () => {
    writeFile('a.ts', 'line1\nline2\nline3');
    writeFile('b.ts', 'line1\nline2');
    const { info } = await scanProject(tmpDir, 500, 100);
    expect(info.totalFiles).toBe(2);
    expect(info.totalLines).toBe(5);
  });

  it('respects maxFiles limit', async () => {
    for (let i = 0; i < 10; i++) {
      writeFile(`src/file${i}.ts`, `const x = ${i};`);
    }
    const { files } = await scanProject(tmpDir, 3, 100);
    expect(files.length).toBe(3);
  });

  it('respects maxFileSize limit', async () => {
    const largeContent = 'x'.repeat(200 * 1024);
    writeFile('large.ts', largeContent);
    writeFile('small.ts', 'const x = 1;');
    const { files } = await scanProject(tmpDir, 500, 100);
    expect(files.length).toBe(1);
    expect(files[0].relativePath).toBe('small.ts');
  });

  it('ignores node_modules', async () => {
    writeFile('src/app.ts', 'const x = 1;');
    writeFile('node_modules/lib/index.js', 'module.exports = {};');
    const { files } = await scanProject(tmpDir, 500, 100);
    expect(files.every(f => !f.relativePath.includes('node_modules'))).toBe(true);
  });

  it('ignores dist directory', async () => {
    writeFile('src/app.ts', 'const x = 1;');
    writeFile('dist/app.js', 'var x = 1;');
    const { files } = await scanProject(tmpDir, 500, 100);
    expect(files.every(f => !f.relativePath.includes('dist/'))).toBe(true);
  });

  it('respects .gitignore patterns', async () => {
    writeFile('.gitignore', 'ignored/\n*.secret.ts');
    writeFile('src/app.ts', 'const x = 1;');
    writeFile('ignored/hidden.ts', 'const y = 2;');
    writeFile('src/data.secret.ts', 'const s = "secret";');
    const { files } = await scanProject(tmpDir, 500, 100);
    expect(files.every(f => !f.relativePath.includes('ignored/'))).toBe(true);
    expect(files.every(f => !f.relativePath.includes('.secret.'))).toBe(true);
    expect(files.length).toBe(1);
  });

  it('skips known lock files', async () => {
    writeFile('package-lock.json', '{}');
    writeFile('yarn.lock', '');
    writeFile('src/app.ts', 'const x = 1;');
    const { files } = await scanProject(tmpDir, 500, 100);
    expect(files.every(f => !f.relativePath.includes('lock'))).toBe(true);
  });

  it('detects project name from directory', async () => {
    writeFile('app.ts', 'const x = 1;');
    const { info } = await scanProject(tmpDir, 500, 100);
    expect(info.name).toBe(path.basename(tmpDir));
  });

  it('detects package.json dependencies', async () => {
    writeFile('package.json', JSON.stringify({
      dependencies: { express: '^4.18.0' },
      devDependencies: { typescript: '^5.0.0' },
    }));
    writeFile('index.ts', 'import express from "express";');
    const { info } = await scanProject(tmpDir, 500, 100);
    expect(info.hasDependencyFile).toBe(true);
    expect(info.dependencyFile).toBe('package.json');
    expect(info.dependencies).toHaveProperty('express');
    expect(info.dependencies).toHaveProperty('typescript');
  });

  it('detects frameworks from dependencies', async () => {
    writeFile('package.json', JSON.stringify({
      dependencies: { react: '^18.0.0', next: '^14.0.0' },
    }));
    writeFile('index.ts', 'const x = 1;');
    const { info } = await scanProject(tmpDir, 500, 100);
    expect(info.frameworks).toContain('React');
    expect(info.frameworks).toContain('Next');
  });

  it('detects npm as package manager', async () => {
    writeFile('package-lock.json', '{}');
    writeFile('package.json', '{}');
    writeFile('index.ts', 'const x = 1;');
    const { info } = await scanProject(tmpDir, 500, 100);
    expect(info.packageManager).toBe('npm');
  });

  it('detects test files', async () => {
    writeFile('src/app.ts', 'const x = 1;');
    writeFile('tests/app.test.ts', 'test("ok", () => {});');
    const { info } = await scanProject(tmpDir, 500, 100);
    expect(info.hasTests).toBe(true);
  });

  it('reports no tests when none exist', async () => {
    writeFile('src/app.ts', 'const x = 1;');
    const { info } = await scanProject(tmpDir, 500, 100);
    expect(info.hasTests).toBe(false);
  });

  it('handles empty project', async () => {
    const { files, info } = await scanProject(tmpDir, 500, 100);
    expect(files).toEqual([]);
    expect(info.totalFiles).toBe(0);
    expect(info.totalLines).toBe(0);
  });
});
