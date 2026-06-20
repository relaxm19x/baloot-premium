const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*", methods: ["GET", "POST"] } });
const path = require('path');

const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

// إنشاء الطاولة الافتراضية للبلوت
let balootTable = {
    players: [],
    deck: [],
    currentTurn: 0,
    scores: { us: 0, them: 0 },
    gameType: 'صن', // أو حكم
    floorCards: []
};

// إنشاء ورق البلوت (32 ورقة)
function createBalootDeck() {
    const suits = ['♠', '♥', '♦', '♣'];
    const values = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    let deck = [];
    for (let suit of suits) {
        for (let val of values) {
            deck.push({ suit, val });
        }
    }
    return deck.sort(() => Math.random() - 0.5);
}

io.on('connection', (socket) => {
    console.log('🟢 لاعب دخل طاولة البلوت');

    socket.on('join_baloot_table', (data) => {
        // إذا كانت الطاولة فارغة، نوزع الورق ونملأ المقاعد ببوتات محترفة فوراً حتى لا ينتظر الزائر
        if (balootTable.players.length === 0) {
            balootTable.deck = createBalootDeck();
            balootTable.players = [
                { id: socket.id, name: data.username || "بو محمد", position: "جنوب", cards: balootTable.deck.slice(0, 5) },
                { id: 'bot_1', name: "🤖 مساعد (بوت)", position: "شمال", cards: balootTable.deck.slice(5, 10) },
                { id: 'bot_2', name: "🤖 خالد (بوت)", position: "شرق", cards: balootTable.deck.slice(10, 15) },
                { id: 'bot_3', name: "🤖 ناصر (بوت)", position: "غرب", cards: balootTable.deck.slice(15, 20) }
            ];
        }
        
        // إرسال حالة الطاولة والورق الخاص باللاعب دغري
        socket.emit('baloot_state_update', {
            playerCards: balootTable.players[0].cards,
            allPlayers: balootTable.players.map(p => ({ name: p.name, position: p.position })),
            scores: balootTable.scores,
            gameType: balootTable.gameType
        });
    });

    // كرت الملعوبة
    socket.on('baloot_play_card', (card) => {
        if (balootTable.floorCards.length < 4) {
            balootTable.floorCards.push({ card: card, player: "بو محمد" });
            io.emit('baloot_card_played_on_floor', balootTable.floorCards);
            
            // محاكاة سريعة ومحترفة للبوتات لترمى ورقها تلقائياً بالترتيب
            setTimeout(() => {
                balootTable.floorCards.push({ card: { suit: '♠', val: 'A' }, player: "🤖 مساعد" });
                io.emit('baloot_card_played_on_floor', balootTable.floorCards);
            }, 800);
        }
    });

    socket.on('disconnect', () => { balootTable.players = []; balootTable.floorCards = []; });
});

http.listen(PORT, () => { console.log(`🚀 Baloot Engine Working on Port ${PORT}`); });
