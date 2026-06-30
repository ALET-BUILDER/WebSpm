const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { 
    cors: { origin: "*", methods: ["GET", "POST"] } 
});

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===== SERVE STATIC FILES =====
// SERVE index.html dari ROOT
app.use(express.static(__dirname));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ===== ROUTE UNTUK INDEX =====
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
    bots: [],
    payments: [],
    messages: [],
    settings: { globalLimit: 50, maxBots: 5, maintenance: false }
};

function loadDB() {
    try {
        if (fs.existsSync(`${DATA_DIR}/db.json`)) {
            db = JSON.parse(fs.readFileSync(`${DATA_DIR}/db.json`, 'utf8'));
        }
    } catch (e) { console.log('DB baru'); }
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
            isAdmin: true,
            isDeveloper: true,
            online: false,
            createdAt: new Date().toISOString()
        });
        saveDB();
        console.log('✅ Admin Lynzka dibuat');
    }
}
initAdmin();

// ============================================
// WHATSAPP BOT REAL - FIX UNTUK RAILWAY
// ============================================
let whatsappClients = {};
let botStatus = {};

function createBotInstance(sessionId) {
    // Cari Chromium di Railway
    let chromiumPath = null;
    const possiblePaths = [
        '/nix/store/*chromium/bin/chromium',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/usr/local/bin/chromium',
        process.env.PUPPETEER_EXECUTABLE_PATH
    ];

    // Coba semua path
    for (const p of possiblePaths) {
        try {
            const cleanPath = p.replace('*', '');
            if (fs.existsSync(cleanPath)) {
                chromiumPath = cleanPath;
                console.log(`✅ Chromium ditemukan di: ${chromiumPath}`);
                break;
            }
        } catch (e) {}
    }

    // Coba cari dengan which
    if (!chromiumPath) {
        try {
            const { execSync } = require('child_process');
            chromiumPath = execSync('which chromium || which chromium-browser || true', { encoding: 'utf8' }).trim();
            if (chromiumPath) {
                console.log(`✅ Chromium ditemukan via which: ${chromiumPath}`);
            }
        } catch (e) {}
    }

    const client = new Client({
        authStrategy: new LocalAuth({ clientId: sessionId }),
        puppeteer: {
            headless: true,
            executablePath: chromiumPath || undefined,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--disable-software-rasterizer',
                '--disable-extensions',
                '--disable-default-apps',
                '--disable-sync',
                '--disable-translate'
            ]
        }
    });

    client.on('qr', async (qr) => {
        try {
            const qrImage = await qrcode.toDataURL(qr);
            io.emit('botQR', { sessionId, qr: qrImage });
            console.log('📱 QR Code siap');
        } catch (e) {
            console.log('📱 QR Code:', qr);
        }
    });

    client.on('ready', () => {
        botStatus[sessionId] = 'ready';
        io.emit('botReady', { sessionId });
        console.log('✅ Bot siap digunakan!');
    });

    client.on('authenticated', () => {
        botStatus[sessionId] = 'authenticated';
        console.log('🔐 Bot terautentikasi');
    });

    client.on('auth_failure', (msg) => {
        botStatus[sessionId] = 'failed';
        io.emit('botError', { sessionId, error: msg });
        console.log('❌ Auth gagal:', msg);
    });

    client.on('disconnected', (reason) => {
        botStatus[sessionId] = 'disconnected';
        io.emit('botDisconnected', { sessionId, reason });
        console.log('🔌 Bot terputus:', reason);
    });

    return client;
}

// ============================================
// REAL SPAM FUNCTIONS
// ============================================
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendPairingCode(client, phoneNumber, count, sessionId) {
    const results = { success: 0, failed: 0 };
    for (let i = 0; i < count; i++) {
        try {
            const code = Math.random().toString(36).substring(2, 10).toUpperCase();
            const message = `*PAIRING CODE*\n\nKode: ${code}\n\nGunakan kode ini untuk connect WhatsApp Anda.\n\n*PrankMaster Pro*`;
            const chatId = phoneNumber.includes('@c.us') ? phoneNumber : `${phoneNumber}@c.us`;
            await client.sendMessage(chatId, message);
            results.success++;
            io.emit('spamProgress', {
                sessionId, type: 'pairing', target: phoneNumber,
                current: i + 1, total: count,
                success: results.success, failed: results.failed,
                message: `✅ Pairing code terkirim ke ${phoneNumber} (${i+1}/${count})`
            });
            await sleep(2000 + Math.random() * 3000);
        } catch (error) {
            results.failed++;
            io.emit('spamProgress', {
                sessionId, type: 'pairing', target: phoneNumber,
                current: i + 1, total: count,
                success: results.success, failed: results.failed,
                error: error.message
            });
        }
    }
    return results;
}

