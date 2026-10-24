import React, { useState, useEffect } from 'react';
import './AdminPanel.css';

const API_BASE = 'http://localhost:5000';

const AdminPanel = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  // 提示词相关状态
  const [prompt, setPrompt] = useState('');
  const [promptLoading, setPromptLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  // 版本历史相关状态
  const [versions, setVersions] = useState([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  
  // 审计日志相关状态
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // 登录处理
  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      const response = await fetch(`${API_BASE}/api/admin/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });
      
      if (!response.ok) {
        throw new Error('登录失败');
      }
      
      const data = await response.json();
      localStorage.setItem('adminToken', data.token);
      setIsLoggedIn(true);
      loadCurrentPrompt();
      loadVersions();
      loadAuditLogs();
    } catch (err) {
      setError('登录失败，请检查用户名和密码');
    } finally {
      setLoading(false);
    }
  };

  // 加载当前提示词
  const loadCurrentPrompt = async () => {
    setPromptLoading(true);
    try {
      const token = localStorage.getItem('adminToken');
      const response = await fetch(`${API_BASE}/api/admin/prompt`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setPrompt(data.prompt);
      }
    } catch (err) {
      console.error('加载提示词失败:', err);
    } finally {
      setPromptLoading(false);
    }
  };

  // 保存提示词
  const handleSavePrompt = async () => {
    setSaveSuccess(false);
    setPromptLoading(true);
    
    try {
      const token = localStorage.getItem('adminToken');
      const response = await fetch(`${API_BASE}/api/admin/prompt`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ prompt })
      });
      
      if (response.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
        loadVersions();
        loadAuditLogs();
      } else {
        throw new Error('保存失败');
      }
    } catch (err) {
      setError('保存失败，请重试');
    } finally {
      setPromptLoading(false);
    }
  };

  // 加载版本历史
  const loadVersions = async () => {
    setVersionsLoading(true);
    try {
      const token = localStorage.getItem('adminToken');
      const response = await fetch(`${API_BASE}/api/admin/versions`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setVersions(data);
      }
    } catch (err) {
      console.error('加载版本历史失败:', err);
    } finally {
      setVersionsLoading(false);
    }
  };

  // 加载审计日志
  const loadAuditLogs = async () => {
    setAuditLoading(true);
    try {
      const token = localStorage.getItem('adminToken');
      const response = await fetch(`${API_BASE}/api/admin/audit`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setAuditLogs(data);
      }
    } catch (err) {
      console.error('加载审计日志失败:', err);
    } finally {
      setAuditLoading(false);
    }
  };

  // 恢复版本
  const handleRestoreVersion = async (versionId) => {
    setPromptLoading(true);
    try {
      const token = localStorage.getItem('adminToken');
      const response = await fetch(`${API_BASE}/api/admin/restore-version`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ versionId })
      });
      
      if (response.ok) {
        const data = await response.json();
        setPrompt(data.prompt);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
        loadVersions();
        loadAuditLogs();
      } else {
        throw new Error('恢复失败');
      }
    } catch (err) {
      setError('恢复失败，请重试');
    } finally {
      setPromptLoading(false);
    }
  };

  // 登出
  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    setIsLoggedIn(false);
    setUsername('');
    setPassword('');
    setPrompt('');
    setVersions([]);
    setAuditLogs([]);
  };

  // 检查登录状态
  useEffect(() => {
    const token = localStorage.getItem('adminToken');
    if (token) {
      setIsLoggedIn(true);
      loadCurrentPrompt();
      loadVersions();
      loadAuditLogs();
    }
  }, []);

  if (!isLoggedIn) {
    return (
      <div className="admin-login-container">
        <div className="admin-login-form">
          <h2>管理员登录</h2>
          {error && <div className="admin-error">{error}</div>}
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label>用户名</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="admin-login-button" disabled={loading}>
              {loading ? '登录中...' : '登录'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <h1>系统提示词管理</h1>
        <button className="admin-logout-button" onClick={handleLogout}>
          登出
        </button>
      </div>
      
      <div className="admin-content">
        {/* 提示词编辑 */}
        <div className="admin-section">
          <h2>提示词编辑</h2>
          <div className="prompt-editor">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="输入AI系统提示词..."
              maxLength={2000}
              disabled={promptLoading}
            />
            <div className="prompt-footer">
              <span className="char-count">{prompt.length}/2000</span>
              <button 
                className="save-button" 
                onClick={handleSavePrompt}
                disabled={promptLoading || !prompt.trim()}
              >
                {promptLoading ? '保存中...' : '保存'}
              </button>
            </div>
            {saveSuccess && <div className="success-message">保存成功！</div>}
          </div>
        </div>
        
        {/* 版本历史 */}
        <div className="admin-section">
          <h2>版本历史</h2>
          {versionsLoading ? (
            <div className="loading">加载中...</div>
          ) : (
            <div className="versions-list">
              {versions.map((version) => (
                <div key={version.id} className="version-item">
                  <div className="version-info">
                    <div className="version-date">{new Date(version.timestamp).toLocaleString()}</div>
                    <div className="version-user">{version.user}</div>
                  </div>
                  <div className="version-content">{version.content.substring(0, 100)}...</div>
                  <button 
                    className="restore-button"
                    onClick={() => handleRestoreVersion(version.id)}
                  >
                    恢复此版本
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* 审计日志 */}
        <div className="admin-section">
          <h2>审计日志</h2>
          {auditLoading ? (
            <div className="loading">加载中...</div>
          ) : (
            <div className="audit-list">
              {auditLogs.map((log) => (
                <div key={log.id} className="audit-item">
                  <div className="audit-date">{new Date(log.timestamp).toLocaleString()}</div>
                  <div className="audit-action">{log.action}</div>
                  <div className="audit-user">{log.user}</div>
                  {log.details && <div className="audit-details">{log.details}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;