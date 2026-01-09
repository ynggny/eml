/**
 * ARCチェーン検証コンポーネント
 * Authenticated Received Chain (ARC) の情報を表示
 */

import type { Header } from '../utils/emlParser';

interface ARCChainViewerProps {
  headers: Header[];
}

interface ARCSet {
  instance: number;
  seal?: {
    algorithm: string;
    signature: string;
    domain: string;
    selector: string;
    timestamp?: string;
    cv: 'none' | 'fail' | 'pass';
  };
  messageSignature?: {
    algorithm: string;
    signature: string;
    domain: string;
    selector: string;
    signedHeaders: string[];
  };
  authenticationResults?: {
    server: string;
    spf?: string;
    dkim?: string;
    dmarc?: string;
  };
}

/**
 * ARCヘッダーをパース
 */
function parseARCHeaders(headers: Header[]): ARCSet[] {
  const arcSets: Map<number, ARCSet> = new Map();

  for (const header of headers) {
    const key = header.key.toLowerCase();
    const value = header.value;

    // インスタンス番号を抽出
    const instanceMatch = value.match(/i=(\d+)/);
    if (!instanceMatch) continue;
    const instance = parseInt(instanceMatch[1], 10);

    if (!arcSets.has(instance)) {
      arcSets.set(instance, { instance });
    }
    const arcSet = arcSets.get(instance)!;

    if (key === 'arc-seal') {
      const algMatch = value.match(/a=([^;\s]+)/);
      const sigMatch = value.match(/b=([^;\s]+)/);
      const domainMatch = value.match(/d=([^;\s]+)/);
      const selectorMatch = value.match(/s=([^;\s]+)/);
      const cvMatch = value.match(/cv=([^;\s]+)/);
      const tMatch = value.match(/t=(\d+)/);

      arcSet.seal = {
        algorithm: algMatch?.[1] ?? 'unknown',
        signature: sigMatch?.[1] ? sigMatch[1].slice(0, 32) + '...' : '',
        domain: domainMatch?.[1] ?? 'unknown',
        selector: selectorMatch?.[1] ?? 'unknown',
        cv: (cvMatch?.[1] as 'none' | 'fail' | 'pass') ?? 'none',
        timestamp: tMatch?.[1] ? new Date(parseInt(tMatch[1], 10) * 1000).toLocaleString('ja-JP') : undefined,
      };
    }

    if (key === 'arc-message-signature') {
      const algMatch = value.match(/a=([^;\s]+)/);
      const sigMatch = value.match(/b=([^;\s]+)/);
      const domainMatch = value.match(/d=([^;\s]+)/);
      const selectorMatch = value.match(/s=([^;\s]+)/);
      const headersMatch = value.match(/h=([^;]+)/);

      arcSet.messageSignature = {
        algorithm: algMatch?.[1] ?? 'unknown',
        signature: sigMatch?.[1] ? sigMatch[1].slice(0, 32) + '...' : '',
        domain: domainMatch?.[1] ?? 'unknown',
        selector: selectorMatch?.[1] ?? 'unknown',
        signedHeaders: headersMatch?.[1]?.split(':').map(h => h.trim()) ?? [],
      };
    }

    if (key === 'arc-authentication-results') {
      // サーバー名を抽出（最初のセミコロンまで）
      const serverMatch = value.match(/^([^;]+)/);
      const spfMatch = value.match(/spf=(pass|fail|softfail|neutral|none)/i);
      const dkimMatch = value.match(/dkim=(pass|fail|none)/i);
      const dmarcMatch = value.match(/dmarc=(pass|fail|none)/i);

      arcSet.authenticationResults = {
        server: serverMatch?.[1]?.replace(/^i=\d+;\s*/, '').trim() ?? 'unknown',
        spf: spfMatch?.[1],
        dkim: dkimMatch?.[1],
        dmarc: dmarcMatch?.[1],
      };
    }
  }

  // インスタンス番号でソート
  return Array.from(arcSets.values()).sort((a, b) => a.instance - b.instance);
}

/**
 * チェーン検証結果を取得
 */
