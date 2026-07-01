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
const cheerio = require('cheerio');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    transports: ['websocket', 'polling']
});

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
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
    },
    stats: {
        totalSuntikSent: 0,
        lastReset: Date.now()
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
            createdAt: new Date().toISOString(),
            apiKey: generateApiKey()
        });
        saveDB();
        console.log('✅ Admin Lynzka dibuat');
    }
}
initAdmin();

function generateApiKey() {
    return 'key_' + uuidv4().replace(/-/g, '').substring(0, 20);
}

// ============================================
// USER AGENT ROTATION
// ============================================

const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36',
];

const ipList = [
    '192.168.1.1', '10.0.0.1', '172.16.0.1',
    '203.0.113.1', '198.51.100.1', '192.0.2.1',
    '104.28.0.1', '172.217.0.1', '142.250.0.1',
    '8.8.8.8', '1.1.1.1', '208.67.222.222',
];

function getRandomUserAgent() {
    return userAgents[Math.floor(Math.random() * userAgents.length)];
}

function getRandomIP() {
    return ipList[Math.floor(Math.random() * ipList.length)];
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function generateDeviceId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 24; i++) {
        result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
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
// ZEFOY BYPASS SYSTEM
// ============================================

class ZefoyBypass {
    constructor() {
        this.browser = null;
        this.page = null;
        this.cookies = null;
        this.isConnected = false;
        this.lastCaptchaWord = null;
    }

    async connect() {
        try {
            console.log('🔌 Connecting to Zefoy...');
            
            this.browser = await puppeteer.launch({
                headless: false,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-web-security',
                    '--disable-features=IsolateOrigins',
                    '--disable-site-isolation-trials'
                ]
            });

            this.page = await this.browser.newPage();
            
            await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            await this.page.setViewport({ width: 1920, height: 1080 });

            await this.page.goto('https://zefoy.com', {
                waitUntil: 'networkidle0',
                timeout: 60000
            });

            await this.page.waitForSelector('.captcha-word, .captcha-text, [class*="captcha"]', {
                timeout: 15000
            });

            this.isConnected = true;
            console.log('✅ Connected to Zefoy!');
            
            return true;
        } catch (error) {
            console.error('❌ Failed to connect:', error);
            return false;
        }
    }

    async getCaptchaWord() {
        try {
            const word = await this.page.evaluate(() => {
                const selectors = [
                    '.captcha-word',
                    '.captcha-text',
                    '#captcha-word',
                    '.captcha-container span',
                    '[class*="captcha"] span',
                    '.verification-text'
                ];

                for (const selector of selectors) {
                    const el = document.querySelector(selector);
                    if (el) {
                        let text = el.textContent.trim();
                        text = text.replace(/[^A-Za-z]/g, '');
                        if (text.length >= 3) {
                            return text.toUpperCase();
                        }
                    }
                }

                const body = document.body.textContent;
                const match = body.match(/[A-Z]{3,8}/);
                return match ? match[0] : null;
            });

            this.lastCaptchaWord = word;
            return word;
        } catch (error) {
            console.error('❌ Error getting captcha:', error);
            return null;
        }
    }

    async submitCaptcha(word) {
        try {
            const input = await this.page.$('input[type="text"]');
            if (input) {
                await input.click();
                await input.type(word);
                console.log('✅ Captcha typed:', word);
            }

            const submitBtn = await this.page.$('button[type="submit"], .submit-btn, .verify-btn');
            if (submitBtn) {
                await submitBtn.click();
                console.log('✅ Submitted captcha');
                
                await this.page.waitForNavigation({
                    timeout: 10000,
                    waitUntil: 'networkidle0'
                });
                
                this.cookies = await this.page.cookies();
                return true;
            }

            return false;
        } catch (error) {
            console.error('❌ Error submitting captcha:', error);
            return false;
        }
    }

    async bypass() {
        let attempts = 0;
        let success = false;
        let lastError = '';

        while (attempts < 5 && !success) {
            attempts++;
            console.log(`🔄 Bypass attempt ${attempts}/5`);

            const word = await this.getCaptchaWord();
            if (word) {
                success = await this.submitCaptcha(word);
                if (success) {
                    console.log('🎉 Zefoy bypass successful!');
                    this.isConnected = true;
                    return { success: true, word: word, attempts: attempts };
                } else {
                    lastError = 'Failed to submit captcha';
                }
            } else {
                lastError = 'Failed to get captcha word';
            }

            if (!success) {
                await this.page.reload();
                await sleep(2000);
            }
        }

        this.isConnected = false;
        return { success: false, error: lastError, attempts: attempts };
    }

    async useService(platform, action, target, count) {
        try {
            const serviceMap = {
                'TikTok': {
                    'Followers': '/tiktok-followers',
                    'Likes': '/tiktok-likes',
                    'Views': '/tiktok-views',
                    'Shares': '/tiktok-shares'
                },
                'Instagram': {
                    'Followers': '/instagram-followers',
                    'Likes': '/instagram-likes',
                    'Views': '/instagram-views'
                },
                'YouTube': {
                    'Subscribers': '/youtube-subscribers',
                    'Views': '/youtube-views',
                    'Likes': '/youtube-likes'
                },
                'Facebook': {
                    'Followers': '/facebook-followers',
                    'Likes': '/facebook-likes',
                    'Shares': '/facebook-shares'
                },
                'Twitter': {
                    'Followers': '/twitter-followers',
                    'Likes': '/twitter-likes',
                    'Retweets': '/twitter-retweets'
                }
            };

            const path = serviceMap[platform]?.[action];
            if (!path) {
                return { success: false, error: 'Service not found' };
            }

            await this.page.goto(`https://zefoy.com${path}`, {
                waitUntil: 'networkidle0'
            });

            await sleep(2000);

            const input = await this.page.$('input[type="text"], input[placeholder*="username"], input[placeholder*="link"]');
            if (input) {
                await input.click();
                await input.type(target);
                console.log(`✅ Target entered: ${target}`);
            }

            const submitBtn = await this.page.$('button[type="submit"], .submit-btn, .send-btn');
            if (submitBtn) {
                await submitBtn.click();
                console.log(`✅ ${platform} ${action} submitted`);
            }

            await sleep(3000);

            const result = await this.page.evaluate(() => {
                const statusEl = document.querySelector('.status, .result, .message');
                return statusEl ? statusEl.textContent : 'Success';
            });

            return {
                success: true,
                message: result || 'Service executed',
                platform: platform,
                action: action,
                target: target,
                timestamp: Date.now()
            };

        } catch (error) {
            console.error('❌ Error using service:', error);
            return { success: false, error: error.message };
        }
    }

    async getCookies() {
        return this.cookies;
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
        }
        this.isConnected = false;
    }

    async isPageValid() {
        try {
            const title = await this.page.title();
            return title && title.includes('Zefoy');
        } catch (error) {
            return false;
        }
    }

    async keepAlive() {
        try {
            await this.page.goto('https://zefoy.com', {
                waitUntil: 'networkidle0'
            });
            return true;
        } catch (error) {
            return false;
        }
    }
}

