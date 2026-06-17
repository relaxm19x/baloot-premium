const { createDeck, shuffleDeck, dealInitialCards, dealRemainingCards, determineTrickWinner, isValidMove, checkPlayerProjects } = require('../engines/balootEngine');

let activeRooms = {}; 

module.exports = function(io) {
    io.on('connection', (socket) => {

        socket.on('join_matchmaking', (userData) => {
            const { username, roomId } = userData;
            let targetRoomId = roomId || `room_${Math.floor(1000 + Math.random() * 9000)}`;

            if (!activeRooms[targetRoomId]) {
                activeRooms[targetRoomId] = {
                    roomId: targetRoomId, players: [], seats: [null, null, null, null], gameStarted: false,
                    dealerIndex: 0, currentTurn: 1, gameStage: 'buying', buyRound: 1, buyType: null, buyerSeat: null,
                    trumpSuit: null, deck: [], flipCard: null, playersCards: {}, playedCardsOnTable: [],
                    scores: { team1: 0, team2: 0 }, passCount: 0, tricksPlayed: 0,
                    roundPoints: { team1: 0, team2: 0 }, projectPoints: { team1: 0, team2: 0 }, declaredProjects: {}
                };
            }

            const room = activeRooms[targetRoomId];
            if (room.players.filter(p => !p.isBot).length >= 4) {
                socket.emit('invalid_move_alert', { message: "⚠️ عذراً، الطاولة ممتلئة!" });
                return;
            }

            let assignedSeat = -1;
            for (let i = 0; i < 4; i++) {
                if (room.seats[i] === null) {
                    assignedSeat = i;
                    room.seats[i] = { socketId: socket.id, username: username, seatIndex: i, isBot: false };
                    break;
                }
            }
            if (assignedSeat === -1) return;

            room.players.push({ socketId: socket.id, username: username, seatIndex: assignedSeat, isBot: false });
            socket.join(targetRoomId); socket.currentRoom = targetRoomId; socket.username = username; socket.seatIndex = assignedSeat;
            io.to(targetRoomId).emit('room_updated', { roomId: targetRoomId, seats: room.seats, playersCount: room.players.length });
        });

        socket.on('start_game_with_bots', () => {
            const roomId = socket.currentRoom; if (!roomId || !activeRooms[roomId]) return;
            const room = activeRooms[roomId]; if (room.gameStarted) return;

            const botNames = ["بوت_الكويتي", "أبو_نايف_AI", "صقر_الخليج"];
            let botIndex = 0;
            for (let i = 0; i < 4; i++) {
                if (room.seats[i] === null) {
                    room.seats[i] = { socketId: `bot_${Math.random()}`, username: botNames[botIndex] || `بوت_${i}`, seatIndex: i, isBot: true };
                    room.players.push({ socketId: room.seats[i].socketId, username: room.seats[i].username, seatIndex: i, isBot: true });
                    botIndex++;
                }
            }
            io.to(roomId).emit('room_updated', { roomId: room.roomId, seats: room.seats, playersCount: room.players.length });
            triggerStartGame(roomId);
        });

        function triggerStartGame(roomId) {
            const room = activeRooms[roomId]; if (!room) return;
            room.gameStarted = true; room.gameStage = 'buying'; room.buyRound = 1; room.buyType = null; room.buyerSeat = null; room.trumpSuit = null; room.playedCardsOnTable = []; room.passCount = 0; room.tricksPlayed = 0; room.roundPoints = { team1: 0, team2: 0 }; room.projectPoints = { team1: 0, team2: 0 }; room.declaredProjects = {};
            room.deck = shuffleDeck(createDeck());
            const { playersCards, flipCard, remainingDeck } = dealInitialCards(room.deck);
            room.flipCard = flipCard; room.deck = remainingDeck; room.playersCards = playersCards;
            room.currentTurn = (room.dealerIndex + 1) % 4;

            io.to(roomId).emit('game_state_changed', {
                status: 'buying_stage', gameStage: room.gameStage, buyRound: room.buyRound, flipCard: room.flipCard, currentTurn: room.currentTurn, playersCards: room.playersCards, tableCards: [], scores: room.scores, trumpSuit: room.trumpSuit
            });
            checkAndTriggerBotAction(roomId);
        }

        function checkAndTriggerBotAction(roomId) {
            const room = activeRooms[roomId]; if (!room || !room.gameStarted) return;
            const currentSeat = room.seats[room.currentTurn];
            if (room.gameStage === 'playing' && currentSeat && !currentSeat.isBot) return;

            if (currentSeat && currentSeat.isBot) {
                setTimeout(() => {
                    if (!activeRooms[roomId]) return;
                    if (room.gameStage === 'buying') {
                        if(room.flipCard.value === 'A' || room.flipCard.value === '10') {
                            executeBuyDecision(roomId, room.currentTurn, 'صن');
                        } else {
                            handlePassDecision(roomId, room.currentTurn);
                        }
                    } 
                    else if (room.gameStage === 'playing') {
                        let botHand = room.playersCards[room.currentTurn] || [];
                        if (botHand.length > 0) {
                            let allowedCards = botHand.map((c, idx) => ({ card: c, index: idx })).filter(item => isValidMove(item.card, botHand, room.playedCardsOnTable, room.buyType, room.trumpSuit));
                            if (allowedCards.length === 0) allowedCards = botHand.map((c, idx) => ({ card: c, index: idx }));
                            let chosenIndex = allowedCards[0].index;
                            let thrownCard = botHand.splice(chosenIndex, 1)[0]; 
                            handleCardPlacement(roomId, room.currentTurn, thrownCard);
                        }
                    }
                }, 1000);
            }
        }

        function handlePassDecision(roomId, seatIndex) {
            const room = activeRooms[roomId]; if (!room) return;
            room.passCount++;
            
            if (room.passCount === 4 && room.buyRound === 1) {
                room.buyRound = 2; room.passCount = 0;
                room.currentTurn = (room.dealerIndex + 1) % 4;
                io.to(roomId).emit('game_state_changed', { status: 'buying_stage', gameStage: room.gameStage, buyRound: room.buyRound, flipCard: room.flipCard, currentTurn: room.currentTurn, playersCards: room.playersCards, tableCards: [], scores: room.scores, trumpSuit: room.trumpSuit });
                checkAndTriggerBotAction(roomId);
                return;
            }

            if (room.passCount === 4 && room.buyRound === 2) {
                room.dealerIndex = (room.dealerIndex + 1) % 4;
                triggerStartGame(roomId);
                return;
            }

            room.currentTurn = (room.currentTurn + 1) % 4;
            io.to(roomId).emit('game_state_changed', { status: 'buying_stage', gameStage: room.gameStage, buyRound: room.buyRound, flipCard: room.flipCard, currentTurn: room.currentTurn, playersCards: room.playersCards, tableCards: [], scores: room.scores, trumpSuit: room.trumpSuit });
            checkAndTriggerBotAction(roomId);
        }

        function executeBuyDecision(roomId, seatIndex, buyType) {
            const room = activeRooms[roomId];
            
            // 🎯 تفكيك وفرز زات الحكَم الثاني المختار يدوياً من بومحمد
            if (buyType.startsWith('حكم_ثاني_')) {
                room.buyType = 'حكم';
                room.trumpSuit = buyType.split('_')[2]; // قص الرمز المختار (♠, ♥, ♦, ♣)
                io.to(roomId).emit('receive_chat_message', { username: "المجلس", text: `🃏 طلب اللاعب حكم ثاني على زات الـ ( ${room.trumpSuit} )!` });
            } else {
                room.buyType = (buyType === 'أشكل') ? 'حكم' : buyType; 
                if (buyType === 'حكم' || buyType === 'أشكل') { room.trumpSuit = room.flipCard.suit; }
                else { room.trumpSuit = null; }
            }

            room.buyerSeat = seatIndex; room.gameStage = 'playing';
            room.playersCards[seatIndex].push(room.flipCard);
            
            const { playersCardsUpdate, remainingDeck } = dealRemainingCards(room.deck, seatIndex);
            room.deck = remainingDeck;
            for(let i=0; i<4; i++) {
                room.playersCards[i] = [...(room.playersCards[i] || []), ...(playersCardsUpdate[i] || [])];
            }

            room.currentTurn = (room.buyerSeat) % 4;
            io.to(roomId).emit('game_state_changed', { status: 'playing_stage', gameStage: room.gameStage, buyType: room.buyType, currentTurn: room.currentTurn, playersCards: room.playersCards, tableCards: [], scores: room.scores, trumpSuit: room.trumpSuit });
            checkAndTriggerBotAction(roomId);
        }

        socket.on('player_buy_decision', (data) => {
            const roomId = socket.currentRoom; if (!roomId || !activeRooms[roomId]) return;
            const room = activeRooms[roomId]; const { seatIndex, decision, buyType } = data;
            if (seatIndex !== room.currentTurn || room.gameStage !== 'buying') return;

            if (decision === 'buy') {
                executeBuyDecision(roomId, seatIndex, buyType);
            } else if (decision === 'pass') {
                handlePassDecision(roomId, seatIndex);
            }
        });

        socket.on('declare_my_project_manually', () => {
            const roomId = socket.currentRoom; if (!roomId || !activeRooms[roomId]) return;
            const room = activeRooms[roomId]; const seatIndex = socket.seatIndex;
            if (room.gameStage !== 'playing' || room.tricksPlayed > 0) return;
            if (room.declaredProjects[seatIndex]) return;

            let hand = room.playersCards[seatIndex] || [];
            let project = checkPlayerProjects(hand, room.buyType, room.trumpSuit);

            if (project.points > 0) {
                room.declaredProjects[seatIndex] = project;
                let team = (seatIndex === 0 || seatIndex === 2) ? 'team1' : 'team2';
                room.projectPoints[team] += project.points;
                io.to(roomId).emit('receive_chat_message', { username: socket.username, text: `📢 عندي مشروع: [ ${project.name} ] 🎉` });
            } else {
                socket.emit('invalid_move_alert', { message: "⚠️ أوراقك لا تحتوي على مشروع قانوني!" });
            }
        });

        socket.on('play_card', (data) => {
            const roomId = socket.currentRoom; if (!roomId || !activeRooms[roomId]) return;
            const room = activeRooms[roomId]; const { seatIndex, card } = data;
            if (seatIndex !== room.currentTurn || room.gameStage !== 'playing') return;
            let playerHand = room.playersCards[seatIndex] || [];

            const cardExists = playerHand.some(c => c.value === card.value && c.suit === card.suit);
            if (!cardExists) return;

            if (!isValidMove(card, playerHand, room.playedCardsOnTable, room.buyType, room.trumpSuit)) {
                socket.emit('invalid_move_alert', { message: "⚠️ رمية مخالفة! التزم بلون الأرض!" });
                return;
            }
            
            room.playersCards[seatIndex] = playerHand.filter(c => !(c.value === card.value && c.suit === card.suit));
            handleCardPlacement(roomId, seatIndex, card);
        });

        function handleCardPlacement(roomId, seatIndex, card) {
            const room = activeRooms[roomId]; if (!room) return;
            room.playedCardsOnTable.push({ seatIndex: seatIndex, card: card });
            room.currentTurn = (room.currentTurn + 1) % 4;

            io.to(roomId).emit('game_state_changed', { status: 'playing_stage', gameStage: room.gameStage, buyType: room.buyType, currentTurn: room.currentTurn, playersCards: room.playersCards, tableCards: room.playedCardsOnTable, scores: room.scores, trumpSuit: room.trumpSuit });

            if (room.playedCardsOnTable.length === 4) {
                room.tricksPlayed++;
                const result = determineTrickWinner(room.playedCardsOnTable, room.buyType, room.trumpSuit);
                let lastTrickBonus = (room.tricksPlayed === 8) ? 10 : 0; 
                
                if (result) {
                    if (result.winnerSeatIndex === 0 || result.winnerSeatIndex === 2) { room.roundPoints.team1 += (result.pointsGained + lastTrickBonus); }
                    else { room.roundPoints.team2 += (result.pointsGained + lastTrickBonus); }
                    room.currentTurn = result.winnerSeatIndex;
                }
                
                setTimeout(() => {
                    room.playedCardsOnTable = [];
                    if (room.tricksPlayed === 8) { processRoundEndAndScore(roomId); }
                    else {
                        io.to(roomId).emit('game_state_changed', { status: 'playing_stage', gameStage: room.gameStage, buyType: room.buyType, currentTurn: room.currentTurn, playersCards: room.playersCards, tableCards: [], scores: room.scores, trumpSuit: room.trumpSuit });
                        checkAndTriggerBotAction(roomId);
                    }
                }, 1500);
            } else { checkAndTriggerBotAction(roomId); }
        }

        function processRoundEndAndScore(roomId) {
            const room = activeRooms[roomId]; if (!room) return;
            let t1Gained = 0; let t2Gained = 0;

            if (room.buyType === 'صن') {
                let t1Rounded = Math.round(room.roundPoints.team1 / 10) * 10;
                let t2Rounded = Math.round(room.roundPoints.team2 / 10) * 10;
                t1Gained = (t1Rounded * 2) / 10; t2Gained = (t2Rounded * 2) / 10;
            } else {
                t1Gained = Math.round(room.roundPoints.team1 / 10);
                t2Gained = Math.round(room.roundPoints.team2 / 10);
            }

            let buyerTeam = (room.buyerSeat === 0 || room.buyerSeat === 2) ? 'team1' : 'team2';
            let defenderTeam = (buyerTeam === 'team1') ? 'team2' : 'team1';
            let buyerRawPoints = (buyerTeam === 'team1') ? room.roundPoints.team1 : room.roundPoints.team2;
            let successTarget = (room.buyType === 'صن') ? 65 : 81;
            let failureTotalAbnat = (room.buyType === 'صن') ? 26 : 16;

            if (buyerRawPoints < successTarget) {
                room.scores[defenderTeam] += (failureTotalAbnat + Math.round((room.projectPoints.team1 + room.projectPoints.team2) / 10));
                t1Gained = (buyerTeam === 'team1') ? 0 : failureTotalAbnat;
                t2Gained = (buyerTeam === 'team2') ? 0 : failureTotalAbnat;
            } else {
                room.scores.team1 += (t1Gained + Math.round(room.projectPoints.team1 / 10));
                room.scores.team2 += (t2Gained + Math.round(room.projectPoints.team2 / 10));
            }

            io.to(roomId).emit('show_round_result_board', {
                roundPoints: { team1: t1Gained, team2: t2Gained },
                projectPoints: { team1: Math.round(room.projectPoints.team1 / 10), team2: Math.round(room.projectPoints.team2 / 10) },
                totalScores: room.scores
            });

            setTimeout(() => {
                if (room.scores.team1 >= 152 || room.scores.team2 >= 152) {
                    let winnerText = (room.scores.team1 >= 152) ? "🎉 فاز فريقنا بالصكة!" : "❌ فازت البوتات بالصكة.";
                    io.to(roomId).emit('game_over_announcement', { winnerText: winnerText, finalScores: room.scores });
                    room.gameStarted = false;
                } else {
                    room.dealerIndex = (room.dealerIndex + 1) % 4;
                    triggerStartGame(roomId);
                }
            }, 5000); 
        }

        socket.on('disconnect', () => {
            const roomId = socket.currentRoom;
            if (roomId && activeRooms[roomId]) {
                const room = activeRooms[roomId];
                room.seats = room.seats.map(seat => (seat && seat.socketId === socket.id) ? null : seat);
                room.players = room.players.filter(p => p.socketId !== socket.id);
                io.to(roomId).emit('room_updated', { roomId: room.roomId, seats: room.seats, playersCount: room.players.length });
            }
        });

        socket.on('send_chat_message', (data) => {
            const roomId = socket.currentRoom;
            if (roomId) io.to(roomId).emit('receive_chat_message', { username: socket.username || "لاعب", text: data.text });
        });
    });
};