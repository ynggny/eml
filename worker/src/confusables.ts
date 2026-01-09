/**
 * Unicode Confusables (UTS39) に基づくホモグラフ検出
 *
 * Unicode Technical Standard #39 のconfusables.txtデータを基に、
 * 視覚的に類似した文字を検出してドメインの偽装を判定する
 */

// 有名ドメインリスト（フィッシングターゲット）
const WELL_KNOWN_DOMAINS = [
  'google.com', 'gmail.com', 'youtube.com', 'google.co.jp',
  'amazon.com', 'amazon.co.jp', 'aws.amazon.com',
  'microsoft.com', 'outlook.com', 'office.com', 'live.com', 'office365.com',
  'apple.com', 'icloud.com', 'apple.co.jp',
  'facebook.com', 'instagram.com', 'whatsapp.com', 'meta.com',
  'twitter.com', 'x.com',
  'paypal.com',
  'netflix.com',
  'linkedin.com',
  'dropbox.com',
  'adobe.com',
  'yahoo.com', 'yahoo.co.jp',
  'rakuten.co.jp', 'rakuten.com',
  'line.me',
  'mercari.com', 'mercari.jp',
  'docomo.ne.jp',
  'softbank.jp',
  'au.com', 'kddi.com',
  'github.com', 'gitlab.com',
  'slack.com',
  'zoom.us',
  'salesforce.com',
  'stripe.com',
  'coinbase.com', 'binance.com',
];

