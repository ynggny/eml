/**
 * セキュリティ分析用ユーティリティ
 * - Lookalike Domain検出
 * - リンク安全性チェック
 * - 添付ファイルリスク分析
 * - BECパターン検出
 * - TLS経路チェック
 */

import type { Header, Attachment, ParsedEmail } from './emlParser';

// ========================================
// Lookalike Domain検出
// ========================================

// 有名ドメインのリスト（フィッシングのターゲットになりやすい）
const WELL_KNOWN_DOMAINS = [
  'google.com', 'gmail.com', 'youtube.com',
  'amazon.com', 'amazon.co.jp', 'aws.amazon.com',
  'microsoft.com', 'outlook.com', 'office.com', 'live.com',
  'apple.com', 'icloud.com',
  'facebook.com', 'instagram.com', 'whatsapp.com',
  'twitter.com', 'x.com',
  'paypal.com',
  'netflix.com',
  'linkedin.com',
  'dropbox.com',
  'adobe.com',
  'yahoo.com', 'yahoo.co.jp',
  'rakuten.co.jp', 'rakuten.com',
  'line.me',
  'mercari.com',
  'docomo.ne.jp',
  'softbank.jp',
  'au.com',
];

// ホモグラフ攻撃で使われる類似文字マッピング
const HOMOGLYPH_MAP: Record<string, string[]> = {
  'a': ['а', 'ɑ', 'α', '@', '4'],
  'b': ['Ь', 'ḅ', '6'],
  'c': ['с', 'ç', '¢', '('],
  'd': ['ԁ', 'ɗ'],
  'e': ['е', 'ё', 'é', 'è', '3'],
  'g': ['ɡ', 'ģ', '9'],
  'h': ['һ', 'ḥ'],
  'i': ['і', 'í', 'ì', '1', 'l', '|'],
  'j': ['ј', 'ʝ'],
  'k': ['κ', 'ķ'],
  'l': ['ӏ', 'ḷ', '1', 'i', '|'],
  'm': ['м', 'ṃ', 'rn'],
  'n': ['п', 'ṇ'],
  'o': ['о', 'ο', 'ơ', '0', 'ø'],
  'p': ['р', 'ρ'],
  'q': ['ԛ', 'գ'],
  'r': ['г', 'ṛ'],
  's': ['ѕ', 'ș', '5', '$'],
  't': ['т', 'ţ', '+'],
  'u': ['υ', 'ս', 'ü', 'ú'],
  'v': ['ν', 'ѵ'],
  'w': ['ω', 'ẉ', 'vv'],
  'x': ['х', 'ẋ'],
  'y': ['у', 'ý', 'ỳ'],
  'z': ['ż', 'ẓ', '2'],
};

// 数字・文字の置換パターン
const SUBSTITUTION_PATTERNS: [string, string][] = [
  ['0', 'o'],
  ['1', 'l'],
  ['1', 'i'],
  ['3', 'e'],
  ['4', 'a'],
  ['5', 's'],
  ['6', 'b'],
  ['6', 'g'],
  ['8', 'b'],
  ['9', 'g'],
  ['vv', 'w'],
  ['rn', 'm'],
  ['cl', 'd'],
  ['ii', 'u'],
];

export interface LookalikeResult {
  originalDomain: string;
  similarTo: string;
  similarity: number;
  techniques: string[];
  risk: 'low' | 'medium' | 'high';
}

/**
 * レーベンシュタイン距離を計算
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * 正規化（ホモグラフ文字をASCIIに変換）
 */
function normalizeHomoglyphs(str: string): string {
  let normalized = str.toLowerCase();

  for (const [ascii, homoglyphs] of Object.entries(HOMOGLYPH_MAP)) {
    for (const h of homoglyphs) {
      normalized = normalized.split(h).join(ascii);
    }
  }

  return normalized;
}

/**
 * 置換パターンを適用して正規化
 */
