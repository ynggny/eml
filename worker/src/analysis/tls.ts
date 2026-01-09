/**
 * TLS経路分析モジュール
 * Receivedヘッダーを解析してメール配送経路のTLS使用状況を確認
 */

import type { EmailHeader, TLSHop, TLSAnalysisResult } from './types';

// TLSプロトコルとバージョンのパターン
const TLS_PATTERNS = {
  // TLSバージョン検出
  tlsVersion: /TLS\s*(v?1\.[0-3]|1\.0|1\.1|1\.2|1\.3)/i,
  sslVersion: /SSL\s*(v?[23](\.[0-9])?)/i,

  // 暗号化使用の検出
  encrypted: /with\s+(ESMTPS|SMTPS|TLS|SSL)|using\s+TLS|cipher|encrypt/i,

  // 暗号スイート
  cipher: /cipher=([A-Z0-9_-]+)/i,

  // プロトコル
  protocol: /with\s+(ESMTPS?A?|SMTPS?|LMTPS?|HTTPS?|IMAP\S*|POP3\S*)/i,

  // ホスト名抽出
  fromHost: /from\s+([^\s(]+(?:\s*\([^)]+\))?)/i,
  byHost: /by\s+([^\s(]+(?:\s*\([^)]+\))?)/i,

  // 日付抽出
  timestamp: /;\s*(.+)$/,

  // ID抽出
  messageId: /id\s+([^\s;]+)/i,
};

// TLSバージョンのセキュリティレベル
const TLS_SECURITY_LEVEL: Record<string, 'secure' | 'weak' | 'deprecated'> = {
  'TLS 1.3': 'secure',
  'TLS 1.2': 'secure',
  'TLS 1.1': 'deprecated',
  'TLS 1.0': 'deprecated',
  'SSL 3.0': 'deprecated',
  'SSL 2.0': 'deprecated',
};

/**
 * 単一のReceivedヘッダーを解析
 */
function parseReceivedHeader(value: string): TLSHop {
  // ホスト名抽出
  const fromMatch = value.match(TLS_PATTERNS.fromHost);
  const byMatch = value.match(TLS_PATTERNS.byHost);

  // 暗号化検出
  const encrypted = TLS_PATTERNS.encrypted.test(value);

  // プロトコル抽出
  const protocolMatch = value.match(TLS_PATTERNS.protocol);
  let protocol = protocolMatch?.[1]?.toUpperCase();

  // TLSバージョン抽出
  let tlsVersion: string | undefined;
  const tlsMatch = value.match(TLS_PATTERNS.tlsVersion);
  const sslMatch = value.match(TLS_PATTERNS.sslVersion);

  if (tlsMatch) {
    const version = tlsMatch[1].replace('v', '');
    tlsVersion = `TLS ${version.startsWith('1') ? version : '1.' + version}`;
  } else if (sslMatch) {
    tlsVersion = `SSL ${sslMatch[1].replace('v', '')}`;
  }

  // 暗号スイート抽出
  const cipherMatch = value.match(TLS_PATTERNS.cipher);
  const cipher = cipherMatch?.[1];

  // タイムスタンプ抽出
  const timestampMatch = value.match(TLS_PATTERNS.timestamp);
  let timestamp = timestampMatch?.[1]?.trim();

  // タイムスタンプのクリーンアップ
  if (timestamp) {
    // コメント部分を除去
    timestamp = timestamp.replace(/\([^)]*\)/g, '').trim();
  }

  // ホスト名のクリーンアップ
  const cleanHostname = (host: string | undefined): string => {
    if (!host) return 'unknown';
    // 括弧内のIPアドレスなどを除去
    return host.replace(/\s*\([^)]+\)/, '').trim();
  };

  return {
    from: cleanHostname(fromMatch?.[1]),
    to: cleanHostname(byMatch?.[1]),
    timestamp,
    encrypted,
    protocol,
    cipher,
    tlsVersion,
  };
}

/**
 * TLS経路を分析
 */
