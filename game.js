module.exports = function(io) {
    let rooms = {};

    // 🃏 الأوزان الرسمية لنقاط البلوت في الصن
    const cardValuesSun = { 'A': 11, '10': 10, 'K': 4, 'Q': 3, 'J': 2, '9': 0, '8': 0, '7': 0 };
    const rankOrderSun  = { 'A': 8, '10': 7, 'K': 6, 'Q': 5, 'J': 4, '9': 3, '8': 2, '7': 1 };

    // 🃏 الأوزان الرسمية لنقاط البلوت في الحكم
    const cardValuesTrump = { 'J': 20, '9': 14, 'A': 11, '10': 10, 'K': 4, 'Q': 3, '8': 0, '7': 0 };
    const rankOrderTrump  = { 'J': 8, '9': 7, 'A': 6, '10': 5, 'K': 4, 'Q': 3, '8': 2, '7': 1 };

    // الترتيب المتتالي الصارم لفحص المشاريع الشرعية (سرا، خمسين..)
    const projectSequence = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

    io.on('connection', (socket) => {
        console.log(`📡 متصل في صكة الملوك: ${socket.id}`);

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
                    trickCount: 0,
                    activeProjects: [null, null, null, null] // لحفظ المشاريع المحققة لكل مقعد
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
            room.activeProjects = [null, null, null, null];
            
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

        // ☕ 1. نظام استقبال وتوصيل طلبات الكافتيريا والتمور المستهدفة لايف
        socket.on('deliver_hospitality', (data) => {
            let roomId = socket.roomId || "1000";
            if (!rooms[roomId]) return;
            let room = rooms[roomId];

            let sender = room.seats[data.fromSeat];
            let receiver = room.seats[data.toSeat];

            if (sender && receiver) {
                // بث التوصيل الفوري لجميع المتصفحات أونلاين لتهتز الشاشة بالإشعار
                io.to(roomId).emit('hospitality_broadcast', {
                    senderName: sender.username,
                    receiverName: receiver.username,
                    senderSeat: data.fromSeat,
                    receiverSeat: data.toSeat,
                    item: data.item
                });
            }
        });

        // 📢 2. محرك الفحص والتدقيق الصارم للمشاريع (سرا، خمسين..) وفق ورق اليد الفعلي
        socket.on('declare_project_attempt', (data) => {
            let roomId = socket.roomId || "1000";
            if (!rooms[roomId]) return;
            let room = rooms[roomId];

            let seatIndex = data.seatIndex;
            let projectType = data.projectType;
            let hand = room.playersCards[seatIndex] || [];

            let isVerified = false;

            // خوارزمية الفحص الاحترافي للسِرا (3 كروت متتالية من نفس النقش)
            if (projectType === 'سرا') {
                let suitsGroup = { '♠': [], '♥': [], '♦': [], '♣': [] };
                hand.forEach(c => suitsGroup[c.suit].push(c.value));
                
                for (let s in suitsGroup) {
                    let indexes = suitsGroup[s].map(v => projectSequence.indexOf(v)).sort((a,b) => a-b);
                    // فحص التتالي الملوكي
                    for (let i = 0; i < indexes.length - 2; i++) {
                        if (indexes[i+1] === indexes[i] + 1 && indexes[i+2] === indexes[i] + 2) {
                            isVerified = true;
                            break;
                        }
                    }
                }
            } 
            // خوارزمية فحص الخمسين (4 كروت متتالية من نفس النقش)
            else if (projectType === 'خمسين') {
                let suitsGroup = { '♠': [], '♥': [], '♦': [], '♣': [] };
                hand.forEach(c => suitsGroup[c.suit].push(c.value));
                for (let s in suitsGroup) {
                    let indexes = suitsGroup[s].map(v => projectSequence.indexOf(v)).sort((a,b) => a-b);
                    for (let i = 0; i < indexes.length - 3; i++) {
                        if (indexes[i+1] === indexes[i] + 1 && indexes[i+2] === indexes[i] + 2 && indexes[i+3] === indexes[i] + 3) {
                            isVerified = true;
                            break;
                        }
                    }
                }
            }
            // فحص الـ 100 أو الـ 400 الصورية للتسيير حالياً
            else if (projectType === '100' || projectType === 'مية' || projectType === '400') {
                isVerified = true; 
            }

            // إرسال النتيجة للمستخدم وتحديث وشاح المقعد
            if (isVerified) {
                room.activeProjects[seatIndex] = projectType;
                // إضافة نقاط المشروع للسكور فوراً (السرا بـ 4 نقاط، الخمسين بـ 10 نقاط)
                let projectPoints = (projectType === 'سرا') ? 4 : (projectType === 'خمسين') ? 10 : 20;
                if (seatIndex === 0 || seatIndex === 2) room.roundPoints.team1 += projectPoints;
                else room.roundPoints.team2 += projectPoints;

                socket.emit('project_validation_result', { success: true, type: projectType });
            } else {
                socket.emit('project_validation_result', { success: false, type: projectType });
            }

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
                if (room.trickCount === 8) trickPoints += 10;

                if (winnerSeat === 0 || winnerSeat === 2) room.roundPoints.team1 += trickPoints;
                else room.roundPoints.team2 += trickPoints;

                room.tableCards = [];
                room.leadSuit = null;
                room.currentTurn = winnerSeat;

                if (room.trickCount === 8) {
                    room.scores.team1 += Math.round(room.roundPoints.team1 / 10);
                    room.scores.team2 += Math.round(room.roundPoints.team2 / 10);
                    room.gameStage = 'lobby'; 
                }

                io.to(roomId).emit('game_state_changed', room);
                if (room.gameStage === 'playing') checkAndRunBotGameplay(room, roomId);
            }, 1800);
        }

        function checkAndRunBotGameplay(room, roomId) {
            if (room.gameStage !== 'playing' || room.tableCards.length >= 4) return;
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
                if (bestCard === null || score > bestCard.score) { bestCard = { score: score, seatIndex: item.seatIndex }; }
            });
            return bestCard ? bestCard.seatIndex : winnerSeat;
        }

        function calculateTrickPoints(room) {
            let total = 0;
            room.tableCards.forEach(item => {
                if (room.buyType === 'حكم' && item.card.suit === room.trumpSuit) total += (cardValuesTrump[item.card.value] || 0);
                else total += (cardValuesSun[item.card.value] || 0);
            });
            return total;
        }
    });
};
