import { normalizeFinding, normalizeFindings, normalizeScore } from '../../../src/analyzers/ai/normalize';

describe('normalizeScore', () => {
  it('rounds and clamps numbers to 0–100', () => {
    expect(normalizeScore(72.6, 50)).toBe(73);
    expect(normalizeScore(140, 50)).toBe(100);
    expect(normalizeScore(-5, 50)).toBe(0);
  });

  it('uses the fallback for anything that is not a finite number', () => {
    expect(normalizeScore(undefined, 50)).toBe(50);
    expect(normalizeScore('90', 50)).toBe(50);
    expect(normalizeScore(NaN, 50)).toBe(50);
  });
});

describe('normalizeFinding', () => {
  it('lower-cases a valid severity and defaults an unknown one to medium', () => {
    expect(normalizeFinding({ severity: 'Critical' }, 'security', 'X-1').severity).toBe('critical');
    expect(normalizeFinding({ severity: 'catastrophic' }, 'security', 'X-1').severity).toBe('medium');
    expect(normalizeFinding({}, 'security', 'X-1').severity).toBe('medium');
  });

  it('drops a line that is not a positive integer', () => {
    expect(normalizeFinding({ line: 12 }, 'quality', 'X-1').line).toBe(12);
    expect(normalizeFinding({ line: '12' }, 'quality', 'X-1').line).toBe(12);
    expect(normalizeFinding({ line: '<img src=x onerror=alert(1)>' }, 'quality', 'X-1').line).toBeUndefined();
    expect(normalizeFinding({ line: 0 }, 'quality', 'X-1').line).toBeUndefined();
  });

  it('forces the category and fills in missing text fields', () => {
    const finding = normalizeFinding({ category: 'security', title: 42 }, 'testing', 'TES-AI-1');
    expect(finding).toMatchObject({ id: 'TES-AI-1', category: 'testing', title: 'Untitled finding', description: '' });
  });

  it('masks credentials the model quotes', () => {
    const finding = normalizeFinding(
      { snippet: 'const k = "AKIAIOSFODNN7EXAMPLE"', description: 'Uses postgres://admin:hunter2@db/app' },
      'security', 'X-1',
    );
    expect(finding.snippet).not.toContain('IOSFODNN7EXAMPLE');
    expect(finding.description).toBe('Uses postgres://admin:****@db/app');
  });

  it('survives input that is not an object', () => {
    expect(normalizeFinding('oops', 'quality', 'X-1').title).toBe('Untitled finding');
    expect(normalizeFindings('oops', 'quality', 'X')).toEqual([]);
    expect(normalizeFindings([null, { title: 't' }], 'quality', 'X').map(f => f.id)).toEqual(['X-1', 'X-2']);
  });
});
