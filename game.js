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
                    deck: [] // لحفظ الكروت الباقية للتوزيع الثاني
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
            
            // توليد وخلط الكروت كاملة
            let suits = ['♠', '♥', '♦', '♣'];
            let values = ['A', 'K', 'Q', 'J', '10', '9', '8', '7'];
            let fullDeck = [];
            suits.forEach(s => values.forEach(v => fullDeck.push({ suit: s, value: v })));
            fullDeck.sort(() => Math.random() - 0.5);
            
            // الكرت المكشوف
            room.flipCard = fullDeck.pop();
            
            // التوزيع الأول (5 كروت لكل لاعب)
            for (let i = 0; i < 4; i++) {
                room.playersCards[i] = [fullDeck.pop(), fullDeck.pop(), fullDeck.pop(), fullDeck.pop(), fullDeck.pop()];
            }
            
            room.deck = fullDeck; // حفظ باقي الكروت في الغرفة للتوزيع الثاني
            
            io.to(roomId).emit('room_updated', room);
            io.to(roomId).emit('game_state_changed', room);
        });

        socket.on('player_buy_decision', (data) => {
            let roomId = socket.roomId || "1000";
            if (!rooms[roomId]) return;
            let room = rooms[roomId];

            if (room.currentTurn !== data.seatIndex) return;

            if (data.decision === 'buy') {
                // 👑 تم الشراء! الحين ننتقل لمرحلة اللعب الفعلي
                room.gameStage = 'playing';
                room.buyType = data.buyType;
                
                // 🎯 نظام التوزيع الثاني الذكي (تكملة الـ 8 أوراق):
                let buyerIndex = data.seatIndex;
                
                for (let i = 0; i < 4; i++) {
                    if (i === buyerIndex) {
                        // المشتري يأخذ الكرت المكشوف + كرتين إضافيين من الـ Deck
                        room.playersCards[i].push(room.flipCard);
                        room.playersCards[i].push(room.deck.pop());
                        room.playersCards[i].push(room.deck.pop());
                    } else {
                        // باقي اللاعبين يأخذون 3 كروت كاملة من الـ Deck
                        room.playersCards[i].push(room.deck.pop());
                        room.playersCards[i].push(room.deck.pop());
                        room.playersCards[i].push(room.deck.pop());
                    }
                }
                
                room.flipCard = null; // إخفاء الكرت المكشوف من وسط الطاولة لأنه تم أخذه
                room.currentTurn = 0; // يبدأ اللعب من أول لاعب على الطاولة
                console.log(`✅ اكتمل توزيع الـ 8 كروت لجميع اللاعبين بنجاح! نوع اللعب: ${data.buyType}`);
                
            } else {
                // إذا قال "بس"، يمر الدور للي بعده
                room.currentTurn = (room.currentTurn + 1) % 4;
                if (room.currentTurn === 0 && room.buyRound === 1) {
                    room.buyRound = 2;
                }
                checkAndRunBotTurns(room, roomId);
            }
            
            io.to(roomId).emit('game_state_changed', room);
        });

        function checkAndRunBotTurns(room, roomId) {
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
