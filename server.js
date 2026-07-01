// ============================================
// PRANKMASTER PRO V5 - MULTI PROVIDER
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
const userAgent = require('user-agents');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker');

puppeteer.use(StealthPlugin());
puppeteer.use(AdblockerPlugin({ blockTrackers: true }));

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

const helmet = require('helmet');
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
}));

const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: { success: false, message: 'Terlalu banyak request!' }
});
app.use('/api/', limiter);

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
        primaryProvider: 'tikfollowers', // tikfollowers | smmstone
        fallbackEnabled: true,
        providers: {
            tikfollowers: {
                enabled: true,
                cooldown: 900, // 15 menit
                maxPerDay: 50,
                baseUrl: 'https://tikfollowers.com'
            },
            smmstone: {
                enabled: true,
                cooldown: 1800, // 30 menit
                maxPerDay: 100,
                baseUrl: 'https://smmstone.com/free'
            }
        },
        features: {
            // TikTok
            tiktok_followers: true,
            tiktok_likes: true,
            tiktok_views: true,
            tiktok_shares: true,
            // Instagram
            instagram_followers: true,
            instagram_likes: true,
            instagram_views: true,
            // YouTube
            youtube_subscribers: true,
            youtube_views: true,
            youtube_likes: true,
            // Facebook
            facebook_followers: true,
            facebook_likes: true,
            facebook_shares: true,
            // Twitter
            twitter_followers: true,
            twitter_likes: true,
            twitter_retweets: true,
            // Telegram
            telegram_members: true,
            telegram_views: true,
            telegram_reactions: true,
            // Others
            threads_followers: true,
            threads_likes: true,
            twitch_followers: true,
            twitch_views: true,
            spotify_followers: true,
            spotify_plays: true,
            discord_members: true,
            vk_followers: true,
            vk_likes: true,
            kwai_followers: true,
            kwai_likes: true,
            soundcloud_plays: true,
            clubhouse_followers: true
        },
        adminControls: {
            disableAllSuntik: false,
            disableTikTok: false,
            disableInstagram: false,
            disableYouTube: false,
            disableFacebook: false,
            disableTwitter: false,
            disableTelegram: false,
            disableOthers: false
        }
    },
    stats: {
        totalSuntikSent: 0,
        dailyStats: {},
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
// HUMAN-LIKE BEHAVIOR
// ============================================

function getRandomUserAgent() {
    try {
        return new userAgent().toString();
    } catch (e) {
        return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    }
}

function getRandomDelay(min = 1000, max = 5000) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms + (Math.random() * 500)));
}

// ============================================
// PUPPETEER BROWSER MANAGER
// ============================================

let browserInstance = null;

async function getBrowser() {
    if (!browserInstance) {
        browserInstance = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--window-size=1920,1080',
                '--disable-blink-features=AutomationControlled',
                '--disable-features=IsolateOrigins,site-per-process',
                '--disable-web-security'
            ],
            ignoreDefaultArgs: ['--enable-automation'],
            defaultViewport: {
                width: 1920,
                height: 1080,
                deviceScaleFactor: 1,
                hasTouch: false,
                isLandscape: true,
                isMobile: false,
            }
        });
    }
    return browserInstance;
}

async function getPage() {
    const browser = await getBrowser();
    const page = await browser.newPage();

    const viewports = [
        { width: 1366, height: 768 },
        { width: 1440, height: 900 },
        { width: 1536, height: 864 },
        { width: 1600, height: 900 },
        { width: 1680, height: 1050 },
        { width: 1920, height: 1080 }
    ];
    const vp = viewports[Math.floor(Math.random() * viewports.length)];
    await page.setViewport(vp);

    await page.setUserAgent(getRandomUserAgent());

    await page.setExtraHTTPHeaders({
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
    });

    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        Object.defineProperty(navigator, 'languages', { get: () => ['id-ID', 'id', 'en-US', 'en'] });
    });

    return page;
}

// ============================================
// PLATFORM CONFIG - SEMUA PLATFORM
// ============================================

