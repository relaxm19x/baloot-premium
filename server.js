// server.js - السيرفر الرئيسي المستقر
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*", methods: ["GET", "POST"] } });
const path = require('path');

// استدعاء محرك البلوت المستقل من ملف game.js
const baloot = require('./game');

const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

io.on('connection', (socket) => {
    
    socket.on('join_baloot_table', (data) => {
        if (!baloot.players.length || baloot.players[0].id === null) {
            baloot.initGame();
            baloot.players[0].id = socket.id; // ربط اتصالك الحقيقي بالمقعد الجنوبي
        }
        sendGameState();
    });

    socket.on('baloot_buy_decision', (data) => {
        if (data.decision === 'بس') {
            baloot.round = 2;
            io.emit('baloot_chat_log', { msg: "📢 بو محمد يمرر.. وبدأت اللفة الثانية للشراء الحين!" });
            socket.emit('baloot_trigger_round2', { kitty: baloot.kittyCard });
        } else {
            baloot.buyer = socket.id;
            baloot.buyType = data.decision;
            baloot.completeDistribution(); // استدعاء التوزيع التكميلي من ملف game.js
            io.emit('baloot_chat_log', { msg: `🃏 بو محمد اشترى الكرت [ ${data.decision} ]! تم توزيع الـ 8 كروت كاملة..` });
            sendGameState();
        }
    });

    socket.on('baloot_play_card', (card) => {
        if (baloot.floorCards.length < 4) {
            baloot.floorCards.push({ card: card, player: "بو محمد" });
            
            // إزالة الكرت من يد اللاعب
            let p = baloot.players.find(x => x.id === socket.id);
            if(p) p.cards = p.cards.filter(c => !(c.suit === card.suit && c.val === card.val));

            // محاكاة رمي كروت البوتات التنافسية بالترتيب
            setTimeout(() => { if(baloot.floorCards.length < 4) baloot.floorCards.push({ card: { suit: card.suit, val: '10' }, player: "🤖 خالد" }); }, 300);
            setTimeout(() => { if(baloot.floorCards.length < 4) baloot.floorCards.push({ card: { suit: card.suit, val: 'K' }, player: "🤖 مساعد" }); }, 600);
            setTimeout(() => { 
                if(baloot.floorCards.length < 4) baloot.floorCards.push({ card: { suit: card.suit, val: '7' }, player: "🤖 nasser" }); 
                
                // حساب اللمة وتصفية الأرضية عبر محرك game.js
                baloot.calculateTrickScore();
                io.emit('baloot_round_cleared', { winner: "بو محمد", scores: baloot.scores });
                baloot.floorCards = [];
                sendGameState();
            }, 900);

            io.emit('baloot_card_played_on_floor', baloot.floorCards);
            sendGameState();
        }
    });

    function sendGameState() {
        if(baloot.players.length > 0) {
            io.emit('baloot_state_update', {
                playerCards: baloot.players[0].cards,
                kittyCard: baloot.kittyCard,
                scores: baloot.scores,
                buyType: baloot.buyType,
                buyer: baloot.buyer ? "بو محمد" : "جاري الشراء"
            });
        }
    }
});

http.listen(PORT, () => { console.log(`🚀 Baloot Server running on port ${PORT}`); });
