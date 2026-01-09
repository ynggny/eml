import { describe, it, expect } from 'vitest';
import { extractDMARCPolicy } from './verify';

describe('verify', () => {
  describe('extractDMARCPolicy', () => {
    it('noneポリシーを抽出する', () => {
      const record = 'v=DMARC1; p=none; rua=mailto:dmarc@example.com';
      expect(extractDMARCPolicy(record)).toBe('none');
    });

    it('quarantineポリシーを抽出する', () => {
      const record = 'v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com';
      expect(extractDMARCPolicy(record)).toBe('quarantine');
    });

    it('rejectポリシーを抽出する', () => {
      const record = 'v=DMARC1; p=reject; rua=mailto:dmarc@example.com';
      expect(extractDMARCPolicy(record)).toBe('reject');
    });

    it('ポリシーが見つからない場合はnullを返す', () => {
      const record = 'v=DMARC1; rua=mailto:dmarc@example.com';
      expect(extractDMARCPolicy(record)).toBeNull();
    });

    it('不正なポリシー値の場合はnullを返す', () => {
      const record = 'v=DMARC1; p=invalid';
      expect(extractDMARCPolicy(record)).toBeNull();
    });
  });
});
