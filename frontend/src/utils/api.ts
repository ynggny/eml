/**
 * Worker APIとの通信を行うユーティリティ
 * 環境変数でAPIのベースURLを切り替え可能
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787';

export interface VerifyRequest {
  domain: string;
  dkimSelector?: string;
  senderIP?: string;
}

export interface VerifyResponse {
  spf: {
    record: string | null;
    exists: boolean;
  };
  dkim: {
    record: string | null;
    exists: boolean;
  };
  dmarc: {
    record: string | null;
    exists: boolean;
    policy: string | null;
  };
  domain: string;
}

export interface DNSRecordResponse {
  domain: string;
  type: string;
  records: string[];
}

export interface StoreRequest {
  emlBase64: string;
  metadata: {
    from_domain?: string;
    subject_preview?: string;
  };
}

export interface StoreResponse {
  id: string;
  hash: string;
  storedAt: string;
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// 認証情報の管理
const AUTH_STORAGE_KEY = 'eml_admin_auth';

export function getStoredAuth(): string | null {
  return localStorage.getItem(AUTH_STORAGE_KEY);
}

export function setStoredAuth(username: string, password: string): void {
  const credentials = btoa(`${username}:${password}`);
  localStorage.setItem(AUTH_STORAGE_KEY, credentials);
}

export function clearStoredAuth(): void {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(data.error || 'API request failed', response.status);
  }

  return data as T;
}

async function fetchJsonWithAuth<T>(url: string, options?: RequestInit): Promise<T> {
  const auth = getStoredAuth();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (auth) {
    headers['Authorization'] = `Basic ${auth}`;
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...options?.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(data.error || 'API request failed', response.status);
  }

  return data as T;
}

/**
 * ドメインのメール認証設定を検証
 */
