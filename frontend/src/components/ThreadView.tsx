import type { ParsedEmail } from '../utils/emlParser';

interface ThreadViewProps {
  emails: ParsedEmail[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

export function ThreadView({
  emails,
  selectedIndex,
  onSelect,
}: ThreadViewProps) {
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleDateString('ja-JP', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-400">
        スレッド ({emails.length}件)
      </h3>
      <div className="space-y-1">
        {emails.map((email, i) => (
          <button
            key={i}
            onClick={() => onSelect(i)}
            className={`w-full text-left p-3 rounded-lg transition-colors ${
              i === selectedIndex
                ? 'bg-blue-600/20 border border-blue-500/50'
                : 'bg-gray-800 hover:bg-gray-700'
            }`}
          >
            <div className="flex justify-between items-start gap-2">
              <span className="text-sm text-gray-300 truncate">
                {email.from?.name ?? email.from?.address ?? 'Unknown'}
              </span>
              <span className="text-xs text-gray-500 shrink-0">
                {formatDate(email.date)}
              </span>
            </div>
            <div className="text-xs text-gray-400 truncate mt-1">
              {email.subject ?? '(件名なし)'}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
