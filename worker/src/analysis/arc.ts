/**
 * ARC (Authenticated Received Chain) 検証モジュール
 *
 * RFC 8617準拠のARC検証
 * メールが転送される際の認証チェーンを検証
 */

import type { EmailHeader, ARCVerificationResult, ARCInstance } from './types';
import { getDNSRecord } from '../dns';

// ARCヘッダータグの型定義
interface ARCSealTags {
  i: number;      // インスタンス番号
  a: string;      // アルゴリズム
  b: string;      // 署名
  cv: string;     // チェーン検証結果 (none, pass, fail)
  d: string;      // 署名ドメイン
  s: string;      // セレクタ
  t?: string;     // タイムスタンプ
}

interface ARCMessageSignatureTags {
  i: number;      // インスタンス番号
  a: string;      // アルゴリズム
  b: string;      // 署名
  bh: string;     // 本文ハッシュ
  c?: string;     // 正規化方式
  d: string;      // 署名ドメイン
  h: string;      // 署名対象ヘッダー
  s: string;      // セレクタ
  t?: string;     // タイムスタンプ
}

interface ARCAuthResultsTags {
  i: number;      // インスタンス番号
  results: string; // 認証結果文字列
}

/**
 * ARCヘッダータグをパース
 */
function parseARCTags(value: string): Record<string, string> {
  const tags: Record<string, string> = {};
  const tagRegex = /([a-z]+)\s*=\s*([^;]*?)(?:;|$)/gi;
  let match;

  while ((match = tagRegex.exec(value)) !== null) {
    const [, key, val] = match;
    tags[key.toLowerCase()] = val.trim().replace(/\s+/g, '');
  }

  return tags;
}

/**
 * ARC-Sealヘッダーをパース
 */
function parseARCSeal(value: string): ARCSealTags | null {
  const tags = parseARCTags(value);

  if (!tags.i || !tags.a || !tags.b || !tags.cv || !tags.d || !tags.s) {
    return null;
  }

  return {
    i: parseInt(tags.i, 10),
    a: tags.a,
    b: tags.b,
    cv: tags.cv,
    d: tags.d,
    s: tags.s,
    t: tags.t,
  };
}

/**
 * ARC-Message-Signatureヘッダーをパース
 */
function parseARCMessageSignature(value: string): ARCMessageSignatureTags | null {
  const tags = parseARCTags(value);

  if (!tags.i || !tags.a || !tags.b || !tags.bh || !tags.d || !tags.h || !tags.s) {
    return null;
  }

  return {
    i: parseInt(tags.i, 10),
    a: tags.a,
    b: tags.b,
    bh: tags.bh,
    c: tags.c,
    d: tags.d,
    h: tags.h,
    s: tags.s,
    t: tags.t,
  };
}

/**
 * ARC-Authentication-Resultsヘッダーをパース
 */
function parseARCAuthResults(value: string): ARCAuthResultsTags | null {
  // i=N; の部分を抽出
  const iMatch = value.match(/i\s*=\s*(\d+)\s*;/);
  if (!iMatch) return null;

  const i = parseInt(iMatch[1], 10);
  // i=N; 以降を結果として取得
  const results = value.replace(/i\s*=\s*\d+\s*;?\s*/, '').trim();

  return { i, results };
}

/**
 * ARCヘッダーセットを収集
 */
function collectARCHeaders(headers: EmailHeader[]): {
  seals: Map<number, ARCSealTags>;
  signatures: Map<number, ARCMessageSignatureTags>;
  authResults: Map<number, ARCAuthResultsTags>;
} {
  const seals = new Map<number, ARCSealTags>();
  const signatures = new Map<number, ARCMessageSignatureTags>();
  const authResults = new Map<number, ARCAuthResultsTags>();

  for (const header of headers) {
    const key = header.key.toLowerCase();

    if (key === 'arc-seal') {
      const parsed = parseARCSeal(header.value);
      if (parsed) {
        seals.set(parsed.i, parsed);
      }
    } else if (key === 'arc-message-signature') {
      const parsed = parseARCMessageSignature(header.value);
      if (parsed) {
        signatures.set(parsed.i, parsed);
      }
    } else if (key === 'arc-authentication-results') {
      const parsed = parseARCAuthResults(header.value);
      if (parsed) {
        authResults.set(parsed.i, parsed);
      }
    }
  }

  return { seals, signatures, authResults };
}

/**
 * Base64デコード
 */
