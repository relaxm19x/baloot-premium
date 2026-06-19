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
                    activeProjects: ["", "", "", ""], playerActionsText: ["", "", "", ""], passCount: 0
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
            for (let i = 0; i < 4; i++) {
                if (!room.seats[i]) room.seats[i] = { socketId: 'bot_' + i, username: "🤖 بوت " + (i+1) };
            }
            room.gameStage = 'buying'; room.buyRound = 1; room.currentTurn = 0; room.buyerSeat = null;
            room.buyType = null; room.trumpSuit = null; room.tableCards = []; room.trickCount = 0; room.passCount = 0;
            room.roundPoints = { team1: 0, team2: 0 }; room.activeProjects = ["", "", "", ""]; room.playerActionsText = ["", "", "", ""];

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
        }

        socket.on('player_buy_decision', (data) => {
            let roomId = socket.roomId || "1000"; let room = rooms[roomId]; if (!room || room.currentTurn !== data.seatIndex) return;

            if (data.decision === 'buy') {
                room.buyerSeat = data.seatIndex; room.buyType = data.buyType;
                room.trumpSuit = (data.buyType === 'حكم' || data.buyType === 'أشكل') ? room.flipCard.suit : null;
                room.playerActionsText[data.seatIndex] = `طلب: ${data.buyType}`;
                executeBuy(room, roomId, data.buyType, data.seatIndex);
            } else {
                room.playerActionsText[room.currentTurn] = "بس 🛡️"; room.passCount++;
                if (room.passCount >= 8) {
                    io.to(roomId).emit('round_ended_announcement', { summary: "🔄 الكل بس! إعادة التوزيع...", scores: room.scores });
                    setTimeout(() => { setupNewRound(roomId); }, 2000); return;
                }
                room.currentTurn = (room.currentTurn + 1) % 4;
                if (room.passCount === 4) room.buyRound = 2;
                io.to(roomId).emit('game_state_changed', room);
                checkAndRunBotBuying(room, roomId);
            }
        });

        function checkAndRunBotBuying(room, roomId) {
            if (room.gameStage !== 'buying') return;
            let activePlayer = room.seats[room.currentTurn];
            if (activePlayer && activePlayer.socketId.startsWith('bot_')) {
                setTimeout(() => {
                    if (room.flipCard && (room.flipCard.value === 'A' || room.flipCard.value === 'J')) {
                        room.buyerSeat = room.currentTurn; room.buyType = (room.flipCard.value === 'J') ? 'حكم' : 'صن';
                        room.trumpSuit = (room.buyType === 'حكم') ? room.flipCard.suit : null;
                        room.playerActionsText[room.currentTurn] = `طلب: ${room.buyType}`;
                        executeBuy(room, roomId, room.buyType, room.currentTurn);
                    } else {
                        room.playerActionsText[room.currentTurn] = "بس 🛡️"; room.passCount++;
                        if (room.passCount >= 8) { setupNewRound(roomId); return; }
                        room.currentTurn = (room.currentTurn + 1) % 4;
                        if (room.passCount === 4) room.buyRound = 2;
                        io.to(roomId).emit('game_state_changed', room);
                        checkAndRunBotBuying(room, roomId);
                    }
                }, 600);
            }
        }

        // 🎯 إصلاح دالة الشراء: المشتري يأخذ ورقة الأرض رسمياً وكرته يصير باليد!
        function executeBuy(room, roomId, buyType, buyerIndex) {
            room.gameStage = 'playing';
            for(let i=0; i<4; i++) { if(room.playerActionsText[i] === "بس 🛡️") room.playerActionsText[i] = ""; }
            
            let savedFlipCard = room.flipCard; 
            room.flipCard = null;

            for (let i = 0; i < 4; i++) {
                if (i === buyerIndex) {
                    // المشتري ياخذ كرت الأرض + كرتين من السطحة
                    room.playersCards[i].push(savedFlipCard);
                    room.playersCards[i].push(room.deck.pop());
                    room.playersCards[i].push(room.deck.pop());
                } else {
                    // الباقي ياخذون 3 كروت من السطحة دغري
                    room.playersCards[i].push(room.deck.pop());
                    room.playersCards[i].push(room.deck.pop());
                    room.playersCards[i].push(room.deck.pop());
                }
            }
            room.currentTurn = 0;
            io.to(roomId).emit('game_state_changed', room);
            if (room.seats[room.currentTurn].socketId.startsWith('bot_')) makeAdvancedBotPlay(room, roomId);
        }

        socket.on('declare_project_attempt', (data) => {
            let roomId = socket.roomId || "1000"; let room = rooms[roomId]; if (!room) return;
            if (data.projectType !== 'لا شيء') {
                room.activeProjects[data.seatIndex] = data.projectType;
                room.playerActionsText[data.seatIndex] = `مشروع: ${data.projectType}`;
                let pts = (data.projectType === 'سرا') ? 4 : (data.projectType === 'خمسين') ? 10 : 20;
                if (data.seatIndex === 0 || data.seatIndex === 2) room.roundPoints.team1 += pts; else room.roundPoints.team2 += pts;
            }
            io.to(roomId).emit('game_state_changed', room);
        });

        socket.on('play_card', (data) => {
            let roomId = socket.roomId || "1000"; let room = rooms[roomId]; if (!room || room.currentTurn !== data.seatIndex) return;
            if (room.tableCards.length === 0) { for(let i=0; i<4; i++) room.playerActionsText[i] = ""; room.leadSuit = data.card.suit; }
            room.tableCards.push({ seatIndex: data.seatIndex, card: data.card });
            room.playersCards[data.seatIndex] = room.playersCards[data.seatIndex].filter(c => !(c.suit === data.card.suit && c.value === data.card.value));
            io.to(roomId).emit('game_state_changed', room);
            if (room.tableCards.length === 4) handleTrickCompletion(room, roomId);
            else { room.currentTurn = (room.currentTurn + 1) % 4; io.to(roomId).emit('game_state_changed', room); checkAndRunBotGameplay(roomId); }
        });

        function handleTrickCompletion(room, roomId) {
            setTimeout(() => {
                let bestCard = null;
                room.tableCards.forEach(item => {
                    let score = (item.card.suit === room.leadSuit) ? 10 : 0;
                    if (bestCard === null || score > bestCard.score) bestCard = { score: score, seatIndex: item.seatIndex };
                });
                room.trickCount++; room.tableCards = []; room.leadSuit = null; room.currentTurn = bestCard.seatIndex;
                if (room.trickCount === 8) setupNewRound(roomId); else { io.to(roomId).emit('game_state_changed', room); checkAndRunBotGameplay(roomId); }
            }, 1500);
        }

        function checkAndRunBotGameplay(roomId) {
            let room = rooms[roomId]; if (!room || room.gameStage !== 'playing' || room.tableCards.length >= 4) return;
            if (room.seats[room.currentTurn].socketId.startsWith('bot_')) setTimeout(() => { makeAdvancedBotPlay(room, roomId); }, 600);
        }

        function makeAdvancedBotPlay(room, roomId) {
            let hand = room.playersCards[room.currentTurn]; if (!hand || hand.length === 0) return;
            let chosenCard = hand[0];
            if (room.leadSuit) {
                let match = hand.filter(c => c.suit === room.leadSuit); if (match.length > 0) chosenCard = match[0];
            }
            room.tableCards.push({ seatIndex: room.currentTurn, card: chosenCard });
            room.playersCards[room.currentTurn] = hand.filter(c => !(c.suit === chosenCard.suit && c.value === chosenCard.value));
            if (room.tableCards.length === 1) room.leadSuit = chosenCard.suit;
            io.to(roomId).emit('game_state_changed', room);
            if (room.tableCards.length === 4) handleTrickCompletion(room, roomId);
            else { room.currentTurn = (room.currentTurn + 1) % 4; io.to(roomId).emit('game_state_changed', room); checkAndRunBotGameplay(roomId); }
        }

        socket.on('deliver_hospitality', (data) => {
            let room = rooms[socket.roomId || "1000"]; if (!room) return;
            let s = room.seats[data.fromSeat]; let r = room.seats[data.toSeat];
            if (s && r) io.to(room.roomId).emit('hospitality_broadcast', { senderName: s.username, receiverName: r.username, item: data.item });
        });
    });
};
