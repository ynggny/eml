# EML Viewer & Validator

## 開発ルール

- **応答・PR・コミットメッセージは基本的に日本語で記述する**
- ライブラリのドキュメント参照にはContext7 MCPを使用する
- **コミットは適切な粒度で行う**（機能単位・論理的なまとまりごと）
- **実装が完了したらPRを作成する**

### コミット粒度の指針
- 1つの機能追加 = 1コミット
- 1つのバグ修正 = 1コミット
- リファクタリングは機能変更と分離する
- 設定ファイルの変更は関連する機能と一緒にコミット可

### コメント・ログの指針
| 対象 | 記述内容 |
|------|----------|
| コード | How（どうやって実現しているか） |
| テストコード | What（何をテストしているか） |
| コミットログ | Why（なぜこの変更が必要か） |
| コードコメント | Why not（なぜ別の方法を採用しなかったか） |

## プロジェクト概要

EMLファイルの閲覧・検証ツール。単なるビューワーではなく、メール認証（DKIM/SPF/DMARC）の検証、送信元の信頼性確認、改ざん検知などができる「メール検証ツール」。

## ターゲットユーザー

- 法務・コンプライアンス担当（証拠保全、監査対応）
- セキュリティ担当（フィッシング判定、認証検証）
- IT管理者（トラブルシュート、配信問題調査）
- 一般ユーザー（怪しいメールの確認）

## 技術スタック

### フロントエンド
- **Cloudflare Pages**
- フレームワーク: React or Vanilla JS（軽量優先）
- UIライブラリ: Tailwind CSS
- EMLパース: ブラウザ側でJSパース

### バックエンド
- **Cloudflare Workers**
- DNS問い合わせ（DoH経由）
- DKIM署名検証（必要に応じて）
- ハッシュ計算

### ストレージ（監査対応用）
- **D1**: メタデータ、ログ、IP、@移行
- **R2**: EMLファイル本体

## 機能一覧

### Phase 1（MVP）
- [ ] EMLファイルのドラッグ&ドロップ
- [ ] 基本情報表示（From, To, Subject, Date）
- [ ] 本文表示（HTML/テキスト切り替え）
- [ ] 添付ファイル一覧・ダウンロード
- [ ] Authentication-Resultsヘッダーの可視化
- [ ] ファイルハッシュ（SHA-256）表示

### Phase 2（差別化）
- [ ] 複数EMLファイル対応
- [ ] スレッド表示（時系列並べ）
- [ ] DNS問い合わせ（SPF/DKIM/DMARCレコード取得）
- [ ] 送信元ドメインの情報表示
- [ ] Receivedヘッダーの経路可視化

### Phase 3（上級者向け）
- [ ] DKIM署名の再検証
- [ ] 送信元IPのGeolocation
- [ ] レポート出力（PDF）
- [ ] 比較機能（2つのEMLを並べて差分確認）

## アーキテクチャ

```
┌─────────────────┐      ┌─────────────────┐
│  Cloudflare     │      │  Cloudflare     │
│  Pages          │─────▶│  Workers        │
│  (フロントエンド)│      │  (API)          │
└─────────────────┘      └────────┬────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
                    ▼             ▼             ▼
              ┌─────────┐   ┌─────────┐   ┌─────────┐
              │   D1    │   │   R2    │   │  DoH    │
              │ (メタ)  │   │ (ファイル)│   │ (DNS)   │
              └─────────┘   └─────────┘   └─────────┘
```

## API設計

### Worker Endpoints

```
POST /api/verify
  - EMLのメタデータを受け取り、DNS検証を実行
  - Request: { domain, dkimSelector, senderIP }
  - Response: { spf, dkim, dmarc, geoIP }

POST /api/store (監査用)
  - EMLファイルを暗号化してR2に保存
  - Request: { emlBase64, metadata }
  - Response: { id, hash, storedAt }

GET /api/dns/:type/:domain
  - DNSレコード取得
  - Example: /api/dns/txt/_dmarc.example.com
```

## DNS問い合わせ（DoH）

```javascript
// Cloudflare DoH を使用
async function getDNSRecord(name, type = 'TXT') {
  const response = await fetch(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`,
    { headers: { 'Accept': 'application/dns-json' } }
  );
  return response.json();
}

// SPF取得
const spf = await getDNSRecord('example.com', 'TXT');

// DKIM取得
const dkim = await getDNSRecord('selector._domainkey.example.com', 'TXT');

// DMARC取得
const dmarc = await getDNSRecord('_dmarc.example.com', 'TXT');
```

## EMLパース（フロントエンド）

```javascript
// postal-mimeライブラリ推奨
import PostalMime from 'postal-mime';

