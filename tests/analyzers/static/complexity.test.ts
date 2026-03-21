import { analyzeComplexity } from '../../../src/analyzers/static/complexity';
import type { ScannedFile } from '../../../src/core/types';

function makeFile(relativePath: string, content: string): ScannedFile {
  return {
    path: `/project/${relativePath}`,
    relativePath,
    language: 'TypeScript',
    lines: content.split('\n').length,
    size: content.length,
    content,
  };
}

function makeLargeFile(relativePath: string, lineCount: number): ScannedFile {
  const lines = Array.from({ length: lineCount }, (_, i) => `const x${i} = ${i};`);
  return makeFile(relativePath, lines.join('\n'));
}

describe('analyzeComplexity', () => {
  it('returns empty array for small, clean files', () => {
    const files = [makeFile('src/utils.ts', 'export const add = (a: number, b: number) => a + b;\n')];
    expect(analyzeComplexity(files)).toEqual([]);
  });

  it('flags files over 500 lines', () => {
    const files = [makeLargeFile('src/bigfile.ts', 501)];
    const findings = analyzeComplexity(files);
    expect(findings.some(f => f.title === 'Large File — Consider Splitting')).toBe(true);
  });

  it('sets high severity for files over 1000 lines', () => {
    const files = [makeLargeFile('src/huge.ts', 1001)];
    const findings = analyzeComplexity(files);
    const largeFinding = findings.find(f => f.title === 'Large File — Consider Splitting');
    expect(largeFinding?.severity).toBe('high');
  });

  it('sets medium severity for files 500-1000 lines', () => {
    const files = [makeLargeFile('src/medium.ts', 600)];
    const findings = analyzeComplexity(files);
    const largeFinding = findings.find(f => f.title === 'Large File — Consider Splitting');
    expect(largeFinding?.severity).toBe('medium');
  });

  it('flags excessive console.log usage', () => {
    const lines = [
      'const a = 1;',
      ...Array.from({ length: 6 }, (_, i) => `console.log("debug ${i}");`),
    ];
    const files = [makeFile('src/verbose.ts', lines.join('\n'))];
    const findings = analyzeComplexity(files);
    expect(findings.some(f => f.title === 'Excessive console.log Usage')).toBe(true);
  });

  it('skips console.log check for CLI entry files', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `console.log("output ${i}");`);
    const files = [makeFile('src/index.ts', lines.join('\n'))];
    const findings = analyzeComplexity(files);
    expect(findings.some(f => f.title === 'Excessive console.log Usage')).toBe(false);
  });

  it('skips console.log check for reporter files', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `console.log("report ${i}");`);
    const files = [makeFile('src/reporters/terminal.ts', lines.join('\n'))];
    const findings = analyzeComplexity(files);
    expect(findings.some(f => f.title === 'Excessive console.log Usage')).toBe(false);
  });

  it('flags deep nesting', () => {
    const content = [
      'function deep() {',
      '  if (a) {',
      '    if (b) {',
      '      if (c) {',
      '        if (d) {',
      '          if (e) {',
      '            if (f) {',
      '              doSomething();',
      '            }',
      '          }',
      '        }',
      '      }',
      '    }',
      '  }',
      '}',
    ].join('\n');
    const files = [makeFile('src/nested.ts', content)];
    const findings = analyzeComplexity(files);
    expect(findings.some(f => f.title === 'Deep Nesting Detected')).toBe(true);
  });

  it('flags insufficient documentation in large files', () => {
    const files = [makeLargeFile('src/undocumented.ts', 150)];
    const findings = analyzeComplexity(files);
    expect(findings.some(f => f.title === 'Insufficient Documentation')).toBe(true);
  });

  it('does not flag documentation for small files', () => {
    const files = [makeFile('src/small.ts', 'const x = 1;\nconst y = 2;\n')];
    const findings = analyzeComplexity(files);
    expect(findings.some(f => f.title === 'Insufficient Documentation')).toBe(false);
  });

  it('flags duplicate imports', () => {
    const content = [
      "import { foo } from 'bar';",
      "import { baz } from 'bar';",
      'const x = foo + baz;',
    ].join('\n');
    const files = [makeFile('src/dup.ts', content)];
    const findings = analyzeComplexity(files);
    expect(findings.some(f => f.title === 'Duplicate Imports')).toBe(true);
  });

  it('flags no tests when codebase has >5 files', () => {
    const files = Array.from({ length: 6 }, (_, i) =>
      makeFile(`src/module${i}.ts`, `export const m${i} = ${i};`),
    );
    const findings = analyzeComplexity(files);
    expect(findings.some(f => f.title === 'No Tests Found')).toBe(true);
  });

  it('does not flag no tests for small codebases', () => {
    const files = [
      makeFile('src/a.ts', 'export const a = 1;'),
      makeFile('src/b.ts', 'export const b = 2;'),
    ];
    const findings = analyzeComplexity(files);
    expect(findings.some(f => f.title === 'No Tests Found')).toBe(false);
  });

  it('ignores non-code files', () => {
    const files = [makeFile('README.md', 'x'.repeat(1000))];
    const findings = analyzeComplexity(files);
    expect(findings).toEqual([]);
  });

  it('handles empty file list', () => {
    expect(analyzeComplexity([])).toEqual([]);
  });

  it('detects low test coverage ratio', () => {
    const sources = Array.from({ length: 10 }, (_, i) =>
      makeFile(`src/module${i}.ts`, `export const m${i} = ${i};`),
    );
    const tests = [makeFile('tests/module0.test.ts', 'test("ok", () => {});')];
    const findings = analyzeComplexity([...sources, ...tests]);
    expect(findings.some(f => f.title === 'Low Test Coverage')).toBe(true);
  });
});
