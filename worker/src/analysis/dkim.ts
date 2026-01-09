/**
 * DKIM署名検証モジュール（本格実装）
 *
 * RFC 6376準拠のDKIM署名検証を実装
 * - ヘッダー/本文の正規化（relaxed/simple）
 * - RSA-SHA256/RSA-SHA1署名検証
 * - 公開鍵のDNS取得
 */

import type { EmailHeader, DKIMVerificationResult } from './types';
import { getDNSRecord } from '../dns';

// DKIM-Signatureのタグ定義
interface DKIMSignatureTags {
  v: string;           // バージョン (1)
  a: string;           // アルゴリズム (rsa-sha256, rsa-sha1, ed25519-sha256)
  b: string;           // 署名（Base64）
  bh: string;          // 本文ハッシュ（Base64）
  c?: string;          // 正規化方式 (relaxed/relaxed, simple/simple)
  d: string;           // 署名ドメイン
  h: string;           // 署名対象ヘッダー
  i?: string;          // Agent or User Identifier
  l?: string;          // 署名対象本文長
  q?: string;          // クエリ方式 (dns/txt)
  s: string;           // セレクタ
  t?: string;          // 署名時刻
  x?: string;          // 有効期限
  z?: string;          // コピーされたヘッダー
}

/**
 * DKIM-Signatureヘッダーをパース
 */
function parseDKIMSignature(value: string): DKIMSignatureTags | null {
  const tags: Partial<DKIMSignatureTags> = {};

  // タグ=値のペアを抽出
  const tagRegex = /([a-z]+)\s*=\s*([^;]*?)(?:;|$)/gi;
  let match;

  while ((match = tagRegex.exec(value)) !== null) {
    const [, key, val] = match;
    tags[key.toLowerCase() as keyof DKIMSignatureTags] = val.trim().replace(/\s+/g, '');
  }

  // 必須タグのチェック
  if (!tags.v || !tags.a || !tags.b || !tags.bh || !tags.d || !tags.h || !tags.s) {
    return null;
  }

  return tags as DKIMSignatureTags;
}

/**
 * relaxed正規化（ヘッダー用）
 * - ヘッダー名を小文字に変換
 * - 連続する空白を単一スペースに
 * - 行末の空白を削除
 */
function relaxedCanonicalizeHeader(name: string, value: string): string {
  const normalizedName = name.toLowerCase().trim();
  const normalizedValue = value
    .replace(/\r\n/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return `${normalizedName}:${normalizedValue}`;
}

/**
 * simple正規化（ヘッダー用）
 * - そのまま（改行コードのみ正規化）
 */
function simpleCanonicalizeHeader(name: string, value: string): string {
  return `${name}:${value.replace(/\r\n(?![ \t])/g, '')}`;
}

/**
 * relaxed正規化（本文用）
 * - 行末の空白を削除
 * - 連続する空白を単一スペースに
 * - 末尾の空行を削除
 * - 最終行にCRLFを追加
 */
function relaxedCanonicalizeBody(body: string): string {
  let result = body
    // CRLF正規化
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // 行ごとに処理
    .split('\n')
    .map(line => line.replace(/[ \t]+$/g, '').replace(/[ \t]+/g, ' '))
    .join('\r\n');

  // 末尾の空行を削除
  result = result.replace(/(\r\n)+$/g, '');

  // 空でなければCRLFを追加
  if (result.length > 0) {
    result += '\r\n';
  }

  return result;
}

/**
 * simple正規化（本文用）
 * - 末尾の空行を削除
 * - 最終行にCRLFを追加
 */
function simpleCanonicalizeBody(body: string): string {
  let result = body
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n/g, '\r\n');

  // 末尾の空行を削除（CRLFのみの行）
  result = result.replace(/(\r\n)+$/g, '');

  // 空でなければCRLFを追加
  if (result.length > 0) {
    result += '\r\n';
  }

  return result;
}

/**
 * Base64デコード（URLセーフ対応）
 */
