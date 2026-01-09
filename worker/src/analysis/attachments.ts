/**
 * 添付ファイルリスク分析モジュール
 * - 危険な拡張子検出
 * - マクロ付きファイル検出
 * - 二重拡張子検出
 * - MIMEタイプ不一致検出
 */

import type { EmailAttachment, AttachmentAnalysisResult } from './types';

// 危険な拡張子（実行可能ファイル）
const DANGEROUS_EXTENSIONS = new Set([
  // Windows実行可能
  '.exe', '.scr', '.pif', '.com', '.bat', '.cmd',
  // スクリプト
  '.vbs', '.vbe', '.js', '.jse', '.ws', '.wsf', '.wsc', '.wsh',
  '.ps1', '.psm1', '.psd1', '.ps1xml', '.pssc', '.cdxml',
  // その他危険
  '.msi', '.msp', '.msc', '.dll', '.cpl', '.hta', '.jar',
  '.reg', '.inf', '.lnk', '.scf', '.url', '.application',
  // Linux/Mac実行可能
  '.sh', '.bash', '.zsh', '.csh', '.ksh',
  '.app', '.command', '.action', '.workflow',
  // モバイル
  '.apk', '.ipa', '.dex',
]);

// マクロ付きOfficeファイル
const MACRO_EXTENSIONS = new Set([
  // Word
  '.docm', '.dotm',
  // Excel
  '.xlsm', '.xlsb', '.xltm', '.xlam',
  // PowerPoint
  '.pptm', '.potm', '.ppam', '.ppsm', '.sldm',
  // Access
  '.accdb', '.accde', '.accdr', '.accdt',
  // Publisher
  '.pub',
]);

// 圧縮・アーカイブファイル
const ARCHIVE_EXTENSIONS = new Set([
  '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz',
  '.iso', '.img', '.dmg', '.cab', '.arj', '.lzh', '.ace',
]);

// 危険なMIMEタイプ
const DANGEROUS_MIMETYPES = new Set([
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-executable',
  'application/x-sh',
  'application/x-shellscript',
  'application/x-bat',
  'application/x-msi',
  'application/hta',
  'application/x-javascript',
  'text/javascript',
  'application/javascript',
]);

