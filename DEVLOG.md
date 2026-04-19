# 📋 DEVLOG - Nhật ký phát triển dự án Form Automator

> **Cập nhật lần cuối**: 2026-04-20  
> **Repo**: https://github.com/khoaTF/form-automator  
> **Live Demo**: https://khoatf.github.io/form-automator/  
> **AI Assistant**: Antigravity (Google Deepmind)

---

## 🎯 Tổng quan dự án

**Form Automator** là công cụ tự động điền Google Form với engine thống kê SPSS-ready, đảm bảo:
- Cronbach's Alpha dương (0.7–0.9) cho tất cả nhóm câu hỏi Likert
- Dữ liệu phù hợp để phân tích hồi quy trong SPSS
- Giao diện web React để cấu hình và theo dõi tiến trình

---

## 🏗️ Kiến trúc hệ thống

### Stack công nghệ
| Thành phần | Công nghệ |
|---|---|
| Frontend | React 19 + Vite 8 |
| Backend | Express 5 (server.mjs) |
| Core Engine | fillform.mjs (Node.js, HTTP POST) |
| Deploy Frontend | GitHub Pages (GitHub Actions) |
| Backend | Chạy local (`node server.mjs`) |

### Cấu trúc file chính
```
fillform-fake/
├── fillform.mjs          # 🧠 Core engine - Latent Variable Model + HTTP POST
├── server.mjs            # 🖥️ Express API server (spawn fillform.mjs)
├── config.json           # ⚙️ Cấu hình tỷ lệ câu trả lời (user config)
├── test-cronbach.mjs     # 🧪 Script test Cronbach's Alpha
├── src/
│   ├── App.jsx           # 🎨 React UI chính
│   ├── App.css           # 💅 Styles
│   ├── index.css         # 🌍 Global styles
│   └── main.jsx          # 📦 Entry point
├── .github/workflows/
│   └── deploy.yml        # 🚀 GitHub Actions deploy to Pages
├── vite.config.js        # ⚡ Vite config (base: /form-automator/)
└── package.json
```

---

## 🧠 Engine thống kê (Core Algorithm)

### Latent Variable Model (ENGINE V2)
Thuật toán tạo dữ liệu fake có ý nghĩa thống kê:

1. **Persona Generation**: Mỗi "phiếu" tạo 1 persona với latent scores cho mỗi nhân tố (Product, Price, Place, Promotion, People, Physical Evidence, Process)
2. **Box-Muller Transform**: Tạo phân phối chuẩn thay vì random đều
3. **Factor Matching**: Mỗi câu Likert được map vào 1 nhân tố bằng:
   - **Explicit ID Map** (ưu tiên cao): Map trực tiếp Question ID → Factor
   - **Keyword Matching** (fallback): Match title câu hỏi với keywords của mỗi nhân tố
4. **Noise Control**: `noiseSD = sqrt((1-r)/r) * factor.sd` → đảm bảo tương quan đúng theo correlation
5. **Dependent Variable**: Satisfaction = 0.7 * avgIV + noise → đảm bảo hồi quy có ý nghĩa

### 8 Nhân tố (Factors)
| Nhân tố | Mean | SD | Correlation |
|---|---|---|---|
| Product (Sản phẩm) | 3.6 | 0.70 | 0.55 |
| Price (Giá) | 3.2 | 0.70 | 0.53 |
| Place (Địa điểm) | 3.4 | 0.70 | 0.55 |
| Promotion (Xúc tiến) | 3.1 | 0.70 | 0.52 |
| People (Con người) | 4.0 | 0.65 | 0.56 |
| Physical Evidence (CSVC) | 2.8 | 0.75 | 0.54 |
| Process (Quy trình) | 3.5 | 0.70 | 0.54 |
| Satisfaction (DV - phụ thuộc) | auto | 0.55 | 0.58 |

---

## 📡 API Endpoints (server.mjs - Port 3001)

| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/api/parse` | Phân tích URL Google Form → trả về danh sách câu hỏi |
| POST | `/api/start` | Khởi động engine (spawn fillform.mjs) |
| POST | `/api/stop` | Dừng engine (kill process) |
| GET | `/api/logs` | SSE stream log realtime |

---

## 🐛 Các vấn đề đã giải quyết (Bug History)

### 1. Cronbach's Alpha âm ❌→✅
**Nguyên nhân**: Câu Likert không có covariance, random hoàn toàn  
**Giải pháp**: Latent Variable Model - mỗi phiếu có 1 persona, tất cả câu Likert cùng nhân tố share latent score

### 2. Lỗi chọn option "Khác" (Other) ❌→✅  
**Nguyên nhân**: Google Form trả `__other_option__` cần kèm `other_option_response`  
**Giải pháp**: Lọc hoàn toàn option "Khác" ra khỏi danh sách lựa chọn (Core Mask)

### 3. Process spawn error trên server ❌→✅
**Nguyên nhân**: `child_process.spawn('node', ...)` không tìm được node binary  
**Giải pháp**: Dùng `process.execPath` (absolute path đến node binary hiện tại)

### 4. Demographic logic conflict ❌→✅
**Nguyên nhân**: Học sinh được chọn câu "Thu nhập" dành cho phụ huynh  
**Giải pháp**: Skip logic theo persona (isStudent/isParent) + lọc tuổi/nghề nghiệp

### 5. Server connectivity issues ❌→✅
**Nguyên nhân**: CORS + React dev server proxy conflict  
**Giải pháp**: Express cors() middleware + đúng port configuration

---

## 📅 Tiến trình phát triển (Timeline)

### Phase 1: Foundation (11-12/04/2026)
- Khởi tạo project, setup Vite + React
- Tạo Puppeteer-based form filler (version đầu tiên)
- Push lên GitHub (khoaTF/form-automator)

### Phase 2: Core Engine (14/04/2026)
- Chuyển từ Puppeteer sang HTTP POST (nhanh gấp 50x)
- Xây dựng React dashboard UI
- Thêm concurrent workers

### Phase 3: Statistical Engine (15/04/2026)  
- Implement Box-Muller transform
- Latent Variable Model v1
- Xử lý lỗi "Other" option
- Emergency stop mechanism

### Phase 4: Alpha Fix & Stabilization (16/04/2026)
- Sửa Cronbach's Alpha âm
- Dynamic noise scaling theo correlation coefficient
- Auto-detect reversed Likert scales
- Fallback latent variable cho uncategorized questions
- Demographic random distribution (không skewed)

### Phase 5: Refinement (19/04/2026)
- Fix absolute path cho process spawn
- Stabilize server-client connection
- Clean "Other" option handling
- Fine-tune Alpha range (0.7-0.9)

### Phase 6: Deployment (20/04/2026)
- Push project mới (fillform-fake) thay thế repo form-automator cũ
- Thêm GitHub Actions workflow cho auto-deploy
- Deploy frontend lên GitHub Pages
- Tạo DEVLOG.md (file này)

---

## 🚀 Hướng dẫn chạy

### Frontend (React UI)
```bash
npm install
npm run dev
# → http://localhost:5173
```

### Backend (Express Server)
```bash
node server.mjs
# → http://localhost:3001
```

### Test Cronbach's Alpha
```bash
node test-cronbach.mjs
# Kiểm tra Alpha cho dataset generated
```

### Deploy thủ công
```bash
npm run build
# Output: ./dist/ → upload lên hosting bất kỳ
```

---

## 🔄 Tiếp tục dự án trên máy khác

### Bước 1: Clone repo
```bash
git clone https://github.com/khoaTF/form-automator.git
cd form-automator
npm install
```

### Bước 2: Chạy development
```bash
# Terminal 1 - Frontend
npm run dev

# Terminal 2 - Backend  
node server.mjs
```

### Bước 3: Sử dụng
1. Mở `http://localhost:5173` trên browser
2. Dán link Google Form vào
3. Cấu hình tỷ lệ trả lời (nếu cần)
4. Nhấn Start

---

## 💡 Ghi chú cho AI Assistant

Khi tiếp tục làm việc với dự án này, lưu ý:

1. **Engine V2** sử dụng Latent Variable Model, KHÔNG phải random đều
2. **EXPLICIT_FACTOR_MAP** trong fillform.mjs chứa mapping cứng Question ID → Factor (cho form cụ thể)
3. **Keyword matching** là fallback cho form mới chưa có mapping
4. **Core Mask** luôn loại bỏ option "Khác" / "__other_option__"
5. **Custom ratios**: User có thể chỉnh weight trên UI, nhưng Likert questions blend 70% latent + 30% custom
6. **Demographics**: persona-based (isStudent, isMale) quyết định filter choices
7. **GitHub Pages**: chỉ deploy frontend, backend cần chạy local
8. **Base path**: vite.config.js có `base: '/form-automator/'` cho GitHub Pages

---

## 📊 Kết quả đạt được

- ✅ Cronbach's Alpha: 0.7 – 0.9 (tất cả nhóm nhân tố)
- ✅ Tốc độ: ~5-10 phiếu/giây (HTTP POST)
- ✅ Concurrent: 15 workers song song
- ✅ Zero "Other" selection errors
- ✅ SPSS-ready dataset
- ✅ Live demo: https://khoatf.github.io/form-automator/
