import { useState, useCallback } from 'react';
import { DropZone } from './components/DropZone';
import { EmailViewer } from './components/EmailViewer';
import { AuthResults } from './components/AuthResults';
import { HashInfo } from './components/HashInfo';
import { parseEML, parseAuthResults, type ParsedEmail } from './utils/emlParser';
import { computeSHA256 } from './utils/hashUtils';

function App() {
  const [email, setEmail] = useState<ParsedEmail | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = useCallback(async (file: File) => {
    setIsLoading(true);
    setError(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const [parsedEmail, fileHash] = await Promise.all([
        parseEML(arrayBuffer),
        computeSHA256(arrayBuffer),
      ]);
      setEmail(parsedEmail);
      setHash(fileHash);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'ファイルの解析に失敗しました'
      );
      setEmail(null);
      setHash(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleReset = () => {
    setEmail(null);
    setHash(null);
    setError(null);
  };

  const authResults = email ? parseAuthResults(email.headers) : null;

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* ヘッダー */}
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-white">EML Viewer</h1>
          <p className="text-gray-400 text-sm mt-1">
            メールファイルの閲覧・検証ツール
          </p>
        </header>

        {/* メインコンテンツ */}
        {!email && !isLoading && (
          <div className="space-y-6">
            <DropZone onFileSelect={handleFileSelect} />

            {error && (
              <div className="p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">
                {error}
              </div>
            )}

            {/* プライバシー表示 */}
            <div className="p-4 bg-gray-800/50 rounded-lg text-sm text-gray-400">
              <p className="font-medium mb-2">プライバシーについて</p>
              <ul className="space-y-1 text-xs">
                <li>・ファイルはブラウザ内で処理されます</li>
                <li>・個人情報は収集していません</li>
                <li>・DNS検証時のみサーバーと通信します</li>
              </ul>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
          </div>
        )}

        {email && (
          <div className="space-y-6">
            {/* 操作バー */}
            <div className="flex justify-end">
              <button
                onClick={handleReset}
                className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
              >
                別のファイルを開く
              </button>
            </div>

            {/* 認証結果とハッシュ */}
            <div className="grid md:grid-cols-2 gap-4">
              <AuthResults results={authResults} />
              <HashInfo hash={hash} />
            </div>

            {/* メール本体 */}
            <EmailViewer email={email} />
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
