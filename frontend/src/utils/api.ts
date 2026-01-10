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
// 統合セキュリティ分析API
// ========================================

/**
 * 分析リクエスト
 */
export interface AnalysisRequest {
  from?: string;
  fromDomain?: string;
  to?: string[];
  subject?: string;
  date?: string;
  headers: { key: string; value: string }[];
  rawHeaders?: string;
  html?: string;
  text?: string;
  attachments: { filename: string; mimeType: string; size: number }[];
  rawBody?: string;
  authResults?: {
    spf?: string;
    dkim?: string;
    dmarc?: string;
  };
}

/**
 * リンク分析結果
 */
export interface LinkAnalysisResult {
  url: string;
  displayText?: string;
  issues: string[];
  risk: 'safe' | 'suspicious' | 'dangerous';
  details?: {
    hostname: string;
    protocol: string;
    isShortened: boolean;
    isSuspiciousTLD: boolean;
    isIPAddress: boolean;
    lookalikeDomain?: string;
  };
}

/**
 * 添付ファイル分析結果
 */
export interface AttachmentAnalysisResult {
  filename: string;
  mimeType: string;
  size: number;
  issues: string[];
  risk: 'safe' | 'warning' | 'dangerous';
  category?: 'executable' | 'macro' | 'archive' | 'document' | 'image' | 'other';
}

/**
 * BEC検出結果
 */
export interface BECIndicator {
  pattern: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  matchedText?: string;
  category: 'urgency' | 'financial' | 'authority' | 'secrecy' | 'credential' | 'action';
}

/**
 * TLSホップ情報
 */
export interface TLSHop {
  from: string;
  to: string;
  timestamp?: string;
  encrypted: boolean;
  protocol?: string;
  cipher?: string;
  tlsVersion?: string;
}

/**
 * TLS経路分析結果
 */
export interface TLSAnalysisResult {
  hops: TLSHop[];
  totalHops: number;
  encryptedHops: number;
  unencryptedHops: TLSHop[];
  risk: 'safe' | 'warning' | 'danger';
  summary: string;
}

/**
 * DKIM検証結果
 */
export interface DKIMVerificationResult {
  status: 'pass' | 'fail' | 'none' | 'permerror' | 'temperror';
  selector?: string;
  domain?: string;
  algorithm?: string;
  headers?: string[];
  signatureValid: boolean;
  bodyHashValid: boolean;
  publicKeyFound: boolean;
  details: {
    signedHeaders?: string[];
    bodyHashAlgorithm?: 'sha256' | 'sha1';
    canonicalization?: {
      header: 'relaxed' | 'simple';
      body: 'relaxed' | 'simple';
    };
    keyType?: 'rsa' | 'ed25519';
    keySize?: number;
    issues: string[];
  };
  rawSignature?: string;
  publicKey?: string;
}

/**
 * ARCインスタンス
 */
export interface ARCInstance {
  instance: number;
  seal: {
    status: 'pass' | 'fail' | 'none';
    domain?: string;
    selector?: string;
  };
  messageSignature: {
    status: 'pass' | 'fail' | 'none';
    domain?: string;
    selector?: string;
  };
  authenticationResults: string;
}

/**
 * ARC検証結果
 */
export interface ARCVerificationResult {
  status: 'pass' | 'fail' | 'none';
  chainValid: boolean;
  instances: ARCInstance[];
  issues: string[];
}

/**
 * ドメイン分析結果
 */
export interface DomainAnalysisResult {
  domain: string;
  isSuspicious: boolean;
  isIDN: boolean;
  punycode?: string;
  similarTo?: string;
  similarity?: number;
  techniques: string[];
  scripts?: string[];
  risk: 'low' | 'medium' | 'high';
}

/**
 * ヘッダー整合性チェック結果
 */
export interface HeaderConsistencyResult {
  returnPathMatch: boolean;
  replyToMatch: boolean;
  dateValid: boolean;
  messageIdValid: boolean;
  issues: string[];
}

