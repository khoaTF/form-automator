/**
 * Script kiểm tra Cronbach's Alpha trên dữ liệu sinh ra bởi engine.
 * Mô phỏng 200 respondent và tính alpha cho từng nhóm nhân tố.
 */

// Import engine functions (inline for testing)
const randomNormal = () => {
    let u1 = Math.random(), u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1 + 1e-9)) * Math.cos(2 * Math.PI * u2);
};

const FACTOR_DEFS = {
    product: { mean: 3.6, sd: 0.7, correlation: 0.55,
        keywords: ['lộ trình', 'giảng dạy', 'chương trình', 'tài liệu', 'giáo trình', 'kiến thức',
                   'hiểu bài', 'phương pháp', 'sản phẩm', 'hoạt động', 'học tập', 'thi đua',
                   'trò chơi', 'sách giáo khoa', 'vận dụng', 'hiệu quả hơn so với', 'hứng thú',
                   'bám sát', 'lý thuyết và thực hành']
    },
    price: { mean: 3.2, sd: 0.7, correlation: 0.53,
        keywords: ['học phí', 'giá', 'khuyến mãi', 'ưu đãi', 'chi phí', 'khoản thu',
                   'minh bạch', 'linh hoạt', 'chính sách học phí']
    },
    place: { mean: 3.4, sd: 0.7, correlation: 0.55,
        keywords: ['vị trí', 'thuận tiện', 'đi lại', 'dễ tìm', 'tiếp cận',
                   'thời gian học', 'khung giờ', 'linh hoạt', 'phù hợp với học viên']
    },
    promotion: { mean: 3.1, sd: 0.7, correlation: 0.52,
        keywords: ['website', 'trực tuyến', 'đăng ký khóa học', 'quảng bá', 'facebook',
                   'tiktok', 'zalo', 'mạng xã hội', 'trường học', 'khu vực xung quanh',
                   'học thử']
    },
    people: { mean: 4.0, sd: 0.65, correlation: 0.56,
        keywords: ['giáo viên', 'tận tình', 'nghiệp vụ', 'quy trình', 'nhân viên',
                   'hỗ trợ', 'chuyên môn', 'thái độ', 'chăm sóc', 'tương tác',
                   'trợ giảng', 'tư vấn', 'nhiệt tình', 'quan tâm', 'mối quan hệ',
                   'đăng ký học', 'thông báo tình hình', 'giải quyết', 'nhanh chóng',
                   'rõ ràng và đầy đủ']
    },
    physicalEvidence: { mean: 2.8, sd: 0.75, correlation: 0.54,
        keywords: ['cơ sở vật chất', 'phòng học', 'bãi xe', 'không gian', 'trang thiết bị',
                   'môi trường', 'thực hành', 'rộng rãi', 'sạch sẽ', 'giữ xe', 'an toàn',
                   'phần mềm', 'trực tuyến hiện đại']
    },
    process: { mean: 3.5, sd: 0.7, correlation: 0.54,
        keywords: ['phân bổ thời gian', 'quy trình', 'đơn giản', 'thông báo tình hình',
                   'giải quyết các vấn đề']
    },
    satisfaction: { mean: null, sd: 0.55, correlation: 0.58, isDependent: true,
        keywords: ['hài lòng', 'giới thiệu', 'tiếp tục', 'quay lại', 'đáp ứng',
                   'kỳ vọng', 'lựa chọn', 'thoải mái', 'thích', 'giá trị',
                   'sẵn sàng giới thiệu', 'đăng ký học']
    }
};

// ====== EXPLICIT ID-TO-FACTOR MAPPING ======
const EXPLICIT_FACTOR_MAP = {
    1007069077: 'product',   1000871104: 'product',   959937141: 'product',
    1166513250: 'product',   74284835: 'product',
    2033131683: 'price',     1870937875: 'price',     1675376132: 'price',     1640394191: 'price',
    1445934146: 'place',     1056551394: 'place',
    1770559029: 'promotion', 1791313376: 'promotion', 722846223: 'promotion',  686590679: 'promotion',
    1737086511: 'people',    577897437: 'people',     1534944558: 'people',
    1090732468: 'people',    1629965579: 'people',
    784817435: 'process',    1711696476: 'process',   180209607: 'process',    1873921496: 'process',
    966632098: 'physicalEvidence', 1326277336: 'physicalEvidence',
    378525762: 'physicalEvidence', 1052065550: 'physicalEvidence',
    260985880: 'satisfaction', 918611100: 'satisfaction', 744971590: 'satisfaction',
};

