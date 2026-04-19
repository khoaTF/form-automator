import { spawn, exec } from 'child_process';
import fs from 'fs';

const TARGET_RESPONSES = parseInt(process.env.TARGET_RESPONSES) || 100;
const CONCURRENCY = parseInt(process.env.CONCURRENCY) || 15;
const FORM_URL = process.env.FORM_URL;

let customRatios = null;
if (fs.existsSync('config.json')) {
    try {
        customRatios = JSON.parse(fs.readFileSync('config.json', 'utf8'));
    } catch (e) {
        console.error('Error reading config.json', e);
    }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Box-Muller transform for normal distribution
const randomNormal = () => {
    let u1 = Math.random(), u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1 + 1e-9)) * Math.cos(2 * Math.PI * u2);
};

const log = (msg, type = 'info') => {
    const icons = { info:'ℹ', success:'✅', warn:'⚠', error:'❌' };
    const colors = { info:'\x1b[36m', success:'\x1b[32m', warn:'\x1b[33m', error:'\x1b[31m', reset:'\x1b[0m' };
    console.log(`${colors[type]}[${new Date().toLocaleTimeString()}] ${icons[type]} ${msg}${colors.reset}`);
};

// ====== LATENT FACTOR DEFINITIONS ======
// Mỗi nhân tố có danh sách keyword để match câu hỏi → đảm bảo TẤT CẢ câu Likert đều thuộc 1 nhân tố
const FACTOR_DEFS = {
    product: {
        mean: 3.6, sd: 0.7, correlation: 0.55,
        keywords: ['lộ trình', 'giảng dạy', 'chương trình', 'tài liệu', 'giáo trình', 'kiến thức',
                   'hiểu bài', 'phương pháp', 'sản phẩm', 'hoạt động', 'học tập', 'thi đua',
                   'trò chơi', 'sách giáo khoa', 'vận dụng', 'hiệu quả hơn so với', 'hứng thú',
                   'bám sát', 'lý thuyết và thực hành']
    },
    price: {
        mean: 3.2, sd: 0.7, correlation: 0.53,
        keywords: ['học phí', 'giá', 'khuyến mãi', 'ưu đãi', 'chi phí', 'khoản thu',
                   'minh bạch', 'linh hoạt', 'chính sách học phí']
    },
    place: {
        mean: 3.4, sd: 0.7, correlation: 0.55,
        keywords: ['vị trí', 'thuận tiện', 'đi lại', 'dễ tìm', 'tiếp cận',
                   'thời gian học', 'khung giờ', 'linh hoạt', 'phù hợp với học viên']
    },
    promotion: {
        mean: 3.1, sd: 0.7, correlation: 0.52,
        keywords: ['website', 'trực tuyến', 'đăng ký khóa học', 'quảng bá', 'facebook',
                   'tiktok', 'zalo', 'mạng xã hội', 'trường học', 'khu vực xung quanh',
                   'học thử']
    },
    people: {
        mean: 4.0, sd: 0.65, correlation: 0.56,
        keywords: ['giáo viên', 'tận tình', 'nghiệp vụ', 'quy trình', 'nhân viên',
                   'hỗ trợ', 'chuyên môn', 'thái độ', 'chăm sóc', 'tương tác',
                   'trợ giảng', 'tư vấn', 'nhiệt tình', 'quan tâm', 'mối quan hệ',
                   'đăng ký học', 'thông báo tình hình', 'giải quyết', 'nhanh chóng',
                   'rõ ràng và đầy đủ']
    },
    physicalEvidence: {
        mean: 2.8, sd: 0.75, correlation: 0.54,
        keywords: ['cơ sở vật chất', 'phòng học', 'bãi xe', 'không gian', 'trang thiết bị',
                   'môi trường', 'thực hành', 'rộng rãi', 'sạch sẽ', 'giữ xe', 'an toàn',
                   'phần mềm', 'trực tuyến hiện đại']
    },
    process: {
        mean: 3.5, sd: 0.7, correlation: 0.54,
        keywords: ['phân bổ thời gian', 'quy trình', 'đơn giản', 'thông báo tình hình',
                   'giải quyết các vấn đề']
    },
    satisfaction: {
        mean: null, sd: 0.55, correlation: 0.58, isDependent: true,
        keywords: ['hài lòng', 'giới thiệu', 'tiếp tục', 'quay lại', 'đáp ứng',
                   'kỳ vọng', 'lựa chọn', 'thoải mái', 'thích', 'giá trị',
                   'sẵn sàng giới thiệu', 'đăng ký học']
    }
};

