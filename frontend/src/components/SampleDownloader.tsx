import { useState, useCallback } from 'react';
import {
  sampleEmls,
  downloadSample,
  downloadRandomSample,
  createEmlBlob,
  type SampleEml,
} from '../data/sampleEmls';

interface SampleDownloaderProps {
  /** ダウンロード後にファイルを自動で読み込む */
  onLoadSample?: (file: File) => void;
}

// 危険レベルの表示
const dangerLevelLabels: Record<number, { label: string; color: string; bg: string }> = {
  1: { label: '安全', color: 'text-green-400', bg: 'bg-green-500/20' },
  2: { label: '注意', color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
  3: { label: '警告', color: 'text-orange-400', bg: 'bg-orange-500/20' },
  4: { label: '危険', color: 'text-red-400', bg: 'bg-red-500/20' },
  5: { label: '超危険', color: 'text-red-500', bg: 'bg-red-600/30' },
};

// カテゴリの表示
const categoryLabels: Record<SampleEml['category'], { label: string; icon: string }> = {
  safe: { label: '正常', icon: '✅' },
  auth: { label: '認証', icon: '🔐' },
  phishing: { label: 'フィッシング', icon: '🎣' },
  bec: { label: 'BEC詐欺', icon: '💼' },
  attachment: { label: '添付ファイル', icon: '📎' },
  combo: { label: '複合', icon: '💀' },
};

export function SampleDownloader({ onLoadSample }: SampleDownloaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<SampleEml['category'] | 'all'>('all');
  const [lastDownloaded, setLastDownloaded] = useState<SampleEml | null>(null);

  // サンプルをダウンロード
  const handleDownload = useCallback((sample: SampleEml) => {
    downloadSample(sample);
    setLastDownloaded(sample);
  }, []);

  // サンプルを直接読み込む
  const handleLoad = useCallback((sample: SampleEml) => {
    if (onLoadSample) {
      const blob = createEmlBlob(sample);
      const file = new File([blob], `${sample.id}.eml`, { type: 'message/rfc822' });
      onLoadSample(file);
      setIsOpen(false);
      setLastDownloaded(sample);
    }
  }, [onLoadSample]);

  // ランダムダウンロード
  const handleRandomDownload = useCallback(() => {
    const sample = downloadRandomSample();
    setLastDownloaded(sample);
  }, []);

  // ランダム読み込み
  const handleRandomLoad = useCallback(() => {
    if (onLoadSample) {
      const sample = sampleEmls[Math.floor(Math.random() * sampleEmls.length)];
      const blob = createEmlBlob(sample);
      const file = new File([blob], `${sample.id}.eml`, { type: 'message/rfc822' });
      onLoadSample(file);
      setIsOpen(false);
      setLastDownloaded(sample);
    }
  }, [onLoadSample]);

  // フィルタリングされたサンプル
  const filteredSamples = selectedCategory === 'all'
    ? sampleEmls
    : sampleEmls.filter(s => s.category === selectedCategory);

  return (
    <div className="relative">
      {/* トリガーボタン */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-lg text-sm font-medium transition-all shadow-lg hover:shadow-purple-500/25"
      >
        <span className="text-lg">🧪</span>
        <span>サンプルEML</span>
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* ドロップダウンパネル */}
      {isOpen && (
        <>
          {/* オーバーレイ */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* パネル */}
          <div className="absolute right-0 mt-2 w-[480px] max-h-[70vh] overflow-hidden bg-gray-800 border border-gray-700 rounded-xl shadow-2xl z-50">
            {/* ヘッダー */}
            <div className="sticky top-0 bg-gray-800/95 backdrop-blur border-b border-gray-700 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <span>🧪</span>
                  サンプルEMLラボ
                </h3>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 hover:bg-gray-700 rounded"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* ランダムボタン */}
              <div className="flex gap-2 mb-3">
                <button
                  onClick={handleRandomLoad}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 rounded-lg text-sm font-medium transition-all"
                >
                  <span>🎲</span>
                  ランダムで開く
                </button>
                <button
                  onClick={handleRandomDownload}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-all"
                >
                  <span>📥</span>
                  DL
                </button>
              </div>

              {/* カテゴリフィルター */}
              <div className="flex gap-1 flex-wrap">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                    selectedCategory === 'all'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  すべて
                </button>
                {Object.entries(categoryLabels).map(([key, { label, icon }]) => (
                  <button
                    key={key}
                    onClick={() => setSelectedCategory(key as SampleEml['category'])}
                    className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                      selectedCategory === key
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {icon} {label}
                  </button>
                ))}
              </div>
            </div>

            {/* サンプルリスト */}
            <div className="overflow-y-auto max-h-[50vh] p-2">
              {filteredSamples.map((sample) => {
                const danger = dangerLevelLabels[sample.dangerLevel];
                const category = categoryLabels[sample.category];

                return (
                  <div
                    key={sample.id}
                    className={`p-3 rounded-lg mb-2 border transition-all hover:border-gray-600 ${
                      lastDownloaded?.id === sample.id
                        ? 'border-purple-500 bg-purple-500/10'
                        : 'border-gray-700 bg-gray-750'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg">{category.icon}</span>
                          <span className="font-medium">{sample.name}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${danger.bg} ${danger.color}`}>
                            Lv.{sample.dangerLevel} {danger.label}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400">{sample.description}</p>
                      </div>
                      <div className="flex gap-1">
                        {onLoadSample && (
                          <button
                            onClick={() => handleLoad(sample)}
                            className="px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs font-medium transition-all"
                            title="このサンプルを開く"
                          >
                            開く
                          </button>
                        )}
                        <button
                          onClick={() => handleDownload(sample)}
                          className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs transition-all"
                          title="EMLファイルをダウンロード"
                        >
                          📥
                        </button>
                      </div>
                    </div>

                    {/* 体感できる機能タグ */}
                    <div className="flex flex-wrap gap-1">
                      {sample.features.map((feature) => (
                        <span
                          key={feature}
                          className="px-1.5 py-0.5 bg-gray-700 rounded text-[10px] text-gray-400"
                        >
                          {feature}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* フッター */}
            <div className="sticky bottom-0 bg-gray-800/95 backdrop-blur border-t border-gray-700 p-3">
              <p className="text-xs text-gray-500 text-center">
                これらはツールの機能を体験するためのサンプルです。
                <br />
                実際の攻撃メールではありません。
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
