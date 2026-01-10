import { useState, useCallback, useEffect, useRef } from 'react';
import type { ParsedEmail } from '../utils/emlParser';
import { prepareExportFromArrayBuffer, getSupportedEncodings, type EncodingInfo } from '../utils/api';

interface EmailViewerProps {
  email: ParsedEmail;
}

type ViewMode = 'html' | 'text' | 'headers';
type HeaderViewMode = 'parsed' | 'raw';

// ヘッダーの説明データ
const HEADER_DESCRIPTIONS: Record<string, string> = {
  from: '送信者のメールアドレス。偽装される可能性があるため、SPF/DKIM/DMARCの検証結果と合わせて確認が必要',
  to: '宛先のメールアドレス。BCCは表示されない',
  subject: 'メールの件名',
  date: 'メールが送信された日時（送信者のタイムゾーン）',
  'message-id': 'メールを一意に識別するID。通常は送信サーバーが生成',
  received: 'メールが経由したサーバーの記録。下から上に時系列順。経路追跡に重要',
  'return-path': 'バウンスメールの返送先。Fromと異なる場合は要注意',
  'reply-to': '返信先アドレス。Fromと異なる場合はフィッシングの可能性',
  'x-mailer': '送信に使用されたメールクライアント/ソフトウェア',
  'user-agent': '送信に使用されたメールクライアント（X-Mailerと同様）',
  'x-originating-ip': '送信元の実際のIPアドレス。発信地の特定に使用',
  'dkim-signature': 'DKIM署名。送信ドメインの認証とメール改ざん検知に使用',
  'authentication-results': 'SPF/DKIM/DMARC認証の結果。受信サーバーが付与',
  'content-type': 'メールのコンテンツ形式（text/plain, text/html, multipartなど）',
  'mime-version': 'MIMEプロトコルのバージョン',
  'list-unsubscribe': 'メーリングリストの購読解除URL/アドレス',
  'list-id': 'メーリングリストの識別子',
  'x-spam-status': 'スパムフィルターの判定結果',
  'x-spam-score': 'スパムスコア（高いほどスパムの可能性大）',
  'x-priority': 'メールの優先度（1=高, 3=通常, 5=低）',
  importance: 'メールの重要度',
  'arc-seal': 'ARC（Authenticated Received Chain）のシール。転送時の認証連鎖',
  'arc-message-signature': 'ARC署名。転送チェーンでの認証情報',
  'arc-authentication-results': 'ARC認証結果。転送前の認証状態',
};

// テキストファイルかどうかを判定
function isTextMimeType(mimeType: string): boolean {
  const textTypes = [
    'text/',
    'application/json',
    'application/xml',
    'application/javascript',
  ];
  const lower = mimeType.toLowerCase();
  return textTypes.some((t) => lower.startsWith(t));
}

// ファイル種別に基づく推奨エンコーディング情報
interface EncodingRecommendation {
  primary: string;
  alternatives: string[];
  description: string;
}

function getEncodingRecommendation(filename: string, mimeType: string): EncodingRecommendation {
  const ext = filename.toLowerCase().split('.').pop() || '';
  const mime = mimeType.toLowerCase();

  // CSVファイル
  if (ext === 'csv' || mime === 'text/csv') {
    return {
      primary: 'shift_jis',
      alternatives: ['utf-8'],
      description: 'Excel（日本語版）で作成されたCSVはShift_JISが一般的です。文字化けする場合はUTF-8をお試しください。',
    };
  }

  // EMLファイル
  if (ext === 'eml' || mime === 'message/rfc822') {
    return {
      primary: 'iso-2022-jp',
      alternatives: ['utf-8', 'shift_jis'],
      description: '日本語メールはISO-2022-JP（JIS）が標準です。最近のメールはUTF-8も多いです。',
    };
  }

  // HTMLファイル
  if (ext === 'html' || ext === 'htm' || mime === 'text/html') {
    return {
      primary: 'utf-8',
      alternatives: ['shift_jis', 'euc-jp'],
      description: '現代のWebページはほぼUTF-8です。古いページはShift_JISやEUC-JPの場合があります。',
    };
  }

  // XMLファイル
  if (ext === 'xml' || mime.includes('xml')) {
    return {
      primary: 'utf-8',
      alternatives: ['shift_jis'],
      description: 'XMLは通常UTF-8です。宣言がある場合はそれに従います。',
    };
  }

  // JSONファイル
  if (ext === 'json' || mime === 'application/json') {
    return {
      primary: 'utf-8',
      alternatives: [],
      description: 'JSONは仕様上UTF-8が標準です。',
    };
  }

  // プレーンテキスト（デフォルト）
  return {
    primary: 'utf-8',
    alternatives: ['shift_jis', 'euc-jp', 'iso-2022-jp'],
    description: '多くの場合UTF-8ですが、古いファイルはShift_JISやEUC-JPの可能性があります。',
  };
}