// ====== EXPLICIT ID-TO-FACTOR MAPPING (ưu tiên cao nhất) ======
// Mapping trực tiếp Question ID → Factor Key để tránh nhầm keyword
const EXPLICIT_FACTOR_MAP = {
    // Product (Sản phẩm / Chương trình học): Q1-Q5
    1007069077: 'product',   // Q1: Lộ trình học rõ ràng
    1000871104: 'product',   // Q2: Phương pháp giảng dạy
    959937141:  'product',   // Q3: Hiệu quả hơn đối thủ
    1166513250: 'product',   // Q4: Hoạt động thi đua trò chơi
    74284835:   'product',   // Q5: Bám sát sách giáo khoa
    // Price (Giá): Q6-Q9
    2033131683: 'price',     // Q6: Học phí phù hợp chất lượng
    1870937875: 'price',     // Q7: Học phí hợp lý so với nơi khác
    1675376132: 'price',     // Q8: Khoản thu minh bạch
    1640394191: 'price',     // Q9: Chính sách học phí linh hoạt
    // Place (Địa điểm): Q10-Q11
    1445934146: 'place',     // Q10: Vị trí thuận tiện
    1056551394: 'place',     // Q11: Thời gian linh hoạt
    // Promotion (Xúc tiến): Q12-Q15
    1770559029: 'promotion', // Q12: Website kênh trực tuyến
    1791313376: 'promotion', // Q13: Quảng bá Facebook/TikTok
    722846223:  'promotion', // Q14: Ưu đãi học thử
    686590679:  'promotion', // Q15: Quảng bá tại trường học
    // People (Con người): Q16-Q20
    1737086511: 'people',    // Q16: Nhân viên tư vấn rõ ràng
    577897437:  'people',    // Q17: Giáo viên chuyên môn
    1534944558: 'people',    // Q18: Giáo viên nhiệt tình
    1090732468: 'people',    // Q19: Nhân viên hỗ trợ tận tình
    1629965579: 'people',    // Q20: Mối quan hệ tốt đẹp
    // Process (Quy trình): Q21-Q24
    784817435:  'process',   // Q21: Quy trình đăng ký đơn giản
    1711696476: 'process',   // Q22: Thông báo tình hình học tập
    180209607:  'process',   // Q23: Phân bổ thời gian
    1873921496: 'process',   // Q24: Giải quyết vấn đề nhanh
    // Physical Evidence (Cơ sở vật chất): Q25-Q28
    966632098:  'physicalEvidence',  // Q25: Phòng học rộng rãi sạch sẽ
    1326277336: 'physicalEvidence',  // Q26: Trang thiết bị
    378525762:  'physicalEvidence',  // Q27: Phần mềm trực tuyến
    1052065550: 'physicalEvidence',  // Q28: Khu vực giữ xe
    // Satisfaction (Sự hài lòng / DV): Q29-Q31
    260985880:  'satisfaction', // Q29: Hài lòng dịch vụ
    918611100:  'satisfaction', // Q30: Tiếp tục đăng ký
    744971590:  'satisfaction', // Q31: Giới thiệu bạn bè
};

/**
 * Tạo persona latent scores cho 1 respondent.
 * Tất cả câu Likert sẽ kéo score từ persona này → đảm bảo covariance dương.
 */
function generatePersona() {
    const persona = {};
    const ivScores = [];

    for (const [key, factor] of Object.entries(FACTOR_DEFS)) {
        if (factor.isDependent) continue;
        // Tạo latent score ở dạng chuẩn hóa (z-score) rồi chuyển sang thang Likert 1-5
        const z = randomNormal();
        const score = factor.mean + z * factor.sd;
        persona[key] = Math.max(1, Math.min(5, score));
        ivScores.push(persona[key]);
    }

    // Biến phụ thuộc = trung bình IV + nhiễu nhỏ (đảm bảo hồi quy có ý nghĩa)
    const avgIv = ivScores.length > 0 ? ivScores.reduce((a, b) => a + b, 0) / ivScores.length : 3.5;
    const satFactor = FACTOR_DEFS.satisfaction;
    persona.satisfaction = Math.max(1, Math.min(5, avgIv * 0.7 + randomNormal() * satFactor.sd + 0.3 * 3.5));

    return persona;
}