// Unicode Confusables マッピング（UTS39ベース、拡張版）
// キー: ASCII文字、値: 類似文字の配列
const CONFUSABLES: Record<string, string[]> = {
  // Latin letters with Cyrillic/Greek/other script lookalikes
  'a': ['а', 'ɑ', 'α', 'ａ', 'ⓐ', '𝐚', '𝑎', '𝒂', '𝒶', '𝓪', '𝔞', '𝕒', '𝖆', '𝖺', '𝗮', '𝘢', '𝙖', '𝚊'],
  'b': ['Ь', 'ḅ', 'ｂ', 'ⓑ', '𝐛', '𝑏', '𝒃', '𝒷', '𝓫', '𝔟', '𝕓', '𝖇', '𝖻', '𝗯', '𝘣', '𝙗', '𝚋'],
  'c': ['с', 'ⅽ', 'ϲ', 'ᴄ', 'ｃ', 'ⓒ', '𝐜', '𝑐', '𝒄', '𝒸', '𝓬', '𝔠', '𝕔', '𝖈', '𝖼', '𝗰', '𝘤', '𝙘', '𝚌'],
  'd': ['ԁ', 'ⅾ', 'ḋ', 'ｄ', 'ⓓ', '𝐝', '𝑑', '𝒅', '𝒹', '𝓭', '𝔡', '𝕕', '𝖉', '𝖽', '𝗱', '𝘥', '𝙙', '𝚍'],
  'e': ['е', 'ё', 'ҽ', 'ⅇ', 'ｅ', 'ⓔ', '𝐞', '𝑒', '𝒆', 'ℯ', '𝓮', '𝔢', '𝕖', '𝖊', '𝖾', '𝗲', '𝘦', '𝙚', '𝚎'],
  'f': ['ｆ', 'ⓕ', '𝐟', '𝑓', '𝒇', '𝒻', '𝓯', '𝔣', '𝕗', '𝖋', '𝖿', '𝗳', '𝘧', '𝙛', '𝚏'],
  'g': ['ɡ', 'ց', 'ｇ', 'ⓖ', '𝐠', '𝑔', '𝒈', 'ℊ', '𝓰', '𝔤', '𝕘', '𝖌', '𝗀', '𝗴', '𝘨', '𝙜', '𝚐'],
  'h': ['һ', 'ℎ', 'ｈ', 'ⓗ', '𝐡', '𝒉', '𝒽', '𝓱', '𝔥', '𝕙', '𝖍', '𝗁', '𝗵', '𝘩', '𝙝', '𝚑'],
  'i': ['і', 'ⅰ', 'ｉ', 'ⓘ', '𝐢', '𝑖', '𝒊', '𝒾', '𝓲', '𝔦', '𝕚', '𝖎', '𝗂', '𝗶', '𝘪', '𝙞', '𝚒'],
  'j': ['ј', 'ｊ', 'ⓙ', '𝐣', '𝑗', '𝒋', '𝒿', '𝓳', '𝔧', '𝕛', '𝖏', '𝗃', '𝗷', '𝘫', '𝙟', '𝚓'],
  'k': ['κ', 'ｋ', 'ⓚ', '𝐤', '𝑘', '𝒌', '𝓀', '𝓴', '𝔨', '𝕜', '𝖐', '𝗄', '𝗸', '𝘬', '𝙠', '𝚔'],
  'l': ['ⅼ', 'ӏ', 'ｌ', 'ⓛ', '𝐥', '𝑙', '𝒍', '𝓁', '𝓵', '𝔩', '𝕝', '𝖑', '𝗅', '𝗹', '𝘭', '𝙡', '𝚕'],
  'm': ['м', 'ⅿ', 'ｍ', 'ⓜ', '𝐦', '𝑚', '𝒎', '𝓂', '𝓶', '𝔪', '𝕞', '𝖒', '𝗆', '𝗺', '𝘮', '𝙢', '𝚖'],
  'n': ['ո', 'ｎ', 'ⓝ', '𝐧', '𝑛', '𝒏', '𝓃', '𝓷', '𝔫', '𝕟', '𝖓', '𝗇', '𝗻', '𝘯', '𝙣', '𝚗'],
  'o': ['о', 'ο', 'օ', '୦', '٥', 'ｏ', 'ⓞ', '𝐨', '𝑜', '𝒐', 'ℴ', '𝓸', '𝔬', '𝕠', '𝖔', '𝗈', '𝗼', '𝘰', '𝙤', '𝚘'],
  'p': ['р', 'ρ', 'ｐ', 'ⓟ', '𝐩', '𝑝', '𝒑', '𝓅', '𝓹', '𝔭', '𝕡', '𝖕', '𝗉', '𝗽', '𝘱', '𝙥', '𝚙'],
  'q': ['ԛ', 'ｑ', 'ⓠ', '𝐪', '𝑞', '𝒒', '𝓆', '𝓺', '𝔮', '𝕢', '𝖖', '𝗊', '𝗾', '𝘲', '𝙦', '𝚚'],
  'r': ['г', 'ｒ', 'ⓡ', '𝐫', '𝑟', '𝒓', '𝓇', '𝓻', '𝔯', '𝕣', '𝖗', '𝗋', '𝗿', '𝘳', '𝙧', '𝚛'],
  's': ['ѕ', 'ｓ', 'ⓢ', '𝐬', '𝑠', '𝒔', '𝓈', '𝓼', '𝔰', '𝕤', '𝖘', '𝗌', '𝘀', '𝘴', '𝙨', '𝚜'],
  't': ['ｔ', 'ⓣ', '𝐭', '𝑡', '𝒕', '𝓉', '𝓽', '𝔱', '𝕥', '𝖙', '𝗍', '𝘁', '𝘵', '𝙩', '𝚝'],
  'u': ['υ', 'ս', 'ｕ', 'ⓤ', '𝐮', '𝑢', '𝒖', '𝓊', '𝓾', '𝔲', '𝕦', '𝖚', '𝗎', '𝘂', '𝘶', '𝙪', '𝚞'],
  'v': ['ν', 'ⅴ', 'ｖ', 'ⓥ', '𝐯', '𝑣', '𝒗', '𝓋', '𝓿', '𝔳', '𝕧', '𝖛', '𝗏', '𝘃', '𝘷', '𝙫', '𝚟'],
  'w': ['ω', 'ｗ', 'ⓦ', '𝐰', '𝑤', '𝒘', '𝓌', '𝔀', '𝔴', '𝕨', '𝖜', '𝗐', '𝘄', '𝘸', '𝙬', '𝚠'],
  'x': ['х', 'ⅹ', 'ｘ', 'ⓧ', '𝐱', '𝑥', '𝒙', '𝓍', '𝔁', '𝔵', '𝕩', '𝖝', '𝗑', '𝘅', '𝘹', '𝙭', '𝚡'],
  'y': ['у', 'ｙ', 'ⓨ', '𝐲', '𝑦', '𝒚', '𝓎', '𝔂', '𝔶', '𝕪', '𝖞', '𝗒', '𝘆', '𝘺', '𝙮', '𝚢'],
  'z': ['ᴢ', 'ｚ', 'ⓩ', '𝐳', '𝑧', '𝒛', '𝓏', '𝔃', '𝔷', '𝕫', '𝖟', '𝗓', '𝘇', '𝘻', '𝙯', '𝚣'],

  // Numbers
  '0': ['о', 'ο', '୦', '٠', '۰', '０', '⓪', '𝟎', '𝟘', '𝟢', '𝟬', '𝟶'],
  '1': ['ⅰ', 'ı', 'ｌ', '１', '①', '𝟏', '𝟙', '𝟣', '𝟭', '𝟷'],
  '2': ['２', '②', '𝟐', '𝟚', '𝟤', '𝟮', '𝟸'],
  '3': ['３', '③', '𝟑', '𝟛', '𝟥', '𝟯', '𝟹'],
  '4': ['４', '④', '𝟒', '𝟜', '𝟦', '𝟰', '𝟺'],
  '5': ['５', '⑤', '𝟓', '𝟝', '𝟧', '𝟱', '𝟻'],
  '6': ['６', '⑥', '𝟔', '𝟞', '𝟨', '𝟲', '𝟼'],
  '7': ['７', '⑦', '𝟕', '𝟟', '𝟩', '𝟳', '𝟽'],
  '8': ['８', '⑧', '𝟖', '𝟠', '𝟪', '𝟴', '𝟾'],
  '9': ['９', '⑨', '𝟗', '𝟡', '𝟫', '𝟵', '𝟿'],

  // Common punctuation/symbols in domains
  '-': ['‐', '‑', '‒', '–', '—', '⁃', '−', '－'],
  '.': ['．', '。', '·', '⋅', '․'],
};

