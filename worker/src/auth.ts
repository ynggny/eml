/**
 * 管理画面用Basic認証
 */

interface AuthEnv {
  ADMIN_USERNAME: string;
  ADMIN_PASSWORD_HASH: string;
}

/**
 * SHA-256ハッシュを計算
 */
async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Basic認証ヘッダーをパース
 */
function parseBasicAuth(
  header: string | null
): { username: string; password: string } | null {
  if (!header || !header.startsWith('Basic ')) {
    return null;
  }

  try {
    const base64 = header.slice(6);
    const decoded = atob(base64);
    const [username, ...passwordParts] = decoded.split(':');
    const password = passwordParts.join(':');

    if (!username || !password) {
      return null;
    }

    return { username, password };
  } catch {
    return null;
  }
}

/**
 * 認証を検証
 */
export async function verifyAuth(
  request: Request,
  env: AuthEnv
): Promise<boolean> {
  const authHeader = request.headers.get('Authorization');
  const credentials = parseBasicAuth(authHeader);

  if (!credentials) {
    return false;
  }

  // ユーザー名を検証
  if (credentials.username !== env.ADMIN_USERNAME) {
    return false;
  }

  // パスワードをハッシュ化して比較
  const passwordHash = await sha256(credentials.password);
  return passwordHash === env.ADMIN_PASSWORD_HASH;
}

/**
 * 認証エラーレスポンスを生成
 */
export function unauthorizedResponse(): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: {
      'Content-Type': 'application/json',
      'WWW-Authenticate': 'Basic realm="Admin Area"',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
