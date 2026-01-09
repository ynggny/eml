/**
 * QRコード共有コンポーネント
 * 検証結果のURLやハッシュをQRコードで共有
 */

import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import type { SecurityScore } from '../utils/securityAnalysis';

interface QRCodeShareProps {
  hash: string;
  score: SecurityScore;
  fromDomain: string | null;
  subject: string | null;
}

export function QRCodeShare({ hash, score, fromDomain, subject }: QRCodeShareProps) {
  const [showModal, setShowModal] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [shareType, setShareType] = useState<'hash' | 'summary'>('summary');

  // QRコードに含めるデータを生成
  const getShareData = () => {
    if (shareType === 'hash') {
      return `SHA-256: ${hash}`;
    }

    // サマリー情報
    const lines = [
      `EML Viewer セキュリティレポート`,
      ``,
      `スコア: ${score.score}/100 (${score.grade})`,
      fromDomain ? `送信元: ${fromDomain}` : '',
      subject ? `件名: ${subject.slice(0, 50)}${subject.length > 50 ? '...' : ''}` : '',
      ``,
      `SHA-256: ${hash.slice(0, 32)}...`,
      ``,
      `検証日時: ${new Date().toLocaleString('ja-JP')}`,
    ].filter(Boolean);

    return lines.join('\n');
  };

  // QRコードを生成
  useEffect(() => {
    if (!showModal) return;

    const generateQR = async () => {
      try {
        const data = getShareData();
        const url = await QRCode.toDataURL(data, {
          width: 300,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#ffffff',
          },
          errorCorrectionLevel: 'M',
        });
        setQrDataUrl(url);
      } catch {
        console.error('QRコード生成に失敗しました');
      }
    };

    generateQR();
  }, [showModal, shareType, hash, score, fromDomain, subject]);

  // QRコードをダウンロード
  const handleDownload = () => {
    if (!qrDataUrl) return;

    const link = document.createElement('a');
    link.download = `eml-qr-${hash.slice(0, 8)}.png`;
    link.href = qrDataUrl;
    link.click();
  };

  // クリップボードにコピー
  const handleCopy = async () => {
    const data = getShareData();
    try {
      await navigator.clipboard.writeText(data);
      alert('テキストをコピーしました');
    } catch {
      alert('コピーに失敗しました');
    }
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors"
        title="QRコードで共有"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h2M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
        </svg>
        QR共有
      </button>

      {/* モーダル */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-gray-800 rounded-lg p-6 max-w-sm w-full mx-4 relative">
            {/* 閉じるボタン */}
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-3 right-3 text-gray-400 hover:text-white"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <h3 className="text-lg font-semibold text-white mb-4">QRコード共有</h3>

            {/* タイプ切り替え */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setShareType('summary')}
                className={`flex-1 py-2 text-xs rounded ${
                  shareType === 'summary'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                サマリー
              </button>
              <button
                onClick={() => setShareType('hash')}
                className={`flex-1 py-2 text-xs rounded ${
                  shareType === 'hash'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                ハッシュのみ
              </button>
            </div>

            {/* QRコード表示 */}
            <div className="flex justify-center mb-4">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="QRコード" className="rounded" />
              ) : (
                <div className="w-[300px] h-[300px] bg-gray-700 rounded animate-pulse" />
              )}
            </div>

            {/* データプレビュー */}
            <div className="mb-4 p-2 bg-gray-900 rounded text-xs text-gray-400 font-mono max-h-32 overflow-auto">
              <pre className="whitespace-pre-wrap">{getShareData()}</pre>
            </div>

            {/* アクションボタン */}
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="flex-1 py-2 text-sm bg-gray-700 hover:bg-gray-600 rounded transition-colors"
              >
                テキストをコピー
              </button>
              <button
                onClick={handleDownload}
                className="flex-1 py-2 text-sm bg-blue-600 hover:bg-blue-500 rounded transition-colors"
              >
                画像をダウンロード
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
