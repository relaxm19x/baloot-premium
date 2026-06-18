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
                    buyerSeat: null,
                    trumpSuit: null,
                    tableCards: [],
                    playersCards: [[], [], [], []],
                    deck: [],
                    leadSuit: null,
                    roundPoints: { team1: 0, team2: 0 },
                    trickCount: 0,
                    activeProjects: ["", "", "", ""],
                    playerActionsText: ["", "", "", ""], // لتسجيل كلمة "بس" أو "طلب" فوق الاسم لايف
                    passCount: 0
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
            setupNewRound(roomId);
        });

        function setupNewRound(roomId) {
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
            room.trumpSuit = null;
            room.tableCards = [];
            room.trickCount = 0;
            room.passCount = 0;
            room.roundPoints = { team1: 0, team2: 0 };
            room.activeProjects = ["", "", "", ""];
            room.playerActionsText = ["", "", "", ""]; 

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
        }

        socket.on('player_buy_decision', (data) => {
            let roomId = socket.roomId || "1000";
            if (!rooms[roomId]) return;
            let room = rooms[roomId];

            if (room.currentTurn !== data.seatIndex) return;

            if (data.decision === 'buy') {
                room.buyerSeat = data.seatIndex;
                room.buyType = data.buyType;
                room.trumpSuit = (data.buyType === 'حكم' || data.buyType === 'أشكل') ? room.flipCard.suit : null;
                room.playerActionsText[data.seatIndex] = `طلب: ${data.buyType}`;
                executeBuy(room, roomId, data.buyType, data.seatIndex);
            } else {
                // اللاعب ضغط بس -> يظهر فوق اسمه فوراً
                room.playerActionsText[room.currentTurn] = "بس 🛡️";
                room.passCount++;
                
                if (room.passCount >= 8) {
                    io.to(roomId).emit('round_ended_announcement', { summary: "🔄 الكل بس! جاري إعادة التوزيع...", scores: room.scores });
                    setTimeout(() => { setupNewRound(roomId); }, 2500);
                    return;
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
                        room.buyerSeat = room.currentTurn;
                        room.buyType = (room.flipCard.value === 'J') ? 'حكم' : 'صن';
                        room.trumpSuit = (room.buyType === 'حكم') ? room.flipCard.suit : null;
                        room.playerActionsText[room.currentTurn] = `طلب: ${room.buyType}`;
                        executeBuy(room, roomId, room.buyType, room.currentTurn);
                    } else {
                        room.playerActionsText[room.currentTurn] = "بس 🛡️";
                        room.passCount++;
                        if (room.passCount >= 8) {
                            io.to(roomId).emit('round_ended_announcement', { summary: "🔄 الكل بس! جاري إعادة التوزيع...", scores: room.scores });
                            setTimeout(() => { setupNewRound(roomId); }, 2500);
                            return;
                        }
                        room.currentTurn = (room.currentTurn + 1) % 4;
                        if (room.passCount === 4) room.buyRound = 2;
                        io.to(roomId).emit('game_state_changed', room);
                        checkAndRunBotBuying(room, roomId);
                    }
                }, 700);
            }
        }

        function executeBuy(room, roomId, buyType, buyerIndex) {
            room.gameStage = 'playing';
            // عند انتهاء الشراء وبدء اللعب، نمسح كلمات "بس" لتهيئتها للمشاريع
            for(let i=0; i<4; i++) { if(room.playerActionsText[i] === "بس 🛡️") room.playerActionsText[i] = ""; }

            for (let i = 0; i < 4; i++) {
                if (i === buyerIndex) {
                    room.playersCards[i].push(room.deck.pop());
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

        // 📊 محرك تدقيق وتطبيق قوانين المشاريع الرسمية (الأكبر يلغي الأصغر + استثناء البلوت)
        socket.on('declare_project_attempt', (data) => {
            let roomId = socket.roomId || "1000";
            if (!rooms[roomId]) return;
            let room = rooms[roomId];

            let seatIndex = data.seatIndex;
            let projectType = data.projectType;

            if (projectType !== 'لا شيء') {
                room.activeProjects[seatIndex] = projectType;
                room.playerActionsText[seatIndex] = `مشروع: ${projectType}`; // يظهر فوق الاسم دغري
            }

            // خوارزمية تصفية وتطبيق القوانين الرسمية للمشاريع
            let maxProjectWeight = 0;
            let winningTeam = 0; // 1 = فريقنا (0 و 2)، 2 = فريقهم (1 و 3)

            const weights = { 'لا شيء': 0, 'بلوت': 1, 'سرا': 2, 'خمسين': 3, '100': 4, '400': 5 };

            for (let i = 0; i < 4; i++) {
                let p = room.activeProjects[i];
                if (p && p !== 'لا شيء' && p !== 'بلوت') {
                    if (weights[p] > maxProjectWeight) {
                        maxProjectWeight = weights[p];
                        winningTeam = (i === 0 || i === 2) ? 1 : 2;
                    }
                }
            }

            // احتساب النقاط بناءً على فوز المشروع الأكبر وإلغاء مشروع الخصم تماماً
            let p1Points = 0;
            let p2Points = 0;

            for (let i = 0; i < 4; i++) {
                let p = room.activeProjects[i];
                if (!p || p === 'لا شيء') continue;

                let currentTeam = (i === 0 || i === 2) ? 1 : 2;
                let pts = (p === 'سرا') ? 4 : (p === 'خمسين') ? 10 : (p === '100') ? 20 : (p === 'بلوت') ? 4 : 40;

                // مشروع البلوت استثناء لا يُلغى أبداً ويُحسب تلقائياً
                if (p === 'بلوت') {
                    if (currentTeam === 1) p1Points += pts;
                    else p2Points += pts;
                } else {
                    // المشاريع العادية تُحسب فقط للفريق صاحب المشروع الأكبر
                    if (currentTeam === winningTeam) {
                        if (currentTeam === 1) p1Points += pts;
                        else p2Points += pts;
                    }
                }
            }

            room.roundPoints.team1 += p1Points;
            room.roundPoints.team2 += p2Points;

            io.to(roomId).emit('game_state_changed', room);
        });

        socket.on('play_card', (data) => {
            let roomId = socket.roomId || "1000";
            if (!rooms[roomId]) return;
            let room = rooms[roomId];
            if (room.currentTurn !== data.seatIndex) return;

            // 🔄 قانون التصفية الذاتية: بمجرد رمي أول كرت في اللعبة، تختفي الكلمات والمشاريع من فوق الرؤوس لتبقى الشاشة نظيفة!
            if (room.tableCards.length === 0) {
                for(let i=0; i<4; i++) { room.playerActionsText[i] = ""; }
            }

            if (room.tableCards.length === 0) room.leadSuit = data.card.suit;
            room.tableCards.push({ seatIndex: data.seatIndex, card: data.card });
            room.playersCards[data.seatIndex] = room.playersCards[data.seatIndex].filter(c => !(c.suit === data.card.suit && c.value === data.card.value));

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
                    io.to(roomId).emit('round_ended_announcement', { summary: `🏁 انتهى القيد! لنا +${t1Gain} | لهم +${t2Gain}.`, scores: room.scores });
                    setTimeout(() => { setupNewRound(roomId); }, 3500);
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
                    if (room.trumpSuit) {
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
                if (room.trumpSuit && item.card.suit === room.trumpSuit) {
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
                if (room.trumpSuit && item.card.suit === room.trumpSuit) total += (cardValuesTrump[item.card.value] || 0);
                else total += (cardValuesSun[item.card.value] || 0);
            });
            return total;
        }
    });
};
