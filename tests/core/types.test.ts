import { scoreToGrade } from '../../src/core/types';

describe('scoreToGrade', () => {
  it('returns A for scores >= 90', () => {
    expect(scoreToGrade(90)).toBe('A');
    expect(scoreToGrade(95)).toBe('A');
    expect(scoreToGrade(100)).toBe('A');
  });

  it('returns B for scores 75-89', () => {
    expect(scoreToGrade(75)).toBe('B');
    expect(scoreToGrade(89)).toBe('B');
  });

  it('returns C for scores 60-74', () => {
    expect(scoreToGrade(60)).toBe('C');
    expect(scoreToGrade(74)).toBe('C');
  });

  it('returns D for scores 45-59', () => {
    expect(scoreToGrade(45)).toBe('D');
    expect(scoreToGrade(59)).toBe('D');
  });

  it('returns F for scores < 45', () => {
    expect(scoreToGrade(44)).toBe('F');
    expect(scoreToGrade(0)).toBe('F');
  });

  it('handles exact boundary values', () => {
    expect(scoreToGrade(89.9)).toBe('B');
    expect(scoreToGrade(90)).toBe('A');
    expect(scoreToGrade(74.9)).toBe('C');
    expect(scoreToGrade(75)).toBe('B');
    expect(scoreToGrade(59.9)).toBe('D');
    expect(scoreToGrade(60)).toBe('C');
    expect(scoreToGrade(44.9)).toBe('F');
    expect(scoreToGrade(45)).toBe('D');
  });

  it('handles negative scores', () => {
    expect(scoreToGrade(-1)).toBe('F');
    expect(scoreToGrade(-100)).toBe('F');
  });

  it('handles scores above 100', () => {
    expect(scoreToGrade(101)).toBe('A');
    expect(scoreToGrade(999)).toBe('A');
  });

  it('handles NaN gracefully', () => {
    expect(scoreToGrade(NaN)).toBe('F');
  });
});
