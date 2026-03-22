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
  describe('clean and edge-case inputs', () => {
    it('returns empty array for small, clean files', () => {
      const files = [makeFile('src/utils.ts', 'export const add = (a: number, b: number) => a + b;\n')];
      expect(analyzeComplexity(files)).toEqual([]);
    });

    it('returns empty array for empty file list', () => {
      expect(analyzeComplexity([])).toEqual([]);
    });

    it('ignores non-code files regardless of content', () => {
      const files = [makeFile('README.md', 'x'.repeat(1000))];
      expect(analyzeComplexity(files)).toEqual([]);
    });

    it('ignores JSON files', () => {
      const files = [makeFile('config.json', '{\n'.repeat(600))];
      expect(analyzeComplexity(files)).toEqual([]);
    });
  });

  describe('large file detection', () => {
    it('does NOT flag files at exactly 500 lines', () => {
      const files = [makeLargeFile('src/borderline.ts', 500)];
      const findings = analyzeComplexity(files);
      expect(findings.some(f => f.title === 'Large File — Consider Splitting')).toBe(false);
    });

    it('flags files at 501 lines', () => {
      const files = [makeLargeFile('src/bigfile.ts', 501)];
      const findings = analyzeComplexity(files);
      expect(findings.some(f => f.title === 'Large File — Consider Splitting')).toBe(true);
    });

    it('assigns medium severity for 500-1000 line files', () => {
      const files = [makeLargeFile('src/medium.ts', 600)];
      const findings = analyzeComplexity(files);
      const f = findings.find(f => f.title === 'Large File — Consider Splitting');
      expect(f?.severity).toBe('medium');
    });

    it('assigns high severity for >1000 line files', () => {
      const files = [makeLargeFile('src/huge.ts', 1001)];
      const findings = analyzeComplexity(files);
      const f = findings.find(f => f.title === 'Large File — Consider Splitting');
      expect(f?.severity).toBe('high');
    });
  });

  describe('console.log detection', () => {
    it('flags >5 console calls in non-CLI files', () => {
      const lines = [
        'const a = 1;',
        ...Array.from({ length: 6 }, (_, i) => `console.log("debug ${i}");`),
      ];
      const files = [makeFile('src/verbose.ts', lines.join('\n'))];
      const findings = analyzeComplexity(files);
      expect(findings.some(f => f.title === 'Excessive console.log Usage')).toBe(true);
    });

    it('also counts console.error and console.warn', () => {
      const lines = [
        'console.error("e1");', 'console.error("e2");', 'console.warn("w1");',
        'console.warn("w2");', 'console.debug("d1");', 'console.info("i1");',
      ];
      const files = [makeFile('src/logging.ts', lines.join('\n'))];
      const findings = analyzeComplexity(files);
      expect(findings.some(f => f.title === 'Excessive console.log Usage')).toBe(true);
    });

    it('does not flag 5 or fewer console calls', () => {
      const lines = Array.from({ length: 5 }, (_, i) => `console.log("${i}");`);
      const files = [makeFile('src/ok.ts', lines.join('\n'))];
      const findings = analyzeComplexity(files);
      expect(findings.some(f => f.title === 'Excessive console.log Usage')).toBe(false);
    });

    it('skips CLI entry files (index.ts)', () => {
      const lines = Array.from({ length: 10 }, (_, i) => `console.log("output ${i}");`);
      const files = [makeFile('src/index.ts', lines.join('\n'))];
      expect(analyzeComplexity(files).some(f => f.title === 'Excessive console.log Usage')).toBe(false);
    });

    it('skips reporter files', () => {
      const lines = Array.from({ length: 10 }, (_, i) => `console.log("report ${i}");`);
      const files = [makeFile('src/reporters/terminal.ts', lines.join('\n'))];
      expect(analyzeComplexity(files).some(f => f.title === 'Excessive console.log Usage')).toBe(false);
    });

    it('skips bin/ entry files', () => {
      const lines = Array.from({ length: 10 }, (_, i) => `console.log("bin ${i}");`);
      const files = [makeFile('bin/cli.js', lines.join('\n'))];
      expect(analyzeComplexity(files).some(f => f.title === 'Excessive console.log Usage')).toBe(false);
    });
  });

  describe('deep nesting detection', () => {
    it('flags nesting depth >5', () => {
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
      expect(analyzeComplexity(files).some(f => f.title === 'Deep Nesting Detected')).toBe(true);
    });

    it('assigns high severity for depth >7', () => {
      const content = [
        'function f() {',
        ...Array.from({ length: 9 }, () => '  if (x) {'),
        '    doSomething();',
        ...Array.from({ length: 9 }, () => '  }'),
        '}',
      ].join('\n');
      const files = [makeFile('src/very-nested.ts', content)];
      const finding = analyzeComplexity(files).find(f => f.title === 'Deep Nesting Detected');
      expect(finding?.severity).toBe('high');
    });

    it('does not flag nesting depth <=5', () => {
      const content = [
        'function f() {',
        '  if (a) {',
        '    if (b) {',
        '      doSomething();',
        '    }',
        '  }',
        '}',
      ].join('\n');
      const files = [makeFile('src/ok.ts', content)];
      expect(analyzeComplexity(files).some(f => f.title === 'Deep Nesting Detected')).toBe(false);
    });
  });

  describe('documentation coverage', () => {
    it('flags large files with <5% comment ratio', () => {
      const files = [makeLargeFile('src/undocumented.ts', 150)];
      expect(analyzeComplexity(files).some(f => f.title === 'Insufficient Documentation')).toBe(true);
    });

    it('does not flag files under 100 lines', () => {
      const files = [makeFile('src/small.ts', 'const x = 1;\nconst y = 2;\n')];
      expect(analyzeComplexity(files).some(f => f.title === 'Insufficient Documentation')).toBe(false);
    });

    it('does not flag well-commented large files', () => {
      const lines = [
        ...Array.from({ length: 15 }, (_, i) => `// Comment line ${i}`),
        ...Array.from({ length: 90 }, (_, i) => `const x${i} = ${i};`),
      ];
      const files = [makeFile('src/documented.ts', lines.join('\n'))];
      expect(analyzeComplexity(files).some(f => f.title === 'Insufficient Documentation')).toBe(false);
    });
  });

  describe('duplicate imports', () => {
    it('flags duplicate imports from the same module', () => {
      const content = [
        "import { foo } from 'bar';",
        "import { baz } from 'bar';",
        'const x = foo + baz;',
      ].join('\n');
      const files = [makeFile('src/dup.ts', content)];
      expect(analyzeComplexity(files).some(f => f.title === 'Duplicate Imports')).toBe(true);
    });

    it('does not flag imports from different modules', () => {
      const content = [
        "import { foo } from 'bar';",
        "import { baz } from 'qux';",
      ].join('\n');
      const files = [makeFile('src/ok.ts', content)];
      expect(analyzeComplexity(files).some(f => f.title === 'Duplicate Imports')).toBe(false);
    });
  });

  describe('test coverage ratio', () => {
    it('flags no tests when codebase has >5 files', () => {
      const files = Array.from({ length: 6 }, (_, i) =>
        makeFile(`src/module${i}.ts`, `export const m${i} = ${i};`),
      );
      expect(analyzeComplexity(files).some(f => f.title === 'No Tests Found')).toBe(true);
    });

    it('flags low test coverage when few tests exist', () => {
      const sources = Array.from({ length: 10 }, (_, i) =>
        makeFile(`src/module${i}.ts`, `export const m${i} = ${i};`),
      );
      const tests = [makeFile('tests/module0.test.ts', 'test("ok", () => {});')];
      expect(analyzeComplexity([...sources, ...tests]).some(f => f.title === 'Low Test Coverage')).toBe(true);
    });

    it('does not flag when test ratio is healthy', () => {
      const sources = Array.from({ length: 6 }, (_, i) =>
        makeFile(`src/module${i}.ts`, `export const m${i} = ${i};`),
      );
      const tests = Array.from({ length: 6 }, (_, i) =>
        makeFile(`tests/module${i}.test.ts`, `test("ok", () => {});`),
      );
      expect(analyzeComplexity([...sources, ...tests]).some(f =>
        f.title === 'No Tests Found' || f.title === 'Low Test Coverage',
      )).toBe(false);
    });

    it('does not flag small codebases (<=5 files)', () => {
      const files = [
        makeFile('src/a.ts', 'export const a = 1;'),
        makeFile('src/b.ts', 'export const b = 2;'),
      ];
      expect(analyzeComplexity(files).some(f => f.title === 'No Tests Found')).toBe(false);
    });
  });
});