export function analyzeTLSPath(headers: EmailHeader[]): TLSAnalysisResult {
  // Receivedヘッダーを抽出（大文字小文字を無視）
  const receivedHeaders = headers.filter(
    h => h.key.toLowerCase() === 'received'
  );

  // ホップ情報を解析
  const hops: TLSHop[] = receivedHeaders.map(h => parseReceivedHeader(h.value));

  // Receivedヘッダーは逆順（最新が最初）なので反転
  hops.reverse();

  // 統計計算
  const totalHops = hops.length;
  const encryptedHops = hops.filter(h => h.encrypted).length;
  const unencryptedHops = hops.filter(h => !h.encrypted);

  // リスク判定
  let risk: 'safe' | 'warning' | 'danger' = 'safe';
  const issues: string[] = [];

  if (totalHops === 0) {
    risk = 'warning';
    issues.push('Receivedヘッダーがありません');
  } else {
    // 暗号化されていないホップの割合
    const unencryptedRatio = unencryptedHops.length / totalHops;

    if (unencryptedRatio > 0.5) {
      risk = 'danger';
      issues.push('半数以上のホップが暗号化されていません');
    } else if (unencryptedHops.length > 0) {
      risk = 'warning';
      issues.push(`${unencryptedHops.length}個のホップが暗号化されていません`);
    }

    // 古いTLSバージョンの検出
    const deprecatedTLS = hops.filter(h => {
      if (!h.tlsVersion) return false;
      return TLS_SECURITY_LEVEL[h.tlsVersion] === 'deprecated';
    });

    if (deprecatedTLS.length > 0) {
      issues.push(`${deprecatedTLS.length}個のホップで古いTLSバージョンが使用されています`);
      if (risk === 'safe') risk = 'warning';
    }

    // 最初のホップ（送信元MTAから最初の中継）が暗号化されていない場合
    if (hops.length > 0 && !hops[0].encrypted) {
      issues.push('送信元からの最初の接続が暗号化されていません');
      risk = 'danger';
    }
  }

  // サマリー生成
  let summary: string;
  if (totalHops === 0) {
    summary = 'メール配送経路の情報がありません';
  } else if (encryptedHops === totalHops) {
    summary = `全${totalHops}ホップがTLSで暗号化されています`;
  } else if (encryptedHops === 0) {
    summary = `全${totalHops}ホップが暗号化されていません`;
  } else {
    summary = `${totalHops}ホップ中${encryptedHops}ホップがTLSで暗号化されています`;
  }

  return {
    hops,
    totalHops,
    encryptedHops,
    unencryptedHops,
    risk,
    summary,
  };
}

/**
 * ヘッダー整合性チェック
 */
export function analyzeHeaderConsistency(
  headers: EmailHeader[],
  fromAddress: string | undefined
): {
  returnPathMatch: boolean;
  replyToMatch: boolean;
  dateValid: boolean;
  messageIdValid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // ヘッダー値を取得するヘルパー
  const getHeader = (key: string): string | undefined => {
    const header = headers.find(h => h.key.toLowerCase() === key.toLowerCase());
    return header?.value;
  };

  // Fromからドメインを抽出
  const extractDomain = (email: string | undefined): string | undefined => {
    if (!email) return undefined;
    const match = email.match(/@([a-zA-Z0-9.-]+)/);
    return match?.[1]?.toLowerCase();
  };

  const fromDomain = extractDomain(fromAddress);

  // Return-Pathチェック
  const returnPath = getHeader('Return-Path');
  const returnPathDomain = extractDomain(returnPath);
  const returnPathMatch = !returnPath || !fromDomain || returnPathDomain === fromDomain;

  if (!returnPathMatch) {
    issues.push(`Return-Path (${returnPathDomain}) がFrom (${fromDomain}) と一致しません`);
  }

  // Reply-Toチェック
  const replyTo = getHeader('Reply-To');
  const replyToDomain = extractDomain(replyTo);
  const replyToMatch = !replyTo || !fromDomain || replyToDomain === fromDomain;

  if (!replyToMatch) {
    issues.push(`Reply-To (${replyToDomain}) がFrom (${fromDomain}) と異なります`);
  }

  // Dateチェック
  const dateHeader = getHeader('Date');
  let dateValid = true;
  if (dateHeader) {
    try {
      const date = new Date(dateHeader);
      const now = new Date();
      const diff = Math.abs(now.getTime() - date.getTime());
      const oneWeek = 7 * 24 * 60 * 60 * 1000;

      // 未来の日付
      if (date > now) {
        issues.push('Dateヘッダーが未来の日付です');
        dateValid = false;
      }
      // 1年以上前
      else if (diff > 365 * 24 * 60 * 60 * 1000) {
        issues.push('Dateヘッダーが1年以上前の日付です');
        dateValid = false;
      }
    } catch {
      issues.push('Dateヘッダーの形式が不正です');
      dateValid = false;
    }
  } else {
    issues.push('Dateヘッダーがありません');
    dateValid = false;
  }

  // Message-IDチェック
  const messageId = getHeader('Message-ID') || getHeader('Message-Id');
  let messageIdValid = true;
  if (messageId) {
    // 基本的な形式チェック
    if (!messageId.match(/^<.+@.+>$/)) {
      issues.push('Message-IDの形式が標準的ではありません');
      messageIdValid = false;
    }
  } else {
    issues.push('Message-IDヘッダーがありません');
    messageIdValid = false;
  }

  return {
    returnPathMatch,
    replyToMatch,
    dateValid,
    messageIdValid,
    issues,
  };
}
