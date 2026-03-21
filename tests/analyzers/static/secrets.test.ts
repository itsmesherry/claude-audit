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
  it('returns empty array for clean files', () => {
    const files = [makeFile('src/app.ts', 'const x = 1;\nconsole.log(x);')];
    expect(analyzeSecrets(files)).toEqual([]);
  });

  it('detects hardcoded API keys', () => {
    const files = [makeFile('src/config.ts', 'const api_key = "sk1234567890abcdef";')];
    const findings = analyzeSecrets(files);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].title).toBe('Hardcoded API Key');
    expect(findings[0].severity).toBe('critical');
    expect(findings[0].category).toBe('security');
  });

  it('detects hardcoded passwords', () => {
    const files = [makeFile('src/db.ts', 'const password = "supersecret123";')];
    const findings = analyzeSecrets(files);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings.some(f => f.title === 'Hardcoded Secret / Password')).toBe(true);
  });

  it('detects AWS access keys', () => {
    const files = [makeFile('src/aws.ts', 'const key = "AKIAIOSFODNN7EXAMPLE";')];
    const findings = analyzeSecrets(files);
    expect(findings.some(f => f.title === 'AWS Access Key')).toBe(true);
  });

  it('detects private key blocks', () => {
    const files = [makeFile('src/cert.ts', '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAK...')];
    const findings = analyzeSecrets(files);
    expect(findings.some(f => f.title === 'Private Key Block')).toBe(true);
  });

  it('detects GitHub tokens', () => {
    const files = [makeFile('src/gh.ts', 'const token = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij";')];
    const findings = analyzeSecrets(files);
    expect(findings.some(f => f.title === 'GitHub Token')).toBe(true);
  });

  it('detects eval() usage', () => {
    const files = [makeFile('src/exec.ts', 'const result = eval("2 + 2");')];
    const findings = analyzeSecrets(files);
    expect(findings.some(f => f.title === 'eval() Usage')).toBe(true);
  });

  it('detects database connection strings with credentials', () => {
    const content = 'const db = "mongodb://admin:pass123@localhost:27017/mydb";';
    const files = [makeFile('src/db.ts', content)];
    const findings = analyzeSecrets(files);
    expect(findings.some(f => f.title === 'Database Connection String with Credentials')).toBe(true);
  });

  it('detects dangerouslySetInnerHTML', () => {
    const content = '<div dangerouslySetInnerHTML={{__html: userInput}} />';
    const files = [makeFile('src/component.tsx', content)];
    const findings = analyzeSecrets(files);
    expect(findings.some(f => f.title === 'dangerouslySetInnerHTML (XSS Risk)')).toBe(true);
  });

  it('detects disabled SSL verification', () => {
    const content = 'const opts = { rejectUnauthorized: false };';
    const files = [makeFile('src/http.ts', content)];
    const findings = analyzeSecrets(files);
    expect(findings.some(f => f.title === 'Disabled SSL/TLS Verification')).toBe(true);
  });

  it('detects JWT secret hardcoding', () => {
    const content = 'const jwt_secret = "my-jwt-secret-key-here";';
    const files = [makeFile('src/auth.ts', content)];
    const findings = analyzeSecrets(files);
    expect(findings.some(f => f.title === 'Hardcoded JWT Secret')).toBe(true);
  });

  it('skips non-code files by extension', () => {
    const files = [makeFile('README.md', 'api_key = "sk1234567890abcdef";')];
    expect(analyzeSecrets(files)).toEqual([]);
  });

  it('skips .lock files', () => {
    const files = [makeFile('yarn.lock', 'password = "something";')];
    expect(analyzeSecrets(files)).toEqual([]);
  });

  it('skips fixture and mock files', () => {
    const files = [
      makeFile('tests/fixtures/config.ts', 'const api_key = "sk1234567890abcdef";'),
      makeFile('tests/__mocks__/auth.ts', 'const password = "supersecret123";'),
    ];
    expect(analyzeSecrets(files)).toEqual([]);
  });

  it('masks sensitive values in snippets', () => {
    const files = [makeFile('src/config.ts', 'const api_key = "sk1234567890abcdef";')];
    const findings = analyzeSecrets(files);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].snippet).not.toContain('sk1234567890abcdef');
    expect(findings[0].snippet).toContain('*');
  });

  it('deduplicates findings at the same file:line', () => {
    const content = 'const api_key = "sk1234567890abcdef"; const password = "supersecret123";';
    const files = [makeFile('src/config.ts', content)];
    const findings = analyzeSecrets(files);
    const keys = findings.map(f => `${f.file}:${f.line}`);
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

  it('reports correct line numbers', () => {
    const content = 'line one\nline two\nconst api_key = "sk1234567890abcdef";\nline four';
    const files = [makeFile('src/config.ts', content)];
    const findings = analyzeSecrets(files);
    expect(findings[0].line).toBe(3);
  });

  it('handles multiple files', () => {
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