// ============================================
// GLOBAL ZEFOY INSTANCE
// ============================================

let zefoyInstance = null;
let isZefoyReady = false;
let zefoyCooldown = false;
let cooldownTimer = null;
let serviceResults = {
    totalSuccess: 0,
    totalFailed: 0,
    lastResult: null
};

async function initZefoy() {
    if (!zefoyInstance) {
        zefoyInstance = new ZefoyBypass();
        const connected = await zefoyInstance.connect();
        if (connected) {
            const result = await zefoyInstance.bypass();
            if (result.success) {
                isZefoyReady = true;
                console.log('✅ Zefoy siap digunakan!');
                return true;
            } else {
                console.log(`❌ Bypass gagal: ${result.error}`);
                return false;
            }
        }
        return false;
    }
    return isZefoyReady;
}

// ============================================
// SUNTIK FUNCTIONS
// ============================================

const platformConfigs = {
    'TikTok': {
        icon: 'fab fa-tiktok',
        color: '#000000',
        actions: ['Followers', 'Likes', 'Views', 'Shares'],
        actionIcons: {
            'Followers': 'fa-users',
            'Likes': 'fa-heart',
            'Views': 'fa-eye',
            'Shares': 'fa-share-alt'
        }
    },
    'Instagram': {
        icon: 'fab fa-instagram',
        color: '#E4405F',
        actions: ['Followers', 'Likes', 'Views'],
        actionIcons: {
            'Followers': 'fa-users',
            'Likes': 'fa-heart',
            'Views': 'fa-eye'
        }
    },
    'YouTube': {
        icon: 'fab fa-youtube',
        color: '#FF0000',
        actions: ['Subscribers', 'Views', 'Likes'],
        actionIcons: {
            'Subscribers': 'fa-user-plus',
            'Views': 'fa-eye',
            'Likes': 'fa-thumbs-up'
        }
    },
    'Facebook': {
        icon: 'fab fa-facebook',
        color: '#1877F2',
        actions: ['Followers', 'Likes', 'Shares'],
        actionIcons: {
            'Followers': 'fa-users',
            'Likes': 'fa-thumbs-up',
            'Shares': 'fa-share-alt'
        }
    },
    'Twitter': {
        icon: 'fab fa-twitter',
        color: '#1DA1F2',
        actions: ['Followers', 'Likes', 'Retweets'],
        actionIcons: {
            'Followers': 'fa-users',
            'Likes': 'fa-heart',
            'Retweets': 'fa-retweet'
        }
    }
};