const platformConfigs = {
    'TikTok': {
        icon: 'fab fa-tiktok',
        color: '#000000',
        provider: 'tikfollowers',
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
        provider: 'smmstone',
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
        provider: 'smmstone',
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
        provider: 'smmstone',
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
        provider: 'smmstone',
        actions: ['Followers', 'Likes', 'Retweets'],
        actionIcons: {
            'Followers': 'fa-users',
            'Likes': 'fa-heart',
            'Retweets': 'fa-retweet'
        }
    },
    'Telegram': {
        icon: 'fab fa-telegram',
        color: '#0088cc',
        provider: 'smmstone',
        actions: ['Members', 'Views', 'Reactions'],
        actionIcons: {
            'Members': 'fa-users',
            'Views': 'fa-eye',
            'Reactions': 'fa-smile'
        }
    },
    'Threads': {
        icon: 'fab fa-threads',
        color: '#000000',
        provider: 'smmstone',
        actions: ['Followers', 'Likes'],
        actionIcons: {
            'Followers': 'fa-users',
            'Likes': 'fa-heart'
        }
    },
    'Twitch': {
        icon: 'fab fa-twitch',
        color: '#9146FF',
        provider: 'smmstone',
        actions: ['Followers', 'Views'],
        actionIcons: {
            'Followers': 'fa-users',
            'Views': 'fa-eye'
        }
    },
    'Spotify': {
        icon: 'fab fa-spotify',
        color: '#1DB954',
        provider: 'smmstone',
        actions: ['Followers', 'Plays'],
        actionIcons: {
            'Followers': 'fa-users',
            'Plays': 'fa-play'
        }
    },
    'Discord': {
        icon: 'fab fa-discord',
        color: '#5865F2',
        provider: 'smmstone',
        actions: ['Members'],
        actionIcons: {
            'Members': 'fa-users'
        }
    },
    'VK': {
        icon: 'fab fa-vk',
        color: '#0077FF',
        provider: 'smmstone',
        actions: ['Followers', 'Likes', 'Views'],
        actionIcons: {
            'Followers': 'fa-users',
            'Likes': 'fa-heart',
            'Views': 'fa-eye'
        }
    },
    'Kwai': {
        icon: 'fas fa-video',
        color: '#FF6B00',
        provider: 'smmstone',
        actions: ['Followers', 'Likes', 'Views'],
        actionIcons: {
            'Followers': 'fa-users',
            'Likes': 'fa-heart',
            'Views': 'fa-eye'
        }
    },
    'SoundCloud': {
        icon: 'fab fa-soundcloud',
        color: '#FF3300',
        provider: 'smmstone',
        actions: ['Plays'],
        actionIcons: {
            'Plays': 'fa-play'
        }
    },
    'Clubhouse': {
        icon: 'fas fa-users',
        color: '#6515DD',
        provider: 'smmstone',
        actions: ['Followers'],
        actionIcons: {
            'Followers': 'fa-users'
        }
    }
};

// ============================================
// PROVIDER: TIKFOLLOWERS.COM
// ============================================

class TikFollowersProvider {
    constructor(sessionId) {
        this.sessionId = sessionId || uuidv4();
        this.baseUrl = 'https://tikfollowers.com';
        this.cookies = '';
        this.lastUsed = Date.now();
        this.cooldownUntil = 0;
        this.dailyCount = 0;
        this.dailyReset = Date.now();
        this.headers = {
            'User-Agent': getRandomUserAgent(),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive'
        };
    }

    checkDailyLimit() {
        const now = Date.now();
        if (now - this.dailyReset > 24 * 60 * 60 * 1000) {
            this.dailyCount = 0;
            this.dailyReset = now;
        }
        const maxPerDay = db.settings.providers.tikfollowers?.maxPerDay || 50;
        return this.dailyCount < maxPerDay;
    }

