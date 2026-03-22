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
  describe('language detection', () => {
    it('detects TypeScript files', async () => {
      writeFile('src/app.ts', 'const x = 1;');
      const { files } = await scanProject(tmpDir, 500, 100);
      expect(files.length).toBe(1);
      expect(files[0].language).toBe('TypeScript');
      expect(files[0].relativePath).toBe('src/app.ts');
    });

    it('detects JavaScript files', async () => {
      writeFile('index.js', 'module.exports = {};');
      const { files } = await scanProject(tmpDir, 500, 100);
      expect(files[0].language).toBe('JavaScript');
    });

    it('detects Python files', async () => {
      writeFile('app.py', 'print("hello")');
      const { files } = await scanProject(tmpDir, 500, 100);
      expect(files[0].language).toBe('Python');
    });

    it('detects Go files', async () => {
      writeFile('main.go', 'package main');
      const { files } = await scanProject(tmpDir, 500, 100);
      expect(files[0].language).toBe('Go');
    });

    it('detects Rust files', async () => {
      writeFile('main.rs', 'fn main() {}');
      const { files } = await scanProject(tmpDir, 500, 100);
      expect(files[0].language).toBe('Rust');
    });

    it('detects Dockerfiles', async () => {
      writeFile('Dockerfile', 'FROM node:18-alpine');
      const { files } = await scanProject(tmpDir, 500, 100);
      expect(files[0].language).toBe('Docker');
    });

    it('detects multiple languages in one project', async () => {
      writeFile('app.ts', 'const a = 1;');
      writeFile('main.py', 'x = 1');
      writeFile('lib.go', 'package main');
      const { info } = await scanProject(tmpDir, 500, 100);
      expect(Object.keys(info.languages)).toContain('TypeScript');
      expect(Object.keys(info.languages)).toContain('Python');
      expect(Object.keys(info.languages)).toContain('Go');
    });
  });

  describe('file counting and content', () => {
    it('counts total files and lines accurately', async () => {
      writeFile('a.ts', 'line1\nline2\nline3');
      writeFile('b.ts', 'line1\nline2');
      const { info } = await scanProject(tmpDir, 500, 100);
      expect(info.totalFiles).toBe(2);
      expect(info.totalLines).toBe(5);
    });

    it('reads file content correctly', async () => {
      const content = 'export function greet(name: string) {\n  return `Hello, ${name}`;\n}';
      writeFile('src/greet.ts', content);
      const { files } = await scanProject(tmpDir, 500, 100);
      expect(files[0].content).toBe(content);
    });

    it('reports correct file size', async () => {
      const content = 'const x = 42;';
      writeFile('src/app.ts', content);
      const { files } = await scanProject(tmpDir, 500, 100);
      expect(files[0].size).toBe(Buffer.byteLength(content, 'utf-8'));
    });
  });

  describe('limits', () => {
    it('respects maxFiles limit', async () => {
      for (let i = 0; i < 10; i++) {
        writeFile(`src/file${i}.ts`, `const x = ${i};`);
      }
      const { files } = await scanProject(tmpDir, 3, 100);
      expect(files.length).toBe(3);
    });

    it('respects maxFileSize limit (skips large files)', async () => {
      writeFile('large.ts', 'x'.repeat(200 * 1024));
      writeFile('small.ts', 'const x = 1;');
      const { files } = await scanProject(tmpDir, 500, 100);
      expect(files.length).toBe(1);
      expect(files[0].relativePath).toBe('small.ts');
    });
  });

  describe('ignore rules', () => {
    it('ignores node_modules/', async () => {
      writeFile('src/app.ts', 'const x = 1;');
      writeFile('node_modules/lib/index.js', 'module.exports = {};');
      const { files } = await scanProject(tmpDir, 500, 100);
      expect(files.every(f => !f.relativePath.includes('node_modules'))).toBe(true);
    });

    it('ignores dist/', async () => {
      writeFile('src/app.ts', 'const x = 1;');
      writeFile('dist/app.js', 'var x = 1;');
      const { files } = await scanProject(tmpDir, 500, 100);
      expect(files.every(f => !f.relativePath.startsWith('dist/'))).toBe(true);
    });

    it('ignores .git/', async () => {
      writeFile('src/app.ts', 'const x = 1;');
      writeFile('.git/config', '[core]');
      const { files } = await scanProject(tmpDir, 500, 100);
      expect(files.every(f => !f.relativePath.includes('.git/'))).toBe(true);
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

    it('skips package-lock.json and yarn.lock', async () => {
      writeFile('package-lock.json', '{}');
      writeFile('yarn.lock', '');
      writeFile('src/app.ts', 'const x = 1;');
      const { files } = await scanProject(tmpDir, 500, 100);
      expect(files.every(f => !f.relativePath.includes('lock'))).toBe(true);
    });

    it('skips audit report files', async () => {
      writeFile('audit-report.json', '{}');
      writeFile('audit-report.md', '# Report');
      writeFile('audit-report.html', '<html></html>');
      writeFile('src/app.ts', 'const x = 1;');
      const { files } = await scanProject(tmpDir, 500, 100);
      expect(files.every(f => !f.relativePath.startsWith('audit-report'))).toBe(true);
    });
  });

  describe('project metadata', () => {
    it('detects project name from directory', async () => {
      writeFile('app.ts', 'const x = 1;');
      const { info } = await scanProject(tmpDir, 500, 100);
      expect(info.name).toBe(path.basename(tmpDir));
    });

    it('resolves absolute path', async () => {
      writeFile('app.ts', 'const x = 1;');
      const { info } = await scanProject(tmpDir, 500, 100);
      expect(path.isAbsolute(info.path)).toBe(true);
    });
  });

  describe('dependency detection', () => {
    it('parses package.json dependencies', async () => {
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

    it('handles malformed package.json without crashing', async () => {
      writeFile('package.json', 'not valid json!!!');
      writeFile('index.ts', 'const x = 1;');
      const { info } = await scanProject(tmpDir, 500, 100);
      expect(info.hasDependencyFile).toBe(true);
      expect(Object.keys(info.dependencies).length).toBe(0);
    });

    it('reports no dependency file when none exists', async () => {
      writeFile('app.ts', 'const x = 1;');
      const { info } = await scanProject(tmpDir, 500, 100);
      expect(info.hasDependencyFile).toBe(false);
    });
  });

  describe('framework detection', () => {
    it('detects React and Next.js from dependencies', async () => {
      writeFile('package.json', JSON.stringify({
        dependencies: { react: '^18.0.0', next: '^14.0.0' },
      }));
      writeFile('index.ts', 'const x = 1;');
      const { info } = await scanProject(tmpDir, 500, 100);
      expect(info.frameworks).toContain('React');
      expect(info.frameworks).toContain('Next');
    });

    it('detects Express from dependencies', async () => {
      writeFile('package.json', JSON.stringify({
        dependencies: { express: '^4.18.0' },
      }));
      writeFile('index.ts', 'const x = 1;');
      const { info } = await scanProject(tmpDir, 500, 100);
      expect(info.frameworks).toContain('Express');
    });
  });

  describe('package manager detection', () => {
    it('detects npm from package-lock.json', async () => {
      writeFile('package-lock.json', '{}');
      writeFile('package.json', '{}');
      writeFile('index.ts', 'const x = 1;');
      const { info } = await scanProject(tmpDir, 500, 100);
      expect(info.packageManager).toBe('npm');
    });

    it('detects yarn from yarn.lock', async () => {
      writeFile('yarn.lock', '');
      writeFile('package.json', '{}');
      writeFile('index.ts', 'const x = 1;');
      const { info } = await scanProject(tmpDir, 500, 100);
      expect(info.packageManager).toBe('yarn');
    });

    it('detects pnpm from pnpm-lock.yaml', async () => {
      writeFile('pnpm-lock.yaml', '');
      writeFile('package.json', '{}');
      writeFile('index.ts', 'const x = 1;');
      const { info } = await scanProject(tmpDir, 500, 100);
      expect(info.packageManager).toBe('pnpm');
    });

    it('detects pip from requirements.txt', async () => {
      writeFile('requirements.txt', 'flask==2.0.0');
      writeFile('app.py', 'from flask import Flask');
      const { info } = await scanProject(tmpDir, 500, 100);
      expect(info.packageManager).toBe('pip');
    });
  });

  describe('test detection', () => {
    it('detects .test.ts files', async () => {
      writeFile('src/app.ts', 'const x = 1;');
      writeFile('tests/app.test.ts', 'test("ok", () => {});');
      const { info } = await scanProject(tmpDir, 500, 100);
      expect(info.hasTests).toBe(true);
    });

    it('detects .spec.ts files', async () => {
      writeFile('src/app.ts', 'const x = 1;');
      writeFile('tests/app.spec.ts', 'it("works", () => {});');
      const { info } = await scanProject(tmpDir, 500, 100);
      expect(info.hasTests).toBe(true);
    });

    it('detects __tests__ directory', async () => {
      writeFile('src/app.ts', 'const x = 1;');
      writeFile('src/__tests__/app.ts', 'test("works", () => {});');
      const { info } = await scanProject(tmpDir, 500, 100);
      expect(info.hasTests).toBe(true);
    });

    it('reports no tests when none exist', async () => {
      writeFile('src/app.ts', 'const x = 1;');
      const { info } = await scanProject(tmpDir, 500, 100);
      expect(info.hasTests).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('handles empty project directory', async () => {
      const { files, info } = await scanProject(tmpDir, 500, 100);
      expect(files).toEqual([]);
      expect(info.totalFiles).toBe(0);
      expect(info.totalLines).toBe(0);
    });

    it('handles project with only non-source files', async () => {
      writeFile('data.csv', 'a,b,c');
      writeFile('image.png', 'binary');
      const { files } = await scanProject(tmpDir, 500, 100);
      expect(files.length).toBe(0);
    });
  });
});
