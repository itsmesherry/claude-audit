"use strict";
// ─────────────────────────────────────────────
//  claude-audit — Scanner
// ─────────────────────────────────────────────
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scanProject = scanProject;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const fast_glob_1 = __importDefault(require("fast-glob"));
const ignore_1 = __importDefault(require("ignore"));
const LANGUAGE_MAP = {
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
const FRAMEWORK_PATTERNS = {
    React: ['react', '@types/react'],
    Next: ['next'],
    Vue: ['vue', 'nuxt'],
    Svelte: ['svelte', '@sveltejs'],
    Angular: ['@angular/core'],
    Express: ['express'],
    Fastify: ['fastify'],
    NestJS: ['@nestjs/core'],
    Django: ['django'],
    Flask: ['flask'],
    FastAPI: ['fastapi'],
    Laravel: ['laravel/framework'],
    Rails: ['rails'],
    Spring: ['spring-boot'],
    Gin: ['github.com/gin-gonic'],
    Fiber: ['github.com/gofiber'],
    Prisma: ['prisma', '@prisma/client'],
    Drizzle: ['drizzle-orm'],
    Mongoose: ['mongoose'],
    SQLAlchemy: ['sqlalchemy'],
    TailwindCSS: ['tailwindcss'],
    GraphQL: ['graphql', 'apollo'],
    tRPC: ['@trpc/server'],
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
async function scanProject(projectPath, maxFiles, maxFileSizeKb) {
    const absPath = path_1.default.resolve(projectPath);
    // Load .gitignore if present
    const ig = (0, ignore_1.default)();
    const gitignorePath = path_1.default.join(absPath, '.gitignore');
    if (fs_1.default.existsSync(gitignorePath)) {
        ig.add(fs_1.default.readFileSync(gitignorePath, 'utf-8'));
    }
    ig.add(IGNORE_DIRS);
    // Glob source files
    const allPaths = await (0, fast_glob_1.default)('**/*', {
        cwd: absPath,
        dot: false,
        onlyFiles: true,
        followSymbolicLinks: false,
        ignore: IGNORE_DIRS.map(d => `**/${d}/**`),
    });
    const filtered = allPaths.filter(p => !ig.ignores(p));
    const sourceExts = new Set(Object.keys(LANGUAGE_MAP));
    const sourceFiles = filtered.filter(p => {
        const base = path_1.default.basename(p);
        if (IGNORE_FILES.has(base))
            return false;
        const ext = path_1.default.extname(p).slice(1).toLowerCase();
        if (path_1.default.basename(p).toLowerCase() === 'dockerfile')
            return true;
        return sourceExts.has(ext);
    });
    const scanned = [];
    const langCount = {};
    let totalLines = 0;
    const toProcess = sourceFiles.slice(0, maxFiles);
    for (const rel of toProcess) {
        const abs = path_1.default.join(absPath, rel);
        try {
            const stat = fs_1.default.statSync(abs);
            if (stat.size > maxFileSizeKb * 1024)
                continue;
            const content = fs_1.default.readFileSync(abs, 'utf-8');
            const ext = path_1.default.basename(rel).toLowerCase() === 'dockerfile'
                ? 'dockerfile'
                : path_1.default.extname(rel).slice(1).toLowerCase();
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
        }
        catch {
            // skip unreadable files
        }
    }
    // Detect dependency files
    const depFiles = ['package.json', 'requirements.txt', 'Pipfile', 'pyproject.toml',
        'Gemfile', 'go.mod', 'Cargo.toml', 'pom.xml', 'build.gradle'];
    let dependencyFile;
    const deps = {};
    for (const df of depFiles) {
        const dfPath = path_1.default.join(absPath, df);
        if (fs_1.default.existsSync(dfPath)) {
            dependencyFile = df;
            if (df === 'package.json') {
                try {
                    const pkg = JSON.parse(fs_1.default.readFileSync(dfPath, 'utf-8'));
                    Object.assign(deps, pkg.dependencies ?? {}, pkg.devDependencies ?? {});
                }
                catch { /* ignore */ }
            }
            break;
        }
    }
    // Detect frameworks
    const depKeys = Object.keys(deps).map(k => k.toLowerCase());
    const depStr = JSON.stringify(deps).toLowerCase();
    const frameworks = [];
    for (const [name, patterns] of Object.entries(FRAMEWORK_PATTERNS)) {
        if (patterns.some(p => depKeys.some(k => k.includes(p.toLowerCase())) || depStr.includes(p.toLowerCase()))) {
            frameworks.push(name);
        }
    }
    // Check for tests
    const hasTests = (await (0, fast_glob_1.default)(TEST_PATTERNS, {
        cwd: absPath,
        ignore: IGNORE_DIRS.map(d => `**/${d}/**`),
    })).length > 0;
    // Detect test frameworks
    const testFrameworks = [];
    const testKw = {
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
    let packageManager;
    if (fs_1.default.existsSync(path_1.default.join(absPath, 'yarn.lock')))
        packageManager = 'yarn';
    else if (fs_1.default.existsSync(path_1.default.join(absPath, 'pnpm-lock.yaml')))
        packageManager = 'pnpm';
    else if (fs_1.default.existsSync(path_1.default.join(absPath, 'package-lock.json')))
        packageManager = 'npm';
    else if (fs_1.default.existsSync(path_1.default.join(absPath, 'requirements.txt')))
        packageManager = 'pip';
    else if (fs_1.default.existsSync(path_1.default.join(absPath, 'pyproject.toml')))
        packageManager = 'poetry';
    else if (fs_1.default.existsSync(path_1.default.join(absPath, 'Cargo.toml')))
        packageManager = 'cargo';
    else if (fs_1.default.existsSync(path_1.default.join(absPath, 'go.mod')))
        packageManager = 'go';
    else if (fs_1.default.existsSync(path_1.default.join(absPath, 'pom.xml')))
        packageManager = 'maven';
    else if (fs_1.default.existsSync(path_1.default.join(absPath, 'build.gradle')))
        packageManager = 'gradle';
    const projectName = path_1.default.basename(absPath);
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
//# sourceMappingURL=scanner.js.map