async function spamSuntik(target, platform, action, count, username, sessionId) {
    const results = { success: 0, failed: 0, total: 0, attempts: 0 };
    let isStopped = false;
    let cooldownUsed = false;
    let bypassAttempts = 0;
    let bypassSuccess = false;

    if (!global.spamSessions) global.spamSessions = {};
    global.spamSessions[sessionId] = { stop: () => { isStopped = true; } };

    // Initialize Zefoy if not ready
    if (!isZefoyReady) {
        io.emit('spamProgress', {
            sessionId, type: 'suntik',
            target, platform, action,
            current: 0, total: count,
            success: 0, failed: 0,
            message: '🔧 Initializing Zefoy bypass...',
            status: 'init'
        });

        const initResult = await initZefoy();
        if (!initResult) {
            io.emit('spamProgress', {
                sessionId, type: 'suntik',
                target, platform, action,
                current: 0, total: count,
                success: 0, failed: 0,
                message: '❌ Failed to initialize Zefoy!',
                status: 'error',
                error: 'Zefoy initialization failed'
            });
            return { success: 0, failed: count, total: count, attempts: 0, bypassFailed: true };
        }
    }

    // Check if Zefoy is ready
    if (!isZefoyReady) {
        io.emit('spamProgress', {
            sessionId, type: 'suntik',
            target, platform, action,
            current: 0, total: count,
            success: 0, failed: 0,
            message: '❌ Zefoy not ready! Please retry.',
            status: 'error',
            error: 'Zefoy not ready'
        });
        return { success: 0, failed: count, total: count, attempts: 0, bypassFailed: true };
    }

    for (let i = 0; i < count; i++) {
        if (isStopped) {
            io.emit('spamProgress', {
                sessionId, type: 'suntik',
                target, platform, action,
                current: i, total: count,
                success: results.success, failed: results.failed,
                message: '⛔ Stopped by user!',
                stopped: true,
                status: 'stopped'
            });
            break;
        }

        // Check cooldown
        if (zefoyCooldown) {
            io.emit('spamProgress', {
                sessionId, type: 'suntik',
                target, platform, action,
                current: i, total: count,
                success: results.success, failed: results.failed,
                message: '⏳ Cooldown 2 minutes... Please wait',
                status: 'cooldown',
                cooldown: true
            });
            
            // Wait until cooldown ends
            while (zefoyCooldown && !isStopped) {
                await sleep(1000);
            }
            
            if (isStopped) break;
        }

        // Keep Zefoy alive
        if (i % 5 === 0 && zefoyInstance) {
            await zefoyInstance.keepAlive();
        }

        // Execute service
        try {
            const result = await zefoyInstance.useService(platform, action, target, 1);
            
            if (result.success) {
                results.success++;
                io.emit('spamProgress', {
                    sessionId, type: 'suntik',
                    target, platform, action,
                    current: i + 1, total: count,
                    success: results.success, failed: results.failed,
                    message: `✅ ${i+1}/${count} Success! ${platform} ${action}`,
                    status: 'success',
                    serviceUsed: 'Zefoy'
                });
            } else {
                results.failed++;
                io.emit('spamProgress', {
                    sessionId, type: 'suntik',
                    target, platform, action,
                    current: i + 1, total: count,
                    success: results.success, failed: results.failed,
                    message: `❌ ${i+1}/${count} Failed: ${result.error || 'Unknown error'}`,
                    status: 'error',
                    error: result.error
                });
            }
        } catch (error) {
            results.failed++;
            io.emit('spamProgress', {
                sessionId, type: 'suntik',
                target, platform, action,
                current: i + 1, total: count,
                success: results.success, failed: results.failed,
                message: `❌ ${i+1}/${count} Error: ${error.message}`,
                status: 'error',
                error: error.message
            });
        }

        results.total = results.success + results.failed;
        results.attempts = i + 1;

        // Start cooldown after each successful service
        if (results.success > 0) {
            zefoyCooldown = true;
            io.emit('spamProgress', {
                sessionId, type: 'suntik',
                target, platform, action,
                current: i + 1, total: count,
                success: results.success, failed: results.failed,
                message: '⏳ Cooldown 2 minutes started...',
                status: 'cooldown_start',
                cooldown: true
            });

            // 2 minute cooldown (120 seconds)
            let cooldownRemaining = 120;
            while (cooldownRemaining > 0 && !isStopped) {
                await sleep(1000);
                cooldownRemaining--;
                if (cooldownRemaining % 10 === 0) {
                    io.emit('spamProgress', {
                        sessionId, type: 'suntik',
                        target, platform, action,
                        current: i + 1, total: count,
                        success: results.success, failed: results.failed,
                        message: `⏳ Cooldown: ${cooldownRemaining}s remaining`,
                        status: 'cooldown',
                        cooldown: true,
                        cooldownRemaining: cooldownRemaining
                    });
                }
            }
            
            zefoyCooldown = false;
        }

        // Delay between attempts
        if (i < count - 1 && !isStopped) {
            const delay = 2000 + Math.random() * 3000;
            await sleep(delay);
        }
    }

    // Final summary
    io.emit('spamProgress', {
        sessionId, type: 'suntik',
        target, platform, action,
        current: results.total, total: count,
        success: results.success, failed: results.failed,
        message: `📊 Selesai! Berhasil: ${results.success}, Gagal: ${results.failed}`,
        status: 'completed',
        completed: true,
        totalSuccess: results.success,
        totalFailed: results.failed,
        totalAttempts: results.attempts
    });

    if (global.spamSessions && global.spamSessions[sessionId]) {
        delete global.spamSessions[sessionId];
    }

    return results;
}

