import { analyzeSecrets } from '../../../src/analyzers/static/secrets';
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

describe('analyzeSecrets', () => {
  describe('clean inputs', () => {
    it('returns empty array for clean code', () => {
      const files = [makeFile('src/app.ts', 'const x = 1;\nconsole.log(x);')];
      expect(analyzeSecrets(files)).toEqual([]);
    });

    it('returns empty array for empty file list', () => {
      expect(analyzeSecrets([])).toEqual([]);
    });

    it('returns empty array for file with empty content', () => {
      const files = [makeFile('src/empty.ts', '')];
      expect(analyzeSecrets(files)).toEqual([]);
    });
  });

  describe('pattern detection — every pattern must be covered', () => {
    it('SEC-001: detects hardcoded API keys', () => {
      const files = [makeFile('src/config.ts', 'const api_key = "sk1234567890abcdef";')];
      const findings = analyzeSecrets(files);
      expect(findings.length).toBeGreaterThanOrEqual(1);
      expect(findings[0].title).toBe('Hardcoded API Key');
      expect(findings[0].severity).toBe('critical');
      expect(findings[0].category).toBe('security');
    });

    it('SEC-001: detects apikey with different separators', () => {
      const files = [makeFile('src/cfg.ts', 'const apiKey = "abcdef1234567890xx";')];
      const findings = analyzeSecrets(files);
      expect(findings.some(f => f.title === 'Hardcoded API Key')).toBe(true);
    });

    it('SEC-002: detects hardcoded passwords', () => {
      const files = [makeFile('src/db.ts', 'const password = "supersecret123";')];
      const findings = analyzeSecrets(files);
      expect(findings.some(f => f.title === 'Hardcoded Secret / Password')).toBe(true);
    });

    it('SEC-002: detects pwd and passwd variants', () => {
      const files = [makeFile('src/db.ts', 'const pwd = "mysecretpw1";')];
      const findings = analyzeSecrets(files);
      expect(findings.some(f => f.title === 'Hardcoded Secret / Password')).toBe(true);
    });

    it('SEC-003: detects Anthropic API keys (sk-ant-...)', () => {
      const key = 'sk-ant-' + 'a'.repeat(30) + '-BBBBBBBBBB';
      const files = [makeFile('src/ai.ts', `const key = "${key}";`)];
      const findings = analyzeSecrets(files);
      expect(findings.some(f => f.title === 'Anthropic / OpenAI Key Exposed')).toBe(true);
    });

    it('SEC-003: detects OpenAI-style keys (sk-...)', () => {
      const key = 'sk-' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6';
      const files = [makeFile('src/ai.ts', `const key = "${key}";`)];
      const findings = analyzeSecrets(files);
      expect(findings.some(f => f.title === 'Anthropic / OpenAI Key Exposed')).toBe(true);
    });

    it('SEC-004: detects AWS access keys', () => {
      const files = [makeFile('src/aws.ts', 'const key = "AKIAIOSFODNN7EXAMPLE";')];
      const findings = analyzeSecrets(files);
      expect(findings.some(f => f.title === 'AWS Access Key')).toBe(true);
    });

    it('SEC-005: detects RSA private key blocks', () => {
      const files = [makeFile('src/cert.ts', '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAK...')];
      const findings = analyzeSecrets(files);
      expect(findings.some(f => f.title === 'Private Key Block')).toBe(true);
    });

    it('SEC-005: detects EC private key blocks', () => {
      const files = [makeFile('src/cert.ts', '-----BEGIN EC PRIVATE KEY-----\nMHQCAQE...')];
      const findings = analyzeSecrets(files);
      expect(findings.some(f => f.title === 'Private Key Block')).toBe(true);
    });

    it('SEC-006: detects GitHub personal access tokens (ghp_)', () => {
      const files = [makeFile('src/gh.ts', 'const token = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij";')];
      const findings = analyzeSecrets(files);
      expect(findings.some(f => f.title === 'GitHub Token')).toBe(true);
    });

    it('SEC-007: detects hardcoded JWT secrets', () => {
      const files = [makeFile('src/auth.ts', 'const jwt_secret = "my-jwt-secret-key-here";')];
      const findings = analyzeSecrets(files);
      expect(findings.some(f => f.title === 'Hardcoded JWT Secret')).toBe(true);
    });

    it('SEC-008: detects MongoDB connection strings with credentials', () => {
      const files = [makeFile('src/db.ts', 'const db = "mongodb://admin:pass123@localhost:27017/mydb";')];
      const findings = analyzeSecrets(files);
      expect(findings.some(f => f.title === 'Database Connection String with Credentials')).toBe(true);
    });

    it('SEC-008: detects PostgreSQL connection strings with credentials', () => {
      const files = [makeFile('src/db.ts', 'const db = "postgresql://user:secret@db.host:5432/prod";')];
      const findings = analyzeSecrets(files);
      expect(findings.some(f => f.title === 'Database Connection String with Credentials')).toBe(true);
    });

    it('SEC-009: detects eval() usage', () => {
      const files = [makeFile('src/exec.ts', 'const result = eval("2 + 2");')];
      const findings = analyzeSecrets(files);
      expect(findings.some(f => f.title === 'eval() Usage')).toBe(true);
    });

    it('SEC-010: detects SQL string concatenation with template literals', () => {
      const content = 'db.query(`SELECT * FROM users WHERE id = ${userId}`)';
      const files = [makeFile('src/db.ts', content)];
      const findings = analyzeSecrets(files);
      expect(findings.some(f => f.title === 'SQL String Concatenation (Injection Risk)')).toBe(true);
    });

    it('SEC-011: detects dangerouslySetInnerHTML', () => {
      const content = '<div dangerouslySetInnerHTML={{__html: userInput}} />';
      const files = [makeFile('src/component.tsx', content)];
      const findings = analyzeSecrets(files);
      expect(findings.some(f => f.title === 'dangerouslySetInnerHTML (XSS Risk)')).toBe(true);
    });

    it('SEC-012: detects Math.random() used for security-sensitive values', () => {
      const content = 'const token = Math.random().toString(36);';
      const files = [makeFile('src/auth.ts', content)];
      const findings = analyzeSecrets(files);
      expect(findings.some(f => f.title === 'Insecure Math.random() for Security')).toBe(true);
    });

    it('SEC-013: detects security-related TODO comments', () => {
      const content = '// TODO: fix authentication bypass vulnerability';
      const files = [makeFile('src/auth.ts', content)];
      const findings = analyzeSecrets(files);
      expect(findings.some(f => f.title === 'TODO / FIXME Security Comment')).toBe(true);
    });

    it('SEC-013: detects FIXME comments about secrets', () => {
      const content = '// FIXME: hardcoded secret token needs to be removed';
      const files = [makeFile('src/config.ts', content)];
      const findings = analyzeSecrets(files);
      expect(findings.some(f => f.title === 'TODO / FIXME Security Comment')).toBe(true);
    });

    it('SEC-014: detects disabled SSL/TLS verification (Node.js)', () => {
      const content = 'const opts = { rejectUnauthorized: false };';
      const files = [makeFile('src/http.ts', content)];
      const findings = analyzeSecrets(files);
      expect(findings.some(f => f.title === 'Disabled SSL/TLS Verification')).toBe(true);
    });

    it('SEC-014: detects disabled SSL/TLS verification (Python)', () => {
      const content = 'requests.get(url, verify=False)';
      const files = [makeFile('src/client.py', content)];
      const findings = analyzeSecrets(files);
      expect(findings.some(f => f.title === 'Disabled SSL/TLS Verification')).toBe(true);
    });

    it('SEC-015: detects subprocess shell=True (command injection)', () => {
      const content = 'subprocess.call("ls -la", shell=True)';
      const files = [makeFile('src/run.py', content)];
      const findings = analyzeSecrets(files);
      expect(findings.some(f => f.title === 'subprocess shell=True (Command Injection)')).toBe(true);
    });
  });

  describe('file skipping logic', () => {
    it('skips non-code files by extension (.md)', () => {
      const files = [makeFile('README.md', 'api_key = "sk1234567890abcdef";')];
      expect(analyzeSecrets(files)).toEqual([]);
    });

    it('skips .txt files', () => {
      const files = [makeFile('notes.txt', 'password = "supersecret123";')];
      expect(analyzeSecrets(files)).toEqual([]);
    });

    it('skips .lock files', () => {
      const files = [makeFile('yarn.lock', 'password = "something";')];
      expect(analyzeSecrets(files)).toEqual([]);
    });

    it('skips .env.example files', () => {
      const files = [makeFile('.env.example', 'API_KEY = "placeholder12345678";')];
      expect(analyzeSecrets(files)).toEqual([]);
    });

    it('skips test fixture files', () => {
      const files = [makeFile('tests/fixtures/config.ts', 'const api_key = "sk1234567890abcdef";')];
      expect(analyzeSecrets(files)).toEqual([]);
    });

    it('skips __mocks__ files', () => {
      const files = [makeFile('tests/__mocks__/auth.ts', 'const password = "supersecret123";')];
      expect(analyzeSecrets(files)).toEqual([]);
    });

    it('skips its own source file (analyzers/static/secrets)', () => {
      const files = [makeFile('src/analyzers/static/secrets.ts', 'const api_key = "sk1234567890abcdef";')];
      expect(analyzeSecrets(files)).toEqual([]);
    });
  });

  describe('output quality', () => {
    it('masks sensitive values in snippets', () => {
      const files = [makeFile('src/config.ts', 'const api_key = "sk1234567890abcdef";')];
      const findings = analyzeSecrets(files);
      expect(findings.length).toBeGreaterThanOrEqual(1);
      expect(findings[0].snippet).not.toContain('sk1234567890abcdef');
      expect(findings[0].snippet).toContain('*');
    });

    it('truncates very long snippets to 120 chars', () => {
      const longLine = 'const api_key = "' + 'a'.repeat(200) + '";';
      const files = [makeFile('src/config.ts', longLine)];
      const findings = analyzeSecrets(files);
      expect(findings.length).toBeGreaterThanOrEqual(1);
      expect(findings[0].snippet!.length).toBeLessThanOrEqual(120);
    });

    it('reports correct line numbers', () => {
      const content = 'line one\nline two\nconst api_key = "sk1234567890abcdef";\nline four';
      const files = [makeFile('src/config.ts', content)];
      const findings = analyzeSecrets(files);
      expect(findings[0].line).toBe(3);
    });

    it('reports correct file paths', () => {
      const files = [makeFile('src/deep/nested/config.ts', 'const api_key = "sk1234567890abcdef";')];
      const findings = analyzeSecrets(files);
      expect(findings[0].file).toBe('src/deep/nested/config.ts');
    });

    it('includes actionable fix suggestions', () => {
      const files = [makeFile('src/config.ts', 'const api_key = "sk1234567890abcdef";')];
      const findings = analyzeSecrets(files);
      expect(findings[0].fix).toBeDefined();
      expect(findings[0].fix!.length).toBeGreaterThan(0);
    });
  });

  describe('deduplication', () => {
    it('deduplicates same pattern at same file:line', () => {
      const content = 'const api_key = "sk1234567890abcdef"; const password = "supersecret123";';
      const files = [makeFile('src/config.ts', content)];
      const findings = analyzeSecrets(files);
      const uniquePatternLocations = new Map<string, number>();
      for (const f of findings) {
        const patternKey = f.id.split('-').slice(0, 2).join('-');
        const locKey = `${patternKey}:${f.file}:${f.line}`;
        uniquePatternLocations.set(locKey, (uniquePatternLocations.get(locKey) ?? 0) + 1);
      }
      for (const count of uniquePatternLocations.values()) {
        expect(count).toBe(1);
      }
    });

    it('keeps findings from different lines in same file', () => {
      const content = 'const api_key = "sk1234567890abcdef";\nconst other_api_key = "abcdef1234567890xx";';
      const files = [makeFile('src/config.ts', content)];
      const findings = analyzeSecrets(files);
      const apiKeyFindings = findings.filter(f => f.title === 'Hardcoded API Key');
      expect(apiKeyFindings.length).toBe(2);
      expect(apiKeyFindings[0].line).toBe(1);
      expect(apiKeyFindings[1].line).toBe(2);
    });
  });

  describe('multi-file scanning', () => {
    it('scans across multiple files and attributes correctly', () => {
      const files = [
        makeFile('src/a.ts', 'const api_key = "sk1234567890abcdef";'),
        makeFile('src/b.ts', 'eval("code")'),
        makeFile('src/c.ts', 'const clean = true;'),
      ];
      const findings = analyzeSecrets(files);
      const affectedFiles = new Set(findings.map(f => f.file));
      expect(affectedFiles.has('src/a.ts')).toBe(true);
      expect(affectedFiles.has('src/b.ts')).toBe(true);
      expect(affectedFiles.has('src/c.ts')).toBe(false);
    });
  });
});
