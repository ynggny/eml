/**
 * ファイルエクスポート機能 - 文字コード対応
 *
 * Cloudflare Workersで様々な文字コードに対応したファイルエクスポート機能を提供
 * TextDecoderがサポートするエンコーディングを活用
 */

/**
 * サポートされる文字コード
 * TextDecoderの標準サポート範囲
 */
export type SupportedEncoding =
  | 'utf-8'
  | 'utf-16'
  | 'utf-16be'
  | 'utf-16le'
  | 'iso-2022-jp'
  | 'shift_jis'
  | 'euc-jp'
  | 'iso-8859-1'
  | 'windows-1252';

/**
 * エンコーディング情報
 */
export const SUPPORTED_ENCODINGS: {
  [key in SupportedEncoding]: {
    name: string;
    aliases: string[];
    description: string;
  };
} = {
  'utf-8': {
    name: 'UTF-8',
    aliases: ['utf8'],
    description: 'Unicode標準のエンコーディング（推奨）',
  },
  'utf-16': {
    name: 'UTF-16',
    aliases: ['utf16'],
    description: 'Unicode 16ビット',
  },
  'utf-16be': {
    name: 'UTF-16BE',
    aliases: ['utf16be'],
    description: 'UTF-16 Big Endian',
  },
  'utf-16le': {
    name: 'UTF-16LE',
    aliases: ['utf16le'],
    description: 'UTF-16 Little Endian',
  },
  'iso-2022-jp': {
    name: 'ISO-2022-JP',
    aliases: ['jis', 'iso2022jp', 'csiso2022jp'],
    description: '日本語メール標準（JIS）',
  },
  'shift_jis': {
    name: 'Shift_JIS',
    aliases: ['sjis', 'shiftjis', 'ms_kanji', 'csshiftjis', 'windows-31j', 'cp932'],
    description: 'Windows日本語（Shift_JIS）',
  },
  'euc-jp': {
    name: 'EUC-JP',
    aliases: ['eucjp', 'cseucpkdfmtjapanese'],
    description: 'Unix日本語（EUC-JP）',
  },
  'iso-8859-1': {
    name: 'ISO-8859-1',
    aliases: ['latin1', 'latin-1', 'iso88591'],
    description: '西ヨーロッパ言語',
  },
  'windows-1252': {
    name: 'Windows-1252',
    aliases: ['cp1252'],
    description: 'Windows西ヨーロッパ言語',
  },
};

/**
 * エンコーディング名を正規化
 */
export function normalizeEncoding(encoding: string): SupportedEncoding | null {
  const lower = encoding.toLowerCase().replace(/[_-\s]/g, '');

  // 直接マッチ
  for (const [key, info] of Object.entries(SUPPORTED_ENCODINGS)) {
    if (key.replace(/[_-]/g, '') === lower) {
      return key as SupportedEncoding;
    }
    if (info.aliases.some((alias) => alias.replace(/[_-]/g, '') === lower)) {
      return key as SupportedEncoding;
    }
  }

  return null;
}

/**
 * バイナリデータを指定された文字コードからUTF-8テキストに変換
 */
export function decodeToUtf8(
  data: ArrayBuffer,
  sourceEncoding: SupportedEncoding = 'utf-8'
): string {
  const decoder = new TextDecoder(sourceEncoding, { fatal: false, ignoreBOM: false });
  return decoder.decode(data);
}

/**
 * バイナリデータの文字コードを自動検出（ヒューリスティック）
 *
 * BOMや特徴的なバイトパターンから推測
 * 検出優先順位: BOM > ISO-2022-JP > UTF-8 > Shift_JIS/EUC-JP
 */
