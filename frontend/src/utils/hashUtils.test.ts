import { describe, it, expect } from 'vitest';
import { computeSHA256 } from './hashUtils';

describe('hashUtils', () => {
  describe('computeSHA256', () => {
    it('空のデータに対して正しいハッシュを計算する', async () => {
      const emptyBuffer = new ArrayBuffer(0);
      const hash = await computeSHA256(emptyBuffer);

      // 空データのSHA-256は既知の値
      expect(hash).toBe(
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
      );
    });

    it('テキストデータに対して正しいハッシュを計算する', async () => {
      const text = 'hello';
      const encoder = new TextEncoder();
      const buffer = encoder.encode(text).buffer as ArrayBuffer;
      const hash = await computeSHA256(buffer);

      // "hello"のSHA-256は既知の値
      expect(hash).toBe(
        '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
      );
    });

    it('64文字の16進数文字列を返す', async () => {
      const buffer = new ArrayBuffer(10);
      const hash = await computeSHA256(buffer);

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
