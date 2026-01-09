/**
 * メール認証の検証ロジック
 */

import { getSPFRecord, getDKIMRecord, getDMARCRecord } from './dns';

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

/**
 * DMARCポリシーを抽出
 */
export function extractDMARCPolicy(record: string): string | null {
  const match = record.match(/p=(none|quarantine|reject)/);
  return match ? match[1] : null;
}

/**
 * ドメインのメール認証設定を検証
 */
export async function verifyDomain(
  request: VerifyRequest
): Promise<VerifyResponse> {
  const { domain, dkimSelector } = request;

  const [spfRecord, dmarcRecord, dkimRecord] = await Promise.all([
    getSPFRecord(domain).catch(() => null),
    getDMARCRecord(domain).catch(() => null),
    dkimSelector
      ? getDKIMRecord(dkimSelector, domain).catch(() => null)
      : Promise.resolve(null),
  ]);

  return {
    spf: {
      record: spfRecord,
      exists: spfRecord !== null,
    },
    dkim: {
      record: dkimRecord,
      exists: dkimRecord !== null,
    },
    dmarc: {
      record: dmarcRecord,
      exists: dmarcRecord !== null,
      policy: dmarcRecord ? extractDMARCPolicy(dmarcRecord) : null,
    },
    domain,
  };
}
