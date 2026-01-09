import { useState } from 'react';
import type { ParsedEmail } from '../utils/emlParser';

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

export function EmailViewer({ email }: EmailViewerProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('html');
  const [headerViewMode, setHeaderViewMode] = useState<HeaderViewMode>('parsed');
  const [hoveredHeader, setHoveredHeader] = useState<string | null>(null);

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

  const downloadAttachment = (attachment: {
    filename: string;
    mimeType: string;
    content: ArrayBuffer | string;
  }) => {
    // string の場合は ArrayBuffer に変換
    const content =
      typeof attachment.content === 'string'
        ? new TextEncoder().encode(attachment.content)
        : attachment.content;
    const blob = new Blob([content], { type: attachment.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = attachment.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
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
                onClick={() => downloadAttachment(att)}
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
            {/* 整形/Raw切り替え */}
            <div className="flex gap-2 text-xs">
              <button
                onClick={() => setHeaderViewMode('parsed')}
                className={`px-3 py-1 rounded ${
                  headerViewMode === 'parsed'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                整形
              </button>
              <button
                onClick={() => setHeaderViewMode('raw')}
                className={`px-3 py-1 rounded ${
                  headerViewMode === 'raw'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                Raw
              </button>
            </div>

            {headerViewMode === 'parsed' ? (
              <div className="space-y-1 text-xs font-mono">
                {email.headers.map((h, i) => {
                  const headerKey = h.key.toLowerCase();
                  const description = HEADER_DESCRIPTIONS[headerKey];
                  return (
                    <div
                      key={i}
                      className="relative flex gap-2 group"
                      onMouseEnter={() => setHoveredHeader(`${headerKey}-${i}`)}
                      onMouseLeave={() => setHoveredHeader(null)}
                    >
                      <span
                        className={`shrink-0 ${
                          description
                            ? 'text-blue-400 cursor-help border-b border-dashed border-blue-400/50'
                            : 'text-blue-400'
                        }`}
                      >
                        {h.key}:
                      </span>
                      <span className="text-gray-300 break-all">{h.value}</span>
                      {/* ツールチップ */}
                      {description && hoveredHeader === `${headerKey}-${i}` && (
                        <div className="absolute left-0 bottom-full mb-1 z-10 max-w-md p-2 bg-gray-900 border border-gray-600 rounded shadow-lg text-xs text-gray-200">
                          {description}
                        </div>
                      )}
                    </div>
                  );
                })}
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
