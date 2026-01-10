/**
 * 管理画面用API - 証跡管理に特化した高機能版
 */

import type { EmlRecord } from './storage';

/**
 * SQLite LIKE検索用の特殊文字をエスケープ
 * %と_はLIKEパターンでワイルドカードとして解釈されるため、
 * エスケープしないと「LIKE or GLOB pattern too complex」エラーが発生する可能性がある
 */
export function escapeLikePattern(value: string): string {
  return value
    .replace(/\\/g, '\\\\')  // バックスラッシュを先にエスケープ
    .replace(/%/g, '\\%')    // % → \%
    .replace(/_/g, '\\_');   // _ → \_
}

interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
}

export interface RecordListResponse {
  records: EmlRecord[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface StatsResponse {
  totalRecords: number;
  totalSize: number;
  domainStats: { domain: string; count: number }[];
  recentRecords: number;
  expiringRecords: number;
  // 拡張統計
  authStats: {
    verified: number;
    unverified: number;
    failed: number;
  };
  timelineData: {
    date: string;
    count: number;
  }[];
  hourlyDistribution: number[];
}

export interface AdvancedSearchOptions {
  page?: number;
  limit?: number;
  search?: string;
  // 拡張フィルター
  dateFrom?: string;
  dateTo?: string;
  domain?: string;
  hashPrefix?: string;
  sortBy?: 'stored_at' | 'from_domain' | 'subject_preview';
  sortOrder?: 'asc' | 'desc';
}

export interface BulkOperationResult {
  success: number;
  failed: number;
  errors: string[];
}

export interface ExportData {
  records: EmlRecord[];
  exportedAt: string;
  totalRecords: number;
  filters: Record<string, string>;
}

export interface IntegrityCheckResult {
  id: string;
  storedHash: string;
  calculatedHash: string;
  isValid: boolean;
  checkedAt: string;
}

/**
 * レコード一覧を取得（拡張検索対応）
 */
export async function listRecords(
  env: Env,
  options: AdvancedSearchOptions
): Promise<RecordListResponse> {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));
  const offset = (page - 1) * limit;
  const sortBy = options.sortBy ?? 'stored_at';
  const sortOrder = options.sortOrder ?? 'desc';

  const conditions: string[] = [];
  const params: unknown[] = [];

  // テキスト検索（特殊文字をエスケープしてLIKE pattern too complexエラーを防ぐ）
  if (options.search) {
    conditions.push("(from_domain LIKE ? ESCAPE '\\' OR subject_preview LIKE ? ESCAPE '\\' OR id LIKE ? ESCAPE '\\' OR hash_sha256 LIKE ? ESCAPE '\\')");
    const searchPattern = `%${escapeLikePattern(options.search)}%`;
    params.push(searchPattern, searchPattern, searchPattern, searchPattern);
  }

  // ドメインフィルター
  if (options.domain) {
    conditions.push('from_domain = ?');
    params.push(options.domain);
  }

  // 日付範囲フィルター
  if (options.dateFrom) {
    conditions.push('stored_at >= ?');
    params.push(options.dateFrom);
  }
  if (options.dateTo) {
    conditions.push('stored_at <= ?');
    params.push(options.dateTo + ' 23:59:59');
  }