export function detectEncoding(data: ArrayBuffer): SupportedEncoding {
  const bytes = new Uint8Array(data);

  // BOMチェック（最優先）
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return 'utf-8';
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return 'utf-16be';
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return 'utf-16le';
  }

  // ISO-2022-JPの特徴（ESCシーケンス）
  for (let i = 0; i < bytes.length - 2; i++) {
    if (bytes[i] === 0x1b) {
      // ESC $ B または ESC $ @ (JIS X 0208)
      if (bytes[i + 1] === 0x24 && (bytes[i + 2] === 0x42 || bytes[i + 2] === 0x40)) {
        return 'iso-2022-jp';
      }
      // ESC ( B または ESC ( J (ASCII/JIS X 0201)
      if (bytes[i + 1] === 0x28 && (bytes[i + 2] === 0x42 || bytes[i + 2] === 0x4a)) {
        return 'iso-2022-jp';
      }
    }
  }

  // UTF-8の妥当性チェック（Shift_JIS/EUC-JPより先に判定）
  // UTF-8の4バイト文字（絵文字等）はShift_JISのバイトパターンと重複するため
  const utf8Result = isValidUtf8(bytes);
  if (utf8Result.valid && utf8Result.multibytesFound) {
    return 'utf-8';
  }

  // Shift_JIS / EUC-JP の判定
  let sjisScore = 0;
  let eucScore = 0;

  for (let i = 0; i < bytes.length - 1; i++) {
    const b1 = bytes[i];
    const b2 = bytes[i + 1];

    // Shift_JISの2バイト文字パターン
    if (
      ((b1 >= 0x81 && b1 <= 0x9f) || (b1 >= 0xe0 && b1 <= 0xfc)) &&
      ((b2 >= 0x40 && b2 <= 0x7e) || (b2 >= 0x80 && b2 <= 0xfc))
    ) {
      sjisScore++;
      i++; // 2バイト消費
    }
    // EUC-JPの2バイト文字パターン
    else if (b1 >= 0xa1 && b1 <= 0xfe && b2 >= 0xa1 && b2 <= 0xfe) {
      eucScore++;
      i++; // 2バイト消費
    }
    // 半角カナ（Shift_JIS）
    else if (b1 >= 0xa1 && b1 <= 0xdf) {
      sjisScore += 0.5;
    }
    // EUC-JP半角カナ（0x8E + カナ）
    else if (b1 === 0x8e && b2 >= 0xa1 && b2 <= 0xdf) {
      eucScore++;
      i++;
    }
  }

  if (sjisScore > 0 || eucScore > 0) {
    // より多くマッチした方を採用
    if (sjisScore > eucScore) {
      return 'shift_jis';
    } else if (eucScore > sjisScore) {
      return 'euc-jp';
    }
  }

  // デフォルトはShift_JIS（日本語環境で最も一般的）
  return 'shift_jis';
}

/**
 * UTF-8として妥当かチェック
 *
 * @returns { valid: boolean, multibytesFound: boolean }
 */
function isValidUtf8(bytes: Uint8Array): { valid: boolean; multibytesFound: boolean } {
  let i = 0;
  let multibytesFound = false;

  while (i < bytes.length) {
    const b = bytes[i];

    if (b <= 0x7f) {
      // ASCII
      i++;
    } else if ((b & 0xe0) === 0xc0) {
      // 2バイト文字
      if (i + 1 >= bytes.length || (bytes[i + 1] & 0xc0) !== 0x80) {
        return { valid: false, multibytesFound };
      }
      multibytesFound = true;
      i += 2;
    } else if ((b & 0xf0) === 0xe0) {
      // 3バイト文字
      if (
        i + 2 >= bytes.length ||
        (bytes[i + 1] & 0xc0) !== 0x80 ||
        (bytes[i + 2] & 0xc0) !== 0x80
      ) {
        return { valid: false, multibytesFound };
      }
      multibytesFound = true;
      i += 3;
    } else if ((b & 0xf8) === 0xf0) {
      // 4バイト文字
      if (
        i + 3 >= bytes.length ||
        (bytes[i + 1] & 0xc0) !== 0x80 ||
        (bytes[i + 2] & 0xc0) !== 0x80 ||
        (bytes[i + 3] & 0xc0) !== 0x80
      ) {
        return { valid: false, multibytesFound };
      }
      multibytesFound = true;
      i += 4;
    } else {
      return { valid: false, multibytesFound };
    }
  }

  return { valid: true, multibytesFound };
}

/**
 * エクスポートリクエスト
 */
export interface ExportRequest {
  /** Base64エンコードされたコンテンツ */
  content: string;
  /** ファイル名 */
  filename: string;
  /** MIMEタイプ */
  mimeType: string;
  /** 元のエンコーディング（自動検出する場合は省略可） */
  sourceEncoding?: string;
  /** 出力エンコーディング（デフォルト: utf-8） */
  targetEncoding?: string;
  /** 文字コード変換を行うか（テキストファイルのみ有効） */
  convertEncoding?: boolean;
}

