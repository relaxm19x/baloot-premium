function executePlayCardLogic(room, roomId, seatIndex, chosenCard) {
    if (room.tableCards.length === 0) { 
        room.leadSuit = chosenCard.suit; 
        // مسح نصوص المشاريع السابقة فوراً مع بداية أكلة جديدة لمنع التعليق
        for(let i=0; i<4; i++) { room.playerActionsText[i] = ""; }
    }

    // إظهار السرا في أول أكلة بدون تجميد اللعبة
    if (room.trickCount === 0 && room.tableCards.length === 0) {
        let bestSeat = -1; let maxPts = 0;
        const projWeights = { "أربعمئة": 400, "100": 100, "خمسين": 50, "سرا": 20 };
        for (let i = 0; i < 4; i++) {
            let w = projWeights[room.activeProjects[i]] || 0;
            if (w > maxPts) { maxPts = w; bestSeat = i; }
        }
        if (bestSeat !== -1) {
            room.revealedProjectCards = { seatIndex: bestSeat, text: room.activeProjects[bestSeat] };
            // المؤقت هنا يقوم فقط بإخفاء اللوحة التعبيرية ولا يتحكم في مجرى اللعب أبداً
            setTimeout(() => {
                let currentRoom = rooms[roomId];
                if (currentRoom) {
                    currentRoom.revealedProjectCards = null;
                    io.to(roomId).emit('game_state_changed', currentRoom);
                }
            }, 2000);
        }
    }

    room.tableCards.push({ seatIndex: seatIndex, card: chosenCard });
    
    // انتقال الدور مباشرة أو إنهاء الأكلة
    if (room.tableCards.length === 4) {
        handleTrickCompletion(room, roomId);
    } else {
        room.currentTurn = (room.currentTurn + 1) % 4;
        io.to(roomId).emit('game_state_changed', room);
        startTurnTimer(room, roomId);
    }
}

function handleTrickCompletion(room, roomId) {
    if (room.isRoundEnding || room.gameStage === 'nashra') return;
    if (room.turnTimeout) clearTimeout(room.turnTimeout);

    // نحدث حالة اللعبة على الشبكة فوراً ليرى اللاعبون الكرت الرابع قبل مسح الأرضية
    io.to(roomId).emit('game_state_changed', room);

    setTimeout(() => {
        let winnerSeat = determineActualWinner(room);
        let trickPoints = calculateActualTrickPoints(room);
        room.trickCount++;
        
        let currentTeam = (winnerSeat === 0 || winnerSeat === 2) ? 't1' : 't2';
        room.nashra.trickPoints[currentTeam] += trickPoints;

        if (room.trickCount === 8) room.nashra.ground[currentTeam] += 10; 

        room.tableCards = []; 
        room.leadSuit = null; 
        room.currentTurn = winnerSeat; // الفائز هو من يبدأ الأكلة التالية فوراً

        if (room.trickCount === 8) {
            room.isRoundEnding = true; 
            room.gameStage = 'nashra';
            
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
            if (room.isDouble) { room.nashra.gain.t1 *= 2; room.nashra.gain.t2 *= 2; }
            room.scores.team1 += room.nashra.gain.t1; 
            room.scores.team2 += room.nashra.gain.t2;
            
            io.to(roomId).emit('game_state_changed', room);
            setTimeout(() => { setupNewRound(roomId); }, 5000); 
        } else {
            io.to(roomId).emit('game_state_changed', room);
            startTurnTimer(room, roomId);
        }
    }, 800); // 800ms كافية جداً لرؤية اللعبة وسلسة لمنع التوقف
}
