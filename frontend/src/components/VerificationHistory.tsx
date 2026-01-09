/**
 * 検証履歴表示コンポーネント
 */

import { useState, useEffect } from 'react';
import {
  getHistory,
  removeFromHistory,
  clearHistory,
  type HistoryEntry,
} from '../utils/historyStorage';

interface VerificationHistoryProps {
  onClose: () => void;
}

export function VerificationHistory({ onClose }: VerificationHistoryProps) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    setHistory(getHistory());
  }, []);

  const handleDelete = (id: string) => {
    removeFromHistory(id);
    setHistory(getHistory());
  };

  const handleClearAll = () => {
    if (confirmClear) {
      clearHistory();
      setHistory([]);
      setConfirmClear(false);
    } else {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
    }
  };

  const getGradeColor = (grade: string) => {
    switch (grade) {
      case 'A': return 'text-green-400 bg-green-900/30';
      case 'B': return 'text-blue-400 bg-blue-900/30';
      case 'C': return 'text-yellow-400 bg-yellow-900/30';
      case 'D': return 'text-orange-400 bg-orange-900/30';
      case 'F': return 'text-red-400 bg-red-900/30';
      default: return 'text-gray-400 bg-gray-900/30';
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString('ja-JP', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">検証履歴</h3>
          <div className="flex items-center gap-2">
            {history.length > 0 && (
              <button
                onClick={handleClearAll}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  confirmClear
                    ? 'bg-red-600 hover:bg-red-500 text-white'
                    : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                }`}
              >
                {confirmClear ? '本当に削除しますか？' : '全て削除'}
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* 履歴リスト */}
        <div className="flex-1 overflow-auto">
          {history.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p>検証履歴はありません</p>
              <p className="text-sm mt-1">EMLファイルを検証すると履歴に追加されます</p>
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((entry) => (
                <div
                  key={entry.id}
                  className="p-3 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    {/* グレードバッジ */}
                    <div className={`flex items-center justify-center w-10 h-10 rounded-full font-bold ${getGradeColor(entry.grade)}`}>
                      {entry.grade}
                    </div>

                    {/* 情報 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white truncate">
                          {entry.subject ?? '(件名なし)'}
                        </span>
                        <span className="text-xs text-gray-500">
                          {entry.score}点
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                        <span>{entry.fromDomain ?? '(不明)'}</span>
                        <span>•</span>
                        <span>{formatDate(entry.verifiedAt)}</span>
                      </div>
                      <div className="mt-1 text-xs font-mono text-gray-500 truncate">
                        {entry.hash.slice(0, 32)}...
                      </div>
                    </div>

                    {/* 削除ボタン */}
                    <button
                      onClick={() => handleDelete(entry.id)}
                      className="text-gray-500 hover:text-red-400 transition-colors"
                      title="削除"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="mt-4 pt-3 border-t border-gray-700 text-xs text-gray-500">
          <p>履歴はこのブラウザにのみ保存されます（最大50件）</p>
        </div>
      </div>
    </div>
  );
}

/**
 * 履歴ボタンコンポーネント
 */
export function HistoryButton() {
  const [showHistory, setShowHistory] = useState(false);
  const [historyCount, setHistoryCount] = useState(0);

  useEffect(() => {
    setHistoryCount(getHistory().length);
  }, []);

  return (
    <>
      <button
        onClick={() => setShowHistory(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors"
        title="検証履歴"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        履歴
        {historyCount > 0 && (
          <span className="px-1.5 py-0.5 bg-blue-600 rounded-full text-xs">
            {historyCount}
          </span>
        )}
      </button>

      {showHistory && (
        <VerificationHistory onClose={() => {
          setShowHistory(false);
          setHistoryCount(getHistory().length);
        }} />
      )}
    </>
  );
}