function normalizeSubstitutions(str: string): string {
  let normalized = str.toLowerCase();

  for (const [from, to] of SUBSTITUTION_PATTERNS) {
    normalized = normalized.split(from).join(to);
  }

  return normalized;
}

/**
 * ドメインがホモグラフ文字を含むかチェック
 */
function containsHomoglyphs(domain: string): boolean {
  for (const homoglyphs of Object.values(HOMOGLYPH_MAP)) {
    for (const h of homoglyphs) {
      if (domain.includes(h)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Lookalike Domain検出
 */
export function detectLookalikeDomain(domain: string): LookalikeResult | null {
  if (!domain) return null;

  const lowerDomain = domain.toLowerCase();

  // 完全一致は問題なし
  if (WELL_KNOWN_DOMAINS.includes(lowerDomain)) {
    return null;
  }

  let bestMatch: LookalikeResult | null = null;
  let bestSimilarity = 0;

  for (const knownDomain of WELL_KNOWN_DOMAINS) {
    const techniques: string[] = [];

    // ドメイン名部分のみ比較（TLD除く）
    const domainName = lowerDomain.split('.')[0];
    const knownDomainName = knownDomain.split('.')[0];
    const normalizedName = normalizeHomoglyphs(normalizeSubstitutions(domainName));

    // ホモグラフチェック
    if (containsHomoglyphs(domain)) {
      techniques.push('ホモグラフ文字');
    }

    // 正規化後の完全一致
    if (normalizedName === knownDomainName && domainName !== knownDomainName) {
      techniques.push('文字置換');
    }

    // レーベンシュタイン距離
    const distance = levenshteinDistance(normalizedName, knownDomainName);
    const maxLen = Math.max(normalizedName.length, knownDomainName.length);
    const similarity = 1 - (distance / maxLen);

    // 類似度が高い場合（70%以上）
    if (similarity >= 0.7 && similarity < 1 && domainName !== knownDomainName) {
      // タイポスクワッティングパターンの検出
      if (distance === 1) {
        techniques.push('タイポスクワッティング');
      }

      // ハイフン追加パターン
      if (domainName.includes('-') && !knownDomainName.includes('-')) {
        techniques.push('ハイフン挿入');
      }

      // サブドメイン偽装（例: google.com.evil.comのdomainがgoogle.com.evilの場合）
      if (domainName.includes(knownDomainName)) {
        techniques.push('サブドメイン偽装');
      }

      if (similarity > bestSimilarity && techniques.length > 0) {
        bestSimilarity = similarity;
        const risk = similarity >= 0.9 ? 'high' : similarity >= 0.8 ? 'medium' : 'low';

        bestMatch = {
          originalDomain: domain,
          similarTo: knownDomain,
          similarity: Math.round(similarity * 100),
          techniques,
          risk,
        };
      }
    }
  }

  // 距離だけでなく、特定パターンも検出
  if (!bestMatch) {
    const domainName = lowerDomain.split('.')[0];

    for (const knownDomain of WELL_KNOWN_DOMAINS) {
      const knownDomainName = knownDomain.split('.')[0];

      // プレフィックス/サフィックスパターン（例: secure-google, google-login）
      if (domainName.includes(knownDomainName) && domainName !== knownDomainName) {
        return {
          originalDomain: domain,
          similarTo: knownDomain,
          similarity: 80,
          techniques: ['ブランド名含有'],
          risk: 'medium',
        };
      }
    }
  }

  return bestMatch;
}

// ========================================
// リンク安全性チェック
// ========================================

export interface LinkAnalysis {
  url: string;
  displayText?: string;
  issues: string[];
  risk: 'safe' | 'suspicious' | 'dangerous';
}

// 危険なTLD
const SUSPICIOUS_TLDS = ['.tk', '.ml', '.ga', '.cf', '.gq', '.xyz', '.top', '.work', '.click', '.link', '.info'];

// 短縮URLサービス
const URL_SHORTENERS = ['bit.ly', 't.co', 'tinyurl.com', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly', 'j.mp', 'x.co'];

/**
 * HTMLからリンクを抽出
 */
export function extractLinksFromHtml(html: string): { url: string; text: string }[] {
  const links: { url: string; text: string }[] = [];
  const linkRegex = /<a[^>]*href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;

  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    links.push({
      url: match[1],
      text: match[2].trim(),
    });
  }

  return links;
}

/**
 * テキストからURLを抽出
 */
export function extractLinksFromText(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
  const matches = text.match(urlRegex);
  return matches ?? [];
}

/**
 * リンクの安全性を分析
 */
export function analyzeLink(url: string, displayText?: string): LinkAnalysis {
  const issues: string[] = [];
  let risk: 'safe' | 'suspicious' | 'dangerous' = 'safe';

  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();

    // 短縮URL
    if (URL_SHORTENERS.some(shortener => hostname.includes(shortener))) {
      issues.push('短縮URL（リダイレクト先不明）');
      risk = 'suspicious';
    }

    // 危険なTLD
    if (SUSPICIOUS_TLDS.some(tld => hostname.endsWith(tld))) {
      issues.push('疑わしいTLD');
      risk = 'suspicious';
    }

    // IPアドレス直接指定
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
      issues.push('IPアドレス直接指定');
      risk = 'suspicious';
    }

    // 過度に長いサブドメイン
    const subdomains = hostname.split('.');
    if (subdomains.length > 4) {
      issues.push('過度なサブドメイン');
      risk = 'suspicious';
    }

    // ポート番号指定
    if (parsedUrl.port && parsedUrl.port !== '443' && parsedUrl.port !== '80') {
      issues.push('非標準ポート');
      risk = 'suspicious';
    }

    // Lookalike Domain
    const lookalike = detectLookalikeDomain(hostname);
    if (lookalike) {
      issues.push(`偽装ドメイン（${lookalike.similarTo}に類似）`);
      risk = lookalike.risk === 'high' ? 'dangerous' : 'suspicious';
    }

    // 表示テキストとURLの不一致
    if (displayText) {
      const textLower = displayText.toLowerCase();
      // 表示テキストがURLっぽいが、実際のURLと異なる
      if (textLower.includes('http') || textLower.includes('www') || textLower.includes('.com')) {
        try {
          const displayUrl = new URL(textLower.startsWith('http') ? textLower : `https://${textLower}`);
          if (displayUrl.hostname !== hostname) {
            issues.push('表示URLと実際のURLが不一致');
            risk = 'dangerous';
          }
        } catch {
          // パースできない場合は無視
        }
      }
    }

    // HTTPSでない
    if (parsedUrl.protocol === 'http:') {
      issues.push('HTTPS未使用');
      if (risk === 'safe') risk = 'suspicious';
    }

  } catch {
    issues.push('無効なURL形式');
    risk = 'dangerous';
  }

  return { url, displayText, issues, risk };
}

/**
 * メール内の全リンクを分析
 */
export function analyzeAllLinks(email: ParsedEmail): LinkAnalysis[] {
  const results: LinkAnalysis[] = [];
  const analyzedUrls = new Set<string>();

  // HTMLからリンクを抽出
  if (email.html) {
    const htmlLinks = extractLinksFromHtml(email.html);
    for (const link of htmlLinks) {
      if (!analyzedUrls.has(link.url)) {
        analyzedUrls.add(link.url);
        results.push(analyzeLink(link.url, link.text));
      }
    }
  }

  // テキストからURLを抽出
  if (email.text) {
    const textLinks = extractLinksFromText(email.text);
    for (const url of textLinks) {
      if (!analyzedUrls.has(url)) {
        analyzedUrls.add(url);
        results.push(analyzeLink(url));
      }
    }
  }

  // 危険度でソート
  const riskOrder = { dangerous: 0, suspicious: 1, safe: 2 };
  results.sort((a, b) => riskOrder[a.risk] - riskOrder[b.risk]);

  return results;
}

// ========================================
// 添付ファイルリスク分析
// ========================================

export interface AttachmentRisk {
  filename: string;
  mimeType: string;
  issues: string[];
  risk: 'safe' | 'warning' | 'dangerous';
}

// 危険な拡張子
const DANGEROUS_EXTENSIONS = [
  '.exe', '.scr', '.bat', '.cmd', '.com', '.pif', '.vbs', '.vbe', '.js', '.jse',
  '.ws', '.wsf', '.wsc', '.wsh', '.ps1', '.psm1', '.psd1', '.msi', '.msp', '.msc',
  '.dll', '.cpl', '.hta', '.jar', '.reg', '.inf', '.lnk',
];

// マクロ付きOfficeファイル
const MACRO_EXTENSIONS = ['.docm', '.xlsm', '.pptm', '.xlsb', '.dotm', '.xltm', '.potm'];

// 圧縮ファイル（中身が見えない）
const ARCHIVE_EXTENSIONS = ['.zip', '.rar', '.7z', '.tar', '.gz', '.iso', '.img'];

// 危険なMIMEタイプ
const DANGEROUS_MIMETYPES = [
  'application/x-msdownload',
  'application/x-executable',
  'application/x-msdos-program',
  'application/x-sh',
  'application/x-javascript',
];

/**
 * 添付ファイルのリスクを分析
 */
export function analyzeAttachment(attachment: Attachment): AttachmentRisk {
  const filename = attachment.filename.toLowerCase();
  const mimeType = attachment.mimeType.toLowerCase();
  const issues: string[] = [];
  let risk: 'safe' | 'warning' | 'dangerous' = 'safe';

  // 拡張子チェック
  const extension = filename.includes('.') ? '.' + filename.split('.').pop() : '';

  // 二重拡張子（例: document.pdf.exe）
  const parts = filename.split('.');
  if (parts.length > 2) {
    const lastExt = '.' + parts[parts.length - 1];
    if (DANGEROUS_EXTENSIONS.includes(lastExt)) {
      issues.push('二重拡張子（隠された実行ファイル）');
      risk = 'dangerous';
    }
  }

  // 危険な拡張子
  if (DANGEROUS_EXTENSIONS.includes(extension)) {
    issues.push('実行可能ファイル');
    risk = 'dangerous';
  }

  // マクロ付きOffice
  if (MACRO_EXTENSIONS.includes(extension)) {
    issues.push('マクロ有効ファイル');
    risk = 'warning';
  }

  // 圧縮ファイル
  if (ARCHIVE_EXTENSIONS.includes(extension)) {
    issues.push('圧縮ファイル（中身の確認推奨）');
    if (risk === 'safe') risk = 'warning';
  }

  // 危険なMIMEタイプ
  if (DANGEROUS_MIMETYPES.includes(mimeType)) {
    issues.push('危険なファイル形式');
    risk = 'dangerous';
  }

  // 拡張子とMIMEタイプの不一致
  if (extension === '.pdf' && !mimeType.includes('pdf')) {
    issues.push('拡張子とファイル形式の不一致');
    risk = 'warning';
  }
  if (extension === '.docx' && !mimeType.includes('word') && !mimeType.includes('document')) {
    issues.push('拡張子とファイル形式の不一致');
    risk = 'warning';
  }

  // 長すぎるファイル名（UIでの切り詰めを狙った攻撃）
  if (filename.length > 100) {
    issues.push('異常に長いファイル名');
    if (risk === 'safe') risk = 'warning';
  }

  // Unicode文字を含むファイル名（ASCII範囲外の文字をチェック）
  // eslint-disable-next-line no-control-regex
  if (/[^\x00-\x7F]/.test(filename) && !/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(filename)) {
    // 日本語は許可、それ以外のUnicodeは警告
    issues.push('特殊文字を含むファイル名');
    if (risk === 'safe') risk = 'warning';
  }

  return { filename: attachment.filename, mimeType: attachment.mimeType, issues, risk };
}

/**
 * 全添付ファイルのリスクを分析
 */
export function analyzeAllAttachments(attachments: Attachment[]): AttachmentRisk[] {
  const results = attachments.map(analyzeAttachment);

  // 危険度でソート
  const riskOrder = { dangerous: 0, warning: 1, safe: 2 };
  results.sort((a, b) => riskOrder[a.risk] - riskOrder[b.risk]);

  return results;
}

// ========================================
// BEC（ビジネスメール詐欺）パターン検出
// ========================================

export interface BECIndicator {
  pattern: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  matchedText?: string;
}

// BECの典型的なパターン（日本語・英語）
const BEC_PATTERNS: { pattern: RegExp; name: string; description: string; severity: 'low' | 'medium' | 'high' }[] = [
  // 緊急性を煽る
  { pattern: /至急|緊急|急ぎ|今すぐ|直ちに|urgent|immediately|asap|right away/i, name: '緊急性の強調', description: '緊急性を煽って判断を急がせる手法', severity: 'medium' },

  // 振込・送金関連
  { pattern: /振込|送金|入金|振替|wire transfer|bank transfer|remittance/i, name: '送金要求', description: '金銭の送金を要求', severity: 'high' },
  { pattern: /振込先.*(変更|変わ)|口座.*(変更|変わ)|account.*(change|update)/i, name: '振込先変更', description: '振込先の変更を依頼（典型的なBEC手法）', severity: 'high' },

  // 権威を利用
  { pattern: /社長|CEO|代表|取締役|部長|president|director|executive/i, name: '権威者の名前', description: '上位者を騙る可能性', severity: 'medium' },
  { pattern: /(社長|CEO|代表).*から|from.*(CEO|president|director)/i, name: '経営層からの依頼', description: '経営層を装った依頼（CEO詐欺）', severity: 'high' },

  // 秘密・機密
  { pattern: /内密|極秘|秘密|機密|confidential|private|secret|do not share/i, name: '秘密保持の要求', description: '他者に相談させない手法', severity: 'medium' },
  { pattern: /(誰|他).*(言|話|相談).*(ない|禁止)|don't tell|keep.*between/i, name: '口止め', description: '他者への相談を禁止', severity: 'high' },

  // 請求書・支払い
  { pattern: /請求書|invoice|payment.*due|支払.*(期限|期日)/i, name: '請求書関連', description: '請求書や支払いに関する内容', severity: 'medium' },

  // ギフトカード
  { pattern: /ギフトカード|gift card|iTunes|Amazon.*カード|Google Play.*カード/i, name: 'ギフトカード要求', description: 'ギフトカードでの支払い要求（典型的な詐欺手法）', severity: 'high' },

  // 個人情報要求
  { pattern: /パスワード|password|暗証番号|PIN|ログイン情報|credentials/i, name: '認証情報の要求', description: 'パスワードや認証情報の要求', severity: 'high' },
  { pattern: /(確認|verify).*(アカウント|account|情報|information)/i, name: 'アカウント確認要求', description: 'アカウント情報の確認を装う', severity: 'medium' },

  // アクション要求
  { pattern: /クリック.*(ここ|リンク|URL)|click.*here|click.*link|click.*button/i, name: 'クリック誘導', description: 'リンクのクリックを促す', severity: 'low' },
  { pattern: /添付.*開|開.*添付|open.*attach|download.*attach/i, name: '添付ファイル開封誘導', description: '添付ファイルを開かせる誘導', severity: 'medium' },
];

/**
 * BECパターンを検出
 */
export function detectBECPatterns(email: ParsedEmail): BECIndicator[] {
  const indicators: BECIndicator[] = [];
  const searchText = [
    email.subject ?? '',
    email.text ?? '',
    // HTMLタグを除去したテキストも検索
    email.html?.replace(/<[^>]*>/g, ' ') ?? '',
  ].join(' ');

  for (const { pattern, name, description, severity } of BEC_PATTERNS) {
    const match = searchText.match(pattern);
    if (match) {
      indicators.push({
        pattern: name,
        description,
        severity,
        matchedText: match[0],
      });
    }
  }

  // 複数の高リスクパターンが見つかった場合は追加警告
  const highRiskCount = indicators.filter(i => i.severity === 'high').length;
  if (highRiskCount >= 2) {
    indicators.unshift({
      pattern: '複合リスク',
      description: '複数の高リスクパターンが検出されました。特に注意が必要です。',
      severity: 'high',
    });
  }

  // 重複を除去
  const seen = new Set<string>();
  return indicators.filter(i => {
    if (seen.has(i.pattern)) return false;
    seen.add(i.pattern);
    return true;
  });
}

// ========================================
// TLS経路チェック
// ========================================

export interface TLSHop {
  from: string;
  to: string;
  timestamp?: string;
  encrypted: boolean;
  protocol?: string;
}

/**
 * ReceivedヘッダーからTLS使用状況を抽出
 */
export function analyzeTLSPath(headers: Header[]): TLSHop[] {
  const receivedHeaders = headers.filter(h => h.key.toLowerCase() === 'received');
  const hops: TLSHop[] = [];

  for (const header of receivedHeaders) {
    const value = header.value;

    // from と by を抽出
    const fromMatch = value.match(/from\s+([^\s(]+)/i);
    const byMatch = value.match(/by\s+([^\s(]+)/i);

    // TLS/暗号化の検出
    const encrypted = /with\s+(ESMTPS|TLS|SSL)|using\s+TLS|cipher/i.test(value);

    // プロトコル抽出
    const protocolMatch = value.match(/with\s+(ESMTP[SA]?|SMTP[SA]?|HTTP[S]?|LMTP)/i);

    // タイムスタンプ抽出
    const dateMatch = value.match(/;\s*(.+)$/);

    hops.push({
      from: fromMatch?.[1] ?? 'unknown',
      to: byMatch?.[1] ?? 'unknown',
      timestamp: dateMatch?.[1]?.trim(),
      encrypted,
      protocol: protocolMatch?.[1]?.toUpperCase(),
    });
  }

  // Receivedヘッダーは逆順（最新が最初）なので反転
  return hops.reverse();
}

/**
 * TLS経路の安全性サマリー
 */
export function getTLSSummary(hops: TLSHop[]): {
  totalHops: number;
  encryptedHops: number;
  unencryptedHops: TLSHop[];
  risk: 'safe' | 'warning' | 'danger';
} {
  const encryptedHops = hops.filter(h => h.encrypted).length;
  const unencryptedHops = hops.filter(h => !h.encrypted);

  let risk: 'safe' | 'warning' | 'danger' = 'safe';
  if (unencryptedHops.length > 0) {
    risk = unencryptedHops.length > hops.length / 2 ? 'danger' : 'warning';
  }

  return {
    totalHops: hops.length,
    encryptedHops,
    unencryptedHops,
    risk,
  };
}

// ========================================
// 総合セキュリティスコア
// ========================================

export interface SecurityScore {
  score: number; // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  factors: {
    category: string;
    score: number;
    maxScore: number;
    issues: string[];
  }[];
}

/**
 * 総合セキュリティスコアを計算
 */
export function calculateSecurityScore(
  email: ParsedEmail,
  authResults: { spf?: string; dkim?: string; dmarc?: string } | null,
  fromDomain: string | null
): SecurityScore {
  const factors: SecurityScore['factors'] = [];

  // 1. 認証結果（30点満点）
  let authScore = 30;
  const authIssues: string[] = [];
  if (!authResults) {
    authScore = 0;
    authIssues.push('認証ヘッダーなし');
  } else {
    if (authResults.spf !== 'pass') {
      authScore -= 10;
      authIssues.push(`SPF: ${authResults.spf ?? 'none'}`);
    }
    if (authResults.dkim !== 'pass') {
      authScore -= 10;
      authIssues.push(`DKIM: ${authResults.dkim ?? 'none'}`);
    }
    if (authResults.dmarc !== 'pass') {
      authScore -= 10;
      authIssues.push(`DMARC: ${authResults.dmarc ?? 'none'}`);
    }
  }
  factors.push({ category: 'メール認証', score: Math.max(0, authScore), maxScore: 30, issues: authIssues });

  // 2. ドメイン信頼性（20点満点）
  let domainScore = 20;
  const domainIssues: string[] = [];
  if (fromDomain) {
    const lookalike = detectLookalikeDomain(fromDomain);
    if (lookalike) {
      domainScore -= lookalike.risk === 'high' ? 20 : lookalike.risk === 'medium' ? 15 : 10;
      domainIssues.push(`偽装ドメインの疑い（${lookalike.similarTo}に類似）`);
    }
  } else {
    domainScore = 0;
    domainIssues.push('送信元ドメイン不明');
  }
  factors.push({ category: 'ドメイン', score: Math.max(0, domainScore), maxScore: 20, issues: domainIssues });

  // 3. リンク安全性（20点満点）
  const links = analyzeAllLinks(email);
  let linkScore = 20;
  const linkIssues: string[] = [];
  const dangerousLinks = links.filter(l => l.risk === 'dangerous').length;
  const suspiciousLinks = links.filter(l => l.risk === 'suspicious').length;
  if (dangerousLinks > 0) {
    linkScore -= Math.min(20, dangerousLinks * 10);
    linkIssues.push(`危険なリンク: ${dangerousLinks}件`);
  }
  if (suspiciousLinks > 0) {
    linkScore -= Math.min(10, suspiciousLinks * 5);
    linkIssues.push(`疑わしいリンク: ${suspiciousLinks}件`);
  }
  factors.push({ category: 'リンク', score: Math.max(0, linkScore), maxScore: 20, issues: linkIssues });

  // 4. 添付ファイル（15点満点）
  const attachments = analyzeAllAttachments(email.attachments);
  let attachScore = 15;
  const attachIssues: string[] = [];
  const dangerousAttach = attachments.filter(a => a.risk === 'dangerous').length;
  const warningAttach = attachments.filter(a => a.risk === 'warning').length;
  if (dangerousAttach > 0) {
    attachScore -= Math.min(15, dangerousAttach * 15);
    attachIssues.push(`危険な添付: ${dangerousAttach}件`);
  }
  if (warningAttach > 0) {
    attachScore -= Math.min(10, warningAttach * 5);
    attachIssues.push(`要注意の添付: ${warningAttach}件`);
  }
  factors.push({ category: '添付ファイル', score: Math.max(0, attachScore), maxScore: 15, issues: attachIssues });

  // 5. BECパターン（15点満点）
  const becIndicators = detectBECPatterns(email);
  let becScore = 15;
  const becIssues: string[] = [];
  const highBEC = becIndicators.filter(i => i.severity === 'high').length;
  const mediumBEC = becIndicators.filter(i => i.severity === 'medium').length;
  if (highBEC > 0) {
    becScore -= Math.min(15, highBEC * 8);
    becIssues.push(`高リスクパターン: ${highBEC}件`);
  }
  if (mediumBEC > 0) {
    becScore -= Math.min(10, mediumBEC * 3);
    becIssues.push(`中リスクパターン: ${mediumBEC}件`);
  }
  factors.push({ category: '詐欺パターン', score: Math.max(0, becScore), maxScore: 15, issues: becIssues });

  // 総合スコア計算
  const totalScore = factors.reduce((sum, f) => sum + f.score, 0);

  // グレード判定
  let grade: SecurityScore['grade'];
  if (totalScore >= 90) grade = 'A';
  else if (totalScore >= 75) grade = 'B';
  else if (totalScore >= 60) grade = 'C';
  else if (totalScore >= 40) grade = 'D';
  else grade = 'F';

  return { score: totalScore, grade, factors };
}
