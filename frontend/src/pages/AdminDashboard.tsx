import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  getStats,
  getRecords,
  deleteRecord,
  downloadEml,
  getPresignedUrl,
  getStoredAuth,
  setStoredAuth,
  clearStoredAuth,
  getUniqueDomains,
  bulkDeleteRecords,
  exportRecords,
  searchByHash,
  verifyIntegrity,
  ApiError,
  type StatsResponse,
  type EmlRecord,
  type AdvancedSearchOptions,
  type IntegrityCheckResult,
} from '../utils/api';
import { parseEML, type ParsedEmail } from '../utils/emlParser';
import { EmailViewer } from '../components/EmailViewer';

// ============================================================================
// メインコンポーネント
// ============================================================================

export function AdminDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [records, setRecords] = useState<EmlRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<EmlRecord | null>(null);
  const [domains, setDomains] = useState<string[]>([]);

  // 選択状態
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 検索・フィルター状態
  const [searchOptions, setSearchOptions] = useState<AdvancedSearchOptions>({
    page: 1,
    limit: 20,
  });

  // UI状態
  const [showFilters, setShowFilters] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'records' | 'search'>('overview');

  const limit = 20;

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [statsData, recordsData, domainsData] = await Promise.all([
        getStats(),
        getRecords(searchOptions),
        getUniqueDomains(),
      ]);

      setStats(statsData);
      setRecords(recordsData.records);
      setTotal(recordsData.total);
      setDomains(domainsData);
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
  }, [searchOptions]);

  useEffect(() => {
    if (getStoredAuth()) {
      fetchData();
    } else {
      setIsAuthenticated(false);
      setIsLoading(false);
    }
  }, [fetchData]);

  // キーボードショートカット
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escでモーダルを閉じる
      if (e.key === 'Escape' && selectedRecord) {
        setSelectedRecord(null);
      }
      // Ctrl+F でフィルター表示
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        setShowFilters(prev => !prev);
      }
      // Ctrl+E でエクスポート
      if (e.ctrlKey && e.key === 'e' && selectedIds.size > 0) {
        e.preventDefault();
        handleExport();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedRecord, selectedIds]);

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

  const handleSearch = (newOptions: Partial<AdvancedSearchOptions>) => {
    setSearchOptions(prev => ({ ...prev, ...newOptions, page: 1 }));
    setSelectedIds(new Set());
  };

  const handlePageChange = (newPage: number) => {
    setSearchOptions(prev => ({ ...prev, page: newPage }));
  };

  const handleDelete = async (id: string) => {
    if (!confirm('このレコードを削除しますか？この操作は取り消せません。')) {
      return;
    }

    try {
      await deleteRecord(id);
      setSelectedRecord(null);
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
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

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;

    if (!confirm(`${selectedIds.size}件のレコードを削除しますか？この操作は取り消せません。`)) {
      return;
    }

    try {
      const result = await bulkDeleteRecords(Array.from(selectedIds));
      alert(`${result.success}件を削除しました${result.failed > 0 ? `（${result.failed}件失敗）` : ''}`);
      setSelectedIds(new Set());
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : '一括削除に失敗しました');
    }
  };

  const handleExport = async () => {
    try {
      const data = await exportRecords({
        search: searchOptions.search,
        dateFrom: searchOptions.dateFrom,
        dateTo: searchOptions.dateTo,
        domain: searchOptions.domain,
      });

      // CSV形式でダウンロード
      const csv = convertToCSV(data.records);
      downloadFile(csv, `eml-export-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'エクスポートに失敗しました');
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.size === records.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(records.map(r => r.id)));
    }
  };

  const handleSelectRecord = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const totalPages = Math.ceil(total / limit);

  // 認証状態の確認中
  if (isAuthenticated === null && isLoading) {
    return <LoadingSpinner />;
  }

  // 未認証 - ログインフォームを表示
  if (!isAuthenticated) {
    return <LoginForm onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-gray-950">
      {/* ヘッダー */}
      <header className="sticky top-0 z-40 bg-gray-900/95 backdrop-blur border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-lg font-bold text-white flex items-center gap-2">
                <ShieldIcon className="w-5 h-5 text-blue-400" />
                証跡管理ダッシュボード
              </h1>
              {/* タブ切り替え */}
              <nav className="hidden md:flex items-center gap-1 ml-4">
                <TabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>
                  概要
                </TabButton>
                <TabButton active={activeTab === 'records'} onClick={() => setActiveTab('records')}>
                  レコード
                </TabButton>
                <TabButton active={activeTab === 'search'} onClick={() => setActiveTab('search')}>
                  検索
                </TabButton>
              </nav>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="hidden md:inline-block px-2 py-1 text-xs text-gray-500 bg-gray-800 rounded">
                Ctrl+F フィルター
              </kbd>
              <button
                onClick={handleLogout}
                className="px-3 py-1.5 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
              >
                ログアウト
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {error && (
          <div className="p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm flex items-center gap-2">
            <AlertIcon className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* 概要タブ */}
        {activeTab === 'overview' && stats && (
          <>
            {/* 統計カード */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="総レコード数"
                value={stats.totalRecords}
                icon={<DatabaseIcon className="w-5 h-5" />}
                color="blue"
              />
              <StatCard
                label="過去24時間"
                value={stats.recentRecords}
                icon={<ClockIcon className="w-5 h-5" />}
                color="green"
              />
              <StatCard
                label="7日以内に期限切れ"
                value={stats.expiringRecords}
                icon={<AlertIcon className="w-5 h-5" />}
                color="yellow"
                highlight={stats.expiringRecords > 0}
              />
              <StatCard
                label="ドメイン種別"
                value={stats.domainStats.length}
                icon={<GlobeIcon className="w-5 h-5" />}
                color="purple"
              />
            </div>

            {/* チャートエリア */}
            <div className="grid lg:grid-cols-2 gap-6">
              {/* 時系列チャート */}
              <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
                <h3 className="text-sm font-medium text-gray-300 mb-4 flex items-center gap-2">
                  <TrendIcon className="w-4 h-4 text-blue-400" />
                  過去30日間の推移
                </h3>
                <TimelineChart data={stats.timelineData} />
              </div>

              {/* 時間帯分布 */}
              <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
                <h3 className="text-sm font-medium text-gray-300 mb-4 flex items-center gap-2">
                  <ClockIcon className="w-4 h-4 text-green-400" />
                  時間帯別分布
                </h3>
                <HourlyHeatmap data={stats.hourlyDistribution} />
              </div>
            </div>

            {/* ドメイン統計 */}
            {stats.domainStats.length > 0 && (
              <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
                <h3 className="text-sm font-medium text-gray-300 mb-4 flex items-center gap-2">
                  <GlobeIcon className="w-4 h-4 text-purple-400" />
                  ドメイン別（上位10件）
                </h3>
                <DomainBarChart data={stats.domainStats} />
              </div>
            )}
          </>
        )}

        {/* レコードタブ / 検索タブ */}
        {(activeTab === 'records' || activeTab === 'search') && (
          <>
            {/* ハッシュ検索（検索タブのみ） */}
            {activeTab === 'search' && (
              <HashSearchPanel onRecordFound={(record) => setSelectedRecord(record)} />
            )}

            {/* フィルターパネル */}
            <FilterPanel
              show={showFilters || activeTab === 'search'}
              options={searchOptions}
              domains={domains}
              onSearch={handleSearch}
              onToggle={() => setShowFilters(prev => !prev)}
            />

            {/* ツールバー */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowFilters(prev => !prev)}
                  className={`px-3 py-2 text-sm rounded-lg border transition-colors flex items-center gap-2 ${
                    showFilters
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  <FilterIcon className="w-4 h-4" />
                  フィルター
                </button>

                {selectedIds.size > 0 && (
                  <>
                    <span className="text-sm text-gray-400">
                      {selectedIds.size}件選択中
                    </span>
                    <button
                      onClick={handleBulkDelete}
                      className="px-3 py-2 text-sm bg-red-600 hover:bg-red-500 rounded-lg transition-colors"
                    >
                      一括削除
                    </button>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleExport}
                  className="px-3 py-2 text-sm bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors flex items-center gap-2"
                >
                  <DownloadIcon className="w-4 h-4" />
                  CSV出力
                </button>
              </div>
            </div>

            {/* レコード一覧 */}
            <RecordTable
              records={records}
              total={total}
              page={searchOptions.page ?? 1}
              totalPages={totalPages}
              isLoading={isLoading}
              selectedIds={selectedIds}
              onSelectAll={handleSelectAll}
              onSelectRecord={handleSelectRecord}
              onRecordClick={(record) => setSelectedRecord(record)}
              onPageChange={handlePageChange}
            />
          </>
        )}
      </main>

      {/* レコード詳細モーダル */}
      {selectedRecord && (
        <RecordDetailModal
          record={selectedRecord}
          onClose={() => setSelectedRecord(null)}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}

// ============================================================================
// サブコンポーネント
// ============================================================================

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="relative">
        <div className="w-12 h-12 border-4 border-gray-700 rounded-full" />
        <div className="absolute top-0 left-0 w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
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
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600/20 rounded-2xl mb-4">
            <ShieldIcon className="w-8 h-8 text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">証跡管理システム</h1>
          <p className="text-gray-500 mt-2">管理者としてログインしてください</p>
        </div>

        <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
          {error && (
            <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm text-gray-400 mb-1.5">
                ユーザー名
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm text-gray-400 mb-1.5">
                パスワード
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ログイン中...
                </>
              ) : (
                'ログイン'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
        active
          ? 'bg-blue-600 text-white'
          : 'text-gray-400 hover:text-white hover:bg-gray-800'
      }`}
    >
      {children}
    </button>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
  highlight = false,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: 'blue' | 'green' | 'yellow' | 'purple';
  highlight?: boolean;
}) {
  const colorClasses = {
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    green: 'bg-green-500/10 text-green-400 border-green-500/20',
    yellow: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  };

  return (
    <div
      className={`p-4 rounded-xl border transition-all ${
        highlight
          ? 'bg-yellow-900/20 border-yellow-500/30 animate-pulse'
          : 'bg-gray-900 border-gray-800 hover:border-gray-700'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500 uppercase tracking-wide">{label}</span>
        <div className={`p-1.5 rounded-lg ${colorClasses[color]}`}>
          {icon}
        </div>
      </div>
      <AnimatedCounter value={value} />
    </div>
  );
}

function AnimatedCounter({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(0);
  const prevValue = useRef(0);

  useEffect(() => {
    const start = prevValue.current;
    const end = value;
    const duration = 500;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      const current = Math.round(start + (end - start) * eased);
      setDisplayValue(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
    prevValue.current = value;
  }, [value]);

  return (
    <p className="text-2xl font-bold text-white tabular-nums">
      {displayValue.toLocaleString()}
    </p>
  );
}

function TimelineChart({ data }: { data: { date: string; count: number }[] }) {
  if (data.length === 0) {
    return (
      <div className="h-32 flex items-center justify-center text-gray-500 text-sm">
        データがありません
      </div>
    );
  }

  const maxCount = Math.max(...data.map(d => d.count), 1);
  const width = 100;
  const height = 40;
  const padding = 2;

  // パスを生成
  const points = data.map((d, i) => {
    const x = padding + (i / (data.length - 1 || 1)) * (width - 2 * padding);
    const y = height - padding - (d.count / maxCount) * (height - 2 * padding);
    return `${x},${y}`;
  });

  const linePath = `M ${points.join(' L ')}`;
  const areaPath = `${linePath} L ${width - padding},${height - padding} L ${padding},${height - padding} Z`;

  return (
    <div className="h-32">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(59, 130, 246)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="rgb(59, 130, 246)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#areaGradient)" />
        <path d={linePath} fill="none" stroke="rgb(59, 130, 246)" strokeWidth="0.5" />
      </svg>
      <div className="flex justify-between text-xs text-gray-500 mt-2">
        <span>{data[0]?.date.slice(5) ?? ''}</span>
        <span>最大: {maxCount}</span>
        <span>{data[data.length - 1]?.date.slice(5) ?? ''}</span>
      </div>
    </div>
  );
}

function HourlyHeatmap({ data }: { data: number[] }) {
  const maxCount = Math.max(...data, 1);

  return (
    <div>
      <div className="grid grid-cols-12 gap-1">
        {data.map((count, hour) => {
          const intensity = count / maxCount;
          return (
            <div
              key={hour}
              className="aspect-square rounded group relative"
              style={{
                backgroundColor: `rgba(34, 197, 94, ${0.1 + intensity * 0.7})`,
              }}
              title={`${hour}時: ${count}件`}
            >
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-gray-800 text-xs text-white rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                {hour}時: {count}件
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-xs text-gray-500 mt-2">
        <span>0時</span>
        <span>12時</span>
        <span>23時</span>
      </div>
    </div>
  );
}

function DomainBarChart({ data }: { data: { domain: string; count: number }[] }) {
  const maxCount = Math.max(...data.map(d => d.count), 1);

  return (
    <div className="space-y-2">
      {data.map((item) => (
        <div key={item.domain} className="group">
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-gray-400 truncate flex-1 mr-2" title={item.domain}>
              {item.domain}
            </span>
            <span className="text-white font-medium tabular-nums">{item.count}</span>
          </div>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-600 to-purple-400 rounded-full transition-all duration-500"
              style={{ width: `${(item.count / maxCount) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function HashSearchPanel({ onRecordFound }: { onRecordFound: (record: EmlRecord) => void }) {
  const [hash, setHash] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [result, setResult] = useState<{ found: boolean; record: EmlRecord | null } | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hash.trim()) return;

    setIsSearching(true);
    setResult(null);

    try {
      const searchResult = await searchByHash(hash.trim());
      setResult(searchResult);
      if (searchResult.found && searchResult.record) {
        // 自動でモーダルを開く
        onRecordFound(searchResult.record);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '検索に失敗しました');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
      <h3 className="text-sm font-medium text-gray-300 mb-4 flex items-center gap-2">
        <SearchIcon className="w-4 h-4 text-blue-400" />
        ハッシュで証跡を検索
      </h3>
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={hash}
          onChange={(e) => setHash(e.target.value)}
          placeholder="SHA-256ハッシュ値を入力..."
          className="flex-1 px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm font-mono placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
        <button
          type="submit"
          disabled={isSearching || !hash.trim()}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
        >
          {isSearching ? '検索中...' : '検索'}
        </button>
      </form>
      {result && !result.found && (
        <p className="mt-3 text-sm text-yellow-400">該当する証跡が見つかりませんでした</p>
      )}
      {result && result.found && (
        <p className="mt-3 text-sm text-green-400">証跡が見つかりました</p>
      )}
    </div>
  );
}

function FilterPanel({
  show,
  options,
  domains,
  onSearch,
  onToggle,
}: {
  show: boolean;
  options: AdvancedSearchOptions;
  domains: string[];
  onSearch: (options: Partial<AdvancedSearchOptions>) => void;
  onToggle: () => void;
}) {
  const [localOptions, setLocalOptions] = useState({
    search: options.search ?? '',
    dateFrom: options.dateFrom ?? '',
    dateTo: options.dateTo ?? '',
    domain: options.domain ?? '',
    hashPrefix: options.hashPrefix ?? '',
    sortBy: options.sortBy ?? 'stored_at',
    sortOrder: options.sortOrder ?? 'desc',
  });

  const handleApply = () => {
    onSearch({
      search: localOptions.search || undefined,
      dateFrom: localOptions.dateFrom || undefined,
      dateTo: localOptions.dateTo || undefined,
      domain: localOptions.domain || undefined,
      hashPrefix: localOptions.hashPrefix || undefined,
      sortBy: localOptions.sortBy as AdvancedSearchOptions['sortBy'],
      sortOrder: localOptions.sortOrder as AdvancedSearchOptions['sortOrder'],
    });
  };

  const handleClear = () => {
    setLocalOptions({
      search: '',
      dateFrom: '',
      dateTo: '',
      domain: '',
      hashPrefix: '',
      sortBy: 'stored_at',
      sortOrder: 'desc',
    });
    onSearch({
      search: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      domain: undefined,
      hashPrefix: undefined,
      sortBy: 'stored_at',
      sortOrder: 'desc',
    });
  };

  if (!show) return null;

  return (
    <div className="bg-gray-900 rounded-xl p-5 border border-gray-800 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-300 flex items-center gap-2">
          <FilterIcon className="w-4 h-4 text-blue-400" />
          詳細フィルター
        </h3>
        <button
          onClick={onToggle}
          className="text-gray-500 hover:text-gray-300 transition-colors"
        >
          <CloseIcon className="w-4 h-4" />
        </button>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* キーワード検索 */}
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">キーワード</label>
          <input
            type="text"
            value={localOptions.search}
            onChange={(e) => setLocalOptions(prev => ({ ...prev, search: e.target.value }))}
            placeholder="ドメイン、件名、ID..."
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* 日付範囲 */}
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">開始日</label>
          <input
            type="date"
            value={localOptions.dateFrom}
            onChange={(e) => setLocalOptions(prev => ({ ...prev, dateFrom: e.target.value }))}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">終了日</label>
          <input
            type="date"
            value={localOptions.dateTo}
            onChange={(e) => setLocalOptions(prev => ({ ...prev, dateTo: e.target.value }))}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* ドメイン */}
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">ドメイン</label>
          <select
            value={localOptions.domain}
            onChange={(e) => setLocalOptions(prev => ({ ...prev, domain: e.target.value }))}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
          >
            <option value="">すべて</option>
            {domains.map(domain => (
              <option key={domain} value={domain}>{domain}</option>
            ))}
          </select>
        </div>

        {/* ハッシュ前方一致 */}
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">ハッシュ（前方一致）</label>
          <input
            type="text"
            value={localOptions.hashPrefix}
            onChange={(e) => setLocalOptions(prev => ({ ...prev, hashPrefix: e.target.value }))}
            placeholder="abc123..."
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white font-mono placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* ソート */}
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">並び順</label>
          <div className="flex gap-2">
            <select
              value={localOptions.sortBy}
              onChange={(e) => setLocalOptions(prev => ({ ...prev, sortBy: e.target.value as 'stored_at' | 'from_domain' | 'subject_preview' }))}
              className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
            >
              <option value="stored_at">保存日時</option>
              <option value="from_domain">ドメイン</option>
              <option value="subject_preview">件名</option>
            </select>
            <select
              value={localOptions.sortOrder}
              onChange={(e) => setLocalOptions(prev => ({ ...prev, sortOrder: e.target.value as 'asc' | 'desc' }))}
              className="w-20 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
            >
              <option value="desc">降順</option>
              <option value="asc">昇順</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={handleClear}
          className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
        >
          クリア
        </button>
        <button
          onClick={handleApply}
          className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
        >
          適用
        </button>
      </div>
    </div>
  );
}

function RecordTable({
  records,
  total,
  page,
  totalPages,
  isLoading,
  selectedIds,
  onSelectAll,
  onSelectRecord,
  onRecordClick,
  onPageChange,
}: {
  records: EmlRecord[];
  total: number;
  page: number;
  totalPages: number;
  isLoading: boolean;
  selectedIds: Set<string>;
  onSelectAll: () => void;
  onSelectRecord: (id: string) => void;
  onRecordClick: (record: EmlRecord) => void;
  onPageChange: (page: number) => void;
}) {
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      {/* テーブルヘッダー */}
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={records.length > 0 && selectedIds.size === records.length}
            onChange={onSelectAll}
            className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-300">
            レコード一覧
            {total > 0 && <span className="text-gray-500 ml-1">({total}件)</span>}
          </span>
        </div>
      </div>

      {/* テーブル本体 */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-2 border-gray-700 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : records.length === 0 ? (
        <div className="p-12 text-center text-gray-500">
          <DatabaseIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>レコードがありません</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-800">
          {records.map((record) => (
            <div
              key={record.id}
              className={`px-4 py-3 hover:bg-gray-800/50 transition-colors flex items-center gap-3 ${
                selectedIds.has(record.id) ? 'bg-blue-900/20' : ''
              }`}
            >
              <input
                type="checkbox"
                checked={selectedIds.has(record.id)}
                onChange={(e) => {
                  e.stopPropagation();
                  onSelectRecord(record.id);
                }}
                className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-600 focus:ring-blue-500"
              />
              <div
                className="flex-1 cursor-pointer min-w-0"
                onClick={() => onRecordClick(record)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white truncate">
                      {record.subject_preview || '（件名なし）'}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
                      <span className="truncate">{record.from_domain || '（ドメイン不明）'}</span>
                      <span className="text-gray-700">|</span>
                      <span className="font-mono text-gray-600">{record.hash_sha256.slice(0, 12)}...</span>
                    </p>
                  </div>
                  <div className="text-right text-xs text-gray-500 whitespace-nowrap">
                    <p>{formatDate(record.stored_at)}</p>
                    <p className="text-gray-600 mt-0.5">{record.id.slice(0, 8)}...</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ページネーション */}
      {totalPages > 1 && (
        <div className="px-4 py-3 border-t border-gray-800 flex items-center justify-between">
          <button
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
          >
            <ChevronLeftIcon className="w-4 h-4" />
            前へ
          </button>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">
              {page} / {totalPages}
            </span>
          </div>
          <button
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
          >
            次へ
            <ChevronRightIcon className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function RecordDetailModal({
  record,
  onClose,
  onDelete,
}: {
  record: EmlRecord;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  const [parsedEmail, setParsedEmail] = useState<ParsedEmail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showEml, setShowEml] = useState(false);
  const [integrityResult, setIntegrityResult] = useState<IntegrityCheckResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const metadata = useMemo(() => {
    try {
      return record.metadata ? JSON.parse(record.metadata) : {};
    } catch {
      return {};
    }
  }, [record.metadata]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

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

  const handleVerifyIntegrity = async () => {
    setIsVerifying(true);
    try {
      const result = await verifyIntegrity(record.id);
      setIntegrityResult(result);
    } catch (err) {
      alert(err instanceof Error ? err.message : '整合性検証に失敗しました');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-auto border border-gray-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="sticky top-0 bg-gray-900 px-6 py-4 border-b border-gray-800 flex items-center justify-between">
          <h3 className="font-medium flex items-center gap-2">
            <FileIcon className="w-5 h-5 text-blue-400" />
            証跡詳細
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* 整合性検証 */}
          <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-gray-300 flex items-center gap-2">
                <ShieldIcon className="w-4 h-4 text-green-400" />
                偽造検知・整合性検証
              </h4>
              <button
                onClick={handleVerifyIntegrity}
                disabled={isVerifying}
                className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-500 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1"
              >
                {isVerifying ? (
                  <>
                    <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    検証中...
                  </>
                ) : (
                  <>
                    <CheckIcon className="w-4 h-4" />
                    検証する
                  </>
                )}
              </button>
            </div>

            {integrityResult && (
              <div className={`p-3 rounded-lg ${
                integrityResult.isValid
                  ? 'bg-green-900/30 border border-green-700'
                  : 'bg-red-900/30 border border-red-700'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  {integrityResult.isValid ? (
                    <>
                      <CheckCircleIcon className="w-5 h-5 text-green-400" />
                      <span className="font-medium text-green-400">整合性が確認されました</span>
                    </>
                  ) : (
                    <>
                      <AlertIcon className="w-5 h-5 text-red-400" />
                      <span className="font-medium text-red-400">改ざんの可能性があります</span>
                    </>
                  )}
                </div>
                <div className="text-xs text-gray-400 space-y-1">
                  <p>保存時ハッシュ: <span className="font-mono text-gray-300">{integrityResult.storedHash.slice(0, 32)}...</span></p>
                  <p>現在のハッシュ: <span className="font-mono text-gray-300">{integrityResult.calculatedHash.slice(0, 32) || '（ファイルなし）'}...</span></p>
                  <p>検証日時: {formatDate(integrityResult.checkedAt)}</p>
                </div>
              </div>
            )}

            {!integrityResult && (
              <p className="text-sm text-gray-500">
                「検証する」をクリックして、保存されたハッシュ値とファイルの整合性を確認できます。
              </p>
            )}
          </div>

          {/* 基本情報 */}
          <div className="grid md:grid-cols-2 gap-4">
            <DetailField label="レコードID" value={record.id} mono />
            <DetailField label="SHA-256ハッシュ" value={record.hash_sha256} mono copyable />
            <DetailField label="送信元ドメイン" value={record.from_domain} />
            <DetailField label="件名" value={record.subject_preview} />
            <DetailField label="保存日時" value={formatDate(record.stored_at)} />
            <DetailField label="有効期限" value={formatDate(record.expires_at)} />
          </div>

          {/* メタデータ */}
          {Object.keys(metadata).length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-400 mb-2">メタデータ</h4>
              <pre className="text-xs bg-gray-800 p-4 rounded-lg text-gray-300 overflow-auto font-mono">
                {JSON.stringify(metadata, null, 2)}
              </pre>
            </div>
          )}

          {/* EML内容表示・ダウンロード */}
          <div className="flex items-center gap-4 flex-wrap">
            <button
              onClick={handleLoadEml}
              disabled={isLoading}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              <FileIcon className="w-4 h-4" />
              {isLoading ? '読み込み中...' : showEml ? 'EMLを隠す' : 'EMLを表示'}
            </button>
            <PresignedUrlButton recordId={record.id} />
          </div>

          {/* EML内容 */}
          {showEml && parsedEmail && (
            <div className="border-t border-gray-800 pt-6">
              <EmailViewer email={parsedEmail} />
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="sticky bottom-0 bg-gray-900 px-6 py-4 border-t border-gray-800 flex justify-between gap-4">
          <button
            onClick={() => onDelete(record.id)}
            className="px-4 py-2 text-sm bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg transition-colors flex items-center gap-2"
          >
            <TrashIcon className="w-4 h-4" />
            削除
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailField({
  label,
  value,
  mono = false,
  copyable = false,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
  copyable?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // フォールバック
      const textArea = document.createElement('textarea');
      textArea.value = value;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <div className="flex items-center gap-2">
        <p
          className={`text-sm text-gray-200 break-all flex-1 ${
            mono ? 'font-mono text-xs bg-gray-800 px-2 py-1 rounded' : ''
          }`}
        >
          {value || '（なし）'}
        </p>
        {copyable && value && (
          <button
            onClick={handleCopy}
            className="p-1 text-gray-500 hover:text-gray-300 transition-colors flex-shrink-0"
            title="コピー"
          >
            {copied ? <CheckIcon className="w-4 h-4 text-green-400" /> : <CopyIcon className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  );
}

function PresignedUrlButton({ recordId }: { recordId: string }) {
  const [presignedUrl, setPresignedUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerateUrl = async () => {
    setIsLoading(true);
    try {
      const result = await getPresignedUrl(recordId, 60);
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
        className="px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
      >
        <LinkIcon className="w-4 h-4" />
        {isLoading ? '生成中...' : '共有URLを生成'}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleCopy}
        className="px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors flex items-center gap-2"
      >
        {copied ? (
          <>
            <CheckIcon className="w-4 h-4 text-green-400" />
            コピー済み
          </>
        ) : (
          <>
            <CopyIcon className="w-4 h-4" />
            URLをコピー
          </>
        )}
      </button>
      {expiresAt && (
        <span className="text-xs text-gray-500">
          {new Date(expiresAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}まで有効
        </span>
      )}
    </div>
  );
}

// ============================================================================
// ユーティリティ関数
// ============================================================================

function convertToCSV(records: EmlRecord[]): string {
  const headers = ['ID', 'SHA-256', 'ドメイン', '件名', '保存日時', '有効期限'];
  const rows = records.map(r => [
    r.id,
    r.hash_sha256,
    r.from_domain ?? '',
    r.subject_preview ?? '',
    r.stored_at,
    r.expires_at,
  ]);

  const escape = (str: string) => `"${str.replace(/"/g, '""')}"`;
  const csvRows = [
    headers.join(','),
    ...rows.map(row => row.map(escape).join(',')),
  ];

  return csvRows.join('\n');
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================================================
// アイコンコンポーネント
// ============================================================================

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

function DatabaseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function TrendIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  );
}

function FilterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

function LinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}