/**
 * Xác định câu hỏi thuộc nhân tố nào.
 * Ưu tiên 1: Explicit ID mapping (chính xác 100%)
 * Ưu tiên 2: Keyword matching (fallback cho form mới)
 */
function matchFactor(title, questionId) {
    // Ưu tiên 1: Explicit mapping
    if (questionId && EXPLICIT_FACTOR_MAP[questionId]) {
        return EXPLICIT_FACTOR_MAP[questionId];
    }

    // Ưu tiên 2: Keyword matching (fallback)
    const t = title.toLowerCase();
    let bestMatch = null;
    let bestScore = 0;

    for (const [key, factor] of Object.entries(FACTOR_DEFS)) {
        let matchCount = 0;
        for (const kw of factor.keywords) {
            if (t.includes(kw)) matchCount++;
        }
        if (matchCount > bestScore) {
            bestScore = matchCount;
            bestMatch = key;
        }
    }

    return bestMatch;
}

/**
 * Thuật toán điền form theo tỷ lệ SPSS thực tế - ENGINE V2
 * Fix Cronbach's Alpha âm bằng Latent Variable Model nhất quán.
 */
function fillSpssData(formItems, customRatios) {
    const entryData = new URLSearchParams();
    entryData.append('fvv', '1');
    const numPages = formItems.filter(i => i[3] === 8).length + 1;
    entryData.append('pageHistory', Array.from({length: numPages}, (_, i) => i).join(','));
    
    // ====== PERSONA GENERATION (1 BỘ DUY NHẤT cho mỗi phiếu) ======
    const persona = generatePersona();

    // Khởi tạo Nhân khẩu học (Demographics)
    let probStudent = 0.6;
    let probStudentMale = 0.45;
    let probParentMale = 0.2;

    if (customRatios) {
        const qDoiTuong = formItems.find(i => {
            const title = (i[1] || '').toLowerCase();
            return title.includes('đối tượng') || title.includes('bạn là') || title.includes('ai là');
        });
        if (qDoiTuong && qDoiTuong[4] && qDoiTuong[4][0]) {
            const cq = customRatios.find(q => q.id == qDoiTuong[4][0][0]);
            if (cq) {
                let sW = cq.choices.find(c => c.value.toLowerCase().includes('học sinh'))?.weight || 0;
                let pW = cq.choices.find(c => c.value.toLowerCase().includes('phụ huynh'))?.weight || 0;
                if (sW + pW > 0) probStudent = sW / (sW + pW);
            }
        }
    }

    const isStudent = Math.random() < probStudent;
    const isMale = isStudent ? (Math.random() < probStudentMale) : (Math.random() < probParentMale);

    formItems.forEach(item => {
        const type = item[3];
        const title = (item[1] || '').toLowerCase();
        
        // Bỏ qua các mục không phải câu hỏi (Type = 8 là Section, 6 là text mô tả)
        if (!item[4] || !item[4][0]) return; 

        const questionId = item[4][0][0];
        const choicesRaw = item[4][0][1] || [];
        let choices = choicesRaw.map(c => typeof c === 'string' ? c : c[0]).filter(c => c);
        const hasOther = item[4][0][2] === true || item[4][0][2] === 1;
        if (hasOther) choices.push('__other_option__');

        // Core Mask: Loại bỏ HOÀN TOÀN "Khác" / "Other" + lọc logic SPSS
        let filteredChoices = choices.filter(c => {
            let v = c.toLowerCase();
            // LOẠI BỎ TẤT CẢ OPTION "KHÁC" (không bao giờ chọn)
            if (c === '__other_option__' || c === 'Mục: Khác' || v === 'khác' || v === 'khác:' || v === 'ý kiến khác' || v === 'mục khác' || v === 'mục: khác') return false;
            if (title.includes('độ tuổi') || title.includes('bao nhiêu tuổi')) {
                if (isStudent && (v.includes('19') || v.includes('20') || v.includes('36') || v.includes('45') || v.includes('lớn') || v.includes('trên'))) return false;
                if (!isStudent && (v.includes('15') || v.includes('16') || v.includes('17') || v.includes('18') || v.includes('dưới 19') || v.includes('dưới 18') || v.includes('dưới 15'))) return false;
            }
            if (title.includes('nghề nghiệp')) {
                if (isStudent && !v.includes('học sinh')) return false;
                if (!isStudent && v.includes('học sinh')) return false;
            }
            return true;
        });
        if (filteredChoices.length === 0) filteredChoices = choices.filter(c => c !== '__other_option__' && c !== 'Mục: Khác');
        if (filteredChoices.length === 0) filteredChoices = choices;
        
        const setEntry = (val) => {
            if (val === '__other_option__' || val === 'Mục: Khác') {
                entryData.append(`entry.${questionId}`, '__other_option__');
                entryData.append(`entry.${questionId}.other_option_response`, 'Tôi có ý kiến riêng ở phần này');
            } else if (val) {
                entryData.append(`entry.${questionId}`, val);
            }
        };

        const pickChoice = (rules) => {
            let totalW = rules.reduce((acc, r) => acc + r.weight, 0);
            let rnd = Math.random() * totalW;
            for(let r of rules) {
                if (rnd < r.weight) {
                    for(let c of filteredChoices) {
                        if (c.toLowerCase().includes(r.match)) return c;
                    }
                    return null;
                }
                rnd -= r.weight;
            }
            return null;
        };

        // ----- SKIP LOGIC THEO ĐỐI TƯỢNG -----
        if ((title.includes('thu nhập') || title.includes('lương')) && isStudent) return;
        if (title.includes('khó khăn') && !isStudent) return;
        if (title.includes('lý do') && isStudent) return;

        // ====== DETECT LIKERT SCALE (dùng filteredChoices đã loại "Khác") ======
        const isLikert = filteredChoices.length >= 3 && filteredChoices.length <= 7 && 
                         (filteredChoices.every(c => !isNaN(parseInt(c))) || 
                          filteredChoices.some(c => {
                              let v = c.toLowerCase();
                              return v.includes('đồng ý') || v.includes('hài lòng') || v.includes('tốt') || v.includes('kém') || v.includes('bình thường');
                          }));

        const randomChoice = () => {
            if (filteredChoices.length === 0) return null;
            let safeChoices = filteredChoices.filter(c => {
                let v = c.toLowerCase();
                if (!isNaN(parseInt(v)) && v.length < 3) return true;
                return !(v.includes('thất vọng') || v.includes('rất tệ') || v.includes('không bao giờ') || v.includes('bỏ học') || v.includes('kém'));
            });
            if (safeChoices.length === 0) safeChoices = filteredChoices;
            return safeChoices[Math.floor(Math.random() * safeChoices.length)];
        };

        // === Áp dụng Custom Config Override (CHỈ khi user ĐÃ CHỈNH weight) === //
        let customQ = customRatios ? customRatios.find(q => q.id == questionId) : null;
        if (customQ) {
            const defaultW = Math.round(100 / customQ.choices.length);
            const tolerance = 2; // Cho phép sai số ±2 do làm tròn
            const isTouched = !customQ.choices.every(c => Math.abs(c.weight - defaultW) <= tolerance);
            if (!isTouched) customQ = null;
        }

        // ====== LIKERT → SỬ DỤNG LATENT VARIABLE MODEL ======
        if (isLikert && (type === 2 || type === 3 || type === 5)) {
            // Xác định câu hỏi thuộc nhân tố nào
            const factorKey = matchFactor(title, questionId);
            
            let baseScore;
            let noiseSD;

            if (factorKey && persona[factorKey] !== undefined) {
                // Match được nhân tố → lấy score từ persona
                baseScore = persona[factorKey];
                const factor = FACTOR_DEFS[factorKey];
                // Noise = sqrt((1-r)/r) * factor.sd → giữ tương quan đúng theo correlation
                const r = factor.correlation;
                const noiseScale = Math.sqrt((1 - r) / r);
                noiseSD = noiseScale * factor.sd * 1.0; // x1.0 để tạo nhiễu tự nhiên (Alpha 0.7-0.9)
            } else {
                // FALLBACK: Dùng trung bình TẤT CẢ IV scores → vẫn duy trì covariance dương
                const allIV = Object.entries(persona)
                    .filter(([k]) => !FACTOR_DEFS[k]?.isDependent)
                    .map(([, v]) => v);
                baseScore = allIV.length > 0 ? allIV.reduce((a, b) => a + b, 0) / allIV.length : 3.5;
                noiseSD = 0.35; // Nhiễu nhỏ cho fallback
            }

            // Tính điểm cuối cùng
            let score = Math.round(baseScore + randomNormal() * noiseSD);
            
            // Đổi đối tượng: Học sinh dễ tính hơn phụ huynh ở Giá
            if (isStudent && (title.includes('học phí') || title.includes('giá'))) score += 1;
            
            score = Math.max(1, Math.min(5, score));
            
            // Trích xuất choice tương ứng (hỗ trợ cả Likert số và text)
            let ans = choices.find(c => c.trim() === score.toString());
            if (!ans && choices.length >= score) ans = choices[score - 1];
            
            // Custom override CHỈ cho Likert khi user thực sự chỉnh weight
            if (customQ) {
                let validChoices = customQ.choices.filter(c => filteredChoices.includes(c.value));
                if (validChoices.length === 0) validChoices = customQ.choices;
                
                // Blend: 70% latent model + 30% custom weight distribution
                if (Math.random() < 0.3) {
                    let totalW = validChoices.reduce((acc, c) => acc + c.weight, 0);
                    if (totalW > 0) {
                        let rnd = Math.random() * totalW;
                        for (let c of validChoices) {
                            if (rnd < c.weight) {
                                setEntry(c.value);
                                return;
                            }
                            rnd -= c.weight;
                        }
                    }
                }
            }
            
            setEntry(ans || randomChoice());
            return; // Done with this Likert question
        }

        // ====== NON-LIKERT: Custom Config Override ======
        if (customQ) {
            let validChoices = customQ.choices.filter(c => filteredChoices.includes(c.value));
            if (validChoices.length === 0) validChoices = customQ.choices; 

            if (type === 4) {
               let picks = [];
               validChoices.forEach(c => {
                   if (Math.random() < (c.weight / 100)) picks.push(c.value);
               });
               if (picks.length === 0) picks.push(randomChoice()); 
               picks.forEach(p => setEntry(p));
               return;
            } else {
               let totalW = validChoices.reduce((acc, c) => acc + c.weight, 0);
               if (totalW > 0) {
                   let rnd = Math.random() * totalW;
                   for(let c of validChoices) {
                       if (rnd < c.weight) {
                           setEntry(c.value);
                           return;
                       }
                       rnd -= c.weight;
                   }
               }
               setEntry(randomChoice());
               return;
            }
        }

        // ====== DEMOGRAPHIC & NON-LIKERT RULES ======

        if (type === 2 || type === 3 || type === 5) {
            if (title.includes('đối tượng') || title.includes('bạn là') || title.includes('ai là')) {
                let ans = pickChoice([
                    {match: 'học sinh', weight: isStudent ? 100 : 0},
                    {match: 'phụ huynh', weight: !isStudent ? 100 : 0},
                    {match: 'cha', weight: (!isStudent && isMale) ? 100 : 0},
                    {match: 'mẹ', weight: (!isStudent && !isMale) ? 100 : 0}
                ]);
                setEntry(ans || randomChoice());
            } 
            else if (title.includes('giới tính')) {
                let ans = pickChoice([
                    {match: 'nam', weight: isMale ? 100 : 0},
                    {match: 'nữ', weight: !isMale ? 100 : 0}
                ]);
                setEntry(ans || randomChoice());
            }
            else if (title.includes('độ tuổi') || title.includes('bao nhiêu tuổi')) {
                let ans = pickChoice([
                    {match: 'dưới 15', weight: isStudent ? 60 : 0},
                    {match: '15', weight: isStudent ? 40 : 0},
                    {match: '36', weight: !isStudent ? 60 : 0},
                    {match: '45', weight: !isStudent ? 40 : 0}
                ]);
                setEntry(ans || randomChoice());
            }
            else if (title.includes('nghề nghiệp')) {
                let ans = pickChoice([
                    {match: 'học sinh', weight: isStudent ? 100 : 0},
                    {match: 'kinh doanh', weight: !isStudent ? 40 : 0},
                    {match: 'văn phòng', weight: !isStudent ? 30 : 0},
                    {match: 'công nhân', weight: !isStudent ? 20 : 0},
                    {match: 'nội trợ', weight: !isStudent ? 10 : 0}
                ]);
                setEntry(ans || randomChoice());
            }
            else if (title.includes('phương tiện')) {
                let ans = pickChoice([
                    {match: 'phụ huynh', weight: 60},
                    {match: 'xe máy', weight: 30},
                    {match: 'đạp', weight: 30},
                    {match: 'công cộng', weight: 10}
                ]);
                setEntry(ans || randomChoice());
            }
            else if (title.includes('khoảng cách')) {
                let ans = pickChoice([
                    {match: 'dưới 1', weight: 20},
                    {match: '1 - 5', weight: 65},
                    {match: '5', weight: 15}
                ]);
                setEntry(ans || randomChoice());
            }
            else if (title.includes('thu nhập')) {
                let ans = pickChoice([
                    {match: 'dưới 10', weight: 10},
                    {match: '10 - 20', weight: 75},
                    {match: '20', weight: 15}
                ]);
                setEntry(ans || randomChoice());
            }
            else if (title.includes('thời gian học')) {
                let ans = pickChoice([
                    {match: 'dưới 3', weight: 15},
                    {match: '3 - 6', weight: 35},
                    {match: '6', weight: 30},
                    {match: '1 năm', weight: 20}
                ]);
                setEntry(ans || randomChoice());
            }
            else {
                setEntry(randomChoice());
            }
        }
        else if (type === 4) { // Checkbox
            let picks = [];
            if (title.includes('môn học')) {
                if (Math.random() < 0.6) picks.push(choices.find(c => c.toLowerCase().includes('toán')));
                if (Math.random() < 0.3) picks.push(choices.find(c => c.toLowerCase().includes('anh')));
                if (picks.length === 0) picks.push(randomChoice());
            }
            else if (title.includes('biết đến')) {
                let ans = pickChoice([
                    {match: 'quen', weight: 75},
                    {match: 'giáo viên', weight: 75},
                    {match: 'mạng', weight: 15},
                    {match: 'tờ rơi', weight: 10}
                ]);
                picks.push(ans || randomChoice());
            }
            else if (title.includes('khó khăn')) {
                let ans = pickChoice([
                    {match: 'tự tin', weight: 35},
                    {match: 'tập trung', weight: 35},
                    {match: 'hỏi', weight: 20},
                    {match: 'không', weight: 10}
                ]);
                picks.push(ans || randomChoice());
            }
            else if (title.includes('lý do')) {
                let ans = pickChoice([
                    {match: 'thời gian', weight: 40},
                    {match: 'chuyên môn', weight: 30},
                    {match: 'hổng', weight: 20},
                    {match: 'thi', weight: 10}
                ]);
                picks.push(ans || randomChoice());
            } else {
                let num = Math.floor(Math.random() * 2) + 1;
                picks = [...choices].sort(() => Math.random() - 0.5).slice(0, num);
            }
            
            picks.forEach(p => {
                if (p) entryData.append(`entry.${questionId}`, p);
            });
        }
        else if (type === 0 || type === 1) { // Text and Paragraph
            if (title.includes('email') || title.includes('mail')) {
                setEntry(`user${Math.floor(Math.random()*99999)}@gmail.com`);
            } else if (title.includes('sđt') || title.includes('điện thoại') || title.includes('phone')) {
                setEntry(`09${Math.floor(Math.random()*100000000)}`);
            } else {
                const comments = ['Tốt', 'Tuyệt vời', 'Giá hơi cao nhưng chất lượng tốt', 'Cơ sở vật chất cần cải thiện thêm', 'Giáo viên cực kỳ nhiệt tình', 'Không có ý kiến gì thêm'];
                setEntry(comments[Math.floor(Math.random() * comments.length)]);
            }
        }
    });
    
    return entryData;
}

