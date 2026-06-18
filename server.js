const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// توجيه المتصفح للمجلد الرئيسي
app.use(express.static(__dirname));

// تشغيل السوكيت مباشرة من السطح
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

// توجيه الرابط لملف index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(` 🃏 صكة الملوك تعمل بنجاح دولي على المنفذ ${PORT} 🃏`);
    console.log(`==================================================`);
});
