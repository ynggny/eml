/**
 * 時限トークンの生成と検証
 * EMLファイルの一時的な公開ダウンロードURLに使用
 */

interface TokenPayload {
  id: string;
  exp: number; // Unix timestamp (秒)
}

/**
 * HMAC-SHA256署名を生成
 */
async function sign(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * ダウンロードトークンを生成
 * @param id レコードID
 * @param secret 署名用シークレット
 * @param expiresInMinutes 有効期限（分）デフォルト60分
 */
export async function generateDownloadToken(
  id: string,
  secret: string,
  expiresInMinutes = 60
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + expiresInMinutes * 60;
  const payload: TokenPayload = { id, exp };
  const payloadStr = btoa(JSON.stringify(payload));
  const signature = await sign(payloadStr, secret);
  return `${payloadStr}.${signature}`;
}

/**
 * ダウンロードトークンを検証
 * @returns レコードID（有効な場合）またはnull
 */
export async function verifyDownloadToken(
  token: string,
  secret: string
): Promise<string | null> {
  const parts = token.split('.');
  if (parts.length !== 2) {
    return null;
  }

  const [payloadStr, signature] = parts;

  // 署名を検証
  const expectedSignature = await sign(payloadStr, secret);
  if (signature !== expectedSignature) {
    return null;
  }

  // ペイロードをデコード
  try {
    const payload: TokenPayload = JSON.parse(atob(payloadStr));

    // 有効期限を確認
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return null;
    }

    return payload.id;
  } catch {
    return null;
  }
}
