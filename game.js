module.exports = function(io) {
    let rooms = {};

    const cardValuesSun = { 'A': 11, '10': 10, 'K': 4, 'Q': 3, 'J': 2, '9': 0, '8': 0, '7': 0 };
    const rankOrderSun  = { 'A': 8, '10': 7, 'K': 6, 'Q': 5, 'J': 4, '9': 3, '8': 2, '7': 1 };
    
    const cardValuesTrump = { 'J': 20, '9': 14, 'A': 11, '10': 10, 'K': 4, 'Q': 3, '8': 0, '7': 0 };
    const rankOrderTrump  = { 'J': 8, '9': 7, 'A': 6, '10': 5, 'K': 4, 'Q': 3, '8': 2, '7': 1 };

    io.on('connection', (socket) => {
        
        socket.on('join_matchmaking', (data) => {
            let roomId = "1000"; 
            if (!rooms[roomId]) {
                rooms[roomId] = {
                    roomId: roomId, seats: [null, null, null, null], gameStage: 'lobby',
                    scores: { team1: 0, team2: 0 }, currentTurn: 0, buyRound: 1, buyType: null,
                    buyerSeat: null, trumpSuit: null, tableCards: [], playersCards: [[], [], [], []],
                    deck: [], leadSuit: null, roundPoints: { team1: 0, team2: 0 }, trickCount: 0,
                    activeProjects: ["", "", "", ""], playerActionsText: ["", "", "", ""], passCount: 0,
                    dealerSeat: 3, isRoundEnding: false, isDouble: false,
                    revealedProjectCards: null, // الكروت التي سيتم فرشها على الطاولة ليراها الجميع
                    nashra: { trickPoints: { t1: 0, t2: 0 }, ground: { t1: 0, t2: 0 }, projects: { t1: 0, t2: 0 }, abnat: { t1: 0, t2: 0 }, gain: { t1: 0, t2: 0 } }
                };
            }
            let room = rooms[roomId];
            let existingSeat = room.seats.findIndex(s => s && s.socketId === socket.id);
            if (existingSeat === -1) {
                let freeSeat = room.seats.findIndex(s => s === null);
                if (freeSeat !== -1) {
                    room.seats[freeSeat] = { socketId: socket.id, username: data.username || "ملك البلوت" };
                    socket.join(roomId); socket.roomId = roomId;
                }
            }
            io.to(roomId).emit('room_updated', room);
            io.to(roomId).emit('game_state_changed', room);
        });

        socket.on('start_game_with_bots', () => {
            let roomId = socket.roomId || "1000";
            setupNewRound(roomId);
        });

        function setupNewRound(roomId) {
            if (!rooms[roomId]) return;
            let room = rooms[roomId];
            
            // تحقق من سقف الفوز بـ 152 نقطة رسمياً
            if (room.scores.team1 >= 152 || room.scores.team2 >= 152) {
                let winner = room.scores.team1 >= 152 ? "الفريق الأول (لنا)" : "الفريق الثاني (لهم)";
                io.to(roomId).emit('round_ended_announcement', { summary: `🏆 صكّة ملوكية منتهية! الفائز هو: ${winner} بمجموع ${Math.max(room.scores.team1, room.scores.team2)} نقطة!`, scores: room.scores });
                room.scores = { team1: 0, team2: 0 }; // إعادة تصفير الصكة الجديدة
            }

            for (let i = 0; i < 4; i++) {
                if (!room.seats[i]) room.seats[i] = { socketId: 'bot_' + i, username: "🤖 بوت " + (i+1) };
            }
            room.gameStage = 'buying'; room.buyRound = 1; room.buyerSeat = null;
            room.buyType = null; room.trumpSuit = null; room.tableCards = []; room.trickCount = 0; room.passCount = 0;
            room.roundPoints = { team1: 0, team2: 0 }; room.activeProjects = ["", "", "", ""]; room.playerActionsText = ["", "", "", ""];
            room.isRoundEnding = false; room.isDouble = false; room.revealedProjectCards = null;
            
            room.nashra = { trickPoints: { t1: 0, t2: 0 }, ground: { t1: 0, t2: 0 }, projects: { t1: 0, t2: 0 }, abnat: { t1: 0, t2: 0 }, gain: { t1: 0, t2: 0 } };

            room.dealerSeat = (room.dealerSeat + 1) % 4;
            room.currentTurn = (room.dealerSeat + 1) % 4;

            let suits = ['♠', '♥', '♦', '♣'];
            let values = ['A', 'K', 'Q', 'J', '10', '9', '8', '7'];
            let fullDeck = [];
            suits.forEach(s => values.forEach(v => fullDeck.push({ suit: s, value: v })));
            fullDeck.sort(() => Math.random() - 0.5);
            room.flipCard = fullDeck.pop();

            for (let i = 0; i < 4; i++) room.playersCards[i] = [fullDeck.pop(), fullDeck.pop(), fullDeck.pop(), fullDeck.pop(), fullDeck.pop()];
            room.deck = fullDeck;

            io.to(roomId).emit('room_updated', room);
            io.to(roomId).emit('game_state_changed', room);

            setTimeout(() => { checkAndRunBotBuying(room, roomId); }, 600);
        }

        socket.on('player_buy_decision', (data) => {
            let roomId = socket.roomId || "1000"; let room = rooms[roomId]; 
            if (!room || room.currentTurn !== data.seatIndex || (room.gameStage !== 'buying' && room.gameStage !== 'double_round')) return;

            if (room.gameStage === 'double_round') {
                if (data.decision === 'double') {
                    room.isDouble = true; room.playerActionsText[data.seatIndex] = "⚔️ دبل الحظر!";
                } else {
                    room.playerActionsText[data.seatIndex] = "بس 🛡️";
                }
                executeBuyTransition(room, roomId, room.buyType, room.buyerSeat);
                return;
            }

            if (data.decision === 'buy') {
                room.buyerSeat = data.seatIndex; room.buyType = data.buyType;
                
                if (data.buyType === 'أشكل') {
                    room.buyType = 'صن (أشكل)'; room.trumpSuit = null;
                    room.playerActionsText[data.seatIndex] = "👑 طلب: أشكل";
                    executeBuyTransition(room, roomId, 'أشكل', data.seatIndex);
                } else if (data.buyType === 'حكم ثاني') {
                    room.trumpSuit = room.flipCard.suit === '♠' ? '♥' : '♠'; 
                    room.playerActionsText[data.seatIndex] = "طلب: حكم ثاني";
                    triggerDoubleStage(room, roomId, data.seatIndex);
                } else if (data.buyType === 'حكم') {
                    room.trumpSuit = room.flipCard.suit;
                    room.playerActionsText[data.seatIndex] = "طلب: حكم 🃏";
                    triggerDoubleStage(room, roomId, data.seatIndex);
                } else {
                    room.trumpSuit = null;
                    room.playerActionsText[data.seatIndex] = "طلب: صن 🚀";
                    executeBuyTransition(room, roomId, 'صن', data.seatIndex);
                }
            } else {
                room.playerActionsText[room.currentTurn] = room.buyRound === 2 ? "ولا 🚫" : "بس 🛡️"; 
                room.passCount++;
                
                if (room.passCount >= 8) {
                    io.to(roomId).emit('round_ended_announcement', { summary: "🔄 الكل قال (ولا)! إعادة التوزيع من جديد...", scores: room.scores });
                    setTimeout(() => { setupNewRound(roomId); }, 2000); return;
                }
                
                room.currentTurn = (room.currentTurn + 1) % 4;
                if (room.passCount === 4) room.buyRound = 2;
                
                io.to(roomId).emit('game_state_changed', room);
                setTimeout(() => { checkAndRunBotBuying(room, roomId); }, 400);
            }
        });

        function triggerDoubleStage(room, roomId, buyerSeat) {
            room.gameStage = 'double_round'; room.currentTurn = (buyerSeat + 1) % 4; 
            io.to(roomId).emit('game_state_changed', room);
            
            let activePlayer = room.seats[room.currentTurn];
            if (activePlayer && activePlayer.socketId.startsWith('bot_')) {
                setTimeout(() => {
                    if (Math.random() > 0.65) {
                        room.isDouble = true; room.playerActionsText[room.currentTurn] = "⚔️ دبل الحظر!";
                    } else {
                        room.playerActionsText[room.currentTurn] = "بس 🛡️";
                    }
                    executeBuyTransition(room, roomId, room.buyType, buyerSeat);
                }, 700);
            }
        }

        function checkAndRunBotBuying(room, roomId) {
            if (room.gameStage !== 'buying') return;
            let activePlayer = room.seats[room.currentTurn];
            if (!activePlayer || !activePlayer.socketId.startsWith('bot_')) return;

            if (room.buyRound === 2 && (room.currentTurn === room.dealerSeat || room.currentTurn === (room.dealerSeat + 1) % 4)) {
                if (Math.random() > 0.7) {
                    room.buyerSeat = room.currentTurn; room.buyType = 'أشكل'; room.trumpSuit = null;
                    room.playerActionsText[room.currentTurn] = "👑 طلب: أشكل";
                    executeBuyTransition(room, roomId, 'أشكل', room.currentTurn);
                    return;
                }
            }

            if (room.flipCard && (room.flipCard.value === 'A' || room.flipCard.value === 'J')) {
                room.buyerSeat = room.currentTurn; 
                room.buyType = (room.flipCard.value === 'J') ? 'حكم' : 'صن';
                room.trumpSuit = (room.buyType === 'حكم') ? room.flipCard.suit : null;
                room.playerActionsText[room.currentTurn] = `طلب: ${room.buyType}`;
                
                if (room.buyType === 'حكم') {
                    triggerDoubleStage(room, roomId, room.currentTurn);
                } else {
                    executeBuyTransition(room, roomId, room.buyType, room.currentTurn);
                }
            } else {
                room.playerActionsText[room.currentTurn] = room.buyRound === 2 ? "ولا 🚫" : "بس 🛡️"; 
                room.passCount++;
                if (room.passCount >= 8) { setupNewRound(roomId); return; }
                room.currentTurn = (room.currentTurn + 1) % 4;
                if (room.passCount === 4) room.buyRound = 2;
                io.to(roomId).emit('game_state_changed', room);
                setTimeout(() => { checkAndRunBotBuying(room, roomId); }, 400);
            }
        }

        function executeBuyTransition(room, roomId, buyType, buyerIndex) {
            room.gameStage = 'playing';
            for(let i=0; i<4; i++) { 
                if (!room.playerActionsText[i].includes("طلب") && !room.playerActionsText[i].includes("دبل")) {
                    room.playerActionsText[i] = ""; 
                }
            }
            let savedFlipCard = room.flipCard; room.flipCard = null;

            let cardReceiver = buyerIndex;
            if (buyType === 'أشكل' || buyType.includes('أشكل')) cardReceiver = (buyerIndex + 2) % 4;

            for (let i = 0; i < 4; i++) {
                if (i === cardReceiver) {
                    room.playersCards[i].push(savedFlipCard);
                    room.playersCards[i].push(room.deck.pop()); room.playersCards[i].push(room.deck.pop());
                } else if (i === buyerIndex && (buyType === 'أشكل' || buyType.includes('أشكل'))) {
                    room.playersCards[i].push(room.deck.pop()); room.playersCards[i].push(room.deck.pop()); room.playersCards[i].push(room.deck.pop());
                } else {
                    room.playersCards[i].push(room.deck.pop()); room.playersCards[i].push(room.deck.pop()); room.playersCards[i].push(room.deck.pop());
                }
            }

            // تفعيل فحص البوتات الذكي للمشاريع الفخمة (سرا، خمسين، مئة، أربعمئة، بلوت تلقائي)
            for (let i = 1; i < 4; i++) {
                if (Math.random() > 0.65) { 
                    let botProj = Math.random() > 0.7 ? "خمسين" : "سرا";
                    room.activeProjects[i] = botProj;
                    let pts = botProj === "سرا" ? 20 : 50;
                    if (i === 2) room.nashra.projects.t1 += pts; else room.nashra.projects.t2 += pts;
                }
            }

            room.currentTurn = (room.dealerSeat + 1) % 4;
            io.to(roomId).emit('game_state_changed', room);
            if (room.seats[room.currentTurn].socketId.startsWith('bot_')) setTimeout(() => { makeAdvancedBotPlay(room, roomId); }, 500);
        }

        socket.on('declare_project_attempt', (data) => {
            let roomId = socket.roomId || "1000"; let room = rooms[roomId]; if (!room) return;
            if (data.projectType !== 'لا شيء') {
                room.activeProjects[data.seatIndex] = data.projectType;
                let pts = (data.projectType === 'سرا') ? 20 : (data.projectType === 'خمسين') ? 50 : (data.projectType === '100') ? 100 : 400;
                if (data.seatIndex === 0 || data.seatIndex === 2) room.nashra.projects.t1 += pts; else room.nashra.projects.t2 += pts;
            }
            io.to(roomId).emit('game_state_changed', room);
        });

        socket.on('play_card', (data) => {
            let roomId = socket.roomId || "1000"; let room = rooms[roomId]; 
            if (!room || room.currentTurn !== data.seatIndex || room.gameStage !== 'playing' || room.isRoundEnding) return;

            let hand = room.playersCards[data.seatIndex];
            let reqCard = data.card; if (!reqCard) return;

            let idx = hand.findIndex(c => c.suit === reqCard.suit && c.value === reqCard.value);
            if (idx === -1) return; 

            let chosenCard = hand[idx]; hand.splice(idx, 1); 

            // 🎯 كود كشف وفرش المشروع الأكبر للجميع في اللمة الثانية كملنا بالملي:
            if (room.trickCount === 1 && room.tableCards.length === 0) {
                let bestSeat = -1; let maxPts = 0;
                const projWeights = { "أربعمئة": 400, "100": 100, "خمسين": 50, "سرا": 20 };
                for (let i = 0; i < 4; i++) {
                    let w = projWeights[room.activeProjects[i]] || 0;
                    if (w > maxPts) { maxPts = w; bestSeat = i; }
                }
                
                if (bestSeat !== -1) {
                    // السيرفر يفرش كروت وهمية للمشروع لـ 3 ثوانٍ على الطاولة ثم يمسحها تلقائياً لتنظيف الشاشة
                    room.revealedProjectCards = { seatIndex: bestSeat, text: room.activeProjects[bestSeat] };
                    io.to(roomId).emit('game_state_changed', room);
                    setTimeout(() => {
                        room.revealedProjectCards = null;
                        for(let i=0; i<4; i++) room.playerActionsText[i] = ""; // مسح النصوص تماماً لتنظيف اللمات التالية
                        io.to(roomId).emit('game_state_changed', room);
                    }, 3000);
                }
            }

            if (room.tableCards.length === 0) { 
                for(let i=0; i<4; i++) {
                    if (room.trick
