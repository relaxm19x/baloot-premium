let engine;
try {
    engine = require('./balootEngine');
} catch (e) {
    console.log("Engine source loaded from fallback.");
}

module.exports = function(io) {
    let rooms = {};

    io.on('connection', (socket) => {
        console.log(`📡 لاعب اتصل بالسيرفر: ${socket.id}`);

        // حدث دخول المجلس وحجز المقعد
        socket.on('join_matchmaking', (data) => {
            let roomId = "1000"; // الغرفة الافتراضية الثابتة للتجربة الحالية
            
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

        // 🎯 الحدث السحري لتعبئة الطاولة بالبوتات وتوزيع الورق فوراً
        socket.on('start_game_with_bots', () => {
            let roomId = socket.roomId || "1000";
            if (!rooms[roomId]) return;
            let room = rooms[roomId];
            
            // تعبئة المقاعد الخالية ببوتات الديوانية فوراً
            for (let i = 0; i < 4; i++) {
                if (!room.seats[i]) {
                    room.seats[i] = { socketId: 'bot_' + i, username: "🤖 بوت ديوانية " + (i+1) };
                }
            }
            
            room.gameStage = 'buying';
            room.buyRound = 1;
            room.currentTurn = 0; // يبدأ الدور عندك
            
            // محاكاة وإنشاء ورق اللعب والتوزيع الملوكي الصارم للـ 5 كروت الأولى
            if (engine && typeof engine.createDeck === 'function') {
                let deck = engine.shuffleDeck(engine.createDeck());
                room.flipCard = deck.pop(); // كرت الشراء
                for (let i = 0; i < 4; i++) {
                    room.playersCards[i] = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()];
                }
            } else {
                // نظام احتياطي للتوزيع في حال لم يجد ملف المحرك
                let suits = ['♠', '♥', '♦', '♣'];
                let values = ['A', 'K', 'Q', 'J', '10', '9', '8', '7'];
                let dummyDeck = [];
                suits.forEach(s => values.forEach(v => dummyDeck.push({ suit: s, value: v })));
                
                // خلط ورك صوري سريع
                dummyDeck.sort(() => Math.random() - 0.5);
                room.flipCard = dummyDeck.pop();
                for (let i = 0; i < 4; i++) {
                    room.playersCards[i] = [dummyDeck.pop(), dummyDeck.pop(), dummyDeck.pop(), dummyDeck.pop(), dummyDeck.pop()];
                }
            }
            
            // إرسال البيانات المحدثة أونلاين لتظهر الكروت فوراً على الشاشة!
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
                if (seatIndex !== -1) { rooms[roomId].seats[seatIndex] = null; }
                io.to(roomId).emit('room_updated', rooms[roomId]);
            }
        });
    });
};
