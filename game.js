module.exports = function(io) {
    let activeUsers = {}; 
    let poolRooms = {};
    let quizRooms = {};
    let carromRooms = {};
    let xoRooms = {};
    let mheibesRooms = {};

    // بنك أسئلة "تحدي الأسئلة المتنوعة" - أسئلة عميقة وصعبة جداً
    const difficultQuizBank = [
        { q: "من هو العالم المسلم الذي يعتبر أول من وضع أسس علم الجبر بشكل مستقل؟", a: ["الخوارزمي", "ابن الهيثم", "ابن سينا", "الكندي"], correct: 0 },
        { q: "في أي عام تم توقيع معاهدة صلح الحديبية التاريخية؟", a: ["6 هـ", "5 هـ", "7 هـ", "8 هـ"], correct: 0 },
        { q: "ما هو العنصر الكيميائي الذي يمتلك أعلى درجة انصهار بين جميع العناصر النقية؟", a: ["التنجستن", "البلاتين", "الكروم", "التيتانيوم"], correct: 0 },
        { q: "ما هي الدولة التي وقعت فيها معركة واترلو الشهيرة عام 1815؟", a: ["بلجيكا", "فرنسا", "ألمانيا", "هولندا"], correct: 0 }
    ];

    io.on('connection', (socket) => {
        console.log(`[ADD MORE Q8] Connected: ${socket.id}`);

        socket.on('user_login_attempt', (data) => {
            let username = data.username || "زائر فخم";
            let isVip = data.isVip || false;
            let method = data.method || "زائر";
            activeUsers[socket.id] = { username: username, isVip: isVip, color: isVip ? '#ff9f43' : '#54a0ff' };
            
            socket.emit('login_success', activeUsers[socket.id]);
            io.emit('chat_sys_message', { msg: `📢 سجل دخول رسمي عبر [${method}]: ${username} ${isVip?'[💎 VIP]':''}` });
        });

        socket.on('send_global_chat_msg', (data) => {
            let u = activeUsers[socket.id] || { username: "لاعب فخم", isVip: false, color: '#54a0ff' };
            io.emit('receive_global_chat_msg', { room: data.room, username: u.username, isVip: u.isVip, color: u.color, text: data.text });
        });

        // 🎱 محرك البلياردو الاحترافي المتكامل (الكرة البيضاء + 15 كرة مرقمة)
        socket.on('join_pool_game', (data) => {
            let pId = "pool_1000";
            if (!poolRooms[pId]) {
                let ballsArr = [];
                // توليد إحداثيات الـ 15 كرة كاملة لتظهر في المثلث بشكل احترافي ومبهر
                for(let i=1; i<=15; i++) {
                    ballsArr.push({ id: i, x: 200 + (Math.floor(i/4)*22), y: 70 + ((i%4)*22), color: i===8 ? '#000': (i<=7 ? '#e74c3c' : '#f1c40f') });
                }
                poolRooms[pId] = { roomId: pId, players: [], turn: 0, whiteBall: { x: 70, y: 100 }, balls: ballsArr };
            }
            let pRoom = poolRooms[pId];
            if (pRoom.players.length < 2) {
                pRoom.players.push({ socketId: socket.id, username: data.username || "لاعب بلياردو" });
                socket.join(pId); socket.pId = pId;
            }
            if (pRoom.players.length === 1) { pRoom.players.push({ socketId: 'bot_pool', username: "🤖 محترف البلياردو (بوت)" }); }
            io.to(pId).emit('pool_state_changed', pRoom);
        });

        socket.on('pool_hit_ball', (data) => {
            let pRoom = poolRooms[socket.pId || "pool_1000"]; if (!pRoom) return;
            io.to(pRoom.roomId).emit('pool_visual_hit', { angle: data.angle, power: data.power });
            pRoom.turn = (pRoom.turn + 1) % 2;
            io.to(pRoom.roomId).emit('pool_state_changed', pRoom);
        });

        // ❓ محرك تحدي الأسئلة المتنوعة الصعبة
        socket.on('join_quiz_game', (data) => {
            let qId = "quiz_1000";
            if (!quizRooms[qId]) { quizRooms[qId] = { roomId: qId, players: [], currentQ: 0, scores: {} }; }
            let qRoom = quizRooms[qId];
            if (qRoom.players.length < 2) {
                qRoom.players.push({ socketId: socket.id, username: data.username || "تحدي الأسئلة" });
                qRoom.scores[socket.id] = 0; socket.join(qId); socket.qId = qId;
            }
            if (qRoom.players.length === 1) { qRoom.players.push({ socketId: 'bot_quiz', username: "🤖 عبقري الأسئلة (بوت)" }); qRoom.scores['bot_quiz'] = 0; }
            let currentQuestionData = difficultQuizBank[qRoom.currentQ];
            io.to(qId).emit('quiz_next_question', { question: currentQuestionData.q, options: currentQuestionData.a, scores: qRoom.scores });
        });

        socket.on('quiz_submit_answer', (data) => {
            let qRoom = quizRooms[socket.qId || "quiz_1000"]; if (!qRoom) return;
            let currentQuestionData = difficultQuizBank[qRoom.currentQ];
            if (data.index === currentQuestionData.correct) {
                if (qRoom.scores[socket.id] !== undefined) qRoom.scores[socket.id] += 10;
                io.to(qRoom.roomId).emit('quiz_round_result', { winner: data.username, correct: true });
            } else {
                io.to(qRoom.roomId).emit('quiz_round_result', { winner: data.username, correct: false });
            }
            setTimeout(() => {
                qRoom.currentQ = (qRoom.currentQ + 1) % difficultQuizBank.length;
                let nextQ = difficultQuizBank[qRoom.currentQ];
                io.to(qRoom.roomId).emit('quiz_next_question', { question: nextQ.q, options: nextQ.a, scores: qRoom.scores });
            }, 2500);
        });

        // محركات الكيرم، إكس أو، والمحيبس
        socket.on('join_carrom_game', (data) => {
            let cId = "carrom_1000"; if (!carromRooms[cId]) { carromRooms[cId] = { roomId: cId, players: [], turn: 0 }; }
            let cRoom = carromRooms[cId]; if (cRoom.players.length < 2) { cRoom.players.push({ socketId: socket.id, username: data.username }); socket.join(cId); socket.cId = cId; }
            if (cRoom.players.length === 1) { cRoom.players.push({ socketId: 'bot_carrom', username: "🤖 بوت كيرم" }); }
            io.to(cId).emit('carrom_state_changed', cRoom);
        });
        socket.on('carrom_strike_shot', (data) => {
            let cRoom = carromRooms[socket.cId || "carrom_1000"]; if (!cRoom) return;
            io.to(cRoom.roomId).emit('carrom_visual_shot', { posX: data.posX });
            cRoom.turn = (cRoom.turn + 1) % 2; io.to(cRoom.roomId).emit('carrom_state_changed', cRoom);
        });
        socket.on('join_xo_game', (data) => {
            let xId = "xo_1000"; if (!xoRooms[xId]) { xoRooms[xId] = { roomId: xId, players: [], turn: 0, board: Array(9).fill(null) }; }
            let xRoom = xoRooms[xId]; if (xRoom.players.length < 2) { xRoom.players.push({ socketId: socket.id, username: data.username, symbol: xRoom.players.length === 0 ? 'X' : 'O' }); socket.join(xId); socket.xId = xId; }
            if (xRoom.players.length === 1) { xRoom.players.push({ socketId: 'bot_xo', username: "🤖 بوت ذكي", symbol: 'O' }); }
            io.to(xId).emit('xo_state_changed', xRoom);
        });
        socket.on('xo_move_step', (data) => {
            let xRoom = xoRooms[socket.xId || "xo_1000"]; if (!xRoom) return;
            if (xRoom.board[data.index] === null) { xRoom.board[data.index] = xRoom.players[xRoom.turn].symbol; xRoom.turn = (xRoom.turn + 1) % 2; io.to(xRoom.roomId).emit('xo_state_changed', xRoom); }
        });
        socket.on('join_mheibes', (data) => {
            let mId = "mheibes_1000"; if (!mheibesRooms[mId]) { mheibesRooms[mId] = { roomId: mId, players: [], stage: 'playing', seekerIdx: 0, hiderIdx: 1, winningHand: 'right' }; }
            let mRoom = mheibesRooms[mId]; if (mRoom.players.length < 2) { mRoom.players.push({ socketId: socket.id, username: data.username, score: 0 }); socket.join(mId); socket.mRoomId = mId; }
            if (mRoom.players.length === 1) { mRoom.players.push({ socketId: 'bot_mheibes', username: "🤖 بو فهد (البوت)", score: 0 }); }
            io.to(mId).emit('mheibes_state_changed', mRoom);
        });
        socket.on('mheibes_guess_attempt', (data) => {
            let mRoom = mheibesRooms[socket.mRoomId || "mheibes_1000"]; if (!mRoom) return;
            let isCorrect = (data.hand === mRoom.winningHand);
            if (isCorrect) { mRoom.players[mRoom.seekerIdx].score += 1; io.to(mRoom.roomId).emit('mheibes_round_result', { result: 'correct', winnerName: mRoom.players[mRoom.seekerIdx].username, hand: mRoom.winningHand }); }
            else { mRoom.players[mRoom.hiderIdx].score += 1; io.to(mRoom.roomId).emit('mheibes_round_result', { result: 'wrong', winnerName: mRoom.players[mRoom.hiderIdx].username, hand: mRoom.winningHand }); }
            setTimeout(() => { let temp = mRoom.seekerIdx; mRoom.seekerIdx = mRoom.hiderIdx; mRoom.hiderIdx = temp; mRoom.winningHand = Math.random() > 0.5 ? 'right' : 'left'; io.to(mRoom.roomId).emit('mheibes_state_changed', mRoom); }, 2000);
        });

        socket.on('voice_signaling_stream', (payload) => { socket.broadcast.emit('voice_signaling_receive', payload); });
    });
};
