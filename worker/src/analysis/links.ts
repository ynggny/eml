/**
 * リンク安全性分析モジュール
 * - 短縮URL検出
 * - 危険なTLD検出
 * - IPアドレス直接指定検出
 * - 表示テキストとURL不一致検出
 * - Lookalike Domain検出（confusablesと連携）
 */

import type { LinkAnalysisResult } from './types';
import { analyzeConfusables } from '../confusables';

// 短縮URLサービス（網羅的リスト）
const URL_SHORTENERS = new Set([
  // 主要サービス
  'bit.ly', 'bitly.com', 't.co', 'tinyurl.com', 'goo.gl', 'ow.ly',
  'is.gd', 'buff.ly', 'j.mp', 'x.co', 'lnkd.in', 'db.tt',
  // 企業系
  'amzn.to', 'amzn.asia', 'youtu.be', 'fb.me', 'fb.com',
  // その他
  'cutt.ly', 'shorturl.at', 'rb.gy', 'trib.al', 'v.gd',
  'qr.ae', 'adf.ly', 'bc.vc', 'po.st', 'mcaf.ee',
  'soo.gd', 'su.pr', 's2r.co', 'clicky.me', 'budurl.com',
  // 日本系
  'tinyurl.jp', 'p.tl', 'urx.nu', 'urx2.nu', 'urx3.nu',
]);

// 危険なTLD（フィッシングで多用される）
const SUSPICIOUS_TLDS = new Set([
  // 無料/格安TLD
  '.tk', '.ml', '.ga', '.cf', '.gq',
  // 新gTLD（悪用されやすい）
  '.xyz', '.top', '.work', '.click', '.link', '.info', '.online', '.site',
  '.live', '.store', '.tech', '.space', '.website', '.club', '.life',
  '.buzz', '.fun', '.icu', '.monster', '.quest', '.rest', '.surf',
  // ccTLD（規制が緩い）
  '.ws', '.cc', '.su', '.to', '.pw',
]);

// 安全とみなすTLD
const TRUSTED_TLDS = new Set([
  '.com', '.org', '.net', '.edu', '.gov', '.co.jp', '.jp', '.go.jp',
  '.ac.jp', '.or.jp', '.ne.jp', '.gr.jp', '.co.uk', '.de', '.fr',
]);

/**
 * HTMLからリンクを抽出（より堅牢な実装）
 */
export function extractLinksFromHtml(html: string): { url: string; text: string }[] {
  const links: { url: string; text: string }[] = [];

  // <a>タグのhref属性を抽出
  const anchorRegex = /<a\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = anchorRegex.exec(html)) !== null) {
    const url = match[1].trim();
    // HTMLタグを除去してテキストのみ取得
    const text = match[2].replace(/<[^>]*>/g, '').trim();

    // javascript:, mailto:, tel: などは除外
    if (url && !url.startsWith('javascript:') && !url.startsWith('#')) {
      links.push({ url, text });
    }
  }

  // onclick等に埋め込まれたURLも検出
  const onclickRegex = /(?:window\.)?(?:location|open)\s*[=(]\s*["']([^"']+)["']/gi;
  while ((match = onclickRegex.exec(html)) !== null) {
    if (match[1].startsWith('http')) {
      links.push({ url: match[1], text: '[onclick]' });
    }
  }

  return links;
}

/**
 * テキストからURLを抽出
 */
export function extractLinksFromText(text: string): string[] {
  // より正確なURLパターン
  const urlRegex = /https?:\/\/(?:[\w-]+\.)+[\w-]+(?:\/[\w\-.~:/?#[\]@!$&'()*+,;=%]*)?/gi;
  const matches = text.match(urlRegex);
  return matches ?? [];
}

/**
 * TLDを取得
 */
function getTLD(hostname: string): string {
  const parts = hostname.split('.');
  if (parts.length < 2) return '';

  // .co.jp, .go.jp などの2段階TLD対応
  const lastTwo = '.' + parts.slice(-2).join('.');
  if (['.co.jp', '.go.jp', '.ac.jp', '.or.jp', '.ne.jp', '.gr.jp', '.co.uk'].includes(lastTwo)) {
    return lastTwo;
  }
  return '.' + parts[parts.length - 1];
}

/**
 * ドメインがIPアドレスかチェック
 */
function isIPAddress(hostname: string): boolean {
  // IPv4
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)) {
    return true;
  }
  // IPv6 (brackets含む)
  if (/^\[?[0-9a-fA-F:]+\]?$/.test(hostname)) {
    return true;
  }
  return false;
}