async function sendSpamChat(client, phoneNumber, message, count, sessionId) {
    const results = { success: 0, failed: 0 };
    for (let i = 0; i < count; i++) {
        try {
            const chatId = phoneNumber.includes('@c.us') ? phoneNumber : `${phoneNumber}@c.us`;
            const msg = message + ` (${i+1}/${count})`;
            await client.sendMessage(chatId, msg);
            results.success++;
            io.emit('spamProgress', {
                sessionId, type: 'chat', target: phoneNumber,
                current: i + 1, total: count,
                success: results.success, failed: results.failed,
                message: `✅ Chat terkirim ke ${phoneNumber} (${i+1}/${count})`
            });
            await sleep(1500 + Math.random() * 2000);
        } catch (error) {
            results.failed++;
            io.emit('spamProgress', {
                sessionId, type: 'chat', target: phoneNumber,
                current: i + 1, total: count,
                success: results.success, failed: results.failed,
                error: error.message
            });
        }
    }
    return results;
}

async function sendSpamCall(client, phoneNumber, type, count, sessionId) {
    const results = { success: 0, failed: 0 };
    const callType = type === 'video' ? '📹 Video Call' : '📞 Voice Call';
    for (let i = 0; i < count; i++) {
        try {
            const chatId = phoneNumber.includes('@c.us') ? phoneNumber : `${phoneNumber}@c.us`;
            const message = `*${callType}* (${i+1}/${count})\n\nAda panggilan masuk dari *PrankMaster*!`;
            await client.sendMessage(chatId, message);
            results.success++;
            io.emit('spamProgress', {
                sessionId, type: 'call', target: phoneNumber,
                current: i + 1, total: count,
                success: results.success, failed: results.failed,
                message: `✅ ${callType} terkirim ke ${phoneNumber} (${i+1}/${count})`
            });
            await sleep(3000 + Math.random() * 4000);
        } catch (error) {
            results.failed++;
            io.emit('spamProgress', {
                sessionId, type: 'call', target: phoneNumber,
                current: i + 1, total: count,
                success: results.success, failed: results.failed,
                error: error.message
            });
        }
    }
    return results;
}

// ============================================
// API ROUTES
// ============================================

app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (db.users.find(u => u.username === username)) {
        return res.json({ success: false, message: 'Username sudah digunakan!' });
    }
    db.users.push({
        id: uuidv4(),
        username,
        password: bcrypt.hashSync(password, 10),
        status: 'Free',
        limit: 15,
        used: 0,
        isAdmin: false,
        isDeveloper: false,
        online: false,
        createdAt: new Date().toISOString()
    });
    saveDB();
    res.json({ success: true, message: 'Registrasi berhasil!' });
});

app.post('/api/login', (req, res) => {
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
            isDeveloper: user.isDeveloper
        }
    });
});

app.get('/api/user/:username', (req, res) => {
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
            isDeveloper: user.isDeveloper
        }
    });
});

app.post('/api/change-password', (req, res) => {
    const { username, newPassword } = req.body;
    const user = db.users.find(u => u.username === username);
    if (!user) return res.json({ success: false, message: 'User tidak ditemukan!' });
    user.password = bcrypt.hashSync(newPassword, 10);
    saveDB();
    res.json({ success: true, message: 'Password berhasil diubah!' });
});

app.get('/api/bots', (req, res) => {
    const bots = Object.keys(botStatus).map(id => ({
        id,
        status: botStatus[id] || 'disconnected'
    }));
    res.json({ success: true, bots });
});

