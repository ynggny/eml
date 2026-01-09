/**
 * ローカルストレージを使用した検証履歴管理
 */

import type { SecurityScore } from './securityAnalysis';

export interface HistoryEntry {
  id: string;
  hash: string;
  fromDomain: string | null;
  subject: string | null;
  date: string | null;
  score: number;
  grade: SecurityScore['grade'];
  verifiedAt: string;
}

const STORAGE_KEY = 'eml-viewer-history';
const MAX_ENTRIES = 50;

/**
 * 履歴を取得
 */
export function getHistory(): HistoryEntry[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored) as HistoryEntry[];
  } catch {
    return [];
  }
}

/**
 * 履歴に追加
 */
export function addToHistory(entry: Omit<HistoryEntry, 'id' | 'verifiedAt'>): void {
  try {
    const history = getHistory();

    // 同じハッシュのエントリがあれば削除
    const filtered = history.filter(h => h.hash !== entry.hash);

    // 新しいエントリを追加
    const newEntry: HistoryEntry = {
      ...entry,
      id: crypto.randomUUID(),
      verifiedAt: new Date().toISOString(),
    };

    // 先頭に追加
    filtered.unshift(newEntry);

    // 最大件数を超えたら古いものを削除
    const trimmed = filtered.slice(0, MAX_ENTRIES);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // ストレージエラーは無視
  }
}

/**
 * 履歴から削除
 */
export function removeFromHistory(id: string): void {
  try {
    const history = getHistory();
    const filtered = history.filter(h => h.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch {
    // ストレージエラーは無視
  }
}

/**
 * 履歴をクリア
 */
export function clearHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ストレージエラーは無視
  }
}

/**
 * 履歴にあるかチェック
 */
export function isInHistory(hash: string): boolean {
  const history = getHistory();
  return history.some(h => h.hash === hash);
}

/**
 * ハッシュで履歴を検索
 */
export function findInHistory(hash: string): HistoryEntry | undefined {
  const history = getHistory();
  return history.find(h => h.hash === hash);
}
