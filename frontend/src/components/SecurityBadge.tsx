/**
 * セキュリティ認証バッジ生成コンポーネント
 * 検証結果を画像化してダウンロード・共有できるようにする
 */

import { useRef, useEffect, useState } from 'react';
import type { SecurityScore } from '../utils/securityAnalysis';

interface SecurityBadgeProps {
  score: SecurityScore;
  fromDomain: string | null;
  subject: string | null;
  hash: string;
}

export function SecurityBadge({ score, fromDomain, subject, hash }: SecurityBadgeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // キャンバスサイズ
    const width = 600;
    const height = 320;
    canvas.width = width;
    canvas.height = height;

    // 背景
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#1F2937');
    gradient.addColorStop(1, '#111827');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // 枠線
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, width - 2, height - 2);

    // タイトル
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText('EML Viewer セキュリティレポート', 20, 30);

    // スコア円
    const centerX = 100;
    const centerY = 130;
    const radius = 50;

    // 背景円
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#374151';
    ctx.fill();

    // スコア弧
    const scoreRatio = score.score / 100;
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + (Math.PI * 2 * scoreRatio);

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, startAngle, endAngle);
    ctx.strokeStyle = getGradeColor(score.grade);
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.stroke();

    // グレード
    ctx.fillStyle = getGradeColor(score.grade);
    ctx.font = 'bold 36px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(score.grade, centerX, centerY - 10);

    // スコア数値
    ctx.fillStyle = '#D1D5DB';
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText(`${score.score}/100`, centerX, centerY + 20);

    // 詳細情報
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    let y = 70;
    const x = 180;

    // ドメイン
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText('送信元ドメイン', x, y);
    ctx.fillStyle = '#F3F4F6';
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText(fromDomain ?? '不明', x, y + 16);
    y += 45;

    // 件名
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText('件名', x, y);
    ctx.fillStyle = '#F3F4F6';
    ctx.font = '14px system-ui, sans-serif';
    const truncatedSubject = subject
      ? (subject.length > 35 ? subject.slice(0, 35) + '...' : subject)
      : 'N/A';
    ctx.fillText(truncatedSubject, x, y + 16);
    y += 45;

    // ハッシュ
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText('SHA-256', x, y);
    ctx.fillStyle = '#F3F4F6';
    ctx.font = '11px monospace';
    ctx.fillText(hash.slice(0, 32) + '...', x, y + 16);

    // 認証結果バー
    y = 210;
    const factors = score.factors.slice(0, 6);
    const barWidth = 85;
    const barHeight = 8;
    const gap = 6;

    factors.forEach((factor, i) => {
      const barX = 16 + (barWidth + gap) * i;

      // ラベル
      ctx.fillStyle = '#9CA3AF';
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(factor.category, barX + barWidth / 2, y);

      // 背景バー
      ctx.fillStyle = '#374151';
      ctx.fillRect(barX, y + 14, barWidth, barHeight);

      // スコアバー
      const ratio = factor.score / factor.maxScore;
      ctx.fillStyle = getScoreColor(ratio);
      ctx.fillRect(barX, y + 14, barWidth * ratio, barHeight);

      // スコア
      ctx.fillStyle = '#D1D5DB';
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillText(`${factor.score}/${factor.maxScore}`, barX + barWidth / 2, y + 30);
    });

    // 判定ラベル
    const labelY = 270;
    ctx.textAlign = 'center';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillStyle = getGradeColor(score.grade);
    ctx.fillText(getGradeLabel(score.grade), width / 2, labelY);

    // 日時
    ctx.fillStyle = '#6B7280';
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`検証日時: ${new Date().toLocaleString('ja-JP')}`, width - 20, height - 15);

    // ロゴ/ブランド
    ctx.textAlign = 'left';
    ctx.fillStyle = '#4B5563';
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText('eml.ynggny.com', 20, height - 15);

    // 画像URLを生成
    setImageUrl(canvas.toDataURL('image/png'));
  }, [score, fromDomain, subject, hash]);

  const handleDownload = () => {
    if (!imageUrl) return;

    const link = document.createElement('a');
    link.download = `security-badge-${hash.slice(0, 8)}.png`;
    link.href = imageUrl;
    link.click();
  };

  const handleCopyToClipboard = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png')
      );

      if (blob) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob }),
        ]);
        alert('画像をクリップボードにコピーしました');
      }
    } catch {
      alert('クリップボードへのコピーに失敗しました');
    }
  };

  return (
    <div className="p-4 bg-gray-800 rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-400">
          セキュリティバッジ
        </h3>
        <div className="flex gap-2">
          <button
            onClick={handleCopyToClipboard}
            className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors"
          >
            コピー
          </button>
          <button
            onClick={handleDownload}
            className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 rounded transition-colors"
          >
            ダウンロード
          </button>
        </div>
      </div>

      <div className="flex justify-center">
        <canvas
          ref={canvasRef}
          className="max-w-full h-auto rounded border border-gray-700"
          style={{ maxHeight: '200px' }}
        />
      </div>
    </div>
  );
}

// ========================================
// ヘルパー関数
// ========================================

function getGradeColor(grade: SecurityScore['grade']): string {
  switch (grade) {
    case 'A': return '#22C55E';
    case 'B': return '#3B82F6';
    case 'C': return '#EAB308';
    case 'D': return '#F97316';
    case 'F': return '#EF4444';
  }
}

function getScoreColor(ratio: number): string {
  if (ratio >= 0.8) return '#22C55E';
  if (ratio >= 0.6) return '#3B82F6';
  if (ratio >= 0.4) return '#EAB308';
  if (ratio >= 0.2) return '#F97316';
  return '#EF4444';
}

function getGradeLabel(grade: SecurityScore['grade']): string {
  switch (grade) {
    case 'A': return '安全性: 非常に高い';
    case 'B': return '安全性: 高い';
    case 'C': return '安全性: 普通';
    case 'D': return '安全性: 要注意';
    case 'F': return '安全性: 危険';
  }
}
