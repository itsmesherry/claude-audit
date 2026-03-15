"use strict";
// ─────────────────────────────────────────────
//  claude-audit — Static Security Analyzer
// ─────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeSecrets = analyzeSecrets;
const SECRET_PATTERNS = [
    {
        id: 'SEC-001',
        name: 'Hardcoded API Key',
        regex: /(?:api[_-]?key|apikey)\s*[:=]\s*["']([A-Za-z0-9_\-]{16,})["']/gi,
        severity: 'critical',
        fix: 'Move to environment variables: process.env.API_KEY',
    },
    {
        id: 'SEC-002',
        name: 'Hardcoded Secret / Password',
        regex: /(?:secret|password|passwd|pwd)\s*[:=]\s*["']([^"']{8,})["']/gi,
        severity: 'critical',
        fix: 'Use environment variables or a secrets manager (e.g. HashiCorp Vault, AWS Secrets Manager)',
    },
    {
        id: 'SEC-003',
        name: 'Anthropic / OpenAI Key Exposed',
        regex: /(?:sk-[A-Za-z0-9]{32,}|sk-ant-[A-Za-z0-9\-]{30,})/g,
        severity: 'critical',
        fix: 'Revoke this key immediately and rotate. Store via: export ANTHROPIC_API_KEY=...',
    },
    {
        id: 'SEC-004',
        name: 'AWS Access Key',
        regex: /AKIA[0-9A-Z]{16}/g,
        severity: 'critical',
        fix: 'Revoke key in AWS IAM. Use IAM roles or AWS Secrets Manager instead.',
    },
    {
        id: 'SEC-005',
        name: 'Private Key Block',
        regex: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g,
        severity: 'critical',
        fix: 'Never commit private keys. Add to .gitignore and rotate immediately.',
    },
    {
        id: 'SEC-006',
        name: 'GitHub Token',
        regex: /ghp_[A-Za-z0-9]{36}|ghs_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{82}/g,
        severity: 'critical',
        fix: 'Revoke at github.com/settings/tokens and use GitHub Secrets for CI.',
    },
    {
        id: 'SEC-007',
        name: 'Hardcoded JWT Secret',
        regex: /jwt[_-]?secret\s*[:=]\s*["']([^"']{8,})["']/gi,
        severity: 'critical',
        fix: 'Use a randomly generated 256-bit secret stored in environment variables.',
    },
    {
        id: 'SEC-008',
        name: 'Database Connection String with Credentials',
        regex: /(?:mongodb|mysql|postgres|postgresql):\/\/[^:]+:[^@]+@/gi,
        severity: 'high',
        fix: 'Use environment variable: DATABASE_URL=... and read via process.env.DATABASE_URL',
    },
    {
        id: 'SEC-009',
        name: 'eval() Usage',
        regex: /\beval\s*\(/g,
        severity: 'high',
        fix: 'Avoid eval(). Use JSON.parse() for JSON, or restructure to avoid dynamic code execution.',
    },
    {
        id: 'SEC-010',
        name: 'SQL String Concatenation (Injection Risk)',
        regex: /(?:execute|query|cursor\.execute)\s*\(\s*(?:f["']|["'].*?\+|\`.*?\$\{)/gi,
        severity: 'high',
        fix: 'Use parameterized queries or an ORM. Never concatenate user input into SQL strings.',
    },
    {
        id: 'SEC-011',
        name: 'dangerouslySetInnerHTML (XSS Risk)',
        regex: /dangerouslySetInnerHTML/g,
        severity: 'medium',
        fix: 'Sanitize content with DOMPurify before using dangerouslySetInnerHTML.',
    },
    {
        id: 'SEC-012',
        name: 'Insecure Math.random() for Security',
        regex: /Math\.random\(\)/g,
        severity: 'low',
        fix: 'Use crypto.randomBytes() or crypto.randomUUID() for security-sensitive randomness.',
    },
    {
        id: 'SEC-013',
        name: 'TODO / FIXME Security Comment',
        regex: /(?:TODO|FIXME|HACK|XXX).*(?:auth|security|password|secret|token|vulnerable|unsafe)/gi,
        severity: 'medium',
        fix: 'Address this security-related TODO before shipping to production.',
    },
    {
        id: 'SEC-014',
        name: 'Disabled SSL/TLS Verification',
        regex: /(?:verify\s*=\s*False|rejectUnauthorized:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]0['"])/gi,
        severity: 'high',
        fix: 'Never disable SSL/TLS verification in production. Use proper certificate management.',
    },
    {
        id: 'SEC-015',
        name: 'subprocess shell=True (Command Injection)',
        regex: /subprocess\.\w+\([^)]*shell\s*=\s*True/g,
        severity: 'high',
        fix: 'Use shell=False and pass arguments as a list to prevent command injection.',
    },
];
const SKIP_EXTENSIONS = new Set([
    '.md', '.txt', '.png', '.jpg', '.jpeg', '.gif', '.svg',
    '.ico', '.woff', '.woff2', '.ttf', '.eot', '.otf',
    '.lock', '.sum', '.mod',
]);
function analyzeSecrets(files) {
    const findings = [];
    for (const file of files) {
        const ext = '.' + file.relativePath.split('.').pop()?.toLowerCase();
        if (SKIP_EXTENSIONS.has(ext))
            continue;
        // Skip .env.example, test fixture files, and the analyzer/reporter source files themselves
        if (file.relativePath.includes('.env.example') ||
            file.relativePath.includes('fixtures') ||
            file.relativePath.includes('__mocks__') ||
            file.relativePath.includes('analyzers/static/secrets') ||
            file.relativePath.includes('analyzers/static/dependencies'))
            continue;
        const lines = file.content.split('\n');
        for (const pattern of SECRET_PATTERNS) {
            // Reset regex state
            pattern.regex.lastIndex = 0;
            for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
                const line = lines[lineIdx];
                pattern.regex.lastIndex = 0;
                if (pattern.regex.test(line)) {
                    // Mask sensitive values in snippet
                    const maskedLine = line.replace(/["'][A-Za-z0-9_\-./+]{8,}["']/g, (m) => `"${'*'.repeat(Math.min(m.length - 2, 12))}"`);
                    findings.push({
                        id: `${pattern.id}-${findings.length}`,
                        category: 'security',
                        severity: pattern.severity,
                        title: pattern.name,
                        description: `Potential ${pattern.name} found in source code.`,
                        file: file.relativePath,
                        line: lineIdx + 1,
                        snippet: maskedLine.trim().slice(0, 120),
                        fix: pattern.fix,
                    });
                }
            }
        }
    }
    return deduplicateFindings(findings);
}
function deduplicateFindings(findings) {
    const seen = new Set();
    return findings.filter(f => {
        const key = `${f.id.split('-').slice(0, 2).join('-')}:${f.file}:${f.line}`;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
//# sourceMappingURL=secrets.js.map