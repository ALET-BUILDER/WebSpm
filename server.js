// ============================================
// PRANKMASTER PRO V6 - SMM PANEL API
// ============================================

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
        maintenanceMessage: 'Server sedang dalam perbaikan.',
        smmApiKey: '199d2c58cab21534580f7d3cdb58a2eb',
        smmApiUrl: 'https://smmstone.com/api/v2',
        providers: {
            smmpanel: { enabled: true, cooldown: 60, maxPerDay: 100 },
            tikfollowers: { enabled: true, cooldown: 120, maxPerDay: 50 }
        },
        features: {}
    },
    stats: { totalSuntikSent: 0 },
    activeSessions: {}
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
// USER AGENT
// ============================================
function getRandomUserAgent() {
    const agents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];
    return agents[Math.floor(Math.random() * agents.length)];
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// PLATFORM CONFIG
// ============================================

const platformConfigs = {
    'TikTok': {
        icon: 'fab fa-tiktok',
        color: '#000000',
        provider: 'tikfollowers',
        actions: ['Followers', 'Likes', 'Views', 'Shares'],
        actionIcons: { 'Followers': 'fa-users', 'Likes': 'fa-heart', 'Views': 'fa-eye', 'Shares': 'fa-share-alt' },
        smmServices: {
            'Followers': 1,  // ID service di SMM panel
            'Likes': 2,
            'Views': 3,
            'Shares': 4
        }
    },
    'Instagram': {
        icon: 'fab fa-instagram',
        color: '#E4405F',
        provider: 'smmpanel',
        actions: ['Followers', 'Likes', 'Views'],
        actionIcons: { 'Followers': 'fa-users', 'Likes': 'fa-heart', 'Views': 'fa-eye' },
        smmServices: {
            'Followers': 101,
            'Likes': 102,
            'Views': 103
        }
    },
    'YouTube': {
        icon: 'fab fa-youtube',
        color: '#FF0000',
        provider: 'smmpanel',
        actions: ['Subscribers', 'Views', 'Likes'],
        actionIcons: { 'Subscribers': 'fa-user-plus', 'Views': 'fa-eye', 'Likes': 'fa-thumbs-up' },
        smmServices: {
            'Subscribers': 201,
            'Views': 202,
            'Likes': 203
        }
    },
    'Facebook': {
        icon: 'fab fa-facebook',
        color: '#1877F2',
        provider: 'smmpanel',
        actions: ['Followers', 'Likes', 'Shares'],
        actionIcons: { 'Followers': 'fa-users', 'Likes': 'fa-thumbs-up', 'Shares': 'fa-share-alt' },
        smmServices: {
            'Followers': 301,
            'Likes': 302,
            'Shares': 303
        }
    },
    'Twitter': {
        icon: 'fab fa-twitter',
        color: '#1DA1F2',
        provider: 'smmpanel',
        actions: ['Followers', 'Likes', 'Retweets'],
        actionIcons: { 'Followers': 'fa-users', 'Likes': 'fa-heart', 'Retweets': 'fa-retweet' },
        smmServices: {
            'Followers': 401,
            'Likes': 402,
            'Retweets': 403
        }
    },
    'Telegram': {
        icon: 'fab fa-telegram',
        color: '#0088cc',
        provider: 'smmpanel',
        actions: ['Members', 'Views', 'Reactions'],
        actionIcons: { 'Members': 'fa-users', 'Views': 'fa-eye', 'Reactions': 'fa-smile' },
        smmServices: {
            'Members': 501,
            'Views': 502,
            'Reactions': 503
        }
    },
    'Threads': {
        icon: 'fab fa-threads',
        color: '#000000',
        provider: 'smmpanel',
        actions: ['Followers', 'Likes'],
        actionIcons: { 'Followers': 'fa-users', 'Likes': 'fa-heart' },
        smmServices: {
            'Followers': 601,
            'Likes': 602
        }
    },
    'Twitch': {
        icon: 'fab fa-twitch',
        color: '#9146FF',
        provider: 'smmpanel',
        actions: ['Followers', 'Views'],
        actionIcons: { 'Followers': 'fa-users', 'Views': 'fa-eye' },
        smmServices: {
            'Followers': 701,
            'Views': 702
        }
    },
    'Spotify': {
        icon: 'fab fa-spotify',
        color: '#1DB954',
        provider: 'smmpanel',
        actions: ['Followers', 'Plays'],
        actionIcons: { 'Followers': 'fa-users', 'Plays': 'fa-play' },
        smmServices: {
            'Followers': 801,
            'Plays': 802
        }
    },
    'Discord': {
        icon: 'fab fa-discord',
        color: '#5865F2',
        provider: 'smmpanel',
        actions: ['Members'],
        actionIcons: { 'Members': 'fa-users' },
        smmServices: {
            'Members': 901
        }
    },
    'VK': {
        icon: 'fab fa-vk',
        color: '#0077FF',
        provider: 'smmpanel',
        actions: ['Followers', 'Likes', 'Views'],
        actionIcons: { 'Followers': 'fa-users', 'Likes': 'fa-heart', 'Views': 'fa-eye' },
        smmServices: {
            'Followers': 1001,
            'Likes': 1002,
            'Views': 1003
        }
    },
    'Kwai': {
        icon: 'fas fa-video',
        color: '#FF6B00',
        provider: 'smmpanel',
        actions: ['Followers', 'Likes', 'Views'],
        actionIcons: { 'Followers': 'fa-users', 'Likes': 'fa-heart', 'Views': 'fa-eye' },
        smmServices: {
            'Followers': 1101,
            'Likes': 1102,
            'Views': 1103
        }
    },
    'SoundCloud': {
        icon: 'fab fa-soundcloud',
        color: '#FF3300',
        provider: 'smmpanel',
        actions: ['Plays'],
        actionIcons: { 'Plays': 'fa-play' },
        smmServices: {
            'Plays': 1201
        }
    },
    'Clubhouse': {
        icon: 'fas fa-users',
        color: '#6515DD',
        provider: 'smmpanel',
        actions: ['Followers'],
        actionIcons: { 'Followers': 'fa-users' },
        smmServices: {
            'Followers': 1301
        }
    }
};

