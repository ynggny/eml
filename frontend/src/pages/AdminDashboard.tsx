import { useState, useEffect, useCallback } from 'react';
import {
  getStats,
  getRecords,
  deleteRecord,
  downloadEml,
  getPresignedUrl,
  getStoredAuth,
  setStoredAuth,
  clearStoredAuth,
  ApiError,
  type StatsResponse,
  type EmlRecord,
} from '../utils/api';
import { parseEML, type ParsedEmail } from '../utils/emlParser';
import { EmailViewer } from '../components/EmailViewer';

export function AdminDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [records, setRecords] = useState<EmlRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<EmlRecord | null>(null);

  const limit = 20;

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [statsData, recordsData] = await Promise.all([
        getStats(),
        getRecords({ page, limit, search: search || undefined }),
      ]);

      setStats(statsData);
      setRecords(recordsData.records);
      setTotal(recordsData.total);
      setIsAuthenticated(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setIsAuthenticated(false);
        clearStoredAuth();
      } else {
        setError(
          err instanceof Error ? err.message : 'データの取得に失敗しました'
        );
      }
    } finally {
      setIsLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    // 保存された認証情報があれば認証済みとしてデータ取得を試行
    if (getStoredAuth()) {
      fetchData();
    } else {
      setIsAuthenticated(false);
      setIsLoading(false);
    }
  }, [fetchData]);

  const handleLogin = async (username: string, password: string) => {
    setStoredAuth(username, password);
    await fetchData();
  };

  const handleLogout = () => {
    clearStoredAuth();
    setIsAuthenticated(false);
    setStats(null);
    setRecords([]);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('このレコードを削除しますか？')) {
      return;
    }

    try {
      await deleteRecord(id);
      setSelectedRecord(null);
      fetchData();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setIsAuthenticated(false);
        clearStoredAuth();
      } else {
        alert(err instanceof Error ? err.message : '削除に失敗しました');
      }
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const totalPages = Math.ceil(total / limit);

  // 認証状態の確認中
  if (isAuthenticated === null && isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  // 未認証 - ログインフォームを表示
  if (!isAuthenticated) {
    return <LoginForm onLogin={handleLogin} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">管理ダッシュボード</h2>
        <button
          onClick={handleLogout}
          className="px-3 py-1 text-sm text-gray-400 hover:text-white transition-colors"
        >
          ログアウト
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* 統計カード */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="総レコード数" value={stats.totalRecords} />
          <StatCard label="過去24時間" value={stats.recentRecords} />
          <StatCard
            label="7日以内に期限切れ"
            value={stats.expiringRecords}
            variant="warning"
          />
          <StatCard label="ドメイン種別" value={stats.domainStats.length} />
        </div>
      )}

      {/* ドメイン別統計 */}
      {stats && stats.domainStats.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-300 mb-3">
            ドメイン別（上位10件）
          </h3>
          <div className="space-y-2">
            {stats.domainStats.map((stat) => (
              <div
                key={stat.domain}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-gray-400 truncate">{stat.domain}</span>
                <span className="text-white font-medium ml-2">{stat.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 検索フォーム */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="ドメインまたは件名で検索..."
          className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
        >
          検索
        </button>
        {search && (
          <button
            type="button"
            onClick={() => {
              setSearchInput('');
              setSearch('');
              setPage(1);
            }}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
          >
            クリア
          </button>
        )}
      </form>

      {/* レコード一覧 */}
      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-700">
          <h3 className="text-sm font-medium text-gray-300">
            レコード一覧
            {total > 0 && (
              <span className="text-gray-500 ml-2">({total}件)</span>
            )}
          </h3>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
          </div>
        ) : records.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {search ? '検索結果がありません' : 'レコードがありません'}
          </div>
        ) : (
          <div className="divide-y divide-gray-700">
            {records.map((record) => (
              <div
                key={record.id}
                onClick={() => setSelectedRecord(record)}
                className="px-4 py-3 hover:bg-gray-700/50 cursor-pointer transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white truncate">
                      {record.subject_preview || '（件名なし）'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {record.from_domain || '（ドメイン不明）'}
                    </p>
                  </div>
                  <div className="text-right text-xs text-gray-500 whitespace-nowrap">
                    <p>{formatDate(record.stored_at)}</p>
                    <p className="font-mono mt-1">{record.id.slice(0, 8)}...</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ページネーション */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-700 flex items-center justify-between">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              前へ
            </button>
            <span className="text-sm text-gray-400">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              次へ
            </button>
          </div>
        )}
      </div>

      {/* レコード詳細モーダル */}
      {selectedRecord && (
        <RecordDetailModal
          record={selectedRecord}
          onClose={() => setSelectedRecord(null)}
          onDelete={handleDelete}
          formatDate={formatDate}
        />
      )}
    </div>
  );
}

function LoginForm({ onLogin }: { onLogin: (username: string, password: string) => Promise<void> }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      await onLogin(username, password);
    } catch {
      setError('認証に失敗しました。ユーザー名とパスワードを確認してください。');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto">
      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-xl font-bold mb-6 text-center">管理者ログイン</h2>

        {error && (
          <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm text-gray-400 mb-1">
              ユーザー名
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
              className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm text-gray-400 mb-1">
              パスワード
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2 bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  variant = 'default',
}: {
  label: string;
  value: number;
  variant?: 'default' | 'warning';
}) {
  return (
    <div
      className={`p-4 rounded-lg ${
        variant === 'warning' ? 'bg-yellow-900/30' : 'bg-gray-800'
      }`}
    >
      <p className="text-xs text-gray-400">{label}</p>
      <p
        className={`text-2xl font-bold mt-1 ${
          variant === 'warning' ? 'text-yellow-400' : 'text-white'
        }`}
      >
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function RecordDetailModal({
  record,
  onClose,
  onDelete,
  formatDate,
}: {
  record: EmlRecord;
  onClose: () => void;
  onDelete: (id: string) => void;
  formatDate: (dateStr: string) => string;
}) {
  const [parsedEmail, setParsedEmail] = useState<ParsedEmail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showEml, setShowEml] = useState(false);
  const metadata = record.metadata ? JSON.parse(record.metadata) : {};

  const handleLoadEml = async () => {
    if (parsedEmail) {
      setShowEml(!showEml);
      return;
    }

    setIsLoading(true);
    try {
      const blob = await downloadEml(record.id);
      const arrayBuffer = await blob.arrayBuffer();
      const parsed = await parseEML(arrayBuffer);
      setParsedEmail(parsed);
      setShowEml(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'EMLの取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
          <h3 className="font-medium">レコード詳細</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-4">
          <DetailRow label="ID" value={record.id} mono />
          <DetailRow label="SHA-256" value={record.hash_sha256} mono />
          <DetailRow label="送信元ドメイン" value={record.from_domain} />
          <DetailRow label="件名" value={record.subject_preview} />
          <DetailRow label="保存日時" value={formatDate(record.stored_at)} />
          <DetailRow label="有効期限" value={formatDate(record.expires_at)} />

          {Object.keys(metadata).length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-1">メタデータ</p>
              <pre className="text-sm bg-gray-900 p-2 rounded text-gray-300 overflow-auto">
                {JSON.stringify(metadata, null, 2)}
              </pre>
            </div>
          )}

          {/* EML内容表示・ダウンロード */}
          <div className="space-y-2">
            <div className="flex items-center gap-4">
              <button
                onClick={handleLoadEml}
                disabled={isLoading}
                className="text-sm text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50"
              >
                {isLoading
                  ? '読み込み中...'
                  : showEml
                    ? 'EML内容を隠す'
                    : 'EML内容を表示'}
              </button>
              <span className="text-gray-500">|</span>
              <DownloadUrl recordId={record.id} />
            </div>
          </div>

          {/* EML内容（リッチ表示） */}
          {showEml && parsedEmail && (
            <div className="border-t border-gray-700 pt-4 mt-4">
              <EmailViewer email={parsedEmail} />
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-gray-700 flex justify-end gap-2">
          <button
            onClick={() => onDelete(record.id)}
            className="px-4 py-2 text-sm bg-red-600 hover:bg-red-500 rounded-lg transition-colors"
          >
            削除
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p
        className={`text-sm text-gray-200 break-all ${
          mono ? 'font-mono text-xs' : ''
        }`}
      >
        {value || '（なし）'}
      </p>
    </div>
  );
}

function DownloadUrl({ recordId }: { recordId: string }) {
  const [presignedUrl, setPresignedUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerateUrl = async () => {
    setIsLoading(true);
    try {
      const result = await getPresignedUrl(recordId, 60); // 60分有効
      setPresignedUrl(result.url);
      setExpiresAt(result.expiresAt);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'URL生成に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!presignedUrl) return;

    try {
      await navigator.clipboard.writeText(presignedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // フォールバック
      const textArea = document.createElement('textarea');
      textArea.value = presignedUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!presignedUrl) {
    return (
      <button
        onClick={handleGenerateUrl}
        disabled={isLoading}
        className="text-sm text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50"
      >
        {isLoading ? '生成中...' : '共有URLを生成'}
      </button>
    );
  }

  const formatExpiry = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleCopy}
        className="text-sm text-gray-400 hover:text-gray-300 transition-colors flex items-center gap-1"
      >
        {copied ? (
          <>
            <span className="text-green-400">✓</span>
            <span>コピー済み</span>
          </>
        ) : (
          <>
            <span>📋</span>
            <span>URLをコピー</span>
          </>
        )}
      </button>
      {expiresAt && (
        <span className="text-xs text-gray-500">
          ({formatExpiry(expiresAt)}まで有効)
        </span>
      )}
    </div>
  );
}
