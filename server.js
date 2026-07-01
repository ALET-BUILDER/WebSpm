// server.js - ZEFOY BYPASS DENGAN CAPTCHA MANUAL + ADMIN CONTROL

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
const cheerio = require('cheerio');

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
        maintenanceMessage: 'Server sedang dalam perbaikan. Silakan coba lagi nanti.',
        features: {
            tiktok_followers: true,
            tiktok_likes: true,
            tiktok_views: true,
            tiktok_shares: true,
            instagram_followers: true,
            instagram_likes: true,
            instagram_views: true,
            youtube_subscribers: true,
            youtube_views: true,
            youtube_likes: true,
            facebook_followers: true,
            facebook_likes: true,
            facebook_shares: true,
            twitter_followers: true,
            twitter_likes: true,
            twitter_retweets: true
        }
    },
    stats: {
        totalSuntikSent: 0,
        lastReset: Date.now()
    },
    captchaSessions: {}
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
    'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
];

function getRandomUserAgent() {
    return userAgents[Math.floor(Math.random() * userAgents.length)];
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ============================================
// ZEFOY BYPASS DENGAN CAPTCHA MANUAL
// ============================================

class ZefoyBypass {
    constructor() {
        this.cookies = '';
        this.isConnected = false;
        this.sessionData = null;
        this.lastCaptchaWord = null;
        this.captchaImage = null;
        this.baseUrl = 'https://zefoy.com';
        this.headers = {
            'User-Agent': getRandomUserAgent(),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Cache-Control': 'max-age=0'
        };
        this.captchaCache = [];
        this.isWaitingCaptcha = false;
        this.captchaSessionId = null;
    }

    // ============================================
    // STEP 1: BUKA ZEFOY & DAPATKAN CAPTCHA
    // ============================================
    async getCaptcha() {
        try {
            console.log('🔍 Getting captcha from Zefoy...');
            
            const response = await fetch(this.baseUrl, {
                headers: this.headers,
                redirect: 'manual'
            });

            // Ambil cookies
            const setCookies = response.headers.raw()['set-cookie'] || [];
            this.cookies = setCookies.map(c => c.split(';')[0]).join('; ');
            this.headers['Cookie'] = this.cookies;

            const html = await response.text();
            const $ = cheerio.load(html);
            
            // Cari kata captcha (text-based)
            let captchaWord = this.extractCaptchaWord($);
            let captchaImageUrl = null;
            
            // Cari gambar captcha
            const imgElement = $('img[src*="captcha"], img[src*="captcha.php"], img[alt*="captcha"]');
            if (imgElement.length > 0) {
                const src = imgElement.attr('src');
                if (src) {
                    captchaImageUrl = src.startsWith('http') ? src : `${this.baseUrl}${src}`;
                }
            }
            
            // Cari di div dengan class captcha
            if (!captchaWord) {
                const captchaText = $('.captcha-text, .captcha-word, .verification-text, .word-display');
                captchaWord = captchaText.text().trim().replace(/[^A-Za-z0-9]/g, '');
            }
            
            // Generate session ID untuk captcha
            this.captchaSessionId = uuidv4();
            this.isWaitingCaptcha = true;
            
            // Simpan ke database
            db.captchaSessions[this.captchaSessionId] = {
                captchaWord: captchaWord,
                captchaImage: captchaImageUrl,
                createdAt: Date.now(),
                solved: false,
                cookies: this.cookies
            };
            saveDB();
            
            console.log('📝 Captcha session created:', this.captchaSessionId);
            console.log('📝 Captcha word:', captchaWord);
            
            return {
                success: true,
                sessionId: this.captchaSessionId,
                captchaWord: captchaWord,
                captchaImage: captchaImageUrl,
                message: 'Masukkan kata captcha yang terlihat'
            };
        } catch (error) {
            console.error('❌ Get captcha error:', error.message);
            return { success: false, error: error.message };
        }
    }

    // ============================================
    // STEP 2: EKSTRAK KATA CAPTCHA
    // ============================================
    extractCaptchaWord($) {
        const selectors = [
            '.captcha-word',
            '.captcha-text',
            '#captcha-word',
            '.captcha-container span',
            '[class*="captcha"] span',
            '.verification-text',
            '.word-display',
            '.captcha-box span',
            '.captcha-code',
            '.code-display'
        ];

        for (const selector of selectors) {
            const text = $(selector).text().trim();
            if (text) {
                const clean = text.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
                if (clean.length >= 3) {
                    return clean;
                }
            }
        }

        // Fallback: cari pola huruf/kapital di text
        const bodyText = $('body').text();
        const match = bodyText.match(/[A-Z]{3,8}/);
        if (match) {
            return match[0];
        }

        return null;
    }

    // ============================================
    // STEP 3: SUBMIT CAPTCHA
    // ============================================
    async submitCaptcha(sessionId, word) {
        try {
            const session = db.captchaSessions[sessionId];
            if (!session) {
                return { success: false, error: 'Session tidak ditemukan!' };
            }

            // Gunakan cookies dari session
            this.headers['Cookie'] = session.cookies || this.cookies;

            console.log('📤 Submitting captcha:', word);

            // Cari form action
            const response = await fetch(this.baseUrl, {
                headers: {
                    ...this.headers,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                method: 'POST',
                body: new URLSearchParams({
                    'captcha': word,
                    'submit': 'Verifikasi'
                }),
                redirect: 'manual'
            });

            // Ambil cookies baru
            const setCookies = response.headers.raw()['set-cookie'] || [];
            if (setCookies.length > 0) {
                this.cookies = setCookies.map(c => c.split(';')[0]).join('; ');
                this.headers['Cookie'] = this.cookies;
                session.cookies = this.cookies;
            }

            const html = await response.text();
            const $ = cheerio.load(html);
            
            // Cek apakah berhasil
            const hasCaptcha = $('.captcha-word, .captcha-text, [class*="captcha"]').length > 0;
            
            if (!hasCaptcha) {
                console.log('✅ Captcha bypass berhasil!');
                this.isConnected = true;
                this.isWaitingCaptcha = false;
                session.solved = true;
                session.solvedAt = Date.now();
                saveDB();
                
                // Hapus session setelah 5 menit
                setTimeout(() => {
                    if (db.captchaSessions[sessionId]) {
                        delete db.captchaSessions[sessionId];
                        saveDB();
                    }
                }, 300000);
                
                return { success: true, message: 'Captcha berhasil! Zefoy siap digunakan.' };
            } else {
                console.log('❌ Captcha masih ada, mungkin salah input');
                return { success: false, error: 'Kata captcha salah! Coba lagi.' };
            }
        } catch (error) {
            console.error('❌ Submit captcha error:', error.message);
            return { success: false, error: error.message };
        }
    }

    // ============================================
    // STEP 4: BYPASS LENGKAP
    // ============================================
    async bypass() {
        const result = await this.getCaptcha();
        return result;
    }

    // ============================================
    // STEP 5: PAKAI LAYANAN ZEFOY
    // ============================================
    async useService(platform, action, target) {
        if (!this.isConnected) {
            console.log('⚠️ Not connected, need captcha first');
            return { success: false, error: 'Zefoy tidak terhubung! Selesaikan captcha terlebih dahulu.', needCaptcha: true };
        }

        // Cek fitur aktif
        const featureKey = `${platform.toLowerCase()}_${action.toLowerCase()}`.replace(/ /g, '_');
        if (db.settings.features && db.settings.features[featureKey] === false) {
            return { success: false, error: `Fitur ${platform} ${action} sedang dinonaktifkan oleh admin.` };
        }

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

            const url = `${this.baseUrl}${path}`;
            console.log(`📤 Using service: ${url}`);

            // Buka halaman service
            const response = await fetch(url, {
                headers: {
                    ...this.headers,
                    'User-Agent': getRandomUserAgent()
                }
            });
            
            const html = await response.text();
            const $ = cheerio.load(html);

            // Cek apakah ada captcha lagi
            const hasCaptcha = $('.captcha-word, .captcha-text, [class*="captcha"]').length > 0;
            if (hasCaptcha) {
                this.isConnected = false;
                return { success: false, error: 'Captcha muncul lagi! Perlu bypass ulang.', needCaptcha: true };
            }

            // Cari form untuk submit target
            const form = $('form');
            if (form.length > 0) {
                const formAction = form.attr('action') || '';
                const formData = new URLSearchParams();
                
                // Cari input target
                const targetInput = $('input[type="text"], input[placeholder*="username"], input[placeholder*="link"], input[name*="username"], input[name*="link"]');
                if (targetInput.length > 0) {
                    const name = targetInput.attr('name') || 'username';
                    formData.append(name, target);
                } else {
                    // Fallback: coba berbagai nama field
                    const possibleNames = ['username', 'link', 'url', 'target', 'id', 'user'];
                    for (const name of possibleNames) {
                        if ($(`input[name="${name}"]`).length > 0) {
                            formData.append(name, target);
                            break;
                        }
                    }
                }

                // Submit form
                const submitUrl = formAction ? new URL(formAction, this.baseUrl).toString() : url;
                const submitResponse = await fetch(submitUrl, {
                    headers: {
                        ...this.headers,
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'User-Agent': getRandomUserAgent()
                    },
                    method: form.attr('method') || 'POST',
                    body: formData
                });

                const resultHtml = await submitResponse.text();
                const result$ = cheerio.load(resultHtml);
                
                // Cek hasil
                const statusEl = result$('.status, .result, .message, .alert, .success, .error');
                const statusText = statusEl.text().trim() || 'Success';

                // Cek apakah ada pesan error
                if (statusText.toLowerCase().includes('error') || statusText.toLowerCase().includes('failed')) {
                    return { success: false, error: statusText };
                }

                return {
                    success: true,
                    message: statusText || 'Berhasil!',
                    platform: platform,
                    action: action,
                    target: target
                };
            }

            return { success: false, error: 'Form tidak ditemukan' };
        } catch (error) {
            console.error('❌ Service error:', error.message);
            return { success: false, error: error.message };
        }
    }

    // ============================================
    // STEP 6: KEEP ALIVE
    // ============================================
    async keepAlive() {
        try {
            const response = await fetch(this.baseUrl, {
                headers: {
                    ...this.headers,
                    'User-Agent': getRandomUserAgent()
                }
            });
            return response.status === 200;
        } catch (error) {
            return false;
        }
    }

    // ============================================
    // STEP 7: GET STATUS
    // ============================================
    getStatus() {
        return {
            connected: this.isConnected,
            cookies: this.cookies ? '✅' : '❌',
            waitingCaptcha: this.isWaitingCaptcha,
            captchaSessionId: this.captchaSessionId
        };
    }
}

// ============================================
// GLOBAL INSTANCE
// ============================================

let zefoyInstance = null;
let isZefoyReady = false;
let zefoyCooldown = false;

async function initZefoy() {
    try {
        console.log('🔄 Initializing Zefoy...');
        zefoyInstance = new ZefoyBypass();
        const result = await zefoyInstance.getCaptcha();
        if (result.success) {
            isZefoyReady = false; // Tunggu captcha diisi
            console.log('📝 Menunggu captcha diisi...');
        } else {
            isZefoyReady = false;
            console.log('❌ Init Zefoy gagal:', result.error);
        }
        return result;
    } catch (error) {
        console.error('❌ Init Zefoy error:', error.message);
        isZefoyReady = false;
        return { success: false, error: error.message };
    }
}

// ============================================
// PLATFORM CONFIG
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

// ============================================
// SUNTIK FUNCTIONS
// ============================================

async function spamSuntik(target, platform, action, count, username, sessionId) {
    const results = { success: 0, failed: 0, total: 0, attempts: 0 };
    let isStopped = false;

    if (!global.spamSessions) global.spamSessions = {};
    global.spamSessions[sessionId] = { stop: () => { isStopped = true; } };

    // Cek Zefoy
    if (!zefoyInstance || !isZefoyReady) {
        io.emit('spamProgress', {
            sessionId, type: 'suntik',
            target, platform, action,
            current: 0, total: count,
            success: 0, failed: 0,
            message: '🔑 Harap selesaikan captcha Zefoy terlebih dahulu!',
            status: 'need_captcha',
            needCaptcha: true
        });
        return { success: 0, failed: count, total: count, attempts: 0, needCaptcha: true };
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

        // Cooldown
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
            
            let cooldownRemaining = 120;
            while (cooldownRemaining > 0 && !isStopped) {
                await sleep(1000);
                cooldownRemaining--;
                if (cooldownRemaining % 10 === 0) {
                    io.emit('spamProgress', {
                        sessionId, type: 'suntik',
                        target, platform, action,
                        current: i, total: count,
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

        // Keep alive setiap 3 attempt
        if (i > 0 && i % 3 === 0 && zefoyInstance) {
            await zefoyInstance.keepAlive();
        }

        // Execute
        try {
            const result = await zefoyInstance.useService(platform, action, target);
            
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
                // Cooldown setelah sukses
                if (i < count - 1) {
                    zefoyCooldown = true;
                }
            } else if (result.needCaptcha) {
                // Butuh captcha ulang
                io.emit('spamProgress', {
                    sessionId, type: 'suntik',
                    target, platform, action,
                    current: i + 1, total: count,
                    success: results.success, failed: results.failed,
                    message: '🔑 Captcha diperlukan! Selesaikan captcha di halaman Zefoy.',
                    status: 'need_captcha',
                    needCaptcha: true
                });
                isZefoyReady = false;
                break;
            } else {
                results.failed++;
                io.emit('spamProgress', {
                    sessionId, type: 'suntik',
                    target, platform, action,
                    current: i + 1, total: count,
                    success: results.success, failed: results.failed,
                    message: `❌ ${i+1}/${count} Failed: ${result.error || 'Unknown'}`,
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

        if (i < count - 1 && !isStopped && !zefoyCooldown) {
            await sleep(2000 + Math.random() * 3000);
        }
    }

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
                icon: platformConfigs[key].actionIcons?.[action] || 'fa-circle',
                enabled: db.settings.features?.[`${key.toLowerCase()}_${action.toLowerCase().replace(/ /g, '_')}`] !== false
            }))
        }));
        res.json({ success: true, platforms });
    } catch (err) {
        res.json({ success: false, platforms: [] });
    }
});

