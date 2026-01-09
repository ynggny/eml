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
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options?.headers,
  };

  if (auth) {
    headers['Authorization'] = `Basic ${auth}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
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
}

/**
 * 統計情報を取得（認証必須）
 */
export async function getStats(): Promise<StatsResponse> {
  return fetchJsonWithAuth<StatsResponse>(`${API_BASE_URL}/api/admin/stats`);
}

/**
 * レコード一覧を取得（認証必須）
 */
export async function getRecords(options: {
  page?: number;
  limit?: number;
  search?: string;
}): Promise<RecordListResponse> {
  const params = new URLSearchParams();
  if (options.page) params.set('page', options.page.toString());
  if (options.limit) params.set('limit', options.limit.toString());
  if (options.search) params.set('search', options.search);

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