  // ハッシュ前方一致（16進数のみのためエスケープ不要だが安全のため追加）
  if (options.hashPrefix) {
    conditions.push("hash_sha256 LIKE ? ESCAPE '\\'");
    params.push(`${escapeLikePattern(options.hashPrefix)}%`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // 許可されたソートカラムのみ
  const allowedSortColumns = ['stored_at', 'from_domain', 'subject_preview'];
  const safeSort = allowedSortColumns.includes(sortBy) ? sortBy : 'stored_at';
  const safeOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';

  // 総件数を取得
  const countResult = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM eml_records ${whereClause}`
  )
    .bind(...params)
    .first<{ count: number }>();

  const total = countResult?.count ?? 0;

  // レコードを取得
  const records = await env.DB.prepare(
    `SELECT * FROM eml_records ${whereClause} ORDER BY ${safeSort} ${safeOrder} LIMIT ? OFFSET ?`
  )
    .bind(...params, limit, offset)
    .all<EmlRecord>();

  return {
    records: records.results ?? [],
    total,
    page,
    limit,
    hasMore: offset + limit < total,
  };
}

/**
 * 単一レコードを取得
 */
export async function getRecord(
  env: Env,
  id: string
): Promise<EmlRecord | null> {
  const result = await env.DB.prepare(
    'SELECT * FROM eml_records WHERE id = ?'
  )
    .bind(id)
    .first<EmlRecord>();

  return result ?? null;
}

/**
 * 拡張統計情報を取得
 */
export async function getStats(env: Env): Promise<StatsResponse> {
  // 総レコード数
  const totalResult = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM eml_records'
  ).first<{ count: number }>();

  // ドメイン別統計（上位10件）
  const domainResult = await env.DB.prepare(
    `SELECT from_domain as domain, COUNT(*) as count
     FROM eml_records
     WHERE from_domain IS NOT NULL
     GROUP BY from_domain
     ORDER BY count DESC
     LIMIT 10`
  ).all<{ domain: string; count: number }>();

  // 過去24時間のレコード数
  const recentResult = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM eml_records
     WHERE stored_at > datetime('now', '-1 day')`
  ).first<{ count: number }>();

  // 7日以内に期限切れのレコード数
  const expiringResult = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM eml_records
     WHERE expires_at < datetime('now', '+7 days')`
  ).first<{ count: number }>();

  // 過去30日間の日別推移
  const timelineResult = await env.DB.prepare(
    `SELECT DATE(stored_at) as date, COUNT(*) as count
     FROM eml_records
     WHERE stored_at > datetime('now', '-30 days')
     GROUP BY DATE(stored_at)
     ORDER BY date ASC`
  ).all<{ date: string; count: number }>();

  // 時間帯別分布（0-23時）
  const hourlyResult = await env.DB.prepare(
    `SELECT CAST(strftime('%H', stored_at) AS INTEGER) as hour, COUNT(*) as count
     FROM eml_records
     WHERE stored_at > datetime('now', '-30 days')
     GROUP BY hour
     ORDER BY hour ASC`
  ).all<{ hour: number; count: number }>();

  // 時間帯分布を24時間の配列に変換
  const hourlyDistribution = new Array(24).fill(0);
  (hourlyResult.results ?? []).forEach((row) => {
    hourlyDistribution[row.hour] = row.count;
  });

  // 認証ステータス別統計（metadataから集計）
  // メタデータのauth_statusを参照して集計
  const authResult = await env.DB.prepare(
    `SELECT
       SUM(CASE WHEN metadata LIKE '%"auth_status":"verified"%' THEN 1 ELSE 0 END) as verified,
       SUM(CASE WHEN metadata LIKE '%"auth_status":"failed"%' THEN 1 ELSE 0 END) as failed,
       COUNT(*) as total
     FROM eml_records`
  ).first<{ verified: number; failed: number; total: number }>();

  const verified = authResult?.verified ?? 0;
  const failed = authResult?.failed ?? 0;
  const total = authResult?.total ?? 0;

  return {
    totalRecords: totalResult?.count ?? 0,
    totalSize: 0,
    domainStats: domainResult.results ?? [],
    recentRecords: recentResult?.count ?? 0,
    expiringRecords: expiringResult?.count ?? 0,
    authStats: {
      verified,
      failed,
      unverified: total - verified - failed,
    },
    timelineData: timelineResult.results ?? [],
    hourlyDistribution,
  };
}

/**
 * ユニークなドメイン一覧を取得（フィルター用）
 */
export async function getUniqueDomains(env: Env): Promise<string[]> {
  const result = await env.DB.prepare(
    `SELECT DISTINCT from_domain as domain
     FROM eml_records
     WHERE from_domain IS NOT NULL
     ORDER BY domain ASC`
  ).all<{ domain: string }>();

  return (result.results ?? []).map((r) => r.domain);
}

/**
 * レコードを削除
 */
export async function deleteRecord(
  env: Env,
  id: string
): Promise<boolean> {
  // R2からファイルを削除
  await env.BUCKET.delete(`eml/${id}.eml`);

  // D1からレコードを削除
  const result = await env.DB.prepare(
    'DELETE FROM eml_records WHERE id = ?'
  )
    .bind(id)
    .run();

  return (result.meta?.changes ?? 0) > 0;
}

/**
 * 一括削除
 */
export async function bulkDeleteRecords(
  env: Env,
  ids: string[]
): Promise<BulkOperationResult> {
  let success = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const id of ids) {
    try {
      const deleted = await deleteRecord(env, id);
      if (deleted) {
        success++;
      } else {
        failed++;
        errors.push(`${id}: Record not found`);
      }
    } catch (err) {
      failed++;
      errors.push(`${id}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  return { success, failed, errors };
}

/**
 * エクスポート用データを取得
 */
export async function exportRecords(
  env: Env,
  options: AdvancedSearchOptions
): Promise<ExportData> {
  // 最大1000件まで
  const exportOptions = { ...options, page: 1, limit: 1000 };
  const result = await listRecords(env, exportOptions);

  return {
    records: result.records,
    exportedAt: new Date().toISOString(),
    totalRecords: result.total,
    filters: {
      search: options.search ?? '',
      dateFrom: options.dateFrom ?? '',
      dateTo: options.dateTo ?? '',
      domain: options.domain ?? '',
    },
  };
}

/**
 * ハッシュ検索（完全一致）
 */
export async function findByHash(
  env: Env,
  hash: string
): Promise<EmlRecord | null> {
  const result = await env.DB.prepare(
    'SELECT * FROM eml_records WHERE hash_sha256 = ?'
  )
    .bind(hash)
    .first<EmlRecord>();

  return result ?? null;
}

/**
 * 整合性チェック（ファイルハッシュの再計算と検証）
 */
export async function verifyIntegrity(
  env: Env,
  id: string
): Promise<IntegrityCheckResult | null> {
  // レコードを取得
  const record = await getRecord(env, id);
  if (!record) {
    return null;
  }

  // R2からファイルを取得
  const object = await env.BUCKET.get(`eml/${id}.eml`);
  if (!object) {
    return {
      id,
      storedHash: record.hash_sha256,
      calculatedHash: '',
      isValid: false,
      checkedAt: new Date().toISOString(),
    };
  }

  // ハッシュを再計算
  const data = await object.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const calculatedHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  return {
    id,
    storedHash: record.hash_sha256,
    calculatedHash,
    isValid: record.hash_sha256 === calculatedHash,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * ダッシュボード用サマリー（高速版）
 */
export async function getDashboardSummary(env: Env): Promise<{
  totalRecords: number;
  todayRecords: number;
  weekRecords: number;
  monthRecords: number;
  topDomains: { domain: string; count: number }[];
}> {
  const results = await Promise.all([
    // 総レコード数
    env.DB.prepare('SELECT COUNT(*) as count FROM eml_records').first<{ count: number }>(),
    // 今日
    env.DB.prepare(
      `SELECT COUNT(*) as count FROM eml_records WHERE stored_at > datetime('now', 'start of day')`
    ).first<{ count: number }>(),
    // 今週
    env.DB.prepare(
      `SELECT COUNT(*) as count FROM eml_records WHERE stored_at > datetime('now', '-7 days')`
    ).first<{ count: number }>(),
    // 今月
    env.DB.prepare(
      `SELECT COUNT(*) as count FROM eml_records WHERE stored_at > datetime('now', '-30 days')`
    ).first<{ count: number }>(),
    // 上位5ドメイン
    env.DB.prepare(
      `SELECT from_domain as domain, COUNT(*) as count
       FROM eml_records
       WHERE from_domain IS NOT NULL
       GROUP BY from_domain
       ORDER BY count DESC
       LIMIT 5`
    ).all<{ domain: string; count: number }>(),
  ]);

  return {
    totalRecords: results[0]?.count ?? 0,
    todayRecords: results[1]?.count ?? 0,
    weekRecords: results[2]?.count ?? 0,
    monthRecords: results[3]?.count ?? 0,
    topDomains: results[4].results ?? [],
  };
}
