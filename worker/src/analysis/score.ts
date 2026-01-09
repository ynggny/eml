/**
 * 総合セキュリティスコア計算モジュール
 */

import type {
  SecurityScoreResult,
  SecurityFactor,
  LinkAnalysisResult,
  AttachmentAnalysisResult,
  BECIndicator,
  TLSAnalysisResult,
  DKIMVerificationResult,
  ARCVerificationResult,
  DomainAnalysisResult,
  HeaderConsistencyResult,
} from './types';

// スコア配分（合計100点）
const SCORE_WEIGHTS = {
  authentication: 25,    // メール認証（SPF/DKIM/DMARC）
  dkim: 15,             // DKIM署名検証
  domain: 15,           // ドメイン信頼性
  links: 15,            // リンク安全性
  attachments: 10,      // 添付ファイル
  bec: 10,              // BECパターン
  tls: 5,               // TLS経路
  headerConsistency: 5, // ヘッダー整合性
};

/**
 * 認証結果スコアを計算
 */
function calculateAuthenticationScore(
  authResults: { spf?: string; dkim?: string; dmarc?: string } | undefined
): SecurityFactor {
  let score = SCORE_WEIGHTS.authentication;
  const issues: string[] = [];

  if (!authResults) {
    return {
      category: 'メール認証',
      score: 0,
      maxScore: SCORE_WEIGHTS.authentication,
      weight: 1,
      issues: ['認証ヘッダーがありません'],
    };
  }

  // SPF
  if (authResults.spf !== 'pass') {
    score -= 8;
    issues.push(`SPF: ${authResults.spf ?? 'none'}`);
  }

  // DKIM
  if (authResults.dkim !== 'pass') {
    score -= 8;
    issues.push(`DKIM: ${authResults.dkim ?? 'none'}`);
  }

  // DMARC
  if (authResults.dmarc !== 'pass') {
    score -= 9;
    issues.push(`DMARC: ${authResults.dmarc ?? 'none'}`);
  }

  return {
    category: 'メール認証',
    score: Math.max(0, score),
    maxScore: SCORE_WEIGHTS.authentication,
    weight: 1,
    issues,
  };
}

/**
 * DKIM検証スコアを計算
 */
function calculateDKIMScore(dkim: DKIMVerificationResult): SecurityFactor {
  let score = SCORE_WEIGHTS.dkim;
  const issues = [...dkim.details.issues];

  if (dkim.status === 'none') {
    score = 0;
    issues.push('DKIM署名がありません');
  } else if (dkim.status !== 'pass') {
    score = 0;
    if (!issues.includes('署名が無効です')) {
      issues.push('DKIM署名の検証に失敗しました');
    }
  } else {
    // passでも減点対象あり
    if (dkim.details.bodyHashAlgorithm === 'sha1') {
      score -= 5;
    }
    if (dkim.details.keySize && dkim.details.keySize < 2048) {
      score -= 3;
    }
  }

  return {
    category: 'DKIM署名',
    score: Math.max(0, score),
    maxScore: SCORE_WEIGHTS.dkim,
    weight: 1,
    issues,
    details: {
      status: dkim.status,
      domain: dkim.domain,
      algorithm: dkim.algorithm,
    },
  };
}

/**
 * ドメインスコアを計算
 */
function calculateDomainScore(domain: DomainAnalysisResult | null): SecurityFactor {
  if (!domain) {
    return {
      category: 'ドメイン',
      score: 0,
      maxScore: SCORE_WEIGHTS.domain,
      weight: 1,
      issues: ['送信元ドメインが不明です'],
    };
  }

  let score = SCORE_WEIGHTS.domain;
  const issues: string[] = [];

  if (domain.isSuspicious) {
    const deduction = domain.risk === 'high' ? 15 : domain.risk === 'medium' ? 10 : 5;
    score -= deduction;
    issues.push(`偽装ドメインの疑い（${domain.similarTo}に類似、${domain.similarity}%）`);
    issues.push(`検出手法: ${domain.techniques.join(', ')}`);
  }

  if (domain.isIDN && domain.scripts && domain.scripts.length > 1) {
    score -= 5;
    issues.push(`IDNドメインで複数のスクリプトを使用: ${domain.scripts.join(', ')}`);
  }

  return {
    category: 'ドメイン',
    score: Math.max(0, score),
    maxScore: SCORE_WEIGHTS.domain,
    weight: 1,
    issues,
    details: {
      domain: domain.domain,
      isIDN: domain.isIDN,
      similarTo: domain.similarTo,
    },
  };
}

