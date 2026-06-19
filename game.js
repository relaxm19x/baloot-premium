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
                    dealerSeat: 3, isRoundEnding: false,
                    nashra: { trickPoints: { t1: 0, t2: 0 }, ground: { t1: 0, t2: 0 }, projects: { t1: 0, t2: 0 }, abnat: { t1: 0, t2: 0 }, gain: { t1: 0, t2: 0 } }
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
            room.isRoundEnding = false;
            
            room.nashra = { trickPoints: { t1: 0, t2: 0 }, ground: { t1: 0, t2: 0 }, projects: { t1: 0, t2: 0 }, abnat: { t1: 0, t2: 0 }, gain: { t1: 0, t2: 0 } };

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

            setTimeout(() => { checkAndRunBotBuying(room, roomId); }, 600);
        }

        socket.on('player_buy_decision', (data) => {
            let roomId = socket.roomId || "1000"; let room = rooms[roomId]; 
            if (!room || room.currentTurn !== data.seatIndex || room.gameStage !== 'buying') return;

            if (data.decision === 'buy') {
                room.buyerSeat = data.seatIndex;
                room.buyType = data.buyType;
                
                if (data.buyType === 'أشكل') {
                    room.buyType = 'صن (أشكل)'; room.trumpSuit = null;
                } else if (data.buyType === 'حكم ثاني') {
                    room.trumpSuit = room.flipCard.suit === '♠' ? '♥' : '♠'; 
                } else {
                    room.trumpSuit = (data.buyType === 'حكم') ? room.flipCard.suit : null;
                }
                
                room.playerActionsText[data.seatIndex] = `طلب: ${data.buyType}`;
                executeBuy(room, roomId, data.buyType, data.seatIndex);
            } else {
                room.playerActionsText[room.currentTurn] = room.buyRound === 2 ? "ولا 🚫" : "بس 🛡️"; 
                room.passCount++;
                
                if (room.passCount >= 8) {
                    io.to(roomId).emit('round_ended_announcement', { summary: "🔄 الكل قال (ولا)! إعادة التوزيع من جديد...", scores: room.scores });
                    setTimeout(() => { setupNewRound(roomId); }, 2000); 
                    return;
                }
                
                room.currentTurn = (room.currentTurn + 1) % 4;
                if (room.passCount === 4) room.buyRound = 2;
                
                io.to(roomId).emit('game_state_changed', room);
                
                // 🎯 تعديل الأمان: إضافة تأخير زمني بسيط عند التمرير لمنع تداخل العمليات وتجمد الشاشة
                setTimeout(() => {
                    checkAndRunBotBuying(room, roomId);
                }, 400);
            }
        });

        function checkAndRunBotBuying(room, roomId) {
            if (room.gameStage !== 'buying') return;
            let activePlayer = room.seats[room.currentTurn];
            if (!activePlayer || !activePlayer.socketId.startsWith('bot_')) return; // حماية صارمة لمنع الحلقات اللانهائية

            if (room.buyRound === 2 && (room.currentTurn === room.dealerSeat || room.currentTurn === (room.dealerSeat + 1) % 4)) {
                if (Math.random() > 0.7) {
                    room.buyerSeat = room.currentTurn; room.buyType = 'أشكل'; room.trumpSuit = null;
                    room.playerActionsText[room.currentTurn] = "طلب: أشكل 👑";
                    executeBuy(room, roomId, 'أشكل', room.currentTurn);
                    return;
                }
            }

            if (room.flipCard && (room.flipCard.value === 'A' || room.flipCard.value === 'J')) {
                room.buyerSeat = room.currentTurn; 
                room.buyType = (room.flipCard.value === 'J') ? 'حكم' : 'صن';
                room.trumpSuit = (room.buyType === 'حكم') ? room.flipCard.suit : null;
                room.playerActionsText[room.currentTurn] = `طلب: ${room.buyType}`;
                executeBuy(room, roomId, room.buyType, room.currentTurn);
            } else {
                room.playerActionsText[room.currentTurn] = room.buyRound === 2 ? "ولا 🚫" : "بس 🛡️"; 
                room.passCount++;
                if (room.passCount >= 8) { setupNewRound(roomId); return; }
                room.currentTurn = (room.currentTurn + 1) % 4;
                if (room.passCount === 4) room.buyRound = 2;
                
                io.to(roomId).emit('game_state_changed', room);
                
                setTimeout(() => { checkAndRunBotBuying(room, roomId); }, 400);
            }
        }

        function executeBuy(room, roomId, buyType, buyerIndex) {
            room.gameStage = 'playing';
            for(let i=0; i<4; i++) { room.playerActionsText[i] = ""; }
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
            if (room.seats[room.currentTurn].socketId.startsWith('bot_')) setTimeout(() => { makeAdvancedBotPlay(room, roomId); }, 500);
        }

        socket.on('declare_project_attempt', (data) => {
            let roomId = socket.roomId || "1000"; let room = rooms[roomId]; if (!room) return;
            if (data.projectType !== 'لا شيء') {
                room.activeProjects[data.seatIndex] = data.projectType;
                room.playerActionsText[data.seatIndex] = `مشروع: ${data.projectType}`;
                let pts = (data.projectType === 'سرا') ? 20 : (data.projectType === 'خمسين') ? 50 : 100;
                if (data.seatIndex === 0 || data.seatIndex === 2) room.nashra.projects.t1 += pts; else room.nashra.projects.t2 += pts;
            }
            io.to(roomId).emit('game_state_changed', room);
        });

        socket.on('play_card', (data) => {
            let roomId = socket.roomId || "1000"; let room = rooms[roomId]; 
            if (!room || room.currentTurn !== data.seatIndex || room.gameStage !== 'playing' || room.isRoundEnding) return;

            let hand = room.playersCards[data.seatIndex];
            let reqCard = data.card;
            if (!reqCard) return;

            let idx = hand.findIndex(c => c.suit === reqCard.suit && c.value === reqCard.value);
            if (idx === -1) return; 

            let chosenCard = hand[idx];
            hand.splice(idx, 1); 

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
            if (room.isRoundEnding) return;
            
            setTimeout(() => {
                let winnerSeat = determineActualWinner(room);
                let trickPoints = calculateActualTrickPoints(room);
                room.trickCount++;
                
                let currentTeam = (winnerSeat === 0 || winnerSeat === 2) ? 't1' : 't2';
                room.nashra.trickPoints[currentTeam] += trickPoints;

                if (room.trickCount === 8) {
                    room.nashra.ground[currentTeam] += 10; 
                }

                room.tableCards = []; room.leadSuit = null; room.currentTurn = winnerSeat; 

                if (room.trickCount === 8) {
                    room.isRoundEnding = true; 
                    
                    room.nashra.abnat.t1 = room.nashra.trickPoints.t1 + room.nashra.ground.t1 + room.nashra.projects.t1;
                    room.nashra.abnat.t2 = room.nashra.trickPoints.t2 + room.nashra.ground.t2 + room.nashra.projects.t2;
                    
                    let isSun = !room.trumpSuit;
                    let buyerTeam = (room.buyerSeat === 0 || room.buyerSeat === 2) ? 't1' : 't2';
                    let opponentTeam = buyerTeam === 't1' ? 't2' : 't1';

                    let totalAbnat = room.nashra.abnat.t1 + room.nashra.abnat.t2;
                    if (room.nashra.abnat[buyerTeam] < (totalAbnat / 2)) {
                        room.nashra.gain[buyerTeam] = 0;
                        room.nashra.gain[opponentTeam] = isSun ? 26 : 16;
                    } else {
                        if (isSun) {
                            room.nashra.gain.t1 = Math.round((Math.round(room.nashra.abnat.t1 / 10) * 10) * 2 / 10);
                            room.nashra.gain.t2 = Math.round((Math.round(room.nashra.abnat.t2 / 10) * 10) * 2 / 10);
                        } else {
                            room.nashra.gain.t1 = Math.floor(room.nashra.abnat.t1 / 10);
                            room.nashra.gain.t2 = Math.floor(room.nashra.abnat.t2 / 10);
                        }
                    }
                    
                    room.scores.team1 += room.nashra.gain.t1;
                    room.scores.team2 += room.nashra.gain.t2;
                    
                    room.gameStage = 'nashra'; 
                    io.to(roomId).emit('game_state_changed', room);
                    
                    setTimeout(() => { setupNewRound(roomId); }, 5500); 
                } else {
                    io.to(roomId).emit('game_state_changed', room);
                    checkAndRunBotGameplay(roomId);
                }
            }, 1200);
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
            let room = rooms[roomId]; 
            if (!room || room.gameStage !== 'playing' || room.tableCards.length >= 4 || room.isRoundEnding) return;
            if (room.seats[room.currentTurn].socketId.startsWith('bot_')) setTimeout(() => { makeAdvancedBotPlay(room, roomId); }, 600);
        }

        function makeAdvancedBotPlay(room, roomId) {
            if (room.isRoundEnding) return; 
            let hand = room.playersCards[room.currentTurn]; if (!hand || hand.length === 0) return;
            let chosenCard = null; let chosenIndex = 0;

            if (room.tableCards.length === 0) {
                let currentOrder = room.trumpSuit ? rankOrderTrump : rankOrderSun;
                hand.sort((a,b) => (currentOrder[b.value] || 0) - (currentOrder[a.value] || 0));
                chosenCard = hand[0];
            } else {
                let currentWinner = determineActualWinner(room);
                let isPartnerWinner = (currentWinner === (room.currentTurn + 2) % 4);
                let matchIndices = [];
                hand.forEach((c, idx) => { if(c.suit === room.leadSuit) matchIndices.push(idx); });
                
                if (matchIndices.length > 0) {
                    let currentOrder = room.trumpSuit ? rankOrderTrump : rankOrderSun;
                    if (isPartnerWinner) {
                        matchIndices.sort((a,b) => (currentOrder[hand[a].value] || 0) - (currentOrder[hand[b].value] || 0));
                    } else {
                        matchIndices.sort((a,b) => (currentOrder[hand[b].value] || 0) - (currentOrder[hand[a].value] || 0));
                    }
                    chosenIndex = matchIndices[0]; chosenCard = hand[chosenIndex];
                } else {
                    if (room.trumpSuit) {
                        let trumpIndices = [];
                        hand.forEach((c, idx) => { if(c.suit === room.trumpSuit) trumpIndices.push(idx); });
                        if (trumpIndices.length > 0 && !isPartnerWinner) {
                            chosenIndex = trumpIndices[0]; chosenCard = hand[chosenIndex];
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
                io.to(room.roomId).emit('hospitality_broadcast', { fromSeat: data.fromSeat, toSeat: data.toSeat, senderName: s.username, item: data.item });
            }
        });
    });
};
