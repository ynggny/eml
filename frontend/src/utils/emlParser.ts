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
}

export interface Attachment {
  filename: string;
  mimeType: string;
  content: ArrayBuffer;
}

export interface Header {
  key: string;
  value: string;
}

/**
 * EMLファイルをパースしてメール情報を抽出する
 */
export async function parseEML(emlContent: ArrayBuffer): Promise<ParsedEmail> {
  const parser = new PostalMime();
  const email = await parser.parse(emlContent);

  return {
    from: email.from ?? null,
    to: email.to ?? null,
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
