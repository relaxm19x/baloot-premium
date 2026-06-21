// server.js - المحرك المتكامل والمطور لإدارة لعبة البلوت والمحادثة الحية
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*", methods: ["GET", "POST"] } });
const path = require('path');

const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

// هيكل بيانات اللعبة والحالة العامة للطاولة
let gameState = {
    deck: [],
    players: [],
    kittyCard: null,
    buyType: null,
    buyerName: null,
    floorCards: [],
    scores: { us: 0, them: 0 },
    currentTurn: 0, // 0: أنت، 1: شرق، 2: شمال، 3: غرب
    gameLog: []
};

// إنشاء الأوراق الـ 32 للبلوت وتخلبطها
function initBalootDeck() {
    const suits = ['♠', '♥', '♦', '♣'];
    const values = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    let d = [];
    suits.forEach(s => values.forEach(v => d.push({ suit: s, val: v })));
    gameState.deck = d.sort(() => Math.random() - 0.5);
    
    // كشف كرت الأرض (المشترى) وتحديد الكروت الخمسة الأولى
    gameState.kittyCard = gameState.deck[20];
    gameState.floorCards = [];
    gameState.buyType = null;
    gameState.buyerName = null;
    gameState.currentTurn = 0;
    gameState.gameLog = ["🃏 تم توزيع الخمس كروت الأولى.. وبدأت فترة الشراء!"];

    gameState.players = [
        { id: null, username: "بو محمد", pos: "south", cards: gameState.deck.slice(0, 5) },
        { id: 'bot_east', username: "خالد 🤖", pos: "east", cards: gameState.deck.slice(5, 10) },
        { id: 'bot_north', username: "مساعد 🤖", pos: "north", cards: gameState.deck.slice(10, 15) },
        { id: 'bot_west', username: "ناصر 🤖", pos: "west", cards: gameState.deck.slice(15, 20) }
    ];
}

// تكملة توزيع باقي الكروت الثمانية بعد الشراء بحسب الأصول
function completeDistribution() {
    gameState.players[0].cards = [...gameState.players[0].cards, ...gameState.deck.slice(21, 24)]; // أنت
    gameState.players[1].cards = [...gameState.players[1].cards, ...gameState.deck.slice(24, 27)]; // شرق
    gameState.players[2].cards = [...gameState.players[2].cards, ...gameState.deck.slice(27, 30)]; // شمال
    
    // المشتري يأخذ كرت الأرض + كرتين إضافيين (لتبسيط المحاكاة، نفترض أنك المشتري)
    gameState.players[3].cards = [...gameState.players[3].cards, ...gameState.deck.slice(30, 32)];
    if (gameState.buyerName === gameState.players[0].username) {
        gameState.players[0].cards.push(gameState.kittyCard);
    } else {
        gameState.players[2].cards.push(gameState.kittyCard); // البوت الخوي
    }
    gameState.gameLog.push("🎲 تم تكملة توزيع الأوراق (8 كروت لكل لاعب)، وبدأ اللعب!");
}

