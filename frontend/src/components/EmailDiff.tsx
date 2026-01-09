/**
 * メール比較（Diff）コンポーネント
 * 2つのメールを並べて差分を表示
 */

import { useState } from 'react';
import type { ParsedEmail, Header } from '../utils/emlParser';

interface EmailDiffProps {
  emails: ParsedEmail[];
  selectedIndex: number;
}

type DiffMode = 'side-by-side' | 'unified';
type CompareTarget = 'headers' | 'text' | 'html';

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
}

/**
 * 簡易的なdiffを計算
 */
function computeDiff(textA: string, textB: string): DiffLine[] {
  const linesA = textA.split('\n');
  const linesB = textB.split('\n');
  const result: DiffLine[] = [];

  const setA = new Set(linesA);
  const setB = new Set(linesB);

  // Bにあるがまだ出力していない行を追跡
  const addedFromB = new Set(linesB.filter(l => !setA.has(l)));

  for (const line of linesA) {
    if (setB.has(line)) {
      result.push({ type: 'unchanged', content: line });
    } else {
      result.push({ type: 'removed', content: line });
    }
  }

  // Bにしかない行を追加
  for (const line of linesB) {
    if (addedFromB.has(line)) {
      // 適切な位置を見つけて挿入（簡易実装では末尾に追加）
      result.push({ type: 'added', content: line });
    }
  }

  return result;
}

/**
 * ヘッダーを文字列に変換
 */
function headersToString(headers: Header[]): string {
  return headers.map(h => `${h.key}: ${h.value}`).join('\n');
}

export function EmailDiff({ emails, selectedIndex }: EmailDiffProps) {
  const [showDiff, setShowDiff] = useState(false);
  const [compareIndex, setCompareIndex] = useState<number | null>(null);
  const [diffMode, setDiffMode] = useState<DiffMode>('side-by-side');
  const [compareTarget, setCompareTarget] = useState<CompareTarget>('headers');

  // 比較対象が2つ以上ない場合は表示しない
  if (emails.length < 2) {
    return null;
  }

  const currentEmail = emails[selectedIndex];
  const compareEmail = compareIndex !== null ? emails[compareIndex] : null;

  const getContent = (email: ParsedEmail, target: CompareTarget): string => {
    switch (target) {
      case 'headers':
        return headersToString(email.headers);
      case 'text':
        return email.text ?? '';
      case 'html':
        return email.html ?? '';
    }
  };

  const diff = compareEmail
    ? computeDiff(
        getContent(currentEmail, compareTarget),
        getContent(compareEmail, compareTarget)
      )
    : [];

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    try {
      return new Date(dateStr).toLocaleString('ja-JP', {
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
    <div className="p-4 bg-gray-800 rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-400">
          メール比較
        </h3>
        {!showDiff && (
          <button
            onClick={() => setShowDiff(true)}
            className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 rounded transition-colors"
          >
            比較を開始
          </button>
        )}
      </div>

      {showDiff && (
        <div className="space-y-4">
          {/* 比較対象選択 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">比較元（現在選択中）</label>
              <div className="p-2 bg-gray-700 rounded text-xs">
                <p className="font-medium text-white truncate">
                  {currentEmail.subject ?? '(件名なし)'}
                </p>
                <p className="text-gray-400">
                  {formatDate(currentEmail.date)}
                </p>
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">比較先</label>
              <select
                value={compareIndex ?? ''}
                onChange={(e) => setCompareIndex(e.target.value ? parseInt(e.target.value, 10) : null)}
                className="w-full p-2 bg-gray-700 rounded text-xs text-white border border-gray-600 focus:outline-none focus:border-blue-500"
              >
                <option value="">選択してください</option>
                {emails.map((email, i) => {
                  if (i === selectedIndex) return null;
                  return (
                    <option key={i} value={i}>
                      {email.subject?.slice(0, 30) ?? '(件名なし)'} - {formatDate(email.date)}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {/* 比較対象・モード選択 */}
          {compareIndex !== null && (
            <div className="flex flex-wrap gap-2">
              <div className="flex gap-1">
                <button
                  onClick={() => setCompareTarget('headers')}
                  className={`px-2 py-1 text-xs rounded ${
                    compareTarget === 'headers'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  ヘッダー
                </button>
                <button
                  onClick={() => setCompareTarget('text')}
                  className={`px-2 py-1 text-xs rounded ${
                    compareTarget === 'text'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  テキスト
                </button>
                <button
                  onClick={() => setCompareTarget('html')}
                  className={`px-2 py-1 text-xs rounded ${
                    compareTarget === 'html'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  HTML
                </button>
              </div>

              <div className="flex gap-1 ml-auto">
                <button
                  onClick={() => setDiffMode('side-by-side')}
                  className={`px-2 py-1 text-xs rounded ${
                    diffMode === 'side-by-side'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  並列
                </button>
                <button
                  onClick={() => setDiffMode('unified')}
                  className={`px-2 py-1 text-xs rounded ${
                    diffMode === 'unified'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  統合
                </button>
              </div>
            </div>
          )}

          {/* Diff表示 */}
          {compareIndex !== null && compareEmail && (
            <div className="border border-gray-700 rounded overflow-hidden">
              {diffMode === 'side-by-side' ? (
                <div className="grid grid-cols-2 divide-x divide-gray-700">
                  <div className="p-2 max-h-96 overflow-auto">
                    <p className="text-xs text-gray-500 mb-2 sticky top-0 bg-gray-800 py-1">
                      比較元
                    </p>
                    <pre className="text-xs font-mono whitespace-pre-wrap text-gray-300">
                      {getContent(currentEmail, compareTarget)}
                    </pre>
                  </div>
                  <div className="p-2 max-h-96 overflow-auto">
                    <p className="text-xs text-gray-500 mb-2 sticky top-0 bg-gray-800 py-1">
                      比較先
                    </p>
                    <pre className="text-xs font-mono whitespace-pre-wrap text-gray-300">
                      {getContent(compareEmail, compareTarget)}
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="p-2 max-h-96 overflow-auto">
                  <div className="flex gap-4 text-xs text-gray-500 mb-2">
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 bg-red-900/50 rounded" /> 削除
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 bg-green-900/50 rounded" /> 追加
                    </span>
                  </div>
                  <div className="font-mono text-xs">
                    {diff.map((line, i) => (
                      <div
                        key={i}
                        className={`px-2 py-0.5 ${
                          line.type === 'added'
                            ? 'bg-green-900/30 text-green-300'
                            : line.type === 'removed'
                            ? 'bg-red-900/30 text-red-300'
                            : 'text-gray-400'
                        }`}
                      >
                        <span className="mr-2 text-gray-600">
                          {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                        </span>
                        {line.content || '\u00A0'}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 閉じるボタン */}
          <button
            onClick={() => {
              setShowDiff(false);
              setCompareIndex(null);
            }}
            className="w-full py-2 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors"
          >
            比較を終了
          </button>
        </div>
      )}

      {!showDiff && (
        <p className="text-xs text-gray-500">
          複数のメールを読み込んで、内容の差分を確認できます
        </p>
      )}
    </div>
  );
}