// ============================================
// API ROUTES
// ============================================

// ===== GET PLATFORMS =====
app.get('/api/suntik/platforms', (req, res) => {
    try {
        const platforms = Object.keys(platformConfigs).map(key => ({
            name: key,
            icon: platformConfigs[key].icon,
            color: platformConfigs[key].color,
            actions: platformConfigs[key].actions.map(action => ({
                name: action,
                icon: platformConfigs[key].actionIcons?.[action] || 'fa-circle'
            }))
        }));
        res.json({ success: true, platforms });
    } catch (err) {
        res.json({ success: false, platforms: [] });
    }
});

// ===== ZEFOY STATUS =====
app.get('/api/zefoy/status', async (req, res) => {
    try {
        res.json({
            success: true,
            ready: isZefoyReady,
            cooldown: zefoyCooldown,
            connected: zefoyInstance ? zefoyInstance.isConnected : false
        });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// ===== SPAM SUNTIK =====
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
        
        if (db.settings.maintenance && user.status !== 'Developer' && user.status !== 'VIP') {
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

        // Check Zefoy
        if (!isZefoyReady) {
            const initResult = await initZefoy();
            if (!initResult) {
                return res.json({ success: false, message: 'Zefoy initialization failed! Please retry.' });
            }
        }

        const sessionId = `suntik_${username}_${Date.now()}`;
        const result = await spamSuntik(target, platform, action, count, username, sessionId);
        
        if (result.success > 0) {
            user.used = (user.used || 0) + result.success;
            if (!db.stats) db.stats = { totalSuntikSent: 0 };
            db.stats.totalSuntikSent = (db.stats.totalSuntikSent || 0) + result.success;
            saveDB();
            io.emit('userUpdated', { username: user.username });
        }
        
        res.json({ 
            success: true, 
            result: {
                success: result.success,
                failed: result.failed,
                total: result.total || result.success + result.failed,
                attempts: result.attempts || 0,
                bypassFailed: result.bypassFailed || false
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

// ===== AUTH ROUTES =====

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
            createdAt: new Date().toISOString(),
            apiKey: generateApiKey()
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
                isReseller: user.isReseller,
                apiKey: user.apiKey
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
                isReseller: user.isReseller,
                apiKey: user.apiKey
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
                isReseller: u.isReseller,
                apiKey: u.apiKey
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
    let resetCount = 0;
    db.users.forEach(user => {
        if (user.limit !== Infinity && user.limit !== '∞') {
            if (user.lastReset && (now - user.lastReset) >= 3600000) {
                user.used = 0;
                user.lastReset = now;
                resetCount++;
                console.log(`🔄 Reset limit untuk ${user.username}`);
            }
            if (!user.lastReset) {
                user.lastReset = now;
                user.used = 0;
            }
        }
    });
    if (resetCount > 0) {
        saveDB();
        io.emit('usersUpdated', {});
        console.log(`✅ ${resetCount} users reset`);
    }
}, 60000);

// ===== KEEP ZEFOY ALIVE =====
setInterval(async () => {
    if (zefoyInstance && isZefoyReady) {
        try {
            await zefoyInstance.keepAlive();
            console.log('💓 Zefoy heartbeat');
        } catch (error) {
            console.log('⚠️ Zefoy heartbeat failed, reconnecting...');
            isZefoyReady = false;
            zefoyInstance = null;
        }
    }
}, 30000);

// ============================================
// STATS ROUTE
// ============================================
app.get('/api/stats', (req, res) => {
    try {
        if (!db.stats) db.stats = { totalSuntikSent: 0 };
        res.json({
            success: true,
            stats: {
                totalUsers: db.users.length,
                totalSuntikSent: db.stats.totalSuntikSent || 0,
                totalPayments: db.payments?.length || 0,
                onlineUsers: onlineUsers.size
            }
        });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log('========================================');
    console.log('👑 Admin: Lynzka / Asiafone11');
    console.log('💉 SUNTIK SUPER AGGRESSIVE');
    console.log('========================================');
    console.log('🔥 Zefoy Bypass Ready!');
    console.log('🔥 5 Platform Support');
    console.log('========================================');
    console.log('📊 Limit per status:');
    console.log('   Free     : 15x');
    console.log('   Premium  : 80x');
    console.log('   VIP      : 150x');
    console.log('   Reseller : 200x');
    console.log('   Developer: Unlimited');
    console.log('========================================');
    console.log('🎯 Platform Support:');
    console.log('   TikTok, Instagram, YouTube, Facebook, Twitter');
    console.log('========================================');
    console.log('⏳ Cooldown: 2 minutes after each success');
    console.log('========================================');
    console.log('✅ Server siap!');
    console.log('========================================');

    // Initialize Zefoy
    console.log('🔄 Initializing Zefoy...');
    await initZefoy();
});