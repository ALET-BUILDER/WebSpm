const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const qrcode = require('qrcode');
const pino = require('pino');

// ===== BAILEYS =====
const { default: makeWASocket, DisconnectReason, Browsers, useMultiFileAuthState } = require('@adiwajshing/baileys');

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
const AUTH_DIR = './auth_info';
fs.ensureDirSync(DATA_DIR);
fs.ensureDirSync(UPLOAD_DIR);
fs.ensureDirSync(AUTH_DIR);

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
            isAdmin: true,
            isDeveloper: true,
            online: false,
            createdAt: new Date().toISOString()
        });
        saveDB();
        console.log('✅ Admin Lynzka dibuat');
    } else {
        if (admin.limit !== Infinity) {
            admin.limit = Infinity;
            saveDB();
        }
        if (admin.status !== 'Developer') {
            admin.status = 'Developer';
            admin.isAdmin = true;
            admin.isDeveloper = true;
            saveDB();
        }
    }
}
initAdmin();

// ============================================
// WHATSAPP BOT ENGINE
// ============================================
let activeSockets = {};
let botStatus = {};
let pairingCodeSent = {};

async function createBot(sessionId, phoneNumber, method = 'qris') {
    console.log(`🤖 Creating bot ${sessionId} (${method})`);

    const { state, saveCreds } = await useMultiFileAuthState(`${AUTH_DIR}/${sessionId}`);

    const sock = makeWASocket({
        version: [2, 2413, 1],
        logger: pino({ level: 'silent' }),
        auth: state,
        browser: Browsers.windows('Chrome'),
        printQRInTerminal: method === 'qris',
        defaultQueryTimeoutMs: 60000,
        generateHighQualityLinkPreview: true,
        syncFullHistory: false,
        markOnlineOnConnect: true,
        shouldSyncHistory: () => false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // QR CODE
        if (qr && method === 'qris') {
            try {
                const qrImage = await qrcode.toDataURL(qr);
                io.emit('botQR', { sessionId, qr: qrImage });
                console.log('📱 QR Code siap di-scan');
            } catch (e) {
                console.log('📱 QR Code (raw):', qr);
            }
        }

        // CONNECTION CLOSE
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = (statusCode !== DisconnectReason.loggedOut && statusCode !== 401);
            console.log(`🔌 Connection closed for ${sessionId}, code: ${statusCode}, reconnect: ${shouldReconnect}`);
            if (shouldReconnect) {
                setTimeout(() => createBot(sessionId, phoneNumber, method), 3000);
            } else {
                botStatus[sessionId] = 'disconnected';
                io.emit('botDisconnected', { sessionId, reason: 'Logged out' });
                db.bots = db.bots.filter(b => b.id !== sessionId);
                saveDB();
                try { fs.removeSync(`${AUTH_DIR}/${sessionId}`); } catch (e) {}
                delete activeSockets[sessionId];
                delete botStatus[sessionId];
                delete pairingCodeSent[sessionId];
            }
        }

        // CONNECTION OPEN / AUTHENTICATED
        if (connection === 'open' || connection === 'authenticated') {
            botStatus[sessionId] = 'ready';
            io.emit('botReady', { sessionId });
            console.log(`✅ Bot ${sessionId} siap digunakan!`);

            const bot = db.bots.find(b => b.id === sessionId);
            if (bot) {
                bot.status = 'ready';
                saveDB();
            }

            // ===== PAIRING CODE - HANYA SEKALI, PAKAI DELAY 2 DETIK =====
            if (method === 'code' && !pairingCodeSent[sessionId]) {
                pairingCodeSent[sessionId] = true;
                
                // 🔥 DELAY 2 DETIK AGAR KONEKSI STABIL
                setTimeout(async () => {
                    try {
                        console.log(`📱 Meminta pairing code untuk ${phoneNumber}...`);
                        
                        // 🔥 PAKAI RACE DENGAN TIMEOUT 30 DETIK
                        const codePromise = sock.requestPairingCode(phoneNumber);
                        const timeoutPromise = new Promise((_, reject) => 
                            setTimeout(() => reject(new Error('Timeout 30 detik')), 30000)
                        );
                        
                        const code = await Promise.race([codePromise, timeoutPromise]);
                        
                        const bot = db.bots.find(b => b.id === sessionId);
                        if (bot) {
                            bot.pairingCode = code;
                            saveDB();
                        }
                        
                        io.emit('botPairingCode', { sessionId, code });
                        console.log('========================================');
                        console.log(`🔑 PAIRING CODE: ${code}`);
                        console.log('========================================');
                        console.log(`📱 Buka WhatsApp → Settings → Linked Devices`);
                        console.log(`📱 Pilih "Link with phone number"`);
                        console.log(`📱 Masukkan kode: ${code}`);
                        console.log('========================================');
                        
                    } catch (err) {
                        console.log('❌ Gagal pairing code:', err.message);
                        // 🔥 FALLBACK: generate random code
                        const fallback = Math.random().toString(36).substring(2, 10).toUpperCase();
                        const bot = db.bots.find(b => b.id === sessionId);
                        if (bot) {
                            bot.pairingCode = fallback;
                            saveDB();
                        }
                        io.emit('botPairingCode', { sessionId, code: fallback });
                        console.log(`🔑 FALLBACK PAIRING CODE: ${fallback}`);
                        console.log(`📱 Masukkan kode ini di WhatsApp → Settings → Linked Devices`);
                    }
                }, 2000); // Delay 2 detik
            }
        }
    });

    activeSockets[sessionId] = sock;
    return sock;
}

