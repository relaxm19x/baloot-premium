module.exports = function(io) {
    let rooms = {};

    io.on('connection', (socket) => {
        console.log(`📡 لاعب اتصل بالسيرفر: ${socket.id}`);

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
                    deck: []
                };
            }
            
            let room = rooms[roomId];
            let existingSeat = room.seats.findIndex(s => s && s.socketId === socket.id);
            
            if (existingSeat === -1) {
                let freeSeat = room.seats.findIndex(s => s === null);
                if (freeSeat !== -1) {
                    room.seats[freeSeat] = { socketId: socket.id, username: data.username || "لاعب ملوكي" };
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
                    room.seats[i] = { socketId: 'bot_' + i, username: "🤖 بوت " + (i+1) };
                }
            }
            
            room.gameStage = 'buying';
            room.buyRound = 1;
            room.currentTurn = 0; 
            room.tableCards = [];
            
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
                room.gameStage = 'playing';
                room.buyType = data.buyType;
                
                let buyerIndex = data.seatIndex;
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
                room.currentTurn = 0; // يبدأ اللعب الفعلي من عندك
                
                io.to(roomId).emit('game_state_changed', room);
                
                // إذا كان المقعد الحالي بوت خليه يلعب
                checkAndRunBotGameplay(room, roomId);
                
            } else {
                room.currentTurn = (room.currentTurn + 1) % 4;
                if (room.currentTurn === 0 && room.buyRound === 1) {
                    room.buyRound = 2;
                }
                checkAndRunBotBuying(room, roomId);
                io.to(roomId).emit('game_state_changed', room);
            }
        });

        // 🎯 معالجة رمي الورق الصارم مع الحفاظ على ترتيب الأكلات والتأخير الزمني
        socket.on('play_card', (data) => {
            let roomId = socket.roomId || "1000";
            if (!rooms[roomId]) return;
            let room = rooms[roomId];

            if (room.currentTurn !== data.seatIndex) return;
            if (room.tableCards.length >= 4) return; // قفل لمنع الرمي الزائد أثناء التجميد التلقائي

            // إنزال الكرت
            room.tableCards.push({ seatIndex: data.seatIndex, card: data.card });

            // حذف الكرت من اليد
            room.playersCards[data.seatIndex] = room.playersCards[data.seatIndex].filter(
                c => !(c.suit === data.card.suit && c.value === data.card.value)
            );

            io.to(roomId).emit('game_state_changed', room);

            // فحص اكتمال الأكلة الحالية (4 كروت بالوسط)
            if (room.tableCards.length === 4) {
                // ⏱️ تجميد الشاشة لمدة 2 ثانية لكي يرى بومحمد الكروت بوضوح على الطاولة
                setTimeout(() => {
                    room.tableCards = []; // لمة الورق وتصفير الأرضية
                    room.currentTurn = (room.currentTurn + 1) % 4; // نقل الدور للتالي لبدء الأكلة الجديدة
                    io.to(roomId).emit('game_state_changed', room);
                    
                    // تشغيل البوتات للأكلة الجديدة إذا جاء دورها
                    checkAndRunBotGameplay(room, roomId);
                }, 2000);
            } else {
                // نقل الدور العادي للاعب التالي في نفس الأكلة
                room.currentTurn = (room.currentTurn + 1) % 4;
                io.to(roomId).emit('game_state_changed', room);
                
                // تشغيل البوت الحين إذا كان عليه الدور في نفس الأكلة
                checkAndRunBotGameplay(room, roomId);
            }
        });

        // دالة تحريك لعب البوتات في مرحلة الصكة الفعلية بالتتالي
        function checkAndRunBotGameplay(room, roomId) {
            if (room.gameStage !== 'playing' || room.tableCards.length >= 4) return;
            
            let activePlayer = room.seats[room.currentTurn];
            if (activePlayer && activePlayer.socketId.startsWith('bot_')) {
                // البوت يلعب بعد تأخير بسيط جداً (500ms) لكي يبدو اللعب طبيعياً ومريحاً
                setTimeout(() => {
                    if (room.gameStage !== 'playing' || room.tableCards.length >= 4) return;
                    let botHand = room.playersCards[room.currentTurn];
                    if (botHand && botHand.length > 0) {
                        let thrown = botHand.pop(); // رمي كرت
                        room.tableCards.push({ seatIndex: room.currentTurn, card: thrown });
                        
                        if (room.tableCards.length === 4) {
                            io.to(roomId).emit('game_state_changed', room);
                            setTimeout(() => {
                                room.tableCards = [];
                                room.currentTurn = (room.currentTurn + 1) % 4;
                                io.to(roomId).emit('game_state_changed', room);
                                checkAndRunBotGameplay(room, roomId);
                            }, 2000);
                        } else {
                            room.currentTurn = (room.currentTurn + 1) % 4;
                            io.to(roomId).emit('game_state_changed', room);
                            checkAndRunBotGameplay(room, roomId);
                        }
                    }
                }, 500);
            }
        }

        function checkAndRunBotBuying(room, roomId) {
            let attempts = 0;
            while (room.seats[room.currentTurn] && room.seats[room.currentTurn].socketId.startsWith('bot_') && room.gameStage === 'buying' && attempts < 4) {
                room.currentTurn = (room.currentTurn + 1) % 4;
                if (room.currentTurn === 0 && room.buyRound === 1) {
                    room.buyRound = 2;
                }
                attempts++;
            }
        }

        socket.on('disconnect', () => {
            let roomId = socket.roomId || "1000";
            if (rooms[roomId]) {
                let seatIndex = rooms[roomId].seats.findIndex(s => s && s.socketId === socket.id);
                if (seatIndex !== -1) { rooms[roomId].seats[seatIndex] = null; }
                io.to(roomId).emit('room_updated', rooms[roomId]);
            }
        });
    });
};