function matchFactor(title, questionId) {
    if (questionId && EXPLICIT_FACTOR_MAP[questionId]) return EXPLICIT_FACTOR_MAP[questionId];
    const t = title.toLowerCase();
    let bestMatch = null;
    let bestScore = 0;
    for (const [key, factor] of Object.entries(FACTOR_DEFS)) {
        let matchCount = 0;
        for (const kw of factor.keywords) {
            if (t.includes(kw)) matchCount++;
        }
        if (matchCount > bestScore) { bestScore = matchCount; bestMatch = key; }
    }
    return bestMatch;
}

function generatePersona() {
    const persona = {};
    const ivScores = [];
    for (const [key, factor] of Object.entries(FACTOR_DEFS)) {
        if (factor.isDependent) continue;
        const z = randomNormal();
        const score = factor.mean + z * factor.sd;
        persona[key] = Math.max(1, Math.min(5, score));
        ivScores.push(persona[key]);
    }
    const avgIv = ivScores.reduce((a, b) => a + b, 0) / ivScores.length;
    persona.satisfaction = Math.max(1, Math.min(5, avgIv * 0.7 + randomNormal() * 0.55 + 0.3 * 3.5));
    return persona;
}

// Danh sách câu Likert từ form thực tế
const likertQuestions = [
    { num: 1, id: 1007069077, title: "Trung tâm có lộ trình học rõ ràng, phù hợp với học sinh" },
    { num: 2, id: 1000871104, title: "Phương pháp giảng dạy giúp học sinh hiểu bài và vận dụng tốt" },
    { num: 3, id: 959937141, title: "Chương trình học tại trung tâm hiệu quả hơn so với đối thủ cạnh tranh" },
    { num: 4, id: 1166513250, title: "Có các hoạt động học tập (thi đua, trò chơi, ngoại khóa) tạo hứng thú cho học sinh" },
    { num: 5, id: 74284835, title: "Chương trình học bám sát sách giáo khoa, trên trường" },
    { num: 6, id: 2033131683, title: "Học phí của trung tâm phù hợp với chất lượng giảng dạy" },
    { num: 7, id: 1870937875, title: "Mức học phí của trung tâm hợp lý so với các trung tâm khác" },
    { num: 8, id: 1675376132, title: "Các khoản thu và chính sách học phí được trung tâm thông báo rõ ràng, minh bạch" },
    { num: 9, id: 1640394191, title: "Chính sách học phí linh hoạt" },
    { num: 10, id: 1445934146, title: "Vị trí trung tâm thuận tiện cho việc đi lại, dễ tìm kiếm và tiếp cận" },
    { num: 11, id: 1056551394, title: "Thời gian học tại trung tâm linh hoạt, phù hợp với học viên" },
    { num: 12, id: 1770559029, title: "Website và các kênh trực tuyến của trung tâm giúp học viên dễ dàng tìm kiếm và đăng ký khóa học" },
    { num: 13, id: 1791313376, title: "Trung tâm thường xuyên quảng bá trên các kênh trực tuyến (Facebook, tiktok, zalo,…)" },
    { num: 14, id: 722846223, title: "Trung tâm có các chương trình ưu đãi học phí, học thử hấp dẫn" },
    { num: 15, id: 686590679, title: "Trung tâm có các hoạt động quảng bá tại trường học hoặc khu vực xung quanh" },
    { num: 16, id: 1737086511, title: "Nhân viên tư vấn cung cấp thông tin rõ ràng và đầy đủ" },
    { num: 17, id: 577897437, title: "Giáo viên tại trung tâm có chuyên môn tốt và giảng bài dễ hiểu" },
    { num: 18, id: 1534944558, title: "Giáo viên nhiệt tình, quan tâm đến kết quả học tập của học sinh" },
    { num: 19, id: 1090732468, title: "Nhân viên trung tâm (tư vấn, bảo vệ, lao công…) hỗ trợ học sinh và phụ huynh tận tình" },
    { num: 20, id: 1629965579, title: "Trung tâm luôn xây dựng mối quan hệ tốt đẹp với phụ huynh và học sinh" },
    { num: 21, id: 784817435, title: "Quy trình đăng ký học tại trung tâm đơn giản và thuận tiện" },
    { num: 22, id: 1711696476, title: "Trung tâm thường xuyên thông báo tình hình học tập của học sinh cho phụ huynh" },
    { num: 23, id: 180209607, title: "Quá trình giảng dạy, phân bổ thời gian lý thuyết và thực hành hợp lý" },
    { num: 24, id: 1873921496, title: "Trung tâm giải quyết các vấn đề của học sinh và phụ huynh nhanh chóng" },
    { num: 25, id: 966632098, title: "Phòng học tại trung tâm rộng rãi, sạch sẽ" },
    { num: 26, id: 1326277336, title: "Trang thiết bị phục vụ giảng dạy và học tập sử dụng tốt" },
    { num: 27, id: 378525762, title: "Cung cấp các phần mềm trực tuyến hiện đại hỗ trợ học tập" },
    { num: 28, id: 1052065550, title: "Trung tâm có khu vực giữ xe rộng rãi và an toàn cho học sinh và phụ huynh" },
    { num: 29, id: 260985880, title: "Tôi hài lòng với chất lượng dịch vụ của trung tâm" },
    { num: 30, id: 918611100, title: "Tôi sẽ tiếp tục đăng ký học tại trung tâm trong thời gian tới" },
    { num: 31, id: 744971590, title: "Tôi sẵn sàng giới thiệu trung tâm cho bạn bè hoặc người quen" },
];

