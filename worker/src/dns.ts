/**
 * Cloudflare DoHを使用してDNSレコードを取得する
 */

interface DNSAnswer {
  name: string;
  type: number;
  TTL: number;
  data: string;
}

interface DNSResponse {
  Status: number;
  TC: boolean;
  RD: boolean;
  RA: boolean;
  AD: boolean;
  CD: boolean;
  Question: { name: string; type: number }[];
  Answer?: DNSAnswer[];
}

export async function getDNSRecord(
  name: string,
  type: 'TXT' | 'A' | 'MX' | 'CNAME' = 'TXT'
): Promise<string[]> {
  const response = await fetch(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`,
    {
      headers: { Accept: 'application/dns-json' },
    }
  );

  if (!response.ok) {
    throw new Error(`DNS query failed: ${response.status}`);
  }

  const data: DNSResponse = await response.json();

  if (!data.Answer) {
    return [];
  }

  return data.Answer.map((a) => a.data.replace(/^"|"$/g, ''));
}

export async function getSPFRecord(domain: string): Promise<string | null> {
  const records = await getDNSRecord(domain, 'TXT');
  return records.find((r) => r.startsWith('v=spf1')) ?? null;
}

export async function getDKIMRecord(
  selector: string,
  domain: string
): Promise<string | null> {
  const records = await getDNSRecord(`${selector}._domainkey.${domain}`, 'TXT');
  return records.find((r) => r.startsWith('v=DKIM1')) ?? null;
}

export async function getDMARCRecord(domain: string): Promise<string | null> {
  const records = await getDNSRecord(`_dmarc.${domain}`, 'TXT');
  return records.find((r) => r.startsWith('v=DMARC1')) ?? null;
}
