"use strict";
// ─────────────────────────────────────────────
//  claude-audit — Complexity & Quality Analyzer
// ─────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeComplexity = analyzeComplexity;
const CODE_EXTS = new Set(['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'java', 'kt', 'swift', 'cs', 'rb', 'php', 'cpp', 'c']);
function getExt(filePath) {
    return filePath.split('.').pop()?.toLowerCase() ?? '';
}
function analyzeFileComplexity(file) {
    const lines = file.content.split('\n');
    const result = {
        file: file.relativePath,
        lines: lines.length,
        longFunctions: [],
        deepNesting: [],
        longLines: [],
        todoCount: 0,
        consoleLogCount: 0,
        commentRatio: 0,
        duplicateImports: [],
    };
    let commentLines = 0;
    let currentFunctionName = '';
    let functionStartLine = -1;
    let functionBraceDepth = 0;
    let inFunction = false;
    const importsSeen = new Set();
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        // Long lines (>120 chars, ignoring comments/strings)
        if (line.length > 120 && !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('#')) {
            result.longLines.push(i + 1);
        }
        // Comments
        if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
            commentLines++;
        }
        // TODO / FIXME count
        if (/\b(TODO|FIXME|HACK|XXX)\b/i.test(trimmed)) {
            result.todoCount++;
        }
        // console.log
        if (/console\.(log|warn|error|debug|info)\s*\(/.test(trimmed)) {
            result.consoleLogCount++;
        }
        // Deep nesting — count indentation via brace depth
        const openBraces = (line.match(/\{/g) || []).length;
        const closeBraces = (line.match(/\}/g) || []).length;
        functionBraceDepth += openBraces - closeBraces;
        if (functionBraceDepth > 5) {
            result.deepNesting.push({ line: i + 1, depth: functionBraceDepth });
        }
        // Function detection (JS/TS)
        const fnMatch = trimmed.match(/(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\(.*?\)\s*=>|\bfunction\b)|(\w+)\s*\(.*?\)\s*\{)/);
        if (fnMatch) {
            currentFunctionName = fnMatch[1] ?? fnMatch[2] ?? fnMatch[3] ?? 'anonymous';
            functionStartLine = i;
            inFunction = true;
        }
        // Python function/class detection
        const pyFnMatch = trimmed.match(/^(?:async\s+)?def\s+(\w+)/);
        if (pyFnMatch) {
            if (inFunction && functionStartLine >= 0 && (i - functionStartLine) > 50) {
                result.longFunctions.push({
                    name: currentFunctionName,
                    line: functionStartLine + 1,
                    length: i - functionStartLine,
                });
            }
            currentFunctionName = pyFnMatch[1];
            functionStartLine = i;
            inFunction = true;
        }
        // Import deduplication
        const importMatch = trimmed.match(/^import\s+.*\s+from\s+['"]([^'"]+)['"]/);
        if (importMatch) {
            const mod = importMatch[1];
            if (importsSeen.has(mod)) {
                result.duplicateImports.push(mod);
            }
            importsSeen.add(mod);
        }
    }
    result.commentRatio = lines.length > 0 ? commentLines / lines.length : 0;
    return result;
}
function analyzeComplexity(files) {
    const findings = [];
    let idx = 0;
    const codeFiles = files.filter(f => CODE_EXTS.has(getExt(f.relativePath)));
    // File-level analysis
    for (const file of codeFiles) {
        const result = analyzeFileComplexity(file);
        // Very large files
        if (result.lines > 500) {
            findings.push({
                id: `QUA-${String(++idx).padStart(3, '0')}`,
                category: 'quality',
                severity: result.lines > 1000 ? 'high' : 'medium',
                title: 'Large File — Consider Splitting',
                description: `${result.file} has ${result.lines} lines. Large files are hard to test, review, and maintain.`,
                file: result.file,
                fix: 'Split into smaller, focused modules. Follow the Single Responsibility Principle.',
            });
        }
        // Excessive console.log — skip reporter files (intentional usage)
        const isReporter = file.relativePath.includes('reporters/') || file.relativePath.includes('reporter.');
        if (!isReporter && result.consoleLogCount > 5) {
            findings.push({
                id: `QUA-${String(++idx).padStart(3, '0')}`,
                category: 'quality',
                severity: 'low',
                title: 'Excessive console.log Usage',
                description: `${result.file} contains ${result.consoleLogCount} console.log calls. These should not reach production.`,
                file: result.file,
                fix: 'Replace with a proper logger (winston, pino) and remove debug logs before shipping.',
            });
        }
        // Deep nesting
        const worstNesting = result.deepNesting.sort((a, b) => b.depth - a.depth)[0];
        if (worstNesting) {
            findings.push({
                id: `QUA-${String(++idx).padStart(3, '0')}`,
                category: 'quality',
                severity: worstNesting.depth > 7 ? 'high' : 'medium',
                title: 'Deep Nesting Detected',
                description: `${result.file}:${worstNesting.line} — nesting depth of ${worstNesting.depth}. This hurts readability and testability.`,
                file: result.file,
                line: worstNesting.line,
                fix: 'Use early returns, extract functions, or restructure logic to reduce nesting. Aim for max depth of 3.',
            });
        }
        // Low comment ratio for large files
        if (result.lines > 100 && result.commentRatio < 0.05) {
            findings.push({
                id: `QUA-${String(++idx).padStart(3, '0')}`,
                category: 'documentation',
                severity: 'low',
                title: 'Insufficient Documentation',
                description: `${result.file} has < 5% comment coverage across ${result.lines} lines.`,
                file: result.file,
                fix: 'Add JSDoc/docstrings to exported functions, classes, and complex logic.',
            });
        }
        // Duplicate imports
        if (result.duplicateImports.length > 0) {
            findings.push({
                id: `QUA-${String(++idx).padStart(3, '0')}`,
                category: 'quality',
                severity: 'low',
                title: 'Duplicate Imports',
                description: `${result.file} imports the same module multiple times: ${result.duplicateImports.join(', ')}`,
                file: result.file,
                fix: 'Consolidate imports from the same module into a single import statement.',
            });
        }
    }
    // Project-level: test ratio
    const testFiles = files.filter(f => f.relativePath.includes('.test.') ||
        f.relativePath.includes('.spec.') ||
        f.relativePath.includes('__tests__') ||
        f.relativePath.includes('/tests/') ||
        f.relativePath.match(/test_\w+\.(py|js|ts)$/));
    const testRatio = codeFiles.length > 0 ? testFiles.length / codeFiles.length : 0;
    if (testRatio < 0.1 && codeFiles.length > 5) {
        findings.push({
            id: `QUA-${String(++idx).padStart(3, '0')}`,
            category: 'testing',
            severity: testRatio === 0 ? 'high' : 'medium',
            title: testRatio === 0 ? 'No Tests Found' : 'Low Test Coverage',
            description: `Only ${Math.round(testRatio * 100)}% of source files have corresponding tests (${testFiles.length} test files for ${codeFiles.length} source files).`,
            fix: 'Add unit tests for critical business logic. Aim for at least 70% code coverage.',
        });
    }
    return findings;
}
//# sourceMappingURL=complexity.js.map