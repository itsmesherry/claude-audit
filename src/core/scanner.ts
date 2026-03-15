// ─────────────────────────────────────────────
//  claude-audit — Scanner
// ─────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import fg from 'fast-glob';
import ignore from 'ignore';
import type { ScannedFile, ProjectInfo } from './types';

const LANGUAGE_MAP: Record<string, string> = {
  ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript',
  mjs: 'JavaScript', cjs: 'JavaScript', py: 'Python', rb: 'Ruby',
  go: 'Go', rs: 'Rust', java: 'Java', kt: 'Kotlin', swift: 'Swift',
  cpp: 'C++', cc: 'C++', cxx: 'C++', c: 'C', h: 'C/C++', hpp: 'C++',
  cs: 'C#', php: 'PHP', scala: 'Scala', clj: 'Clojure', ex: 'Elixir',
  exs: 'Elixir', hs: 'Haskell', ml: 'OCaml', lua: 'Lua', r: 'R',
  sql: 'SQL', sh: 'Shell', bash: 'Shell', zsh: 'Shell', fish: 'Shell',
  yaml: 'YAML', yml: 'YAML', json: 'JSON', toml: 'TOML', xml: 'XML',
  html: 'HTML', htm: 'HTML', css: 'CSS', scss: 'SCSS', sass: 'SASS',
  less: 'LESS', vue: 'Vue', svelte: 'Svelte', astro: 'Astro',
  md: 'Markdown', mdx: 'Markdown', tf: 'Terraform', dockerfile: 'Docker',
  dart: 'Dart', zig: 'Zig', nim: 'Nim', v: 'V', jl: 'Julia',
};

const FRAMEWORK_PATTERNS: Record<string, string[]> = {
  React:       ['react', '@types/react'],
  Next:        ['next'],
  Vue:         ['vue', 'nuxt'],
  Svelte:      ['svelte', '@sveltejs'],
  Angular:     ['@angular/core'],
  Express:     ['express'],
  Fastify:     ['fastify'],
  NestJS:      ['@nestjs/core'],
  Django:      ['django'],
  Flask:       ['flask'],
  FastAPI:     ['fastapi'],
  Laravel:     ['laravel/framework'],
  Rails:       ['rails'],
  Spring:      ['spring-boot'],
  Gin:         ['github.com/gin-gonic'],
  Fiber:       ['github.com/gofiber'],
  Prisma:      ['prisma', '@prisma/client'],
  Drizzle:     ['drizzle-orm'],
  Mongoose:    ['mongoose'],
  SQLAlchemy:  ['sqlalchemy'],
  TailwindCSS: ['tailwindcss'],
  GraphQL:     ['graphql', 'apollo'],
  tRPC:        ['@trpc/server'],
};

const TEST_PATTERNS = [
  '**/*.test.{ts,tsx,js,jsx}',
  '**/*.spec.{ts,tsx,js,jsx}',
  '**/__tests__/**',
  '**/test_*.py',
  '**/*_test.py',
  '**/*_test.go',
  '**/tests/**',
];

const IGNORE_DIRS = [
  'node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt',
  'coverage', '.nyc_output', '__pycache__', '.pytest_cache', 'venv',
  '.venv', 'env', '.env', 'vendor', 'target', '.cargo', '.gradle',
  'pods', '.idea', '.vscode', '.DS_Store', 'tmp', 'temp', 'cache',
  '.cache', 'public/assets', 'static/assets',
];

const IGNORE_FILES = new Set([
  'audit-report.json',
  'audit-report.md',
  'audit-report.html',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'composer.lock',
]);