function getChainValidationResult(arcSets: ARCSet[]): {
  status: 'valid' | 'invalid' | 'none';
  message: string;
} {
  if (arcSets.length === 0) {
    return { status: 'none', message: 'ARCチェーンなし' };
  }

  // 最後のARC-Sealのcv値をチェック
  const lastSet = arcSets[arcSets.length - 1];
  if (!lastSet.seal) {
    return { status: 'invalid', message: 'ARC-Sealが不完全' };
  }

  if (lastSet.seal.cv === 'fail') {
    return { status: 'invalid', message: 'チェーン検証失敗' };
  }

  // 全てのセットが揃っているかチェック
  for (let i = 0; i < arcSets.length; i++) {
    const set = arcSets[i];
    if (set.instance !== i + 1) {
      return { status: 'invalid', message: `インスタンス${i + 1}が欠落` };
    }
    if (!set.seal || !set.messageSignature || !set.authenticationResults) {
      return { status: 'invalid', message: `インスタンス${set.instance}が不完全` };
    }
  }

  return { status: 'valid', message: `${arcSets.length}ホップのチェーン検証成功` };
}

export function ARCChainViewer({ headers }: ARCChainViewerProps) {
  const arcSets = parseARCHeaders(headers);
  const validation = getChainValidationResult(arcSets);

  if (arcSets.length === 0) {
    return null;
  }

  const getStatusStyles = (status: 'valid' | 'invalid' | 'none') => {
    switch (status) {
      case 'valid': return 'bg-green-900/30 border-green-700 text-green-300';
      case 'invalid': return 'bg-red-900/30 border-red-700 text-red-300';
      case 'none': return 'bg-gray-700/50 border-gray-600 text-gray-400';
    }
  };

  const getCVStyles = (cv: 'none' | 'fail' | 'pass') => {
    switch (cv) {
      case 'pass': return 'bg-green-900/50 text-green-400';
      case 'fail': return 'bg-red-900/50 text-red-400';
      case 'none': return 'bg-gray-700 text-gray-400';
    }
  };

  const getAuthStyles = (result?: string) => {
    if (!result) return 'text-gray-500';
    switch (result.toLowerCase()) {
      case 'pass': return 'text-green-400';
      case 'fail': return 'text-red-400';
      default: return 'text-yellow-400';
    }
  };

  return (
    <div className="p-4 bg-gray-800 rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-400">
          ARCチェーン（転送認証）
        </h3>
        <span className={`text-xs px-2 py-0.5 rounded border ${getStatusStyles(validation.status)}`}>
          {validation.message}
        </span>
      </div>

      <div className="space-y-3">
        {arcSets.map((set) => (
          <div key={set.instance} className="p-3 bg-gray-700/50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold text-white bg-blue-600 px-2 py-0.5 rounded">
                #{set.instance}
              </span>
              {set.seal && (
                <span className={`text-xs px-2 py-0.5 rounded ${getCVStyles(set.seal.cv)}`}>
                  cv={set.seal.cv}
                </span>
              )}
              {set.seal?.timestamp && (
                <span className="text-xs text-gray-500">{set.seal.timestamp}</span>
              )}
            </div>

            {/* 認証結果 */}
            {set.authenticationResults && (
              <div className="mb-2">
                <p className="text-xs text-gray-500 mb-1">
                  認証サーバー: {set.authenticationResults.server}
                </p>
                <div className="flex gap-3 text-xs">
                  <span>
                    SPF: <span className={getAuthStyles(set.authenticationResults.spf)}>
                      {set.authenticationResults.spf ?? '-'}
                    </span>
                  </span>
                  <span>
                    DKIM: <span className={getAuthStyles(set.authenticationResults.dkim)}>
                      {set.authenticationResults.dkim ?? '-'}
                    </span>
                  </span>
                  <span>
                    DMARC: <span className={getAuthStyles(set.authenticationResults.dmarc)}>
                      {set.authenticationResults.dmarc ?? '-'}
                    </span>
                  </span>
                </div>
              </div>
            )}

            {/* 署名情報 */}
            {set.messageSignature && (
              <div className="text-xs text-gray-400">
                <p>
                  署名ドメイン: <span className="text-gray-300">{set.messageSignature.domain}</span>
                  {' '}({set.messageSignature.algorithm})
                </p>
                {set.messageSignature.signedHeaders.length > 0 && (
                  <p className="text-gray-500 mt-0.5">
                    署名対象: {set.messageSignature.signedHeaders.join(', ')}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 説明 */}
      <div className="mt-3 p-2 bg-gray-900/50 rounded text-xs text-gray-500">
        <p>
          ARC (Authenticated Received Chain) は、メールが転送される際に認証情報を保持する仕組みです。
          各ホップで認証結果が記録され、転送チェーン全体の信頼性を検証できます。
        </p>
      </div>
    </div>
  );
}
