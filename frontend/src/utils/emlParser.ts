import PostalMime from 'postal-mime';

export interface ParsedEmail {
  from: { address: string; name?: string } | null;
  to: { address: string; name?: string }[] | null;
  subject: string | null;
  date: string | null;
  html: string | null;
  text: string | null;
  attachments: Attachment[];
  headers: Header[];
  rawHeaders: string;
  rawBody: string;
}

export interface Attachment {
  filename: string;
  mimeType: string;
  content: ArrayBuffer | string;
}

export interface Header {
  key: string;
  value: string;
}

/**
 * postal-mimeのAddress型からシンプルなアドレス形式に変換
 * グループアドレス（addressがundefined）は除外
 */
function convertAddress(
  addr: { address?: string; name?: string } | null | undefined
): { address: string; name?: string } | null {
  if (!addr || !addr.address) return null;
  return { address: addr.address, name: addr.name };
}

function convertAddressList(
  addrs: { address?: string; name?: string }[] | null | undefined
): { address: string; name?: string }[] | null {
  if (!addrs) return null;
  const filtered = addrs
    .filter((a): a is { address: string; name?: string } => !!a.address)
    .map((a) => ({ address: a.address, name: a.name }));
  return filtered.length > 0 ? filtered : null;
}

export async function parseEML(emlContent: ArrayBuffer): Promise<ParsedEmail> {
  const parser = new PostalMime();
  const email = await parser.parse(emlContent);

  // rawヘッダーとrawBodyを抽出（ヘッダーと本文は空行で区切られる）
  const emlText = new TextDecoder().decode(emlContent);
  const headerEndMatch = emlText.match(/\r?\n\r?\n/);
  const headerEndIndex = headerEndMatch ? emlText.indexOf(headerEndMatch[0]) : -1;
  const rawHeaders =
    headerEndIndex !== -1 ? emlText.slice(0, headerEndIndex) : emlText;
  // 本文は空行の後から始まる
  const rawBody =
    headerEndIndex !== -1
      ? emlText.slice(headerEndIndex + headerEndMatch![0].length)
      : '';

  return {
    from: convertAddress(email.from),
    to: convertAddressList(email.to),
    subject: email.subject ?? null,
    date: email.date ?? null,
    html: email.html ?? null,
    text: email.text ?? null,
    attachments: email.attachments.map((att) => ({
      filename: att.filename ?? 'unknown',
      mimeType: att.mimeType ?? 'application/octet-stream',
      content: att.content,
    })),
    headers: email.headers.map((h) => ({
      key: h.key,
      value: h.value,
    })),
    rawHeaders,
    rawBody,
  };
}

/**
 * Authentication-Resultsヘッダーをパースする
 */
export function parseAuthResults(
  headers: Header[]
): { spf?: string; dkim?: string; dmarc?: string } | null {
  const authHeader = headers.find(
    (h) => h.key.toLowerCase() === 'authentication-results'
  );

  if (!authHeader) return null;

  const value = authHeader.value.toLowerCase();
  const result: { spf?: string; dkim?: string; dmarc?: string } = {};

  const spfMatch = value.match(/spf=(pass|fail|softfail|neutral|none)/);
  const dkimMatch = value.match(/dkim=(pass|fail|none)/);
  const dmarcMatch = value.match(/dmarc=(pass|fail|none)/);

  if (spfMatch) result.spf = spfMatch[1];
  if (dkimMatch) result.dkim = dkimMatch[1];
  if (dmarcMatch) result.dmarc = dmarcMatch[1];

  return Object.keys(result).length > 0 ? result : null;
}

/**
 * DKIM-Signatureヘッダーからセレクタを抽出する
 */
export function extractDkimSelector(headers: Header[]): string | undefined {
  const dkimHeader = headers.find(
    (h) => h.key.toLowerCase() === 'dkim-signature'
  );

  if (!dkimHeader) return undefined;

  // s=selector の形式で記載されている
  const match = dkimHeader.value.match(/s=([^;\s]+)/);
  return match ? match[1] : undefined;
}

/**
 * メールアドレスからドメインを抽出する
 */
export function extractDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const match = email.match(/@([^@\s>]+)/);
  return match ? match[1] : null;
}