// ====== STEP 1: Show factor mapping ======
console.log('\n\x1b[35m====== FACTOR MAPPING ======\x1b[0m');
const factorGroups = {};
for (const q of likertQuestions) {
    const factor = matchFactor(q.title, q.id);
    q.factor = factor || 'UNMATCHED';
    if (!factorGroups[q.factor]) factorGroups[q.factor] = [];
    factorGroups[q.factor].push(q);
}
for (const [factor, items] of Object.entries(factorGroups)) {
    const color = factor === 'UNMATCHED' ? '\x1b[31m' : '\x1b[32m';
    console.log(`${color}[${factor}]\x1b[0m (${items.length} items):`);
    items.forEach(q => console.log(`  Q${q.num}: ${q.title.slice(0, 60)}...`));
}

// ====== STEP 2: Simulate 200 respondents ======
const N = 200;
const data = {}; // data[factorKey] = [item_index][respondent_index] = score
for (const [factor] of Object.entries(factorGroups)) {
    if (factor === 'UNMATCHED') continue;
    data[factor] = factorGroups[factor].map(() => []);
}

for (let r = 0; r < N; r++) {
    const persona = generatePersona();
    
    for (const [factor, items] of Object.entries(factorGroups)) {
        if (factor === 'UNMATCHED') continue;
        const factorDef = FACTOR_DEFS[factor];
        
        items.forEach((q, itemIdx) => {
            let baseScore = persona[factor];
            const corr = factorDef.correlation;
            const noiseScale = Math.sqrt((1 - corr) / corr);
            const noiseSD = noiseScale * factorDef.sd * 1.0;
            let score = Math.round(baseScore + randomNormal() * noiseSD);
            score = Math.max(1, Math.min(5, score));
            
            if (!data[factor][itemIdx]) data[factor][itemIdx] = [];
            data[factor][itemIdx].push(score);
        });
    }
}

// ====== STEP 3: Calculate Cronbach's Alpha ======
function cronbachAlpha(itemScores) {
    const k = itemScores.length;
    if (k < 2) return NaN;
    const n = itemScores[0].length;

    // Tổng điểm (sum of all items per respondent)
    const totals = Array(n).fill(0);
    for (let i = 0; i < k; i++) {
        for (let j = 0; j < n; j++) {
            totals[j] += itemScores[i][j];
        }
    }

    // Variance function
    const variance = (arr) => {
        const m = arr.reduce((a, b) => a + b, 0) / arr.length;
        return arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1);
    };

    // Sum of item variances
    let sumItemVar = 0;
    for (let i = 0; i < k; i++) {
        sumItemVar += variance(itemScores[i]);
    }

    const totalVar = variance(totals);
    if (totalVar === 0) return 0;

    const alpha = (k / (k - 1)) * (1 - sumItemVar / totalVar);
    return alpha;
}

console.log('\n\x1b[35m====== CRONBACH\'S ALPHA RESULTS (N=' + N + ') ======\x1b[0m');
let allGood = true;
for (const [factor, itemScores] of Object.entries(data)) {
    if (itemScores.length < 2) continue;
    const alpha = cronbachAlpha(itemScores);
    const status = alpha >= 0.6 ? '\x1b[32m✅ GOOD' : alpha >= 0 ? '\x1b[33m⚠ LOW' : '\x1b[31m❌ NEGATIVE';
    console.log(`${status}\x1b[0m ${factor.padEnd(20)} α = ${alpha.toFixed(4)} (${itemScores.length} items)`);
    if (alpha < 0) allGood = false;
}

console.log(!allGood ? '\n\x1b[31m❌ CÓ NHÓM CRONBACH ALPHA ÂM!\x1b[0m' : '\n\x1b[32m✅ TẤT CẢ NHÓM ĐỀU CÓ CRONBACH ALPHA DƯƠNG!\x1b[0m');
