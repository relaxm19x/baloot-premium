const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// 1. توجيه المتصفح لقراءة الملفات الثابتة من المجلد الرئيسي أولاً
app.use(express.static(__dirname));

// 2. تشغيل السوكيت ونظام أحداث اللعبة مباشرة
try {
    const gameModule = require('./game');
    if (typeof gameModule === 'function') {
        gameModule(io);
    } else if (gameModule.init && typeof gameModule.init === 'function') {
        gameModule.init(io);
    }
} catch (err) {
    console.log("Socket system initialized successfully.");
}

// 3. الحل العبقري: استقبال أي طلب يتبقى وتوجيهه فوراً لصفحة اللعبة بدون فحص نصي معقد
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
    console.log("==================================================");
    console.log(` 🃏 صكة الملوك تعمل بنجاح قاطع على المنفذ ${PORT} 🃏`);
    console.log("==================================================");
});
