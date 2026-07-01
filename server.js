// ============================================
// PRANKMASTER PRO - LIGHTWEIGHT VERSION
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
        maintenanceMessage: 'Server sedang dalam perbaikan.',
        providers: {
            tikfollowers: { enabled: true, cooldown: 900, maxPerDay: 50 },
            smmstone: { enabled: true, cooldown: 1800, maxPerDay: 100 }
        },
        features: {
            tiktok_followers: true, tiktok_likes: true, tiktok_views: true, tiktok_shares: true,
            instagram_followers: true, instagram_likes: true, instagram_views: true,
            youtube_subscribers: true, youtube_views: true, youtube_likes: true,
            facebook_followers: true, facebook_likes: true, facebook_shares: true,
            twitter_followers: true, twitter_likes: true, twitter_retweets: true,
            telegram_members: true, telegram_views: true, telegram_reactions: true,
            threads_followers: true, threads_likes: true,
            twitch_followers: true, twitch_views: true,
            spotify_followers: true, spotify_plays: true,
            discord_members: true,
            vk_followers: true, vk_likes: true, vk_views: true,
            kwai_followers: true, kwai_likes: true, kwai_views: true,
            soundcloud_plays: true, clubhouse_followers: true
        },
        adminControls: {
            disableAllSuntik: false,
            disableTikTok: false, disableInstagram: false, disableYouTube: false,
            disableFacebook: false, disableTwitter: false, disableTelegram: false
        }
    },
    stats: { totalSuntikSent: 0 }
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
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
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
        actionIcons: { 'Followers': 'fa-users', 'Likes': 'fa-heart', 'Views': 'fa-eye', 'Shares': 'fa-share-alt' }
    },
    'Instagram': {
        icon: 'fab fa-instagram',
        color: '#E4405F',
        provider: 'smmstone',
        actions: ['Followers', 'Likes', 'Views'],
        actionIcons: { 'Followers': 'fa-users', 'Likes': 'fa-heart', 'Views': 'fa-eye' }
    },
    'YouTube': {
        icon: 'fab fa-youtube',
        color: '#FF0000',
        provider: 'smmstone',
        actions: ['Subscribers', 'Views', 'Likes'],
        actionIcons: { 'Subscribers': 'fa-user-plus', 'Views': 'fa-eye', 'Likes': 'fa-thumbs-up' }
    },
    'Facebook': {
        icon: 'fab fa-facebook',
        color: '#1877F2',
        provider: 'smmstone',
        actions: ['Followers', 'Likes', 'Shares'],
        actionIcons: { 'Followers': 'fa-users', 'Likes': 'fa-thumbs-up', 'Shares': 'fa-share-alt' }
    },
    'Twitter': {
        icon: 'fab fa-twitter',
        color: '#1DA1F2',
        provider: 'smmstone',
        actions: ['Followers', 'Likes', 'Retweets'],
        actionIcons: { 'Followers': 'fa-users', 'Likes': 'fa-heart', 'Retweets': 'fa-retweet' }
    },
    'Telegram': {
        icon: 'fab fa-telegram',
        color: '#0088cc',
        provider: 'smmstone',
        actions: ['Members', 'Views', 'Reactions'],
        actionIcons: { 'Members': 'fa-users', 'Views': 'fa-eye', 'Reactions': 'fa-smile' }
    },
    'Threads': {
        icon: 'fab fa-threads',
        color: '#000000',
        provider: 'smmstone',
        actions: ['Followers', 'Likes'],
        actionIcons: { 'Followers': 'fa-users', 'Likes': 'fa-heart' }
    },
    'Twitch': {
        icon: 'fab fa-twitch',
        color: '#9146FF',
        provider: 'smmstone',
        actions: ['Followers', 'Views'],
        actionIcons: { 'Followers': 'fa-users', 'Views': 'fa-eye' }
    },
    'Spotify': {
        icon: 'fab fa-spotify',
        color: '#1DB954',
        provider: 'smmstone',
        actions: ['Followers', 'Plays'],
        actionIcons: { 'Followers': 'fa-users', 'Plays': 'fa-play' }
    },
    'Discord': {
        icon: 'fab fa-discord',
        color: '#5865F2',
        provider: 'smmstone',
        actions: ['Members'],
        actionIcons: { 'Members': 'fa-users' }
    },
    'VK': {
        icon: 'fab fa-vk',
        color: '#0077FF',
        provider: 'smmstone',
        actions: ['Followers', 'Likes', 'Views'],
        actionIcons: { 'Followers': 'fa-users', 'Likes': 'fa-heart', 'Views': 'fa-eye' }
    },
    'Kwai': {
        icon: 'fas fa-video',
        color: '#FF6B00',
        provider: 'smmstone',
        actions: ['Followers', 'Likes', 'Views'],
        actionIcons: { 'Followers': 'fa-users', 'Likes': 'fa-heart', 'Views': 'fa-eye' }
    },
    'SoundCloud': {
        icon: 'fab fa-soundcloud',
        color: '#FF3300',
        provider: 'smmstone',
        actions: ['Plays'],
        actionIcons: { 'Plays': 'fa-play' }
    },
    'Clubhouse': {
        icon: 'fas fa-users',
        color: '#6515DD',
        provider: 'smmstone',
        actions: ['Followers'],
        actionIcons: { 'Followers': 'fa-users' }
    }
};

