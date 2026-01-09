interface AuthResultsProps {
  results: {
    spf?: string;
    dkim?: string;
    dmarc?: string;
  } | null;
}

function getStatusColor(status?: string): string {
  if (!status) return 'text-gray-400';
  switch (status.toLowerCase()) {
    case 'pass':
      return 'text-green-500';
    case 'fail':
      return 'text-red-500';
    case 'softfail':
    case 'neutral':
      return 'text-yellow-500';
    default:
      return 'text-gray-400';
  }
}

function getStatusIcon(status?: string): string {
  if (!status) return '-';
  switch (status.toLowerCase()) {
    case 'pass':
      return '✓';
    case 'fail':
      return '✗';
    case 'softfail':
    case 'neutral':
      return '!';
    default:
      return '-';
  }
}

export function AuthResults({ results }: AuthResultsProps) {
  if (!results) {
    return (
      <div className="p-4 bg-gray-800 rounded-lg">
        <h3 className="text-sm font-semibold text-gray-400 mb-2">認証結果</h3>
        <p className="text-sm text-gray-500">
          Authentication-Resultsヘッダーが見つかりません
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 bg-gray-800 rounded-lg">
      <h3 className="text-sm font-semibold text-gray-400 mb-3">認証結果</h3>
      <div className="grid grid-cols-3 gap-4">
        <div className="text-center">
          <div
            className={`text-2xl font-bold ${getStatusColor(results.spf)}`}
          >
            {getStatusIcon(results.spf)}
          </div>
          <div className="text-xs text-gray-400 mt-1">SPF</div>
          <div className={`text-xs ${getStatusColor(results.spf)}`}>
            {results.spf ?? 'N/A'}
          </div>
        </div>
        <div className="text-center">
          <div
            className={`text-2xl font-bold ${getStatusColor(results.dkim)}`}
          >
            {getStatusIcon(results.dkim)}
          </div>
          <div className="text-xs text-gray-400 mt-1">DKIM</div>
          <div className={`text-xs ${getStatusColor(results.dkim)}`}>
            {results.dkim ?? 'N/A'}
          </div>
        </div>
        <div className="text-center">
          <div
            className={`text-2xl font-bold ${getStatusColor(results.dmarc)}`}
          >
            {getStatusIcon(results.dmarc)}
          </div>
          <div className="text-xs text-gray-400 mt-1">DMARC</div>
          <div className={`text-xs ${getStatusColor(results.dmarc)}`}>
            {results.dmarc ?? 'N/A'}
          </div>
        </div>
      </div>
    </div>
  );
}