/**
 * リンクスコアを計算
 */
function calculateLinkScore(links: LinkAnalysisResult[]): SecurityFactor {
  let score = SCORE_WEIGHTS.links;
  const issues: string[] = [];

  const dangerous = links.filter(l => l.risk === 'dangerous');
  const suspicious = links.filter(l => l.risk === 'suspicious');

  if (dangerous.length > 0) {
    score -= Math.min(15, dangerous.length * 8);
    issues.push(`危険なリンク: ${dangerous.length}件`);
    // 最初の危険なリンクの詳細
    const first = dangerous[0];
    if (first.details?.lookalikeDomain) {
      issues.push(`  - ${first.url} (${first.details.lookalikeDomain}に類似)`);
    }
  }

  if (suspicious.length > 0) {
    score -= Math.min(10, suspicious.length * 3);
    issues.push(`疑わしいリンク: ${suspicious.length}件`);
  }

  return {
    category: 'リンク',
    score: Math.max(0, score),
    maxScore: SCORE_WEIGHTS.links,
    weight: 1,
    issues,
    details: {
      total: links.length,
      dangerous: dangerous.length,
      suspicious: suspicious.length,
    },
  };
}

/**
 * 添付ファイルスコアを計算
 */
function calculateAttachmentScore(attachments: AttachmentAnalysisResult[]): SecurityFactor {
  if (attachments.length === 0) {
    return {
      category: '添付ファイル',
      score: SCORE_WEIGHTS.attachments,
      maxScore: SCORE_WEIGHTS.attachments,
      weight: 1,
      issues: [],
    };
  }

  let score = SCORE_WEIGHTS.attachments;
  const issues: string[] = [];

  const dangerous = attachments.filter(a => a.risk === 'dangerous');
  const warning = attachments.filter(a => a.risk === 'warning');

  if (dangerous.length > 0) {
    score -= Math.min(10, dangerous.length * 10);
    issues.push(`危険な添付ファイル: ${dangerous.length}件`);
    for (const att of dangerous.slice(0, 3)) {
      issues.push(`  - ${att.filename}: ${att.issues[0]}`);
    }
  }

  if (warning.length > 0) {
    score -= Math.min(5, warning.length * 2);
    issues.push(`要注意の添付ファイル: ${warning.length}件`);
  }

  return {
    category: '添付ファイル',
    score: Math.max(0, score),
    maxScore: SCORE_WEIGHTS.attachments,
    weight: 1,
    issues,
    details: {
      total: attachments.length,
      dangerous: dangerous.length,
      warning: warning.length,
    },
  };
}

/**
 * BECスコアを計算
 */
function calculateBECScore(bec: BECIndicator[]): SecurityFactor {
  if (bec.length === 0) {
    return {
      category: '詐欺パターン',
      score: SCORE_WEIGHTS.bec,
      maxScore: SCORE_WEIGHTS.bec,
      weight: 1,
      issues: [],
    };
  }

  let score = SCORE_WEIGHTS.bec;
  const issues: string[] = [];

  const high = bec.filter(b => b.severity === 'high');
  const medium = bec.filter(b => b.severity === 'medium');

  if (high.length > 0) {
    score -= Math.min(10, high.length * 5);
    issues.push(`高リスクパターン: ${high.length}件`);
    for (const pattern of high.slice(0, 2)) {
      issues.push(`  - ${pattern.pattern}`);
    }
  }

  if (medium.length > 0) {
    score -= Math.min(5, medium.length * 2);
    issues.push(`中リスクパターン: ${medium.length}件`);
  }

  return {
    category: '詐欺パターン',
    score: Math.max(0, score),
    maxScore: SCORE_WEIGHTS.bec,
    weight: 1,
    issues,
    details: {
      high: high.length,
      medium: medium.length,
      categories: [...new Set(bec.map(b => b.category))],
    },
  };
}

/**
 * TLSスコアを計算
 */