    async useService(platform, action, target) {
        if (platform !== 'TikTok') {
            return {
                success: false,
                error: 'TikFollowers hanya support TikTok!',
                fallback: true
            };
        }

        if (!this.checkDailyLimit()) {
            return {
                success: false,
                error: 'Daily limit reached!',
                fallback: true
            };
        }

        const now = Date.now();
        if (this.cooldownUntil > now) {
            const remaining = Math.ceil((this.cooldownUntil - now) / 1000);
            return {
                success: false,
                error: `Cooldown ${Math.ceil(remaining/60)} menit!`,
                cooldown: true,
                cooldownRemaining: remaining,
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
            console.log(`📤 TikFollowers: ${action} for ${target}`);

            const page = await getPage();
            const url = `${this.baseUrl}${path}`;

            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
            await sleep(1000 + Math.random() * 2000);
            await page.evaluate(() => {
                window.scrollBy(0, Math.random() * 300 + 100);
            });
            await sleep(500 + Math.random() * 1000);

            const cookies = await page.cookies();
            this.cookies = cookies.map(c => `${c.name}=${c.value}`).join('; ');
            this.headers['Cookie'] = this.cookies;

            // Fill username
            const inputFilled = await page.evaluate((target) => {
                const inputs = document.querySelectorAll('input[type="text"]');
                for (const input of inputs) {
                    const placeholder = (input.placeholder || '').toLowerCase();
                    const name = (input.name || '').toLowerCase();
                    if (placeholder.includes('username') || placeholder.includes('user') ||
                        name.includes('username') || name.includes('user')) {
                        input.value = target;
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        return true;
                    }
                }
                return false;
            }, target);

            if (!inputFilled) {
                return { success: false, error: 'Tidak dapat menemukan input username!', fallback: true };
            }

            await sleep(500 + Math.random() * 1000);

            // Click submit
            await page.evaluate(() => {
                const buttons = document.querySelectorAll('button, input[type="submit"]');
                for (const btn of buttons) {
                    const text = (btn.textContent || '').toLowerCase();
                    if (text.includes('submit') || text.includes('get') || text.includes('start')) {
                        btn.click();
                        break;
                    }
                }
            });

            await sleep(5000 + Math.random() * 3000);

            // Check result
            const resultHtml = await page.content();
            const $ = cheerio.load(resultHtml);

            const successMsg = $('.success, .alert-success, .result-success').text().trim();
            const errorMsg = $('.error, .alert-danger, .result-error').text().trim();

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

            return {
                success: false,
                error: errorMsg || 'Gagal, coba lagi nanti',
                fallback: true
            };

        } catch (error) {
            console.error('❌ TikFollowers error:', error.message);
            return {
                success: false,
                error: error.message,
                fallback: true
            };
        }
    }

    getStatus() {
        const now = Date.now();
        const cooldownRemaining = Math.max(0, Math.ceil((this.cooldownUntil - now) / 1000));
        const maxPerDay = db.settings.providers.tikfollowers?.maxPerDay || 50;

        return {
            sessionId: this.sessionId,
            provider: 'tikfollowers',
            cooldownRemaining: cooldownRemaining,
            dailyCount: this.dailyCount,
            dailyLimit: maxPerDay,
            dailyRemaining: maxPerDay - this.dailyCount,
            isReady: cooldownRemaining === 0 && this.dailyCount < maxPerDay,
            enabled: db.settings.providers.tikfollowers?.enabled !== false
        };
    }
}

// ============================================
// PROVIDER: SMMSTONE.COM
// ============================================

class SMMStoneProvider {
    constructor(sessionId) {
        this.sessionId = sessionId || uuidv4();
        this.baseUrl = 'https://smmstone.com/free';
        this.cookies = '';
        this.lastUsed = Date.now();
        this.cooldownUntil = 0;
        this.dailyCount = 0;
        this.dailyReset = Date.now();
        this.headers = {
            'User-Agent': getRandomUserAgent(),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive'
        };
    }

