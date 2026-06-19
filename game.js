module.exports = function(io) {
    let rooms = {};

    // 📄 الدستور الرسمي لقيم الأوراق (الأبناط)
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
            let roomId = socket.roomId || "1000"; let room = rooms[roomId]; if (!room || room.currentTurn !== data.seatIndex || room.gameStage !== 'buying') return;

            if (data.decision === 'buy') {
                room.buyerSeat = data.seatIndex;
                room.buyType = data.buyType;
                
                if (data.buyType === 'أشكل') {
                    room.buyType = 'صن (أشكل)'; room.trumpSuit = null;
                } else if (data.buyType === 'حكم ثاني') {
                    // الحكم الثاني يكون مغاير لكرت الأرض حسب قوانينك
                    room.trumpSuit = room.flipCard.suit === '♠' ? '♥' : '♠'; 
                } else {
                    room.trumpSuit = (data.buyType === 'حكم') ? room.flipCard.suit : null;
                }
                
                room.playerActionsText[data.seatIndex] = `طلب: ${data.buyType}`;
                executeBuy(room, roomId, data.buyType, data.seatIndex);
            } else {
                room.playerActionsText[room.currentTurn] = data.buyRound === 2 ? "ولا 🚫" : "بس 🛡️"; 
                room.passCount++;
                
                // قانون "ولا": إذا الكل طوف باللفة الثانية، تسحب الأوراق ويعاد التوزيع فوراً
                if (room.passCount >= 8) {
                    io.to(roomId).emit('round_ended_announcement', { summary: "🔄 الكل قال (ولا)! تسحب الأوراق ويعاد التوزيع من جديد...", scores: room.scores });
                    setTimeout(() => { setupNewRound(roomId); }, 2500); 
                    return;
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
                    // البوت يطلب أشكل باللفة الثانية إذا كان مؤهل قانونياً (الموزع أو يساره)
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
