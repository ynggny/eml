import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  listRecords,
  getRecord,
  getStats,
  getUniqueDomains,
  findByHash,
  getDashboardSummary,
  escapeLikePattern,
} from './admin';

/**
 * better-sqlite3をD1互換のインターフェースにラップ
 * 実際のSQLiteクエリを実行してテストする
 */
function createD1Adapter(db: Database.Database): D1Database {
  return {
    prepare(sql: string) {
      const stmt = db.prepare(sql);
      let boundParams: unknown[] = [];

      return {
        bind(...params: unknown[]) {
          boundParams = params;
          return this;
        },
        async first<T>(): Promise<T | null> {
          try {
            const result = stmt.get(...boundParams) as T | undefined;
            return result ?? null;
          } catch (error) {
            throw new Error(`SQL Error: ${(error as Error).message}\nQuery: ${sql}\nParams: ${JSON.stringify(boundParams)}`);
          }
        },
        async all<T>(): Promise<{ results: T[] }> {
          try {
            const results = stmt.all(...boundParams) as T[];
            return { results };
          } catch (error) {
            throw new Error(`SQL Error: ${(error as Error).message}\nQuery: ${sql}\nParams: ${JSON.stringify(boundParams)}`);
          }
        },
        async run(): Promise<{ meta: { changes: number } }> {
          try {
            const result = stmt.run(...boundParams);
            return { meta: { changes: result.changes } };
          } catch (error) {
            throw new Error(`SQL Error: ${(error as Error).message}\nQuery: ${sql}\nParams: ${JSON.stringify(boundParams)}`);
          }
        },
      } as D1PreparedStatement;
    },
    async batch() { return []; },
    async dump() { return new ArrayBuffer(0); },
    async exec() { return { count: 0, duration: 0 }; },
  } as D1Database;
}

function createTestEnv(db: Database.Database) {
  return {
    DB: createD1Adapter(db),
    BUCKET: {} as R2Bucket,
  };
}

/**
 * テストデータを挿入
 */