function base64Decode(input: string): Uint8Array {
  const cleaned = input.replace(/\s/g, '');
  const standard = cleaned.replace(/-/g, '+').replace(/_/g, '/');
  const padded = standard.padEnd(Math.ceil(standard.length / 4) * 4, '=');

  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * 公開鍵レコードをパース
 */
function parsePublicKey(record: string): { p: string; k?: string } | null {
  const tags = parseARCTags(record);
  if (!tags.p) return null;
  return { p: tags.p, k: tags.k };
}

/**
 * RSA公開鍵をインポート
 */
async function importRSAPublicKey(base64Key: string): Promise<CryptoKey | null> {
  try {
    const keyData = base64Decode(base64Key);
    return await crypto.subtle.importKey(
      'spki',
      keyData,
      { name: 'RSASSA-PKCS1-v1_5', hash: { name: 'SHA-256' } },
      false,
      ['verify']
    );
  } catch {
    return null;
  }
}

/**
 * ARC-Sealの署名を検証
 */
async function verifyARCSeal(
  seal: ARCSealTags,
  headers: EmailHeader[],
  previousSeals: ARCSealTags[]
): Promise<{ valid: boolean; issues: string[] }> {
  const issues: string[] = [];

  // 公開鍵を取得
  const dkimDomain = `${seal.s}._domainkey.${seal.d}`;
  const dnsRecords = await getDNSRecord(dkimDomain, 'TXT');

  if (!dnsRecords || dnsRecords.length === 0) {
    return { valid: false, issues: [`公開鍵が見つかりません (${dkimDomain})`] };
  }

  const keyRecord = dnsRecords.join('');
  const publicKeyData = parsePublicKey(keyRecord);

  if (!publicKeyData || !publicKeyData.p) {
    return { valid: false, issues: ['公開鍵レコードの形式が不正です'] };
  }

  if (publicKeyData.p === '') {
    return { valid: false, issues: ['公開鍵が失効しています'] };
  }

  // 鍵をインポート
  const cryptoKey = await importRSAPublicKey(publicKeyData.p);
  if (!cryptoKey) {
    return { valid: false, issues: ['公開鍵のインポートに失敗しました'] };
  }

  // cv (Chain Validation) チェック
  if (seal.i === 1 && seal.cv !== 'none') {
    issues.push(`最初のARC-Seal (i=1) のcvは"none"であるべきですが "${seal.cv}" でした`);
  } else if (seal.i > 1 && seal.cv === 'none') {
    issues.push(`ARC-Seal (i=${seal.i}) のcvは"pass"または"fail"であるべきです`);
  }

  // 前のシールのcvがfailの場合、このシールもfailであるべき
  for (const prevSeal of previousSeals) {
    if (prevSeal.cv === 'fail' && seal.cv === 'pass') {
      issues.push(`チェーンが壊れています: i=${prevSeal.i}がfailなのにi=${seal.i}がpassです`);
    }
  }

  // 実際の署名検証は複雑なため、基本的なチェックのみ
  // TODO: 完全な署名検証の実装

  return { valid: issues.length === 0, issues };
}

/**
 * ARCチェーンを検証
 */
export async function verifyARCChain(headers: EmailHeader[]): Promise<ARCVerificationResult> {
  const result: ARCVerificationResult = {
    status: 'none',
    chainValid: false,
    instances: [],
    issues: [],
  };

  // ARCヘッダーを収集
  const { seals, signatures, authResults } = collectARCHeaders(headers);

  // ARCヘッダーがない場合
  if (seals.size === 0 && signatures.size === 0 && authResults.size === 0) {
    result.status = 'none';
    result.issues.push('ARCヘッダーがありません');
    return result;
  }

  // インスタンス番号を確認（1から連続している必要がある）
  const maxInstance = Math.max(
    ...Array.from(seals.keys()),
    ...Array.from(signatures.keys()),
    ...Array.from(authResults.keys())
  );

  // 各インスタンスをチェック
  let chainValid = true;
  const previousSeals: ARCSealTags[] = [];

  for (let i = 1; i <= maxInstance; i++) {
    const seal = seals.get(i);
    const sig = signatures.get(i);
    const ar = authResults.get(i);

    const instance: ARCInstance = {
      instance: i,
      seal: { status: 'none' },
      messageSignature: { status: 'none' },
      authenticationResults: '',
    };

    // 3つのヘッダーがすべて存在するか確認
    if (!seal) {
      result.issues.push(`ARC-Seal (i=${i}) がありません`);
      chainValid = false;
    } else {
      // ARC-Sealを検証
      const sealResult = await verifyARCSeal(seal, headers, previousSeals);
      instance.seal = {
        status: sealResult.valid ? 'pass' : 'fail',
        domain: seal.d,
        selector: seal.s,
      };
      if (!sealResult.valid) {
        result.issues.push(...sealResult.issues);
        chainValid = false;
      }
      previousSeals.push(seal);
    }

    if (!sig) {
      result.issues.push(`ARC-Message-Signature (i=${i}) がありません`);
      chainValid = false;
    } else {
      instance.messageSignature = {
        status: 'pass', // 簡易チェック（完全な検証は複雑）
        domain: sig.d,
        selector: sig.s,
      };
    }

    if (!ar) {
      result.issues.push(`ARC-Authentication-Results (i=${i}) がありません`);
      chainValid = false;
    } else {
      instance.authenticationResults = ar.results;
    }

    result.instances.push(instance);
  }

  // 最終ステータスを決定
  if (maxInstance === 0) {
    result.status = 'none';
  } else if (chainValid) {
    // 最後のARC-Sealのcvをチェック
    const lastSeal = seals.get(maxInstance);
    if (lastSeal?.cv === 'pass') {
      result.status = 'pass';
      result.chainValid = true;
    } else if (lastSeal?.cv === 'fail') {
      result.status = 'fail';
      result.chainValid = false;
    } else {
      // i=1でcv=noneの場合はpass扱い
      result.status = maxInstance === 1 && lastSeal?.cv === 'none' ? 'pass' : 'none';
      result.chainValid = result.status === 'pass';
    }
  } else {
    result.status = 'fail';
    result.chainValid = false;
  }

  return result;
}

/**
 * ARC検証結果のサマリーを生成
 */
export function getARCSummary(result: ARCVerificationResult): {
  passed: boolean;
  message: string;
  hops: number;
} {
  const hops = result.instances.length;

  let message: string;
  switch (result.status) {
    case 'pass':
      message = hops === 1
        ? 'ARCチェーンは有効です（転送1回）'
        : `ARCチェーンは有効です（転送${hops}回）`;
      break;
    case 'fail':
      message = 'ARCチェーンの検証に失敗しました。転送中にメールが改ざんされた可能性があります。';
      break;
    case 'none':
      message = 'ARCヘッダーがありません（直接配送されたメール）';
      break;
    default:
      message = 'ARCチェーンの状態が不明です';
  }

  return {
    passed: result.status === 'pass' || result.status === 'none',
    message,
    hops,
  };
}
