/**
 * 管理画面用API
 */

import type { EmlRecord } from './storage';

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
}

/**
 * レコード一覧を取得
 */
export async function listRecords(
  env: Env,
  options: { page?: number; limit?: number; search?: string }
): Promise<RecordListResponse> {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));
  const offset = (page - 1) * limit;

  let whereClause = '';
  const params: unknown[] = [];

  if (options.search) {
    whereClause = 'WHERE from_domain LIKE ? OR subject_preview LIKE ?';
    params.push(`%${options.search}%`, `%${options.search}%`);
  }

  // 総件数を取得
  const countResult = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM eml_records ${whereClause}`
  )
    .bind(...params)
    .first<{ count: number }>();

  const total = countResult?.count ?? 0;

  // レコードを取得
  const records = await env.DB.prepare(
    `SELECT * FROM eml_records ${whereClause} ORDER BY stored_at DESC LIMIT ? OFFSET ?`
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
 * 統計情報を取得
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

  return {
    totalRecords: totalResult?.count ?? 0,
    totalSize: 0, // R2のサイズ計算は重いので省略
    domainStats: domainResult.results ?? [],
    recentRecords: recentResult?.count ?? 0,
    expiringRecords: expiringResult?.count ?? 0,
  };
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
