import type { Header } from '../utils/emlParser';

interface ReceivedPathProps {
  headers: Header[];
}

interface ReceivedHop {
  from?: string;
  by?: string;
  with?: string;
  timestamp?: string;
  raw: string;
}

/**
 * Receivedヘッダーをパースして経路情報を抽出
 * Receivedヘッダーは新しい順に並んでいるため、逆順にして送信元から表示
 */
function parseReceivedHeaders(headers: Header[]): ReceivedHop[] {
  const receivedHeaders = headers.filter(
    (h) => h.key.toLowerCase() === 'received'
  );

  return receivedHeaders
    .map((h) => {
      const value = h.value;
      const hop: ReceivedHop = { raw: value };

      // from XXX の抽出
      const fromMatch = value.match(/from\s+([^\s(]+)/i);
      if (fromMatch) {
        hop.from = fromMatch[1];
      }

      // by XXX の抽出
      const byMatch = value.match(/by\s+([^\s(]+)/i);
      if (byMatch) {
        hop.by = byMatch[1];
      }

      // with XXX の抽出（プロトコル）
      const withMatch = value.match(/with\s+([^\s;]+)/i);
      if (withMatch) {
        hop.with = withMatch[1];
      }

      // タイムスタンプの抽出（; 以降の日時）
      const dateMatch = value.match(/;\s*(.+)$/);
      if (dateMatch) {
        try {
          const date = new Date(dateMatch[1].trim());
          if (!isNaN(date.getTime())) {
            hop.timestamp = date.toLocaleString('ja-JP');
          }
        } catch {
          // パース失敗時は無視
        }
      }

      return hop;
    })
    .reverse(); // 送信元から順に表示
}

export function ReceivedPath({ headers }: ReceivedPathProps) {
  const hops = parseReceivedHeaders(headers);

  if (hops.length === 0) {
    return null;
  }

  return (
    <div className="p-4 bg-gray-800 rounded-lg">
      <h3 className="text-sm font-semibold text-gray-400 mb-3">
        メール経路 ({hops.length}ホップ)
      </h3>

      <div className="relative">
        {/* 縦線 */}
        <div className="absolute left-3 top-4 bottom-4 w-0.5 bg-gray-700" />

        <div className="space-y-4">
          {hops.map((hop, index) => (
            <div key={index} className="relative pl-8">
              {/* ノード */}
              <div
                className={`absolute left-1 top-1.5 w-4 h-4 rounded-full border-2 ${
                  index === 0
                    ? 'bg-green-500 border-green-400' // 送信元
                    : index === hops.length - 1
                    ? 'bg-blue-500 border-blue-400' // 受信先
                    : 'bg-gray-600 border-gray-500' // 中継
                }`}
              />

              <div className="p-3 bg-gray-900 rounded-lg">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* From → By */}
                    <div className="flex items-center gap-2 text-sm">
                      {hop.from && (
                        <>
                          <span className="text-gray-400 shrink-0">from</span>
                          <span className="text-white truncate" title={hop.from}>
                            {hop.from}
                          </span>
                        </>
                      )}
                      {hop.from && hop.by && (
                        <span className="text-gray-500">→</span>
                      )}
                      {hop.by && (
                        <>
                          <span className="text-gray-400 shrink-0">by</span>
                          <span className="text-white truncate" title={hop.by}>
                            {hop.by}
                          </span>
                        </>
                      )}
                    </div>

                    {/* プロトコル */}
                    {hop.with && (
                      <div className="mt-1">
                        <span className="text-xs px-1.5 py-0.5 bg-gray-700 rounded text-gray-300">
                          {hop.with}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* タイムスタンプ */}
                  {hop.timestamp && (
                    <span className="text-xs text-gray-500 shrink-0">
                      {hop.timestamp}
                    </span>
                  )}
                </div>

                {/* ラベル */}
                {(index === 0 || index === hops.length - 1) && (
                  <div className="mt-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        index === 0
                          ? 'bg-green-900/50 text-green-400'
                          : 'bg-blue-900/50 text-blue-400'
                      }`}
                    >
                      {index === 0 ? '送信元' : '受信先'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 詳細表示トグル */}
      <details className="mt-4">
        <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400">
          生のReceivedヘッダーを表示
        </summary>
        <div className="mt-2 space-y-2">
          {hops.map((hop, index) => (
            <pre
              key={index}
              className="text-xs text-gray-400 bg-gray-900 p-2 rounded overflow-x-auto whitespace-pre-wrap break-all"
            >
              {hop.raw}
            </pre>
          ))}
        </div>
      </details>
    </div>
  );
}