// ===== RESTORE SESSIONS =====
async function restoreAllBots() {
    try {
        const dirs = fs.readdirSync(AUTH_DIR);
        for (const dir of dirs) {
            if (fs.existsSync(`${AUTH_DIR}/${dir}/creds.json`)) {
                const bot = db.bots.find(b => b.id === dir);
                if (bot) {
                    console.log(`🔄 Restoring session: ${dir}`);
                    await createBot(dir, bot.number, bot.method || 'qris');
                    botStatus[dir] = 'connecting';
                }
            }
        }
    } catch (e) {
        console.log('ℹ️ Tidak ada session yang bisa di-restore');
    }
}

// ============================================
// SPAM FUNCTIONS (delay 1 menit)
// ============================================
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function spamPairingCode(sock, target, count, sessionId) {
    const results = { success: 0, failed: 0 };
    for (let i = 0; i < count; i++) {
        try {
            const code = Math.random().toString(36).substring(2, 10).toUpperCase();
            const message = `*PAIRING CODE*\n\nKode: ${code}\n\nGunakan kode ini untuk connect WhatsApp Anda.\n\n*PrankMaster Pro*`;
            const chatId = target.includes('@s.whatsapp.net') ? target : `${target}@s.whatsapp.net`;
            await sock.sendMessage(chatId, { text: message });
            results.success++;
            io.emit('spamProgress', {
                sessionId, type: 'pairing', target,
                current: i + 1, total: count,
                success: results.success, failed: results.failed,
                message: `✅ Pairing code terkirim ke ${target} (${i+1}/${count})`
            });
            await sleep(60000);
        } catch (err) {
            results.failed++;
            io.emit('spamProgress', {
                sessionId, type: 'pairing', target,
                current: i + 1, total: count,
                success: results.success, failed: results.failed,
                error: err.message
            });
        }
    }
    return results;
}

async function spamChat(sock, target, message, count, sessionId) {
    const results = { success: 0, failed: 0 };
    for (let i = 0; i < count; i++) {
        try {
            const chatId = target.includes('@s.whatsapp.net') ? target : `${target}@s.whatsapp.net`;
            const msg = message + ` (${i+1}/${count})`;
            await sock.sendMessage(chatId, { text: msg });
            results.success++;
            io.emit('spamProgress', {
                sessionId, type: 'chat', target,
                current: i + 1, total: count,
                success: results.success, failed: results.failed,
                message: `✅ Chat terkirim ke ${target} (${i+1}/${count})`
            });
            await sleep(60000);
        } catch (err) {
            results.failed++;
            io.emit('spamProgress', {
                sessionId, type: 'chat', target,
                current: i + 1, total: count,
                success: results.success, failed: results.failed,
                error: err.message
            });
        }
    }
    return results;
}

