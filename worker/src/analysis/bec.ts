/**
 * BEC（ビジネスメール詐欺）パターン検出モジュール
 * 日本語・英語の両方に対応した包括的な検出
 */

import type { BECIndicator } from './types';

// BECパターン定義
interface BECPattern {
  pattern: RegExp;
  name: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  category: BECIndicator['category'];
}

const BEC_PATTERNS: BECPattern[] = [
  // ========================================
  // 緊急性を煽るパターン
  // ========================================
  {
    pattern: /至急|緊急|急ぎ|今すぐ|直ちに|urgent|immediately|asap|right\s+away|time.?sensitive|act\s+(now|fast)|don't\s+delay/i,
    name: '緊急性の強調',
    description: '緊急性を煽って冷静な判断を妨げる手法です',
    severity: 'medium',
    category: 'urgency',
  },
  {
    pattern: /本日中|今日中|〇〇時まで|期限.{0,5}(本日|今日|明日)|deadline.*today|by\s+end\s+of\s+(day|business)/i,
    name: '短期期限の設定',
    description: '非常に短い期限を設定して急かす手法です',
    severity: 'medium',
    category: 'urgency',
  },
  {
    pattern: /対応.{0,5}(遅|間に合|できな)|miss.*opportunity|will\s+lose|expire.*soon/i,
    name: '機会損失の示唆',
    description: '対応しないと損をすると脅す手法です',
    severity: 'medium',
    category: 'urgency',
  },

  // ========================================
  // 金銭関連パターン（高リスク）
  // ========================================
  {
    pattern: /振込|送金|入金|振替|wire\s*transfer|bank\s*transfer|remittance|money\s*transfer/i,
    name: '送金要求',
    description: '金銭の送金を要求しています。電話等で確認してください',
    severity: 'high',
    category: 'financial',
  },
  {
    pattern: /(振込先|口座|銀行).{0,10}(変更|変わ|新し)|account.{0,10}(chang|updat|new)|new\s+bank\s+details/i,
    name: '振込先変更',
    description: '振込先の変更は典型的なBEC手法です。必ず電話で確認してください',
    severity: 'high',
    category: 'financial',
  },
  {
    pattern: /請求書|invoice|payment.*due|支払.{0,5}(期限|期日)|outstanding\s+(payment|balance)/i,
    name: '請求書関連',
    description: '請求書や支払いに関する内容です。送信元を確認してください',
    severity: 'medium',
    category: 'financial',
  },
  {
    pattern: /ギフトカード|gift\s*card|iTunes|amazon.{0,5}カード|google\s*play.{0,5}(カード|card)|prepaid\s*card/i,
    name: 'ギフトカード要求',
    description: 'ギフトカードでの支払い要求は典型的な詐欺手法です',
    severity: 'high',
    category: 'financial',
  },
  {
    pattern: /bitcoin|btc|仮想通貨|暗号通貨|cryptocurrency|crypto\s*wallet|ビットコイン/i,
    name: '暗号通貨関連',
    description: '暗号通貨での支払い要求は追跡困難な詐欺の特徴です',
    severity: 'high',
    category: 'financial',
  },
  {
    pattern: /返金|refund|reimbursement|overpayment|払い戻し/i,
    name: '返金・払い戻し',
    description: '返金を装った詐欺の可能性があります',
    severity: 'medium',
    category: 'financial',
  },

  // ========================================
  // 権威を利用するパターン
  // ========================================
  {
    pattern: /(社長|CEO|代表|取締役|部長|課長|manager|director|executive|president).{0,10}(から|より|依頼|指示)|from.*(CEO|president|director|manager)/i,
    name: '経営層からの依頼',
    description: '経営層を装った依頼（CEO詐欺）の可能性があります',
    severity: 'high',
    category: 'authority',
  },
  {
    pattern: /社長|CEO|代表取締役|会長|CFO|COO|CTO|chairman|chief\s*(executive|financial|operating)/i,
    name: '経営層の名前',
    description: '経営層の名前を出して信用させる手法です',
    severity: 'medium',
    category: 'authority',
  },
  {
    pattern: /弁護士|lawyer|attorney|法務|legal\s*department|compliance/i,
    name: '法務関連',
    description: '法的権威を利用した脅迫の可能性があります',
    severity: 'medium',
    category: 'authority',
  },
  {
    pattern: /税務署|国税庁|IRS|tax\s*authority|government|警察|police|検察/i,
    name: '政府機関を装う',
    description: '政府機関を装った詐欺の可能性があります',
    severity: 'high',
    category: 'authority',
  },

  // ========================================
  // 秘密保持パターン
  // ========================================
  {
    pattern: /内密|極秘|秘密|機密|confidential|private|secret|do\s*not\s*share|keep.*between/i,
    name: '秘密保持の要求',
    description: '他者に相談させないための手法です',
    severity: 'medium',
    category: 'secrecy',
  },
  {
    pattern: /(誰|他|上司|同僚).{0,10}(言|話|相談|報告).{0,5}(ない|禁止|しない)|don't\s*(tell|mention|inform)|just\s*between\s*us/i,
    name: '口止め',
    description: '他者への相談を禁止するのは詐欺の典型的手法です',
    severity: 'high',
    category: 'secrecy',
  },
  {
    pattern: /この(メール|件).{0,10}削除|delete\s*this\s*(email|message)|destroy\s*after\s*reading/i,
    name: 'メール削除指示',
    description: '証拠隠滅を図る典型的な手法です',
    severity: 'high',
    category: 'secrecy',
  },

  // ========================================
  // 認証情報要求パターン
  // ========================================
  {
    pattern: /パスワード|password|暗証番号|PIN|secret\s*code|security\s*code/i,
    name: 'パスワード要求',
    description: 'パスワードをメールで要求することは正規の手続きでは行われません',
    severity: 'high',
    category: 'credential',
  },
  {
    pattern: /ログイン(情報|ID|名)|login\s*(info|credentials)|username|user\s*ID|認証情報/i,
    name: 'ログイン情報要求',
    description: 'ログイン情報の要求はフィッシングの可能性が高いです',
    severity: 'high',
    category: 'credential',
  },
  {
    pattern: /(確認|verify|validate|confirm).{0,10}(アカウント|account|情報|identity|身元)/i,
    name: 'アカウント確認要求',
    description: 'アカウント確認を装ったフィッシングの可能性があります',
    severity: 'medium',
    category: 'credential',
  },
  {
    pattern: /SSN|社会保障番号|マイナンバー|身分証|ID\s*card|passport|運転免許/i,
    name: '個人情報要求',
    description: '個人情報の要求は情報窃取の可能性があります',
    severity: 'high',
    category: 'credential',
  },
  {
    pattern: /クレジットカード|credit\s*card|カード番号|CVV|セキュリティコード|expir/i,
    name: 'クレジットカード情報要求',
    description: 'カード情報の要求は詐欺の可能性が極めて高いです',
    severity: 'high',
    category: 'credential',
  },

  // ========================================
  // アクション誘導パターン
  // ========================================
  {
    pattern: /(クリック|click).{0,10}(ここ|here|リンク|link|ボタン|button|URL)/i,
    name: 'クリック誘導',
    description: 'リンクのクリックを促しています。URLを確認してください',
    severity: 'low',
    category: 'action',
  },
  {
    pattern: /(添付|attach).{0,10}(開|open|確認|ダウンロード|download)|open.*attach|download.*attach/i,
    name: '添付ファイル開封誘導',
    description: '添付ファイルを開かせる誘導です。ファイルの安全性を確認してください',
    severity: 'medium',
    category: 'action',
  },
  {
    pattern: /(QR|キューアール).{0,5}(コード|code).{0,10}(スキャン|読|scan)/i,
    name: 'QRコードスキャン誘導',
    description: 'QRコードを使った誘導です。リンク先を確認してください',
    severity: 'medium',
    category: 'action',
  },
  {
    pattern: /電話.{0,10}(ください|して|かけ)|call\s*(me|us|this\s*number)|contact.*phone/i,
    name: '電話誘導',
    description: '電話をかけさせる誘導です。番号が正規のものか確認してください',
    severity: 'medium',
    category: 'action',
  },

  // ========================================
  // 日本特有のパターン
  // ========================================
  {
    pattern: /宝くじ|当選|lottery|prize|winner|抽選|懸賞/i,
    name: '当選詐欺',
    description: '当選を装った詐欺の可能性があります',
    severity: 'high',
    category: 'financial',
  },
  {
    pattern: /相続|遺産|inheritance|estate|大金|巨額/i,
    name: '遺産・相続詐欺',
    description: '遺産相続を装った詐欺（ナイジェリア詐欺）の可能性があります',
    severity: 'high',
    category: 'financial',
  },
  {
    pattern: /助けて|help\s*me|困って|emergency|緊急事態/i,
    name: '緊急援助要求',
    description: '緊急事態を装った詐欺の可能性があります',
    severity: 'medium',
    category: 'urgency',
  },
];