export async function scanProject(
  projectPath: string,
  maxFiles: number,
  maxFileSizeKb: number,
): Promise<{ files: ScannedFile[]; info: ProjectInfo }> {
  const absPath = path.resolve(projectPath);

  // Load .gitignore if present
  const ig = ignore();
  const gitignorePath = path.join(absPath, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    ig.add(fs.readFileSync(gitignorePath, 'utf-8'));
  }
  ig.add(IGNORE_DIRS);

  // Glob source files
  const allPaths = await fg('**/*', {
    cwd: absPath,
    dot: false,
    onlyFiles: true,
    followSymbolicLinks: false,
    ignore: IGNORE_DIRS.map(d => `**/${d}/**`),
  });

  const filtered = allPaths.filter(p => !ig.ignores(p));
  const sourceExts = new Set(Object.keys(LANGUAGE_MAP));

  const sourceFiles = filtered.filter(p => {
    const base = path.basename(p);
    if (IGNORE_FILES.has(base)) return false;
    const ext = path.extname(p).slice(1).toLowerCase();
    if (path.basename(p).toLowerCase() === 'dockerfile') return true;
    return sourceExts.has(ext);
  });

  const scanned: ScannedFile[] = [];
  const langCount: Record<string, number> = {};
  let totalLines = 0;

  const toProcess = sourceFiles.slice(0, maxFiles);

  for (const rel of toProcess) {
    const abs = path.join(absPath, rel);
    try {
      const stat = fs.statSync(abs);
      if (stat.size > maxFileSizeKb * 1024) continue;

      const content = fs.readFileSync(abs, 'utf-8');
      const ext = path.basename(rel).toLowerCase() === 'dockerfile'
        ? 'dockerfile'
        : path.extname(rel).slice(1).toLowerCase();
      const language = LANGUAGE_MAP[ext] ?? 'Unknown';
      const lines = content.split('\n').length;

      langCount[language] = (langCount[language] ?? 0) + 1;
      totalLines += lines;

      scanned.push({
        path: abs,
        relativePath: rel,
        language,
        lines,
        size: stat.size,
        content,
      });
    } catch {
      // skip unreadable files
    }
  }

  // Detect dependency files
  const depFiles = ['package.json', 'requirements.txt', 'Pipfile', 'pyproject.toml',
    'Gemfile', 'go.mod', 'Cargo.toml', 'pom.xml', 'build.gradle'];
  let dependencyFile: string | undefined;
  const deps: Record<string, string> = {};

  for (const df of depFiles) {
    const dfPath = path.join(absPath, df);
    if (fs.existsSync(dfPath)) {
      dependencyFile = df;
      if (df === 'package.json') {
        try {
          const pkg = JSON.parse(fs.readFileSync(dfPath, 'utf-8'));
          Object.assign(deps, pkg.dependencies ?? {}, pkg.devDependencies ?? {});
        } catch { /* ignore */ }
      }
      break;
    }
  }

  // Detect frameworks
  const depKeys = Object.keys(deps).map(k => k.toLowerCase());
  const depStr = JSON.stringify(deps).toLowerCase();
  const frameworks: string[] = [];
  for (const [name, patterns] of Object.entries(FRAMEWORK_PATTERNS)) {
    if (patterns.some(p => depKeys.some(k => k.includes(p.toLowerCase())) || depStr.includes(p.toLowerCase()))) {
      frameworks.push(name);
    }
  }

  // Check for tests
  const hasTests = (await fg(TEST_PATTERNS, {
    cwd: absPath,
    ignore: IGNORE_DIRS.map(d => `**/${d}/**`),
  })).length > 0;

  // Detect test frameworks
  const testFrameworks: string[] = [];
  const testKw: Record<string, string[]> = {
    Jest: ['jest', '@jest'],
    Vitest: ['vitest'],
    Mocha: ['mocha'],
    Pytest: ['pytest'],
    RSpec: ['rspec'],
    JUnit: ['junit'],
    Cargo: ['#[test]'],
  };
  for (const [fw, kws] of Object.entries(testKw)) {
    if (kws.some(k => depKeys.some(d => d.includes(k.toLowerCase())))) {
      testFrameworks.push(fw);
    }
  }

  // Package manager
  let packageManager: ProjectInfo['packageManager'];
  if (fs.existsSync(path.join(absPath, 'yarn.lock'))) packageManager = 'yarn';
  else if (fs.existsSync(path.join(absPath, 'pnpm-lock.yaml'))) packageManager = 'pnpm';
  else if (fs.existsSync(path.join(absPath, 'package-lock.json'))) packageManager = 'npm';
  else if (fs.existsSync(path.join(absPath, 'requirements.txt'))) packageManager = 'pip';
  else if (fs.existsSync(path.join(absPath, 'pyproject.toml'))) packageManager = 'poetry';
  else if (fs.existsSync(path.join(absPath, 'Cargo.toml'))) packageManager = 'cargo';
  else if (fs.existsSync(path.join(absPath, 'go.mod'))) packageManager = 'go';
  else if (fs.existsSync(path.join(absPath, 'pom.xml'))) packageManager = 'maven';
  else if (fs.existsSync(path.join(absPath, 'build.gradle'))) packageManager = 'gradle';

  const projectName = path.basename(absPath);

  return {
    files: scanned,
    info: {
      name: projectName,
      path: absPath,
      languages: langCount,
      frameworks,
      totalFiles: scanned.length,
      totalLines,
      hasTests,
      hasDependencyFile: !!dependencyFile,
      dependencyFile,
      dependencies: deps,
      testFrameworks,
      packageManager,
    },
  };
}
