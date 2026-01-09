/**
 * BIMI（Brand Indicators for Message Identification）ビューア
 * ドメインのブランドロゴを取得・表示
 */

import { useState } from 'react';

interface BIMIViewerProps {
  domain: string | null;
}

interface BIMIRecord {
  version: string;
  location?: string;
  authority?: string;
}

/**
 * BIMIレコードをパース
 */
function parseBIMIRecord(txtRecord: string): BIMIRecord | null {
  if (!txtRecord.startsWith('v=BIMI1')) {
    return null;
  }

  const record: BIMIRecord = { version: 'BIMI1' };

  // l= (ロゴURL)
  const locationMatch = txtRecord.match(/l=([^;\s]+)/);
  if (locationMatch) {
    record.location = locationMatch[1];
  }

  // a= (VMC証明書URL)
  const authorityMatch = txtRecord.match(/a=([^;\s]+)/);
  if (authorityMatch) {
    record.authority = authorityMatch[1];
  }

  return record;
}

export function BIMIViewer({ domain }: BIMIViewerProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bimiRecord, setBimiRecord] = useState<BIMIRecord | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoError, setLogoError] = useState(false);

  const fetchBIMI = async () => {
    if (!domain) return;

    setLoading(true);
    setError(null);
    setBimiRecord(null);
    setLogoUrl(null);
    setLogoError(false);

    try {
      // default._bimi.domain.com でDNS TXTレコードを取得
      const bimiDomain = `default._bimi.${domain}`;
      const response = await fetch(
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(bimiDomain)}&type=TXT`,
        { headers: { Accept: 'application/dns-json' } }
      );

      const data = await response.json();

      if (!data.Answer || data.Answer.length === 0) {
        setError('BIMIレコードが見つかりませんでした');
        return;
      }

      // TXTレコードを結合（複数に分割されている場合）
      const txtRecord = data.Answer
        .map((a: { data: string }) => a.data.replace(/"/g, ''))
        .join('');

      const parsed = parseBIMIRecord(txtRecord);
      if (!parsed) {
        setError('無効なBIMIレコード形式');
        return;
      }

      setBimiRecord(parsed);

      // ロゴURLがあればプロキシ経由で取得を試みる
      if (parsed.location) {
        // SVGを直接表示（CORSの問題があるかもしれない）
        setLogoUrl(parsed.location);
      }
    } catch {
      setError('BIMIレコードの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  if (!domain) {
    return null;
  }

  return (
    <div className="p-4 bg-gray-800 rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-400">
          BIMI（ブランドロゴ）
        </h3>
        {!loading && !bimiRecord && (
          <button
            onClick={fetchBIMI}
            className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 rounded transition-colors"
          >
            ロゴを取得
          </button>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
        </div>
      )}

      {error && (
        <div className="p-3 bg-gray-700/50 rounded text-xs text-gray-400">
          <p>{error}</p>
          <p className="mt-1 text-gray-500">
            このドメインはBIMIを設定していない可能性があります。
          </p>
        </div>
      )}

      {bimiRecord && (
        <div className="space-y-4">
          {/* ロゴ表示 */}
          <div className="flex justify-center">
            <div className="w-24 h-24 bg-white rounded-lg flex items-center justify-center overflow-hidden">
              {logoUrl && !logoError ? (
                <img
                  src={logoUrl}
                  alt={`${domain} logo`}
                  className="max-w-full max-h-full object-contain"
                  onError={() => setLogoError(true)}
                />
              ) : (
                <div className="text-gray-400 text-center">
                  <svg className="w-8 h-8 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-xs">読込不可</span>
                </div>
              )}
            </div>
          </div>

          {/* レコード情報 */}
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500">バージョン:</span>
              <span className="text-gray-300">{bimiRecord.version}</span>
            </div>
            {bimiRecord.location && (
              <div>
                <span className="text-gray-500">ロゴURL:</span>
                <a
                  href={bimiRecord.location}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline break-all ml-2"
                >
                  {bimiRecord.location.length > 50
                    ? bimiRecord.location.slice(0, 50) + '...'
                    : bimiRecord.location}
                </a>
              </div>
            )}
            {bimiRecord.authority && (
              <div>
                <span className="text-gray-500">VMC証明書:</span>
                <span className="text-green-400 ml-2">設定あり</span>
              </div>
            )}
          </div>

          {/* 説明 */}
          <div className="p-2 bg-gray-900/50 rounded text-xs text-gray-500">
            <p>
              BIMI (Brand Indicators for Message Identification) は、
              メールクライアントに送信者のブランドロゴを表示する仕組みです。
              DMARCのポリシーが設定されているドメインのみ利用できます。
            </p>
          </div>
        </div>
      )}

      {!loading && !bimiRecord && !error && (
        <div className="text-xs text-gray-500">
          <p>クリックしてBIMIレコードを取得</p>
          <p className="mt-1">対象ドメイン: {domain}</p>
        </div>
      )}
    </div>
  );
}