    checkDailyLimit() {
        const now = Date.now();
        if (now - this.dailyReset > 24 * 60 * 60 * 1000) {
            this.dailyCount = 0;
            this.dailyReset = now;
        }
        const maxPerDay = db.settings.providers.smmstone?.maxPerDay || 100;
        return this.dailyCount < maxPerDay;
    }

    async useService(platform, action, target) {
        if (!this.checkDailyLimit()) {
            return {
                success: false,
                error: 'Daily limit reached!'
            };
        }

        const now = Date.now();
        if (this.cooldownUntil > now) {
            const remaining = Math.ceil((this.cooldownUntil - now) / 1000);
            return {
                success: false,
                error: `Cooldown ${Math.ceil(remaining/60)} menit!`,
                cooldown: true,
                cooldownRemaining: remaining
            };
        }

        // Map platform + action to SMMStone path
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
            console.log(`📤 SMMStone: ${platform} ${action} for ${target}`);

            const page = await getPage();
            const url = `${this.baseUrl}${path}`;

            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
            await sleep(1000 + Math.random() * 2000);
            await page.evaluate(() => {
                window.scrollBy(0, Math.random() * 300 + 100);
            });
            await sleep(500 + Math.random() * 1000);

            const cookies = await page.cookies();
            this.cookies = cookies.map(c => `${c.name}=${c.value}`).join('; ');
            this.headers['Cookie'] = this.cookies;

            // Check if need login
            const html = await page.content();
            const $ = cheerio.load(html);
            const needLogin = $('input[name="username"], input[name="password"], .login-form').length > 0;

            if (needLogin) {
                // Try to find and fill input without login
                const inputFilled = await page.evaluate((target) => {
                    const inputs = document.querySelectorAll('input[type="text"]');
                    for (const input of inputs) {
                        const placeholder = (input.placeholder || '').toLowerCase();
                        const name = (input.name || '').toLowerCase();
                        if (placeholder.includes('username') || placeholder.includes('link') ||
                            placeholder.includes('target') || name.includes('username') ||
                            name.includes('link') || name.includes('target')) {
                            input.value = target;
                            input.dispatchEvent(new Event('input', { bubbles: true }));
                            return true;
                        }
                    }
                    return false;
                }, target);

                if (!inputFilled) {
                    return { success: false, error: 'Tidak dapat menemukan input target!' };
                }

                await sleep(500 + Math.random() * 1000);

                // Click submit/get button
                await page.evaluate(() => {
                    const buttons = document.querySelectorAll('button, input[type="submit"]');
                    for (const btn of buttons) {
                        const text = (btn.textContent || '').toLowerCase();
                        if (text.includes('get') || text.includes('submit') || text.includes('start') ||
                            text.includes('kirim') || text.includes('send')) {
                            btn.click();
                            break;
                        }
                    }
                });

                await sleep(5000 + Math.random() * 3000);

                // Check result
                const resultHtml = await page.content();
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

                return {
                    success: false,
                    error: errorMsg || 'Gagal, coba lagi nanti'
                };
            }

            // If login required, return error
            return {
                success: false,
                error: 'SMMStone membutuhkan login. Gunakan TikFollowers untuk TikTok.'
            };

        } catch (error) {
            console.error('❌ SMMStone error:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    getStatus() {
        const now = Date.now();
        const cooldownRemaining = Math.max(0, Math.ceil((this.cooldownUntil - now) / 1000));
        const maxPerDay = db.settings.providers.smmstone?.maxPerDay || 100;

        return {
            sessionId: this.sessionId,
            provider: 'smmstone',
            cooldownRemaining: cooldownRemaining,
            dailyCount: this.dailyCount,
            dailyLimit: maxPerDay,
            dailyRemaining: maxPerDay - this.dailyCount,
            isReady: cooldownRemaining === 0 && this.dailyCount < maxPerDay,
            enabled: db.settings.providers.smmstone?.enabled !== false
        };
    }
}

// ============================================
// SESSION MANAGER
// ============================================

class SessionManager {
    constructor() {
        this.sessions = [];
        this.maxSessions = db.settings.maxConcurrent || 5;
        this.providerSessions = {
            tikfollowers: [],
            smmstone: []
        };
    }