// ============================================
// SMM PANEL API - FREE SERVICES
// ============================================

class SMMPanelProvider {
    constructor() {
        this.sessionId = uuidv4();
        this.cooldownUntil = 0;
        this.dailyCount = 0;
        this.dailyReset = Date.now();
        this.apiKey = db.settings.smmApiKey || '199d2c58cab21534580f7d3cdb58a2eb';
        this.apiUrl = db.settings.smmApiUrl || 'https://smmstone.com/api/v2';
    }

    checkDailyLimit() {
        const now = Date.now();
        if (now - this.dailyReset > 24 * 60 * 60 * 1000) {
            this.dailyCount = 0;
            this.dailyReset = now;
        }
        return this.dailyCount < (db.settings.providers.smmpanel?.maxPerDay || 100);
    }

    async useService(platform, action, target) {
        if (!this.checkDailyLimit()) {
            return { success: false, error: 'Daily limit reached!', fallback: true };
        }

        const now = Date.now();
        if (this.cooldownUntil > now) {
            return {
                success: false,
                error: `Cooldown ${Math.ceil((this.cooldownUntil - now) / 1000)}s`,
                cooldown: true,
                cooldownRemaining: Math.ceil((this.cooldownUntil - now) / 1000),
                fallback: true
            };
        }

        // Get service ID for platform + action
        const platformConfig = platformConfigs[platform];
        if (!platformConfig) {
            return { success: false, error: 'Platform tidak ditemukan!', fallback: true };
        }

        const serviceId = platformConfig.smmServices?.[action];
        if (!serviceId) {
            return { success: false, error: 'Service ID tidak ditemukan!', fallback: true };
        }

        try {
            console.log(`📤 SMM Panel: ${platform} ${action} for ${target} (Service ID: ${serviceId})`);

            // Format target based on platform
            let formattedTarget = target;
            if (platform === 'TikTok' && target.includes('tiktok.com')) {
                // Extract username from URL
                const match = target.match(/@([a-zA-Z0-9_.]+)/);
                if (match) formattedTarget = match[1];
            }

            // Call SMM API - FREE service
            const response = await fetch(`${this.apiUrl}/order`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    key: this.apiKey,
                    action: 'add',
                    service: serviceId,
                    link: formattedTarget,
                    quantity: 1
                })
            });

            const result = await response.json();

            console.log('📥 SMM API Response:', result);

            if (result && result.order) {
                this.cooldownUntil = Date.now() + (db.settings.providers.smmpanel?.cooldown || 60) * 1000;
                this.dailyCount++;

                return {
                    success: true,
                    message: `✅ Order ID: ${result.order}`,
                    platform,
                    action,
                    target,
                    provider: 'smmpanel',
                    orderId: result.order
                };
            } else if (result && result.error) {
                return { 
                    success: false, 
                    error: result.error || 'Gagal order!',
                    fallback: true 
                };
            } else {
                return { 
                    success: false, 
                    error: 'Unknown error from SMM API',
                    fallback: true 
                };
            }

        } catch (error) {
            console.error('❌ SMM Panel error:', error.message);
            return { success: false, error: error.message, fallback: true };
        }
    }

    getStatus() {
        const now = Date.now();
        return {
            provider: 'smmpanel',
            cooldownRemaining: Math.max(0, Math.ceil((this.cooldownUntil - now) / 1000)),
            dailyRemaining: (db.settings.providers.smmpanel?.maxPerDay || 100) - this.dailyCount,
            isReady: this.cooldownUntil <= now && this.checkDailyLimit(),
            enabled: db.settings.providers.smmpanel?.enabled !== false,
            apiKey: this.apiKey ? '✅ Set' : '❌ Not Set'
        };
    }
}

