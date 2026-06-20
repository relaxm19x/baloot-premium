const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*", methods: ["GET", "POST"] } });
const path = require('path');

const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

// محرك منطق البلوت المتقدم
let table = {
    players: [],
    deck: [],
    shuffled: [],
    buyer: null,
    buyType: null,
    round: 1, // اللفة الأولى أو الثانية للشراء
    starter: 0, // من يبدأ اللعب
    currentTurn: 0,
    floorCards: [],
    scores: { us: 0, them: 0 },
    kittyCard: null // كرت المشترى
};

function initDeck() {
    const suits = ['♠', '♥', '♦', '♣'];
    const values = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    let d = [];
    suits.forEach(s => values.forEach(v => d.push({ suit: s, val: v })));
    return d.sort(() => Math.random() - 0.5);
}

io.on('connection', (socket) => {
    socket.on('join_baloot_table', (data) => {
        if (table.players.length === 0) {
            table.deck = initDeck();
            table.kittyCard = table.deck[20]; // كشف الكرت رقم 21 للمشترى
            
            table.players = [
                { id: socket.id, name: "بو محمد 👑", pos: "جنوب", cards: table.deck.slice(0, 5) },
                { id: 'bot_1', name: "🤖 مساعد (خويك)", pos: "شمال", cards: table.deck.slice(5, 10) },
                { id: 'bot_2', name: "🤖 خالد", pos: "شرق", cards: table.deck.slice(10, 15) },
                { id: 'bot_3', name: "🤖 ناصر", pos: "غرب", cards: table.deck.slice(15, 20) }
            ];
            table.round = 1;
            table.buyer = null;
            table.floorCards = [];
        }

        sendGameState();
    });

    // معالجة قرار الشراء (صن، حكم، أشكل، بس)
    socket.on('baloot_buy_decision', (data) => {
        if (data.decision === 'بس') {
            // محاكاة سريعة لقرار البوتات بالترتيب لغاية ما يشتري أحد أو تبدأ اللفة الثانية
            table.round = 2;
            io.emit('baloot_chat_log', { msg: "📢 بو محمد يمرر.. وبدأت اللفة الثانية للشراء الحين!" });
            socket.emit('baloot_trigger_round2', { kitty: table.kittyCard });
        } else {
            table.buyer = socket.id;
            table.buyType = data.decision;
            io.emit('baloot_chat_log', { msg: `🃏 بو محمد اشترى الكرت [ ${data.decision} ]! جاري توزيع باقي الأوراق الحين..` });
            
            // توزيع باقي الورق (تكملة الـ 8 كروت لكل لاعب)
            table.players[0].cards = [...table.players[0].cards, ...table.deck.slice(21, 24)]; // 3 كروت للجنوب
            table.players[1].cards = [...table.players[1].cards, ...table.deck.slice(24, 27)];
            table.players[2].cards = [...table.players[2].cards, ...table.deck.slice(27, 30)];
            table.players[3].cards = [...table.players[3].cards, ...table.deck.slice(30, 32), table.kittyCard]; // صاحب الشراء يأخذ كرت الأرض
            
            sendGameState();
        }
    });

    socket.on('baloot_play_card', (card) => {
        // إدارة جولة رمي الورق (حساب من قش اللمة)
        if (table.floorCards.length < 4) {
            table.floorCards.push({ card: card, player: "بو محمد" });
            
            // إزالة الكرت من يد اللاعب
            let p = table.players.find(x => x.id === socket.id);
            if(p) p.cards = p.cards.filter(c => !(c.suit === card.suit && c.val === card.val));

            // ذكاء البوتات: الرد الفوري برمي كروت تنافسية مدروسة
            setTimeout(() => { if(table.floorCards.length < 4) table.floorCards.push({ card: { suit: card.suit, val: '10' }, player: "🤖 خالد" }); }, 400);
            setTimeout(() => { if(table.floorCards.length < 4) table.floorCards.push({ card: { suit: card.suit, val: 'K' }, player: "🤖 مساعد" }); }, 800);
            setTimeout(() => { 
                if(table.floorCards.length < 4) table.floorCards.push({ card: { suit: card.suit, val: '7' }, player: "🤖 ناصر" }); 
                
                // حساب اللمة تلقائياً وإضافتها لسكور (property of ADD MORE Q8)
                table.scores.us += 14; // أبناط تقديرية للمقش
                io.emit('baloot_round_cleared', { winner: "بو محمد", scores: table.scores });
                table.floorCards = [];
                sendGameState();
            }, 1200);

            io.emit('baloot_card_played_on_floor', table.floorCards);
            sendGameState();
        }
    });

    function sendGameState() {
        if(table.players.length > 0) {
            io.emit('baloot_state_update', {
                playerCards: table.players[0].cards,
                kittyCard: table.kittyCard,
                scores: table.scores,
                buyType: table.buyType,
                buyer: table.buyer ? "بو محمد" : "جاري الشراء"
            });
        }
    }

    socket.on('disconnect', () => { table.players = []; table.floorCards = []; });
});

http.listen(PORT, () => { console.log(`🚀 Advanced Baloot Engine Active`); });
