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
            let roomId = "1000"; // الغرفة المشتركة الثابتة لك ولأخوك
            
            if (!rooms[roomId]) {
                rooms[roomId] = {
                    roomId: roomId,
                    seats: [null, null, null, null],
                    gameStage: 'lobby',
                    scores: { team1: 0, team2: 0 },
                    currentTurn: 0,
                    tableCards: [],
                    playersCards: [[], [], [], []]
                };
            }
            
            let targetRoom = rooms[roomId];
            
            // فحص إذا كان اللاعب موجوداً مسبقاً بنفس الـ socketId لمنع التكرار
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

        // 🎯 تحديث دالة البوتات الذكية للعب الجماعي (أنت وأخوك والبوتات)
        socket.on('start_game_with_bots', () => {
            let roomId = socket.roomId || "1000";
            if (!rooms[roomId]) return;
            let room = rooms[roomId];
            
            // تعبئة أي مقعد خالي متبقي ببوت ديوانية فوراً
            for (let i = 0; i < 4; i++) {
                if (!room.seats[i]) {
                    room.seats[i] = { socketId: 'bot_' + i, username: "🤖 بوت ديوانية " + (i+1) };
                }
            }
            
            room.gameStage = 'buying';
            room.buyRound = 1;
            room.currentTurn = 0; // يبدأ الدور عند مقعدك أنت
            
            // نظام توليد وخلط وتوزيع كروت البلوت أوتوماتيكياً فوراً
            let suits = ['♠', '♥', '♦', '♣'];
            let values = ['A', 'K', 'Q', 'J', '10', '9', '8', '7'];
            let fullDeck = [];
            
            suits.forEach(s => values.forEach(v => fullDeck.push({ suit: s, value: v })));
            
            // خلط الورق بشكل عشوائي صارم (Shuffle)
            fullDeck.sort(() => Math.random() - 0.5);
            
            // كرت الشراء المكشوف بالطاولة
            room.flipCard = fullDeck.pop();
            
            // توزيع الـ 5 كروت الأولى لكل مقعد (سواء لاعب حقيقي أو بوت)
            for (let i = 0; i < 4; i++) {
                room.playersCards[i] = [fullDeck.pop(), fullDeck.pop(), fullDeck.pop(), fullDeck.pop(), fullDeck.pop()];
            }
            
            // إرسال البيانات المحدثة لايف للمتصفحات لتبدأ الصكة فوراً!
            io.to(roomId).emit('room_updated', room);
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
                if (seatIndex !== -1) {
                    rooms[roomId].seats[seatIndex] = null;
                }
                io.to(roomId).emit('room_updated', rooms[roomId]);
            }
        });
    });
};