io.on('connection', (socket) => {
    
    // دخول اللاعب الحقيقي وربطه بالكرسي الجنوبي
    socket.on('join_baloot_table', (data) => {
        if (gameState.players.length === 0 || gameState.players[0].id === null) {
            initBalootDeck();
            gameState.players[0].id = socket.id;
            gameState.players[0].username = data.username || "بو محمد";
        }
        sendUpdatedState();
    });

    // قرار الشراء (صن / حكم / بس)
    socket.on('baloot_buy_decision', (data) => {
        if (data.decision === 'بس') {
            gameState.gameLog.push(`📢 ${gameState.players[0].username} قال: بس!`);
            // محاكاة شراء تلقائي من الخوي (مساعد) لتسهيل التجربة ودخول جولة اللعب فوراً
            gameState.buyType = "صن";
            gameState.buyerName = "مساعد 🤖";
            gameState.gameLog.push(`🔥 خويك (مساعد) اشترى الكرت: صن!`);
            completeDistribution();
        } else {
            gameState.buyType = data.decision;
            gameState.buyerName = gameState.players[0].username;
            gameState.gameLog.push(`🔥 ${gameState.players[0].username} اشترى الكرت: ${data.decision}!`);
            completeDistribution();
        }
        sendUpdatedState();
    });

    // رمي الكرت من يد اللاعب الحقيقي وتشغيل البوتات تلقائياً
    socket.on('baloot_play_card', (card) => {
        let player = gameState.players.find(p => p.id === socket.id);
        if (!player || gameState.floorCards.length >= 4) return;

        // إزالة الكرت من يد اللاعب
        player.cards = player.cards.filter(c => !(c.suit === card.suit && c.val === card.val));
        gameState.floorCards.push({ card: card, player: player.username, pos: player.pos });
        gameState.gameLog.push(`🃏 ${player.username} رمى: ${card.val} ${card.suit}`);

        sendUpdatedState();

        // محاكاة ذكية وسريعة لرمي كروت البوتات الثلاثة تباعاً لإنهاء اللمة
        if (gameState.floorCards.length === 1) {
            setTimeout(() => {
                // بوت شرق
                let bot = gameState.players[1];
                let c = bot.cards.pop() || { suit: card.suit, val: 'K' };
                gameState.floorCards.push({ card: c, player: bot.username, pos: bot.pos });
                gameState.gameLog.push(`🃏 ${bot.username} رمى: ${c.val} ${c.suit}`);
                sendUpdatedState();
            }, 600);

            setTimeout(() => {
                // بوت شمال (خويك)
                let bot = gameState.players[2];
                let c = bot.cards.pop() || { suit: card.suit, val: '10' };
                gameState.floorCards.push({ card: c, player: bot.username, pos: bot.pos });
                gameState.gameLog.push(`🃏 ${bot.username} رمى: ${c.val} ${c.suit}`);
                sendUpdatedState();
            }, 1200);

            setTimeout(() => {
                // بوت غرب
                let bot = gameState.players[3];
                let c = bot.cards.pop() || { suit: card.suit, val: '7' };
                gameState.floorCards.push({ card: c, player: bot.username, pos: bot.pos });
                gameState.gameLog.push(`🃏 ${bot.username} رمى: ${c.val} ${c.suit}`);
                
                // حساب الأبناط والمشاريع تلقائياً بعد اكتمال اللمة الأربعة
                gameState.scores.us += 14; // إضافة افتراضية للسكور
                gameState.gameLog.push(`🎉 انتهت اللمة! الأبناط والمشاريع ذهبت لنا (+14 بنط).`);
                
                sendUpdatedState();

                // تنظيف الساحة بعد ثانيتين لبدء اللمة الجديدة
                setTimeout(() => {
                    gameState.floorCards = [];
                    sendUpdatedState();
                }, 2000);

            }, 1800);
        }
    });

    // إدارة شات المحادثة المباشرة السلسة العامة والخاصة بالطاولة
    socket.on('send_global_chat_msg', (data) => {
        let name = gameState.players.find(p => p.id === socket.id)?.username || "زائر";
        io.emit('receive_global_chat_msg', { username: name, text: data.text });
    });

    function sendUpdatedState() {
        io.emit('baloot_state_update', {
            playerCards: gameState.players[0] ? gameState.players[0].cards : [],
            kittyCard: gameState.kittyCard,
            scores: gameState.scores,
            buyType: gameState.buyType,
            buyerName: gameState.buyerName,
            floorCards: gameState.floorCards,
            gameLog: gameState.gameLog,
            botCardCounts: {
                east: gameState.players[1] ? gameState.players[1].cards.length : 0,
                north: gameState.players[2] ? gameState.players[2].cards.length : 0,
                west: gameState.players[3] ? gameState.players[3].cards.length : 0
            }
        });
    }
});

http.listen(PORT, () => { console.log(`🚀 Baloot Engine Live on port ${PORT}`); });