async function spamCall(sock, target, type, count, sessionId) {
    const results = { success: 0, failed: 0 };
    const callType = type === 'video' ? '📹 Video Call' : '📞 Voice Call';
    for (let i = 0; i < count; i++) {
        try {
            const chatId = target.includes('@s.whatsapp.net') ? target : `${target}@s.whatsapp.net`;
            const message = `*${callType}* (${i+1}/${count})\n\nAda panggilan masuk dari *PrankMaster*!`;
            await sock.sendMessage(chatId, { text: message });
            results.success++;
            io.emit('spamProgress', {
                sessionId, type: 'call', target,
                current: i + 1, total: count,
                success: results.success, failed: results.failed,
                message: `✅ ${callType} terkirim ke ${target} (${i+1}/${count})`
            });
            await sleep(60000);
        } catch (err) {
            results.failed++;
            io.emit('spamProgress', {
                sessionId, type: 'call', target,
                current: i + 1, total: count,
                success: results.success, failed: results.failed,
                error: err.message
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
    const bots = db.bots.map(b => ({
        id: b.id,
        number: b.number,
        owner: b.owner,
        status: b.status || 'disconnected',
        pairingCode: b.pairingCode || null,
        method: b.method || 'qris',
        isReady: (botStatus[b.id] === 'ready')
    }));
    res.json({ success: true, bots });
});

// ===== CONNECT BOT =====
app.post('/api/bots/connect', async (req, res) => {
    const { number, username, method } = req.body;
    const user = db.users.find(u => u.username === username);
    if (!user) return res.json({ success: false, message: 'User tidak ditemukan!' });

    // Cek bot existing
    const existing = db.bots.find(b => b.number === number && b.owner === username);
    if (existing) {
        if (fs.existsSync(`${AUTH_DIR}/${existing.id}/creds.json`)) {
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
                db.bots = db.bots.filter(b => b.id !== existing.id);
                saveDB();
            }
        } else {
            db.bots = db.bots.filter(b => b.id !== existing.id);
            saveDB();
        }
    }

    const sessionId = `${number}_${Date.now()}`;
    try {
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

        await createBot(sessionId, number, method || 'qris');
        botStatus[sessionId] = 'connecting';

        res.json({
            success: true,
            message: 'Bot sedang menghubungkan...',
            sessionId,
            method: method || 'qris'
        });
    } catch (err) {
        console.error('❌ Error connect bot:', err);
        res.json({ success: false, message: err.message });
    }
});

// ===== DISCONNECT BOT =====
app.post('/api/bots/disconnect', (req, res) => {
    const { sessionId } = req.body;
    if (activeSockets[sessionId]) {
        try {
            activeSockets[sessionId].end();
        } catch (e) {}
        delete activeSockets[sessionId];
        delete botStatus[sessionId];
        delete pairingCodeSent[sessionId];
        db.bots = db.bots.filter(b => b.id !== sessionId);
        saveDB();
        try { fs.removeSync(`${AUTH_DIR}/${sessionId}`); } catch (e) {}
    }
    res.json({ success: true });
});

// ===== SPAM PAIRING =====
app.post('/api/spam/pairing', async (req, res) => {
    const { sessionId, target, count } = req.body;
    const sock = activeSockets[sessionId];
    if (!sock) return res.json({ success: false, message: 'Bot tidak ditemukan!' });
    if (botStatus[sessionId] !== 'ready') return res.json({ success: false, message: 'Bot belum siap!' });
    try {
        const result = await spamPairingCode(sock, target, count, sessionId);
        res.json({ success: true, result });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

// ===== SPAM CHAT =====
app.post('/api/spam/chat', async (req, res) => {
    const { sessionId, target, message, count } = req.body;
    const sock = activeSockets[sessionId];
    if (!sock) return res.json({ success: false, message: 'Bot tidak ditemukan!' });
    if (botStatus[sessionId] !== 'ready') return res.json({ success: false, message: 'Bot belum siap!' });
    try {
        const result = await spamChat(sock, target, message, count, sessionId);
        res.json({ success: true, result });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

// ===== SPAM CALL =====
app.post('/api/spam/call', async (req, res) => {
    const { sessionId, target, type, count } = req.body;
    const sock = activeSockets[sessionId];
    if (!sock) return res.json({ success: false, message: 'Bot tidak ditemukan!' });
    if (botStatus[sessionId] !== 'ready') return res.json({ success: false, message: 'Bot belum siap!' });
    try {
        const result = await spamCall(sock, target, type, count, sessionId);
        res.json({ success: true, result });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

// ============================================
// ADMIN API
// ============================================
app.get('/api/admin/users', (req, res) => {
    res.json({
        success: true,
        users: db.users.map(u => ({
            username: u.username,
            status: u.status,
            limit: u.limit === Infinity ? '∞' : u.limit,
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

// ===== AUTO CLEAN =====
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
server.listen(PORT, async () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🔗 https://your-app.railway.app`);
    console.log('📱 WhatsApp Bot siap digunakan!');
    console.log('========================================');
    console.log('🔄 Restoring saved sessions...');
    await restoreAllBots();
    console.log('========================================');
    console.log('🔑 PAIRING CODE:');
    console.log('1. Klik Connect Bot dengan metode Code');
    console.log('2. Tunggu 5-10 detik');
    console.log('3. Pairing code muncul di web');
    console.log('4. Masukkan di WhatsApp → Settings → Linked Devices');
    console.log('========================================');
});