// ============================================
// TIKFOLLOWERS - FIXED (No Login Required)
// ============================================

class TikFollowersProvider {
    constructor() {
        this.sessionId = uuidv4();
        this.cooldownUntil = 0;
        this.dailyCount = 0;
        this.dailyReset = Date.now();
        this.baseUrl = 'https://tikfollowers.com';
        this.cookies = '';
    }

    checkDailyLimit() {
        const now = Date.now();
        if (now - this.dailyReset > 24 * 60 * 60 * 1000) {
            this.dailyCount = 0;
            this.dailyReset = now;
        }
        return this.dailyCount < (db.settings.providers.tikfollowers?.maxPerDay || 50);
    }

    async useService(platform, action, target) {
        if (platform !== 'TikTok') {
            return { success: false, error: 'TikFollowers hanya support TikTok!', fallback: true };
        }

        if (!this.checkDailyLimit()) {
            return { success: false, error: 'Daily limit reached!', fallback: true };
        }

        const now = Date.now();
        if (this.cooldownUntil > now) {
            return {
                success: false,
                error: `Cooldown ${Math.ceil((this.cooldownUntil - now) / 1000)}s`,
                cooldown: true,
                cooldownRemaining: Math.ceil((this.cooldownUntil - now) / 1000),
                fallback: true
            };
        }

        // Extract username from URL or use as is
        let username = target;
        if (target.includes('tiktok.com')) {
            const match = target.match(/@([a-zA-Z0-9_.]+)/);
            if (match) username = match[1];
        }

        const serviceMap = {
            'Followers': '/free-tiktok-followers',
            'Likes': '/free-tiktok-like',
            'Views': '/free-tiktok-video-views',
            'Shares': '/free-tiktok-shares'
        };

        const path = serviceMap[action];
        if (!path) return { success: false, error: 'Service tidak ditemukan!', fallback: true };

        try {
            const url = `${this.baseUrl}${path}`;
            console.log(`📤 TikFollowers: ${action} for ${username}`);

            // STEP 1: GET page to get cookies and form
            const response = await fetch(url, {
                headers: {
                    'User-Agent': getRandomUserAgent(),
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                }
            });

            const html = await response.text();
            const $ = cheerio.load(html);

            // Save cookies
            const cookies = response.headers.raw()['set-cookie'] || [];
            this.cookies = cookies.map(c => c.split(';')[0]).join('; ');

            // STEP 2: Find the form - Try multiple selectors
            let form = $('form');
            let input = $('input[type="text"]');

            // If form not found, try other selectors
            if (form.length === 0) {
                // Try to find input first, then find parent form
                input = $('input[type="text"]');
                if (input.length > 0) {
                    form = input.closest('form');
                }
            }

            // If still no form, try alternative selectors
            if (form.length === 0) {
                // Try div with form-like structure
                const formDiv = $('div[class*="form"], div[class*="input"]');
                if (formDiv.length > 0) {
                    const inputInside = formDiv.find('input[type="text"]');
                    if (inputInside.length > 0) {
                        input = inputInside;
                        // Create fake form
                        form = $('<form>');
                        form.attr('action', url);
                        form.attr('method', 'POST');
                    }
                }
            }

            if (form.length === 0 || input.length === 0) {
                console.log('⚠️ Form not found, trying alternative method...');
                
                // Alternative: Try to submit directly via fetch with form data
                const formData = new URLSearchParams();
                formData.append('username', username);
                formData.append('action', action.toLowerCase());

                const directSubmit = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'User-Agent': getRandomUserAgent(),
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
                        'Cookie': this.cookies,
                        'Referer': url
                    },
                    body: formData
                });