// ===== ZEFOY CAPTCHA =====
app.get('/api/zefoy/captcha', async (req, res) => {
    try {
        if (!zefoyInstance) {
            zefoyInstance = new ZefoyBypass();
        }
        const result = await zefoyInstance.getCaptcha();
        res.json(result);
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.post('/api/zefoy/captcha/submit', async (req, res) => {
    try {
        const { sessionId, word } = req.body;
        if (!sessionId || !word) {
            return res.json({ success: false, error: 'Session ID dan kata captcha wajib diisi!' });
        }
        
        const result = await zefoyInstance.submitCaptcha(sessionId, word);
        if (result.success) {
            isZefoyReady = true;
        }
        res.json(result);
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.get('/api/zefoy/captcha/status', (req, res) => {
    try {
        const sessions = Object.keys(db.captchaSessions || {}).map(key => ({
            id: key,
            ...db.captchaSessions[key]
        }));
        res.json({
            success: true,
            sessions,
            isReady: isZefoyReady,
            isConnected: zefoyInstance ? zefoyInstance.isConnected : false,
            waitingCaptcha: zefoyInstance ? zefoyInstance.isWaitingCaptcha : false
        });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// ===== ZEFOY STATUS =====
app.get('/api/zefoy/status', async (req, res) => {
    try {
        const status = zefoyInstance ? zefoyInstance.getStatus() : { connected: false };
        res.json({
            success: true,
            ready: isZefoyReady,
            cooldown: zefoyCooldown,
            connected: status.connected,
            waitingCaptcha: status.waitingCaptcha || false,
            captchaSessionId: status.captchaSessionId || null
        });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// ===== INIT ZEFOY =====
app.post('/api/zefoy/init', async (req, res) => {
    try {
        const result = await initZefoy();
        res.json(result);
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
        
        // Cek fitur aktif
        const featureKey = `${platform.toLowerCase()}_${action.toLowerCase().replace(/ /g, '_')}`;
        if (db.settings.features && db.settings.features[featureKey] === false) {
            return res.json({ 
                success: false, 
                message: `Fitur ${platform} ${action} sedang dinonaktifkan oleh admin.` 
            });
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

        // Cek Zefoy
        if (!isZefoyReady) {
            return res.json({ 
                success: false, 
                message: 'Zefoy belum siap! Selesaikan captcha terlebih dahulu.',
                needCaptcha: true
            });
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
                needCaptcha: result.needCaptcha || false
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
        db.settings = { ...db.settings, ...settings };
        saveDB();
        io.emit('settingsUpdated', { settings: db.settings });
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

app.get('/api/admin/features', (req, res) => {
    try {
        res.json({
            success: true,
            features: db.settings.features || {}
        });
    } catch (err) {
        res.json({ success: false, features: {} });
    }
});

app.post('/api/admin/features/toggle', (req, res) => {
    try {
        const { featureKey, enabled, admin } = req.body;
        const adminUser = db.users.find(u => u.username === admin);
        if (!adminUser || !adminUser.isDeveloper) {
            return res.json({ success: false, message: 'Hanya Developer!' });
        }
        if (!db.settings.features) db.settings.features = {};
        db.settings.features[featureKey] = enabled;
        saveDB();
        io.emit('settingsUpdated', { settings: db.settings });
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

// ===== RESET LIMIT =====
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
        }
    }
}, 30000);

// ============================================
// STATS
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
    console.log('💉 SUNTIK SOSIAL MEDIA + CAPTCHA BYPASS');
    console.log('========================================');
    console.log('🔥 Platform: TikTok, Instagram, YouTube, Facebook, Twitter');
    console.log('========================================');
    console.log('✅ Server siap!');
    console.log('========================================');

    // Init Zefoy
    console.log('🔄 Initializing Zefoy...');
    setTimeout(async () => {
        await initZefoy();
    }, 3000);
});