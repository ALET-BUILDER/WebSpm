// ============================================
// PRANKMASTER PRO V7 - FULL FIX
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
        defaultProvider: 'tikfollowers',
        providers: {
            smmpanel: { enabled: true, cooldown: 60, maxPerDay: 100 },
            tikfollowers: { enabled: true, cooldown: 120, maxPerDay: 50 }
        },
        features: {},
        adminControls: {}
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
        providers: ['tikfollowers', 'smmpanel'],
        defaultProvider: 'tikfollowers',
        actions: ['Followers', 'Likes', 'Views', 'Shares'],
        actionIcons: { 'Followers': 'fa-users', 'Likes': 'fa-heart', 'Views': 'fa-eye', 'Shares': 'fa-share-alt' },
        smmServices: {
            'Followers': 1,
            'Likes': 2,
            'Views': 3,
            'Shares': 4
        }
    },
    'Instagram': {
        icon: 'fab fa-instagram',
        color: '#E4405F',
        providers: ['smmpanel', 'tikfollowers'],
        defaultProvider: 'smmpanel',
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
        providers: ['smmpanel'],
        defaultProvider: 'smmpanel',
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
        providers: ['smmpanel'],
        defaultProvider: 'smmpanel',
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
        providers: ['smmpanel'],
        defaultProvider: 'smmpanel',
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
        providers: ['smmpanel'],
        defaultProvider: 'smmpanel',
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
        providers: ['smmpanel'],
        defaultProvider: 'smmpanel',
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
        providers: ['smmpanel'],
        defaultProvider: 'smmpanel',
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
        providers: ['smmpanel'],
        defaultProvider: 'smmpanel',
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
        providers: ['smmpanel'],
        defaultProvider: 'smmpanel',
        actions: ['Members'],
        actionIcons: { 'Members': 'fa-users' },
        smmServices: {
            'Members': 901
        }
    },
    'VK': {
        icon: 'fab fa-vk',
        color: '#0077FF',
        providers: ['smmpanel'],
        defaultProvider: 'smmpanel',
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
        providers: ['smmpanel'],
        defaultProvider: 'smmpanel',
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
        providers: ['smmpanel'],
        defaultProvider: 'smmpanel',
        actions: ['Plays'],
        actionIcons: { 'Plays': 'fa-play' },
        smmServices: {
            'Plays': 1201
        }
    },
    'Clubhouse': {
        icon: 'fas fa-users',
        color: '#6515DD',
        providers: ['smmpanel'],
        defaultProvider: 'smmpanel',
        actions: ['Followers'],
        actionIcons: { 'Followers': 'fa-users' },
        smmServices: {
            'Followers': 1301
        }
    }
};

// ============================================
// SMM PANEL API
// ============================================

class SMMPanelProvider {
    constructor() {
        this.sessionId = uuidv4();
        this.cooldownUntil = 0;
        this.dailyCount = 0;
        this.dailyReset = Date.now();
        this.apiKey = db.settings.smmApiKey || '199d2c58cab21534580f7d3cdb58a2eb';
        this.apiUrl = db.settings.smmApiUrl || 'https://smmstone.com/api/v2';
        this.lastError = '';
        this.enabled = db.settings.providers.smmpanel?.enabled !== false;
        this.cooldown = db.settings.providers.smmpanel?.cooldown || 60;
        this.maxPerDay = db.settings.providers.smmpanel?.maxPerDay || 100;
    }

    checkDailyLimit() {
        const now = Date.now();
        if (now - this.dailyReset > 24 * 60 * 60 * 1000) {
            this.dailyCount = 0;
            this.dailyReset = now;
        }
        return this.dailyCount < this.maxPerDay;
    }

