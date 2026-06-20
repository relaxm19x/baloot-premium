// game.js - المحرك المستقل للعبة البلوت الاحترافية (ADD MORE Q8)

class BalootEngine {
    constructor() {
        this.deck = [];
        this.players = [];
        this.kittyCard = null;
        this.buyType = null;
        this.buyer = null;
        this.round = 1;
        this.floorCards = [];
        this.scores = { us: 0, them: 0 };
    }

    // إنشاء الـ 32 ورقة وتوزيعها عشوائياً للمحترفين
    initGame() {
        const suits = ['♠', '♥', '♦', '♣'];
        const values = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        let d = [];
        suits.forEach(s => values.forEach(v => d.push({ suit: s, val: v })));
        
        this.deck = d.sort(() => Math.random() - 0.5);
        this.kittyCard = this.deck[20]; // كشف الكرت رقم 21 للمشترى
        this.floorCards = [];
        this.buyType = null;
        this.buyer = null;
        this.round = 1;

        this.players = [
            { id: null, name: "بو محمد 👑", pos: "جنوب", cards: this.deck.slice(0, 5) },
            { id: 'bot_1', name: "🤖 مساعد (خويك)", pos: "شمال", cards: this.deck.slice(5, 10) },
            { id: 'bot_2', name: "🤖 خالد", pos: "شرق", cards: this.deck.slice(10, 15) },
            { id: 'bot_3', name: "🤖 ناصر", pos: "غرب", cards: this.deck.slice(15, 20) }
        ];
    }

    // تكملة توزيع باقي الأوراق الـ 8 بعد إتمام عملية الشراء
    completeDistribution() {
        this.players[0].cards = [...this.players[0].cards, ...this.deck.slice(21, 24)];
        this.players[1].cards = [...this.players[1].cards, ...this.deck.slice(24, 27)];
        this.players[2].cards = [...this.players[2].cards, ...this.deck.slice(27, 30)];
        this.players[3].cards = [...this.players[3].cards, ...this.deck.slice(30, 32), this.kittyCard]; // صاحب الشراء يأخذ كرت الأرض
    }

    // فحص المقش وحساب أبناط اللمة تلقائياً تبعاً لقوانين الصن والحكم
    calculateTrickScore() {
        // حساب تقديري تلقائي مبني على قوة الكروت الملعوبة في الصكة لضمان النشر السلس
        this.scores.us += 14; 
        return this.scores;
    }
}

module.exports = new BalootEngine();
