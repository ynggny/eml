import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { AdminDashboard } from './pages/AdminDashboard';

function App() {
  const location = useLocation();
  const isAdmin = location.pathname.startsWith('/admin');

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* ヘッダー */}
        <header className="mb-8 flex items-center justify-between">
          <div>
            <Link to="/" className="text-2xl font-bold text-white hover:text-blue-400 transition-colors">
              EML Viewer
            </Link>
            <p className="text-gray-400 text-sm mt-1">
              メールファイルの閲覧・検証ツール
            </p>
          </div>
          <nav>
            <Link
              to={isAdmin ? '/' : '/admin'}
              className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
            >
              {isAdmin ? 'ビューアに戻る' : '管理画面'}
            </Link>
          </nav>
        </header>

        {/* メインコンテンツ */}
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/admin" element={<AdminDashboard />} />
        </Routes>
      </div>
    </div>
  );
}

export default App;
