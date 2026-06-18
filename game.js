module.exports = function(io) {
    let rooms = {};

    io.on('connection', (socket) => {
        console.log(`📡 لاعب اتصل بالسيرفر: ${socket.id}`);

        // 1. حدث دخول المجلس
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
                    playersCards: [[], [], [], []]
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

        // 2. 🤖 دالة بدء الصكة وتوزيع الورق الفوري وتشغيل دورة الشراء
        socket.on('start_game_with_bots', () => {
            let roomId = socket.roomId || "1000";
            if (!rooms[roomId]) return;
            let room = rooms[roomId];
            
            // تعبئة المقاعد الفارغة بالبوتات
            for (let i = 0; i < 4; i++) {
                if (!room.seats[i]) {
                    room.seats[i] = { socketId: 'bot_' + i, username: "🤖 بوت ديوانية " + (i+1) };
                }
            }
            
            room.gameStage = 'buying';
            room.buyRound = 1;
            room.currentTurn = 0; // الدور يبدأ عند مقعدك (أنت لاعب 0) لتظهر أزرارك فوراً!
            room.tableCards = [];
            
            // توليد وخلط الكروت
            let suits = ['♠', '♥', '♦', '♣'];
            let values = ['A', 'K', 'Q', 'J', '10', '9', '8', '7'];
            let fullDeck = [];
            suits.forEach(s => values.forEach(v => fullDeck.push({ suit: s, value: v })));
            fullDeck.sort(() => Math.random() - 0.5);
            
            // الكرت المكشوف للشراء في نصف الطاولة
            room.flipCard = fullDeck.pop();
            
            // توزيع 5 كروت لكل مقعد
            for (let i = 0; i < 4; i++) {
                room.playersCards[i] = [fullDeck.pop(), fullDeck.pop(), fullDeck.pop(), fullDeck.pop(), fullDeck.pop()];
            }
            
            // إرسال التحديث لإنعاش الشاشة واطلاق اللعب
            io.to(roomId).emit('room_updated', room);
            io.to(roomId).emit('game_state_changed', room);
        });

        // 3. 🎯 استقبال قرارات الشراء والتمرير (صن / حكم / بس) وتحريك الدور تلقائياً
        socket.on('player_buy_decision', (data) => {
            let roomId = socket.roomId || "1000";
            if (!rooms[roomId]) return;
            let room = rooms[roomId];

            // التأكد من أن اللاعب الذي أرسل القرار هو صاحب الدور فعلياً
            if (room.currentTurn !== data.seatIndex) return;

            if (data.decision === 'buy') {
                room.gameStage = 'playing';
                room.buyType = data.buyType;
                room.currentTurn = 0; // يبدأ اللعب الفعلي من أول لاعب
                console.log(`👑 تم شراء الصكة بنوع: ${data.buyType}`);
            } else {
                // إذا قال اللاعب "بس" أو "طوّف"، ينتقل الدور للي بعده
                room.currentTurn = (room.currentTurn + 1) % 4;
                
                // إذا دار الدور ورجع لـ 0، ننتقل للدورة الثانية من الشراء
                if (room.currentTurn === 0 && room.buyRound === 1) {
                    room.buyRound = 2;
                }
                
                // ذكاء البوت: إذا صار الدور على بوت، يطوّف تلقائياً عشان ما يعلق اللعب!
                checkAndRunBotTurns(room, roomId);
            }
            
            io.to(roomId).emit('game_state_changed', room);
        });

        // دالة مساعدة لجعل البوتات تطوّف الدور أوتوماتيكياً إذا جاء دورها بالشراء
        function checkAndRunBotTurns(room, roomId) {
            let attempts = 0;
            while (room.seats[room.currentTurn] && room.seats[room.currentTurn].socketId.startsWith('bot_') && room.gameStage === 'buying' && attempts < 4) {
                console.log(`🤖 البوت بمقعد ${room.currentTurn} يقول: بس/طوّف`);
                room.currentTurn = (room.currentTurn + 1) % 4;
                if (room.currentTurn === 0 && room.buyRound === 1) {
                    room.buyRound = 2;
                }
                attempts++;
            }
        }

        socket.on('send_chat_message', (data) => {
            let roomId = socket.roomId || "1000";
            if (rooms[roomId]) {
                let p = rooms[roomId].seats.find(s => s && s.socketId === socket.id);
                if (p) {
                    io.to(roomId).emit('receive_chat_message', { username: p.username, text: data.text });
                }
            }
        });

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