                const resultHtml = await directSubmit.text();
                const result$ = cheerio.load(resultHtml);

                // Check for success
                const successMsg = result$('.success, .alert-success, .result-success').text().trim();
                const errorMsg = result$('.error, .alert-danger, .result-error').text().trim();

                if (successMsg || !errorMsg) {
                    this.cooldownUntil = Date.now() + 120 * 1000;
                    this.dailyCount++;
                    return {
                        success: true,
                        message: successMsg || '✅ Berhasil!',
                        platform,
                        action,
                        target: username,
                        provider: 'tikfollowers'
                    };
                }

                return { success: false, error: errorMsg || 'Gagal!', fallback: true };
            }

            // STEP 3: Get form details
            const formAction = form.attr('action') || '';
            const formMethod = form.attr('method') || 'POST';
            const submitUrl = formAction ? new URL(formAction, this.baseUrl).toString() : url;
            const inputName = input.attr('name') || 'username';

            // STEP 4: Submit the form
            const formData = new URLSearchParams();
            formData.append(inputName, username);

            // Add any hidden inputs from the form
            form.find('input[type="hidden"]').each((i, el) => {
                const name = $(el).attr('name');
                const value = $(el).attr('value');
                if (name && value) {
                    formData.append(name, value);
                }
            });

            const submitResponse = await fetch(submitUrl, {
                method: formMethod,
                headers: {
                    'User-Agent': getRandomUserAgent(),
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
                    'Cookie': this.cookies,
                    'Referer': url
                },
                body: formData
            });

            const resultHtml = await submitResponse.text();
            const result$ = cheerio.load(resultHtml);

            // STEP 5: Check result
            const successSelectors = [
                '.success', '.alert-success', '.result-success', 
                '.message-success', '.text-success', '.bg-success',
                '[class*="success"]', '[class*="done"]', '[class*="complete"]'
            ];
            
            let successMsg = '';
            for (const sel of successSelectors) {
                const text = result$(sel).text().trim();
                if (text && text.length > 3) {
                    successMsg = text;
                    break;
                }
            }

            // If no success message, check for "wait" or timer
            const bodyText = result$('body').text().toLowerCase();
            if (!successMsg) {
                if (bodyText.includes('wait') || bodyText.includes('tunggu') || bodyText.includes('cooldown')) {
                    return {
                        success: false,
                        error: 'Harap tunggu 15 menit sebelum request lagi!',
                        cooldown: true,
                        cooldownRemaining: 900,
                        fallback: true
                    };
                }
                
                if (bodyText.includes('success') || bodyText.includes('berhasil') || bodyText.includes('done')) {
                    successMsg = '✅ Berhasil!';
                }
            }

            const cooldownSeconds = db.settings.providers.tikfollowers?.cooldown || 120;
            this.cooldownUntil = Date.now() + cooldownSeconds * 1000;
            this.dailyCount++;

            if (successMsg) {
                return {
                    success: true,
                    message: successMsg || '✅ Berhasil!',
                    platform,
                    action,
                    target: username,
                    provider: 'tikfollowers',
                    dailyRemaining: (db.settings.providers.tikfollowers?.maxPerDay || 50) - this.dailyCount
                };
            }

            // Check for error messages
            const errorSelectors = [
                '.error', '.alert-danger', '.result-error', 
                '.message-error', '.text-danger', '.bg-danger',
                '[class*="error"]', '[class*="fail"]'
            ];
            
            let errorMsg = '';
            for (const sel of errorSelectors) {
                const text = result$(sel).text().trim();
                if (text && text.length > 3) {
                    errorMsg = text;
                    break;
                }
            }

            return { 
                success: false, 
                error: errorMsg || 'Gagal, coba lagi nanti!', 
                fallback: true 
            };

        } catch (error) {
            console.error('❌ TikFollowers error:', error.message);
            return { success: false, error: error.message, fallback: true };
        }
    }

    getStatus() {
        const now = Date.now();
        const maxPerDay = db.settings.providers.tikfollowers?.maxPerDay || 50;
        return {
            provider: 'tikfollowers',
            cooldownRemaining: Math.max(0, Math.ceil((this.cooldownUntil - now) / 1000)),
            dailyCount: this.dailyCount,
            dailyLimit: maxPerDay,
            dailyRemaining: maxPerDay - this.dailyCount,
            isReady: this.cooldownUntil <= now && this.dailyCount < maxPerDay,
            enabled: db.settings.providers.tikfollowers?.enabled !== false,
            requiresLogin: false // Tidak perlu login!
        };
    }
}

