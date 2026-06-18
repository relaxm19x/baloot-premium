let engine;
try {
    engine = require('./balootEngine');
} catch (e) {
    console.log("Engine source fallback loaded.");
}

module.exports = function(io) {
    let rooms = {};

    io.on('connection', (socket) => {
        console.log(`📡 لاعب جديد اتصل بالسيرفر: ${socket.id}`);

        // 🎯 حدث دخول مجلس الصكة
        socket.on('join_matchmaking', (data) => {
            let roomId = data.roomId || "1000"; // تثبيت غرفة افتراضية مؤقتاً للتجربة السريعة
            
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
            
            // فحص إذا كان اللاعب موجوداً مسبقاً لمنع التكرار
            let existingSeat = targetRoom.seats.findIndex(s => s && s.socketId === socket.id);
            
            if (existingSeat === -1) {
                let freeSeat = targetRoom.seats.findIndex(s => s === null);
                if (freeSeat !== -1) {
                    targetRoom.seats[freeSeat] = { socketId: socket.id, username: data.username || "لاعب ملوكي" };
                    socket.join(roomId);
                    socket.roomId = roomId;
                }
            }
            
            // إرسال التحديث فوراً لجميع المتصلين في الغرفة
            io.to(roomId).emit('room_updated', targetRoom);
            io.to(roomId).emit('game_state_changed', targetRoom);
        });

        socket.on('start_game_with_bots', () => {
            let roomId = socket.roomId;
            if (!roomId || !rooms[roomId]) return;
            let room = rooms[roomId];
            
            for (let i = 0; i < 4; i++) {
                if (!room.seats[i]) {
                    room.seats[i] = { socketId: 'bot_' + i, username: "🤖 بوت ديوانية " + (i+1) };
                }
            }
            room.gameStage = 'buying';
            room.buyRound = 1;
            
            if (engine && engine.createDeck) {
                let deck = engine.shuffleDeck(engine.createDeck());
                room.flipCard = deck.pop();
                for (let i = 0; i < 4; i++) {
                    room.playersCards[i] = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()];
                }
            }
            
            io.to(roomId).emit('room_updated', room);
            io.to(roomId).emit('game_state_changed', room);
        });

        socket.on('disconnect', () => {
            console.log(`🔌 لاعب فصل من السيرفر: ${socket.id}`);
        });
    });
};