// ============================================
// PROVIDER: TIKFOLLOWERS (HTTP Request)
// ============================================

class TikFollowersProvider {
    constructor() {
        this.sessionId = uuidv4();
        this.cooldownUntil = 0;
        this.dailyCount = 0;
        this.dailyReset = Date.now();
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
                error: `Cooldown ${Math.ceil((this.cooldownUntil - now) / 60000)} menit!`,
                cooldown: true,
                fallback: true
            };
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
            const baseUrl = 'https://tikfollowers.com';
            const url = `${baseUrl}${path}`;

            console.log(`📤 TikFollowers: ${action} for ${target}`);

            // GET page
            const response = await fetch(url, {
                headers: {
                    'User-Agent': getRandomUserAgent(),
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
                }
            });

            const html = await response.text();
            const $ = cheerio.load(html);

            // Find form and input
            const form = $('form');
            const input = $('input[type="text"]');

            if (form.length === 0 || input.length === 0) {
                return { success: false, error: 'Form tidak ditemukan!', fallback: true };
            }

            // Extract form action
            const formAction = form.attr('action') || '';
            const submitUrl = formAction ? new URL(formAction, baseUrl).toString() : url;

            // Get input name
            const inputName = input.attr('name') || 'username';

            // Submit form
            const formData = new URLSearchParams();
            formData.append(inputName, target);

            const submitResponse = await fetch(submitUrl, {
                method: 'POST',
                headers: {
                    'User-Agent': getRandomUserAgent(),
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
                },
                body: formData
            });

            const resultHtml = await submitResponse.text();
            const result$ = cheerio.load(resultHtml);

            const successMsg = result$('.success, .alert-success, .result-success').text().trim();
            const errorMsg = result$('.error, .alert-danger, .result-error').text().trim();

            const cooldownSeconds = db.settings.providers.tikfollowers?.cooldown || 900;
            this.cooldownUntil = Date.now() + cooldownSeconds * 1000;
            this.dailyCount++;

            if (successMsg || !errorMsg) {
                return {
                    success: true,
                    message: successMsg || '✅ Berhasil!',
                    platform,
                    action,
                    target,
                    provider: 'tikfollowers',
                    dailyRemaining: (db.settings.providers.tikfollowers?.maxPerDay || 50) - this.dailyCount
                };
            }

            return { success: false, error: errorMsg || 'Gagal!', fallback: true };

        } catch (error) {
            console.error('❌ TikFollowers error:', error.message);
            return { success: false, error: error.message, fallback: true };
        }
    }

    getStatus() {
        const now = Date.now();
        return {
            provider: 'tikfollowers',
            cooldownRemaining: Math.max(0, Math.ceil((this.cooldownUntil - now) / 1000)),
            dailyRemaining: (db.settings.providers.tikfollowers?.maxPerDay || 50) - this.dailyCount,
            isReady: this.cooldownUntil <= now && this.checkDailyLimit(),
            enabled: db.settings.providers.tikfollowers?.enabled !== false
        };
    }
}

// ============================================
// PROVIDER: SMMSTONE (HTTP Request)
// ============================================

class SMMStoneProvider {
    constructor() {
        this.sessionId = uuidv4();
        this.cooldownUntil = 0;
        this.dailyCount = 0;
        this.dailyReset = Date.now();
    }

    checkDailyLimit() {
        const now = Date.now();
        if (now - this.dailyReset > 24 * 60 * 60 * 1000) {
            this.dailyCount = 0;
            this.dailyReset = now;
        }
        return this.dailyCount < (db.settings.providers.smmstone?.maxPerDay || 100);
    }

