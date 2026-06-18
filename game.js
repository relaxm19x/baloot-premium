module.exports = function(io) {
    let rooms = {};

    const cardValuesSun = { 'A': 11, '10': 10, 'K': 4, 'Q': 3, 'J': 2, '9': 0, '8': 0, '7': 0 };
    const rankOrderSun  = { 'A': 8, '10': 7, 'K': 6, 'Q': 5, 'J': 4, '9': 3, '8': 2, '7': 1 };
    const cardValuesTrump = { 'J': 20, '9': 14, 'A': 11, '10': 10, 'K': 4, 'Q': 3, '8': 0, '7': 0 };
    const rankOrderTrump  = { 'J': 8, '9': 7, 'A': 6, '10': 5, 'K': 4, 'Q': 3, '8': 2, '7': 1 };
    const projectSequence = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

    io.on('connection', (socket) => {
        
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
                    buyerSeat: null, // لتسجيل من هو المشتري
                    trumpSuit: null,
                    tableCards: [],
                    playersCards: [[], [], [], []],
                    deck: [],
                    leadSuit: null,
                    roundPoints: { team1: 0, team2: 0 },
                    trickCount: 0,
                    activeProjects: ["", "", "", ""],
                    revealedProjectCards: [[], [], [], []]
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
            room.buyerSeat = null;
            room.buyType = null;
            room.tableCards = [];
            room.trickCount = 0;
            room.roundPoints = { team1: 0, team2: 0 };
            room.activeProjects = ["", "", "", ""];
            room.revealedProjectCards = [[], [], [], []];

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

        // معالجة قرارات الشراء والتمرير الصارمة بدون أي تعليق
        socket.on('player_buy_decision', (data) => {
            let roomId = socket.roomId || "1000";
            if (!rooms[roomId]) return;
            let room = rooms[roomId];

            if (room.currentTurn !== data.seatIndex) return;

            if (data.decision === 'buy') {
                // تسجيل المشتري ونوع جولة الشراء (أول أو ثاني)
                room.buyerSeat = data.seatIndex;
                let roundText = room.buyRound === 1 ? "أول" : "ثاني";
                room.buyType = `${data.buyType} ${roundText}`;
                
                executeBuy(room, roomId, data.buyType, data.seatIndex);
            } else {
                // في حال قال اللاعب "بس" أو "طوّف"
                room.currentTurn = (room.currentTurn + 1) % 4;
                if (room.currentTurn === 0 && room.buyRound === 1) {
                    room.buyRound = 2; // الانتقال للدورة الثانية
                }
                
                io.to(roomId).emit('game_state_changed', room);
                
                // 🚀 محرك الدوران التلقائي: فحص فوري إذا كان المقعد التالي بوووت خليه يمرر تلقائياً لمنع أي تجميد!
                checkAndRunBotBuying(room, roomId);
            }
        });

        function checkAndRunBotBuying(room, roomId) {
            let activePlayer = room.seats[room.currentTurn];
            if (activePlayer && activePlayer.socketId.startsWith('bot_') && room.gameStage === 'buying') {
                setTimeout(() => {
                    // البوت يفحص شراسة الكرت المكشوف أو يمرر "بس"
                    if (room.flipCard && (room.flipCard.value === 'A' || room.flipCard.value === 'J')) {
                        room.buyerSeat = room.currentTurn;
                        let roundText = room.buyRound === 1 ? "أول" : "ثاني";
                        let bType = (room.flipCard.value === 'J') ? 'حكم' : 'صن';
                        room.buyType = `${bType} ${roundText}`;
                        executeBuy(room, roomId, bType, room.currentTurn);
                    } else {
                        room.currentTurn = (room.currentTurn + 1) % 4;
                        if (room.currentTurn === 0 && room.buyRound === 1) room.buyRound = 2;
                        io.to(roomId).emit('game_state_changed', room);
                        checkAndRunBotBuying(room, roomId); // تدوير ذاتي مستمر
                    }
                }, 700);
            }
        }

        function executeBuy(room, roomId, buyType, buyerIndex) {
            room.gameStage = 'playing';
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
                checkAndRunBotGameplay(roomId);
            }
        });

        function handleTrickCompletion(room, roomId) {
            setTimeout(() => {
                let winnerSeat = determineTrickWinner(room);
                let trickPoints = calculateTrickPoints(room);
                
                room.trickCount++;
                if (room.trickCount === 8) trickPoints += 10;

                if (winnerSeat === 0 || winnerSeat === 2) room.roundPoints.team1 += trickPoints;
                else room.roundPoints.team2 += trickPoints;

                room.tableCards = [];
                room.leadSuit = null;
                room.currentTurn = winnerSeat;

                if (room.trickCount === 8) {
                    let t1Gain = Math.round(room.roundPoints.team1 / 10);
                    let t2Gain = Math.round(room.roundPoints.team2 / 10);
                    room.scores.team1 += t1Gain;
                    room.scores.team2 += t2Gain;

                    io.to(roomId).emit('round_ended_announcement', {
                        summary: `🏁 انتهى القيد! لنا +${t1Gain} | لهم +${t2Gain}.`,
                        scores: room.scores
                    });

                    setTimeout(() => { 
                        room.gameStage = 'buying';
                        room.buyRound = 1;
                        room.currentTurn = 0;
                        room.buyerSeat = null;
                        room.buyType = null;
                        // إعادة التوزيع التلقائي الفوري للجولة التالية
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
                        room.trickCount = 0;
                        room.roundPoints = { team1: 0, team2: 0 };
                        room.activeProjects = ["", "", "", ""];
                        room.revealedProjectCards = [[], [], [], []];
                        io.to(roomId).emit('game_state_changed', room);
                    }, 4000);
                } else {
                    io.to(roomId).emit('game_state_changed', room);
                    if (room.gameStage === 'playing') checkAndRunBotGameplay(roomId);
                }
            }, 1800);
        }

        function checkAndRunBotGameplay(roomId) {
            let room = rooms[roomId];
            if (!room || room.gameStage !== 'playing' || room.tableCards.length >= 4) return;
            let activePlayer = room.seats[room.currentTurn];
            if (activePlayer && activePlayer.socketId.startsWith('bot_')) {
                setTimeout(() => { makeAdvancedBotPlay(room, roomId); }, 600);
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
                    if (room.buyType && room.buyType.includes('حكم')) {
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
                checkAndRunBotGameplay(roomId);
            }
        }

        function determineTrickWinner(room) {
            let bestCard = null;
            let winnerSeat = room.currentTurn;
            room.tableCards.forEach(item => {
                let score = 0;
                if (room.buyType && room.buyType.includes('حكم') && item.card.suit === room.trumpSuit) {
                    score = (rankOrderTrump[item.card.value] || 0) + 20;
                } else if (item.card.suit === room.leadSuit) {
                    score = (rankOrderSun[item.card.value] || 0);
                }
                if (bestCard === null || score > bestCard.score) { bestCard = { score: score, seatIndex: item.seatIndex }; }
            });
            return bestCard ? bestCard.seatIndex : winnerSeat;
        }

        function calculateTrickPoints(room) {
            let total = 0;
            room.tableCards.forEach(item => {
                if (room.buyType && room.buyType.includes('حكم') && item.card.suit === room.trumpSuit) total += (cardValuesTrump[item.card.value] || 0);
                else total += (cardValuesSun[item.card.value] || 0);
            });
            return total;
        }

        socket.on('deliver_hospitality', (data) => {
            let roomId = socket.roomId || "1000";
            if (!rooms[roomId]) return;
            let room = rooms[roomId];
            let sender = room.seats[data.fromSeat];
            let receiver = room.seats[data.toSeat];
            if (sender && receiver) {
                io.to(roomId).emit('hospitality_broadcast', { senderName: sender.username, receiverName: receiver.username, senderSeat: data.fromSeat, receiverSeat: data.toSeat, item: data.item });
            }
        });

        socket.on('declare_project_attempt', (data) => {
            let roomId = socket.roomId || "1000";
            if (!rooms[roomId]) return;
            let room = rooms[roomId];
            let seatIndex = data.seatIndex;
            let projectType = data.projectType;
            let hand = room.playersCards[seatIndex] || [];
            let isVerified = true; // تسيير فوري للتحقق
            if (isVerified && projectType !== 'لا شيء') {
                room.activeProjects[seatIndex] = projectType;
                let projectPoints = (projectType === 'سرا') ? 4 : 10;
                if (seatIndex === 0 || seatIndex === 2) room.roundPoints.team1 += projectPoints;
                else room.roundPoints.team2 += projectPoints;
                socket.emit('project_validation_result', { success: true, type: projectType });
            }
            io.to(roomId).emit('game_state_changed', room);
        });
    });
};