// HTMLタグを除去
function stripHtmlTags(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * BECパターンを検出
 */
export function detectBECPatterns(
  subject: string | undefined,
  text: string | undefined,
  html: string | undefined
): BECIndicator[] {
  const indicators: BECIndicator[] = [];
  const seenPatterns = new Set<string>();

  // 検索対象テキストを結合
  const searchText = [
    subject ?? '',
    text ?? '',
    html ? stripHtmlTags(html) : '',
  ].join(' ');

  // 空の場合はスキップ
  if (!searchText.trim()) {
    return [];
  }

  // 各パターンをチェック
  for (const { pattern, name, description, severity, category } of BEC_PATTERNS) {
    // 既に検出済みのパターンはスキップ
    if (seenPatterns.has(name)) continue;

    const match = searchText.match(pattern);
    if (match) {
      seenPatterns.add(name);
      indicators.push({
        pattern: name,
        description,
        severity,
        matchedText: match[0].substring(0, 100), // 長すぎる場合は切り詰め
        category,
      });
    }
  }

  // 複合リスク判定
  const highRiskCount = indicators.filter(i => i.severity === 'high').length;
  const mediumRiskCount = indicators.filter(i => i.severity === 'medium').length;
  const financialCount = indicators.filter(i => i.category === 'financial').length;
  const secretCount = indicators.filter(i => i.category === 'secrecy').length;

  // 複合リスク警告
  if (highRiskCount >= 2) {
    indicators.unshift({
      pattern: '複合リスク（高）',
      description: '複数の高リスクパターンが検出されました。このメールは非常に危険な可能性があります。',
      severity: 'high',
      category: 'urgency',
    });
  } else if (highRiskCount >= 1 && mediumRiskCount >= 2) {
    indicators.unshift({
      pattern: '複合リスク（中）',
      description: '高リスクパターンと複数の中リスクパターンが検出されました。注意が必要です。',
      severity: 'high',
      category: 'urgency',
    });
  }

  // 金銭 + 秘密保持の組み合わせは特に危険
  if (financialCount >= 1 && secretCount >= 1) {
    const hasCombo = indicators.some(i => i.pattern === '金銭・秘密保持の組み合わせ');
    if (!hasCombo) {
      indicators.unshift({
        pattern: '金銭・秘密保持の組み合わせ',
        description: '送金要求と口止めの組み合わせは、BEC詐欺の最も典型的なパターンです。',
        severity: 'high',
        category: 'financial',
      });
    }
  }

  // 重大度順にソート
  const severityOrder = { high: 0, medium: 1, low: 2 };
  indicators.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return indicators;
}

/**
 * BEC検出結果のサマリーを生成
 */
export function getBECSummary(indicators: BECIndicator[]): {
  riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
  message: string;
  categories: string[];
} {
  if (indicators.length === 0) {
    return {
      riskLevel: 'none',
      message: '詐欺パターンは検出されませんでした',
      categories: [],
    };
  }

  const highCount = indicators.filter(i => i.severity === 'high').length;
  const mediumCount = indicators.filter(i => i.severity === 'medium').length;
  const categories = [...new Set(indicators.map(i => i.category))];

  let riskLevel: 'low' | 'medium' | 'high' | 'critical';
  let message: string;

  if (highCount >= 3 || (highCount >= 2 && mediumCount >= 2)) {
    riskLevel = 'critical';
    message = 'このメールは詐欺メールである可能性が非常に高いです。絶対に指示に従わないでください。';
  } else if (highCount >= 2) {
    riskLevel = 'high';
    message = '複数の危険なパターンが検出されました。送信者に電話等で確認することを強くお勧めします。';
  } else if (highCount >= 1) {
    riskLevel = 'medium';
    message = '危険なパターンが検出されました。慎重に対応してください。';
  } else if (mediumCount >= 2) {
    riskLevel = 'medium';
    message = '注意が必要なパターンが複数検出されました。';
  } else {
    riskLevel = 'low';
    message = '軽微な注意パターンが検出されました。念のため確認してください。';
  }

  return { riskLevel, message, categories };
}