// 正当な拡張子とMIMEタイプのマッピング
const EXTENSION_MIMETYPE_MAP: Record<string, string[]> = {
  '.pdf': ['application/pdf'],
  '.doc': ['application/msword'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.xls': ['application/vnd.ms-excel'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  '.ppt': ['application/vnd.ms-powerpoint'],
  '.pptx': ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png': ['image/png'],
  '.gif': ['image/gif'],
  '.svg': ['image/svg+xml'],
  '.webp': ['image/webp'],
  '.mp3': ['audio/mpeg'],
  '.mp4': ['video/mp4'],
  '.mov': ['video/quicktime'],
  '.txt': ['text/plain'],
  '.csv': ['text/csv', 'text/plain'],
  '.html': ['text/html'],
  '.xml': ['text/xml', 'application/xml'],
  '.json': ['application/json', 'text/json'],
  '.zip': ['application/zip', 'application/x-zip-compressed'],
};

// ファイルカテゴリ判定
function categorizeFile(extension: string, mimeType: string): AttachmentAnalysisResult['category'] {
  if (DANGEROUS_EXTENSIONS.has(extension)) return 'executable';
  if (MACRO_EXTENSIONS.has(extension)) return 'macro';
  if (ARCHIVE_EXTENSIONS.has(extension)) return 'archive';
  if (mimeType.startsWith('image/')) return 'image';
  if (
    mimeType.includes('document') ||
    mimeType.includes('word') ||
    mimeType.includes('excel') ||
    mimeType.includes('powerpoint') ||
    mimeType.includes('pdf') ||
    mimeType.includes('text/')
  ) return 'document';
  return 'other';
}

/**
 * ファイル名からすべての拡張子を抽出
 */
function extractExtensions(filename: string): string[] {
  const parts = filename.toLowerCase().split('.');
  if (parts.length < 2) return [];

  // 最初の要素はファイル名本体なので除外
  return parts.slice(1).map(ext => '.' + ext);
}

/**
 * Unicode制御文字を検出
 */
function containsUnicodeControlChars(filename: string): boolean {
  // Right-to-Left Override (RLO) などの制御文字
  const dangerousChars = [
    '\u202E', // RLO
    '\u202D', // LRO
    '\u202C', // PDF
    '\u200E', // LRM
    '\u200F', // RLM
    '\u2066', // LRI
    '\u2067', // RLI
    '\u2068', // FSI
    '\u2069', // PDI
    '\u200B', // ZWSP
  ];

  return dangerousChars.some(char => filename.includes(char));
}

/**
 * ファイル名が日本語を含むかチェック
 */
function containsJapanese(text: string): boolean {
  return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(text);
}

/**
 * 単一の添付ファイルを分析
 */
export function analyzeAttachment(attachment: EmailAttachment): AttachmentAnalysisResult {
  const filename = attachment.filename;
  const filenameLower = filename.toLowerCase();
  const mimeType = attachment.mimeType.toLowerCase();
  const issues: string[] = [];
  let risk: 'safe' | 'warning' | 'dangerous' = 'safe';

  // 拡張子を抽出
  const extensions = extractExtensions(filename);
  const lastExtension = extensions[extensions.length - 1] ?? '';

  // カテゴリ判定
  const category = categorizeFile(lastExtension, mimeType);

  // 1. Unicode制御文字検出（最優先：RLO攻撃）
  if (containsUnicodeControlChars(filename)) {
    issues.push('ファイル名にUnicode制御文字を検出（RLO攻撃の可能性）');
    risk = 'dangerous';
  }

  // 2. 二重拡張子検出
  if (extensions.length >= 2) {
    const hiddenExtension = extensions[extensions.length - 1];
    if (DANGEROUS_EXTENSIONS.has(hiddenExtension)) {
      issues.push(`二重拡張子による偽装（実際は ${hiddenExtension} ファイル）`);
      risk = 'dangerous';
    } else if (MACRO_EXTENSIONS.has(hiddenExtension)) {
      issues.push(`二重拡張子による偽装（マクロ付きファイル）`);
      risk = 'dangerous';
    }
  }

  // 3. 危険な拡張子
  if (DANGEROUS_EXTENSIONS.has(lastExtension)) {
    issues.push(`実行可能ファイル (${lastExtension})`);
    risk = 'dangerous';
  }

  // 4. マクロ付きOfficeファイル
  if (MACRO_EXTENSIONS.has(lastExtension)) {
    issues.push(`マクロ有効ファイル (${lastExtension})`);
    if (risk !== 'dangerous') risk = 'warning';
  }

  // 5. 圧縮ファイル
  if (ARCHIVE_EXTENSIONS.has(lastExtension)) {
    issues.push('圧縮ファイル（内容を確認してください）');
    if (risk === 'safe') risk = 'warning';

    // パスワード付きZIPのヒント
    if (lastExtension === '.zip') {
      issues.push('ZIPファイルにはパスワードが設定されている場合があります');
    }
  }

  // 6. 危険なMIMEタイプ
  if (DANGEROUS_MIMETYPES.has(mimeType)) {
    issues.push(`危険なファイル形式 (${mimeType})`);
    risk = 'dangerous';
  }

  // 7. 拡張子とMIMEタイプの不一致
  const expectedMimeTypes = EXTENSION_MIMETYPE_MAP[lastExtension];
  if (expectedMimeTypes && !expectedMimeTypes.some(mt => mimeType.includes(mt.split('/')[1]))) {
    // 完全に異なる場合のみ警告（application/octet-streamは除外）
    if (mimeType !== 'application/octet-stream') {
      issues.push(`拡張子 (${lastExtension}) とMIMEタイプ (${mimeType}) が不一致`);
      if (risk === 'safe') risk = 'warning';
    }
  }

  // 8. 偽装されやすい拡張子の組み合わせ
  const dangerousCombinations = [
    { fake: '.pdf', real: ['.exe', '.scr', '.pif'] },
    { fake: '.jpg', real: ['.exe', '.scr', '.pif'] },
    { fake: '.doc', real: ['.exe', '.scr', '.pif'] },
    { fake: '.txt', real: ['.exe', '.vbs', '.js'] },
  ];

  for (const combo of dangerousCombinations) {
    if (extensions.includes(combo.fake) && extensions.some(e => combo.real.includes(e))) {
      issues.push(`ファイル形式偽装（${combo.fake}を装った実行ファイル）`);
      risk = 'dangerous';
      break;
    }
  }

  // 9. 異常に長いファイル名
  if (filename.length > 150) {
    issues.push(`異常に長いファイル名 (${filename.length}文字)`);
    if (risk === 'safe') risk = 'warning';
  }

  // 10. 特殊文字を含むファイル名（日本語は許可）
  // eslint-disable-next-line no-control-regex
  if (/[^\x00-\x7F]/.test(filename) && !containsJapanese(filename)) {
    // キリル文字など紛らわしい文字を検出
    if (/[\u0400-\u04FF]/.test(filename)) {
      issues.push('キリル文字を含むファイル名（偽装の可能性）');
      if (risk === 'safe') risk = 'warning';
    } else if (/[\u0370-\u03FF]/.test(filename)) {
      issues.push('ギリシャ文字を含むファイル名');
      if (risk === 'safe') risk = 'warning';
    }
  }

  // 11. ファイルサイズの異常
  if (attachment.size === 0) {
    issues.push('ファイルサイズが0バイト');
    if (risk === 'safe') risk = 'warning';
  } else if (attachment.size > 25 * 1024 * 1024) {
    issues.push(`大きなファイル (${Math.round(attachment.size / 1024 / 1024)}MB)`);
  }

  // 12. 一般的なマルウェアファイル名パターン
  const malwarePatterns = [
    { pattern: /^invoice|^payment|^receipt/i, desc: '請求書/支払い関連' },
    { pattern: /^order|^shipment|^delivery/i, desc: '注文/配送関連' },
    { pattern: /^urgent|^important/i, desc: '緊急/重要を装う' },
    { pattern: /^resume|^cv/i, desc: '履歴書を装う' },
    { pattern: /^scan|^document|^doc_/i, desc: 'スキャン文書を装う' },
  ];

  for (const { pattern, desc } of malwarePatterns) {
    if (pattern.test(filenameLower) && (
      DANGEROUS_EXTENSIONS.has(lastExtension) ||
      MACRO_EXTENSIONS.has(lastExtension) ||
      ARCHIVE_EXTENSIONS.has(lastExtension)
    )) {
      issues.push(`マルウェアによくあるファイル名パターン（${desc}）`);
      break;
    }
  }

  return {
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    size: attachment.size,
    issues,
    risk,
    category,
  };
}

/**
 * 全添付ファイルを分析
 */
export function analyzeAllAttachments(attachments: EmailAttachment[]): AttachmentAnalysisResult[] {
  if (attachments.length === 0) {
    return [];
  }

  const results = attachments.map(analyzeAttachment);

  // 危険度でソート
  const riskOrder = { dangerous: 0, warning: 1, safe: 2 };
  results.sort((a, b) => riskOrder[a.risk] - riskOrder[b.risk]);

  return results;
}
