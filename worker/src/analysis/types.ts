/**
 * 分析モジュール共通型定義
 */

// ========================================
// 入力型（フロントエンドから受け取る）
// ========================================

export interface EmailHeader {
  key: string;
  value: string;
}

export interface EmailAttachment {
  filename: string;
  mimeType: string;
  size: number;
}

export interface AnalysisRequest {
  // 基本情報
  from?: string;
  fromDomain?: string;
  to?: string[];
  subject?: string;
  date?: string;

  // ヘッダー情報（DKIM検証用に生ヘッダーも含む）
  headers: EmailHeader[];
  rawHeaders?: string;

  // 本文（リンク抽出・BEC検出用）
  html?: string;
  text?: string;

  // 添付ファイル情報
  attachments: EmailAttachment[];

  // DKIM検証用
  dkimSignature?: string;
  bodyHash?: string;
  rawBody?: string;

  // 認証結果（ヘッダーから抽出済み）
  authResults?: {
    spf?: string;
    dkim?: string;
    dmarc?: string;
  };
}

// ========================================
// 出力型（分析結果）
// ========================================

// リンク分析結果
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

// 添付ファイル分析結果
export interface AttachmentAnalysisResult {
  filename: string;
  mimeType: string;
  size: number;
  issues: string[];
  risk: 'safe' | 'warning' | 'dangerous';
  category?: 'executable' | 'macro' | 'archive' | 'document' | 'image' | 'other';
}

// BEC検出結果
export interface BECIndicator {
  pattern: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  matchedText?: string;
  category: 'urgency' | 'financial' | 'authority' | 'secrecy' | 'credential' | 'action';
}

// TLSホップ情報
export interface TLSHop {
  from: string;
  to: string;
  timestamp?: string;
  encrypted: boolean;
  protocol?: string;
  cipher?: string;
  tlsVersion?: string;
}

// TLS経路分析結果
export interface TLSAnalysisResult {
  hops: TLSHop[];
  totalHops: number;
  encryptedHops: number;
  unencryptedHops: TLSHop[];
  risk: 'safe' | 'warning' | 'danger';
  summary: string;
}

// DKIM検証結果（本格実装）
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

// ARC検証結果
export interface ARCVerificationResult {
  status: 'pass' | 'fail' | 'none';
  chainValid: boolean;
  instances: ARCInstance[];
  issues: string[];
}

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

// ドメイン分析結果（confusables強化版）
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

// ヘッダー整合性チェック結果
export interface HeaderConsistencyResult {
  returnPathMatch: boolean;
  replyToMatch: boolean;
  dateValid: boolean;
  messageIdValid: boolean;
  issues: string[];
}

// 総合セキュリティスコア
export interface SecurityScoreResult {
  score: number; // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  verdict: 'safe' | 'caution' | 'warning' | 'danger';
  factors: SecurityFactor[];
  summary: string;
}

export interface SecurityFactor {
  category: string;
  score: number;
  maxScore: number;
  weight: number;
  issues: string[];
  details?: Record<string, unknown>;
}

// 統合分析レスポンス
export interface FullAnalysisResponse {
  // 各分析結果
  links: LinkAnalysisResult[];
  attachments: AttachmentAnalysisResult[];
  bec: BECIndicator[];
  tls: TLSAnalysisResult;
  dkim: DKIMVerificationResult;
  arc: ARCVerificationResult;
  domain: DomainAnalysisResult;
  headerConsistency: HeaderConsistencyResult;

  // 総合スコア
  securityScore: SecurityScoreResult;

  // メタ情報
  analyzedAt: string;
  version: string;
}