// ============================================
// SESSION MANAGER
// ============================================

class SessionManager {
    constructor() {
        this.smmpanel = new SMMPanelProvider();
        this.tikfollowers = new TikFollowersProvider();
    }

    getProvider(provider) {
        if (provider === 'smmpanel') return this.smmpanel;
        if (provider === 'tikfollowers') return this.tikfollowers;
        return null;
    }

    getStatus() {
        return {
            smmpanel: this.smmpanel.getStatus(),
            tikfollowers: this.tikfollowers.getStatus()
        };
    }
}

const sessionManager = new SessionManager();

// ============================================
// GLOBAL SPAM SESSIONS
// ============================================
global.spamSessions = {};

// ============================================
// SUNTIK FUNCTION - FIXED STOP & LIMIT
// ============================================

async function spamSuntik(target, platform, action, count, username, sessionId) {
    const results = { success: 0, failed: 0, total: 0, attempts: 0 };
    let isStopped = false;
    let isCompleted = false;

    // STOP FUNCTION - FIXED
    if (!global.spamSessions) global.spamSessions = {};
    global.spamSessions[sessionId] = { 
        stop: () => { 
            isStopped = true; 
            console.log('🛑 Stop signal received for session:', sessionId);
        },
        isStopped: () => isStopped,
        isCompleted: () => isCompleted
    };

    const platformConfig = platformConfigs[platform];
    const primaryProvider = platformConfig?.provider || 'smmpanel';
    const fallbackProvider = primaryProvider === 'smmpanel' ? 'tikfollowers' : 'smmpanel';

    const primaryEnabled = db.settings.providers[primaryProvider]?.enabled !== false;
    const fallbackEnabled = db.settings.providers[fallbackProvider]?.enabled !== false;

    // Get user for limit check
    const user = db.users.find(u => u.username === username);
    const limits = { 'Free': 15, 'Premium': 80, 'VIP': 150, 'Reseller': 200, 'Developer': Infinity };
    const userLimit = limits[user?.status] || 15;
    const maxCount = Math.min(count, userLimit);

    if (maxCount < count) {
        io.emit('spamProgress', {
            sessionId, type: 'suntik',
            target, platform, action,
            current: 0, total: count,
            success: 0, failed: 0,
            message: `⚠️ Limit ${userLimit}, hanya bisa ${maxCount}x`,
            status: 'warning'
        });
        count = maxCount;
    }

    for (let i = 0; i < count; i++) {
        // CHECK STOP - FIXED
        if (isStopped || (global.spamSessions[sessionId] && global.spamSessions[sessionId].isStopped())) {
            io.emit('spamProgress', {
                sessionId, type: 'suntik',
                target, platform, action,
                current: i, total: count,
                success: results.success, failed: results.failed,
                message: '⛔ Stopped by user!',
                stopped: true,
                status: 'stopped'
            });
            isCompleted = true;
            break;
        }

        // Check user limit per iteration
        if (user && user.limit !== Infinity && user.limit !== '∞') {
            const remaining = user.limit - (user.used || 0);
            if (remaining <= 0) {
                io.emit('spamProgress', {
                    sessionId, type: 'suntik',
                    target, platform, action,
                    current: i, total: count,
                    success: results.success, failed: results.failed,
                    message: '⛔ Limit habis!',
                    status: 'error'
                });
                isCompleted = true;
                break;
            }
        }

        let providerUsed = null;
        let result = null;

        // Try primary provider
        if (primaryEnabled) {
            const provider = sessionManager.getProvider(primaryProvider);
            result = await provider.useService(platform, action, target);
            if (result && result.success) {
                providerUsed = primaryProvider;
            }
        }

        // If primary fails, try fallback
        if ((!result || !result.success) && fallbackEnabled) {
            const provider = sessionManager.getProvider(fallbackProvider);
            const fallbackResult = await provider.useService(platform, action, target);
            if (fallbackResult && fallbackResult.success) {
                result = fallbackResult;
                providerUsed = fallbackProvider;
            } else if (fallbackResult && fallbackResult.cooldown) {
                result = fallbackResult;
            }
        }

        if (result && result.success) {
            results.success++;
            // Update user used count
            if (user) {
                user.used = (user.used || 0) + 1;
                saveDB();
            }
            io.emit('spamProgress', {
                sessionId, type: 'suntik',
                target, platform, action,
                current: i + 1, total: count,
                success: results.success, failed: results.failed,
                message: `✅ ${i+1}/${count} Success! ${platform} ${action} (${providerUsed})`,
                status: 'success'
            });
        } else if (result && result.cooldown) {
            io.emit('spamProgress', {
                sessionId, type: 'suntik',
                target, platform, action,
                current: i + 1, total: count,
                success: results.success, failed: results.failed,
                message: `⏳ ${result.error}`,
                status: 'cooldown',
                cooldown: true,
                cooldownRemaining: result.cooldownRemaining || 0
            });
            await sleep(3000);
            i--;
            continue;
        } else {
            results.failed++;
            const errorMsg = result?.error || 'Unknown error';
            io.emit('spamProgress', {
                sessionId, type: 'suntik',
                target, platform, action,
                current: i + 1, total: count,
                success: results.success, failed: results.failed,
                message: `❌ ${i+1}/${count} Failed: ${errorMsg}`,
                status: 'error',
                error: errorMsg
            });
        }

        results.total = results.success + results.failed;
        results.attempts = i + 1;

        if (isStopped || (global.spamSessions[sessionId] && global.spamSessions[sessionId].isStopped())) {
            break;
        }

        if (i < count - 1 && !isStopped) {
            await sleep(2000 + Math.random() * 3000);
        }
    }

    if (!isStopped && !isCompleted) {
        isCompleted = true;
        io.emit('spamProgress', {
            sessionId, type: 'suntik',
            target, platform, action,
            current: results.total, total: count,
            success: results.success, failed: results.failed,
            message: `📊 Selesai! Berhasil: ${results.success}, Gagal: ${results.failed}`,
            status: 'completed',
            completed: true
        });
    }

    // Update stats
    if (results.success > 0) {
        db.stats.totalSuntikSent = (db.stats.totalSuntikSent || 0) + results.success;
        saveDB();
        io.emit('userUpdated', { username: user?.username });
    }

    // Cleanup
    if (global.spamSessions && global.spamSessions[sessionId]) {
        delete global.spamSessions[sessionId];
    }

    return results;
}

