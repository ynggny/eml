import { useState, useCallback } from 'react';
import { DropZone } from './components/DropZone';
import { EmailViewer } from './components/EmailViewer';
import { AuthResults } from './components/AuthResults';
import { HashInfo } from './components/HashInfo';
import { DomainVerification } from './components/DomainVerification';
import { ThreadView } from './components/ThreadView';
import { ReceivedPath } from './components/ReceivedPath';
import { HeaderInsights } from './components/HeaderInsights';
import { HeaderVerification } from './components/HeaderVerification';
import {
  parseEML,
  parseAuthResults,
  extractDkimSelector,
  extractDomain,
  type ParsedEmail,
} from './utils/emlParser';
import { computeSHA256 } from './utils/hashUtils';
import { storeEml, type StoreResponse } from './utils/api';

interface EmailData {
  email: ParsedEmail;
  hash: string;
  rawData: ArrayBuffer;
  storeResult?: StoreResponse;
}

function App() {
  const [emails, setEmails] = useState<EmailData[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFilesSelect = useCallback(async (files: File[]) => {
    setIsLoading(true);
    setError(null);

    try {
      const results: EmailData[] = [];

      for (const file of files) {
        const arrayBuffer = await file.arrayBuffer();
        const [parsedEmail, fileHash] = await Promise.all([
          parseEML(arrayBuffer),
          computeSHA256(arrayBuffer),
        ]);

        // R2/D1に保存を試行（失敗しても続行）
        let storeResult: StoreResponse | undefined;
        try {
          storeResult = await storeEml(arrayBuffer, {
            from_domain: extractDomain(parsedEmail.from?.address) ?? undefined,
            subject_preview: parsedEmail.subject?.slice(0, 100) ?? undefined,
          });
        } catch (storeError) {
          // 保存失敗はログのみ、処理は継続
          console.warn('EML保存に失敗:', storeError);
        }

        results.push({
          email: parsedEmail,
          hash: fileHash,
          rawData: arrayBuffer,
          storeResult,
        });
      }

      // 日付順にソート（新しい順）
      results.sort((a, b) => {
        const dateA = a.email.date ? new Date(a.email.date).getTime() : 0;
        const dateB = b.email.date ? new Date(b.email.date).getTime() : 0;
        return dateB - dateA;
      });

      setEmails(results);
      setSelectedIndex(0);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'ファイルの解析に失敗しました'
      );
      setEmails([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleReset = () => {
    setEmails([]);
    setSelectedIndex(0);
    setError(null);
  };

  const selectedEmail = emails[selectedIndex];
  const authResults = selectedEmail
    ? parseAuthResults(selectedEmail.email.headers)
    : null;
  const fromDomain = selectedEmail
    ? extractDomain(selectedEmail.email.from?.address)
    : null;
  const dkimSelector = selectedEmail
    ? extractDkimSelector(selectedEmail.email.headers)
    : undefined;

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* ヘッダー */}
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-white">EML Viewer</h1>
          <p className="text-gray-400 text-sm mt-1">
            メールファイルの閲覧・検証ツール
          </p>
        </header>

        {/* メインコンテンツ */}
        {emails.length === 0 && !isLoading && (
          <div className="space-y-6">
            <DropZone onFilesSelect={handleFilesSelect} />

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
                <li>・監査対応のため、ファイルは暗号化して一時保管されます</li>
                <li>・90日後に自動削除されます</li>
                <li>・個人情報は収集していません</li>
              </ul>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4" />
              <p className="text-gray-400 text-sm">ファイルを処理中...</p>
            </div>
          </div>
        )}

        {emails.length > 0 && selectedEmail && (
          <div className="space-y-6">
            {/* 操作バー */}
            <div className="flex justify-between items-center">
              <div className="text-sm text-gray-400">
                {emails.length}件のメールを読み込みました
              </div>
              <button
                onClick={handleReset}
                className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
              >
                別のファイルを開く
              </button>
            </div>

            {/* スレッドビュー（複数ファイル時のみ表示） */}
            {emails.length > 1 && (
              <ThreadView
                emails={emails.map((e) => e.email)}
                selectedIndex={selectedIndex}
                onSelect={setSelectedIndex}
              />
            )}

            {/* 認証結果とハッシュ */}
            <div className="grid md:grid-cols-2 gap-4">
              <AuthResults results={authResults} />
              <HashInfo hash={selectedEmail.hash} />
            </div>

            {/* DNS検証 */}
            <DomainVerification
              domain={fromDomain}
              dkimSelector={dkimSelector}
            />

            {/* メール経路 */}
            <ReceivedPath headers={selectedEmail.email.headers} />

            {/* ヘッダー分析 */}
            <div className="grid md:grid-cols-2 gap-4">
              <HeaderInsights
                headers={selectedEmail.email.headers}
                fromAddress={selectedEmail.email.from?.address ?? null}
              />
              <HeaderVerification headers={selectedEmail.email.headers} />
            </div>

            {/* メール本体 */}
            <EmailViewer email={selectedEmail.email} />
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