    createSession(provider) {
        const sessionId = uuidv4();
        let session;

        if (provider === 'tikfollowers') {
            session = new TikFollowersProvider(sessionId);
        } else if (provider === 'smmstone') {
            session = new SMMStoneProvider(sessionId);
        } else {
            return null;
        }

        this.sessions.push(session);
        if (!this.providerSessions[provider]) this.providerSessions[provider] = [];
        this.providerSessions[provider].push(session);

        this.cleanup();
        return session;
    }

    getAvailableSession(provider) {
        const sessions = this.providerSessions[provider] || [];
        const now = Date.now();

        for (const session of sessions) {
            const status = session.getStatus ? session.getStatus() : {};
            if (status.isReady !== false && status.enabled !== false) {
                return session;
            }
        }

        if (sessions.length < this.maxSessions) {
            return this.createSession(provider);
        }

        let bestSession = null;
        let bestCooldown = Infinity;
        for (const session of sessions) {
            const status = session.getStatus ? session.getStatus() : {};
            const cooldown = status.cooldownRemaining || 0;
            if (cooldown < bestCooldown && status.enabled !== false) {
                bestCooldown = cooldown;
                bestSession = session;
            }
        }

        return bestSession;
    }

    cleanup() {
        const now = Date.now();
        for (const provider of ['tikfollowers', 'smmstone']) {
            this.providerSessions[provider] = this.providerSessions[provider].filter(s => {
                const lastUsed = s.lastUsed || 0;
                return now - lastUsed < 30 * 60 * 1000;
            });
        }
    }