// ============================================
// API ROUTES
// ============================================

app.get('/api/suntik/platforms', (req, res) => {
    try {
        const platforms = Object.keys(platformConfigs).map(key => {
            const isDisabled = db.settings.adminControls?.[`disable${key}`] || false;
            return {
                name: key,
                icon: platformConfigs[key].icon,
                color: platformConfigs[key].color,
                provider: platformConfigs[key].provider,
                disabled: isDisabled || db.settings.adminControls?.disableAllSuntik || false,
                actions: platformConfigs[key].actions.map(action => ({
                    name: action,
                    icon: platformConfigs[key].actionIcons?.[action] || 'fa-circle',
                    enabled: db.settings.features?.[`${key.toLowerCase()}_${action.toLowerCase().replace(/ /g, '_')}`] !== false
                }))
            };
        });
        res.json({ success: true, platforms });
    } catch (err) {
        res.json({ success: false, platforms: [] });
    }
});

app.get('/api/providers/status', (req, res) => {
    try {
        const status = sessionManager.getStatus();
        res.json({
            success: true,
            providers: {
                smmpanel: status.smmpanel,
                tikfollowers: status.tikfollowers
            }
        });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.post('/api/spam/suntik', async (req, res) => {
    try {
        const { username, target, platform, action, count } = req.body;

        if (db.settings.adminControls?.disableAllSuntik) {
            return res.json({ success: false, message: '⚠️ Semua fitur suntik dinonaktifkan!' });
        }

        if (db.settings.adminControls?.[`disable${platform}`]) {
            return res.json({ success: false, message: `⚠️ ${platform} dinonaktifkan!` });
        }

        const user = db.users.find(u => u.username === username);
        if (!user) return res.json({ success: false, message: 'User tidak ditemukan!' });

        if (db.settings.maintenance && user.status !== 'Developer') {
            return res.json({ success: false, message: db.settings.maintenanceMessage });
        }

        if (!target) return res.json({ success: false, message: 'Target wajib diisi!' });
        if (!platform || !action) return res.json({ success: false, message: 'Pilih platform dan aksi!' });

        const featureKey = `${platform.toLowerCase()}_${action.toLowerCase().replace(/ /g, '_')}`;
        if (db.settings.features?.[featureKey] === false) {
            return res.json({ success: false, message: `Fitur ${platform} ${action} dinonaktifkan!` });
        }

        if (!count || count < 1) return res.json({ success: false, message: 'Jumlah minimal 1!' });

        const limits = { 'Free': 15, 'Premium': 80, 'VIP': 150, 'Reseller': 200, 'Developer': Infinity };
        const maxLimit = limits[user.status] || 15;

        if (user.limit !== Infinity && user.limit !== '∞') {
            if (count > maxLimit) {
                return res.json({ success: false, message: `Maksimal ${maxLimit}x untuk ${user.status}!` });
            }
            const remaining = user.limit - (user.used || 0);
            if (remaining <= 0) return res.json({ success: false, message: 'Limit habis! Tunggu 1 jam.' });
            if (count > remaining) return res.json({ success: false, message: `Sisa limit ${remaining}!` });
        }

        const sessionId = `suntik_${username}_${Date.now()}`;
        
        // Run spam in background
        spamSuntik(target, platform, action, count, username, sessionId).then(result => {
            if (result.success > 0) {
                user.used = (user.used || 0) + result.success;
                db.stats.totalSuntikSent = (db.stats.totalSuntikSent || 0) + result.success;
                saveDB();
                io.emit('userUpdated', { username: user.username });
            }
        });

        res.json({
            success: true,
            message: 'Suntik dimulai!',
            sessionId: sessionId
        });
    } catch (err) {
        console.error('❌ Error:', err);
        res.json({ success: false, message: err.message });
    }
});

app.post('/api/spam/suntik/stop', (req, res) => {
    try {
        const { sessionId } = req.body;
        console.log('🛑 Stop request for session:', sessionId);
        
        if (global.spamSessions && global.spamSessions[sessionId]) {
            global.spamSessions[sessionId].stop();
            console.log('✅ Stop signal sent for session:', sessionId);
            return res.json({ success: true, message: 'Suntik dihentikan!' });
        }
        return res.json({ success: false, message: 'Session tidak ditemukan!' });
    } catch (err) {
        console.error('❌ Stop error:', err);
        res.json({ success: false, message: err.message });
    }
});

// ============================================
// AUTH ROUTES
// ============================================

app.post('/api/register', (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.json({ success: false, message: 'Isi semua field!' });
        if (username.length < 3) return res.json({ success: false, message: 'Username min 3 karakter!' });
        if (password.length < 4) return res.json({ success: false, message: 'Password min 4 karakter!' });
        if (db.users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
            return res.json({ success: false, message: 'Username sudah digunakan!' });
        }
        db.users.push({
            id: uuidv4(),
            username,
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
        res.json({ success: true, message: 'Registrasi berhasil!' });
    } catch (err) {
        res.json({ success: false, message: 'Server error!' });
    }
});

app.post('/api/login', (req, res) => {
    try {
        const { username, password } = req.body;
        const user = db.users.find(u => u.username === username);
        if (!user) return res.json({ success: false, message: 'User tidak ditemukan!' });
        if (!bcrypt.compareSync(password, user.password)) {
            return res.json({ success: false, message: 'Password salah!' });
        }
        user.online = true;
        saveDB();
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
        res.json({ success: false, message: 'Server error!' });
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
            return res.json({ success: false, message: 'Password min 4 karakter!' });
        }
        user.password = bcrypt.hashSync(newPassword, 10);
        saveDB();
        res.json({ success: true, message: 'Password berhasil diubah!' });
    } catch (err) {
        res.json({ success: false, message: 'Error!' });
    }
});

// ============================================
// ADMIN ROUTES
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
        const limits = { 'Free': 15, 'Premium': 80, 'VIP': 150, 'Reseller': 200, 'Developer': Infinity };
        user.status = status;
        user.limit = limits[status] || 15;
        user.used = 0;
        user.isReseller = (status === 'Reseller');
        user.isAdmin = (status === 'Developer');
        user.isDeveloper = (status === 'Developer');
        saveDB();
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
        res.json({ success: true, features: db.settings.features || {} });
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
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

app.post('/api/admin/control/toggle', (req, res) => {
    try {
        const { controlKey, enabled, admin } = req.body;
        const adminUser = db.users.find(u => u.username === admin);
        if (!adminUser || !adminUser.isDeveloper) {
            return res.json({ success: false, message: 'Hanya Developer!' });
        }
        if (!db.settings.adminControls) db.settings.adminControls = {};
        db.settings.adminControls[controlKey] = enabled;
        saveDB();
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

app.post('/api/admin/provider/toggle', (req, res) => {
    try {
        const { provider, enabled, admin } = req.body;
        const adminUser = db.users.find(u => u.username === admin);
        if (!adminUser || !adminUser.isDeveloper) {
            return res.json({ success: false, message: 'Hanya Developer!' });
        }
        if (!db.settings.providers) db.settings.providers = {};
        if (!db.settings.providers[provider]) db.settings.providers[provider] = {};
        db.settings.providers[provider].enabled = enabled;
        saveDB();
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

// ============================================
// STATS
// ============================================
app.get('/api/stats', (req, res) => {
    try {
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
    console.log('💉 PRANKMASTER PRO V6 - SMM API');
    console.log('========================================');
    console.log('📌 API Key: 199d2c58cab21534580f7d3cdb58a2eb');
    console.log('📌 Providers: SMM Panel (Primary) + TikFollowers (Fallback)');
    console.log('🔥 14 Platforms Supported');
    console.log('✅ STOP button fixed!');
    console.log('✅ Limit per user fixed!');
    console.log('========================================');
});