async function parseEML(emlContent) {
  const parser = new PostalMime();
  const email = await parser.parse(emlContent);

  return {
    from: email.from,
    to: email.to,
    subject: email.subject,
    date: email.date,
    html: email.html,
    text: email.text,
    attachments: email.attachments,
    headers: email.headers
  };
}
```

## セキュリティ・プライバシー方針

### 重要: データ取り扱いについて

このツールは**監査対応**を目的としてデータを保管する場合がありますが、以下の方針を遵守します：

1. **ユーザー情報の非収集**
   - 個人を特定する情報は収集しません
   - アクセスログは匿名化されます
   - トラッキング・広告は一切使用しません

### UI上での表示例

```
┌─────────────────────────────────────────────────────────┐
│ 🔒 プライバシーについて                                  │
│                                                         │
│ • ファイルは暗号化して一時保管されます（監査対応用）      │
│ • 個人情報は収集していません                            │
│ • 90日後に自動削除されます                              │
│ • 詳細はプライバシーポリシーをご確認ください            │
└─────────────────────────────────────────────────────────┘
```

## UI設計方針

- **Squoosh風のモダンUI**
- ダークモード対応
- ドラッグ&ドロップ中心の操作
- 認証結果は色分けで直感的に
  - ✅ 緑: Pass
  - ⚠️ 黄: 不明/一部問題
  - ❌ 赤: Fail

## ディレクトリ構成

```
eml-viewer/
├── frontend/              # Cloudflare Pages
│   ├── src/
│   │   ├── components/
│   │   │   ├── DropZone.jsx
│   │   │   ├── EmailViewer.jsx
│   │   │   ├── AuthResults.jsx
│   │   │   ├── ThreadView.jsx
│   │   │   └── HashInfo.jsx
│   │   ├── utils/
│   │   │   ├── emlParser.js
│   │   │   └── hashUtils.js
│   │   ├── App.jsx
│   │   └── index.js
│   ├── public/
│   └── package.json
│
├── worker/                # Cloudflare Workers
│   ├── src/
│   │   ├── index.js
│   │   ├── dns.js
│   │   ├── storage.js
│   │   └── verify.js
│   └── wrangler.toml
│
├── shared/                # 共通型定義など
│   └── types.ts
│
└── claude.md              # このファイル
```

## wrangler.toml（Worker設定）

```toml
name = "eml-viewer-api"
main = "src/index.js"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "eml-viewer-db"
database_id = "xxx"

[[r2_buckets]]
binding = "BUCKET"
bucket_name = "eml-storage"
```

## D1スキーマ

```sql
CREATE TABLE IF NOT EXISTS eml_records (
  id TEXT PRIMARY KEY,
  hash_sha256 TEXT NOT NULL,
  from_domain TEXT,
  subject_preview TEXT,
  stored_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,
  metadata TEXT  -- JSON
);

CREATE INDEX idx_hash ON eml_records(hash_sha256);
CREATE INDEX idx_expires ON eml_records(expires_at);
```

## 開発コマンド

```bash
# フロントエンド開発
cd frontend
npm install
npm run dev

# Worker開発
cd worker
npm install
npx wrangler dev

# デプロイ
npx wrangler pages deploy frontend/dist
npx wrangler deploy
```

## 参考ライブラリ

- **postal-mime**: EMLパース（ブラウザ対応）
- **Web Crypto API**: ハッシュ計算、暗号化
- **Cloudflare DoH**: DNS問い合わせ

## 今後の拡張案

- Chrome拡張版
- Gmailからの直接エクスポート連携
- Slack通知（怪しいメール検知時）
- API提供（有料）

---

## SEO対応方針

### 基本情報
- **サイトURL**: https://eml.ynggny.com （仮）
- **言語**: 日本語（`lang="ja"`）
- **ターゲット地域**: 日本

### 実装項目

#### 1. メタタグ（index.html）
| タグ | 内容 |
|------|------|
| title | EML Viewer - メール検証・閲覧ツール |
| description | EMLファイルの安全な検証・閲覧ツール。DKIM/SPF/DMARC認証確認、送信元検証、改ざん検知に対応。 |
| keywords | EML,メール検証,DKIM,SPF,DMARC,メールヘッダー,フィッシング対策 |
| canonical | https://eml.ynggny.com/ |

#### 2. OGP（Open Graph Protocol）
| プロパティ | 内容 |
|-----------|------|
| og:title | EML Viewer - メール検証・閲覧ツール |
| og:description | EMLファイルの安全な検証・閲覧ツール |
| og:type | website |
| og:url | https://eml.ynggny.com/ |
| og:image | https://eml.ynggny.com/ogp.png |
| og:locale | ja_JP |

#### 3. Twitter Card
| プロパティ | 内容 |
|-----------|------|
| twitter:card | summary_large_image |
| twitter:title | EML Viewer - メール検証・閲覧ツール |
| twitter:description | EMLファイルの安全な検証・閲覧ツール |
| twitter:image | https://eml.ynggny.com/ogp.png |

#### 4. 構造化データ（JSON-LD）
- Schema.org `WebApplication` スキーマを使用
- アプリケーション情報、機能、対象ユーザーを記述

#### 5. 静的ファイル（frontend/public/）
| ファイル | 用途 |
|---------|------|
| robots.txt | クローラー制御、サイトマップ指定 |
| sitemap.xml | ページ一覧（SPA単一ページ） |
| manifest.json | PWA対応、アプリ情報 |
| _headers | セキュリティヘッダー、キャッシュ設定 |
| ogp.png | SNS共有用画像（1200x630px） |
| favicon.ico | ファビコン |

#### 6. セキュリティヘッダー（_headers）
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
```

### Core Web Vitals目標
| 指標 | 目標値 |
|------|--------|
| LCP (Largest Contentful Paint) | < 2.5s |
| INP (Interaction to Next Paint) | < 200ms |
| CLS (Cumulative Layout Shift) | < 0.1 |

### 更新履歴
- 2026-01-09: SEO対応方針を策定

---

## 開発メモ

（ここに開発中のメモを追記していく）