// ===============================================

async function main() {
    if (!FORM_URL) {
        log('Lỗi: Chưa nhập FORM_URL!', 'error');
        process.exit(1);
    }

    log(`Đang chạy AUTO-FILLER (Chế độ POST siêu tốc) - ENGINE V2 LATENT MODEL`);
    log(`Target: ${TARGET_RESPONSES} | Parallel: ${CONCURRENCY}`);
    
    // Bước 1: Fetch trang gốc để trích xuất FB_PUBLIC_LOAD_DATA_
    let formData = [];
    let submitUrl = '';
    
    try {
        log(`Đang phân tích form...`);
        const res = await fetch(FORM_URL);
        const html = await res.text();
        
        const match = html.match(/var FB_PUBLIC_LOAD_DATA_ = (\[.*?\]);\s*<\/script>/s);
        if (!match) throw new Error("Không thể trích xuất FB_PUBLIC_LOAD_DATA_ (Form có thể đóng hoặc cấu trúc sai).");
        
        const parsed = JSON.parse(match[1]);
        formData = parsed[1][1]; 
        
        // Form response target URL
        submitUrl = FORM_URL.replace(/\/viewform.*/, '/formResponse');
        log(`Đã phân tích được ${formData.length} items. Sẵn sàng bắn vào: ${submitUrl}`, 'success');

        // Log factor matching cho debug
        let matchedCount = 0;
        let unmatchedItems = [];
        formData.forEach(item => {
            if (!item[4] || !item[4][0]) return;
            const title = (item[1] || '').toLowerCase();
            const choicesRaw = item[4][0][1] || [];
            let choices = choicesRaw.map(c => typeof c === 'string' ? c : c[0]).filter(c => c);
            const isLikert = choices.length >= 3 && choices.length <= 7 && 
                             (choices.every(c => !isNaN(parseInt(c))) || 
                              choices.some(c => c.toLowerCase().includes('đồng ý') || c.toLowerCase().includes('hài lòng')));
            if (isLikert && (item[3] === 2 || item[3] === 3 || item[3] === 5)) {
                const factor = matchFactor(title);
                if (factor) {
                    matchedCount++;
                } else {
                    unmatchedItems.push(item[1]);
                }
            }
        });
        log(`Factor matching: ${matchedCount} câu Likert đã match nhân tố`, 'success');
        if (unmatchedItems.length > 0) {
            log(`⚠ ${unmatchedItems.length} câu Likert CHƯA match: ${unmatchedItems.join(' | ')}`, 'warn');
        }

    } catch (e) {
        log(`Lỗi phân tích: ${e.message}`, 'error');
        process.exit(1);
    }

    let ok = 0;
    let errCount = 0;
    let doneCount = 0;
    const startTime = Date.now();
    
    const sendRequest = async (index) => {
        const payload = fillSpssData(formData, customRatios);
        try {
            const res = await fetch(submitUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: payload.toString()
            });

            if (res.status === 200) {
                ok++;
                if (index % 5 === 0) log(`[Phiếu ${index}] Gửi thành công! (200 OK)`, 'success');
            } else {
                errCount++;
                log(`[Phiếu ${index}] Lỗi mã trạng thái: ${res.status}`, 'error');
            }
        } catch (e) {
            errCount++;
            log(`[Phiếu ${index}] Cảnh báo mạng: ${e.message}`, 'warn');
        }
        doneCount++;
    };

    // Chạy đồng thời
    const queue = Array.from({ length: TARGET_RESPONSES }, (_, i) => i + 1);
    const workers = Array(CONCURRENCY).fill(null).map(async () => {
        while (queue.length > 0) {
            const idx = queue.shift();
            await sendRequest(idx);
            await sleep(200); // Delay 200ms giữa các request để tránh Google spam block
        }
    });

    await Promise.all(workers);

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    log(`====== HOÀN TẤT CHIẾN DỊCH ======`);
    log(`Thành công: ${ok}/${TARGET_RESPONSES} | Thất bại: ${errCount}`);
    log(`Tổng thời gian: ${elapsed} giây (${(ok/elapsed).toFixed(2)} req/s)`, 'highlight');
}

main();