/**
 * セキュリティファクター
 */
export interface SecurityFactor {
  category: string;
  score: number;
  maxScore: number;
  weight: number;
  issues: string[];
  details?: Record<string, unknown>;
}

/**
 * 総合セキュリティスコア
 */
export interface SecurityScoreResult {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  verdict: 'safe' | 'caution' | 'warning' | 'danger';
  factors: SecurityFactor[];
  summary: string;
}

/**
 * 統合分析レスポンス
 */
export interface FullAnalysisResponse {
  links: LinkAnalysisResult[];
  attachments: AttachmentAnalysisResult[];
  bec: BECIndicator[];
  tls: TLSAnalysisResult;
  dkim: DKIMVerificationResult;
  arc: ARCVerificationResult;
  domain: DomainAnalysisResult;
  headerConsistency: HeaderConsistencyResult;
  securityScore: SecurityScoreResult;
  analyzedAt: string;
  version: string;
}

/**
 * 軽量分析レスポンス（DKIM/ARC検証なし）
 */
export interface QuickAnalysisResponse extends Omit<FullAnalysisResponse, 'dkim' | 'arc'> {
  dkim: null;
  arc: null;
}

/**
 * 統合セキュリティ分析（フル）
 * DKIM署名の再検証とARCチェーン検証を含む
 */
