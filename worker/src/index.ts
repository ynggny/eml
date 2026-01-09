/**
 * EML Viewer API - Cloudflare Worker
 */

import { verifyDomain, type VerifyRequest } from './verify';
import { storeEml, getEml, type StoreRequest } from './storage';
import { getDNSRecord } from './dns';
import { listRecords, getRecord, getStats, deleteRecord } from './admin';
import { verifyAuth, unauthorizedResponse } from './auth';
import { analyzeConfusables, analyzeMultipleDomains } from './confusables';
import { generateDownloadToken, verifyDownloadToken } from './token';

interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  ADMIN_USERNAME: string;
  ADMIN_PASSWORD_HASH: string;
}

/**
 * CORSヘッダーを追加
 */
function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

/**
 * JSONレスポンスを生成
 */
function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(),
    },
  });
}

/**
 * エラーレスポンスを生成
 */
function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    try {
      // POST /api/verify - ドメイン検証
      if (path === '/api/verify' && request.method === 'POST') {
        const body: VerifyRequest = await request.json();
        if (!body.domain) {
          return errorResponse('domain is required');
        }
        const result = await verifyDomain(body);
        return jsonResponse(result);
      }

      // POST /api/store - EMLファイル保存（監査用）
      if (path === '/api/store' && request.method === 'POST') {
        const body: StoreRequest = await request.json();
        if (!body.emlBase64) {
          return errorResponse('emlBase64 is required');
        }
        const result = await storeEml(body, env);
        return jsonResponse(result);
      }

      // GET /api/dns/:type/:domain - DNSレコード取得
      const dnsMatch = path.match(/^\/api\/dns\/(txt|a|mx|cname)\/(.+)$/i);
      if (dnsMatch && request.method === 'GET') {
        const [, type, domain] = dnsMatch;
        const records = await getDNSRecord(
          domain,
          type.toUpperCase() as 'TXT' | 'A' | 'MX' | 'CNAME'
        );
        return jsonResponse({ domain, type: type.toUpperCase(), records });
      }

      // POST /api/security/confusables - ホモグラフ/コンフュザブル検出
      if (path === '/api/security/confusables' && request.method === 'POST') {
        const body = await request.json() as { domain?: string; domains?: string[] };

        if (body.domains && Array.isArray(body.domains)) {
          // 複数ドメイン分析
          const results = analyzeMultipleDomains(body.domains);
          return jsonResponse({ results });
        }

        if (body.domain) {
          // 単一ドメイン分析
          const result = analyzeConfusables(body.domain);
          return jsonResponse(result);
        }

        return errorResponse('domain or domains is required');
      }

      // ヘルスチェック
      if (path === '/api/health') {
        return jsonResponse({ status: 'ok', timestamp: new Date().toISOString() });
      }

      // GET /api/download/:token - 公開ダウンロード（トークン認証）
      const publicDownloadMatch = path.match(/^\/api\/download\/(.+)$/);
      if (publicDownloadMatch && request.method === 'GET') {
        const [, token] = publicDownloadMatch;
        const recordId = await verifyDownloadToken(token, env.ADMIN_PASSWORD_HASH);

        if (!recordId) {
          return errorResponse('Invalid or expired download link', 403);
        }

        const emlData = await getEml(recordId, env);
        if (!emlData) {
          return errorResponse('Record not found', 404);
        }

        const filename = `${recordId}.eml`;
        return new Response(emlData.data, {
          status: 200,
          headers: {
            'Content-Type': 'message/rfc822',
            'Content-Disposition': `attachment; filename="${filename}"`,
            ...corsHeaders(),
          },
        });
      }

      // 管理用API - 認証必須
      if (path.startsWith('/api/admin/')) {
        const isAuthenticated = await verifyAuth(request, env);
        if (!isAuthenticated) {
          return unauthorizedResponse();
        }

        // GET /api/admin/stats - 統計情報
        if (path === '/api/admin/stats' && request.method === 'GET') {
          const stats = await getStats(env);
          return jsonResponse(stats);
        }

        // GET /api/admin/records - レコード一覧
        if (path === '/api/admin/records' && request.method === 'GET') {
          const page = parseInt(url.searchParams.get('page') ?? '1', 10);
          const limit = parseInt(url.searchParams.get('limit') ?? '20', 10);
          const search = url.searchParams.get('search') ?? undefined;
          const result = await listRecords(env, { page, limit, search });
          return jsonResponse(result);
        }

        // GET /api/admin/records/:id/download - EMLファイルダウンロード
        const downloadMatch = path.match(/^\/api\/admin\/records\/([^/]+)\/download$/);
        if (downloadMatch && request.method === 'GET') {
          const [, id] = downloadMatch;
          const emlData = await getEml(id, env);
          if (!emlData) {
            return errorResponse('Record not found', 404);
          }

          // Content-Dispositionでファイル名を指定
          const filename = `${id}.eml`;
          return new Response(emlData.data, {
            status: 200,
            headers: {
              'Content-Type': 'message/rfc822',
              'Content-Disposition': `attachment; filename="${filename}"`,
              ...corsHeaders(),
            },
          });
        }

        // POST /api/admin/records/:id/presign - 署名付きダウンロードURL生成
        const presignMatch = path.match(/^\/api\/admin\/records\/([^/]+)\/presign$/);
        if (presignMatch && request.method === 'POST') {
          const [, id] = presignMatch;

          // レコードの存在確認
          const record = await getRecord(env, id);
          if (!record) {
            return errorResponse('Record not found', 404);
          }

          // 有効期限（分）をクエリパラメータから取得（デフォルト60分）
          const expiresIn = parseInt(url.searchParams.get('expires') ?? '60', 10);
          const token = await generateDownloadToken(id, env.ADMIN_PASSWORD_HASH, expiresIn);

          // 完全なURLを生成
          const downloadUrl = `${url.origin}/api/download/${token}`;

          return jsonResponse({
            url: downloadUrl,
            expiresIn: expiresIn * 60, // 秒単位
            expiresAt: new Date(Date.now() + expiresIn * 60 * 1000).toISOString(),
          });
        }

        // GET/DELETE /api/admin/records/:id - 個別レコード操作
        const recordMatch = path.match(/^\/api\/admin\/records\/([^/]+)$/);
        if (recordMatch) {
          const [, id] = recordMatch;

          if (request.method === 'GET') {
            const record = await getRecord(env, id);
            if (!record) {
              return errorResponse('Record not found', 404);
            }
            return jsonResponse(record);
          }

          if (request.method === 'DELETE') {
            const deleted = await deleteRecord(env, id);
            if (!deleted) {
              return errorResponse('Record not found', 404);
            }
            return jsonResponse({ success: true });
          }
        }
      }

      return errorResponse('Not Found', 404);
    } catch (err) {
      console.error('API Error:', err);
      return errorResponse(
        err instanceof Error ? err.message : 'Internal Server Error',
        500
      );
    }
  },
};