    async useService(platform, action, target) {
        if (!this.checkDailyLimit()) {
            return { success: false, error: 'Daily limit reached!', fallback: true };
        }

        const now = Date.now();
        if (this.cooldownUntil > now) {
            const remaining = Math.ceil((this.cooldownUntil - now) / 1000);
            return {
                success: false,
                error: `Cooldown ${remaining}s`,
                cooldown: true,
                cooldownRemaining: remaining,
                fallback: true
            };
        }

        const platformConfig = platformConfigs[platform];
        if (!platformConfig) {
            return { success: false, error: 'Platform tidak ditemukan!', fallback: true };
        }

        const serviceId = platformConfig.smmServices?.[action];
        if (!serviceId) {
            return { success: false, error: 'Service ID tidak ditemukan!', fallback: true };
        }

        try {
            let formattedTarget = target;
            if (platform === 'TikTok' && target.includes('tiktok.com')) {
                const match = target.match(/@([a-zA-Z0-9_.]+)/);
                if (match) formattedTarget = match[1];
            }

            console.log(`📤 SMM Panel: ${platform} ${action} for ${formattedTarget} (Service: ${serviceId})`);

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

            if (result && result.order) {
                this.cooldownUntil = Date.now() + this.cooldown * 1000;
                this.dailyCount++;
                this.lastError = '';

                return {
                    success: true,
                    message: `✅ Order: ${result.order}`,
                    platform,
                    action,
                    target: formattedTarget,
                    provider: 'smmpanel',
                    orderId: result.order
                };
            } else {
                const errorMsg = result?.error || 'Unknown error';
                this.lastError = errorMsg;
                return {
                    success: false,
                    error: errorMsg,
                    fallback: true
                };
            }

        } catch (error) {
            console.error('❌ SMM Panel error:', error.message);
            this.lastError = error.message;
            return { success: false, error: error.message, fallback: true };
        }
    }

    getStatus() {
        const now = Date.now();
        return {
            provider: 'smmpanel',
            cooldownRemaining: Math.max(0, Math.ceil((this.cooldownUntil - now) / 1000)),
            dailyCount: this.dailyCount,
            maxPerDay: this.maxPerDay,
            dailyRemaining: this.maxPerDay - this.dailyCount,
            isReady: this.cooldownUntil <= now && this.checkDailyLimit(),
            enabled: this.enabled,
            lastError: this.lastError,
            cooldown: this.cooldown
        };
    }
}

// ============================================
// TIKFOLLOWERS
// ============================================

class TikFollowersProvider {
    constructor() {
        this.sessionId = uuidv4();
        this.cooldownUntil = 0;
        this.dailyCount = 0;
        this.dailyReset = Date.now();
        this.baseUrl = 'https://tikfollowers.com';
        this.cookies = '';
        this.lastError = '';
        this.enabled = db.settings.providers.tikfollowers?.enabled !== false;
        this.cooldown = db.settings.providers.tikfollowers?.cooldown || 120;
        this.maxPerDay = db.settings.providers.tikfollowers?.maxPerDay || 50;
    }

    checkDailyLimit() {
        const now = Date.now();
        if (now - this.dailyReset > 24 * 60 * 60 * 1000) {
            this.dailyCount = 0;
            this.dailyReset = now;
        }
        return this.dailyCount < this.maxPerDay;
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
            const remaining = Math.ceil((this.cooldownUntil - now) / 1000);
            return {
                success: false,
                error: `Cooldown ${remaining}s`,
                cooldown: true,
                cooldownRemaining: remaining,
                fallback: true
            };
        }

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

            const response = await fetch(url, {
                headers: {
                    'User-Agent': getRandomUserAgent(),
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
                }
            });

            const html = await response.text();
            const $ = cheerio.load(html);

            const cookies = response.headers.raw()['set-cookie'] || [];
            this.cookies = cookies.map(c => c.split(';')[0]).join('; ');

            // Try to find form and submit
            let form = $('form');
            let input = $('input[type="text"]');

            if (form.length === 0 && input.length > 0) {
                form = input.closest('form');
            }

            if (form.length === 0 || input.length === 0) {
                console.log('⚠️ Form not found, using direct POST...');

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

                const successMsg = result$('.success, .alert-success, .result-success').text().trim();

                if (successMsg) {
                    this.cooldownUntil = Date.now() + this.cooldown * 1000;
                    this.dailyCount++;
                    this.lastError = '';
                    return {
                        success: true,
                        message: successMsg || '✅ Berhasil!',
                        platform,
                        action,
                        target: username,
                        provider: 'tikfollowers'
                    };
                }

                this.lastError = 'Gagal!';
                return { success: false, error: 'Gagal!', fallback: true };
            }

            // Normal form submission
            const formAction = form.attr('action') || '';
            const submitUrl = formAction ? new URL(formAction, this.baseUrl).toString() : url;
            const inputName = input.attr('name') || 'username';

            const formData = new URLSearchParams();
            formData.append(inputName, username);

