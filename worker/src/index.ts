/**
 * EML Viewer API - Cloudflare Worker
 */

import { verifyDomain, type VerifyRequest } from './verify';
import { storeEml, getEml, type StoreRequest } from './storage';
import { getDNSRecord } from './dns';
import {
  listRecords,
  getRecord,
  getStats,
  deleteRecord,
  bulkDeleteRecords,
  exportRecords,
  findByHash,
  verifyIntegrity,
  getUniqueDomains,
  getDashboardSummary,
} from './admin';
import { verifyAuth, unauthorizedResponse } from './auth';
import { analyzeConfusables, analyzeMultipleDomains } from './confusables';
import { generateDownloadToken, verifyDownloadToken } from './token';
import {
  performFullAnalysis,
  performQuickAnalysis,
  verifyDKIMSignature,
  verifyARCChain,
  type AnalysisRequest,
} from './analysis';
import {
  createExportResponse,
  processExport,
  getSupportedEncodings,
  detectEncoding,
  generateExportToken,
  verifyExportToken,
  generateExportId,
  storeExportData,
  getExportData,
  deleteExportData,
  type ExportRequest,
  type PrepareExportRequest,
  type PreparedExport,
} from './export';

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

      // POST /api/analyze - 統合セキュリティ分析（フル）
      if (path === '/api/analyze' && request.method === 'POST') {
        const body: AnalysisRequest = await request.json();

        if (!body.headers || !Array.isArray(body.headers)) {
          return errorResponse('headers is required');
        }

        const result = await performFullAnalysis(body);
        return jsonResponse(result);
      }

      // POST /api/analyze/quick - 軽量セキュリティ分析（DKIM/ARC検証なし）
      if (path === '/api/analyze/quick' && request.method === 'POST') {
        const body: AnalysisRequest = await request.json();

        if (!body.headers || !Array.isArray(body.headers)) {
          return errorResponse('headers is required');
        }

        const result = performQuickAnalysis(body);
        return jsonResponse(result);
      }

      // POST /api/security/dkim - DKIM署名検証
      if (path === '/api/security/dkim' && request.method === 'POST') {
        const body = await request.json() as {
          headers: { key: string; value: string }[];
          body?: string;
          rawHeaders?: string;
        };

        if (!body.headers || !Array.isArray(body.headers)) {
          return errorResponse('headers is required');
        }

        const result = await verifyDKIMSignature(body.headers, body.body ?? '', body.rawHeaders);
        return jsonResponse(result);
      }

      // POST /api/security/arc - ARCチェーン検証
      if (path === '/api/security/arc' && request.method === 'POST') {
        const body = await request.json() as {
          headers: { key: string; value: string }[];
        };

        if (!body.headers || !Array.isArray(body.headers)) {
          return errorResponse('headers is required');
        }

        const result = await verifyARCChain(body.headers);
        return jsonResponse(result);
      }

      // ヘルスチェック
      if (path === '/api/health') {
        return jsonResponse({ status: 'ok', timestamp: new Date().toISOString() });
      }

      // GET /api/export/encodings - サポートされるエンコーディング一覧
      if (path === '/api/export/encodings' && request.method === 'GET') {
        return jsonResponse({
          encodings: getSupportedEncodings(),
        });
      }

      // POST /api/export/detect - 文字コード自動検出
      if (path === '/api/export/detect' && request.method === 'POST') {
        const body = await request.json() as { content: string };
        if (!body.content) {
          return errorResponse('content is required');
        }
        // Base64デコード
        const binaryStr = atob(body.content);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        const encoding = detectEncoding(bytes.buffer);
        return jsonResponse({ encoding });
      }

      // POST /api/export/prepare - エクスポート準備（トークン発行）
      if (path === '/api/export/prepare' && request.method === 'POST') {
        const body: PrepareExportRequest = await request.json();
        if (!body.content || !body.filename || !body.mimeType) {
          return errorResponse('content, filename, and mimeType are required');
        }

        // 文字コード自動検出
        const binaryStr = atob(body.content);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        const detectedEncoding = detectEncoding(bytes.buffer);

        // エクスポートID生成
        const exportId = generateExportId();
        const expiresIn = body.expiresIn ?? 300; // デフォルト5分
        const now = Math.floor(Date.now() / 1000);

        // R2に一時保存
        const exportData: PreparedExport = {
          content: body.content,
          filename: body.filename,
          mimeType: body.mimeType,
          sourceEncoding: body.sourceEncoding ?? detectedEncoding,
          convertEncoding: body.convertEncoding,
          createdAt: now,
          expiresAt: now + expiresIn,
        };
        await storeExportData(env.BUCKET, exportId, exportData);

        // 署名付きトークン生成
        const token = await generateExportToken(exportId, env.ADMIN_PASSWORD_HASH, expiresIn);
        const downloadUrl = `${url.origin}/api/export/download/${token}`;

        return jsonResponse({
          url: downloadUrl,
          token,
          expiresIn,
          expiresAt: new Date((now + expiresIn) * 1000).toISOString(),
          detectedEncoding,
        });
      }

      // GET /api/export/download/:token - トークンでファイルダウンロード
      const exportDownloadMatch = path.match(/^\/api\/export\/download\/(.+)$/);
      if (exportDownloadMatch && request.method === 'GET') {
        const [, token] = exportDownloadMatch;

        // トークン検証
        const exportId = await verifyExportToken(token, env.ADMIN_PASSWORD_HASH);
        if (!exportId) {
          return errorResponse('Invalid or expired download link', 403);
        }

        // エクスポートデータ取得
        const exportData = await getExportData(env.BUCKET, exportId);
        if (!exportData) {
          return errorResponse('Export data not found or expired', 404);
        }

        // ダウンロード後にデータを削除（ワンタイム使用）
        await deleteExportData(env.BUCKET, exportId);

        // ダウンロードレスポンス生成
        return createExportResponse({
          content: exportData.content,
          filename: exportData.filename,
          mimeType: exportData.mimeType,
          sourceEncoding: exportData.sourceEncoding,
          convertEncoding: exportData.convertEncoding,
        }, corsHeaders());
      }

      // POST /api/export/convert - 文字コード変換（JSON応答）
      if (path === '/api/export/convert' && request.method === 'POST') {
        const body: ExportRequest = await request.json();
        if (!body.content || !body.filename || !body.mimeType) {
          return errorResponse('content, filename, and mimeType are required');
        }

        const result = processExport({
          ...body,
          convertEncoding: true, // 強制変換
        });
        return jsonResponse(result);
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

        // GET /api/admin/summary - ダッシュボードサマリー（高速）
        if (path === '/api/admin/summary' && request.method === 'GET') {
          const summary = await getDashboardSummary(env);
          return jsonResponse(summary);
        }

        // GET /api/admin/domains - ユニークドメイン一覧
        if (path === '/api/admin/domains' && request.method === 'GET') {
          const domains = await getUniqueDomains(env);
          return jsonResponse({ domains });
        }

        // GET /api/admin/records - レコード一覧（拡張検索対応）
        if (path === '/api/admin/records' && request.method === 'GET') {
          const page = parseInt(url.searchParams.get('page') ?? '1', 10);
          const limit = parseInt(url.searchParams.get('limit') ?? '20', 10);
          const search = url.searchParams.get('search') ?? undefined;
          const dateFrom = url.searchParams.get('dateFrom') ?? undefined;
          const dateTo = url.searchParams.get('dateTo') ?? undefined;
          const domain = url.searchParams.get('domain') ?? undefined;
          const hashPrefix = url.searchParams.get('hashPrefix') ?? undefined;
          const sortBy = url.searchParams.get('sortBy') as 'stored_at' | 'from_domain' | 'subject_preview' | undefined;
          const sortOrder = url.searchParams.get('sortOrder') as 'asc' | 'desc' | undefined;
          const result = await listRecords(env, {
            page, limit, search, dateFrom, dateTo, domain, hashPrefix, sortBy, sortOrder
          });
          return jsonResponse(result);
        }

        // POST /api/admin/records/bulk-delete - 一括削除
        if (path === '/api/admin/records/bulk-delete' && request.method === 'POST') {
          const body = await request.json() as { ids: string[] };
          if (!body.ids || !Array.isArray(body.ids)) {
            return errorResponse('ids array is required');
          }
          const result = await bulkDeleteRecords(env, body.ids);
          return jsonResponse(result);
        }

        // POST /api/admin/records/export - エクスポート
        if (path === '/api/admin/records/export' && request.method === 'POST') {
          const body = await request.json() as {
            search?: string;
            dateFrom?: string;
            dateTo?: string;
            domain?: string;
          };
          const result = await exportRecords(env, body);
          return jsonResponse(result);
        }

        // GET /api/admin/hash/:hash - ハッシュ検索
        const hashSearchMatch = path.match(/^\/api\/admin\/hash\/([a-fA-F0-9]+)$/);
        if (hashSearchMatch && request.method === 'GET') {
          const [, hash] = hashSearchMatch;
          const record = await findByHash(env, hash.toLowerCase());
          if (!record) {
            return jsonResponse({ found: false, record: null });
          }
          return jsonResponse({ found: true, record });
        }

        // POST /api/admin/records/:id/verify - 整合性検証
        const verifyMatch = path.match(/^\/api\/admin\/records\/([^/]+)\/verify$/);
        if (verifyMatch && request.method === 'POST') {
          const [, id] = verifyMatch;
          const result = await verifyIntegrity(env, id);
          if (!result) {
            return errorResponse('Record not found', 404);
          }
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
