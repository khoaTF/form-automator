import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import EventEmitter from 'events';
import process from 'process';
import fs from 'fs';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

let currentProcess = null;
const logEmitter = new EventEmitter();
const logHistory = [];

const addLog = (message) => {
    if (logHistory.length > 1000) logHistory.shift();
    logHistory.push(message);
    logEmitter.emit('log', message);
};

app.post('/api/parse', async (req, res) => {
    try {
        const { formUrl } = req.body;
        if (!formUrl) return res.status(400).json({ error: 'URL không được để trống' });
        
        const response = await fetch(formUrl);
        const html = await response.text();
        const match = html.match(/var FB_PUBLIC_LOAD_DATA_ = (\[.*?\]);\s*<\/script>/s);
        if (!match) return res.status(400).json({ error: "Không tìm thấy cấu trúc dữ liệu form (FB_PUBLIC_LOAD_DATA_)" });
        
        const parsed = JSON.parse(match[1]);
        const items = parsed[1][1];
        
        const questions = [];
        items.forEach(item => {
            const type = item[3];
            const title = item[1] || '';
            const desc = item[2] || '';
            if (item[4] && item[4][0]) {
                const questionId = item[4][0][0];
                let choicesRaw = item[4][0][1] || [];
                
                // Trường hợp Linear Scale (type 5 đôi khi không có choices rõ ràng, thường là null nếu lấy từ raw array chưa convert, nhưng nếu fetch có array, nó hiển thị dạng mảng [text, null])
                const choices = choicesRaw.map(c => typeof c === 'string' ? c : (c && c[0] ? c[0] : null)).filter(c => c && c.toString().trim() !== '');
                const hasOther = item[4][0][2] === true || item[4][0][2] === 1;
                if (hasOther) choices.push('__other_option__');

                // Lấy các câu hỏi trắc nghiệm / Likert (có choices)
                if (choices.length > 0) {
                    questions.push({
                        id: parseInt(questionId),
                        title,
                        type,
                        // Hiển thị 'Tuỳ chọn Khác' thân thiện trên Giao diện
                        choices: choices.map(c => ({ value: c === '__other_option__' ? 'Mục: Khác' : c, weight: Math.round(100 / choices.length) }))
                    });
                }
            }
        });
        
        res.json({ questions });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/start', (req, res) => {
    if (currentProcess) {
        return res.status(400).json({ error: 'System is already running' });
    }

    const { targetResponses, concurrency, formUrl, customRatios } = req.body;
    
    // Ghi cấu hình người dùng ra file tạm
    if (customRatios) {
        fs.writeFileSync('config.json', JSON.stringify(customRatios, null, 2), 'utf8');
    } else {
        if (fs.existsSync('config.json')) fs.unlinkSync('config.json');
    }
    
    logHistory.length = 0;
    addLog(`=== KHỞI ĐỘNG HỆ THỐNG SPAM FORM (SPSS MODE) ===`);
    addLog(`Link: ${formUrl || 'Chưa nhập'}`);
    addLog(`Target: ${targetResponses} | Concurrency: ${concurrency} | Chế độ: Direct HTTP POST`);

    const env = {
        ...process.env,
        TARGET_RESPONSES: targetResponses || '100',
        CONCURRENCY: concurrency || '15',
        FORM_URL: formUrl || ''
    };

    try {
        currentProcess = spawn(process.execPath, ['fillform.mjs'], { env, cwd: process.cwd() });
        
        currentProcess.stdout.on('data', (data) => {
            const lines = data.toString().split('\n');
            lines.forEach(line => {
                if (line.trim()) addLog(line.trim());
            });
        });

        currentProcess.stderr.on('data', (data) => {
            const lines = data.toString().split('\n');
            lines.forEach(line => {
                if (line.trim()) addLog(`[ERROR] ${line.trim()}`);
            });
        });

        currentProcess.on('close', (code) => {
            addLog(`=== HỆ THỐNG ĐÃ KẾT THÚC (Mã: ${code}) ===`);
            currentProcess = null;
            logEmitter.emit('stopped');
        });

        logEmitter.emit('started');
        res.json({ success: true, message: 'Process started successfully' });
    } catch (error) {
        currentProcess = null;
        res.status(500).json({ error: 'Failed to start process: ' + error.message });
    }
});

app.post('/api/stop', (req, res) => {
    if (!currentProcess) {
        return res.status(400).json({ error: 'System is not running' });
    }
    
    addLog(`Đang gửi tín hiệu FORCE STOP...`);
    
    try {
        if (process.platform === 'win32') {
            import('child_process').then(cp => {
                cp.exec(`taskkill /pid ${currentProcess.pid} /t /f`);
            });
        } else {
            currentProcess.kill('SIGKILL');
        }
        currentProcess = null;
        logEmitter.emit('stopped');
        res.json({ success: true, message: 'Stop signal sent' });
    } catch (err) {
        addLog(`[LỖI] Không thể tắt Process.`);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/logs', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    res.write(`data: ${JSON.stringify({ type: 'history', data: logHistory })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: 'status', data: { isRunning: !!currentProcess } })}\n\n`);

    const logListener = (msg) => { res.write(`data: ${JSON.stringify({ type: 'log', data: msg })}\n\n`); };
    const stopListener = () => { res.write(`data: ${JSON.stringify({ type: 'status', data: { isRunning: false } })}\n\n`); };
    const startListener = () => { res.write(`data: ${JSON.stringify({ type: 'status', data: { isRunning: true } })}\n\n`); };

    logEmitter.on('log', logListener);
    logEmitter.on('stopped', stopListener);
    logEmitter.on('started', startListener);

    req.on('close', () => {
        logEmitter.off('log', logListener);
        logEmitter.off('stopped', stopListener);
        logEmitter.off('started', startListener);
    });
});

app.listen(PORT, () => {
    console.log(`Command Server running on http://localhost:${PORT}`);
});