// 逆引きマップ（confusable → ASCII）を構築
const REVERSE_MAP: Map<string, string> = new Map();
for (const [ascii, confusables] of Object.entries(CONFUSABLES)) {
  for (const c of confusables) {
    REVERSE_MAP.set(c, ascii);
  }
}

// マルチ文字の置換パターン
const MULTI_CHAR_PATTERNS: [string, string][] = [
  ['rn', 'm'],
  ['vv', 'w'],
  ['cl', 'd'],
  ['cI', 'd'],
  ['ci', 'd'],
  ['nn', 'm'],
  ['iii', 'm'],
  ['ii', 'n'],
  ['I1', 'l'],
  ['1l', 'l'],
  ['0o', 'oo'],
  ['o0', 'oo'],
];

export interface ConfusableResult {
  originalDomain: string;
  normalizedDomain: string;
  isIDN: boolean;
  punycode: string | null;
  confusableChars: ConfusableChar[];
  matchedDomain: string | null;
  similarity: number;
  risk: 'none' | 'low' | 'medium' | 'high';
  techniques: string[];
}

export interface ConfusableChar {
  original: string;
  position: number;
  normalized: string;
  script: string;
}

/**
 * 文字のUnicodeスクリプト（文字体系）を推定
 */
function detectScript(char: string): string {
  const code = char.codePointAt(0) ?? 0;

  // Cyrillic
  if ((code >= 0x0400 && code <= 0x04FF) || (code >= 0x0500 && code <= 0x052F)) {
    return 'Cyrillic';
  }
  // Greek
  if ((code >= 0x0370 && code <= 0x03FF) || (code >= 0x1F00 && code <= 0x1FFF)) {
    return 'Greek';
  }
  // Armenian
  if (code >= 0x0530 && code <= 0x058F) {
    return 'Armenian';
  }
  // Mathematical Alphanumeric Symbols
  if (code >= 0x1D400 && code <= 0x1D7FF) {
    return 'Math';
  }
  // Fullwidth
  if (code >= 0xFF00 && code <= 0xFFEF) {
    return 'Fullwidth';
  }
  // Enclosed Alphanumerics
  if (code >= 0x2460 && code <= 0x24FF) {
    return 'Enclosed';
  }
  // Latin Extended
  if ((code >= 0x0100 && code <= 0x024F) || (code >= 0x1E00 && code <= 0x1EFF)) {
    return 'Latin-Extended';
  }
  // Basic Latin (ASCII)
  if (code >= 0x0000 && code <= 0x007F) {
    return 'Latin';
  }

  return 'Other';
}

/**
 * ドメインを正規化（confusable文字をASCIIに変換）
 */
