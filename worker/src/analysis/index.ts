/**
 * 分析モジュール統合エントリポイント
 *
 * すべての分析機能を統合し、単一のAPIエンドポイントで提供
 */

import type {
  AnalysisRequest,
  FullAnalysisResponse,
  DomainAnalysisResult,
} from './types';

import { analyzeAllLinks } from './links';
import { analyzeAllAttachments } from './attachments';
import { detectBECPatterns } from './bec';
import { analyzeTLSPath, analyzeHeaderConsistency } from './tls';
import { verifyDKIMSignature } from './dkim';
import { verifyARCChain } from './arc';
import { calculateSecurityScore } from './score';
import { analyzeConfusables } from '../confusables';

// バージョン情報
const ANALYSIS_VERSION = '2.0.0';

/**
 * ドメインを分析（confusablesモジュールを使用）
 */
function analyzeDomain(domain: string | undefined): DomainAnalysisResult | null {
  if (!domain) return null;

  const result = analyzeConfusables(domain);

  // confusableCharsからスクリプト情報を抽出
  const scripts = result.confusableChars.length > 0
    ? [...new Set(result.confusableChars.map(c => c.script))]
    : undefined;

  // risk が 'none' 以外なら疑わしいドメイン
  const isSuspicious = result.risk !== 'none';

  return {
    domain,
    isSuspicious,
    isIDN: result.isIDN,
    punycode: result.punycode ?? undefined,
    similarTo: result.matchedDomain ?? undefined,
    similarity: result.similarity,
    techniques: result.techniques,
    scripts,
    risk: isSuspicious
      ? (result.similarity >= 90 ? 'high' : result.similarity >= 70 ? 'medium' : 'low')
      : 'low',
  };
}

/**
 * Fromアドレスからドメインを抽出
 */
function extractDomain(from: string | undefined): string | undefined {
  if (!from) return undefined;

  // メールアドレス形式から抽出
  const match = from.match(/@([a-zA-Z0-9.-]+)/);
  if (match) {
    return match[1].toLowerCase();
  }

  // ドメインがそのまま渡された場合
  if (from.includes('.') && !from.includes('@') && !from.includes(' ')) {
    return from.toLowerCase();
  }

  return undefined;
}

/**
 * 統合分析を実行
 */
export async function performFullAnalysis(
  request: AnalysisRequest
): Promise<FullAnalysisResponse> {
  // ドメイン抽出
  const fromDomain = request.fromDomain ?? extractDomain(request.from);

  // 並列で実行可能な分析
  const [
    links,
    attachments,
    bec,
    tls,
    dkim,
    arc,
  ] = await Promise.all([
    // リンク分析
    Promise.resolve(analyzeAllLinks(request.html, request.text)),

    // 添付ファイル分析
    Promise.resolve(analyzeAllAttachments(request.attachments)),

    // BEC検出
    Promise.resolve(detectBECPatterns(request.subject, request.text, request.html)),

    // TLS経路分析
    Promise.resolve(analyzeTLSPath(request.headers)),

    // DKIM検証（非同期）
    verifyDKIMSignature(request.headers, request.rawBody ?? '', request.rawHeaders),

    // ARC検証（非同期）
    verifyARCChain(request.headers),
  ]);

  // ドメイン分析
  const domain = analyzeDomain(fromDomain);

  // ヘッダー整合性チェック
  const headerConsistency = analyzeHeaderConsistency(request.headers, request.from);

  // 総合スコア計算
  const securityScore = calculateSecurityScore(
    request.authResults,
    dkim,
    domain,
    links,
    attachments,
    bec,
    tls,
    headerConsistency
  );

  return {
    links,
    attachments,
    bec,
    tls,
    dkim,
    arc,
    domain: domain ?? {
      domain: 'unknown',
      isSuspicious: false,
      isIDN: false,
      techniques: [],
      risk: 'low',
    },
    headerConsistency,
    securityScore,
    analyzedAt: new Date().toISOString(),
    version: ANALYSIS_VERSION,
  };
}

/**
 * 軽量分析を実行（DKIM/ARC検証なし）
 * フロントエンドでの即時表示用
 */
export function performQuickAnalysis(
  request: AnalysisRequest
): Omit<FullAnalysisResponse, 'dkim' | 'arc'> & { dkim: null; arc: null } {
  const fromDomain = request.fromDomain ?? extractDomain(request.from);

  const links = analyzeAllLinks(request.html, request.text);
  const attachments = analyzeAllAttachments(request.attachments);
  const bec = detectBECPatterns(request.subject, request.text, request.html);
  const tls = analyzeTLSPath(request.headers);
  const domain = analyzeDomain(fromDomain);
  const headerConsistency = analyzeHeaderConsistency(request.headers, request.from);

  // 軽量スコア計算（DKIM/ARCは考慮しない）
  const dummyDkim = {
    status: 'none' as const,
    signatureValid: false,
    bodyHashValid: false,
    publicKeyFound: false,
    details: { issues: [] },
  };

  const securityScore = calculateSecurityScore(
    request.authResults,
    dummyDkim,
    domain,
    links,
    attachments,
    bec,
    tls,
    headerConsistency
  );

  return {
    links,
    attachments,
    bec,
    tls,
    dkim: null,
    arc: null,
    domain: domain ?? {
      domain: 'unknown',
      isSuspicious: false,
      isIDN: false,
      techniques: [],
      risk: 'low',
    },
    headerConsistency,
    securityScore,
    analyzedAt: new Date().toISOString(),
    version: ANALYSIS_VERSION,
  };
}

// 個別モジュールのエクスポート
export { analyzeAllLinks, analyzeLink } from './links';
export { analyzeAllAttachments, analyzeAttachment } from './attachments';
export { detectBECPatterns, getBECSummary } from './bec';
export { analyzeTLSPath, analyzeHeaderConsistency } from './tls';
export { verifyDKIMSignature, getDKIMSummary } from './dkim';
export { verifyARCChain, getARCSummary } from './arc';
export { calculateSecurityScore } from './score';

// 型のエクスポート
export type * from './types';