    async useService(platform, action, target) {
        if (!this.checkDailyLimit()) {
            return { success: false, error: 'Daily limit reached!' };
        }

        const now = Date.now();
        if (this.cooldownUntil > now) {
            return {
                success: false,
                error: `Cooldown ${Math.ceil((this.cooldownUntil - now) / 60000)} menit!`,
                cooldown: true
            };
        }

        const serviceMap = {
            'Instagram': {
                'Followers': '/free-instagram-follower',
                'Likes': '/free-instagram-likes',
                'Views': '/free-instagram-view'
            },
            'Telegram': {
                'Members': '/free-telegram-members',
                'Views': '/free-telegram-view',
                'Reactions': '/free-telegram-reaction'
            },
            'Twitter': {
                'Followers': '/free-twitter-follower',
                'Likes': '/free-twitter-like',
                'Retweets': '/free-twitter-tweet-view'
            },
            'YouTube': {
                'Subscribers': '/free-youtube-subscribers',
                'Views': '/free-youtube-view',
                'Likes': '/free-youtube-like'
            },
            'Facebook': {
                'Followers': '/free-facebook-follower',
                'Likes': '/free-facebook-post-like',
                'Shares': '/free-facebook-profile-follower'
            },
            'Threads': {
                'Followers': '/free-threads-follower',
                'Likes': '/free-threads-post-like'
            },
            'Twitch': {
                'Followers': '/free-twitch-follower',
                'Views': '/free-twitch-video-view'
            },
            'Spotify': {
                'Followers': '/free-spotify-follower',
                'Plays': '/free-spotify-play'
            },
            'Discord': {
                'Members': '/free-discoid-server-member'
            },
            'VK': {
                'Followers': '/free-vk-follower',
                'Likes': '/free-vk-like',
                'Views': '/free-vk-video-view'
            },
            'Kwai': {
                'Followers': '/free-kwai-follower',
                'Likes': '/free-kwai-like',
                'Views': '/free-kwai-view'
            },
            'SoundCloud': {
                'Plays': '/free-soundcloud-play'
            },
            'Clubhouse': {
                'Followers': '/free-clubhous-follower'
            },
            'TikTok': {
                'Followers': '/free-tiktok-follower',
                'Views': '/free-tiktok-view',
                'Likes': '/free-tiktok-like'
            }
        };

        const path = serviceMap[platform]?.[action];
        if (!path) {
            return { success: false, error: 'Service tidak ditemukan di SMMStone!' };
        }

        try {
            const baseUrl = 'https://smmstone.com/free';
            const url = `${baseUrl}${path}`;

            console.log(`📤 SMMStone: ${platform} ${action} for ${target}`);

            // GET page
            const response = await fetch(url, {
                headers: {
                    'User-Agent': getRandomUserAgent(),
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
                }
            });

            const html = await response.text();
            const $ = cheerio.load(html);

            // Find form and input
            const form = $('form');
            const input = $('input[type="text"]');

            if (form.length === 0 || input.length === 0) {
                return { success: false, error: 'Form tidak ditemukan di SMMStone!' };
            }

            // Extract form action
            const formAction = form.attr('action') || '';
            const submitUrl = formAction ? new URL(formAction, 'https://smmstone.com').toString() : url;

            // Get input name
            const inputName = input.attr('name') || 'username';

            // Submit form
            const formData = new URLSearchParams();
            formData.append(inputName, target);

            const submitResponse = await fetch(submitUrl, {
                method: 'POST',
                headers: {
                    'User-Agent': getRandomUserAgent(),
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
                },
                body: formData
            });

            const resultHtml = await submitResponse.text();
            const result$ = cheerio.load(resultHtml);

            const successMsg = result$('.success, .alert-success, .result-success').text().trim();
            const errorMsg = result$('.error, .alert-danger, .result-error').text().trim();

            const cooldownSeconds = db.settings.providers.smmstone?.cooldown || 1800;
            this.cooldownUntil = Date.now() + cooldownSeconds * 1000;
            this.dailyCount++;

            if (successMsg || !errorMsg) {
                return {
                    success: true,
                    message: successMsg || '✅ Berhasil!',
                    platform,
                    action,
                    target,
                    provider: 'smmstone',
                    dailyRemaining: (db.settings.providers.smmstone?.maxPerDay || 100) - this.dailyCount
                };
            }

            return { success: false, error: errorMsg || 'Gagal!' };

        } catch (error) {
            console.error('❌ SMMStone error:', error.message);
            return { success: false, error: error.message };
        }
    }

