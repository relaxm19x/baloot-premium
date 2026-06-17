const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// 🌐 توجيه السيرفر لقرأة الملفات من المجلد الرئيسي مباشرة أونلاين
app.use(express.static(__dirname));

// 🎯 عند فتح الرابط الرئيسي، يتم إرسال ملف index.html فوراً للمتصفح
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ربط أحداث الصكة الجماعية بالباكيند
require('./sockets/game')(io);

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(` 🃏 صكة الملوك تعمل بنجاح دولي على المنفذ ${PORT} 🃏`);
    console.log(`==================================================`);
});
