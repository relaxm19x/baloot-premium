// server.js - محرك البلوت العالمي الشامل والمطور بالملي
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*", methods: ["GET", "POST"] } });
const path = require('path');

const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

let gameState = {
    deck: [],
    players: [],
    kittyCard: null,
    buyType: null,
    buyerName: null,
    floorCards: [],
    scores: { us: 0, them: 0 },
    roundScores: { usAklat: 0, themAklat: 0, usProjects: 0, themProjects: 0 },
    currentTurn: 0, // 0: south, 1: east, 2: north, 3: west
    gameLog: []
};

function initBalootGame() {
    const suits = ['♠', '♥', '♦', '♣'];
    const values = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    let d = [];
    suits.forEach(s => values.forEach(v => d.push({ suit: s, val: v })));
    gameState.deck = d.sort(() => Math.random() - 0.5);
    
    gameState.kittyCard = gameState.deck[20];
    gameState.floorCards = [];
    gameState.buyType = null;
    gameState.buyerName = null;
    gameState.currentTurn = 0;
    gameState.scores = { us: 0, them: 0 };
    gameState.roundScores = { usAklat: 0, themAklat: 0, usProjects: 0, themProjects: 0 };
    gameState.gameLog = ["🃏 تم توزيع 5 كروت وبدأت فترة الشراء.."];

    gameState.players = [
        { id: null, username: "بو محمد", pos: "south", cards: gameState.deck.slice(0, 5) },
        { id: 'bot_east', username: "خالد 🤖", pos: "east", cards: gameState.deck.slice(5, 10) },
        { id: 'bot_north', username: "مساعد 🤖", pos: "north", cards: gameState.deck.slice(10, 15) },
        { id: 'bot_west', username: "ناصر 🤖", pos: "west", cards: gameState.deck.slice(15, 20) }
    ];
}

function distributeRemaining() {
    gameState.players[0].cards = [...gameState.players[0].cards, ...gameState.deck.slice(21, 24)];
    gameState.players[1].cards = [...gameState.players[1].cards, ...gameState.deck.slice(24, 27)];
    gameState.players[2].cards = [...gameState.players[2].cards, ...gameState.deck.slice(27, 30)];
    gameState.players[3].cards = [...gameState.players[3].cards, ...gameState.deck.slice(30, 32)];
    
    // المشتري يأخذ كرت الأرض لتكتمل الـ 8 كروت لكل لاعب
    if (gameState.buyerName === "بو محمد") {
        gameState.players[0].cards.push(gameState.kittyCard);
    } else {
        gameState.players[2].cards.push(gameState.kittyCard);
    }
    gameState.gameLog.push("🎲 اكتمل توزيع 8 كروت لكل لاعب.. وبدأ اللعب بالدور!");
}

// مصفوفة ترتيب قوة الكروت في الصن لتحديد من قش اللمة
const cardPowerSon = { 'A': 11, '10': 10, 'K': 4, 'Q': 3, 'J': 2, '9': 0, '8': 0, '7': 0 };

function evaluateTrickWinner() {
    let leadSuit = gameState.floorCards[0].card.suit;
    let highestPower = -1;
    let winnerIndex = 0;

    gameState.floorCards.forEach((played, index) => {
        if (played.card.suit === leadSuit) {
            let power = cardPowerSon[played.card.val] || 0;
            if (power > highestPower) {
                highestPower = power;
                winnerIndex = index;
            }
        }
    });

    let winner = gameState.floorCards[winnerIndex];
    if (winner.pos === 'south' || winner.pos === 'north') {
        gameState.roundScores.usAklat += 14;
        gameState.scores.us += 14;
        gameState.gameLog.push(`🎉 اللمة لنا! قشها [ ${winner.player} ] لأن كرته هو الأقوى.`);
    } else {
        gameState.roundScores.themAklat += 14;
        gameState.scores.them += 14;
        gameState.gameLog.push(`🚨 اللمة لهم! قشها [ ${winner.player} ].`);
    }
}

io.on('connection', (socket) => {
    socket.on('join_baloot_table', (data) => {
        if (!gameState.players.length || gameState.players[0].id === null) {
            initBalootGame();
            gameState.players[0].id = socket.id;
            gameState.players[0].username = data.username || "بو محمد";
        }
        sendUpdatedState();
    });

    socket.on('baloot_buy_decision', (data) => {
        if (data.decision === 'بس') {
            gameState.buyType = "صن";
            gameState.buyerName = "مساعد 🤖";
            distributeRemaining();
        } else {
            gameState.buyType = data.decision;
            gameState.buyerName = "بو محمد";
            distributeRemaining();
        }
        sendUpdatedState();
    });

    socket.on('baloot_play_card', (card) => {
        if (gameState.currentTurn !== 0 || gameState.floorCards.length >= 4) return;

        // 1. رمية اللاعب الحقيقي (جنوب)
        let p = gameState.players[0];
        p.cards = p.cards.filter(c => !(c.suit === card.suit && c.val === card.val));
        gameState.floorCards.push({ card: card, player: p.username, pos: 'south' });
        
        // 2. تشغيل دور باقي اللاعبين الثلاثة بالترتيب الحقيقي (شرق ثم شمال ثم غرب)
        gameState.currentTurn = 1;
        sendUpdatedState();

        // دور شرق
        setTimeout(() => {
            let bot = gameState.players[1];
            let c = bot.cards.pop();
            gameState.floorCards.push({ card: c, player: bot.username, pos: 'east' });
            gameState.currentTurn = 2;
            sendUpdatedState();
        }, 500);

        // دور شمال (خويك)
        setTimeout(() => {
            let bot = gameState.players[2];
            let c = bot.cards.pop();
            gameState.floorCards.push({ card: c, player: bot.username, pos: 'north' });
            gameState.currentTurn = 3;
            sendUpdatedState();
        }, 1000);

        // دور غرب
        setTimeout(() => {
            let bot = gameState.players[3];
            let c = bot.cards.pop();
            gameState.floorCards.push({ card: c, player: bot.username, pos: 'west' });
            
            // حساب من الفائز باللمة الحقيقي
            evaluateTrickWinner();
            gameState.currentTurn = 0; // عودة الدور لك
            sendUpdatedState();

            // تنظيف الأرضية بعد ثانيتين لبدء اللمة التالية
            setTimeout(() => {
                gameState.floorCards = [];
                // فحص انتهاء الجولة لعرض لوحة النتائج والمشاريع النهائية
                if (gameState.players[0].cards.length === 0) {
                    gameState.roundScores.usProjects = 20; // مشروع سرا تلقائي
                    io.emit('baloot_show_summary_window', gameState.roundScores);
                }
                sendUpdatedState();
            }, 1500);
        }, 1500);
    });

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
            currentTurn: gameState.currentTurn,
            botCardCounts: {
                east: gameState.players[1] ? gameState.players[1].cards.length : 0,
                north: gameState.players[2] ? gameState.players[2].cards.length : 0,
                west: gameState.players[3] ? gameState.players[3].cards.length : 0
            }
        });
    }
});

http.listen(PORT, () => { console.log(`🚀 Baloot Server Working`); });