function insertTestRecords(db: Database.Database, records: Array<{
  id: string;
  hash_sha256: string;
  from_domain?: string;
  subject_preview?: string;
  stored_at?: string;
  expires_at?: string;
  metadata?: string;
}>) {
  const stmt = db.prepare(`
    INSERT INTO eml_records (id, hash_sha256, from_domain, subject_preview, stored_at, expires_at, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const record of records) {
    stmt.run(
      record.id,
      record.hash_sha256,
      record.from_domain ?? null,
      record.subject_preview ?? null,
      record.stored_at ?? new Date().toISOString(),
      record.expires_at ?? null,
      record.metadata ?? null
    );
  }
}

describe('admin - 実際のSQLiteを使用したテスト', () => {
  let db: Database.Database;

  beforeEach(() => {
    // インメモリSQLiteデータベースを作成
    db = new Database(':memory:');

    // スキーマを作成
    db.exec(`
      CREATE TABLE IF NOT EXISTS eml_records (
        id TEXT PRIMARY KEY,
        hash_sha256 TEXT NOT NULL,
        from_domain TEXT,
        subject_preview TEXT,
        stored_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        metadata TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_hash ON eml_records(hash_sha256);
      CREATE INDEX IF NOT EXISTS idx_expires ON eml_records(expires_at);
    `);
  });

  afterEach(() => {
    db.close();
  });

  describe('escapeLikePattern', () => {
    it('%をエスケープする', () => {
      expect(escapeLikePattern('100%')).toBe('100\\%');
    });

    it('_をエスケープする', () => {
      expect(escapeLikePattern('test_value')).toBe('test\\_value');
    });

    it('バックスラッシュをエスケープする', () => {
      expect(escapeLikePattern('path\\file')).toBe('path\\\\file');
    });

    it('複合パターンをエスケープする', () => {
      expect(escapeLikePattern('100%_test\\path')).toBe('100\\%\\_test\\\\path');
    });

    it('通常の文字列はそのまま', () => {
      expect(escapeLikePattern('hello world')).toBe('hello world');
    });
  });

  describe('listRecords - 検索機能', () => {
    beforeEach(() => {
      insertTestRecords(db, [
        { id: 'rec-001', hash_sha256: 'abc123def456', from_domain: 'example.com', subject_preview: 'Hello World' },
        { id: 'rec-002', hash_sha256: 'def456ghi789', from_domain: 'test.org', subject_preview: '100% complete' },
        { id: 'rec-003', hash_sha256: 'ghi789jkl012', from_domain: 'example.com', subject_preview: 'test_file.txt' },
        { id: 'rec-004', hash_sha256: 'jkl012mno345', from_domain: 'demo.net', subject_preview: 'path\\to\\file' },
        { id: 'rec-005', hash_sha256: 'mno345pqr678', from_domain: 'example.com', subject_preview: 'Normal subject' },
      ]);
    });

    it('通常の検索が正しく動作する', async () => {
      const env = createTestEnv(db);
      const result = await listRecords(env, { search: 'Hello' });

      expect(result.total).toBe(1);
      expect(result.records[0].id).toBe('rec-001');
    });

    it('%を含む検索でリテラル%にマッチする', async () => {
      const env = createTestEnv(db);
      const result = await listRecords(env, { search: '100%' });

      // "100%"をリテラルとして検索し、"100% complete"にのみマッチする
      expect(result.total).toBe(1);
      expect(result.records[0].id).toBe('rec-002');
    });

    it('_を含む検索でリテラル_にマッチする', async () => {
      const env = createTestEnv(db);
      const result = await listRecords(env, { search: 'test_' });

      // "test_"をリテラルとして検索
      expect(result.total).toBe(1);
      expect(result.records[0].id).toBe('rec-003');
    });

    it('バックスラッシュを含む検索が正しく動作する', async () => {
      const env = createTestEnv(db);
      const result = await listRecords(env, { search: 'path\\to' });

      expect(result.total).toBe(1);
      expect(result.records[0].id).toBe('rec-004');
    });

    it('複雑なパターン（多数の%）でエラーにならない', async () => {
      const env = createTestEnv(db);

      // 複雑なパターンでも「LIKE or GLOB pattern too complex」エラーが発生しない
      const result = await listRecords(env, { search: '%%test%%value%%' });

      // エラーなく実行できることを確認
      expect(result).toBeDefined();
      expect(result.records).toBeDefined();
    });

    it('ドメインで検索できる', async () => {
      const env = createTestEnv(db);
      const result = await listRecords(env, { search: 'example.com' });

      expect(result.total).toBe(3);
    });

    it('ハッシュで検索できる', async () => {
      const env = createTestEnv(db);
      const result = await listRecords(env, { search: 'abc123' });

      expect(result.total).toBe(1);
      expect(result.records[0].id).toBe('rec-001');
    });
  });

  describe('listRecords - フィルター', () => {
    beforeEach(() => {
      insertTestRecords(db, [
        { id: 'rec-001', hash_sha256: 'abc123', from_domain: 'example.com', stored_at: '2025-01-15 10:00:00' },
        { id: 'rec-002', hash_sha256: 'def456', from_domain: 'test.org', stored_at: '2025-02-15 10:00:00' },
        { id: 'rec-003', hash_sha256: 'ghi789', from_domain: 'example.com', stored_at: '2025-03-15 10:00:00' },
      ]);
    });

    it('ドメインフィルターが正しく動作する', async () => {
      const env = createTestEnv(db);
      const result = await listRecords(env, { domain: 'example.com' });

      expect(result.total).toBe(2);
      expect(result.records.every(r => r.from_domain === 'example.com')).toBe(true);
    });

    it('日付範囲フィルターが正しく動作する', async () => {
      const env = createTestEnv(db);
      const result = await listRecords(env, {
        dateFrom: '2025-02-01',
        dateTo: '2025-02-28',
      });

      expect(result.total).toBe(1);
      expect(result.records[0].id).toBe('rec-002');
    });

    it('ハッシュプレフィックスフィルターが正しく動作する', async () => {
      const env = createTestEnv(db);
      const result = await listRecords(env, { hashPrefix: 'abc' });

      expect(result.total).toBe(1);
      expect(result.records[0].hash_sha256).toBe('abc123');
    });

    it('複数フィルターの組み合わせが正しく動作する', async () => {
      const env = createTestEnv(db);
      const result = await listRecords(env, {
        domain: 'example.com',
        dateFrom: '2025-03-01',
      });

      expect(result.total).toBe(1);
      expect(result.records[0].id).toBe('rec-003');
    });
  });

  describe('listRecords - ページネーション', () => {
    beforeEach(() => {
      // 25件のテストデータを挿入
      const records = Array.from({ length: 25 }, (_, i) => ({
        id: `rec-${String(i + 1).padStart(3, '0')}`,
        hash_sha256: `hash${i + 1}`,
        from_domain: 'example.com',
      }));
      insertTestRecords(db, records);
    });

    it('デフォルトのページサイズ（20件）で取得する', async () => {
      const env = createTestEnv(db);
      const result = await listRecords(env, {});

      expect(result.limit).toBe(20);
      expect(result.records.length).toBe(20);
      expect(result.total).toBe(25);
      expect(result.hasMore).toBe(true);
    });

    it('2ページ目を取得する', async () => {
      const env = createTestEnv(db);
      const result = await listRecords(env, { page: 2 });

      expect(result.page).toBe(2);
      expect(result.records.length).toBe(5);
      expect(result.hasMore).toBe(false);
    });

    it('カスタムページサイズで取得する', async () => {
      const env = createTestEnv(db);
      const result = await listRecords(env, { limit: 10 });

      expect(result.limit).toBe(10);
      expect(result.records.length).toBe(10);
    });

    it('limitは100を超えない', async () => {
      const env = createTestEnv(db);
      const result = await listRecords(env, { limit: 500 });

      expect(result.limit).toBe(100);
    });
  });

  describe('listRecords - ソート', () => {
    beforeEach(() => {
      insertTestRecords(db, [
        { id: 'rec-c', hash_sha256: 'hash3', from_domain: 'charlie.com', stored_at: '2025-01-03' },
        { id: 'rec-a', hash_sha256: 'hash1', from_domain: 'alpha.com', stored_at: '2025-01-01' },
        { id: 'rec-b', hash_sha256: 'hash2', from_domain: 'bravo.com', stored_at: '2025-01-02' },
      ]);
    });

    it('stored_atで降順ソート（デフォルト）', async () => {
      const env = createTestEnv(db);
      const result = await listRecords(env, {});

      expect(result.records[0].id).toBe('rec-c');
      expect(result.records[2].id).toBe('rec-a');
    });

    it('from_domainで昇順ソート', async () => {
      const env = createTestEnv(db);
      const result = await listRecords(env, { sortBy: 'from_domain', sortOrder: 'asc' });

      expect(result.records[0].from_domain).toBe('alpha.com');
      expect(result.records[2].from_domain).toBe('charlie.com');
    });

    it('不正なソートカラムはstored_atにフォールバック', async () => {
      const env = createTestEnv(db);
      // @ts-expect-error: 意図的に不正な値をテスト
      const result = await listRecords(env, { sortBy: 'malicious; DROP TABLE--' });

      // エラーにならず、stored_atでソートされる
      expect(result.records[0].id).toBe('rec-c');
    });
  });

  describe('getRecord', () => {
    beforeEach(() => {
      insertTestRecords(db, [
        { id: 'test-id-123', hash_sha256: 'abc123', from_domain: 'example.com' },
      ]);
    });

    it('IDでレコードを取得する', async () => {
      const env = createTestEnv(db);
      const result = await getRecord(env, 'test-id-123');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('test-id-123');
      expect(result?.from_domain).toBe('example.com');
    });

    it('存在しないIDはnullを返す', async () => {
      const env = createTestEnv(db);
      const result = await getRecord(env, 'non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findByHash', () => {
    beforeEach(() => {
      insertTestRecords(db, [
        { id: 'rec-001', hash_sha256: 'a'.repeat(64), from_domain: 'example.com' },
      ]);
    });

    it('ハッシュでレコードを検索する', async () => {
      const env = createTestEnv(db);
      const result = await findByHash(env, 'a'.repeat(64));

      expect(result).not.toBeNull();
      expect(result?.id).toBe('rec-001');
    });

    it('存在しないハッシュはnullを返す', async () => {
      const env = createTestEnv(db);
      const result = await findByHash(env, 'b'.repeat(64));

      expect(result).toBeNull();
    });
  });

  describe('getUniqueDomains', () => {
    beforeEach(() => {
      insertTestRecords(db, [
        { id: 'rec-001', hash_sha256: 'hash1', from_domain: 'example.com' },
        { id: 'rec-002', hash_sha256: 'hash2', from_domain: 'test.org' },
        { id: 'rec-003', hash_sha256: 'hash3', from_domain: 'example.com' },
        { id: 'rec-004', hash_sha256: 'hash4', from_domain: null },
      ]);
    });

    it('ユニークなドメインリストを取得する', async () => {
      const env = createTestEnv(db);
      const result = await getUniqueDomains(env);

      expect(result).toContain('example.com');
      expect(result).toContain('test.org');
      expect(result.length).toBe(2);
    });

    it('NULLドメインは含まれない', async () => {
      const env = createTestEnv(db);
      const result = await getUniqueDomains(env);

      expect(result).not.toContain(null);
    });

    it('アルファベット順にソートされる', async () => {
      const env = createTestEnv(db);
      const result = await getUniqueDomains(env);

      expect(result[0]).toBe('example.com');
      expect(result[1]).toBe('test.org');
    });
  });

  describe('getStats', () => {
    beforeEach(() => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const nextWeek = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

      insertTestRecords(db, [
        {
          id: 'rec-001',
          hash_sha256: 'hash1',
          from_domain: 'example.com',
          stored_at: now.toISOString(),
          expires_at: nextWeek.toISOString(),
          metadata: JSON.stringify({ auth_status: 'verified' }),
        },
        {
          id: 'rec-002',
          hash_sha256: 'hash2',
          from_domain: 'test.org',
          stored_at: yesterday.toISOString(),
          metadata: JSON.stringify({ auth_status: 'failed' }),
        },
        {
          id: 'rec-003',
          hash_sha256: 'hash3',
          from_domain: 'example.com',
          stored_at: now.toISOString(),
        },
      ]);
    });

    it('総レコード数を取得する', async () => {
      const env = createTestEnv(db);
      const result = await getStats(env);

      expect(result.totalRecords).toBe(3);
    });

    it('ドメイン別統計を取得する', async () => {
      const env = createTestEnv(db);
      const result = await getStats(env);

      expect(result.domainStats.length).toBeGreaterThan(0);
      const exampleDomain = result.domainStats.find(d => d.domain === 'example.com');
      expect(exampleDomain?.count).toBe(2);
    });

    it('認証ステータス統計を取得する', async () => {
      const env = createTestEnv(db);
      const result = await getStats(env);

      expect(result.authStats.verified).toBe(1);
      expect(result.authStats.failed).toBe(1);
      expect(result.authStats.unverified).toBe(1);
    });

    it('時間帯分布が24時間の配列として返される', async () => {
      const env = createTestEnv(db);
      const result = await getStats(env);

      expect(result.hourlyDistribution.length).toBe(24);
    });
  });

  describe('getDashboardSummary', () => {
    beforeEach(() => {
      const now = new Date();
      insertTestRecords(db, [
        { id: 'rec-001', hash_sha256: 'hash1', from_domain: 'example.com', stored_at: now.toISOString() },
        { id: 'rec-002', hash_sha256: 'hash2', from_domain: 'example.com', stored_at: now.toISOString() },
        { id: 'rec-003', hash_sha256: 'hash3', from_domain: 'test.org', stored_at: now.toISOString() },
      ]);
    });

    it('ダッシュボードサマリーを取得する', async () => {
      const env = createTestEnv(db);
      const result = await getDashboardSummary(env);

      expect(result.totalRecords).toBe(3);
      expect(result.topDomains.length).toBeGreaterThan(0);
    });

    it('上位ドメインが件数順にソートされる', async () => {
      const env = createTestEnv(db);
      const result = await getDashboardSummary(env);

      expect(result.topDomains[0].domain).toBe('example.com');
      expect(result.topDomains[0].count).toBe(2);
    });
  });

  describe('SQLインジェクション対策', () => {
    beforeEach(() => {
      insertTestRecords(db, [
        { id: 'safe-record', hash_sha256: 'safehash', from_domain: 'safe.com' },
      ]);
    });

    it('検索でのSQLインジェクション試行を防ぐ', async () => {
      const env = createTestEnv(db);

      // SQLインジェクション試行
      const result = await listRecords(env, { search: "'; DROP TABLE eml_records; --" });

      // テーブルが削除されていないことを確認
      const check = await listRecords(env, {});
      expect(check.total).toBe(1);
    });

    it('ハッシュプレフィックスでのSQLインジェクション試行を防ぐ', async () => {
      const env = createTestEnv(db);

      const result = await listRecords(env, { hashPrefix: "abc' OR '1'='1" });

      // 不正なクエリが実行されていないことを確認（該当なし）
      expect(result.total).toBe(0);
    });

    it('ドメインフィルターでのSQLインジェクション試行を防ぐ', async () => {
      const env = createTestEnv(db);

      const result = await listRecords(env, { domain: "'; DELETE FROM eml_records; --" });

      // テーブルが削除されていないことを確認
      const check = await listRecords(env, {});
      expect(check.total).toBe(1);
    });
  });
});
