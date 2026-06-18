let engine;
try {
    engine = require('./balootEngine');
} catch (e) {
    console.log("Engine fallback active.");
}

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
                    tableCards: [],
                    playersCards: [[], [], [], []]
                };
            }
            
            let targetRoom = rooms[roomId];
            let existingSeat = targetRoom.seats.findIndex(s => s && s.socketId === socket.id);
            
            if (existingSeat === -1) {
                let freeSeat = targetRoom.seats.findIndex(s => s === null);
                if (freeSeat !== -1) {
                    targetRoom.seats[freeSeat] = { socketId: socket.id, username: data.username || "لاعب ملوكي" };
                    socket.join(roomId);
                    socket.roomId = roomId;
                }
            }
            
            io.to(roomId).emit('room_updated', targetRoom);
            io.to(roomId).emit('game_state_changed', targetRoom);
        });

        // 🎯 الدالة الذكية والمطورة لتوزيع الورق وإطلاق أزرار الشراء فوراً
        socket.on('start_game_with_bots', () => {
            let roomId = socket.roomId || "1000";
            if (!rooms[roomId]) return;
            let room = rooms[roomId];
            
            // تعبئة المقاعد الخالية ببوتات الديوانية
            for (let i = 0; i < 4; i++) {
                if (!room.seats[i]) {
                    room.seats[i] = { socketId: 'bot_' + i, username: "🤖 بوت " + (i+1) };
                }
            }
            
            // ضبط حالة اللعبة وبدء دورة الشراء الأولى فوراً
            room.gameStage = 'buying';
            room.buyRound = 1;
            room.currentTurn = 0; // يبدأ الدور عندك أنت (مقعد 0) لإطلاق الأزرار
            
            // توليد الكروت وخلطها
            let suits = ['♠', '♥', '♦', '♣'];
            let values = ['A', 'K', 'Q', 'J', '10', '9', '8', '7'];
            let fullDeck = [];
            suits.forEach(s => values.forEach(v => fullDeck.push({ suit: s, value: v })));
            fullDeck.sort(() => Math.random() - 0.5);
            
            // كرت الشراء المكشوف في وسط الطاولة
            room.flipCard = fullDeck.pop();
            
            // توزيع الـ 5 كروت لكل لاعب
            for (let i = 0; i < 4; i++) {
                room.playersCards[i] = [fullDeck.pop(), fullDeck.pop(), fullDeck.pop(), fullDeck.pop(), fullDeck.pop()];
            }
            
            // 🚀 إرسال التحديث الصارم فوراً للجميع لتفعيل أزرار (صن / حكم / بس) لايف!
            io.to(roomId).emit('room_updated', room);
            io.to(roomId).emit('game_state_changed', room);
        });

        // معالجة قرارات الشراء والتمرير من اللاعبين
        socket.on('player_buy_decision', (data) => {
            let roomId = socket.roomId || "1000";
            if (!rooms[roomId]) return;
            let room = rooms[roomId];

            if (data.decision === 'buy') {
                room.gameStage = 'playing';
                room.buyType = data.buyType;
                // هنا تبدأ الصكة الفعلية بعد الشراء
            } else {
                // الانتقال للاعب التالي في حال قال "بس" أو "طوّف"
                room.currentTurn = (room.currentTurn + 1) % 4;
                if (room.currentTurn === 0 && room.buyRound === 1) {
                    room.buyRound = 2; // الانتقال للدورة الثانية
                }
            }
            io.to(roomId).emit('game_state_changed', room);
        });

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