export async function verifyDomain(
  request: VerifyRequest
): Promise<VerifyResponse> {
  return fetchJson<VerifyResponse>(`${API_BASE_URL}/api/verify`, {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

/**
 * DNSレコードを取得
 */
export async function getDNSRecord(
  type: 'txt' | 'a' | 'mx' | 'cname',
  domain: string
): Promise<DNSRecordResponse> {
  return fetchJson<DNSRecordResponse>(
    `${API_BASE_URL}/api/dns/${type}/${encodeURIComponent(domain)}`
  );
}

/**
 * APIのヘルスチェック
 */
export async function checkHealth(): Promise<{ status: string; timestamp: string }> {
  return fetchJson(`${API_BASE_URL}/api/health`);
}

/**
 * EMLファイルをR2/D1に保存（監査用）
 */
export async function storeEml(
  emlArrayBuffer: ArrayBuffer,
  metadata: StoreRequest['metadata']
): Promise<StoreResponse> {
  // ArrayBufferをBase64に変換
  const bytes = new Uint8Array(emlArrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const emlBase64 = btoa(binary);

  return fetchJson<StoreResponse>(`${API_BASE_URL}/api/store`, {
    method: 'POST',
    body: JSON.stringify({ emlBase64, metadata }),
  });
}

// 管理画面用API

export interface EmlRecord {
  id: string;
  hash_sha256: string;
  from_domain: string | null;
  subject_preview: string | null;
  stored_at: string;
  expires_at: string;
  metadata: string;
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

export interface DashboardSummary {
  totalRecords: number;
  todayRecords: number;
  weekRecords: number;
  monthRecords: number;
  topDomains: { domain: string; count: number }[];
}

export interface AdvancedSearchOptions {
  page?: number;
  limit?: number;
  search?: string;
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

export interface HashSearchResult {
  found: boolean;
  record: EmlRecord | null;
}

/**
 * 統計情報を取得（認証必須）
 */
export async function getStats(): Promise<StatsResponse> {
  return fetchJsonWithAuth<StatsResponse>(`${API_BASE_URL}/api/admin/stats`);
}

/**
 * レコード一覧を取得（認証必須・拡張検索対応）
 */
export async function getRecords(options: AdvancedSearchOptions): Promise<RecordListResponse> {
  const params = new URLSearchParams();
  if (options.page) params.set('page', options.page.toString());
  if (options.limit) params.set('limit', options.limit.toString());
  if (options.search) params.set('search', options.search);
  if (options.dateFrom) params.set('dateFrom', options.dateFrom);
  if (options.dateTo) params.set('dateTo', options.dateTo);
  if (options.domain) params.set('domain', options.domain);
  if (options.hashPrefix) params.set('hashPrefix', options.hashPrefix);
  if (options.sortBy) params.set('sortBy', options.sortBy);
  if (options.sortOrder) params.set('sortOrder', options.sortOrder);

  return fetchJsonWithAuth<RecordListResponse>(
    `${API_BASE_URL}/api/admin/records?${params.toString()}`
  );
}

/**
 * 個別レコードを取得（認証必須）
 */
export async function getRecord(id: string): Promise<EmlRecord> {
  return fetchJsonWithAuth<EmlRecord>(`${API_BASE_URL}/api/admin/records/${id}`);
}

/**
 * レコードを削除（認証必須）
 */
export async function deleteRecord(id: string): Promise<void> {
  await fetchJsonWithAuth<{ success: boolean }>(
    `${API_BASE_URL}/api/admin/records/${id}`,
    { method: 'DELETE' }
  );
}

/**
 * EMLファイルをダウンロード（認証必須）
 */
export async function downloadEml(id: string): Promise<Blob> {
  const auth = getStoredAuth();
  const headers: Record<string, string> = {};

  if (auth) {
    headers['Authorization'] = `Basic ${auth}`;
  }

  const response = await fetch(
    `${API_BASE_URL}/api/admin/records/${id}/download`,
    { headers }
  );

  if (!response.ok) {
    if (response.status === 401) {
      throw new ApiError('Unauthorized', 401);
    }
    throw new ApiError('Download failed', response.status);
  }

  return response.blob();
}

export interface PresignedUrlResponse {
  url: string;
  expiresIn: number;
  expiresAt: string;
}

/**
 * 署名付きダウンロードURLを生成（認証必須）
 * @param id レコードID
 * @param expiresInMinutes 有効期限（分）デフォルト60分
 */
export async function getPresignedUrl(
  id: string,
  expiresInMinutes = 60
): Promise<PresignedUrlResponse> {
  return fetchJsonWithAuth<PresignedUrlResponse>(
    `${API_BASE_URL}/api/admin/records/${id}/presign?expires=${expiresInMinutes}`,
    { method: 'POST' }
  );
}

// ========================================
// セキュリティ分析API
// ========================================

/**
 * ホモグラフ/コンフュザブル検出結果
 */
export interface ConfusableResult {
  originalDomain: string;
  normalizedDomain: string;
  isIDN: boolean;
  punycode: string | null;
  confusableChars: {
    original: string;
    position: number;
    normalized: string;
    script: string;
  }[];
  matchedDomain: string | null;
  similarity: number;
  risk: 'none' | 'low' | 'medium' | 'high';
  techniques: string[];
}

/**
 * 単一ドメインのホモグラフ/コンフュザブル分析
 */
export async function analyzeConfusableDomain(domain: string): Promise<ConfusableResult> {
  return fetchJson<ConfusableResult>(`${API_BASE_URL}/api/security/confusables`, {
    method: 'POST',
    body: JSON.stringify({ domain }),
  });
}

/**
 * 複数ドメインの一括分析
 */
export async function analyzeConfusableDomains(domains: string[]): Promise<ConfusableResult[]> {
  const result = await fetchJson<{ results: ConfusableResult[] }>(
    `${API_BASE_URL}/api/security/confusables`,
    {
      method: 'POST',
      body: JSON.stringify({ domains }),
    }
  );
  return result.results;
}

// ========================================
// 管理画面拡張API
// ========================================

/**
 * ダッシュボードサマリーを取得（高速版）
 */
export async function getDashboardSummary(): Promise<DashboardSummary> {
  return fetchJsonWithAuth<DashboardSummary>(`${API_BASE_URL}/api/admin/summary`);
}

/**
 * ユニークドメイン一覧を取得
 */
export async function getUniqueDomains(): Promise<string[]> {
  const result = await fetchJsonWithAuth<{ domains: string[] }>(`${API_BASE_URL}/api/admin/domains`);
  return result.domains;
}

/**
 * 一括削除
 */
export async function bulkDeleteRecords(ids: string[]): Promise<BulkOperationResult> {
  return fetchJsonWithAuth<BulkOperationResult>(
    `${API_BASE_URL}/api/admin/records/bulk-delete`,
    { method: 'POST', body: JSON.stringify({ ids }) }
  );
}

/**
 * エクスポート
 */
export async function exportRecords(options: {
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  domain?: string;
}): Promise<ExportData> {
  return fetchJsonWithAuth<ExportData>(
    `${API_BASE_URL}/api/admin/records/export`,
    { method: 'POST', body: JSON.stringify(options) }
  );
}

/**
 * ハッシュ検索（完全一致）
 */
export async function searchByHash(hash: string): Promise<HashSearchResult> {
  return fetchJsonWithAuth<HashSearchResult>(`${API_BASE_URL}/api/admin/hash/${hash}`);
}

/**
 * 整合性検証（偽造検知）
 */
export async function verifyIntegrity(id: string): Promise<IntegrityCheckResult> {
  return fetchJsonWithAuth<IntegrityCheckResult>(
    `${API_BASE_URL}/api/admin/records/${id}/verify`,
    { method: 'POST' }
  );
}
