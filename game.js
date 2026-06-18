module.exports = function(io) {
    let rooms = {};

    // 🃏 الأوزان الرسمية لنقاط البلوت في الصن
    const cardValuesSun = { 'A': 11, '10': 10, 'K': 4, 'Q': 3, 'J': 2, '9': 0, '8': 0, '7': 0 };
    const rankOrderSun  = { 'A': 8, '10': 7, 'K': 6, 'Q': 5, 'J': 4, '9': 3, '8': 2, '7': 1 };

    // 🃏 الأوزان الرسمية لنقاط البلوت في الحكم (الحاس)
    const cardValuesTrump = { 'J': 20, '9': 14, 'A': 11, '10': 10, 'K': 4, 'Q': 3, '8': 0, '7': 0 };
    const rankOrderTrump  = { 'J': 8, '9': 7, 'A': 6, '10': 5, 'K': 4, 'Q': 3, '8': 2, '7': 1 };

    io.on('connection', (socket) => {
        console.log(`📡 متصل جديد في صكة الملوك: ${socket.id}`);

        socket.on('join_matchmaking', (data) => {
            let roomId = "1000"; 
            if (!rooms[roomId]) {
                rooms[roomId] = {
                    roomId: roomId,
                    seats: [null, null, null, null],
                    gameStage: 'lobby',
                    scores: { team1: 0, team2: 0 },
                    currentTurn: 0,
                    buyRound: 1,
                    buyType: null,
                    trumpSuit: null,
                    tableCards: [],
                    playersCards: [[], [], [], []],
                    deck: [],
                    leadSuit: null,
                    roundPoints: { team1: 0, team2: 0 },
                    trickCount: 0 // لحساب الـ 8 أكلات في القيد
                };
            }
            
            let room = rooms[roomId];
            let existingSeat = room.seats.findIndex(s => s && s.socketId === socket.id);
            
            if (existingSeat === -1) {
                let freeSeat = room.seats.findIndex(s => s === null);
                if (freeSeat !== -1) {
                    room.seats[freeSeat] = { socketId: socket.id, username: data.username || "ملك البلوت" };
                    socket.join(roomId);
                    socket.roomId = roomId;
                }
            }
            io.to(roomId).emit('room_updated', room);
            io.to(roomId).emit('game_state_changed', room);
        });

        socket.on('start_game_with_bots', () => {
            let roomId = socket.roomId || "1000";
            if (!rooms[roomId]) return;
            let room = rooms[roomId];
            
            for (let i = 0; i < 4; i++) {
                if (!room.seats[i]) {
                    room.seats[i] = { socketId: 'bot_' + i, username: "🤖 بوت محترف " + (i+1) };
                }
            }
            
            room.gameStage = 'buying';
            room.buyRound = 1;
            room.currentTurn = 0; 
            room.tableCards = [];
            room.trickCount = 0;
            room.roundPoints = { team1: 0, team2: 0 };
            
            let suits = ['♠', '♥', '♦', '♣'];
            let values = ['A', 'K', 'Q', 'J', '10', '9', '8', '7'];
            let fullDeck = [];
            suits.forEach(s => values.forEach(v => fullDeck.push({ suit: s, value: v })));
            fullDeck.sort(() => Math.random() - 0.5);
            
            room.flipCard = fullDeck.pop();
            
            for (let i = 0; i < 4; i++) {
                room.playersCards[i] = [fullDeck.pop(), fullDeck.pop(), fullDeck.pop(), fullDeck.pop(), fullDeck.pop()];
            }
            room.deck = fullDeck;
            
            io.to(roomId).emit('room_updated', room);
            io.to(roomId).emit('game_state_changed', room);
        });

        socket.on('player_buy_decision', (data) => {
            let roomId = socket.roomId || "1000";
            if (!rooms[roomId]) return;
            let room = rooms[roomId];

            if (room.currentTurn !== data.seatIndex) return;

            if (data.decision === 'buy') {
                executeBuy(room, roomId, data.buyType, data.seatIndex);
            } else {
                room.currentTurn = (room.currentTurn + 1) % 4;
                if (room.currentTurn === 0 && room.buyRound === 1) room.buyRound = 2;
                
                let activePlayer = room.seats[room.currentTurn];
                if (activePlayer && activePlayer.socketId.startsWith('bot_')) {
                    if (room.flipCard && (room.flipCard.value === 'A' || room.flipCard.value === '10' || room.flipCard.value === 'J')) {
                        let botBuyType = (room.flipCard.value === 'J') ? 'حكم' : 'صن';
                        executeBuy(room, roomId, botBuyType, room.currentTurn);
                        return;
                    } else {
                        room.currentTurn = (room.currentTurn + 1) % 4;
                        if (room.currentTurn === 0 && room.buyRound === 1) room.buyRound = 2;
                    }
                }
                io.to(roomId).emit('game_state_changed', room);
            }
        });

        function executeBuy(room, roomId, buyType, buyerIndex) {
            room.gameStage = 'playing';
            room.buyType = buyType;
            room.trumpSuit = (buyType === 'حكم') ? room.flipCard.suit : null;
            
            for (let i = 0; i < 4; i++) {
                if (i === buyerIndex) {
                    room.playersCards[i].push(room.flipCard);
                    room.playersCards[i].push(room.deck.pop());
                    room.playersCards[i].push(room.deck.pop());
                } else {
                    room.playersCards[i].push(room.deck.pop());
                    room.playersCards[i].push(room.deck.pop());
                    room.playersCards[i].push(room.deck.pop());
                }
            }
            room.flipCard = null;
            room.currentTurn = 0; 
            
            checkProjects(room, roomId);
            io.to(roomId).emit('game_state_changed', room);
            
            if (room.seats[room.currentTurn].socketId.startsWith('bot_')) {
                makeAdvancedBotPlay(room, roomId);
            }
        }

        socket.on('play_card', (data) => {
            let roomId = socket.roomId || "1000";
            if (!rooms[roomId]) return;
            let room = rooms[roomId];

            if (room.currentTurn !== data.seatIndex) return;
            if (room.tableCards.length >= 4) return; 

            if (room.tableCards.length === 0) room.leadSuit = data.card.suit;

            room.tableCards.push({ seatIndex: data.seatIndex, card: data.card });
            room.playersCards[data.seatIndex] = room.playersCards[data.seatIndex].filter(
                c => !(c.suit === data.card.suit && c.value === data.card.value)
            );

            io.to(roomId).emit('game_state_changed', room);

            if (room.tableCards.length === 4) {
                handleTrickCompletion(room, roomId);
            } else {
                room.currentTurn = (room.currentTurn + 1) % 4;
                io.to(roomId).emit('game_state_changed', room);
                checkAndRunBotGameplay(room, roomId);
            }
        });

        function handleTrickCompletion(room, roomId) {
            setTimeout(() => {
                let winnerSeat = determineTrickWinner(room);
                let trickPoints = calculateTrickPoints(room);
                
                room.trickCount++;
                
                // إضافة الـ 10 نقاط للأكلة الأخيرة (الأرض)
                if (room.trickCount === 8) {
                    trickPoints += 10;
                    console.log("🎁 تم احتساب 10 نقاط الأرض للأكلة الأخيرة!");
                }

                if (winnerSeat === 0 || winnerSeat === 2) room.roundPoints.team1 += trickPoints;
                else room.roundPoints.team2 += trickPoints;

                room.tableCards = [];
                room.leadSuit = null;
                room.currentTurn = winnerSeat; // الفائز هو من يفتح الأكلة التالية!

                // فحص انتهاء الـ 8 أكلات بالكامل (نهاية القيد)
                if (room.trickCount === 8) {
                    room.scores.team1 += Math.round(room.roundPoints.team1 / 10);
                    room.scores.team2 += Math.round(room.roundPoints.team2 / 10);
                    room.gameStage = 'lobby'; 
                    io.to(roomId).emit('receive_chat_message', { 
                        username: "📢 حكم الساحة", 
                        text: `🏁 قيد رسمي انتهى! نقاط جولتكم: ${room.roundPoints.team1} | الخصم: ${room.roundPoints.team2}. النتيجة الإجمالية الملوكية: فريق 1 [${room.scores.team1}] - فريق 2 [${room.scores.team2}]` 
                    });
                }

                io.to(roomId).emit('game_state_changed', room);
                
                if (room.gameStage === 'playing') {
                    checkAndRunBotGameplay(room, roomId);
                }
            }, 1800);
        }

        function checkAndRunBotGameplay(room, roomId) {
            if (room.gameStage !== 'playing' || room.tableCards.length >= 4) return;
            let activePlayer = room.seats[room.currentTurn];
            if (activePlayer && activePlayer.socketId.startsWith('bot_')) {
                setTimeout(() => {
                    makeAdvancedBotPlay(room, roomId);
                }, 600);
            }
        }

        function makeAdvancedBotPlay(room, roomId) {
            let hand = room.playersCards[room.currentTurn];
            if (!hand || hand.length === 0) return;

            let chosenCard = hand[0];

            if (room.leadSuit) {
                let matchingCards = hand.filter(c => c.suit === room.leadSuit);
                if (matchingCards.length > 0) {
                    matchingCards.sort((a,b) => (rankOrderSun[b.value] || 0) - (rankOrderSun[a.value] || 0));
                    chosenCard = matchingCards[0];
                } else {
                    if (room.buyType === 'حكم') {
                        let trumps = hand.filter(c => c.suit === room.trumpSuit);
                        if (trumps.length > 0) chosenCard = trumps[0];
                    }
                }
            }

            room.tableCards.push({ seatIndex: room.currentTurn, card: chosenCard });
            room.playersCards[room.currentTurn] = hand.filter(c => !(c.suit === chosenCard.suit && c.value === chosenCard.value));

            if (room.tableCards.length === 1) room.leadSuit = chosenCard.suit;

            io.to(roomId).emit('game_state_changed', room);

            if (room.tableCards.length === 4) {
                handleTrickCompletion(room, roomId);
            } else {
                room.currentTurn = (room.currentTurn + 1) % 4;
                io.to(roomId).emit('game_state_changed', room);
                checkAndRunBotGameplay(room, roomId);
            }
        }

        function determineTrickWinner(room) {
            let bestCard = null;
            let winnerSeat = room.currentTurn;

            room.tableCards.forEach(item => {
                let score = 0;
                if (room.buyType === 'حكم' && item.card.suit === room.trumpSuit) {
                    score = (rankOrderTrump[item.card.value] || 0) + 20;
                } else if (item.card.suit === room.leadSuit) {
                    score = (rankOrderSun[item.card.value] || 0);
                }
                if (bestCard === null || score > bestCard.score) {
                    bestCard = { score: score, seatIndex: item.seatIndex };
                }
            });
            return bestCard ? bestCard.seatIndex : winnerSeat;
        }

        function calculateTrickPoints(room) {
            let total = 0;
            room.tableCards.forEach(item => {
                if (room.buyType === 'حكم' && item.card.suit === room.trumpSuit) {
                    total += (cardValuesTrump[item.card.value] || 0);
                } else {
                    total += (cardValuesSun[item.card.value] || 0);
                }
            });
            return total;
        }

        function checkProjects(room, roomId) {
            for (let i = 0; i < 4; i++) {
                let hand = room.playersCards[i];
                if (hand.length >= 3) {
                    let name = room.seats[i].username;
                    io.to(roomId).emit('receive_chat_message', { username: "📢 نظام المشاريع", text: `🎉 اللاعب ${name} قاطع عنده (سِرا) وتم قيد النقاط في السكور!` });
                    if (i === 0 || i === 2) room.roundPoints.team1 += 4;
                    else room.roundPoints.team2 += 4;
                }
            }
        }
    });
};