interface DownloadDialogProps {
  attachment: {
    filename: string;
    mimeType: string;
    content: ArrayBuffer | string;
  };
  encodings: EncodingInfo[];
  onClose: () => void;
  onDownload: (encoding: string | null, convertEncoding: boolean) => void;
  isDownloading: boolean;
}

function DownloadDialog({ attachment, encodings, onClose, onDownload, isDownloading }: DownloadDialogProps) {
  const isTextFile = isTextMimeType(attachment.mimeType);
  const recommendation = getEncodingRecommendation(attachment.filename, attachment.mimeType);
  const [selectedEncoding, setSelectedEncoding] = useState<string>(recommendation.primary);
  const [convertEncoding, setConvertEncoding] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // クリック外で閉じる
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // 推奨エンコーディングかどうか判定
  const isRecommended = (encoding: string) => {
    return encoding === recommendation.primary || recommendation.alternatives.includes(encoding);
  };

  // エンコーディング名を取得
  const getEncodingDisplayName = (encoding: string) => {
    const enc = encodings.find((e) => e.encoding === encoding);
    return enc?.name || encoding.toUpperCase();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div
        ref={dialogRef}
        className="bg-gray-800 rounded-lg shadow-xl p-4 w-full max-w-md mx-4"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">ダウンロード設定</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-700 rounded"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          {/* ファイル情報 */}
          <div className="bg-gray-900 rounded p-3">
            <div className="text-sm text-gray-400">ファイル名</div>
            <div className="font-medium truncate">{attachment.filename}</div>
            <div className="text-xs text-gray-500 mt-1">{attachment.mimeType}</div>
          </div>

          {/* テキストファイルの場合のみ文字コード選択を表示 */}
          {isTextFile && (
            <>
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={convertEncoding}
                    onChange={(e) => setConvertEncoding(e.target.checked)}
                    className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-800"
                  />
                  <span className="text-sm">文字コードを変換してUTF-8で保存</span>
                </label>
                <p className="text-xs text-gray-500 mt-1 ml-6">
                  文字化けしている場合にチェックしてください
                </p>
              </div>

              {convertEncoding && (
                <div className="space-y-3">
                  {/* 推奨エンコーディングの説明 */}
                  <div className="bg-blue-900/30 border border-blue-700/50 rounded p-3">
                    <div className="flex items-start gap-2">
                      <span className="text-blue-400 text-lg">💡</span>
                      <div>
                        <p className="text-sm text-blue-200">{recommendation.description}</p>
                      </div>
                    </div>
                  </div>

                  {/* クイック選択ボタン */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">
                      元ファイルの文字コードを選択
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {/* 推奨エンコーディングをボタンで表示 */}
                      <button
                        onClick={() => setSelectedEncoding(recommendation.primary)}
                        className={`px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center gap-1 ${
                          selectedEncoding === recommendation.primary
                            ? 'bg-green-600 text-white'
                            : 'bg-green-900/40 text-green-300 hover:bg-green-900/60 border border-green-700/50'
                        }`}
                      >
                        <span>推奨</span>
                        <span className="font-normal">{getEncodingDisplayName(recommendation.primary)}</span>
                      </button>
                      {recommendation.alternatives.map((enc) => (
                        <button
                          key={enc}
                          onClick={() => setSelectedEncoding(enc)}
                          className={`px-3 py-1.5 rounded text-sm transition-colors ${
                            selectedEncoding === enc
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          {getEncodingDisplayName(enc)}
                        </button>
                      ))}
                      <button
                        onClick={() => setSelectedEncoding('')}
                        className={`px-3 py-1.5 rounded text-sm transition-colors ${
                          selectedEncoding === ''
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        自動検出
                      </button>
                    </div>
                  </div>

                  {/* 詳細選択 */}
                  <details className="text-sm">
                    <summary className="text-gray-400 cursor-pointer hover:text-gray-300">
                      その他のエンコーディング
                    </summary>
                    <div className="mt-2 grid grid-cols-2 gap-1">
                      {encodings
                        .filter((enc) => !isRecommended(enc.encoding))
                        .map((enc) => (
                          <button
                            key={enc.encoding}
                            onClick={() => setSelectedEncoding(enc.encoding)}
                            className={`px-2 py-1 rounded text-xs text-left transition-colors ${
                              selectedEncoding === enc.encoding
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700 hover:text-gray-300'
                            }`}
                          >
                            {enc.name}
                          </button>
                        ))}
                    </div>
                  </details>
                </div>
              )}
            </>
          )}

          {/* バイナリファイルの場合 */}
          {!isTextFile && (
            <div className="bg-gray-900/50 rounded p-3 text-sm text-gray-400">
              <p>バイナリファイルはそのままダウンロードされます</p>
            </div>
          )}

          {/* ダウンロードボタン */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
              disabled={isDownloading}
            >
              キャンセル
            </button>
            <button
              onClick={() => onDownload(
                convertEncoding && selectedEncoding ? selectedEncoding : null,
                convertEncoding
              )}
              disabled={isDownloading}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isDownloading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>処理中...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span>ダウンロード</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function EmailViewer({ email }: EmailViewerProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('html');
  const [headerViewMode, setHeaderViewMode] = useState<HeaderViewMode>('parsed');
  const [hoveredHeader, setHoveredHeader] = useState<string | null>(null);
  const [headerSearch, setHeaderSearch] = useState('');
  const [encodings, setEncodings] = useState<EncodingInfo[]>([]);
  const [downloadDialog, setDownloadDialog] = useState<{
    filename: string;
    mimeType: string;
    content: ArrayBuffer | string;
  } | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // エンコーディング一覧を取得
  useEffect(() => {
    getSupportedEncodings()
      .then(setEncodings)
      .catch((err) => console.error('Failed to load encodings:', err));
  }, []);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    try {
      return new Date(dateStr).toLocaleString('ja-JP');
    } catch {
      return dateStr;
    }
  };

  const formatAddress = (
    addr: { address: string; name?: string } | null
  ): string => {
    if (!addr) return 'N/A';
    return addr.name ? `${addr.name} <${addr.address}>` : addr.address;
  };

  // ダウンロードダイアログを開く
  const openDownloadDialog = useCallback((attachment: {
    filename: string;
    mimeType: string;
    content: ArrayBuffer | string;
  }) => {
    setDownloadDialog(attachment);
  }, []);

  // ダウンロードを実行（URL遷移）
  const executeDownload = useCallback(async (
    sourceEncoding: string | null,
    convertEncoding: boolean
  ) => {
    if (!downloadDialog) return;

    setIsDownloading(true);
    try {
      // string の場合は ArrayBuffer に変換
      const content =
        typeof downloadDialog.content === 'string'
          ? new TextEncoder().encode(downloadDialog.content).buffer
          : downloadDialog.content;

      // Worker APIでトークンを取得
      const result = await prepareExportFromArrayBuffer(
        content,
        downloadDialog.filename,
        downloadDialog.mimeType,
        {
          sourceEncoding: sourceEncoding ?? undefined,
          convertEncoding,
        }
      );

      // URL遷移でダウンロード（ブラウザのダウンロードマネージャーを使用）
      window.location.href = result.url;

      // ダイアログを閉じる
      setDownloadDialog(null);
    } catch (error) {
      console.error('Download failed:', error);
      // フォールバック: Worker APIが利用できない場合はクライアント側でダウンロード
      const content =
        typeof downloadDialog.content === 'string'
          ? new TextEncoder().encode(downloadDialog.content)
          : downloadDialog.content;
      const blob = new Blob([content], { type: downloadDialog.mimeType });
      const url = URL.createObjectURL(blob);
      window.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownloadDialog(null);
    } finally {
      setIsDownloading(false);
    }
  }, [downloadDialog]);

  return (
    <div className="space-y-4">
      {/* ダウンロードダイアログ */}
      {downloadDialog && (
        <DownloadDialog
          attachment={downloadDialog}
          encodings={encodings}
          onClose={() => setDownloadDialog(null)}
          onDownload={executeDownload}
          isDownloading={isDownloading}
        />
      )}

      {/* 基本情報 */}
      <div className="p-4 bg-gray-800 rounded-lg space-y-2">
        <div className="grid grid-cols-[80px_1fr] gap-2 text-sm">
          <span className="text-gray-400">From:</span>
          <span className="text-white">{formatAddress(email.from)}</span>

          <span className="text-gray-400">To:</span>
          <span className="text-white">
            {email.to?.map((t) => formatAddress(t)).join(', ') ?? 'N/A'}
          </span>

          <span className="text-gray-400">Subject:</span>
          <span className="text-white font-medium">
            {email.subject ?? 'N/A'}
          </span>

          <span className="text-gray-400">Date:</span>
          <span className="text-white">{formatDate(email.date)}</span>
        </div>
      </div>

      {/* 添付ファイル */}
      {email.attachments.length > 0 && (
        <div className="p-4 bg-gray-800 rounded-lg">
          <h3 className="text-sm font-semibold text-gray-400 mb-2">
            添付ファイル ({email.attachments.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {email.attachments.map((att, i) => (
              <button
                key={i}
                onClick={() => openDownloadDialog(att)}
                className="flex items-center gap-2 px-3 py-2 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors text-sm"
              >
                <svg
                  className="w-4 h-4 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <span>{att.filename}</span>
                {isTextMimeType(att.mimeType) && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-gray-600 rounded text-gray-300">
                    TXT
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 本文切り替えタブ */}
      <div className="flex gap-2 border-b border-gray-700">
        <button
          onClick={() => setViewMode('html')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            viewMode === 'html'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          HTML
        </button>
        <button
          onClick={() => setViewMode('text')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            viewMode === 'text'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          テキスト
        </button>
        <button
          onClick={() => setViewMode('headers')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            viewMode === 'headers'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          ヘッダー
        </button>
      </div>

      {/* 本文表示 */}
      <div className="p-4 bg-gray-800 rounded-lg min-h-[300px] overflow-auto">
        {viewMode === 'html' && email.html && (
          <div
            className="prose prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: email.html }}
          />
        )}
        {viewMode === 'html' && !email.html && (
          <p className="text-gray-500">HTMLコンテンツがありません</p>
        )}

        {viewMode === 'text' && (
          <pre className="text-sm text-gray-300 whitespace-pre-wrap">
            {email.text ?? 'テキストコンテンツがありません'}
          </pre>
        )}

        {viewMode === 'headers' && (
          <div className="space-y-4">
            {/* 検索・切り替えバー */}
            <div className="flex flex-wrap items-center gap-2">
              {/* 検索入力 */}
              <div className="relative flex-1 min-w-[200px]">
                <input
                  type="text"
                  value={headerSearch}
                  onChange={(e) => setHeaderSearch(e.target.value)}
                  placeholder="ヘッダーを検索..."
                  className="w-full px-3 py-1.5 pl-8 text-xs bg-gray-900 border border-gray-700 rounded focus:outline-none focus:border-blue-500 text-gray-200 placeholder-gray-500"
                />
                <svg
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {headerSearch && (
                  <button
                    onClick={() => setHeaderSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              {/* 整形/Raw切り替え */}
              <div className="flex gap-1 text-xs">
                <button
                  onClick={() => setHeaderViewMode('parsed')}
                  className={`px-3 py-1.5 rounded ${
                    headerViewMode === 'parsed'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  整形
                </button>
                <button
                  onClick={() => setHeaderViewMode('raw')}
                  className={`px-3 py-1.5 rounded ${
                    headerViewMode === 'raw'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  Raw
                </button>
              </div>
            </div>

            {headerViewMode === 'parsed' ? (
              <div className="space-y-1 text-xs font-mono">
                {email.headers
                  .filter((h) => {
                    if (!headerSearch) return true;
                    const searchLower = headerSearch.toLowerCase();
                    return (
                      h.key.toLowerCase().includes(searchLower) ||
                      h.value.toLowerCase().includes(searchLower)
                    );
                  })
                  .map((h, i) => {
                    const headerKey = h.key.toLowerCase();
                    const description = HEADER_DESCRIPTIONS[headerKey];
                    const searchLower = headerSearch.toLowerCase();
                    const isKeyMatch = headerSearch && h.key.toLowerCase().includes(searchLower);
                    const isValueMatch = headerSearch && h.value.toLowerCase().includes(searchLower);

                    return (
                      <div
                        key={i}
                        className={`relative flex gap-2 group p-1 rounded ${
                          isKeyMatch || isValueMatch ? 'bg-yellow-900/30' : ''
                        }`}
                        onMouseEnter={() => setHoveredHeader(`${headerKey}-${i}`)}
                        onMouseLeave={() => setHoveredHeader(null)}
                      >
                        <span
                          className={`shrink-0 ${
                            description
                              ? 'text-blue-400 cursor-help border-b border-dashed border-blue-400/50'
                              : 'text-blue-400'
                          } ${isKeyMatch ? 'bg-yellow-500/30 px-0.5 rounded' : ''}`}
                        >
                          {h.key}:
                        </span>
                        <span className={`text-gray-300 break-all ${isValueMatch ? 'bg-yellow-500/30 px-0.5 rounded' : ''}`}>
                          {h.value}
                        </span>
                        {/* ツールチップ */}
                        {description && hoveredHeader === `${headerKey}-${i}` && (
                          <div className="absolute left-0 bottom-full mb-1 z-10 max-w-md p-2 bg-gray-900 border border-gray-600 rounded shadow-lg text-xs text-gray-200">
                            {description}
                          </div>
                        )}
                      </div>
                    );
                  })}
                {headerSearch && email.headers.filter((h) => {
                  const searchLower = headerSearch.toLowerCase();
                  return h.key.toLowerCase().includes(searchLower) || h.value.toLowerCase().includes(searchLower);
                }).length === 0 && (
                  <p className="text-gray-500 text-center py-4">
                    "{headerSearch}" に一致するヘッダーが見つかりませんでした
                  </p>
                )}
              </div>
            ) : (
              <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono bg-gray-900 p-3 rounded overflow-x-auto">
                {email.rawHeaders}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
