import { useState, useRef, useEffect } from 'react';

const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

function App() {
  const [formUrl, setFormUrl] = useState('https://docs.google.com/forms/d/e/1FAIpQLSciXjTgph7A2cWbqG_lFtjtQlNFKXeSZeqH97Ktca3sk-ohTA/viewform?usp=dialog');
  const [numResponses, setNumResponses] = useState(100);
  const [concurrency, setConcurrency] = useState(5);
  const [questions, setQuestions] = useState([]);
  
  const [logs, setLogs] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const logEndRef = useRef(null);

  // Auto-scroll logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Setup SSE for real-time logs
  useEffect(() => {
    const eventSource = new EventSource(`${BACKEND_URL}/logs`);
    
    eventSource.onmessage = (event) => {
        try {
            const parsed = JSON.parse(event.data);
            if (parsed.type === 'log') {
                setLogs(prev => [...prev, parsed.data]);
            } else if (parsed.type === 'history') {
                setLogs(parsed.data);
            } else if (parsed.type === 'status') {
                setIsRunning(parsed.data.isRunning);
            }
        } catch (e) {
            console.error("SSE Parse Error", e);
        }
    };

    return () => eventSource.close();
  }, []);

  const parseForm = async () => {
    if (!formUrl) return;
    try {
        const res = await fetch(`${BACKEND_URL}/parse`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ formUrl })
        });
        if (!res.ok) {
            const data = await res.json();
            alert("Lỗi phân tích: " + data.error);
            return;
        }
        const data = await res.json();
        setQuestions(data.questions || []);
    } catch (e) {
        alert("Không thể kết nối đến server.");
    }
  };

  const handleWeightChange = (qIndex, cIndex, value) => {
      setQuestions(prev => {
          const newQ = [...prev];
          newQ[qIndex].choices[cIndex].weight = value;
          return newQ;
      });
  };

  const startAutomator = async () => {
    if (!formUrl) {
        alert("Vui lòng nhập URL Form!");
        return;
    }
    
    try {
        const customRatios = questions.length > 0 ? questions : null;
        const res = await fetch(`${BACKEND_URL}/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                formUrl,
                targetResponses: numResponses,
                concurrency,
                customRatios
            })
        });
        
        if (!res.ok) {
            const data = await res.json();
            alert("Lỗi khởi động: " + data.error);
        }
    } catch (e) {
        alert("Không thể kết nối đến server (3001). Bạn đã chạy node server.mjs chưa?");
    }
  }

  const stopAutomator = async () => {
      if (!window.confirm("Bạn có chắc chắn muốn ép dừng hệ thống?")) return;
      
      try {
        const res = await fetch(`${BACKEND_URL}/stop`, { method: 'POST' });
        if (!res.ok) {
            const data = await res.json();
            alert("Lỗi: " + data.error);
        }
      } catch (e) {
        alert("Không thể kết nối đến server (3001).");
      }
  }

  return (
    <>
      <div className="blob"></div>
      <div className="container">
          <header>
             <h1 className="title">Form Automator <span className="highlight">Pro</span></h1>
             <p className="subtitle">Hệ thống auto-fill bằng luồng Direct HTTP siêu tốc độ</p>
          </header>
          
          <div className="layout-grid">
            {/* Left Column - Configuration */}
            <div className="glass-panel config-panel">
              <div className="panel-header">
                 <h3>⚙️ Cấu Hình Động Cơ</h3>
              </div>

              <div className="form-group">
                <label>URL Google Form gốc</label>
                <div style={{display: 'flex', gap: '10px'}}>
                  <input 
                    type="text" 
                    className="input-field"
                    style={{ flex: 1 }}
                    placeholder="https://docs.google.com/forms/d/e/ID/viewform" 
                    value={formUrl}
                    onChange={e => setFormUrl(e.target.value)}
                    disabled={isRunning}
                  />
                  <button className="btn btn-primary" onClick={parseForm} disabled={isRunning || !formUrl}>
                    🔍 Phân Tích Form
                  </button>
                </div>
              </div>

              <div className="flex-row">
                <div className="form-group flex-1">
                    <label>Số lượng phiếu cần điền</label>
                    <input 
                      type="number" 
                      className="input-field"
                      min="1" 
                      value={numResponses}
                      onChange={e => setNumResponses(parseInt(e.target.value) || 1)}
                      disabled={isRunning}
                    />
                </div>
                
                <div className="form-group flex-1">
                    <label>Tốc độ (Luồng chạy ngầm)</label>
                    <input 
                      type="number" 
                      className="input-field"
                      min="1" 
                      max="50"
                      value={concurrency}
                      onChange={e => setConcurrency(parseInt(e.target.value) || 1)}
                      disabled={isRunning}
                    />
                </div>
              </div>
              
              {questions.length > 0 && (
                <div className="questions-panel" style={{ marginTop: '20px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '20px', maxHeight: '400px', overflowY: 'auto' }}>
                  <h4 style={{ marginBottom: '15px' }}>🔧 Trọng số phân bổ dữ liệu</h4>
                  {questions.map((q, qIndex) => (
                    <div key={q.id} style={{ marginBottom: '20px', padding: '15px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                      <strong style={{ display: 'block', marginBottom: '10px', color: '#ffb86c' }}>{q.title}</strong>
                      {q.choices.map((choice, cIndex) => (
                        <div key={cIndex} style={{ display: 'flex', alignItems: 'center', marginBottom: '8px', gap: '10px' }}>
                          <span style={{ flex: 1, fontSize: '0.9rem' }}>{choice.value}</span>
                          <input 
                            type="range" 
                            min="0" max="100" 
                            value={choice.weight}
                            onChange={(e) => handleWeightChange(qIndex, cIndex, parseInt(e.target.value) || 0)}
                            style={{ flex: 1 }}
                            disabled={isRunning}
                          />
                          <span style={{ width: '40px', textAlign: 'right', fontSize: '0.9rem', color: '#8be9fd' }}>{choice.weight}%</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              <div className="action-area" style={{ marginTop: '20px' }}>
                {!isRunning ? (
                    <button className="btn btn-primary" onClick={startAutomator}>
                       <span className="icon">🚀</span> KÍCH HOẠT HỆ THỐNG
                    </button>
                ) : (
                    <button className="btn btn-danger" onClick={stopAutomator}>
                       <span className="icon">🛑</span> TẠM DỪNG (KILL PROCESS)
                    </button>
                )}
              </div>
            </div>

            {/* Right Column - Logs */}
            <div className="glass-panel console-panel">
              <div className="panel-header space-between">
                <h3>💻 Live Console</h3>
                <span className={`status-badge ${isRunning ? 'running' : 'stopped'}`}>
                  {isRunning ? '🟢 Hệ thống Đang chạy' : '🔴 Trạng thái Tắt'}
                </span>
              </div>
              <div className="terminal">
                {logs.length === 0 ? (
                  <div className="terminal-placeholder">
                    &gt;_ Cổng 3001 đã mở. Đang chờ lệnh...
                  </div>
                ) : (
                  logs.map((log, i) => {
                      let typeObj = 'info';
                      if (log.includes('HOÀN THÀNH') || log.includes('✅') || log.includes('OK')) typeObj = 'success';
                      if (log.includes('LỖI') || log.includes('❌') || log.includes('[ERROR]')) typeObj = 'error';
                      if (log.includes('CẢNH BÁO') || log.includes('⚠')) typeObj = 'warn';
                      if (log.includes('======')) typeObj = 'highlight';
                      
                      return (
                        <div key={i} className={`terminal-line ${typeObj}`}>
                          {log}
                        </div>
                      );
                  })
                )}
                <div ref={logEndRef} />
              </div>
            </div>
          </div>
      </div>
    </>
  )
}

export default App;
