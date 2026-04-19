# 🤖 Form Automator - Google Form Auto-Filler (SPSS-Ready)

> Công cụ tự động điền Google Form với engine thống kê tạo dữ liệu nghiên cứu hợp lệ cho phân tích SPSS.

🌐 **Live Demo**: [khoatf.github.io/form-automator](https://khoatf.github.io/form-automator/)

## ✨ Tính năng

- 🚀 **Siêu nhanh**: HTTP POST trực tiếp, ~5-10 phiếu/giây
- 📊 **SPSS-Ready**: Cronbach's Alpha 0.7-0.9 cho mọi nhóm nhân tố
- 🧠 **Latent Variable Model**: Box-Muller + Persona-based data generation
- ⚡ **Concurrent**: 15 workers song song
- 🎛️ **Tùy chỉnh**: UI cho phép chỉnh tỷ lệ phân phối từng câu hỏi
- 🔄 **Realtime Logging**: SSE stream theo dõi tiến trình
- 🛡️ **Smart Filtering**: Tự động loại option "Khác", lọc logic nhân khẩu học

## 🚀 Bắt đầu

### Cài đặt
```bash
git clone https://github.com/khoaTF/form-automator.git
cd form-automator
npm install
```

### Chạy
```bash
# Terminal 1 - Frontend (React UI)
npm run dev

# Terminal 2 - Backend (API Server)  
node server.mjs
```

Mở `http://localhost:5173` → Dán link Google Form → Cấu hình → Start!

## 🧠 Thuật toán

Engine V2 sử dụng **Latent Variable Model** với 8 nhân tố thống kê:
- Product | Price | Place | Promotion
- People | Physical Evidence | Process
- Satisfaction (biến phụ thuộc)

Mỗi phiếu tạo 1 **persona** với latent scores, đảm bảo covariance dương giữa các câu Likert cùng nhóm.

## 📖 Chi tiết

Xem [DEVLOG.md](./DEVLOG.md) để biết đầy đủ lịch sử phát triển, kiến trúc hệ thống, và hướng dẫn tiếp tục dự án.

## 🛠️ Tech Stack

- **Frontend**: React 19 + Vite 8
- **Backend**: Express 5
- **Engine**: Node.js (HTTP POST)
- **Deploy**: GitHub Pages (GitHub Actions)