/**
 * エクスポートレスポンス（JSON形式で返す場合）
 */
export interface ExportResponse {
  /** Base64エンコードされたコンテンツ */
  content: string;
  /** ファイル名 */
  filename: string;
  /** MIMEタイプ */
  mimeType: string;
  /** 検出されたエンコーディング */
  detectedEncoding?: string;
  /** 適用されたエンコーディング */
  appliedEncoding?: string;
}

/**
 * テキストMIMEタイプかどうか判定
 */
export function isTextMimeType(mimeType: string): boolean {
  const textTypes = [
    'text/',
    'application/json',
    'application/xml',
    'application/javascript',
    'application/x-javascript',
    'application/ecmascript',
    'application/x-sh',
  ];
  const lower = mimeType.toLowerCase();
  return textTypes.some((t) => lower.startsWith(t) || lower === t);
}

/**
 * ファイルをエクスポート用に処理
 *
 * - テキストファイルの場合、文字コード変換を適用可能
 * - バイナリファイルはそのまま返却
 */
export function processExport(request: ExportRequest): ExportResponse {
  // Base64デコード
  const binaryStr = atob(request.content);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  const data = bytes.buffer;

  // テキストファイルで変換が要求された場合
  if (request.convertEncoding && isTextMimeType(request.mimeType)) {
    // 元のエンコーディングを検出または指定から取得
    const sourceEnc = request.sourceEncoding
      ? normalizeEncoding(request.sourceEncoding) ?? detectEncoding(data)
      : detectEncoding(data);

    // テキストにデコード
    const text = decodeToUtf8(data, sourceEnc);

    // 出力エンコーディング（現時点ではUTF-8のみ出力可能）
    const encoder = new TextEncoder();
    const utf8Bytes = encoder.encode(text);

    // Base64エンコード
    let binary = '';
    for (let i = 0; i < utf8Bytes.length; i++) {
      binary += String.fromCharCode(utf8Bytes[i]);
    }

    return {
      content: btoa(binary),
      filename: request.filename,
      mimeType: request.mimeType,
      detectedEncoding: sourceEnc,
      appliedEncoding: 'utf-8',
    };
  }

  // バイナリファイルまたは変換不要の場合
  return {
    content: request.content,
    filename: request.filename,
    mimeType: request.mimeType,
  };
}

/**
 * エクスポート用のResponseを生成
 */
export function createExportResponse(
  request: ExportRequest,
  corsHeaders: HeadersInit
): Response {
  // Base64デコード
  const binaryStr = atob(request.content);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  const data = bytes.buffer;

  let outputData: ArrayBuffer = data;
  let detectedEncoding: string | undefined;

  // テキストファイルで変換が要求された場合
  if (request.convertEncoding && isTextMimeType(request.mimeType)) {
    const sourceEnc = request.sourceEncoding
      ? normalizeEncoding(request.sourceEncoding) ?? detectEncoding(data)
      : detectEncoding(data);

    detectedEncoding = sourceEnc;

    // UTF-8に変換
    const text = decodeToUtf8(data, sourceEnc);
    const encoder = new TextEncoder();
    const encoded = encoder.encode(text);
    outputData = encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer;
  }

  // RFC 5987に準拠したファイル名エンコーディング
  const encodedFilename = encodeRFC5987ValueChars(request.filename);
  const asciiFilename = request.filename.replace(/[^\x20-\x7E]/g, '_');

  const headers: HeadersInit = {
    'Content-Type': request.mimeType,
    'Content-Disposition': `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`,
    ...corsHeaders,
  };

  if (detectedEncoding) {
    headers['X-Detected-Encoding'] = detectedEncoding;
    headers['X-Applied-Encoding'] = 'utf-8';
  }

  return new Response(outputData, {
    status: 200,
    headers,
  });
}

/**
 * RFC 5987に準拠したパーセントエンコーディング
 */
