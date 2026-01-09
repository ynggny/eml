/**
 * EML Viewer API - Cloudflare Worker
 */

import { verifyDomain, type VerifyRequest } from './verify';
import { storeEml, type StoreRequest } from './storage';
import { getDNSRecord } from './dns';
import { listRecords, getRecord, getStats, deleteRecord } from './admin';

interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
}

/**
 * CORSヘッダーを追加
 */
function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
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

      // ヘルスチェック
      if (path === '/api/health') {
        return jsonResponse({ status: 'ok', timestamp: new Date().toISOString() });
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