            form.find('input[type="hidden"]').each((i, el) => {
                const name = $(el).attr('name');
                const value = $(el).attr('value');
                if (name && value) formData.append(name, value);
            });

            const submitResponse = await fetch(submitUrl, {
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

            const resultHtml = await submitResponse.text();
            const result$ = cheerio.load(resultHtml);

            const successSelectors = ['.success', '.alert-success', '.result-success', '.message-success'];
            let successMsg = '';
            for (const sel of successSelectors) {
                const text = result$(sel).text().trim();
                if (text && text.length > 3) {
                    successMsg = text;
                    break;
                }
            }

            const bodyText = result$('body').text().toLowerCase();
            if (!successMsg && (bodyText.includes('wait') || bodyText.includes('tunggu'))) {
                const waitMatch = bodyText.match(/(\d+)\s*(minute|min|menit)/);
                if (waitMatch) {
                    const minutes = parseInt(waitMatch[1]) || 15;
                    return {
                        success: false,
                        error: `Tunggu ${minutes} menit!`,
                        cooldown: true,
                        cooldownRemaining: minutes * 60,
                        fallback: true
                    };
                }
                return {
                    success: false,
                    error: 'Tunggu beberapa menit!',
                    cooldown: true,
                    cooldownRemaining: 900,
                    fallback: true
                };
            }

            this.cooldownUntil = Date.now() + this.cooldown * 1000;
            this.dailyCount++;
            this.lastError = '';

            if (successMsg) {
                return {
                    success: true,
                    message: successMsg || '✅ Berhasil!',
                    platform,
                    action,
                    target: username,
                    provider: 'tikfollowers'
                };
            }

            this.lastError = 'Gagal!';
            return { success: false, error: 'Gagal!', fallback: true };

        } catch (error) {
            console.error('❌ TikFollowers error:', error.message);
            this.lastError = error.message;
            return { success: false, error: error.message, fallback: true };
        }
    }