    getStatus() {
        const now = Date.now();
        return {
            provider: 'smmstone',
            cooldownRemaining: Math.max(0, Math.ceil((this.cooldownUntil - now) / 1000)),
            dailyRemaining: (db.settings.providers.smmstone?.maxPerDay || 100) - this.dailyCount,
            isReady: this.cooldownUntil <= now && this.checkDailyLimit(),
            enabled: db.settings.providers.smmstone?.enabled !== false
        };
    }
}

// ============================================
// SESSION MANAGER
// ============================================

class SessionManager {
    constructor() {
        this.tikfollowers = new TikFollowersProvider();
        this.smmstone = new SMMStoneProvider();
    }

    getProvider(provider) {
        if (provider === 'tikfollowers') return this.tikfollowers;
        if (provider === 'smmstone') return this.smmstone;
        return null;
    }

    getStatus() {
        return {
            tikfollowers: this.tikfollowers.getStatus(),
            smmstone: this.smmstone.getStatus()
        };
    }
}

const sessionManager = new SessionManager();

// ============================================
// SUNTIK FUNCTION
// ============================================

async function spamSuntik(target, platform, action, count, username, sessionId) {
    const results = { success: 0, failed: 0, total: 0, attempts: 0 };
    let isStopped = false;

    if (!global.spamSessions) global.spamSessions = {};
    global.spamSessions[sessionId] = { stop: () => { isStopped = true; } };

    const platformConfig = platformConfigs[platform];
    const primaryProvider = platformConfig?.provider || 'tikfollowers';
    const fallbackProvider = primaryProvider === 'tikfollowers' ? 'smmstone' : 'tikfollowers';

    const primaryEnabled = db.settings.providers[primaryProvider]?.enabled !== false;
    const fallbackEnabled = db.settings.providers[fallbackProvider]?.enabled !== false;

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

        let providerUsed = null;
        let result = null;

        // Try primary provider
        if (primaryEnabled) {
            const provider = sessionManager.getProvider(primaryProvider);
            result = await provider.useService(platform, action, target);
            if (result.success) {
                providerUsed = primaryProvider;
            }
        }

        // If primary fails, try fallback
        if (!result?.success && fallbackEnabled) {
            const provider = sessionManager.getProvider(fallbackProvider);
            result = await provider.useService(platform, action, target);
            if (result.success) {
                providerUsed = fallbackProvider;
            }
        }

        if (result?.success) {
            results.success++;
            io.emit('spamProgress', {
                sessionId, type: 'suntik',
                target, platform, action,
                current: i + 1, total: count,
                success: results.success, failed: results.failed,
                message: `✅ ${i+1}/${count} Success! ${platform} ${action} (${providerUsed})`,
                status: 'success'
            });
        } else if (result?.cooldown) {
            io.emit('spamProgress', {
                sessionId, type: 'suntik',
                target, platform, action,
                current: i + 1, total: count,
                success: results.success, failed: results.failed,
                message: `⏳ ${result.error}`,
                status: 'cooldown',
                cooldown: true
            });
            await sleep(5000);
            i--;
            continue;
        } else {
            results.failed++;
            io.emit('spamProgress', {
                sessionId, type: 'suntik',
                target, platform, action,
                current: i + 1, total: count,
                success: results.success, failed: results.failed,
                message: `❌ ${i+1}/${count} Failed: ${result?.error || 'Unknown'}`,
                status: 'error'
            });
        }

        results.total = results.success + results.failed;
        results.attempts = i + 1;

        if (i < count - 1 && !isStopped) {
            await sleep(3000 + Math.random() * 4000);
        }
    }

    io.emit('spamProgress', {
        sessionId, type: 'suntik',
        target, platform, action,
        current: results.total, total: count,
        success: results.success, failed: results.failed,
        message: `📊 Selesai! Berhasil: ${results.success}, Gagal: ${results.failed}`,
        status: 'completed',
        completed: true
    });

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
                tikfollowers: status.tikfollowers,
                smmstone: status.smmstone
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
        const result = await spamSuntik(target, platform, action, count, username, sessionId);

        if (result.success > 0) {
            user.used = (user.used || 0) + result.success;
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
                attempts: result.attempts || 0
            }
        });
    } catch (err) {
        console.error('❌ Error:', err);
        res.json({ success: false, message: err.message });
    }
});

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
    console.log('💉 PRANKMASTER PRO - LIGHTWEIGHT');
    console.log('========================================');
    console.log('📌 Providers: TikFollowers + SMMStone');
    console.log('🔥 14 Platforms Supported');
    console.log('⚡ No Puppeteer - Fast Deploy!');
    console.log('========================================');
});