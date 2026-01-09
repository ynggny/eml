/**
 * セキュリティ分析コンポーネント
 * - Lookalike Domain検出
 * - リンク安全性チェック
 * - 添付ファイルリスク分析
 * - BECパターン検出
 * - TLS経路チェック
 * - 総合セキュリティスコア
 */

import { useState, useEffect } from 'react';
import type { ParsedEmail, Header } from '../utils/emlParser';
import {
  detectLookalikeDomain,
  analyzeAllLinks,
  analyzeAllAttachments,
  detectBECPatterns,
  analyzeTLSPath,
  getTLSSummary,
  calculateSecurityScore,
  type LookalikeResult,
  type LinkAnalysis,
  type AttachmentRisk,
  type BECIndicator,
  type SecurityScore,
} from '../utils/securityAnalysis';
import { analyzeConfusableDomain, type ConfusableResult } from '../utils/api';
import { SecurityBadge } from './SecurityBadge';
import { QRCodeShare } from './QRCodeShare';

interface SecurityAnalysisProps {
  email: ParsedEmail;
  authResults: { spf?: string; dkim?: string; dmarc?: string } | null;
  fromDomain: string | null;
  hash: string;
}

// ========================================
// 総合セキュリティスコア表示
// ========================================

function SecurityScoreDisplay({ score }: { score: SecurityScore }) {
  const getGradeColor = (grade: SecurityScore['grade']) => {
    switch (grade) {
      case 'A': return 'text-green-400 border-green-400';
      case 'B': return 'text-blue-400 border-blue-400';
      case 'C': return 'text-yellow-400 border-yellow-400';
      case 'D': return 'text-orange-400 border-orange-400';
      case 'F': return 'text-red-400 border-red-400';
    }
  };

  const getScoreBarColor = (score: number, maxScore: number) => {
    const percentage = score / maxScore;
    if (percentage >= 0.8) return 'bg-green-500';
    if (percentage >= 0.6) return 'bg-blue-500';
    if (percentage >= 0.4) return 'bg-yellow-500';
    if (percentage >= 0.2) return 'bg-orange-500';
    return 'bg-red-500';
  };

  return (
    <div className="p-4 bg-gray-800 rounded-lg">
      <div className="flex items-center gap-4 mb-4">
        <div className={`flex items-center justify-center w-16 h-16 rounded-full border-4 ${getGradeColor(score.grade)}`}>
          <span className="text-2xl font-bold">{score.grade}</span>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">セキュリティスコア</h3>
          <p className="text-2xl font-bold text-white">{score.score}<span className="text-sm text-gray-400">/100</span></p>
        </div>
      </div>

      <div className="space-y-3">
        {score.factors.map((factor, i) => (
          <div key={i}>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-300">{factor.category}</span>
              <span className="text-gray-400">{factor.score}/{factor.maxScore}</span>
            </div>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full ${getScoreBarColor(factor.score, factor.maxScore)} transition-all`}
                style={{ width: `${(factor.score / factor.maxScore) * 100}%` }}
              />
            </div>
            {factor.issues.length > 0 && (
              <div className="mt-1 text-xs text-gray-500">
                {factor.issues.join(', ')}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ========================================
// Lookalike Domain表示
// ========================================

function LookalikeDomainAlert({ result }: { result: LookalikeResult }) {
  const getRiskColor = (risk: LookalikeResult['risk']) => {
    switch (risk) {
      case 'high': return 'bg-red-900/50 border-red-700 text-red-300';
      case 'medium': return 'bg-yellow-900/50 border-yellow-700 text-yellow-300';
      case 'low': return 'bg-orange-900/50 border-orange-700 text-orange-300';
    }
  };

  return (
    <div className={`p-4 rounded-lg border ${getRiskColor(result.risk)}`}>
      <div className="flex items-start gap-3">
        <svg className="w-6 h-6 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div>
          <h4 className="font-semibold">偽装ドメインの疑い</h4>
          <p className="text-sm mt-1">
            <span className="font-mono bg-black/30 px-1 rounded">{result.originalDomain}</span>
            {' '}は{' '}
            <span className="font-mono bg-black/30 px-1 rounded">{result.similarTo}</span>
            {' '}に類似しています（類似度: {result.similarity}%）
          </p>
          <div className="flex flex-wrap gap-1 mt-2">
            {result.techniques.map((tech, i) => (
              <span key={i} className="text-xs px-2 py-0.5 bg-black/30 rounded">
                {tech}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ========================================
// ホモグラフ分析結果表示（Worker API版）
// ========================================

function ConfusableDomainAlert({ result }: { result: ConfusableResult }) {
  const getRiskColor = (risk: ConfusableResult['risk']) => {
    switch (risk) {
      case 'high': return 'bg-red-900/50 border-red-700 text-red-300';
      case 'medium': return 'bg-yellow-900/50 border-yellow-700 text-yellow-300';
      case 'low': return 'bg-orange-900/50 border-orange-700 text-orange-300';
      case 'none': return 'bg-green-900/50 border-green-700 text-green-300';
    }
  };

  if (result.risk === 'none') {
    return null;
  }

  return (
    <div className={`p-4 rounded-lg border ${getRiskColor(result.risk)}`}>
      <div className="flex items-start gap-3">
        <svg className="w-6 h-6 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div>
          <h4 className="font-semibold">偽装ドメインの疑い（詳細分析）</h4>
          <p className="text-sm mt-1">
            <span className="font-mono bg-black/30 px-1 rounded">{result.originalDomain}</span>
            {result.matchedDomain && (
              <>
                {' '}は{' '}
                <span className="font-mono bg-black/30 px-1 rounded">{result.matchedDomain}</span>
                {' '}に類似しています（類似度: {result.similarity}%）
              </>
            )}
          </p>

          {/* IDN情報 */}
          {result.isIDN && (
            <div className="mt-2 p-2 bg-black/20 rounded text-xs">
              <span className="text-yellow-400">⚠ 国際化ドメイン名（IDN）</span>
              {result.punycode && (
                <p className="mt-1 font-mono text-gray-400">Punycode: {result.punycode}</p>
              )}
            </div>
          )}

          {/* 検出された偽装文字 */}
          {result.confusableChars.length > 0 && (
            <div className="mt-2">
              <p className="text-xs text-gray-400 mb-1">検出された偽装文字:</p>
              <div className="flex flex-wrap gap-2">
                {result.confusableChars.map((char, i) => (
                  <div key={i} className="text-xs px-2 py-1 bg-black/30 rounded font-mono">
                    <span className="text-red-300">{char.original}</span>
                    <span className="text-gray-500 mx-1">→</span>
                    <span className="text-green-300">{char.normalized}</span>
                    <span className="text-gray-500 ml-1">({char.script})</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 検出テクニック */}
          <div className="flex flex-wrap gap-1 mt-2">
            {result.techniques.map((tech, i) => (
              <span key={i} className="text-xs px-2 py-0.5 bg-black/30 rounded">
                {tech}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ========================================
// リンク分析表示
// ========================================

function LinkAnalysisSection({ links }: { links: LinkAnalysis[] }) {
  const [expanded, setExpanded] = useState(false);
  const displayLinks = expanded ? links : links.slice(0, 5);

  const getRiskStyles = (risk: LinkAnalysis['risk']) => {
    switch (risk) {
      case 'dangerous': return 'bg-red-900/30 border-red-700 text-red-300';
      case 'suspicious': return 'bg-yellow-900/30 border-yellow-700 text-yellow-300';
      case 'safe': return 'bg-gray-700/50 border-gray-600 text-gray-300';
    }
  };

  const getRiskIcon = (risk: LinkAnalysis['risk']) => {
    switch (risk) {
      case 'dangerous':
        return (
          <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        );
      case 'suspicious':
        return (
          <svg className="w-4 h-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'safe':
        return (
          <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  if (links.length === 0) {
    return (
      <div className="p-4 bg-gray-800 rounded-lg">
        <h3 className="text-sm font-semibold text-gray-400 mb-2">リンク分析</h3>
        <p className="text-sm text-gray-500">リンクが見つかりませんでした</p>
      </div>
    );
  }

  const dangerousCount = links.filter(l => l.risk === 'dangerous').length;
  const suspiciousCount = links.filter(l => l.risk === 'suspicious').length;

  return (
    <div className="p-4 bg-gray-800 rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-400">
          リンク分析 ({links.length}件)
        </h3>
        <div className="flex gap-2 text-xs">
          {dangerousCount > 0 && (
            <span className="px-2 py-0.5 bg-red-900/50 text-red-300 rounded">
              危険: {dangerousCount}
            </span>
          )}
          {suspiciousCount > 0 && (
            <span className="px-2 py-0.5 bg-yellow-900/50 text-yellow-300 rounded">
              注意: {suspiciousCount}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {displayLinks.map((link, i) => (
          <div key={i} className={`p-2 rounded border ${getRiskStyles(link.risk)}`}>
            <div className="flex items-start gap-2">
              <div className="shrink-0 mt-0.5">{getRiskIcon(link.risk)}</div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-mono break-all">{link.url}</p>
                {link.displayText && link.displayText !== link.url && (
                  <p className="text-xs text-gray-500 mt-1">
                    表示: {link.displayText}
                  </p>
                )}
                {link.issues.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {link.issues.map((issue, j) => (
                      <span key={j} className="text-xs px-1.5 py-0.5 bg-black/30 rounded">
                        {issue}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {links.length > 5 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-xs text-blue-400 hover:text-blue-300"
        >
          {expanded ? '折りたたむ' : `他${links.length - 5}件を表示`}
        </button>
      )}
    </div>
  );
}

// ========================================
// 添付ファイルリスク表示
// ========================================

function AttachmentRiskSection({ attachments }: { attachments: AttachmentRisk[] }) {
  const getRiskStyles = (risk: AttachmentRisk['risk']) => {
    switch (risk) {
      case 'dangerous': return 'bg-red-900/30 border-red-700 text-red-300';
      case 'warning': return 'bg-yellow-900/30 border-yellow-700 text-yellow-300';
      case 'safe': return 'bg-gray-700/50 border-gray-600 text-gray-300';
    }
  };

  const getRiskIcon = (risk: AttachmentRisk['risk']) => {
    switch (risk) {
      case 'dangerous':
        return (
          <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        );
      case 'warning':
        return (
          <svg className="w-4 h-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'safe':
        return (
          <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  if (attachments.length === 0) {
    return null;
  }

  const dangerousCount = attachments.filter(a => a.risk === 'dangerous').length;
  const warningCount = attachments.filter(a => a.risk === 'warning').length;

  return (
    <div className="p-4 bg-gray-800 rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-400">
          添付ファイルリスク ({attachments.length}件)
        </h3>
        <div className="flex gap-2 text-xs">
          {dangerousCount > 0 && (
            <span className="px-2 py-0.5 bg-red-900/50 text-red-300 rounded">
              危険: {dangerousCount}
            </span>
          )}
          {warningCount > 0 && (
            <span className="px-2 py-0.5 bg-yellow-900/50 text-yellow-300 rounded">
              注意: {warningCount}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {attachments.map((att, i) => (
          <div key={i} className={`p-2 rounded border ${getRiskStyles(att.risk)}`}>
            <div className="flex items-start gap-2">
              <div className="shrink-0 mt-0.5">{getRiskIcon(att.risk)}</div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium break-all">{att.filename}</p>
                <p className="text-xs text-gray-500">{att.mimeType}</p>
                {att.issues.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {att.issues.map((issue, j) => (
                      <span key={j} className="text-xs px-1.5 py-0.5 bg-black/30 rounded">
                        {issue}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ========================================
// BECパターン表示
// ========================================

function BECIndicatorSection({ indicators }: { indicators: BECIndicator[] }) {
  const getSeverityStyles = (severity: BECIndicator['severity']) => {
    switch (severity) {
      case 'high': return 'bg-red-900/30 border-red-700 text-red-300';
      case 'medium': return 'bg-yellow-900/30 border-yellow-700 text-yellow-300';
      case 'low': return 'bg-blue-900/30 border-blue-700 text-blue-300';
    }
  };

  if (indicators.length === 0) {
    return null;
  }

  const highCount = indicators.filter(i => i.severity === 'high').length;
  const mediumCount = indicators.filter(i => i.severity === 'medium').length;

  return (
    <div className="p-4 bg-gray-800 rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-400">
          詐欺パターン検出 ({indicators.length}件)
        </h3>
        <div className="flex gap-2 text-xs">
          {highCount > 0 && (
            <span className="px-2 py-0.5 bg-red-900/50 text-red-300 rounded">
              高: {highCount}
            </span>
          )}
          {mediumCount > 0 && (
            <span className="px-2 py-0.5 bg-yellow-900/50 text-yellow-300 rounded">
              中: {mediumCount}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {indicators.map((indicator, i) => (
          <div key={i} className={`p-2 rounded border ${getSeverityStyles(indicator.severity)}`}>
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="text-sm font-medium">{indicator.pattern}</p>
                <p className="text-xs text-gray-400 mt-0.5">{indicator.description}</p>
                {indicator.matchedText && (
                  <p className="text-xs font-mono bg-black/30 px-1.5 py-0.5 rounded mt-1 inline-block">
                    "{indicator.matchedText}"
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ========================================
// TLS経路表示
// ========================================

function TLSPathSection({ headers }: { headers: Header[] }) {
  const hops = analyzeTLSPath(headers);
  const summary = getTLSSummary(hops);

  if (hops.length === 0) {
    return null;
  }

  const getRiskStyles = (risk: 'safe' | 'warning' | 'danger') => {
    switch (risk) {
      case 'danger': return 'bg-red-900/50 border-red-700';
      case 'warning': return 'bg-yellow-900/50 border-yellow-700';
      case 'safe': return 'bg-green-900/50 border-green-700';
    }
  };

  return (
    <div className="p-4 bg-gray-800 rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-400">
          TLS暗号化経路
        </h3>
        <div className={`text-xs px-2 py-0.5 rounded border ${getRiskStyles(summary.risk)}`}>
          {summary.encryptedHops}/{summary.totalHops} ホップが暗号化
        </div>
      </div>

      <div className="space-y-1">
        {hops.map((hop, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <div className={`w-2 h-2 rounded-full ${hop.encrypted ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-gray-400 truncate max-w-[120px]" title={hop.from}>
              {hop.from}
            </span>
            <svg className="w-3 h-3 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
            <span className="text-gray-300 truncate max-w-[120px]" title={hop.to}>
              {hop.to}
            </span>
            {hop.protocol && (
              <span className={`px-1.5 py-0.5 rounded ${hop.encrypted ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>
                {hop.protocol}
              </span>
            )}
          </div>
        ))}
      </div>

      {summary.unencryptedHops.length > 0 && (
        <div className="mt-3 p-2 bg-red-900/30 border border-red-700 rounded text-xs text-red-300">
          <p className="font-medium">警告: 暗号化されていない経路があります</p>
          <p className="text-red-400 mt-1">
            メールが平文で転送された可能性があります。機密情報が含まれている場合は注意が必要です。
          </p>
        </div>
      )}
    </div>
  );
}

// ========================================
// メインコンポーネント
// ========================================

export function SecurityAnalysis({ email, authResults, fromDomain, hash }: SecurityAnalysisProps) {
  // Worker API結果のstate（初期値はnullで、API呼び出し完了時に結果がセットされる）
  const [confusableResult, setConfusableResult] = useState<ConfusableResult | null>(null);
  // APIリクエスト中かどうか（domain変更時はtrueから開始）
  const [apiRequestId, setApiRequestId] = useState(0);
  const confusableLoading = fromDomain !== null && confusableResult === null && apiRequestId > 0;

  // ローカル分析（フォールバック用、即時実行）
  const lookalike = fromDomain ? detectLookalikeDomain(fromDomain) : null;
  const links = analyzeAllLinks(email);
  const attachments = analyzeAllAttachments(email.attachments);
  const becIndicators = detectBECPatterns(email);
  const securityScore = calculateSecurityScore(email, authResults, fromDomain);

  // Worker APIでの詳細分析
  useEffect(() => {
    if (!fromDomain) return;

    // リクエストIDをインクリメントして新しいリクエストを識別
    const currentRequestId = apiRequestId + 1;
    setApiRequestId(currentRequestId);
    setConfusableResult(null);

    let cancelled = false;

    analyzeConfusableDomain(fromDomain)
      .then(result => {
        if (!cancelled) {
          setConfusableResult(result);
        }
      })
      .catch(err => {
        console.warn('Confusable API error, using local fallback:', err);
        // APIエラー時は結果をnullのままにしてローカルフォールバックを使用
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDomain]);

  // 問題がない場合のチェック（API結果優先）
  const hasConfusableIssue = confusableResult
    ? confusableResult.risk !== 'none'
    : lookalike !== null;

  const hasIssues =
    hasConfusableIssue ||
    links.some(l => l.risk !== 'safe') ||
    attachments.some(a => a.risk !== 'safe') ||
    becIndicators.length > 0;

  return (
    <div className="space-y-4">
      {/* セキュリティスコア */}
      <SecurityScoreDisplay score={securityScore} />

      {/* セキュリティバッジ & QR共有 */}
      <div className="grid md:grid-cols-2 gap-4">
        <SecurityBadge
          score={securityScore}
          fromDomain={fromDomain}
          subject={email.subject}
          hash={hash}
        />
        <div className="p-4 bg-gray-800 rounded-lg flex flex-col justify-center items-center">
          <p className="text-sm text-gray-400 mb-3">検証結果を共有</p>
          <QRCodeShare
            hash={hash}
            score={securityScore}
            fromDomain={fromDomain}
            subject={email.subject}
          />
        </div>
      </div>

      {/* ホモグラフ/偽装ドメイン警告 */}
      {confusableLoading && (
        <div className="p-4 bg-gray-800 rounded-lg animate-pulse">
          <div className="h-4 bg-gray-700 rounded w-1/3 mb-2"></div>
          <div className="h-3 bg-gray-700 rounded w-2/3"></div>
        </div>
      )}
      {!confusableLoading && confusableResult && <ConfusableDomainAlert result={confusableResult} />}
      {!confusableLoading && !confusableResult && lookalike && <LookalikeDomainAlert result={lookalike} />}

      {/* 詐欺パターン */}
      <BECIndicatorSection indicators={becIndicators} />

      {/* リンク分析 */}
      <LinkAnalysisSection links={links} />

      {/* 添付ファイルリスク */}
      <AttachmentRiskSection attachments={attachments} />

      {/* TLS経路 */}
      <TLSPathSection headers={email.headers} />

      {/* 問題がない場合 */}
      {!hasIssues && securityScore.score >= 80 && (
        <div className="p-4 bg-green-900/30 border border-green-700 rounded-lg">
          <div className="flex items-center gap-2 text-green-300">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span className="font-medium">セキュリティ上の問題は検出されませんでした</span>
          </div>
        </div>
      )}
    </div>
  );
}
