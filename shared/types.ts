/**
 * フロントエンド・バックエンド共通の型定義
 */

// API リクエスト/レスポンス型

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

export interface DNSQueryResponse {
  domain: string;
  type: string;
  records: string[];
}

// メール認証結果

export type AuthStatus = 'pass' | 'fail' | 'softfail' | 'neutral' | 'none';

export interface AuthResults {
  spf?: AuthStatus;
  dkim?: AuthStatus;
  dmarc?: AuthStatus;
}

// EMLパース結果

export interface EmailAddress {
  address: string;
  name?: string;
}

export interface EmailHeader {
  key: string;
  value: string;
}

export interface EmailAttachment {
  filename: string;
  mimeType: string;
  size: number;
}

export interface ParsedEmail {
  from: EmailAddress | null;
  to: EmailAddress[] | null;
  cc?: EmailAddress[] | null;
  bcc?: EmailAddress[] | null;
  subject: string | null;
  date: string | null;
  messageId?: string | null;
  inReplyTo?: string | null;
  references?: string[] | null;
  html: string | null;
  text: string | null;
  attachments: EmailAttachment[];
  headers: EmailHeader[];
}

// EMLレコード（D1保存用）

export interface EmlRecord {
  id: string;
  hash_sha256: string;
  from_domain: string | null;
  subject_preview: string | null;
  stored_at: string;
  expires_at: string;
  metadata: string;
}
