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

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
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
