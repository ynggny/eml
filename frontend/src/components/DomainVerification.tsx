import { useState, useCallback } from 'react';
import { verifyDomain, type VerifyResponse } from '../utils/api';

interface DomainVerificationProps {
  domain: string | null;
  dkimSelector?: string;
}

type VerificationStatus = 'idle' | 'loading' | 'success' | 'error';

export function DomainVerification({
  domain,
  dkimSelector,
}: DomainVerificationProps) {
  const [status, setStatus] = useState<VerificationStatus>('idle');
  const [result, setResult] = useState<VerifyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = useCallback(async () => {
    if (!domain) return;

    setStatus('loading');
    setError(null);

    try {
      const response = await verifyDomain({ domain, dkimSelector });
      setResult(response);
      setStatus('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'DNS検証に失敗しました');
      setStatus('error');
    }
  }, [domain, dkimSelector]);

  if (!domain) {
    return null;
  }

  return (
    <div className="p-4 bg-gray-800 rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-400">DNS検証</h3>
        <button
          onClick={handleVerify}
          disabled={status === 'loading'}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            status === 'loading'
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-500 text-white'
          }`}
        >
          {status === 'loading' ? '検証中...' : '検証する'}
        </button>
      </div>

      <p className="text-xs text-gray-500 mb-3">
        対象ドメイン: <span className="text-gray-300">{domain}</span>
      </p>

      {status === 'idle' && (
        <p className="text-xs text-gray-500">
          「検証する」をクリックしてDNSレコードを確認します
        </p>
      )}

      {status === 'error' && (
        <div className="p-3 bg-red-900/30 border border-red-800 rounded-lg">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {status === 'success' && result && (
        <div className="space-y-3">
          <RecordCard
            title="SPF"
            exists={result.spf.exists}
            record={result.spf.record}
          />
          <RecordCard
            title="DKIM"
            exists={result.dkim.exists}
            record={result.dkim.record}
            note={!dkimSelector ? 'セレクタが不明なため検証できません' : undefined}
          />
          <RecordCard
            title="DMARC"
            exists={result.dmarc.exists}
            record={result.dmarc.record}
            policy={result.dmarc.policy}
          />
        </div>
      )}
    </div>
  );
}

interface RecordCardProps {
  title: string;
  exists: boolean;
  record: string | null;
  policy?: string | null;
  note?: string;
}

function RecordCard({ title, exists, record, policy, note }: RecordCardProps) {
  const statusColor = exists ? 'text-green-500' : 'text-yellow-500';
  const statusIcon = exists ? '✓' : '!';
  const statusText = exists ? '設定あり' : '未設定';

  return (
    <div className="p-3 bg-gray-900 rounded-lg">
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-lg font-bold ${statusColor}`}>{statusIcon}</span>
        <span className="text-sm font-medium text-white">{title}</span>
        <span className={`text-xs ${statusColor}`}>{statusText}</span>
        {policy && (
          <span className="text-xs px-2 py-0.5 bg-gray-700 rounded text-gray-300">
            policy={policy}
          </span>
        )}
      </div>
      {note && <p className="text-xs text-gray-500 mb-2">{note}</p>}
      {record && (
        <pre className="text-xs text-gray-400 bg-gray-800 p-2 rounded overflow-x-auto whitespace-pre-wrap break-all">
          {record}
        </pre>
      )}
    </div>
  );
}
