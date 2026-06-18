let engine;
try {
    engine = require('./balootEngine');
} catch (e) {
    console.log("Engine source fallback loaded.");
}

module.exports = function(io) {
    let rooms = {};

    io.on('connection', (socket) => {
        // إدارة غرف اللعب وحسابات البوتات والتوزيع القانوني الملوكي الصارم
        socket.on('join_matchmaking', (data) => {
            let roomId = data.roomId || Math.floor(1000 + Math.random() * 9000).toString();
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
            let freeSeat = targetRoom.seats.findIndex(s => s === null);
            if (freeSeat !== -1) {
                targetRoom.seats[freeSeat] = { socketId: socket.id, username: data.username || "لاعب" };
                socket.join(roomId);
                socket.roomId = roomId;
                io.to(roomId).emit('room_updated', targetRoom);
            }
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

        socket.on('send_chat_message', (data) => {
            let roomId = socket.roomId;
            if (roomId && rooms[roomId]) {
                let p = rooms[roomId].seats.find(s => s && s.socketId === socket.id);
                if (p) {
                    io.to(roomId).emit('receive_chat_message', { username: p.username, text: data.text });
                }
            }
        });
    });
};
