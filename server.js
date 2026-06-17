const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const logger = require('./config/logger');

// تحميل متغيرات البيئة من ملف `env` في جذر المشروع
require('dotenv').config({ path: path.join(__dirname, 'env') });

// استيراد إعدادات قاعدة البيانات ومحرك البلوت
const connectDB = require('./config/db');
const { createDeck, shuffleDeck, dealInitialCards } = require('./engines/balootEngine');

const app = express();
const server = http.createServer(app);

// إعداد الـ CORS للسوكيت
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

// === تخطي قاعدة البيانات مؤقتاً لضمان الإقلاع الفوري والمستقر محلياً ===
// connectDB(); 

// Middlewares
app.use(cors());
app.use(express.json());

// === ربط المسارات البرمجية (APIs) ===
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

const adminRoutes = require('./routes/admin');
app.use('/api/admin', adminRoutes);

// إجبار السيرفر على قراءة ملف index.html المحدث والفاخر من المجلد الرئيسي
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// مسار لوحة الإدارة
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// تحميل أحداث السوكيت وإدارة صكة البلوت
require('./sockets/game')(io);

// === إجبار السيرفر على العمل على المنفذ 5001 الصارم وتجنب أي تعارض ===
const PORT = 5001;
server.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`  🃏 السيرفر يعمل بنجاح قاطع وثابت على المنفذ 5001 🃏`);
    console.log(`  🔗 افتح الرابط التالي: http://127.0.0.1:5001`);
    console.log(`==================================================`);
});