function calculateTLSScore(tls: TLSAnalysisResult): SecurityFactor {
  let score = SCORE_WEIGHTS.tls;
  const issues: string[] = [];

  if (tls.risk === 'danger') {
    score = 0;
    issues.push('複数のホップが暗号化されていません');
  } else if (tls.risk === 'warning') {
    score -= 3;
    issues.push(`${tls.unencryptedHops.length}個のホップが暗号化されていません`);
  }

  return {
    category: 'TLS経路',
    score: Math.max(0, score),
    maxScore: SCORE_WEIGHTS.tls,
    weight: 1,
    issues,
    details: {
      totalHops: tls.totalHops,
      encryptedHops: tls.encryptedHops,
    },
  };
}

/**
 * ヘッダー整合性スコアを計算
 */
function calculateHeaderConsistencyScore(headerConsistency: HeaderConsistencyResult): SecurityFactor {
  let score = SCORE_WEIGHTS.headerConsistency;
  const issues = [...headerConsistency.issues];

  if (!headerConsistency.returnPathMatch) {
    score -= 2;
  }

  if (!headerConsistency.replyToMatch) {
    score -= 2;
  }

  if (!headerConsistency.dateValid) {
    score -= 1;
  }

  return {
    category: 'ヘッダー整合性',
    score: Math.max(0, score),
    maxScore: SCORE_WEIGHTS.headerConsistency,
    weight: 1,
    issues,
  };
}

/**
 * グレードを判定
 */
function calculateGrade(score: number): SecurityScoreResult['grade'] {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

/**
 * 判定メッセージを生成
 */
function getVerdict(score: number, factors: SecurityFactor[]): {
  verdict: SecurityScoreResult['verdict'];
  summary: string;
} {
  // 危険な要素があるか確認
  const hasDangerousLinks = factors.some(f =>
    f.category === 'リンク' && (f.details?.dangerous as number) > 0
  );
  const hasDangerousAttachments = factors.some(f =>
    f.category === '添付ファイル' && (f.details?.dangerous as number) > 0
  );
  const hasHighBEC = factors.some(f =>
    f.category === '詐欺パターン' && (f.details?.high as number) > 0
  );
  const hasDKIMFail = factors.some(f =>
    f.category === 'DKIM署名' && f.details?.status === 'fail'
  );

  // 危険フラグがあれば強制的に危険判定
  if (hasDangerousLinks || hasDangerousAttachments || (hasHighBEC && score < 60)) {
    return {
      verdict: 'danger',
      summary: 'このメールには危険な要素が含まれています。リンクのクリックや添付ファイルの開封は避けてください。',
    };
  }

  if (score >= 90) {
    return {
      verdict: 'safe',
      summary: 'このメールは安全と判断されます。認証も正常で、危険な要素は検出されませんでした。',
    };
  }

  if (score >= 75) {
    return {
      verdict: 'caution',
      summary: 'このメールは概ね安全ですが、いくつかの注意点があります。詳細を確認してください。',
    };
  }

  if (score >= 50) {
    return {
      verdict: 'warning',
      summary: 'このメールには注意が必要な要素があります。送信者の確認を推奨します。',
    };
  }

  return {
    verdict: 'danger',
    summary: 'このメールは危険な可能性があります。リンクのクリックや添付ファイルの開封は避けてください。',
  };
}

/**
 * 総合セキュリティスコアを計算
 */
export function calculateSecurityScore(
  authResults: { spf?: string; dkim?: string; dmarc?: string } | undefined,
  dkim: DKIMVerificationResult,
  domain: DomainAnalysisResult | null,
  links: LinkAnalysisResult[],
  attachments: AttachmentAnalysisResult[],
  bec: BECIndicator[],
  tls: TLSAnalysisResult,
  headerConsistency: HeaderConsistencyResult
): SecurityScoreResult {
  // 各要素のスコアを計算
  const factors: SecurityFactor[] = [
    calculateAuthenticationScore(authResults),
    calculateDKIMScore(dkim),
    calculateDomainScore(domain),
    calculateLinkScore(links),
    calculateAttachmentScore(attachments),
    calculateBECScore(bec),
    calculateTLSScore(tls),
    calculateHeaderConsistencyScore(headerConsistency),
  ];

  // 総合スコア計算
  const totalScore = factors.reduce((sum, f) => sum + f.score, 0);
  const grade = calculateGrade(totalScore);
  const { verdict, summary } = getVerdict(totalScore, factors);

  return {
    score: totalScore,
    grade,
    verdict,
    factors,
    summary,
  };
}
