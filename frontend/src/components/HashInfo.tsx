interface HashInfoProps {
  hash: string | null;
}

export function HashInfo({ hash }: HashInfoProps) {
  if (!hash) return null;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(hash);
  };

  return (
    <div className="p-4 bg-gray-800 rounded-lg">
      <h3 className="text-sm font-semibold text-gray-400 mb-2">
        ファイルハッシュ (SHA-256)
      </h3>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-xs text-green-400 bg-gray-900 p-2 rounded overflow-x-auto">
          {hash}
        </code>
        <button
          onClick={copyToClipboard}
          className="p-2 text-gray-400 hover:text-white transition-colors"
          title="コピー"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