export async function analyzeEmailFull(request: AnalysisRequest): Promise<FullAnalysisResponse> {
  return fetchJson<FullAnalysisResponse>(`${API_BASE_URL}/api/analyze`, {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

/**
 * 軽量セキュリティ分析（DKIM/ARC検証なし）
 * フロントエンドでの即時表示用
 */
export async function analyzeEmailQuick(request: AnalysisRequest): Promise<QuickAnalysisResponse> {
  return fetchJson<QuickAnalysisResponse>(`${API_BASE_URL}/api/analyze/quick`, {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

/**
 * DKIM署名検証のみ
 */
export async function verifyDKIMSignature(
  headers: { key: string; value: string }[],
  body?: string,
  rawHeaders?: string
): Promise<DKIMVerificationResult> {
  return fetchJson<DKIMVerificationResult>(`${API_BASE_URL}/api/security/dkim`, {
    method: 'POST',
    body: JSON.stringify({ headers, body, rawHeaders }),
  });
}

/**
 * ARCチェーン検証のみ
 */
export async function verifyARCChain(
  headers: { key: string; value: string }[]
): Promise<ARCVerificationResult> {
  return fetchJson<ARCVerificationResult>(`${API_BASE_URL}/api/security/arc`, {
    method: 'POST',
    body: JSON.stringify({ headers }),
  });
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

// ========================================
// ファイルエクスポートAPI
// ========================================

/**
 * サポートされるエンコーディング情報
 */
export interface EncodingInfo {
  encoding: string;
  name: string;
  description: string;
}

/**
 * エクスポート準備リクエスト
 */
export interface PrepareExportRequest {
  /** Base64エンコードされたコンテンツ */
  content: string;
  /** ファイル名 */
  filename: string;
  /** MIMEタイプ */
  mimeType: string;
  /** 元のエンコーディング（省略時は自動検出） */
  sourceEncoding?: string;
  /** 文字コード変換を行うか（テキストファイルのみ有効） */
  convertEncoding?: boolean;
  /** トークンの有効期限（秒、デフォルト300秒） */
  expiresIn?: number;
}

/**
 * エクスポート準備レスポンス
 */
export interface PrepareExportResponse {
  /** ダウンロードURL */
  url: string;
  /** トークン */
  token: string;
  /** 有効期限（秒） */
  expiresIn: number;
  /** 有効期限（ISO形式） */
  expiresAt: string;
  /** 検出されたエンコーディング */
  detectedEncoding?: string;
}

/**
 * サポートされるエンコーディング一覧を取得
 */
export async function getSupportedEncodings(): Promise<EncodingInfo[]> {
  const result = await fetchJson<{ encodings: EncodingInfo[] }>(
    `${API_BASE_URL}/api/export/encodings`
  );
  return result.encodings;
}

/**
 * 文字コードを自動検出
 */
export async function detectEncoding(content: ArrayBuffer): Promise<string> {
  // ArrayBufferをBase64に変換
  const bytes = new Uint8Array(content);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  const result = await fetchJson<{ encoding: string }>(
    `${API_BASE_URL}/api/export/detect`,
    {
      method: 'POST',
      body: JSON.stringify({ content: base64 }),
    }
  );
  return result.encoding;
}

/**
 * エクスポートを準備（一時トークン発行）
 *
 * 1. POST /api/export/prepare でトークンを発行
 * 2. 返却されたURLにブラウザで遷移してダウンロード
 */
export async function prepareExport(
  request: PrepareExportRequest
): Promise<PrepareExportResponse> {
  return fetchJson<PrepareExportResponse>(`${API_BASE_URL}/api/export/prepare`, {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

/**
 * ArrayBufferをエクスポート用に準備
 *
 * @param content ファイル内容（ArrayBuffer）
 * @param filename ファイル名
 * @param mimeType MIMEタイプ
 * @param options オプション
 */
export async function prepareExportFromArrayBuffer(
  content: ArrayBuffer,
  filename: string,
  mimeType: string,
  options?: {
    sourceEncoding?: string;
    convertEncoding?: boolean;
    expiresIn?: number;
  }
): Promise<PrepareExportResponse> {
  // ArrayBufferをBase64に変換
  const bytes = new Uint8Array(content);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  return prepareExport({
    content: base64,
    filename,
    mimeType,
    ...options,
  });
}

/**
 * 文字列をエクスポート用に準備
 *
 * @param content ファイル内容（文字列）
 * @param filename ファイル名
 * @param mimeType MIMEタイプ
 * @param options オプション
 */
export async function prepareExportFromString(
  content: string,
  filename: string,
  mimeType: string,
  options?: {
    sourceEncoding?: string;
    expiresIn?: number;
  }
): Promise<PrepareExportResponse> {
  // TextEncoderでUTF-8バイト列に変換後、Base64化
  const encoder = new TextEncoder();
  const bytes = encoder.encode(content);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  return prepareExport({
    content: base64,
    filename,
    mimeType,
    convertEncoding: false, // 既にUTF-8
    ...options,
  });
}

/**
 * ダウンロードを開始
 *
 * prepareExportで取得したURLに遷移してダウンロードを開始
 */
export function startDownload(url: string): void {
  // 新しいウィンドウ/タブを開かず、現在のページでダウンロードを開始
  // これによりブラウザのダウンロードマネージャーが使用される
  const a = document.createElement('a');
  a.href = url;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * ファイルをエクスポート（準備〜ダウンロードまで一括実行）
 *
 * @param content ファイル内容（ArrayBuffer）
 * @param filename ファイル名
 * @param mimeType MIMEタイプ
 * @param options オプション
 */
export async function exportFile(
  content: ArrayBuffer,
  filename: string,
  mimeType: string,
  options?: {
    sourceEncoding?: string;
    convertEncoding?: boolean;
    expiresIn?: number;
  }
): Promise<void> {
  const result = await prepareExportFromArrayBuffer(content, filename, mimeType, options);
  startDownload(result.url);
}

/**
 * 文字列をファイルとしてエクスポート（準備〜ダウンロードまで一括実行）
 *
 * @param content ファイル内容（文字列）
 * @param filename ファイル名
 * @param mimeType MIMEタイプ
 * @param options オプション
 */
export async function exportStringAsFile(
  content: string,
  filename: string,
  mimeType: string,
  options?: {
    sourceEncoding?: string;
    expiresIn?: number;
  }
): Promise<void> {
  const result = await prepareExportFromString(content, filename, mimeType, options);
  startDownload(result.url);
}
