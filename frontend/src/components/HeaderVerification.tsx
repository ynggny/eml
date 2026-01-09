import { useState, useEffect } from 'react';
import type { Header } from '../utils/emlParser';

interface HeaderVerificationProps {
  headers: Header[];
}

interface GeoInfo {
  country: string;
  city: string;
  org: string;
  ip: string;
}

interface VerificationResult {
  label: string;
  status: 'loading' | 'success' | 'warning' | 'error';
  value: string;
  details?: string;
}

export function HeaderVerification({ headers }: HeaderVerificationProps) {
  const [results, setResults] = useState<VerificationResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const getHeader = (key: string): string | undefined => {
    const header = headers.find((h) => h.key.toLowerCase() === key.toLowerCase());
    return header?.value;
  };

  const extractIps = (): string[] => {
    const ips: string[] = [];

    // X-Originating-IP
    const originatingIp = getHeader('x-originating-ip');
    if (originatingIp) {
      const cleanIp = originatingIp.replace(/[\[\]]/g, '').trim();
      if (cleanIp && !ips.includes(cleanIp)) {
        ips.push(cleanIp);
      }
    }

    // Receivedヘッダーから最初の外部IPを抽出
    const receivedHeaders = headers.filter(
      (h) => h.key.toLowerCase() === 'received'
    );
    for (const received of receivedHeaders) {
      const ipMatch = received.value.match(/\[(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\]/);
      if (ipMatch && !ips.includes(ipMatch[1])) {
        // プライベートIPを除外
        const ip = ipMatch[1];
        if (!ip.startsWith('10.') && !ip.startsWith('192.168.') && !ip.startsWith('127.')) {
          ips.push(ip);
          break; // 最初の外部IPのみ
        }
      }
    }

    return ips;
  };

  const fetchGeoInfo = async (ip: string): Promise<GeoInfo | null> => {
    try {
      const response = await fetch(`https://ipapi.co/${ip}/json/`);
      if (!response.ok) return null;
      const data = await response.json();
      return {
        country: data.country_name || 'Unknown',
        city: data.city || 'Unknown',
        org: data.org || 'Unknown',
        ip,
      };
    } catch {
      return null;
    }
  };

  const runVerification = async () => {
    setIsLoading(true);
    const newResults: VerificationResult[] = [];

    // IP Geolocation
    const ips = extractIps();
    if (ips.length > 0) {
      for (const ip of ips.slice(0, 2)) { // 最大2つまで
        newResults.push({
          label: `IP位置情報 (${ip})`,
          status: 'loading',
          value: '取得中...',
        });
      }
      setResults([...newResults]);

      // 並列でIP情報を取得
      const geoPromises = ips.slice(0, 2).map((ip) => fetchGeoInfo(ip));
      const geoResults = await Promise.all(geoPromises);

      geoResults.forEach((geo, index) => {
        if (geo) {
          newResults[index] = {
            label: `IP位置情報 (${geo.ip})`,
            status: 'success',
            value: `${geo.country}, ${geo.city}`,
            details: `組織: ${geo.org}`,
          };
        } else {
          newResults[index] = {
            label: `IP位置情報 (${ips[index]})`,
            status: 'error',
            value: '取得失敗',
          };
        }
      });
    }

    setResults([...newResults]);
    setIsLoading(false);
  };

  // ヘッダーが変わったらリセット
  useEffect(() => {
    setResults([]);
  }, [headers]);

  const hasVerifiableData = extractIps().length > 0;

  if (!hasVerifiableData) {
    return null;
  }

  const getStatusStyles = (status: VerificationResult['status']) => {
    switch (status) {
      case 'loading':
        return 'bg-gray-700/50 border-gray-600 text-gray-400';
      case 'success':
        return 'bg-green-900/30 border-green-700 text-green-300';
      case 'warning':
        return 'bg-yellow-900/30 border-yellow-700 text-yellow-300';
      case 'error':
        return 'bg-red-900/30 border-red-700 text-red-300';
    }
  };

  const getStatusIcon = (status: VerificationResult['status']) => {
    switch (status) {
      case 'loading':
        return (
          <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
        );
      case 'success':
        return (
          <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      case 'warning':
        return (
          <svg className="w-4 h-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'error':
        return (
          <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        );
    }
  };

  return (
    <div className="p-4 bg-gray-800 rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-400">
          ヘッダー検証
        </h3>
        <button
          onClick={runVerification}
          disabled={isLoading}
          className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded transition-colors"
        >
          {isLoading ? '検証中...' : '検証を実行'}
        </button>
      </div>

      {results.length === 0 ? (
        <p className="text-xs text-gray-500">
          ボタンをクリックしてIP位置情報などを取得します
        </p>
      ) : (
        <div className="space-y-2">
          {results.map((result, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 p-2 rounded border ${getStatusStyles(result.status)}`}
            >
              <div className="shrink-0 mt-0.5">{getStatusIcon(result.status)}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-medium text-gray-400">{result.label}:</span>
                  <span className="text-xs break-all">{result.value}</span>
                </div>
                {result.details && (
                  <p className="text-xs text-gray-500 mt-1">{result.details}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
