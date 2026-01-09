import { describe, it, expect } from 'vitest';
import { parseAuthResults } from './emlParser';
import type { Header } from './emlParser';

describe('emlParser', () => {
  describe('parseAuthResults', () => {
    it('Authentication-Resultsヘッダーからspf/dkim/dmarcを抽出する', () => {
      const headers: Header[] = [
        {
          key: 'Authentication-Results',
          value:
            'mx.example.com; spf=pass; dkim=pass; dmarc=pass',
        },
      ];

      const result = parseAuthResults(headers);

      expect(result).toEqual({
        spf: 'pass',
        dkim: 'pass',
        dmarc: 'pass',
      });
    });

    it('failステータスを正しく抽出する', () => {
      const headers: Header[] = [
        {
          key: 'authentication-results',
          value: 'mx.example.com; spf=fail; dkim=fail; dmarc=fail',
        },
      ];

      const result = parseAuthResults(headers);

      expect(result).toEqual({
        spf: 'fail',
        dkim: 'fail',
        dmarc: 'fail',
      });
    });

    it('一部のステータスのみ存在する場合も正しく抽出する', () => {
      const headers: Header[] = [
        {
          key: 'Authentication-Results',
          value: 'mx.example.com; spf=softfail',
        },
      ];

      const result = parseAuthResults(headers);

      expect(result).toEqual({
        spf: 'softfail',
      });
    });

    it('Authentication-Resultsヘッダーがない場合はnullを返す', () => {
      const headers: Header[] = [
        { key: 'From', value: 'test@example.com' },
        { key: 'Subject', value: 'Test' },
      ];

      const result = parseAuthResults(headers);

      expect(result).toBeNull();
    });

    it('認証情報が含まれないAuthentication-Resultsの場合はnullを返す', () => {
      const headers: Header[] = [
        {
          key: 'Authentication-Results',
          value: 'mx.example.com; none',
        },
      ];

      const result = parseAuthResults(headers);

      expect(result).toBeNull();
    });

    it('neutralステータスを正しく抽出する', () => {
      const headers: Header[] = [
        {
          key: 'Authentication-Results',
          value: 'mx.example.com; spf=neutral',
        },
      ];

      const result = parseAuthResults(headers);

      expect(result).toEqual({
        spf: 'neutral',
      });
    });
  });
});
