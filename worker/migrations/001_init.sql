-- EMLレコードテーブル
CREATE TABLE IF NOT EXISTS eml_records (
  id TEXT PRIMARY KEY,
  hash_sha256 TEXT NOT NULL,
  from_domain TEXT,
  subject_preview TEXT,
  stored_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,
  metadata TEXT  -- JSON
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_hash ON eml_records(hash_sha256);
CREATE INDEX IF NOT EXISTS idx_expires ON eml_records(expires_at);