    getStatus() {
        const now = Date.now();
        return {
            provider: 'tikfollowers',
            cooldownRemaining: Math.max(0, Math.ceil((this.cooldownUntil - now) / 1000)),
            dailyCount: this.dailyCount,
            maxPerDay: this.maxPerDay,
            dailyRemaining: this.maxPerDay - this.dailyCount,
            isReady: this.cooldownUntil <= now && this.checkDailyLimit(),
            enabled: this.enabled,
            lastError: this.lastError,
            cooldown: this.cooldown
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
        this.primaryProvider = db.settings.defaultProvider || 'tikfollowers';
        this.fallbackEnabled = true;
    }

    getProvider(provider) {
        if (provider === 'smmpanel') return this.smmpanel;
        if (provider === 'tikfollowers') return this.tikfollowers;
        return null;
    }

    getStatus() {
        return {
            smmpanel: this.smmpanel.getStatus(),
            tikfollowers: this.tikfollowers.getStatus(),
            primaryProvider: this.primaryProvider,
            fallbackEnabled: this.fallbackEnabled
        };
    }

    getAvailableProvider(platform) {
        const config = platformConfigs[platform];
        if (!config) return this.primaryProvider;

        const providers = config.providers || ['tikfollowers'];
        
        // Try primary first
        const primaryStatus = this.getProvider(this.primaryProvider)?.getStatus();
        if (primaryStatus?.enabled && primaryStatus?.isReady && providers.includes(this.primaryProvider)) {
            return this.primaryProvider;
        }

        // Try fallback if enabled
        if (this.fallbackEnabled) {
            for (const provider of providers) {
                if (provider === this.primaryProvider) continue;
                const status = this.getProvider(provider)?.getStatus();
                if (status?.enabled && status?.isReady) {
                    return provider;
                }
            }
        }

        // Return primary even if not ready (will show cooldown)
        return this.primaryProvider;
    }
}

const sessionManager = new SessionManager();

// ============================================
// GLOBAL SPAM SESSIONS
// ============================================
global.spamSessions = {};

// ============================================
// SUNTIK FUNCTION
// ============================================

async function spamSuntik(target, platform, action, count, username, sessionId) {
    const results = { success: 0, failed: 0, total: 0, attempts: 0 };
    let isStopped = false;
    let isCompleted = false;
    let currentAttempt = 0;
    let consecutiveFails = 0;

    global.spamSessions[sessionId] = {
        stop: () => {
            isStopped = true;
            console.log('🛑 Stop signal for session:', sessionId);
        },
        isStopped: () => isStopped,
        isCompleted: () => isCompleted
    };

    const config = platformConfigs[platform];
    if (!config) {
        io.emit('spamProgress', {
            sessionId, type: 'suntik',
            target, platform, action,
            current: 0, total: 0,
            success: 0, failed: 0,
            message: '❌ Platform tidak ditemukan!',
            status: 'error',
            completed: true
        });
        delete global.spamSessions[sessionId];
        return results;
    }

    const user = db.users.find(u => u.username === username);
    const limits = { 'Free': 15, 'Premium': 80, 'VIP': 150, 'Reseller': 200, 'Developer': Infinity };
    const userLimit = limits[user?.status] || 15;
    const maxCount = Math.min(count, userLimit);

    let currentProvider = sessionManager.getAvailableProvider(platform);
    let providerObj = sessionManager.getProvider(currentProvider);

    console.log(`📌 Using provider: ${currentProvider} for ${platform}`);

    for (let i = 0; i < maxCount; i++) {
        currentAttempt = i + 1;

        if (isStopped || (global.spamSessions[sessionId] && global.spamSessions[sessionId].isStopped())) {
            io.emit('spamProgress', {
                sessionId, type: 'suntik',
                target, platform, action,
                current: i, total: maxCount,
                success: results.success, failed: results.failed,
                message: '⛔ Stopped by user!',
                stopped: true,
                status: 'stopped'
            });
            isCompleted = true;
            break;
        }

        if (user && user.limit !== Infinity && user.limit !== '∞') {
            const remaining = user.limit - (user.used || 0);
            if (remaining <= 0) {
                io.emit('spamProgress', {
                    sessionId, type: 'suntik',
                    target, platform, action,
                    current: i, total: maxCount,
                    success: results.success, failed: results.failed,
                    message: '⛔ Limit habis!',
                    status: 'error',
                    completed: true
                });
                isCompleted = true;
                break;
            }
        }

        // Check provider status
        const providerStatus = providerObj?.getStatus();
        if (!providerStatus?.isReady || !providerStatus?.enabled) {
            const newProvider = sessionManager.getAvailableProvider(platform);
            if (newProvider !== currentProvider) {
                currentProvider = newProvider;
                providerObj = sessionManager.getProvider(currentProvider);
                io.emit('spamProgress', {
                    sessionId, type: 'suntik',
                    target, platform, action,
                    current: i, total: maxCount,
                    success: results.success, failed: results.failed,
                    message: `🔄 Switch to ${currentProvider}`,
                    status: 'info'
                });
            } else if (providerStatus?.cooldownRemaining > 0) {
                const remaining = providerStatus.cooldownRemaining;
                io.emit('spamProgress', {
                    sessionId, type: 'suntik',
                    target, platform, action,
                    current: i, total: maxCount,
                    success: results.success, failed: results.failed,
                    message: `⏳ ${currentProvider} cooldown ${remaining}s`,
                    status: 'cooldown',
                    cooldown: true,
                    cooldownRemaining: remaining
                });
                await sleep(3000);
                i--;
                continue;
            } else {
                await sleep(5000);
                i--;
                continue;
            }
        }

        // Execute with current provider
        try {
            const result = await providerObj.useService(platform, action, target);

            if (result && result.success) {
                results.success++;
                consecutiveFails = 0;
                if (user) {
                    user.used = (user.used || 0) + 1;
                    saveDB();
                }
                io.emit('spamProgress', {
                    sessionId, type: 'suntik',
                    target, platform, action,
                    current: currentAttempt, total: maxCount,
                    success: results.success, failed: results.failed,
                    message: `✅ ${currentAttempt}/${maxCount} Success! ${platform} ${action} (${currentProvider})`,
                    status: 'success',
                    provider: currentProvider
                });
            } else if (result && result.cooldown) {
                const remaining = result.cooldownRemaining || 60;
                io.emit('spamProgress', {
                    sessionId, type: 'suntik',
                    target, platform, action,
                    current: currentAttempt, total: maxCount,
                    success: results.success, failed: results.failed,
                    message: `⏳ ${result.error}`,
                    status: 'cooldown',
                    cooldown: true,
                    cooldownRemaining: remaining
                });
                await sleep(5000);
                i--;
                continue;
            } else {
                results.failed++;
                consecutiveFails++;
                const errorMsg = result?.error || 'Unknown error';
                io.emit('spamProgress', {
                    sessionId, type: 'suntik',
                    target, platform, action,
                    current: currentAttempt, total: maxCount,
                    success: results.success, failed: results.failed,
                    message: `❌ ${currentAttempt}/${maxCount} Failed: ${errorMsg}`,
                    status: 'error',
                    error: errorMsg
                });

                if (consecutiveFails >= 3) {
                    const fallbackProvider = config.providers?.find(p => p !== currentProvider);
                    if (fallbackProvider) {
                        const fallbackObj = sessionManager.getProvider(fallbackProvider);
                        const fallbackStatus = fallbackObj?.getStatus();
                        if (fallbackStatus?.enabled) {
                            currentProvider = fallbackProvider;
                            providerObj = fallbackObj;
                            consecutiveFails = 0;
                            io.emit('spamProgress', {
                                sessionId, type: 'suntik',
                                target, platform, action,
                                current: currentAttempt, total: maxCount,
                                success: results.success, failed: results.failed,
                                message: `🔄 Switching to ${fallbackProvider}`,
                                status: 'info'
                            });
                            i--;
                            continue;
                        }
                    }
                }
            }
        } catch (error) {
            results.failed++;
            io.emit('spamProgress', {
                sessionId, type: 'suntik',
                target, platform, action,
                current: currentAttempt, total: maxCount,
                success: results.success, failed: results.failed,
                message: `❌ ${currentAttempt}/${maxCount} Error: ${error.message}`,
                status: 'error',
                error: error.message
            });
        }

        results.total = results.success + results.failed;
        results.attempts = currentAttempt;

        if (isStopped || (global.spamSessions[sessionId] && global.spamSessions[sessionId].isStopped())) {
            break;
        }

        if (i < maxCount - 1 && !isStopped) {
            await sleep(2000 + Math.random() * 3000);
        }
    }

    if (!isStopped && !isCompleted) {
        isCompleted = true;
        io.emit('spamProgress', {
            sessionId, type: 'suntik',
            target, platform, action,
            current: results.total, total: maxCount,
            success: results.success, failed: results.failed,
            message: `📊 Selesai! Berhasil: ${results.success}, Gagal: ${results.failed}`,
            status: 'completed',
            completed: true,
            totalSuccess: results.success,
            totalFailed: results.failed,
            totalAttempts: results.attempts
        });
    }

    if (results.success > 0) {
        db.stats.totalSuntikSent = (db.stats.totalSuntikSent || 0) + results.success;
        saveDB();
        io.emit('userUpdated', { username: user?.username });
    }

    if (global.spamSessions && global.spamSessions[sessionId]) {
        delete global.spamSessions[sessionId];
    }

    return results;
}

// ============================================
// API ROUTES
// ============================================

// ===== AUTH ROUTES =====
app.post('/api/login', (req, res) => {
    try {
        const { username, password } = req.body;
        const user = db.users.find(u => u.username === username);
        if (!user) return res.json({ success: false, message: 'User tidak ditemukan!' });
        if (user.banned) return res.json({ success: false, message: 'Akun di-ban!' });
        if (!bcrypt.compareSync(password, user.password)) {
            return res.json({ success: false, message: 'Password salah!' });
        }
        user.online = true;
        saveDB();
        io.emit('usersOnline', db.users.filter(u => u.online).map(u => u.username));
        res.json({ success: true, user: { ...user, password: undefined } });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

app.post('/api/register', (req, res) => {
    try {
        const { username, password } = req.body;
        if (db.users.find(u => u.username === username)) {
            return res.json({ success: false, message: 'Username sudah dipakai!' });
        }
        const user = {
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
        };
        db.users.push(user);
        saveDB();
        res.json({ success: true, message: 'Registrasi berhasil!' });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

app.post('/api/change-password', (req, res) => {
    try {
        const { username, newPassword } = req.body;
        const user = db.users.find(u => u.username === username);
        if (!user) return res.json({ success: false, message: 'User tidak ditemukan!' });
        user.password = bcrypt.hashSync(newPassword, 10);
        saveDB();
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

app.get('/api/user/:username', (req, res) => {
    try {
        const user = db.users.find(u => u.username === req.params.username);
        if (!user) return res.json({ success: false, message: 'User tidak ditemukan!' });
        res.json({ success: true, user: { ...user, password: undefined } });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

// ===== PLATFORMS =====
app.get('/api/suntik/platforms', (req, res) => {
    try {
        const platforms = Object.keys(platformConfigs).map(key => {
            const config = platformConfigs[key];
            const isDisabled = db.settings.adminControls?.[`disable${key}`] || false;
            return {
                name: key,
                icon: config.icon,
                color: config.color,
                providers: config.providers || ['tikfollowers'],
                defaultProvider: config.defaultProvider || config.providers?.[0] || 'tikfollowers',
                disabled: isDisabled || db.settings.adminControls?.disableAllSuntik || false,
                actions: config.actions.map(action => ({
                    name: action,
                    icon: config.actionIcons?.[action] || 'fa-circle',
                    enabled: db.settings.features?.[`${key.toLowerCase()}_${action.toLowerCase().replace(/ /g, '_')}`] !== false
                }))
            };
        });
        res.json({ success: true, platforms });
    } catch (err) {
        res.json({ success: false, platforms: [] });
    }
});

// ===== PROVIDER STATUS =====
app.get('/api/providers/status', (req, res) => {
    try {
        const status = sessionManager.getStatus();
        res.json({
            success: true,
            providers: {
                smmpanel: status.smmpanel,
                tikfollowers: status.tikfollowers
            },
            primaryProvider: status.primaryProvider,
            fallbackEnabled: status.fallbackEnabled
        });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// ===== SPAM =====
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

        // Run in background
        spamSuntik(target, platform, action, count, username, sessionId);

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
            return res.json({ success: true, message: 'Suntik dihentikan!' });
        }
        return res.json({ success: false, message: 'Session tidak ditemukan!' });
    } catch (err) {
        console.error('❌ Stop error:', err);
        res.json({ success: false, message: err.message });
    }
});

// ===== PAYMENTS =====
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

app.post('/api/payments/submit', upload.single('proof'), (req, res) => {
    try {
        const { username, package: pkg, name, paymentMethod } = req.body;
        if (!req.file) return res.json({ success: false, message: 'Upload bukti pembayaran!' });

        const packages = { 'Premium': 10000, 'VIP': 20000, 'Reseller': 30000 };
        const amount = packages[pkg] || 0;

        db.payments.push({
            id: uuidv4(),
            username,
            package: pkg,
            amount,
            name,
            paymentMethod: paymentMethod || 'dana',
            proof: req.file.filename,
            status: 'pending',
            createdAt: new Date().toISOString()
        });
        saveDB();
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

// ===== ADMIN =====
app.get('/api/admin/users', (req, res) => {
    try {
        res.json({ success: true, users: db.users.map(u => ({ ...u, password: undefined })) });
    } catch (err) {
        res.json({ success: false, message: err.message });
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
        if (user.isDeveloper && admin !== 'Lynzka') {
            return res.json({ success: false, message: 'Tidak bisa ubah Developer!' });
        }

        const limits = { 'Free': 15, 'Premium': 80, 'VIP': 150, 'Reseller': 200, 'Developer': Infinity };
        user.status = status;
        user.limit = limits[status] || 15;
        saveDB();
        io.emit('userUpdated', { username });
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
        const user = db.users.find(u => u.username === username);
        if (!user) return res.json({ success: false, message: 'User tidak ditemukan!' });
        if (user.isDeveloper && admin !== 'Lynzka') {
            return res.json({ success: false, message: 'Tidak bisa ban Developer!' });
        }
        user.banned = true;
        saveDB();
        io.emit('userUpdated', { username });
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

app.get('/api/admin/features', (req, res) => {
    try {
        res.json({ success: true, features: db.settings.features || {} });
    } catch (err) {
        res.json({ success: false, message: err.message });
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

app.post('/api/admin/provider/toggle', (req, res) => {
    try {
        const { provider, enabled, admin } = req.body;
        const adminUser = db.users.find(u => u.username === admin);
        if (!adminUser || !adminUser.isDeveloper) {
            return res.json({ success: false, message: 'Hanya Developer!' });
        }
        if (provider === 'tikfollowers') {
            db.settings.providers.tikfollowers.enabled = enabled;
        } else if (provider === 'smmpanel') {
            db.settings.providers.smmpanel.enabled = enabled;
        }
        saveDB();
        io.emit('settingsUpdated', { settings: db.settings });
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

app.post('/api/admin/primary-provider', (req, res) => {
    try {
        const { provider, admin } = req.body;
        const adminUser = db.users.find(u => u.username === admin);
        if (!adminUser || !adminUser.isDeveloper) {
            return res.json({ success: false, message: 'Hanya Developer!' });
        }
        if (provider !== 'tikfollowers' && provider !== 'smmpanel') {
            return res.json({ success: false, message: 'Provider tidak valid!' });
        }
        db.settings.defaultProvider = provider;
        sessionManager.primaryProvider = provider;
        saveDB();
        io.emit('settingsUpdated', { settings: db.settings });
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

app.post('/api/admin/fallback-toggle', (req, res) => {
    try {
        const { enabled, admin } = req.body;
        const adminUser = db.users.find(u => u.username === admin);
        if (!adminUser || !adminUser.isDeveloper) {
            return res.json({ success: false, message: 'Hanya Developer!' });
        }
        sessionManager.fallbackEnabled = enabled;
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
        db.settings.adminControls[controlKey] = !enabled;
        saveDB();
        io.emit('settingsUpdated', { settings: db.settings });
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

app.get('/api/admin/payments', (req, res) => {
    try {
        res.json({ success: true, payments: db.payments });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

app.post('/api/admin/verify-payment', (req, res) => {
    try {
        const { paymentId, admin } = req.body;
        const adminUser = db.users.find(u => u.username === admin);
        if (!adminUser || !adminUser.isDeveloper) {
            return res.json({ success: false, message: 'Hanya Developer!' });
        }
        const payment = db.payments.find(p => p.id === paymentId);
        if (!payment) return res.json({ success: false, message: 'Payment tidak ditemukan!' });
        if (payment.status !== 'pending') return res.json({ success: false, message: 'Sudah diproses!' });

        payment.status = 'verified';
        const user = db.users.find(u => u.username === payment.username);
        if (user) {
            const limits = { 'Premium': 80, 'VIP': 150, 'Reseller': 200 };
            const newLimit = limits[payment.package] || 15;
            user.limit = newLimit;
            user.status = payment.package;
            saveDB();
            io.emit('userUpdated', { username: user.username });
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
        if (!adminUser || !adminUser.isDeveloper) {
            return res.json({ success: false, message: 'Hanya Developer!' });
        }
        const payment = db.payments.find(p => p.id === paymentId);
        if (!payment) return res.json({ success: false, message: 'Payment tidak ditemukan!' });
        if (payment.status !== 'pending') return res.json({ success: false, message: 'Sudah diproses!' });

        payment.status = 'rejected';
        payment.reason = reason || 'Ditolak admin';
        saveDB();
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

// ============================================
// SOCKET.IO EVENTS
// ============================================
io.on('connection', (socket) => {
    console.log('🔗 Client connected:', socket.id);

    socket.on('userOnline', (username) => {
        const user = db.users.find(u => u.username === username);
        if (user) {
            user.online = true;
            saveDB();
            io.emit('usersOnline', db.users.filter(u => u.online).map(u => u.username));
        }
    });

    socket.on('userOffline', (username) => {
        const user = db.users.find(u => u.username === username);
        if (user) {
            user.online = false;
            saveDB();
            io.emit('usersOnline', db.users.filter(u => u.online).map(u => u.username));
        }
    });

    socket.on('sendMessage', (data) => {
        if (!data.username || !data.message) return;
        db.messages.push(data);
        if (db.messages.length > 100) db.messages.shift();
        io.emit('newMessage', data);
    });

    socket.on('disconnect', () => {
        console.log('🔌 Client disconnected:', socket.id);
    });
});

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log('========================================');
    console.log('👑 Admin: Lynzka / Asiafone11');
    console.log('💉 PRANKMASTER PRO V7 - FULL FIX');
    console.log('========================================');
    console.log('📌 Providers:');
    console.log('  🔵 TikTokFollowers (No Login)');
    console.log('  🟢 SMM Panel API');
    console.log('🔥 14 Platforms Supported');
    console.log('✅ STOP button fixed!');
    console.log('✅ Cooldown loop fixed!');
    console.log('✅ Provider switching fixed!');
    console.log('========================================');
});