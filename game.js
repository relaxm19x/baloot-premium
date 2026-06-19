module.exports = function(io) {
    let rooms = {};

    const cardValuesSun = { 'A': 11, '10': 10, 'K': 4, 'Q': 3, 'J': 2, '9': 0, '8': 0, '7': 0 };
    const rankOrderSun  = { 'A': 8, '10': 7, 'K': 6, 'Q': 5, 'J': 4, '9': 3, '8': 2, '7': 1 };
    
    const cardValuesTrump = { 'J': 20, '9': 14, 'A': 11, '10': 10, 'K': 4, 'Q': 3, '8': 0, '7': 0 };
    const rankOrderTrump  = { 'J': 8, '9': 7, 'A': 6, '10': 5, 'K': 4, 'Q': 3, '8': 2, '7': 1 };

    io.on('connection', (socket) => {
        
        socket.on('join_matchmaking', (data) => {
            let roomId = "1000"; 
            if (!rooms[roomId]) {
                rooms[roomId] = {
                    roomId: roomId, seats: [null, null, null, null], gameStage: 'lobby',
                    scores: { team1: 0, team2: 0 }, currentTurn: 0, buyRound: 1, buyType: null,
                    buyerSeat: null, trumpSuit: null, tableCards: [], playersCards: [[], [], [], []],
                    deck: [], leadSuit: null, roundPoints: { team1: 0, team2: 0 }, trickCount: 0,
                    activeProjects: ["", "", "", ""], playerActionsText: ["", "", "", ""], passCount: 0,
                    dealerSeat: 3
                };
            }
            let room = rooms[roomId];
            let existingSeat = room.seats.findIndex(s => s && s.socketId === socket.id);
            if (existingSeat === -1) {
                let freeSeat = room.seats.findIndex(s => s === null);
                if (freeSeat !== -1) {
                    room.seats[freeSeat] = { socketId: socket.id, username: data.username || "ملك البلوت" };
                    socket.join(roomId); socket.roomId = roomId;
                }
            }
            io.to(roomId).emit('room_updated', room);
            io.to(roomId).emit('game_state_changed', room);
        });

        socket.on('start_game_with_bots', () => {
            let roomId = socket.roomId || "1000";
            setupNewRound(roomId);
        });

        function setupNewRound(roomId) {
            if (!rooms[roomId]) return;
            let room = rooms[roomId];
            for (let i = 0; i < 4; i++) {
                if (!room.seats[i]) room.seats[i] = { socketId: 'bot_' + i, username: "🤖 بوت " + (i+1) };
            }
            room.gameStage = 'buying'; room.buyRound = 1; room.buyerSeat = null;
            room.buyType = null; room.trumpSuit = null; room.tableCards = []; room.trickCount = 0; room.passCount = 0;
            room.roundPoints = { team1: 0, team2: 0 }; room.activeProjects = ["", "", "", ""]; room.playerActionsText = ["", "", "", ""];
            
            room.dealerSeat = (room.dealerSeat + 1) % 4;
            room.currentTurn = (room.dealerSeat + 1) % 4;

            let suits = ['♠', '♥', '♦', '♣'];
            let values = ['A', 'K', 'Q', 'J', '10', '9', '8', '7'];
            let fullDeck = [];
            suits.forEach(s => values.forEach(v => fullDeck.push({ suit: s, value: v })));
            fullDeck.sort(() => Math.random() - 0.5);
            room.flipCard = fullDeck.pop();

            for (let i = 0; i < 4; i++) room.playersCards[i] = [fullDeck.pop(), fullDeck.pop(), fullDeck.pop(), fullDeck.pop(), fullDeck.pop()];
            room.deck = fullDeck;

            io.to(roomId).emit('room_updated', room);
            io.to(roomId).emit('game_state_changed', room);

            // 🎯 الحل السحري: إعطاء تأخير زمني تأميني بنصف ثانية قبل بدء فحص البوتات للشراء لمنع تعليق الـ 5 كروت!
            setTimeout(() => {
                checkAndRunBotBuying(room, roomId);
            }, 500);
        }

        socket.on('player_buy_decision', (data) => {
            let roomId = socket.roomId || "1000"; let room = rooms[roomId]; if (!room || room.currentTurn !== data.seatIndex) return;

            if (data.decision === 'buy') {
                room.buyerSeat = data.seatIndex;
                room.buyType = data.buyType;
                if (data.buyType === 'أشكل') {
                    room.buyType = 'صن (أشكل)'; room.trumpSuit = null;
                } else {
                    room.trumpSuit = (data.buyType === 'حكم') ? room.flipCard.suit : null;
                }
                room.playerActionsText[data.seatIndex] = `طلب: ${data.buyType}`;
                executeBuy(room, roomId, data.buyType, data.seatIndex);
            } else {
                room.playerActionsText[room.currentTurn] = "بس 🛡️"; room.passCount++;
                if (room.passCount >= 8) {
                    io.to(roomId).emit('round_ended_announcement', { summary: "🔄 الكل بس! جاري إعادة التوزيع...", scores: room.scores });
                    setTimeout(() => { setupNewRound(roomId); }, 2000); return;
                }
                room.currentTurn = (room.currentTurn + 1) % 4;
                if (room.passCount === 4) room.buyRound = 2;
                io.to(roomId).emit('game_state_changed', room);
                checkAndRunBotBuying(room, roomId);
            }
        });

        function checkAndRunBotBuying(room, roomId) {
            if (room.gameStage !== 'buying') return;
            let activePlayer = room.seats[room.currentTurn];
            if (activePlayer && activePlayer.socketId.startsWith('bot_')) {
                setTimeout(() => {
                    if (room.flipCard && (room.flipCard.value === 'A' || room.flipCard.value === 'J')) {
                        room.buyerSeat = room.currentTurn; 
                        room.buyType = (room.flipCard.value === 'J') ? 'حكم' : 'صن';
                        room.trumpSuit = (room.buyType === 'حكم') ? room.flipCard.suit : null;
                        room.playerActionsText[room.currentTurn] = `طلب: ${room.buyType}`;
                        executeBuy(room, roomId, room.buyType, room.currentTurn);
                    } else {
                        room.playerActionsText[room.currentTurn] = "بس 🛡️"; room.passCount++;
                        if (room.passCount >= 8) { setupNewRound(roomId); return; }
                        room.currentTurn = (room.currentTurn + 1) % 4;
                        if (room.passCount === 4) room.buyRound = 2;
                        io.to(roomId).emit('game_state_changed', room);
                        checkAndRunBotBuying(room, roomId);
                    }
                }, 600);
            }
        }

        function executeBuy(room, roomId, buyType, buyerIndex) {
            room.gameStage = 'playing';
            for(let i=0; i<4; i++) { if(room.playerActionsText[i] === "بس 🛡️") room.playerActionsText[i] = ""; }
            let savedFlipCard = room.flipCard; room.flipCard = null;

            let cardReceiver = buyerIndex;
            if (buyType === 'أشكل') cardReceiver = (buyerIndex + 2) % 4;

            for (let i = 0; i < 4; i++) {
                if (i === cardReceiver) {
                    room.playersCards[i].push(savedFlipCard);
                    room.playersCards[i].push(room.deck.pop()); room.playersCards[i].push(room.deck.pop());
                } else if (i === buyerIndex && buyType === 'أشكل') {
                    room.playersCards[i].push(room.deck.pop()); room.playersCards[i].push(room.deck.pop()); room.playersCards[i].push(room.deck.pop());
                } else {
                    room.playersCards[i].push(room.deck.pop()); room.playersCards[i].push(room.deck.pop()); room.playersCards[i].push(room.deck.pop());
                }
            }
            room.currentTurn = (room.dealerSeat + 1) % 4;
            io.to(roomId).emit('game_state_changed', room);
            if (room.seats[room.currentTurn].socketId.startsWith('bot_')) makeAdvancedBotPlay(room, roomId);
        }

        socket.on('declare_project_attempt', (data) => {
            let roomId = socket.roomId || "1000"; let room = rooms[roomId]; if (!room) return;
            if (data.projectType !== 'لا شيء') {
                room.activeProjects[data.seatIndex] = data.projectType;
                room.playerActionsText[data.seatIndex] = `مشروع: ${data.projectType}`;
                let pts = (data.projectType === 'سرا') ? 4 : (data.projectType === 'خمسين') ? 10 : 20;
                if (data.seatIndex === 0 || data.seatIndex === 2) room.roundPoints.team1 += pts; else room.roundPoints.team2 += pts;
            }
            io.to(roomId).emit('game_state_changed', room);
        });

        socket.on('play_card', (data) => {
            let roomId = socket.roomId || "1000"; let room = rooms[roomId]; 
            if (!room || room.currentTurn !== data.seatIndex) return;

            let hand = room.playersCards[data.seatIndex];
            let cardIndex = data.cardIndex;
            let chosenCard = null;

            if (cardIndex !== undefined && cardIndex >= 0 && cardIndex < hand.length) {
                chosenCard = hand[cardIndex];
                hand.splice(cardIndex, 1); 
            } else if (data.card) {
                let idx = hand.findIndex(c => c.suit === data.card.suit && c.value === data.card.value);
                if (idx !== -1) {
                    chosenCard = hand[idx];
                    hand.splice(idx, 1);
                }
            }

            if (!chosenCard) return;

            if (room.tableCards.length === 0) { 
                for(let i=0; i<4; i++) room.playerActionsText[i] = ""; 
                room.leadSuit = chosenCard.suit; 
            }

            room.tableCards.push({ seatIndex: data.seatIndex, card: chosenCard });
            io.to(roomId).emit('game_state_changed', room);
            
            if (room.tableCards.length === 4) {
                handleTrickCompletion(room, roomId);
            } else {
                room.currentTurn = (room.currentTurn + 1) % 4;
                io.to(roomId).emit('game_state_changed', room);
                checkAndRunBotGameplay(roomId);
            }
        });

        function handleTrickCompletion(room, roomId) {
            setTimeout(() => {
                let winnerSeat = determineActualWinner(room);
                let trickPoints = calculateActualTrickPoints(room);
                room.trickCount++;
                if (room.trickCount === 8) trickPoints += 10;

                if (winnerSeat === 0 || winnerSeat === 2) room.roundPoints.team1 += trickPoints;
                else room.roundPoints.team2 += trickPoints;

                room.tableCards = []; room.leadSuit = null; room.currentTurn = winnerSeat;

                if (room.trickCount === 8) {
                    let t1Gain = Math.round(room.roundPoints.team1 / 10);
                    let t2Gain = Math.round(room.roundPoints.team2 / 10);
                    room.scores.team1 += t1Gain; room.scores.team2 += t2Gain;
                    io.to(roomId).emit('round_ended_announcement', { summary: `🏁 القيد النهائي: لنا +${t1Gain} | لهم +${t2Gain}.`, scores: room.scores });
                    setTimeout(() => { setupNewRound(roomId); }, 3500);
                } else {
                    io.to(roomId).emit('game_state_changed', room);
                    if (room.gameStage === 'playing') checkAndRunBotGameplay(roomId);
                }
            }, 1500);
        }

        function determineActualWinner(room) {
            let bestCard = null; let winnerSeat = room.currentTurn;
            room.tableCards.forEach(item => {
                let score = 0;
                if (room.trumpSuit && item.card.suit === room.trumpSuit) {
                    score = (rankOrderTrump[item.card.value] || 0) + 50; 
                } else if (item.card.suit === room.leadSuit) {
                    score = (rankOrderSun[item.card.value] || 0);
                }
                if (bestCard === null || score > bestCard.score) { bestCard = { score: score, seatIndex: item.seatIndex }; }
            });
            return bestCard ? bestCard.seatIndex : winnerSeat;
        }

        function calculateActualTrickPoints(room) {
            let total = 0;
            room.tableCards.forEach(item => {
                if (room.trumpSuit && item.card.suit === room.trumpSuit) total += (cardValuesTrump[item.card.value] || 0);
                else total += (cardValuesSun[item.card.value] || 0);
            });
            return total;
        }

        function checkAndRunBotGameplay(roomId) {
            let room = rooms[roomId]; if (!room || room.gameStage !== 'playing' || room.tableCards.length >= 4) return;
            if (room.seats[room.currentTurn].socketId.startsWith('bot_')) setTimeout(() => { makeAdvancedBotPlay(room, roomId); }, 600);
        }

        function makeAdvancedBotPlay(room, roomId) {
            let hand = room.playersCards[room.currentTurn]; if (!hand || hand.length === 0) return;
            let chosenCard = null;
            let chosenIndex = 0;

            if (room.tableCards.length === 0) {
                hand.sort((a,b) => (rankOrderSun[b.value] || 0) - (rankOrderSun[a.value] || 0));
                chosenCard = hand[0];
            } else {
                let currentWinner = determineActualWinner(room);
                let isPartnerWinner = (currentWinner === (room.currentTurn + 2) % 4);
                let matchIndices = [];
                hand.forEach((c, idx) => { if(c.suit === room.leadSuit) matchIndices.push(idx); });
                
                if (matchIndices.length > 0) {
                    if (isPartnerWinner) {
                        matchIndices.sort((a,b) => (rankOrderSun[hand[a].value] || 0) - (rankOrderSun[hand[b].value] || 0));
                    } else {
                        matchIndices.sort((a,b) => (rankOrderSun[hand[b].value] || 0) - (rankOrderSun[hand[a].value] || 0));
                    }
                    chosenIndex = matchIndices[0];
                    chosenCard = hand[chosenIndex];
                } else {
                    if (room.trumpSuit) {
                        let trumpIndices = [];
                        hand.forEach((c, idx) => { if(c.suit === room.trumpSuit) trumpIndices.push(idx); });
                        if (trumpIndices.length > 0 && !isPartnerWinner) {
                            chosenIndex = trumpIndices[0];
                            chosenCard = hand[chosenIndex];
                        }
                    }
                }
            }

            if (!chosenCard) { chosenCard = hand[0]; chosenIndex = 0; }

            hand.splice(chosenIndex, 1); 

            if (room.tableCards.length === 0) room.leadSuit = chosenCard.suit;
            room.tableCards.push({ seatIndex: room.currentTurn, card: chosenCard });
            io.to(roomId).emit('game_state_changed', room);
            
            if (room.tableCards.length === 4) handleTrickCompletion(room, roomId);
            else { room.currentTurn = (room.currentTurn + 1) % 4; io.to(roomId).emit('game_state_changed', room); checkAndRunBotGameplay(roomId); }
        }

        socket.on('deliver_hospitality', (data) => {
            let room = rooms[socket.roomId || "1000"]; if (!room) return;
            let s = room.seats[data.fromSeat];
            if (s) {
                io.to(room.roomId).emit('hospitality_broadcast', { 
                    fromSeat: data.fromSeat, 
                    toSeat: data.toSeat, 
                    senderName: s.username, 
                    item: data.item 
                });
            }
        });
    });
};
