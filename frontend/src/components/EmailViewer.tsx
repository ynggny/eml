import { useState } from 'react';
import type { ParsedEmail } from '../utils/emlParser';

interface EmailViewerProps {
  email: ParsedEmail;
}

type ViewMode = 'html' | 'text' | 'headers';

export function EmailViewer({ email }: EmailViewerProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('html');

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
          <div className="space-y-1 text-xs font-mono">
            {email.headers.map((h, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-blue-400 shrink-0">{h.key}:</span>
                <span className="text-gray-300 break-all">{h.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
