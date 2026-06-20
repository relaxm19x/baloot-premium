const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*", methods: ["GET", "POST"] } });
const path = require('path');

const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

// 🤖 بنك عبارات وجمل البوتات التلقائية لجذب الزوار وملء الروم كاش
const botPhrases = [
    "يا هلا بالجميع نورتوا الديوانية الحين الحين! 🔥",
    "منو يتحداني في مباراة تيك توك اليوم؟ 👑",
    "ارحبوا يا ربع، الروم منور بوجودكم 💎",
    "مساء الخير يا أهل الخليج والديوانية الفخمة ✨",
    "شات ADD MORE Q8 صراحة قمة الفخامة والترتيب 👍"
];

const botNames = ["🤖 سعود_الخالدي", "🤖 نورة_الكويتية", "🤖 بو_فهد_الملكي"];

io.on('connection', (socket) => {
    
    // 🤖 تشغيل ضخ رسائل البوتات التلقائية كل 45 ثانية في رومات الدول
    setInterval(() => {
        let randomBot = botNames[Math.floor(Math.random() * botNames.length)];
        let randomPhrase = botPhrases[Math.floor(Math.random() * botPhrases.length)];
        let rooms = ['chat_666', 'chat_worldcup', 'room_kuwait', 'room_saudi'];
        let randomRoom = rooms[Math.floor(Math.random() * rooms.length)];
        
        io.emit('receive_global_chat_msg', {
            room: randomRoom,
            username: randomBot,
            text: randomPhrase
        });
    }, 45000);

    socket.on('send_global_chat_msg', (data) => {
        // إرسال رسالة المستخدم الحقيقي دغري
        io.emit('receive_global_chat_msg', {
            room: data.room,
            username: "بو محمد (المشرف) 👑",
            text: data.text
        });

        // 🤖 ذكاء اصطناعي تفاعلي: لو كتب المستخدم كلمة ترحيب، يرد عليه البوت فوراً لايف!
        if (data.text.includes("سلام") || data.text.includes("مرحبا") || data.text.includes("نورت")) {
            setTimeout(() => {
                io.emit('receive_global_chat_msg', {
                    room: data.room,
                    username: "🤖 نورة_الكويتية",
                    text: "وعليكم السلام والرحمة يا هلا بومحمد نورت الديوانية والمايك الحين! 🌹✨"
                });
            }, 1500);
        }
    });
});

http.listen(PORT, () => { console.log(`🚀 Server working on port ${PORT}`); });
