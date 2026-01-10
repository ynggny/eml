/**
 * エクスポート機能のテスト
 *
 * 文字コード検出、トークン生成/検証、エクスポート処理をテスト
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeEncoding,
  detectEncoding,
  decodeToUtf8,
  isTextMimeType,
  processExport,
  generateExportToken,
  verifyExportToken,
  generateExportId,
  getSupportedEncodings,
  type SupportedEncoding,
} from './export';

describe('export', () => {
  describe('normalizeEncoding', () => {
    it('UTF-8の正規化', () => {
      expect(normalizeEncoding('utf-8')).toBe('utf-8');
      expect(normalizeEncoding('UTF-8')).toBe('utf-8');
      expect(normalizeEncoding('utf8')).toBe('utf-8');
    });

    it('Shift_JISの正規化', () => {
      expect(normalizeEncoding('shift_jis')).toBe('shift_jis');
      expect(normalizeEncoding('Shift_JIS')).toBe('shift_jis');
      expect(normalizeEncoding('sjis')).toBe('shift_jis');
      expect(normalizeEncoding('SJIS')).toBe('shift_jis');
      expect(normalizeEncoding('cp932')).toBe('shift_jis');
      expect(normalizeEncoding('windows-31j')).toBe('shift_jis');
    });

    it('EUC-JPの正規化', () => {
      expect(normalizeEncoding('euc-jp')).toBe('euc-jp');
      expect(normalizeEncoding('EUC-JP')).toBe('euc-jp');
      expect(normalizeEncoding('eucjp')).toBe('euc-jp');
    });

    it('ISO-2022-JPの正規化', () => {
      expect(normalizeEncoding('iso-2022-jp')).toBe('iso-2022-jp');
      expect(normalizeEncoding('ISO-2022-JP')).toBe('iso-2022-jp');
      expect(normalizeEncoding('jis')).toBe('iso-2022-jp');
    });

    it('UTF-16の正規化', () => {
      expect(normalizeEncoding('utf-16')).toBe('utf-16');
      expect(normalizeEncoding('utf-16be')).toBe('utf-16be');
      expect(normalizeEncoding('utf-16le')).toBe('utf-16le');
    });

    it('不明なエンコーディングはnullを返す', () => {
      expect(normalizeEncoding('unknown')).toBeNull();
      expect(normalizeEncoding('invalid-encoding')).toBeNull();
    });
  });

  describe('detectEncoding', () => {
    it('UTF-8 BOMを検出', () => {
      const data = new Uint8Array([0xef, 0xbb, 0xbf, 0x48, 0x65, 0x6c, 0x6c, 0x6f]);
      expect(detectEncoding(data.buffer)).toBe('utf-8');
    });

    it('UTF-16BE BOMを検出', () => {
      const data = new Uint8Array([0xfe, 0xff, 0x00, 0x48, 0x00, 0x65]);
      expect(detectEncoding(data.buffer)).toBe('utf-16be');
    });

    it('UTF-16LE BOMを検出', () => {
      const data = new Uint8Array([0xff, 0xfe, 0x48, 0x00, 0x65, 0x00]);
      expect(detectEncoding(data.buffer)).toBe('utf-16le');
    });

    it('ISO-2022-JPのESCシーケンスを検出', () => {
      // ESC $ B (JIS X 0208)
      const data = new Uint8Array([0x1b, 0x24, 0x42, 0x30, 0x22]);
      expect(detectEncoding(data.buffer)).toBe('iso-2022-jp');
    });

    it('ISO-2022-JPのESC ( Bシーケンスを検出', () => {
      // ESC ( B (ASCII)
      const data = new Uint8Array([0x1b, 0x28, 0x42, 0x48, 0x65, 0x6c, 0x6c, 0x6f]);
      expect(detectEncoding(data.buffer)).toBe('iso-2022-jp');
    });

    it('Shift_JISを検出', () => {
      // "こんにちは" in Shift_JIS: 0x82 0xb1 0x82 0xf1 0x82 0xc9 0x82 0xbf 0x82 0xcd
      const data = new Uint8Array([0x82, 0xb1, 0x82, 0xf1, 0x82, 0xc9, 0x82, 0xbf, 0x82, 0xcd]);
      expect(detectEncoding(data.buffer)).toBe('shift_jis');
    });

    it('EUC-JPを検出', () => {
      // "あ" in EUC-JP: 0xa4 0xa2
      // 複数のEUC-JP文字を追加
      const data = new Uint8Array([0xa4, 0xa2, 0xa4, 0xa4, 0xa4, 0xa6]);
      expect(detectEncoding(data.buffer)).toBe('euc-jp');
    });

    it('UTF-8マルチバイト文字を検出', () => {
      // UTF-8の日本語はShift_JISと重複するバイトパターンがあるため、
      // BOM付きか、UTF-8固有のパターンを含むデータでテスト
      // 絵文字はUTF-8で4バイトになり、Shift_JISでは表現できない
      const text = 'Hello 😀 World';
      const encoder = new TextEncoder();
      const encoded = encoder.encode(text);
      const data = encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer;
      expect(detectEncoding(data)).toBe('utf-8');
    });

    it('ASCII文字のみの場合はshift_jisを返す', () => {
      // 純粋なASCIIの場合、デフォルトでshift_jis
      const data = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
      expect(detectEncoding(data.buffer)).toBe('shift_jis');
    });
  });

  describe('decodeToUtf8', () => {
    it('UTF-8をデコード', () => {
      const text = 'Hello, 世界!';
      const encoder = new TextEncoder();
      const encoded = encoder.encode(text);
      const data = encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer;
      expect(decodeToUtf8(data, 'utf-8')).toBe(text);
    });

    it('ASCII文字をデコード', () => {
      const data = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
      expect(decodeToUtf8(data.buffer as ArrayBuffer, 'utf-8')).toBe('Hello');
    });
  });

  describe('isTextMimeType', () => {
    it('text/*はテキスト', () => {
      expect(isTextMimeType('text/plain')).toBe(true);
      expect(isTextMimeType('text/html')).toBe(true);
      expect(isTextMimeType('text/css')).toBe(true);
      expect(isTextMimeType('text/javascript')).toBe(true);
    });

    it('application/jsonはテキスト', () => {
      expect(isTextMimeType('application/json')).toBe(true);
    });

    it('application/xmlはテキスト', () => {
      expect(isTextMimeType('application/xml')).toBe(true);
    });

    it('application/javascriptはテキスト', () => {
      expect(isTextMimeType('application/javascript')).toBe(true);
      expect(isTextMimeType('application/x-javascript')).toBe(true);
    });

    it('バイナリファイルはテキストではない', () => {
      expect(isTextMimeType('application/octet-stream')).toBe(false);
      expect(isTextMimeType('application/pdf')).toBe(false);
      expect(isTextMimeType('image/png')).toBe(false);
      expect(isTextMimeType('image/jpeg')).toBe(false);
    });
  });

  describe('processExport', () => {
    it('バイナリファイルはそのまま返却', () => {
      const content = btoa('binary data');
      const result = processExport({
        content,
        filename: 'test.bin',
        mimeType: 'application/octet-stream',
        convertEncoding: false,
      });

      expect(result.content).toBe(content);
      expect(result.filename).toBe('test.bin');
      expect(result.mimeType).toBe('application/octet-stream');
      expect(result.detectedEncoding).toBeUndefined();
    });

    it('テキストファイルの文字コード変換', () => {
      // UTF-8のテキスト
      const text = 'Hello, World!';
      const encoder = new TextEncoder();
      const bytes = encoder.encode(text);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const content = btoa(binary);

      const result = processExport({
        content,
        filename: 'test.txt',
        mimeType: 'text/plain',
        convertEncoding: true,
      });

      expect(result.filename).toBe('test.txt');
      expect(result.mimeType).toBe('text/plain');
      expect(result.appliedEncoding).toBe('utf-8');
    });

    it('変換フラグがfalseならそのまま返却', () => {
      const content = btoa('test content');
      const result = processExport({
        content,
        filename: 'test.txt',
        mimeType: 'text/plain',
        convertEncoding: false,
      });

      expect(result.content).toBe(content);
      expect(result.detectedEncoding).toBeUndefined();
    });
  });

  describe('generateExportId', () => {
    it('32文字の16進数文字列を生成', () => {
      const id = generateExportId();
      expect(id).toHaveLength(32);
      expect(id).toMatch(/^[0-9a-f]{32}$/);
    });

    it('毎回異なるIDを生成', () => {
      const id1 = generateExportId();
      const id2 = generateExportId();
      const id3 = generateExportId();
      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });
  });

  describe('generateExportToken / verifyExportToken', () => {
    const secret = 'test-secret-key-for-hmac';
    const exportId = 'test-export-id-123';

    it('トークンを生成して検証できる', async () => {
      const token = await generateExportToken(exportId, secret, 60);
      expect(token).toBeTruthy();
      expect(token).toContain('.');

      const verifiedId = await verifyExportToken(token, secret);
      expect(verifiedId).toBe(exportId);
    });

    it('異なるシークレットでは検証失敗', async () => {
      const token = await generateExportToken(exportId, secret, 60);
      const verifiedId = await verifyExportToken(token, 'wrong-secret');
      expect(verifiedId).toBeNull();
    });

    it('期限切れトークンは検証失敗', async () => {
      // 1秒だけ有効
      const token = await generateExportToken(exportId, secret, -1);
      const verifiedId = await verifyExportToken(token, secret);
      expect(verifiedId).toBeNull();
    });

    it('不正なトークン形式は検証失敗', async () => {
      expect(await verifyExportToken('invalid-token', secret)).toBeNull();
      expect(await verifyExportToken('', secret)).toBeNull();
      expect(await verifyExportToken('no.dot.here.invalid', secret)).toBeNull();
    });

    it('改ざんされたトークンは検証失敗', async () => {
      const token = await generateExportToken(exportId, secret, 60);
      // ペイロードを改ざん
      const [, signature] = token.split('.');
      const tamperedPayload = btoa(JSON.stringify({ id: 'tampered-id', exp: Math.floor(Date.now() / 1000) + 3600 }));
      const tamperedToken = `${tamperedPayload}.${signature}`;
      const verifiedId = await verifyExportToken(tamperedToken, secret);
      expect(verifiedId).toBeNull();
    });
  });

  describe('getSupportedEncodings', () => {
    it('サポートされるエンコーディング一覧を返す', () => {
      const encodings = getSupportedEncodings();
      expect(Array.isArray(encodings)).toBe(true);
      expect(encodings.length).toBeGreaterThan(0);

      // UTF-8が含まれている
      const utf8 = encodings.find((e) => e.encoding === 'utf-8');
      expect(utf8).toBeDefined();
      expect(utf8?.name).toBe('UTF-8');

      // Shift_JISが含まれている
      const sjis = encodings.find((e) => e.encoding === 'shift_jis');
      expect(sjis).toBeDefined();
      expect(sjis?.name).toBe('Shift_JIS');

      // ISO-2022-JPが含まれている
      const iso2022jp = encodings.find((e) => e.encoding === 'iso-2022-jp');
      expect(iso2022jp).toBeDefined();
      expect(iso2022jp?.name).toBe('ISO-2022-JP');
    });
  });
});

describe('encoding detection edge cases', () => {
  it('空のデータはshift_jisを返す', () => {
    const data = new Uint8Array([]);
    expect(detectEncoding(data.buffer)).toBe('shift_jis');
  });

  it('1バイトのデータを処理できる', () => {
    const data = new Uint8Array([0x41]); // 'A'
    expect(detectEncoding(data.buffer)).toBe('shift_jis');
  });

  it('混在した日本語エンコーディングはスコアで判定', () => {
    // Shift_JISの半角カナが多い場合
    const sjisKana = new Uint8Array([0xa7, 0xb1, 0xb2, 0xb3, 0xb4, 0xb5]);
    const result = detectEncoding(sjisKana.buffer);
    // 半角カナはShift_JISとして検出されるべき
    expect(['shift_jis', 'euc-jp']).toContain(result);
  });

  it('BOM付きUTF-8は正しく検出', () => {
    // UTF-8 BOM + 日本語
    const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
    const text = new TextEncoder().encode('こんにちは');
    const combined = new Uint8Array(bom.length + text.length);
    combined.set(bom);
    combined.set(text, bom.length);
    expect(detectEncoding(combined.buffer)).toBe('utf-8');
  });
});

describe('processExport with different content types', () => {
  it('JSONファイルはテキストとして処理', () => {
    const json = JSON.stringify({ message: 'Hello' });
    const encoder = new TextEncoder();
    const bytes = encoder.encode(json);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const content = btoa(binary);

    const result = processExport({
      content,
      filename: 'data.json',
      mimeType: 'application/json',
      convertEncoding: true,
    });

    expect(result.appliedEncoding).toBe('utf-8');
  });

  it('HTMLファイルはテキストとして処理', () => {
    const html = '<html><body>Hello</body></html>';
    const encoder = new TextEncoder();
    const bytes = encoder.encode(html);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const content = btoa(binary);

    const result = processExport({
      content,
      filename: 'page.html',
      mimeType: 'text/html',
      convertEncoding: true,
    });

    expect(result.appliedEncoding).toBe('utf-8');
  });

  it('PDFファイルはバイナリとして処理', () => {
    const content = btoa('PDF binary content');
    const result = processExport({
      content,
      filename: 'document.pdf',
      mimeType: 'application/pdf',
      convertEncoding: true, // フラグがあっても無視される
    });

    expect(result.detectedEncoding).toBeUndefined();
    expect(result.appliedEncoding).toBeUndefined();
  });

  it('画像ファイルはバイナリとして処理', () => {
    const content = btoa('PNG image data');
    const result = processExport({
      content,
      filename: 'image.png',
      mimeType: 'image/png',
      convertEncoding: true,
    });

    expect(result.detectedEncoding).toBeUndefined();
  });
});
