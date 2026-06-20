module.exports = function(io) {
    let rooms = {};
    let mheibesRooms = {}; // مخزن غرف لعبة المحيبس المستقلة

    const cardValuesSun = { 'A': 11, '10': 10, 'K': 4, 'Q': 3, 'J': 2, '9': 0, '8': 0, '7': 0 };
    const rankOrderSun  = { 'A': 8, '10': 7, 'K': 6, 'Q': 5, 'J': 4, '9': 3, '8': 2, '7': 1 };
    const cardValuesTrump = { 'J': 20, '9': 14, 'A': 11, '10': 10, 'K': 4, 'Q': 3, '8': 0, '7': 0 };
    const rankOrderTrump  = { 'J': 8, '9': 7, 'A': 6, '10': 5, 'K': 4, 'Q': 3, '8': 2, '7': 1 };

    io.on('connection', (socket) => {
        
        // ==========================================
        // 🃏 كود محرك ديوانية البلوت الملوكي المصلح
        // ==========================================
        socket.on('join_matchmaking', (data) => {
            let roomId = "1000"; 
            if (!rooms[roomId]) {
                rooms[roomId] = {
                    roomId: roomId, seats: [null, null, null, null], gameStage: 'lobby',
                    scores: { team1: 0, team2: 0 }, currentTurn: 0, buyRound: 1, buyType: null,
                    buyerSeat: null, trumpSuit: null, tableCards: [], playersCards: [[], [], [], []],
                    deck: [], leadSuit: null, roundPoints: { team1: 0, team2: 0 }, trickCount: 0,
                    activeProjects: ["", "", "", ""], playerActionsText: ["", "", "", ""], passCount: 0,
                    dealerSeat: 3, isRoundEnding: false, isDouble: false, turnTimeout: null,
                    nashra: { trickPoints: { t1: 0, t2: 0 }, ground: { t1: 0, t2: 0 }, projects: { t1: 0, t2: 0 }, abnat: { t1: 0, t2: 0 }, gain: { t1: 0, t2: 0 } }
                };
            }
            let room = rooms[roomId];
            let existingSeat = room.seats.findIndex(s => s && s.socketId === socket.id);
            if (existingSeat === -1) {
                let freeSeat = room.seats.findIndex(s => s === null);
                if (freeSeat !== -1) {
                    room.seats[freeSeat] = { socketId: socket.id, username: data.username || "ملك البلوت", avatar: data.avatar || "m1.png" };
                    socket.join(roomId); socket.roomId = roomId;
                }
            }
            io.to(roomId).emit('room_updated', room);
            io.to(roomId).emit('game_state_changed', room);
        });

        socket.on('start_game_with_bots', () => { setupNewRound(socket.roomId || "1000"); });

        function setupNewRound(roomId) {
            if (!rooms[roomId]) return; let room = rooms[roomId];
            if (room.scores.team1 >= 152 || room.scores.team2 >= 152) {
                let winner = room.scores.team1 >= 152 ? "الفريق الأول (لنا)" : "الفريق الثاني (لهم)";
                io.to(roomId).emit('round_ended_announcement', { summary: `🏆 صكّة منتهية! الفائز: ${winner}`, scores: room.scores });
                room.scores = { team1: 0, team2: 0 };
            }
            if (room.turnTimeout) clearTimeout(room.turnTimeout);
            for (let i = 0; i < 4; i++) {
                if (!room.seats[i]) room.seats[i] = { socketId: 'bot_' + i, username: "🤖 بوت " + (i+1), avatar: "m2.png" };
            }
            room.gameStage = 'buying'; room.buyRound = 1; room.buyerSeat = null; room.buyType = null; room.trumpSuit = null; room.tableCards = []; room.trickCount = 0; room.passCount = 0; room.roundPoints = { team1: 0, team2: 0 }; room.activeProjects = ["", "", "", ""]; room.playerActionsText = ["", "", "", ""]; room.isRoundEnding = false; room.isDouble = false;
            room.nashra = { trickPoints: { t1: 0, t2: 0 }, ground: { t1: 0, t2: 0 }, projects: { t1: 0, t2: 0 }, abnat: { t1: 0, t2: 0 }, gain: { t1: 0, t2: 0 } };
            room.dealerSeat = (room.dealerSeat + 1) % 4; room.currentTurn = (room.dealerSeat + 1) % 4;
            let suits = ['♠', '♥', '♦', '♣'], values = ['A', 'K', 'Q', 'J', '10', '9', '8', '7'], fullDeck = [];
            suits.forEach(s => values.forEach(v => fullDeck.push({ suit: s, value: v }))); fullDeck.sort(() => Math.random() - 0.5); room.flipCard = fullDeck.pop();
            for (let i = 0; i < 4; i++) room.playersCards[i] = [fullDeck.pop(), fullDeck.pop(), fullDeck.pop(), fullDeck.pop(), fullDeck.pop()]; room.deck = fullDeck;
            io.to(roomId).emit('room_updated', room); io.to(roomId).emit('game_state_changed', room); startTurnTimer(room, roomId);
        }

        function startTurnTimer(room, roomId) {
            if (room.turnTimeout) clearTimeout(room.turnTimeout);
            let activePlayer = room.seats[room.currentTurn]; if (!activePlayer) return;
            if (activePlayer.socketId.startsWith('bot_')) {
                room.turnTimeout = setTimeout(() => { handleBotAction(room, roomId); }, 900);
            } else {
                room.turnTimeout = setTimeout(() => { handleBotAction(room, roomId); }, 10000);
            }
        }

        function handleBotAction(room, roomId) {
            if (room.gameStage === 'buying') autoExecuteBotBuying(room, roomId);
            else if (room.gameStage === 'double_round') { room.playerActionsText[room.currentTurn] = "بس 🛡️"; executeBuyTransition(room, roomId, room.buyType, room.buyerSeat); }
            else if (room.gameStage === 'playing') autoExecuteBotGameplay(room, roomId);
        }

        socket.on('player_buy_decision', (data) => {
            let room = rooms[socket.roomId || "1000"]; if (!room || room.currentTurn !== data.seatIndex) return;
            if (room.turnTimeout) clearTimeout(room.turnTimeout);
            if (room.gameStage === 'double_round') {
                if (data.decision === 'double') { room.isDouble = true; room.playerActionsText[data.seatIndex] = "⚔️ دبل!"; }
                else { room.playerActionsText[data.seatIndex] = "بس 🛡️"; }
                executeBuyTransition(room, socket.roomId, room.buyType, room.buyerSeat); return;
            }
            if (data.decision === 'buy') {
                room.buyerSeat = data.seatIndex; room.buyType = data.buyType;
                if (data.buyType === 'أشكل') { room.buyType = 'صن (أشكل)'; room.playerActionsText[data.seatIndex] = "👑 أشكل"; executeBuyTransition(room, socket.roomId, 'أشكل', data.seatIndex); }
                else if (data.buyType === 'حكم') { room.trumpSuit = room.flipCard.suit; room.playerActionsText[data.seatIndex] = "حكم 🃏"; triggerDoubleStage(room, socket.roomId, data.seatIndex); }
                else { room.trumpSuit = null; room.playerActionsText[data.seatIndex] = "صن 🚀"; executeBuyTransition(room, socket.roomId, 'صن', data.seatIndex); }
            } else {
                room.playerActionsText[room.currentTurn] = room.buyRound === 2 ? "ولا 🚫" : "بس 🛡️"; room.passCount++;
                if (room.passCount >= 8) { setupNewRound(socket.roomId); return; }
                room.currentTurn = (room.currentTurn + 1) % 4; if (room.passCount === 4) room.buyRound = 2;
                io.to(socket.roomId).emit('game_state_changed', room); startTurnTimer(room, socket.roomId);
            }
        });

        function triggerDoubleStage(room, roomId, buyerSeat) { room.gameStage = 'double_round'; room.currentTurn = (buyerSeat + 1) % 4; io.to(roomId).emit('game_state_changed', room); startTurnTimer(room, roomId); }

        function autoExecuteBotBuying(room, roomId) {
            if (room.flipCard && (room.flipCard.value === 'A' || room.flipCard.value === 'J') && Math.random() > 0.4) {
                room.buyerSeat = room.currentTurn; room.buyType = (room.flipCard.value === 'J') ? 'حكم' : 'صن';
                room.trumpSuit = (room.buyType === 'حكم') ? room.flipCard.suit : null; room.playerActionsText[room.currentTurn] = `${room.buyType}`;
                if (room.buyType === 'حكم') triggerDoubleStage(room, roomId, room.currentTurn); else executeBuyTransition(room, roomId, room.buyType, room.currentTurn);
            } else {
                room.playerActionsText[room.currentTurn] = room.buyRound === 2 ? "ولا 🚫" : "بس 🛡️"; room.passCount++;
                if (room.passCount >= 8) { setupNewRound(roomId); return; }
                room.currentTurn = (room.currentTurn + 1) % 4; if (room.passCount === 4) room.buyRound = 2;
                io.to(roomId).emit('game_state_changed', room); startTurnTimer(room, roomId);
            }
        }

        function executeBuyTransition(room, roomId, buyType, buyerIndex) {
            room.gameStage = 'playing'; let savedFlipCard = room.flipCard; room.flipCard = null;
            let cardReceiver = (buyType === 'أشكل') ? (buyerIndex + 2) % 4 : buyerIndex;
            for (let i = 0; i < 4; i++) {
                if (i === cardReceiver) { room.playersCards[i].push(savedFlipCard); room.playersCards[i].push(room.deck.pop()); room.playersCards[i].push(room.deck.pop()); }
                else { room.playersCards[i].push(room.deck.pop()); room.playersCards[i].push(room.deck.pop()); room.playersCards[i].push(room.deck.pop()); }
            }
            for (let i = 1; i < 4; i++) { if (Math.random() > 0.7) { room.activeProjects[i] = "سرا"; room.nashra.projects.t2 += 20; } }
            room.currentTurn = (room.dealerSeat + 1) % 4; io.to(roomId).emit('game_state_changed', room); startTurnTimer(room, roomId);
        }

        socket.on('play_card', (data) => {
            let room = rooms[socket.roomId || "1000"]; if (!room || room.currentTurn !== data.seatIndex) return;
            let hand = room.playersCards[data.seatIndex]; let idx = hand.findIndex(c => c.suit === data.card.suit && c.value === data.card.value);
            if (idx === -1) return; let chosenCard = hand[idx]; hand.splice(idx, 1);
            if (room.tableCards.length === 0) { room.leadSuit = chosenCard.suit; for(let i=0; i<4; i++) room.playerActionsText[i] = ""; }
            if (room.trickCount === 1 && room.tableCards.length === 0) {
                let bestSeat = room.activeProjects.findIndex(p => p !== "");
                if (bestSeat !== -1) io.to(socket.roomId).emit('project_reveal_broadcast', { seatIndex: bestSeat, text: room.activeProjects[bestSeat] });
            }
            room.tableCards.push({ seatIndex: data.seatIndex, card: chosenCard });
            if (room.tableCards.length === 4) handleTrickCompletion(room, socket.roomId);
            else { room.currentTurn = (room.currentTurn + 1) % 4; io.to(socket.roomId).emit('game_state_changed', room); startTurnTimer(room, socket.roomId); }
        });

        function handleTrickCompletion(room, roomId) {
            io.to(roomId).emit('game_state_changed', room);
            setTimeout(() => {
                let winnerSeat = determineActualWinner(room); room.trickCount++;
                let currentTeam = (winnerSeat === 0 || winnerSeat === 2) ? 't1' : 't2';
                room.nashra.trickPoints[currentTeam] += calculateActualTrickPoints(room);
                if (room.trickCount === 8) {
                    room.nashra.ground[currentTeam] += 10; room.gameStage = 'nashra';
                    room.nashra.abnat.t1 = room.nashra.trickPoints.t1 + room.nashra.ground.t1 + room.nashra.projects.t1;
                    room.nashra.abnat.t2 = room.nashra.trickPoints.t2 + room.nashra.ground.t2 + room.nashra.projects.t2;
                    room.scores.team1 += Math.floor(room.nashra.abnat.t1 / 10); room.scores.team2 += Math.floor(room.nashra.abnat.t2 / 10);
                    io.to(roomId).emit('game_state_changed', room); setTimeout(() => { setupNewRound(roomId); }, 5000);
                } else { room.tableCards = []; room.leadSuit = null; room.currentTurn = winnerSeat; io.to(roomId).emit('game_state_changed', room); startTurnTimer(room, roomId); }
            }, 900);
        }

        function determineActualWinner(room) {
            let bestCard = null;
            room.tableCards.forEach(item => {
                let score = (item.card.suit === room.leadSuit) ? rankOrderSun[item.card.value] : 0;
                if (bestCard === null || score > bestCard.score) bestCard = { score: score, seatIndex: item.seatIndex };
            });
            return bestCard ? bestCard.seatIndex : room.currentTurn;
        }

        function calculateActualTrickPoints(room) {
            let total = 0; room.tableCards.forEach(item => { total += (cardValuesSun[item.card.value] || 0); }); return total;
        }

        // ==========================================
        // ✊ كود محرك لعبة المحيبس الملحمية والمكالمات
        // ==========================================
        socket.on('join_mheibes', (data) => {
            let mRoomId = "mheibes_1000";
            if (!mheibesRooms[mRoomId]) {
                mheibesRooms[mRoomId] = { roomId: mRoomId, players: [], stage: 'waiting', seekerIdx: 0, hiderIdx: 1, winningHand: 'right' };
            }
            let mRoom = mheibesRooms[mRoomId];
            if (mRoom.players.length < 2) {
                mRoom.players.push({ socketId: socket.id, username: data.username, avatar: data.avatar, score: 0 });
                socket.join(mRoomId); socket.mRoomId = mRoomId;
            }
            if (mRoom.players.length === 1) {
                // إضافة بوت تلقائي ليكون هو الخصم إن كنت تلعب بمفردك
                mRoom.players.push({ socketId: 'bot_mheibes', username: "🤖 بو فهد (البوت)", avatar: "m2.png", score: 0 });
            }
            mRoom.stage = 'playing';
            mRoom.winningHand = Math.random() > 0.5 ? 'right' : 'left';
            io.to(mRoomId).emit('mheibes_state_changed', mRoom);
        });

        socket.on('mheibes_guess_attempt', (data) => {
            let mRoom = mheibesRooms[socket.mRoomId || "mheibes_1000"]; if (!mRoom) return;
            let isCorrect = (data.hand === mRoom.winningHand);
            
            if (isCorrect) {
                mRoom.players[mRoom.seekerIdx].score += 1;
                io.to(mRoom.roomId).emit('mheibes_round_result', { result: 'correct', winnerName: mRoom.players[mRoom.seekerIdx].username, hand: mRoom.winningHand });
            } else {
                mRoom.players[mRoom.hiderIdx].score += 1;
                io.to(mRoom.roomId).emit('mheibes_round_result', { result: 'wrong', winnerName: mRoom.players[mRoom.hiderIdx].username, hand: mRoom.winningHand });
            }

            // تبادل الأدوار تلقائياً للجولة التالية
            setTimeout(() => {
                let temp = mRoom.seekerIdx; mRoom.seekerIdx = mRoom.hiderIdx; mRoom.hiderIdx = temp;
                mRoom.winningHand = Math.random() > 0.5 ? 'right' : 'left';
                io.to(mRoom.roomId).emit('mheibes_state_changed', mRoom);
            }, 3000);
        });

        // قنوات بث الصوت المباشر لايف (Audio WebRTC / Voice Signaling)
        socket.on('voice_signaling_stream', (payload) => {
            socket.broadcast.to(socket.roomId || "1000").emit('voice_signaling_receive', payload);
        });

        socket.on('deliver_hospitality', (data) => {
            let room = rooms[socket.roomId || "1000"];
            io.to(socket.roomId || "1000").emit('hospitality_broadcast', { fromSeat: data.fromSeat, toSeat: data.toSeat, senderName: data.senderName || "لاعب فخم", item: data.item });
        });
    });
};