function normalizeDomain(domain: string): { normalized: string; chars: ConfusableChar[] } {
  const chars: ConfusableChar[] = [];
  let normalized = '';

  for (let i = 0; i < domain.length; i++) {
    const char = domain[i];
    const ascii = REVERSE_MAP.get(char);

    if (ascii) {
      chars.push({
        original: char,
        position: i,
        normalized: ascii,
        script: detectScript(char),
      });
      normalized += ascii;
    } else {
      normalized += char.toLowerCase();
    }
  }

  // マルチ文字パターンの適用
  for (const [pattern, replacement] of MULTI_CHAR_PATTERNS) {
    if (normalized.includes(pattern)) {
      normalized = normalized.split(pattern).join(replacement);
    }
  }

  return { normalized, chars };
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
 * IDN（国際化ドメイン名）かどうかをチェック
 */
function isIDN(domain: string): boolean {
  // Punycodeで始まる場合
  if (domain.startsWith('xn--') || domain.includes('.xn--')) {
    return true;
  }
  // 非ASCII文字を含む場合
  // eslint-disable-next-line no-control-regex
  return /[^\x00-\x7F]/.test(domain);
}

/**
 * ドメインをPunycodeに変換（簡易版）
 */
function toPunycode(domain: string): string | null {
  try {
    // Cloudflare WorkersではURL APIが使える
    const url = new URL(`http://${domain}`);
    return url.hostname;
  } catch {
    return null;
  }
}

/**
 * ホモグラフ/コンフュザブル検出のメインエントリ
 */
export function analyzeConfusables(domain: string): ConfusableResult {
  const lowerDomain = domain.toLowerCase();
  const techniques: string[] = [];

  // IDNチェック
  const idn = isIDN(lowerDomain);
  const punycode = idn ? toPunycode(lowerDomain) : null;

  if (idn) {
    techniques.push('IDN（国際化ドメイン名）');
  }

  // 正規化
  const { normalized, chars } = normalizeDomain(lowerDomain);

  if (chars.length > 0) {
    const scripts = [...new Set(chars.map(c => c.script))];
    techniques.push(`混合スクリプト: ${scripts.join(', ')}`);
  }

  // 完全一致チェック
  if (WELL_KNOWN_DOMAINS.includes(normalized)) {
    // 正規化後に有名ドメインと一致 = 偽装の可能性
    if (chars.length > 0 || normalized !== lowerDomain) {
      return {
        originalDomain: domain,
        normalizedDomain: normalized,
        isIDN: idn,
        punycode,
        confusableChars: chars,
        matchedDomain: normalized,
        similarity: 100,
        risk: 'high',
        techniques: [...techniques, 'ホモグラフ攻撃（完全一致）'],
      };
    }
    // 正規ドメイン
    return {
      originalDomain: domain,
      normalizedDomain: normalized,
      isIDN: idn,
      punycode,
      confusableChars: [],
      matchedDomain: normalized,
      similarity: 100,
      risk: 'none',
      techniques: [],
    };
  }

  // 類似度チェック
  let bestMatch: string | null = null;
  let bestSimilarity = 0;

  for (const knownDomain of WELL_KNOWN_DOMAINS) {
    const distance = levenshteinDistance(normalized, knownDomain);
    const maxLen = Math.max(normalized.length, knownDomain.length);
    const similarity = ((maxLen - distance) / maxLen) * 100;

    if (similarity > bestSimilarity && similarity >= 70) {
      bestSimilarity = similarity;
      bestMatch = knownDomain;
    }
  }

  // リスク判定
  let risk: 'none' | 'low' | 'medium' | 'high' = 'none';

  if (chars.length > 0) {
    // confusable文字が含まれている
    if (bestSimilarity >= 90) {
      risk = 'high';
      techniques.push('ホモグラフ攻撃（高類似度）');
    } else if (bestSimilarity >= 80) {
      risk = 'medium';
      techniques.push('類似ドメイン');
    } else if (bestSimilarity >= 70) {
      risk = 'low';
      techniques.push('軽度の類似');
    }
  } else if (bestSimilarity >= 85) {
    // confusable文字はないが類似度が高い（タイポスクワッティング）
    risk = bestSimilarity >= 95 ? 'high' : 'medium';
    techniques.push('タイポスクワッティングの可能性');
  }

  return {
    originalDomain: domain,
    normalizedDomain: normalized,
    isIDN: idn,
    punycode,
    confusableChars: chars,
    matchedDomain: bestMatch,
    similarity: Math.round(bestSimilarity),
    risk,
    techniques,
  };
}

/**
 * 複数ドメインを一括分析
 */
export function analyzeMultipleDomains(domains: string[]): ConfusableResult[] {
  return domains.map(analyzeConfusables);
}