/**
 * URLエンコードされたURLをデコード
 */
function decodeURLSafely(url: string): string {
  try {
    // 二重エンコードも考慮
    let decoded = url;
    let prev = '';
    while (decoded !== prev && decoded.includes('%')) {
      prev = decoded;
      decoded = decodeURIComponent(decoded);
    }
    return decoded;
  } catch {
    return url;
  }
}

/**
 * 単一リンクを分析
 */
export function analyzeLink(url: string, displayText?: string): LinkAnalysisResult {
  const issues: string[] = [];
  let risk: 'safe' | 'suspicious' | 'dangerous' = 'safe';

  // URLをデコード
  const decodedUrl = decodeURLSafely(url);

  try {
    const parsedUrl = new URL(decodedUrl);
    const hostname = parsedUrl.hostname.toLowerCase();
    const tld = getTLD(hostname);

    const details: LinkAnalysisResult['details'] = {
      hostname,
      protocol: parsedUrl.protocol,
      isShortened: false,
      isSuspiciousTLD: false,
      isIPAddress: false,
    };

    // 1. 短縮URL検出
    if (URL_SHORTENERS.has(hostname) || URL_SHORTENERS.has(hostname.replace('www.', ''))) {
      issues.push('短縮URL（リダイレクト先を確認できません）');
      risk = 'suspicious';
      details.isShortened = true;
    }

    // 2. 危険なTLD検出
    if (SUSPICIOUS_TLDS.has(tld)) {
      issues.push(`疑わしいTLD (${tld})`);
      risk = 'suspicious';
      details.isSuspiciousTLD = true;
    }

    // 3. IPアドレス直接指定
    if (isIPAddress(hostname)) {
      issues.push('IPアドレスへの直接リンク');
      risk = 'suspicious';
      details.isIPAddress = true;

      // プライベートIPの場合はさらに警告
      if (/^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(hostname)) {
        issues.push('プライベートIPアドレス');
        risk = 'dangerous';
      }
    }

    // 4. 過度なサブドメイン
    const subdomains = hostname.split('.');
    if (subdomains.length > 5) {
      issues.push(`過度なサブドメイン (${subdomains.length}層)`);
      risk = 'suspicious';
    }

    // 5. 非標準ポート
    if (parsedUrl.port && !['80', '443', '8080', '8443'].includes(parsedUrl.port)) {
      issues.push(`非標準ポート (:${parsedUrl.port})`);
      if (risk === 'safe') risk = 'suspicious';
    }

    // 6. HTTPSでない
    if (parsedUrl.protocol === 'http:') {
      issues.push('暗号化されていない接続 (HTTP)');
      if (risk === 'safe') risk = 'suspicious';
    }

    // 7. データURL
    if (parsedUrl.protocol === 'data:') {
      issues.push('データURL（悪意のあるコードを含む可能性）');
      risk = 'dangerous';
    }

    // 8. Lookalike Domain検出（Worker側のconfusables使用）
    const confusableResult = analyzeConfusables(hostname);
    const isSuspicious = confusableResult.risk !== 'none';
    if (isSuspicious && confusableResult.matchedDomain) {
      details.lookalikeDomain = confusableResult.matchedDomain;
      issues.push(`偽装ドメインの疑い（${confusableResult.matchedDomain}に類似、${confusableResult.similarity}%）`);

      if (confusableResult.techniques.includes('ホモグラフ文字') ||
          confusableResult.techniques.includes('IDN偽装') ||
          confusableResult.techniques.some(t => t.includes('混合スクリプト'))) {
        risk = 'dangerous';
      } else {
        risk = risk === 'safe' ? 'suspicious' : risk;
      }
    }

    // 9. 表示テキストとURLの不一致（最も危険なパターン）
    if (displayText) {
      const textLower = displayText.toLowerCase().trim();

      // 表示テキストがURLっぽい場合
      if (textLower.includes('http') || textLower.includes('www') ||
          /\.[a-z]{2,}(\/|$)/i.test(textLower)) {
        try {
          let textUrl: URL;
          if (textLower.startsWith('http')) {
            textUrl = new URL(textLower);
          } else {
            textUrl = new URL(`https://${textLower.replace(/^www\./, '')}`);
          }

          // ホスト名が異なる場合
          if (textUrl.hostname.replace('www.', '') !== hostname.replace('www.', '')) {
            issues.push(`表示URL (${textUrl.hostname}) と実際のURL (${hostname}) が異なります`);
            risk = 'dangerous';
          }
        } catch {
          // パースできない場合は無視
        }
      }

      // 有名ブランド名を含むが、実際のドメインと一致しない
      const brandPatterns = [
        { name: 'Google', domains: ['google.com', 'google.co.jp', 'googleapis.com'] },
        { name: 'Amazon', domains: ['amazon.com', 'amazon.co.jp', 'amazonaws.com'] },
        { name: 'Microsoft', domains: ['microsoft.com', 'live.com', 'outlook.com'] },
        { name: 'Apple', domains: ['apple.com', 'icloud.com'] },
        { name: 'PayPal', domains: ['paypal.com'] },
        { name: '楽天', domains: ['rakuten.co.jp', 'rakuten.com'] },
      ];

      for (const brand of brandPatterns) {
        if (textLower.includes(brand.name.toLowerCase())) {
          const isRealBrand = brand.domains.some(d => hostname.endsWith(d));
          if (!isRealBrand) {
            issues.push(`表示テキストに「${brand.name}」を含むが、実際のドメインは ${hostname}`);
            risk = 'dangerous';
            break;
          }
        }
      }
    }

    // 10. 疑わしいパスパターン
    const path = parsedUrl.pathname.toLowerCase();
    const suspiciousPathPatterns = [
      { pattern: /\/login|\/signin|\/account/i, desc: 'ログインページを装う可能性' },
      { pattern: /\/verify|\/confirm|\/validate/i, desc: '認証ページを装う可能性' },
      { pattern: /\/password|\/reset/i, desc: 'パスワードリセットを装う可能性' },
      { pattern: /\/update|\/upgrade/i, desc: 'アカウント更新を装う可能性' },
      { pattern: /\.php\?.*=/i, desc: '動的パラメータ付きPHP' },
    ];

    for (const { pattern, desc } of suspiciousPathPatterns) {
      if (pattern.test(path) && !TRUSTED_TLDS.has(tld)) {
        issues.push(desc);
        if (risk === 'safe') risk = 'suspicious';
        break;
      }
    }

    return { url, displayText, issues, risk, details };

  } catch {
    issues.push('無効なURL形式');
    return { url, displayText, issues, risk: 'dangerous' };
  }
}

/**
 * メール内の全リンクを分析
 */
export function analyzeAllLinks(
  html: string | undefined,
  text: string | undefined
): LinkAnalysisResult[] {
  const results: LinkAnalysisResult[] = [];
  const analyzedUrls = new Set<string>();

  // HTMLからリンク抽出・分析
  if (html) {
    const htmlLinks = extractLinksFromHtml(html);
    for (const link of htmlLinks) {
      const normalizedUrl = link.url.toLowerCase();
      if (!analyzedUrls.has(normalizedUrl)) {
        analyzedUrls.add(normalizedUrl);
        results.push(analyzeLink(link.url, link.text));
      }
    }
  }

  // テキストからURL抽出・分析
  if (text) {
    const textUrls = extractLinksFromText(text);
    for (const url of textUrls) {
      const normalizedUrl = url.toLowerCase();
      if (!analyzedUrls.has(normalizedUrl)) {
        analyzedUrls.add(normalizedUrl);
        results.push(analyzeLink(url));
      }
    }
  }

  // 危険度でソート
  const riskOrder = { dangerous: 0, suspicious: 1, safe: 2 };
  results.sort((a, b) => riskOrder[a.risk] - riskOrder[b.risk]);

  return results;
}
