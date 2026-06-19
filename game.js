function executePlayCardLogic(room, roomId, seatIndex, chosenCard) {
            // فحص كشف المشاريع في اللمة الثانية لتظهر ثانيتين فقط وتختفي تلقائياً دون تجميد
            if (room.trickCount === 1 && room.tableCards.length === 0) {
                let bestSeat = -1; let maxPts = 0;
                const projWeights = { "أربعمئة": 400, "100": 100, "خمسين": 50, "سرا": 20 };
                for (let i = 0; i < 4; i++) {
                    let w = projWeights[room.activeProjects[i]] || 0;
                    if (w > maxPts) { maxPts = w; bestSeat = i; }
                }
                if (bestSeat !== -1) {
                    room.revealedProjectCards = { seatIndex: bestSeat, text: room.activeProjects[bestSeat] };
                    io.to(roomId).emit('game_state_changed', room);
                    
                    // إخفاء المشروع تلقائياً بعد ثانيتين بالضبط (2000 مللي ثانية) ومتابعة اللعب
                    setTimeout(() => {
                        room.revealedProjectCards = null;
                        for(let i=0; i<4; i++) room.playerActionsText[i] = "";
                        io.to(roomId).emit('game_state_changed', room);
                    }, 2000);
                }
            }

            if (room.tableCards.length === 0) { 
                for(let i=0; i<4; i++) {
                    if (room.trickCount === 0 && room.activeProjects[i] && room.activeProjects[i] !== "") room.playerActionsText[i] = `📢 مشروع: ${room.activeProjects[i]}`;
                    else if (room.trickCount > 0) room.playerActionsText[i] = "";
                }
                room.leadSuit = chosenCard.suit; 
            }

            room.tableCards.push({ seatIndex: seatIndex, card: chosenCard });
            io.to(roomId).emit('game_state_changed', room);
            
            if (room.tableCards.length === 4) {
                handleTrickCompletion(room, roomId);
            } else {
                room.currentTurn = (room.currentTurn + 1) % 4;
                io.to(roomId).emit('game_state_changed', room);
                startTurnTimer(room, roomId);
            }
        }
