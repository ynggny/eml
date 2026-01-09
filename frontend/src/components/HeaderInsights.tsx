import type { Header } from '../utils/emlParser';

interface HeaderInsightsProps {
  headers: Header[];
  fromAddress: string | null;
}

interface InsightItem {
  label: string;
  value: string;
  type: 'info' | 'warning' | 'danger';
  description?: string;
}

export function HeaderInsights({ headers, fromAddress }: HeaderInsightsProps) {
  const getHeader = (key: string): string | undefined => {
    const header = headers.find((h) => h.key.toLowerCase() === key.toLowerCase());
    return header?.value;
  };

  const extractEmail = (value: string | undefined): string | null => {
    if (!value) return null;
    const match = value.match(/<([^>]+)>/) || value.match(/([^\s<>]+@[^\s<>]+)/);
    return match ? match[1] : null;
  };

  const extractDomain = (email: string | null): string | null => {
    if (!email) return null;
    const parts = email.split('@');
    return parts.length > 1 ? parts[1].toLowerCase() : null;
  };

  const insights: InsightItem[] = [];

  // メールクライアント情報
  const xMailer = getHeader('x-mailer') || getHeader('user-agent');
  if (xMailer) {
    insights.push({
      label: 'メールクライアント',
      value: xMailer,
      type: 'info',
    });
  }

  // Return-Path vs From 比較
  const returnPath = getHeader('return-path');
  const returnPathEmail = extractEmail(returnPath);
  const returnPathDomain = extractDomain(returnPathEmail);
  const fromDomain = extractDomain(fromAddress);

  if (returnPathEmail && fromAddress) {
    if (returnPathDomain !== fromDomain) {
      insights.push({
        label: 'Return-Path',
        value: `${returnPathEmail} (Fromと異なるドメイン)`,
        type: 'warning',
        description: 'バウンスメールの返送先がFromと異なります。正当な理由がある場合もあります。',
      });
    } else {
      insights.push({
        label: 'Return-Path',
        value: returnPathEmail,
        type: 'info',
      });
    }
  }

  // Reply-To vs From 比較
  const replyTo = getHeader('reply-to');
  const replyToEmail = extractEmail(replyTo);
  const replyToDomain = extractDomain(replyToEmail);

  if (replyToEmail && fromAddress) {
    if (replyToDomain !== fromDomain) {
      insights.push({
        label: 'Reply-To',
        value: `${replyToEmail} (Fromと異なるドメイン)`,
        type: 'danger',
        description: '返信先がFromと異なります。フィッシングの可能性があります。',
      });
    }
  }

  // List関連ヘッダー
  const listUnsubscribe = getHeader('list-unsubscribe');
  if (listUnsubscribe) {
    insights.push({
      label: '購読解除',
      value: listUnsubscribe.length > 60 ? listUnsubscribe.slice(0, 60) + '...' : listUnsubscribe,
      type: 'info',
      description: 'メーリングリストの購読を解除できます',
    });
  }

  const listId = getHeader('list-id');
  if (listId) {
    insights.push({
      label: 'リストID',
      value: listId,
      type: 'info',
    });
  }

  // 優先度
  const priority = getHeader('x-priority') || getHeader('importance');
  if (priority) {
    const isHigh = priority.includes('1') || priority.toLowerCase().includes('high');
    insights.push({
      label: '優先度',
      value: priority,
      type: isHigh ? 'warning' : 'info',
    });
  }

  // スパムスコア
  const spamStatus = getHeader('x-spam-status');
  const spamScore = getHeader('x-spam-score');
  if (spamStatus || spamScore) {
    const isSpam = spamStatus?.toLowerCase().includes('yes') ||
                   (spamScore && parseFloat(spamScore) > 5);
    insights.push({
      label: 'スパム判定',
      value: spamStatus || `スコア: ${spamScore}`,
      type: isSpam ? 'danger' : 'info',
    });
  }

  // X-Originating-IP
  const originatingIp = getHeader('x-originating-ip');
  if (originatingIp) {
    const cleanIp = originatingIp.replace(/[\[\]]/g, '');
    insights.push({
      label: '送信元IP',
      value: cleanIp,
      type: 'info',
    });
  }

  // Message-ID ドメイン確認
  const messageId = getHeader('message-id');
  if (messageId && fromDomain) {
    const messageIdDomain = extractDomain(messageId.replace(/[<>]/g, ''));
    if (messageIdDomain && messageIdDomain !== fromDomain) {
      insights.push({
        label: 'Message-ID',
        value: `ドメイン: ${messageIdDomain} (Fromと異なる)`,
        type: 'warning',
        description: 'Message-IDのドメインがFromと異なります。正当な理由がある場合もあります。',
      });
    }
  }

  if (insights.length === 0) {
    return null;
  }

  const getTypeStyles = (type: InsightItem['type']) => {
    switch (type) {
      case 'danger':
        return 'bg-red-900/30 border-red-700 text-red-300';
      case 'warning':
        return 'bg-yellow-900/30 border-yellow-700 text-yellow-300';
      default:
        return 'bg-gray-700/50 border-gray-600 text-gray-300';
    }
  };

  const getIconForType = (type: InsightItem['type']) => {
    switch (type) {
      case 'danger':
        return (
          <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        );
      case 'warning':
        return (
          <svg className="w-4 h-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      default:
        return (
          <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  return (
    <div className="p-4 bg-gray-800 rounded-lg">
      <h3 className="text-sm font-semibold text-gray-400 mb-3">
        ヘッダー分析
      </h3>
      <div className="space-y-2">
        {insights.map((insight, i) => (
          <div
            key={i}
            className={`flex items-start gap-2 p-2 rounded border ${getTypeStyles(insight.type)}`}
          >
            <div className="shrink-0 mt-0.5">{getIconForType(insight.type)}</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-medium text-gray-400">{insight.label}:</span>
                <span className="text-xs break-all">{insight.value}</span>
              </div>
              {insight.description && (
                <p className="text-xs text-gray-500 mt-1">{insight.description}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
