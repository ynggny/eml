-- Migration number: 0002 	 2026-01-09T20:30:37.301Z
-- インデックス効率化: クエリパターン分析に基づく最適化

-- stored_at インデックス
-- 用途: ORDER BY stored_at、日付範囲検索（過去24時間/7日/30日）
-- 頻度: 高（listRecords, getStats, getDashboardSummaryで毎回使用）
CREATE INDEX IF NOT EXISTS idx_stored_at ON eml_records(stored_at DESC);

-- from_domain インデックス
-- 用途: ドメイン別統計のGROUP BY、ドメインフィルター
-- 頻度: 中（統計取得、フィルター検索で使用）
CREATE INDEX IF NOT EXISTS idx_from_domain ON eml_records(from_domain);

-- 複合インデックス: ドメイン + 保存日時
-- 用途: ドメインでフィルタリングしつつ日付でソートするクエリを最適化
-- クエリ例: WHERE from_domain = ? ORDER BY stored_at DESC
CREATE INDEX IF NOT EXISTS idx_domain_stored ON eml_records(from_domain, stored_at DESC);