function base64Decode(input: string): Uint8Array {
  // 空白を除去
  const cleaned = input.replace(/\s/g, '');
  // URLセーフ形式を標準形式に変換
  const standard = cleaned.replace(/-/g, '+').replace(/_/g, '/');
  // パディング追加
  const padded = standard.padEnd(Math.ceil(standard.length / 4) * 4, '=');

  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * DKIM公開鍵レコードをパース
 */
function parseDKIMPublicKey(record: string): { p: string; k?: string; h?: string; t?: string; n?: string } | null {
  const tags: Record<string, string> = {};

  const tagRegex = /([a-z]+)\s*=\s*([^;]*?)(?:;|$)/gi;
  let match;

  while ((match = tagRegex.exec(record)) !== null) {
    const [, key, val] = match;
    tags[key.toLowerCase()] = val.trim().replace(/\s+/g, '');
  }

  if (!tags.p) {
    return null;
  }

  return {
    p: tags.p,
    k: tags.k, // キータイプ（rsa, ed25519）
    h: tags.h, // 許可されるハッシュアルゴリズム
    t: tags.t, // フラグ
    n: tags.n, // ノート
  };
}

/**
 * RSA公開鍵をインポート
 */
async function importRSAPublicKey(base64Key: string): Promise<CryptoKey | null> {
  try {
    const keyData = base64Decode(base64Key);

    // SubjectPublicKeyInfo形式としてインポート
    return await crypto.subtle.importKey(
      'spki',
      keyData,
      {
        name: 'RSASSA-PKCS1-v1_5',
        hash: { name: 'SHA-256' },
      },
      false,
      ['verify']
    );
  } catch {
    return null;
  }
}

/**
 * SHA-256ハッシュを計算
 */
async function sha256(data: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  return new Uint8Array(buffer);
}

/**
 * SHA-1ハッシュを計算
 */
async function sha1(data: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const buffer = await crypto.subtle.digest('SHA-1', encoder.encode(data));
  return new Uint8Array(buffer);
}

/**
 * Base64エンコード
 */
function base64Encode(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}

/**
 * 署名データ（ヘッダー）を構築
 */
function buildSignatureData(
  headers: EmailHeader[],
  signedHeaderNames: string[],
  dkimHeader: { key: string; value: string },
  canonicalization: 'relaxed' | 'simple'
): string {
  const parts: string[] = [];

  // 署名対象ヘッダーを順番に処理
  for (const headerName of signedHeaderNames) {
    const header = headers.find(
      h => h.key.toLowerCase() === headerName.toLowerCase()
    );

    if (header) {
      if (canonicalization === 'relaxed') {
        parts.push(relaxedCanonicalizeHeader(header.key, header.value));
      } else {
        parts.push(simpleCanonicalizeHeader(header.key, header.value));
      }
    }
  }

  // DKIM-Signatureヘッダー（b=タグを空にして）
  const dkimValueWithoutB = dkimHeader.value.replace(/b=[^;]+/, 'b=');
  if (canonicalization === 'relaxed') {
    parts.push(relaxedCanonicalizeHeader('dkim-signature', dkimValueWithoutB));
  } else {
    parts.push(simpleCanonicalizeHeader('DKIM-Signature', dkimValueWithoutB));
  }

  return parts.join('\r\n');
}

/**
 * DKIM署名を検証
 */
export async function verifyDKIMSignature(
  headers: EmailHeader[],
  body: string,
  rawHeaders?: string
): Promise<DKIMVerificationResult> {
  const result: DKIMVerificationResult = {
    status: 'none',
    signatureValid: false,
    bodyHashValid: false,
    publicKeyFound: false,
    details: {
      issues: [],
    },
  };

  // DKIM-Signatureヘッダーを検索
  const dkimHeader = headers.find(
    h => h.key.toLowerCase() === 'dkim-signature'
  );

  if (!dkimHeader) {
    result.status = 'none';
    result.details.issues.push('DKIM-Signatureヘッダーがありません');
    return result;
  }

  result.rawSignature = dkimHeader.value;

  // 署名をパース
  const signature = parseDKIMSignature(dkimHeader.value);
  if (!signature) {
    result.status = 'permerror';
    result.details.issues.push('DKIM-Signatureの形式が不正です');
    return result;
  }

  // 基本情報を設定
  result.selector = signature.s;
  result.domain = signature.d;
  result.algorithm = signature.a;
  result.headers = signature.h.split(':');
  result.details.signedHeaders = result.headers;

  // アルゴリズム解析
  const [keyAlgo, hashAlgo] = signature.a.split('-');
  result.details.bodyHashAlgorithm = hashAlgo as 'sha256' | 'sha1';
  result.details.keyType = keyAlgo as 'rsa' | 'ed25519';

  // 正規化方式を解析
  const [headerCan, bodyCan] = (signature.c ?? 'simple/simple').split('/');
  result.details.canonicalization = {
    header: (headerCan as 'relaxed' | 'simple') ?? 'simple',
    body: (bodyCan as 'relaxed' | 'simple') ?? 'simple',
  };

  // SHA-1は脆弱
  if (hashAlgo === 'sha1') {
    result.details.issues.push('SHA-1アルゴリズムは脆弱です（SHA-256を推奨）');
  }

  // ed25519はサポート外（現時点）
  if (keyAlgo === 'ed25519') {
    result.status = 'temperror';
    result.details.issues.push('Ed25519署名は現在サポートされていません');
    return result;
  }

  try {
    // 1. 本文ハッシュの検証
    const canonicalBody = result.details.canonicalization.body === 'relaxed'
      ? relaxedCanonicalizeBody(body)
      : simpleCanonicalizeBody(body);

    // 署名対象の本文長を考慮
    const signedBody = signature.l
      ? canonicalBody.substring(0, parseInt(signature.l, 10))
      : canonicalBody;

    const bodyHash = hashAlgo === 'sha256'
      ? await sha256(signedBody)
      : await sha1(signedBody);

    const calculatedBH = base64Encode(bodyHash);
    result.bodyHashValid = calculatedBH === signature.bh;

    if (!result.bodyHashValid) {
      result.details.issues.push('本文ハッシュが一致しません（メールが改ざんされた可能性）');
    }

    // 2. DNSから公開鍵を取得
    const dkimDomain = `${signature.s}._domainkey.${signature.d}`;
    const dnsRecords = await getDNSRecord(dkimDomain, 'TXT');

    if (!dnsRecords || dnsRecords.length === 0) {
      result.status = 'temperror';
      result.details.issues.push(`公開鍵が見つかりません (${dkimDomain})`);
      return result;
    }

    // 複数のTXTレコードを結合
    const keyRecord = dnsRecords.join('');
    const publicKeyData = parseDKIMPublicKey(keyRecord);

    if (!publicKeyData || !publicKeyData.p) {
      result.status = 'permerror';
      result.details.issues.push('公開鍵レコードの形式が不正です');
      return result;
    }

    result.publicKeyFound = true;
    result.publicKey = publicKeyData.p;

    // 鍵が失効（p=）しているかチェック
    if (publicKeyData.p === '') {
      result.status = 'permerror';
      result.details.issues.push('公開鍵が失効しています');
      return result;
    }

    // 3. 署名を検証
    const cryptoKey = await importRSAPublicKey(publicKeyData.p);
    if (!cryptoKey) {
      result.status = 'permerror';
      result.details.issues.push('公開鍵のインポートに失敗しました');
      return result;
    }

    // 鍵サイズを推定（Base64長から）
    const keyBits = Math.floor(publicKeyData.p.length * 6 / 8) * 8;
    result.details.keySize = keyBits;

    if (keyBits < 1024) {
      result.details.issues.push(`鍵サイズが小さすぎます (${keyBits}ビット、2048ビット以上を推奨)`);
    } else if (keyBits < 2048) {
      result.details.issues.push(`鍵サイズが推奨値未満です (${keyBits}ビット、2048ビット以上を推奨)`);
    }

    // 署名データを構築
    const signatureData = buildSignatureData(
      headers,
      result.headers,
      dkimHeader,
      result.details.canonicalization.header
    );

    // 署名を検証
    const signatureBytes = base64Decode(signature.b);
    const encoder = new TextEncoder();

    try {
      result.signatureValid = await crypto.subtle.verify(
        { name: 'RSASSA-PKCS1-v1_5' },
        cryptoKey,
        signatureBytes,
        encoder.encode(signatureData)
      );
    } catch (verifyError) {
      result.signatureValid = false;
      result.details.issues.push('署名検証でエラーが発生しました');
    }

    // 有効期限チェック
    if (signature.x) {
      const expiry = parseInt(signature.x, 10) * 1000;
      if (Date.now() > expiry) {
        result.details.issues.push('署名の有効期限が切れています');
        result.signatureValid = false;
      }
    }

    // 最終ステータスを決定
    if (result.signatureValid && result.bodyHashValid) {
      result.status = 'pass';
    } else {
      result.status = 'fail';
      if (!result.signatureValid) {
        result.details.issues.push('署名が無効です');
      }
    }

  } catch (error) {
    result.status = 'temperror';
    result.details.issues.push(`検証中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`);
  }

  return result;
}

/**
 * DKIM検証結果のサマリーを生成
 */
export function getDKIMSummary(result: DKIMVerificationResult): {
  passed: boolean;
  message: string;
  technicalDetails: string[];
} {
  const technicalDetails: string[] = [];

  if (result.domain && result.selector) {
    technicalDetails.push(`ドメイン: ${result.domain}`);
    technicalDetails.push(`セレクタ: ${result.selector}`);
  }

  if (result.algorithm) {
    technicalDetails.push(`アルゴリズム: ${result.algorithm}`);
  }

  if (result.details.keySize) {
    technicalDetails.push(`鍵サイズ: ${result.details.keySize}ビット`);
  }

  let message: string;
  switch (result.status) {
    case 'pass':
      message = 'DKIM署名は有効です。メールは改ざんされていません。';
      break;
    case 'fail':
      message = 'DKIM署名の検証に失敗しました。メールが改ざんされている可能性があります。';
      break;
    case 'none':
      message = 'DKIM署名がありません。';
      break;
    case 'permerror':
      message = 'DKIM署名の形式に問題があります。';
      break;
    case 'temperror':
      message = 'DKIM検証中に一時的なエラーが発生しました。';
      break;
    default:
      message = 'DKIM署名のステータスが不明です。';
  }

  return {
    passed: result.status === 'pass',
    message,
    technicalDetails,
  };
}
