import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import HomePage from './pages/HomePage';
import ConfigPage from './pages/ConfigPage';
import ToolPage from './pages/ToolPage';
import { buildUserId } from './utils';
import { fetchTools, fetchToolData, ensureToolDataExists } from './api';
import type { ToolConfigRecord } from './types';

function App() {
  const [userId, setUserId] = useState<string>('');
  const [tools, setTools] = useState<ToolConfigRecord>({});
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const id = buildUserId();
    setUserId(id);
  }, []);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    fetchTools(userId)
      .then(setTools)
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    Object.keys(tools).forEach((toolId) => {
      ensureToolDataExists(userId, toolId).catch(console.error);
    });
  }, [tools, userId]);

  const toolCount = useMemo(() => Object.keys(tools).length, [tools]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1 className="page-title">EDA QOR 性能监控</h1>
          <p className="page-description">支持工具配置、单线程/多线程/对比视图、数据缓存与用户独立存储。</p>
        </div>
        <nav className="inline-row">
          <Link className="action-button" to="/">首页</Link>
          <Link className="action-button" to="/config">配置</Link>
          {toolCount > 0 && <button className="secondary-button" onClick={() => navigate('/')}>刷新</button>}
        </nav>
      </header>

      <main className="page-content">
        {loading ? (
          <div className="card">加载中...</div>
        ) : (
          <Routes>
            <Route path="/" element={<HomePage tools={tools} userId={userId} />} />
            <Route path="/config" element={<ConfigPage tools={tools} setTools={setTools} userId={userId} />} />
            <Route path="/tool/:toolId" element={<ToolPage userId={userId} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
      </main>
    </div>
  );
}

export default App;
