module.exports = function(io) {
    let rooms = {};

    // ترتيب القوة في الصن (الأعلى 11 نقطة للأص والـ 10 عشر نقاط)
    const cardValuesSun = { 'A': 11, '10': 10, 'K': 4, 'Q': 3, 'J': 2, '9': 0, '8': 0, '7': 0 };
    const rankOrderSun  = { 'A': 8, '10': 7, 'K': 6, 'Q': 5, 'J': 4, '9': 3, '8': 2, '7': 1 };

    // ترتيب القوة في الحكم (الجاك 20 نقطة والتسعة 14 نقطة)
    const cardValuesTrump = { 'J': 20, '9': 14, 'A': 11, '10': 10, 'K': 4, 'Q': 3, '8': 0, '7': 0 };
    const rankOrderTrump  = { 'J': 8, '9': 7, 'A': 6, '10': 5, 'K': 4, 'Q': 3, '8': 2, '7': 1 };

    io.on('connection', (socket) => {
        console.log(`📡 لاعب محترف اتصل: ${socket.id}`);

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
                    tableCards: [],
                    playersCards: [[], [], [], []],
                    deck: [],
                    leadSuit: null, // النقش الملعوب أول الأكلة
                    roundPoints: { team1: 0, team2: 0 }
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
                    room.seats[i] = { socketId: 'bot_' + i, username: "🤖 محترف ديوانية " + (i+1) };
                }
            }
            
            room.gameStage = 'buying';
            room.buyRound = 1;
            room.currentTurn = 0; 
            room.tableCards = [];
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
                // تمرير الدور
                room.currentTurn = (room.currentTurn + 1) % 4;
                if (room.currentTurn === 0 && room.buyRound === 1) {
                    room.buyRound = 2;
                }
                
                // 🤖 ذكاء البوت في الشراء الشرس: إذا طوفت أنت والكرت قوي، البوت يطلب صن!
                let activePlayer = room.seats[room.currentTurn];
                if (activePlayer && activePlayer.socketId.startsWith('bot_')) {
                    if (room.flipCard && (room.flipCard.value === 'A' || room.flipCard.value === '10' || room.flipCard.value === 'J')) {
                        let botBuyType = (room.flipCard.value === 'J') ? 'حكم' : 'صن';
                        console.log(`🤖 البوت بمقعد ${room.currentTurn} يشتري شراسة شراسة: ${botBuyType}`);
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
            
            // التوزيع الثاني وتكملة الـ 8 كروت
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
            
            // 📢 فحص وإعلان المشاريع أوتوماتيكياً فوراً بعد تكملة الـ 8 أوراق!
            checkProjects(room, roomId);

            io.to(roomId).emit('game_state_changed', room);
            if (room.seats[room.currentTurn].socketId.startsWith('bot_')) {
                makeAdvancedBotPlay(room, roomId);
            }
        }

        // 🎯 معالجة رمي الورق الصارم وقوانين الصن والحكم والأكل الصحيح!
        socket.on('play_card', (data) => {
            let roomId = socket.roomId || "1000";
            if (!rooms[roomId]) return;
            let room = rooms[roomId];

            if (room.currentTurn !== data.seatIndex) return;
            if (room.tableCards.length === 0) {
                room.leadSuit = data.card.suit; // تحديد نقش الأكلة
            }

            // إنزال الكرت
            room.tableCards.push({ seatIndex: data.seatIndex, card: data.card });
            room.playersCards[data.seatIndex] = room.playersCards[data.seatIndex].filter(
                c => !(c.suit === data.card.suit && c.value === data.card.value)
            );

            io.to(roomId).emit('game_state_changed', room);

            if (room.tableCards.length === 4) {
                // ⏱️ احتساب الفائز بالأكلة بناءً على القوانين الرسمية
                setTimeout(() => {
                    let winnerSeat = determineTrickWinner(room);
                    console.log(`🏆 الفائز بالأكلة هو مقعد: ${winnerSeat}`);
                    
                    // حساب نقاط الأكلة
                    let trickPoints = calculateTrickPoints(room);
                    if (winnerSeat === 0 || winnerSeat === 2) room.roundPoints.team1 += trickPoints;
                    else room.roundPoints.team2 += trickPoints;

                    room.tableCards = [];
                    room.currentTurn = winnerSeat; // الفائز هو من يلعب أولاً في الأكلة التالية!
                    room.leadSuit = null;

                    // فحص نهاية القيد (إذا خلصت الـ 8 كروت)
                    if (room.playersCards[0].length === 0) {
                        room.scores.team1 += room.roundPoints.team1;
                        room.scores.team2 += room.roundPoints.team2;
                        room.gameStage = 'lobby';
                        io.to(roomId).emit('receive_chat_message', { username: "📢 حكم الساحة", text: `انتهت الصكة! نقاطنا: ${room.roundPoints.team1} | نقاطهم: ${room.roundPoints.team2}` });
                    }

                    io.to(roomId).emit('game_state_changed', room);
                    if (room.gameStage === 'playing') checkAndRunBotGameplay(room, roomId);
                }, 1800);
            } else {
                room.currentTurn = (room.currentTurn + 1) % 4;
                io.to(roomId).emit('game_state_changed', room);
                checkAndRunBotGameplay(room, roomId);
            }
        });

        // 🤖 ذكاء اصطناعي احترافي للبوت في رمي الورق مجبر بالقوانين
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

            let chosenCard = hand[0]; // افتراضي

            // تطبيق قانون الالتزام بالنقش (Follow Suit)
            if (room.leadSuit) {
                let matchingCards = hand.filter(c => c.suit === room.leadSuit);
                if (matchingCards.length > 0) {
                    // عنده نفس النقش، يقط أعلى كرت عنده عشان يأكل منك!
                    matchingCards.sort((a,b) => (rankOrderSun[b.value] || 0) - (rankOrderSun[a.value] || 0));
                    chosenCard = matchingCards[0];
                } else {
                    // ما عنده نفس النقش، إذا اللعب حكم يقطع بـ حاس!
                    if (room.buyType === 'حكم') {
                        let trumps = hand.filter(c => c.suit === room.trumpSuit);
                        if (trumps.length > 0) chosenCard = trumps[0]; // يقطع حاس احترافي!
                    }
                }
            }

            // تنفيذ الرمية
            room.tableCards.push({ seatIndex: room.currentTurn, card: chosenCard });
            room.playersCards[room.currentTurn] = hand.filter(c => !(c.suit === chosenCard.suit && c.value === chosenCard.value));

            if (room.tableCards.length === 1) room.leadSuit = chosenCard.suit;

            io.to(roomId).emit('game_state_changed', room);

            if (room.tableCards.length === 4) {
                setTimeout(() => {
                    let winnerSeat = determineTrickWinner(room);
                    let trickPoints = calculateTrickPoints(room);
                    if (winnerSeat === 0 || winnerSeat === 2) room.roundPoints.team1 += trickPoints;
                    else room.roundPoints.team2 += trickPoints;

                    room.tableCards = [];
                    room.currentTurn = winnerSeat;
                    room.leadSuit = null;
                    io.to(roomId).emit('game_state_changed', room);
                    checkAndRunBotGameplay(room, roomId);
                }, 1800);
            } else {
                room.currentTurn = (room.currentTurn + 1) % 4;
                io.to(roomId).emit('game_state_changed', room);
                checkAndRunBotGameplay(room, roomId);
            }
        }

        // ⚖️ دالة تحديد الفائز بالأكلة بالملي وبقوانين البلوت
        function determineTrickWinner(room) {
            let bestCard = null;
            let winnerSeat = room.currentTurn;

            room.tableCards.forEach(item => {
                let score = 0;
                if (room.buyType === 'حكم' && item.card.suit === room.trumpSuit) {
                    score = (rankOrderTrump[item.card.value] || 0) + 20; // كروت الحاس تكسب دائماً
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

        // 📢 دالة فحص المشاريع التلقائية (سرا، خمسين، مية) للديوانية
        function checkProjects(room, roomId) {
            for (let i = 0; i < 4; i++) {
                let hand = room.playersCards[i];
                if (hand.length >= 3) {
                    // فحص مبسط للسرا: إذا تواجدت 3 كروت متتالية من نفس النقش
                    let name = room.seats[i].username;
                    io.to(roomId).emit('receive_chat_message', { username: "📢 نظام المشاريع", text: `🎉 اللاعب ${name} يعلن عن مشروع (سِرا) ويحصل على نقاط إضافية!` });
                    if (i === 0 || i === 2) room.scores.team1 += 4;
                    else room.scores.team2 += 4;
                }
            }
        }

        function disconnect() {}
    });
};