function encodeRFC5987ValueChars(str: string): string {
  return encodeURIComponent(str)
    .replace(/['()]/g, escape)
    .replace(/\*/g, '%2A')
    .replace(/%(?:7C|60|5E)/g, unescape);
}

/**
 * サポートされるエンコーディング一覧を取得
 */
export function getSupportedEncodings(): {
  encoding: string;
  name: string;
  description: string;
}[] {
  return Object.entries(SUPPORTED_ENCODINGS).map(([encoding, info]) => ({
    encoding,
    name: info.name,
    description: info.description,
  }));
}

/**
 * 一時エクスポートデータのインメモリストア
 *
 * Cloudflare Workersではリクエスト間でメモリを共有しないため、
 * KVやR2を一時ストレージとして使用する必要があるが、
 * 簡易実装としてはD1の一時テーブルを使用
 *
 * 本番環境ではKV（TTL付き）を推奨
 */

export interface PreparedExport {
  /** ファイル内容（Base64） */
  content: string;
  /** ファイル名 */
  filename: string;
  /** MIMEタイプ */
  mimeType: string;
  /** 元のエンコーディング */
  sourceEncoding?: string;
  /** 文字コード変換を行うか */
  convertEncoding?: boolean;
  /** 作成日時（Unix timestamp） */
  createdAt: number;
  /** 有効期限（Unix timestamp） */
  expiresAt: number;
}

/**
 * エクスポートトークンを生成
 * HMAC-SHA256署名付きのJWTライクな形式
 */
export async function generateExportToken(
  exportId: string,
  secret: string,
  expiresInSeconds = 300 // デフォルト5分
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const payload = { id: exportId, exp };
  const payloadStr = btoa(JSON.stringify(payload));

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadStr));
  const hashArray = Array.from(new Uint8Array(signature));
  const signatureHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  return `${payloadStr}.${signatureHex}`;
}

/**
 * エクスポートトークンを検証
 */
export async function verifyExportToken(
  token: string,
  secret: string
): Promise<string | null> {
  const parts = token.split('.');
  if (parts.length !== 2) {
    return null;
  }

  const [payloadStr, signatureHex] = parts;

  // 署名検証
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const signatureBytes = new Uint8Array(
    signatureHex.match(/.{2}/g)?.map((byte) => parseInt(byte, 16)) ?? []
  );

  const isValid = await crypto.subtle.verify(
    'HMAC',
    key,
    signatureBytes,
    encoder.encode(payloadStr)
  );

  if (!isValid) {
    return null;
  }

  // ペイロード解析
  try {
    const payload = JSON.parse(atob(payloadStr)) as { id: string; exp: number };
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return null; // 期限切れ
    }
    return payload.id;
  } catch {
    return null;
  }
}

/**
 * ランダムなエクスポートIDを生成
 */
export function generateExportId(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * エクスポートデータをR2に一時保存
 */
export async function storeExportData(
  bucket: R2Bucket,
  exportId: string,
  data: PreparedExport
): Promise<void> {
  await bucket.put(`exports/${exportId}`, JSON.stringify(data), {
    customMetadata: {
      expiresAt: data.expiresAt.toString(),
    },
  });
}

/**
 * R2からエクスポートデータを取得
 */
export async function getExportData(
  bucket: R2Bucket,
  exportId: string
): Promise<PreparedExport | null> {
  const obj = await bucket.get(`exports/${exportId}`);
  if (!obj) {
    return null;
  }

  const data = (await obj.json()) as PreparedExport;

  // 有効期限チェック
  const now = Math.floor(Date.now() / 1000);
  if (data.expiresAt < now) {
    // 期限切れの場合は削除
    await bucket.delete(`exports/${exportId}`);
    return null;
  }

  return data;
}

/**
 * エクスポートデータを削除
 */
export async function deleteExportData(
  bucket: R2Bucket,
  exportId: string
): Promise<void> {
  await bucket.delete(`exports/${exportId}`);
}

/**
 * 準備リクエスト
 */
export interface PrepareExportRequest {
  /** Base64エンコードされたコンテンツ */
  content: string;
  /** ファイル名 */
  filename: string;
  /** MIMEタイプ */
  mimeType: string;
  /** 元のエンコーディング（省略時は自動検出） */
  sourceEncoding?: string;
  /** 文字コード変換を行うか */
  convertEncoding?: boolean;
  /** トークンの有効期限（秒、デフォルト300秒=5分） */
  expiresIn?: number;
}

/**
 * 準備レスポンス
 */
export interface PrepareExportResponse {
  /** ダウンロードURL */
  url: string;
  /** トークン */
  token: string;
  /** 有効期限（秒） */
  expiresIn: number;
  /** 有効期限（ISO形式） */
  expiresAt: string;
  /** 検出されたエンコーディング */
  detectedEncoding?: string;
}