    getStats() {
        const tikSessions = this.providerSessions.tikfollowers || [];
        const smmSessions = this.providerSessions.smmstone || [];

        return {
            totalSessions: this.sessions.length,
            tikfollowers: {
                count: tikSessions.length,
                ready: tikSessions.filter(s => {
                    const status = s.getStatus ? s.getStatus() : {};
                    return status.isReady !== false && status.enabled !== false;
                }).length,
                enabled: db.settings.providers.tikfollowers?.enabled !== false
            },
            smmstone: {
                count: smmSessions.length,
                ready: smmSessions.filter(s => {
                    const status = s.getStatus ? s.getStatus() : {};
                    return status.isReady !== false && status.enabled !== false;
                }).length,
                enabled: db.settings.providers.smmstone?.enabled !== false
            },
            maxSessions: this.maxSessions
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
    let providerUsed = '';

    if (!global.spamSessions) global.spamSessions = {};
    global.spamSessions[sessionId] = { stop: () => { isStopped = true; } };

    // Determine primary provider for this platform
    const platformConfig = platformConfigs[platform];
    const primaryProvider = platformConfig?.provider || 'tikfollowers';
    const fallbackProvider = primaryProvider === 'tikfollowers' ? 'smmstone' : 'tikfollowers';

    // Check if primary provider is enabled
    const primaryEnabled = db.settings.providers[primaryProvider]?.enabled !== false;

    // Try primary provider first
    let provider = primaryEnabled ? primaryProvider : null;

    if (!provider) {
        // Try fallback if primary is disabled
        const fallbackEnabled = db.settings.providers[fallbackProvider]?.enabled !== false;
        if (fallbackEnabled && db.settings.fallbackEnabled) {
            provider = fallbackProvider;
        } else {
            io.emit('spamProgress', {
                sessionId, type: 'suntik',
                target, platform, action,
                current: 0, total: count,
                success: 0, failed: 0,
                message: '❌ Semua provider dinonaktifkan!',
                status: 'error'
            });
            return { success: 0, failed: count, total: count, attempts: 0 };
        }
    }

    // Get session
    let session = sessionManager.getAvailableSession(provider);
    if (!session) {
        session = sessionManager.createSession(provider);
    }

    if (!session) {
        io.emit('spamProgress', {
            sessionId, type: 'suntik',
            target, platform, action,
            current: 0, total: count,
            success: 0, failed: 0,
            message: `❌ Gagal membuat session ${provider}!`,
            status: 'error'
        });
        return { success: 0, failed: count, total: count, attempts: 0 };
    }

    providerUsed = provider;

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

        // Check if session is ready
        let currentSession = session;
        const status = currentSession.getStatus ? currentSession.getStatus() : {};

        if (status.isReady === false) {
            // Try fallback if available and enabled
            const fallbackEnabled = db.settings.providers[fallbackProvider]?.enabled !== false;
            if (fallbackEnabled && db.settings.fallbackEnabled && provider !== fallbackProvider) {
                const altSession = sessionManager.getAvailableSession(fallbackProvider);
                if (altSession) {
                    currentSession = altSession;
                    providerUsed = fallbackProvider;
                    io.emit('spamProgress', {
                        sessionId, type: 'suntik',
                        target, platform, action,
                        current: i + 1, total: count,
                        success: results.success, failed: results.failed,
                        message: `🔄 Switch to ${fallbackProvider}...`,
                        status: 'info'
                    });
                } else {
                    // Wait and retry
                    await sleep(5000);
                    i--;
                    continue;
                }
            } else {
                // Show cooldown
                const cooldownRemaining = status.cooldownRemaining || 0;
                if (cooldownRemaining > 0) {
                    io.emit('spamProgress', {
                        sessionId, type: 'suntik',
                        target, platform, action,
                        current: i + 1, total: count,
                        success: results.success, failed: results.failed,
                        message: `⏳ Cooldown: ${Math.ceil(cooldownRemaining/60)} menit (${providerUsed})`,
                        status: 'cooldown',
                        cooldown: true,
                        cooldownRemaining: cooldownRemaining
                    });

                    await sleep(5000);
                    i--;
                    continue;
                }
            }
        }

        // Execute
        try {
            const result = await currentSession.useService(platform, action, target);

            if (result.success) {
                results.success++;
                io.emit('spamProgress', {
                    sessionId, type: 'suntik',
                    target, platform, action,
                    current: i + 1, total: count,
                    success: results.success, failed: results.failed,
                    message: `✅ ${i+1}/${count} Success! ${platform} ${action} (${providerUsed})`,
                    status: 'success',
                    provider: providerUsed
                });
            } else if (result.fallback && provider !== fallbackProvider) {
                // Try fallback
                const fallbackEnabled = db.settings.providers[fallbackProvider]?.enabled !== false;
                if (fallbackEnabled && db.settings.fallbackEnabled) {
                    const altSession = sessionManager.getAvailableSession(fallbackProvider);
                    if (altSession) {
                        currentSession = altSession;
                        providerUsed = fallbackProvider;
                        i--; // Retry with fallback
                        io.emit('spamProgress', {
                            sessionId, type: 'suntik',
                            target, platform, action,
                            current: i + 1, total: count,
                            success: results.success, failed: results.failed,
                            message: `🔄 Switching to ${fallbackProvider}...`,
                            status: 'info'
                        });
                        continue;
                    }
                }
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
            } else if (result.cooldown) {
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

        if (i < count - 1 && !isStopped) {
            await sleep(getRandomDelay(3000, 7000));
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
        totalAttempts: results.attempts,
        provider: providerUsed
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
        const platforms = Object.keys(platformConfigs).map(key => {
            const config = platformConfigs[key];
            const isDisabled = db.settings.adminControls?.[`disable${key}`] || false;
            const isAllDisabled = db.settings.adminControls?.disableAllSuntik || false;

            return {
                name: key,
                icon: config.icon,
                color: config.color,
                provider: config.provider,
                disabled: isDisabled || isAllDisabled,
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
        const stats = sessionManager.getStats();
        const tikSessions = sessionManager.providerSessions.tikfollowers || [];
        const smmSessions = sessionManager.providerSessions.smmstone || [];

        res.json({
            success: true,
            stats: stats,
            providers: {
                tikfollowers: {
                    enabled: db.settings.providers.tikfollowers?.enabled !== false,
                    cooldown: db.settings.providers.tikfollowers?.cooldown || 900,
                    maxPerDay: db.settings.providers.tikfollowers?.maxPerDay || 50,
                    sessions: tikSessions.map(s => s.getStatus ? s.getStatus() : {}),
                    isPrimary: db.settings.primaryProvider === 'tikfollowers'
                },
                smmstone: {
                    enabled: db.settings.providers.smmstone?.enabled !== false,
                    cooldown: db.settings.providers.smmstone?.cooldown || 1800,
                    maxPerDay: db.settings.providers.smmstone?.maxPerDay || 100,
                    sessions: smmSessions.map(s => s.getStatus ? s.getStatus() : {}),
                    isPrimary: db.settings.primaryProvider === 'smmstone'
                }
            },
            fallbackEnabled: db.settings.fallbackEnabled !== false
        });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// ===== SPAM SUNTIK =====
app.post('/api/spam/suntik', async (req, res) => {
    try {
        const { username, target, platform, action, count } = req.body;

        // Admin controls
        if (db.settings.adminControls?.disableAllSuntik) {
            return res.json({
                success: false,
                message: '⚠️ Semua fitur suntik sedang dinonaktifkan oleh admin!'
            });
        }

        if (db.settings.adminControls?.[`disable${platform}`]) {
            return res.json({
                success: false,
                message: `⚠️ Platform ${platform} sedang dinonaktifkan oleh admin!`
            });
        }

        if (!username) {
            return res.json({ success: false, message: 'Username tidak ditemukan!' });
        }

        const user = db.users.find(u => u.username === username);
        if (!user) {
            return res.json({ success: false, message: 'User tidak ditemukan!' });
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
                return res.json({ success: false, message: 'Limit habis! Tunggu 1 jam untuk reset.' });
            }
            if (count > remaining) {
                return res.json({ success: false, message: `Sisa limit hanya ${remaining}!` });
            }
        }

        // Check if any provider is enabled
        const tikEnabled = db.settings.providers.tikfollowers?.enabled !== false;
        const smmEnabled = db.settings.providers.smmstone?.enabled !== false;

        if (!tikEnabled && !smmEnabled) {
            return res.json({
                success: false,
                message: '⚠️ Semua provider sedang dinonaktifkan oleh admin!'
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

// ===== ADMIN ROUTES =====
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
        const limits = { 'Free': 15, 'Premium': 80, 'VIP': 150, 'Reseller': 200, 'Developer': Infinity };
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
        if (!db.settings.providers) db.settings.providers = {};
        if (!db.settings.providers[provider]) db.settings.providers[provider] = {};
        db.settings.providers[provider].enabled = enabled;
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
        if (provider !== 'tikfollowers' && provider !== 'smmstone') {
            return res.json({ success: false, message: 'Provider tidak valid!' });
        }
        db.settings.primaryProvider = provider;
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
        db.settings.fallbackEnabled = enabled;
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
                onlineUsers: onlineUsers.size,
                providers: sessionManager.getStats()
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
    console.log('💉 PRANKMASTER PRO V5');
    console.log('========================================');
    console.log('📌 Providers:');
    console.log('  🔵 TikFollowers.com (Primary - TikTok)');
    console.log('  🟢 SMMStone.com (Fallback - All Platforms)');
    console.log('========================================');
    console.log('🔥 Supported Platforms:');
    console.log('  TikTok, Instagram, YouTube, Facebook, Twitter');
    console.log('  Telegram, Threads, Twitch, Spotify, Discord');
    console.log('  VK, Kwai, SoundCloud, Clubhouse');
    console.log('========================================');

    // Init sessions
    console.log('🔄 Initializing providers...');
    sessionManager.createSession('tikfollowers');
    sessionManager.createSession('smmstone');
    console.log('✅ All providers ready!');
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================
process.on('SIGINT', async () => {
    console.log('🛑 Shutting down gracefully...');
    if (browserInstance) {
        await browserInstance.close();
    }
    process.exit(0);
});