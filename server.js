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

// توجيه الملفات الثابتة من السطح الخارجي مباشرة
app.use(express.static(__dirname));

// تشغيل أحداث السوكيت من ملف game.js الموجود في السطح مباشرة
const gameSocketInit = require('./game');
if (typeof gameSocketInit === 'function') {
    gameSocketInit(io);
}

// توجيه الرابط الرئيسي لملف index.html في السطح مباشرة
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(` 🃏 صكة الملوك تعمل بنجاح دولي على المنفذ ${PORT} 🃏`);
    console.log(`==================================================`);
});
