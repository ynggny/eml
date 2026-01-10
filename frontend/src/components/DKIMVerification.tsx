/**
 * DKIM署名検証コンポーネント
 * Worker APIを呼び出してDKIM署名の本文ハッシュ検証を行う
 */

import { useState, useCallback } from 'react';
import { verifyDKIMSignature, type DKIMVerificationResult } from '../utils/api';
import type { Header } from '../utils/emlParser';

interface DKIMVerificationProps {
  headers: Header[];
  rawBody: string;
  rawHeaders: string;
}

type VerificationStatus = 'idle' | 'loading' | 'success' | 'error';

export function DKIMVerification({ headers, rawBody, rawHeaders }: DKIMVerificationProps) {
  const [status, setStatus] = useState<VerificationStatus>('idle');
  const [result, setResult] = useState<DKIMVerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // DKIM-Signatureヘッダーがあるかチェック
  const hasDKIMSignature = headers.some(
    h => h.key.toLowerCase() === 'dkim-signature'
  );

  const handleVerify = useCallback(async () => {
    setStatus('loading');
    setError(null);

    try {
      const response = await verifyDKIMSignature(headers, rawBody, rawHeaders);
      setResult(response);
      setStatus('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'DKIM検証に失敗しました');
      setStatus('error');
    }
  }, [headers, rawBody, rawHeaders]);

  if (!hasDKIMSignature) {
    return (
      <div className="p-4 bg-gray-800 rounded-lg">
        <h3 className="text-sm font-semibold text-gray-400 mb-2">DKIM署名検証</h3>
        <p className="text-sm text-gray-500">
          DKIM-Signatureヘッダーがありません
        </p>
      </div>
    );
  }

  const getStatusColor = (passed: boolean | null) => {
    if (passed === null) return 'text-gray-400';
    return passed ? 'text-green-500' : 'text-red-500';
  };

  const getStatusIcon = (passed: boolean | null) => {
    if (passed === null) return '?';
    return passed ? '✓' : '✗';
  };

  return (
    <div className="p-4 bg-gray-800 rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-400">DKIM署名検証</h3>
        <button
          onClick={handleVerify}
          disabled={status === 'loading'}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            status === 'loading'
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-500 text-white'
          }`}
        >
          {status === 'loading' ? '検証中...' : '署名を検証'}
        </button>
      </div>

      {status === 'idle' && (
        <p className="text-xs text-gray-500">
          「署名を検証」をクリックしてDKIM署名と本文ハッシュを検証します
        </p>
      )}

      {status === 'error' && (
        <div className="p-3 bg-red-900/30 border border-red-800 rounded-lg">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {status === 'success' && result && (
        <div className="space-y-3">
          {/* ステータスサマリー */}
          <div className={`p-3 rounded-lg border ${
            result.status === 'pass'
              ? 'bg-green-900/30 border-green-700'
              : result.status === 'fail'
                ? 'bg-red-900/30 border-red-700'
                : 'bg-yellow-900/30 border-yellow-700'
          }`}>
            <div className="flex items-center gap-2">
              <span className={`text-lg font-bold ${
                result.status === 'pass'
                  ? 'text-green-400'
                  : result.status === 'fail'
                    ? 'text-red-400'
                    : 'text-yellow-400'
              }`}>
                {result.status === 'pass' ? '✓' : result.status === 'fail' ? '✗' : '!'}
              </span>
              <span className="text-sm font-medium text-white">
                {result.status === 'pass' && '署名検証成功 - メールは改ざんされていません'}
                {result.status === 'fail' && '署名検証失敗 - メールが改ざんされた可能性があります'}
                {result.status === 'none' && 'DKIM署名がありません'}
                {result.status === 'temperror' && '検証中に一時的なエラーが発生しました'}
                {result.status === 'permerror' && '署名の形式に問題があります'}
              </span>
            </div>
          </div>

          {/* 詳細情報 */}
          <div className="grid grid-cols-2 gap-3">
            {/* 本文ハッシュ検証 */}
            <div className="p-3 bg-gray-900 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-lg font-bold ${getStatusColor(result.bodyHashValid)}`}>
                  {getStatusIcon(result.bodyHashValid)}
                </span>
                <span className="text-xs font-medium text-gray-400">本文ハッシュ</span>
              </div>
              <p className={`text-xs ${getStatusColor(result.bodyHashValid)}`}>
                {result.bodyHashValid ? '一致' : '不一致（改ざんの可能性）'}
              </p>
            </div>

            {/* 署名検証 */}
            <div className="p-3 bg-gray-900 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-lg font-bold ${getStatusColor(result.signatureValid)}`}>
                  {getStatusIcon(result.signatureValid)}
                </span>
                <span className="text-xs font-medium text-gray-400">署名</span>
              </div>
              <p className={`text-xs ${getStatusColor(result.signatureValid)}`}>
                {result.signatureValid ? '有効' : result.publicKeyFound ? '無効' : '検証不可'}
              </p>
            </div>
          </div>

          {/* 技術情報 */}
          {(result.domain || result.selector || result.algorithm) && (
            <div className="p-3 bg-gray-900 rounded-lg text-xs">
              <p className="text-gray-400 mb-2">技術情報</p>
              <div className="space-y-1 text-gray-300">
                {result.domain && <p>ドメイン: <span className="font-mono">{result.domain}</span></p>}
                {result.selector && <p>セレクタ: <span className="font-mono">{result.selector}</span></p>}
                {result.algorithm && <p>アルゴリズム: <span className="font-mono">{result.algorithm}</span></p>}
                {result.details?.keySize && <p>鍵サイズ: {result.details.keySize}ビット</p>}
                {result.publicKeyFound !== undefined && (
                  <p>公開鍵: {result.publicKeyFound ? '取得成功' : '取得失敗'}</p>
                )}
              </div>
            </div>
          )}

          {/* 問題点 */}
          {result.details?.issues && result.details.issues.length > 0 && (
            <div className="p-3 bg-yellow-900/20 border border-yellow-800 rounded-lg">
              <p className="text-xs font-medium text-yellow-400 mb-2">検出された問題</p>
              <ul className="text-xs text-yellow-300 space-y-1">
                {result.details.issues.map((issue, i) => (
                  <li key={i}>・{issue}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
