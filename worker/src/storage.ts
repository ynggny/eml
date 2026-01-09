/**
 * R2/D1を使用したEMLファイルの保存・取得
 */

export interface EmlRecord {
  id: string;
  hash_sha256: string;
  from_domain: string | null;
  subject_preview: string | null;
  stored_at: string;
  expires_at: string;
  metadata: string;
}

export interface StoreRequest {
  emlBase64: string;
  metadata: {
    from_domain?: string;
    subject_preview?: string;
  };
}

export interface StoreResponse {
  id: string;
  hash: string;
  storedAt: string;
}

/**
 * SHA-256ハッシュを計算
 */
async function computeHash(data: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * UUIDを生成
 */
function generateId(): string {
  return crypto.randomUUID();
}

/**
 * EMLファイルを保存
 */
export async function storeEml(
  request: StoreRequest,
  env: { DB: D1Database; BUCKET: R2Bucket }
): Promise<StoreResponse> {
  const emlData = Uint8Array.from(atob(request.emlBase64), (c) =>
    c.charCodeAt(0)
  );
  const hash = await computeHash(emlData.buffer);
  const id = generateId();
  const storedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

  // R2にファイルを保存
  await env.BUCKET.put(`eml/${id}.eml`, emlData, {
    customMetadata: { hash, storedAt },
  });

  // D1にメタデータを保存
  await env.DB.prepare(
    `INSERT INTO eml_records (id, hash_sha256, from_domain, subject_preview, stored_at, expires_at, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      hash,
      request.metadata.from_domain ?? null,
      request.metadata.subject_preview ?? null,
      storedAt,
      expiresAt,
      JSON.stringify(request.metadata)
    )
    .run();

  return { id, hash, storedAt };
}

/**
 * EMLファイルを取得
 */
export async function getEml(
  id: string,
  env: { DB: D1Database; BUCKET: R2Bucket }
): Promise<{ data: ArrayBuffer; record: EmlRecord } | null> {
  const result = await env.DB.prepare(
    'SELECT * FROM eml_records WHERE id = ?'
  )
    .bind(id)
    .first<EmlRecord>();

  if (!result) {
    return null;
  }

  const object = await env.BUCKET.get(`eml/${id}.eml`);
  if (!object) {
    return null;
  }

  return {
    data: await object.arrayBuffer(),
    record: result,
  };
}