app.post('/api/bots/connect', (req, res) => {
    const { number, username } = req.body;
    const user = db.users.find(u => u.username === username);
    if (!user) return res.json({ success: false, message: 'User tidak ditemukan!' });
    const sessionId = `${username}_${Date.now()}`;
    if (whatsappClients[sessionId]) {
        return res.json({ success: false, message: 'Bot sudah terhubung!' });
    }
    try {
        const client = createBotInstance(sessionId);
        whatsappClients[sessionId] = client;
        botStatus[sessionId] = 'connecting';
        client.initialize();
        db.bots.push({
            id: sessionId,
            number,
            owner: username,
            status: 'connecting',
            connectedAt: new Date().toISOString()
        });
        saveDB();
        res.json({ success: true, message: 'Bot sedang menghubungkan...', sessionId });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

app.post('/api/bots/disconnect', (req, res) => {
    const { sessionId } = req.body;
    if (whatsappClients[sessionId]) {
        whatsappClients[sessionId].destroy();
        delete whatsappClients[sessionId];
        delete botStatus[sessionId];
        db.bots = db.bots.filter(b => b.id !== sessionId);
        saveDB();
    }
    res.json({ success: true });
});

app.post('/api/spam/pairing', async (req, res) => {
    const { sessionId, target, count } = req.body;
    const client = whatsappClients[sessionId];
    if (!client) return res.json({ success: false, message: 'Bot tidak ditemukan!' });
    if (botStatus[sessionId] !== 'ready') return res.json({ success: false, message: 'Bot belum siap!' });
    try {
        const result = await sendPairingCode(client, target, count, sessionId);
        res.json({ success: true, result });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

app.post('/api/spam/chat', async (req, res) => {
    const { sessionId, target, message, count } = req.body;
    const client = whatsappClients[sessionId];
    if (!client) return res.json({ success: false, message: 'Bot tidak ditemukan!' });
    if (botStatus[sessionId] !== 'ready') return res.json({ success: false, message: 'Bot belum siap!' });
    try {
        const result = await sendSpamChat(client, target, message, count, sessionId);
        res.json({ success: true, result });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

app.post('/api/spam/call', async (req, res) => {
    const { sessionId, target, type, count } = req.body;
    const client = whatsappClients[sessionId];
    if (!client) return res.json({ success: false, message: 'Bot tidak ditemukan!' });
    if (botStatus[sessionId] !== 'ready') return res.json({ success: false, message: 'Bot belum siap!' });
    try {
        const result = await sendSpamCall(client, target, type, count, sessionId);
        res.json({ success: true, result });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

// ===== ADMIN API =====
app.get('/api/admin/users', (req, res) => {
    res.json({
        success: true,
        users: db.users.map(u => ({
            username: u.username,
            status: u.status,
            limit: u.limit,
            used: u.used,
            online: u.online || false,
            isAdmin: u.isAdmin,
            isDeveloper: u.isDeveloper
        }))
    });
});

app.post('/api/admin/update-status', (req, res) => {
    const { username, status, admin } = req.body;
    const adminUser = db.users.find(u => u.username === admin);
    if (!adminUser || (!adminUser.isAdmin && !adminUser.isDeveloper)) {
        return res.json({ success: false, message: 'Unauthorized!' });
    }
    if (status === 'Developer' && !adminUser.isDeveloper) {
        return res.json({ success: false, message: 'Hanya Developer!' });
    }
    const user = db.users.find(u => u.username === username);
    if (!user) return res.json({ success: false, message: 'User tidak ditemukan!' });
    const limits = { Free: 15, Premium: 200, VIP: Infinity, Reseller: 500, Developer: Infinity };
    user.status = status;
    user.limit = limits[status] || 15;
    saveDB();
    res.json({ success: true });
});

app.post('/api/admin/ban', (req, res) => {
    const { username, admin } = req.body;
    const adminUser = db.users.find(u => u.username === admin);
    if (!adminUser || !adminUser.isDeveloper) {
        return res.json({ success: false, message: 'Hanya Developer!' });
    }
    db.users = db.users.filter(u => u.username !== username);
    db.bots = db.bots.filter(b => b.owner !== username);
    saveDB();
    res.json({ success: true });
});

app.post('/api/admin/settings', (req, res) => {
    const { settings, admin } = req.body;
    const adminUser = db.users.find(u => u.username === admin);
    if (!adminUser || !adminUser.isDeveloper) {
        return res.json({ success: false, message: 'Hanya Developer!' });
    }
    db.settings = settings;
    saveDB();
    res.json({ success: true });
});

app.get('/api/admin/payments', (req, res) => {
    res.json({ success: true, payments: db.payments });
});

app.post('/api/admin/verify-payment', (req, res) => {
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
        const limits = { Premium: 200, VIP: Infinity, Reseller: 500 };
        user.status = payment.package;
        user.limit = limits[payment.package] || 15;
    }
    saveDB();
    io.emit('paymentStatus', { status: 'success', message: `Pembayaran ${payment.package} diverifikasi!` });
    res.json({ success: true });
});

app.post('/api/admin/reject-payment', (req, res) => {
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
});

// ===== PAYMENT SUBMIT =====
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

app.post('/api/payments/submit', upload.single('proof'), (req, res) => {
    const { username, package: pkg, name, paymentMethod } = req.body;
    const user = db.users.find(u => u.username === username);
    if (!user) return res.json({ success: false, message: 'User tidak ditemukan!' });
    if (!req.file) return res.json({ success: false, message: 'Upload bukti pembayaran!' });
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
        db.messages.push(data);
        if (db.messages.length > 1000) db.messages.shift();
        saveDB();
        io.emit('newMessage', data);
    });
    socket.on('disconnect', () => {
        console.log('⚡ User disconnected:', socket.id);
        setTimeout(() => {
            const toRemove = [];
            onlineUsers.forEach(u => {
                const user = db.users.find(usr => usr.username === u);
                if (user && !user.online) toRemove.push(u);
            });
            toRemove.forEach(u => onlineUsers.delete(u));
            io.emit('usersOnline', Array.from(onlineUsers));
        }, 5000);
    });
});

// ============================================
// AUTO CLEAN MESSAGES
// ============================================
function checkAndCleanMessages() {
    const now = new Date();
    if (now.getHours() === 23 && now.getMinutes() === 59) {
        db.messages = [];
        saveDB();
        console.log('🧹 Pesan chat dibersihkan');
    }
}
setInterval(checkAndCleanMessages, 60000);

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🔗 https://your-app.railway.app`);
    console.log('📱 WhatsApp Bot siap digunakan!');
});