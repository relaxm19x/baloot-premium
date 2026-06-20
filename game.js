module.exports = function(io) {
    let rooms = {};
    let mheibesRooms = {};
    let koutRooms = {};
    let carromRooms = {};
    let xoRooms = {};
    let activeUsers = {}; 

    io.on('connection', (socket) => {
        
        // 💎 نظام الدخول الفوري وشات كويت 666 الحي
        socket.on('user_login_attempt', (data) => {
            let username = data.username || "زائر فخم";
            let isVip = data.isVip || false;
            activeUsers[socket.id] = { username: username, isVip: isVip, color: isVip ? '#ff9f43' : '#54a0ff' };
            socket.emit('login_success', activeUsers[socket.id]);
            io.emit('chat_sys_message', { msg: `📢 دخل ديوانية كويت 666 الحين: ${username} ${isVip?'[💎 VIP]':''}` });
        });

        socket.on('send_global_chat_msg', (data) => {
            let u = activeUsers[socket.id] || { username: "زائر", isVip: false, color: '#54a0ff' };
            io.emit('receive_global_chat_msg', { username: u.username, isVip: u.isVip, color: u.color, text: data.text });
        });

        // 🃏 محرك لعبة الكوت بو 4 مع الأصوات ونطق الأحكام
        socket.on('join_kout_game', (data) => {
            let kId = "kout_1000";
            if (!koutRooms[kId]) {
                koutRooms[kId] = { roomId: kId, players: [], currentTurn: 0, stage: 'playing' };
            }
            let kRoom = koutRooms[kId];
            if (kRoom.players.length < 4) {
                kRoom.players.push({ socketId: socket.id, username: data.username });
                socket.join(kId); socket.kId = kId;
            }
            while (kRoom.players.length < 4) {
                kRoom.players.push({ socketId: 'bot_kout_' + kRoom.players.length, username: `🤖 بوت كوت ${kRoom.players.length + 1}` });
            }
            io.to(kId).emit('kout_state_changed', kRoom);
        });

        socket.on('kout_play_action', (data) => {
            let kRoom = koutRooms[socket.kId || "kout_1000"]; if (!kRoom) return;
            io.to(kRoom.roomId).emit('play_kout_sound_signal', { command: data.command }); 
            kRoom.currentTurn = (kRoom.currentTurn + 1) % 4;
            io.to(kRoom.roomId).emit('kout_state_changed', kRoom);
        });

        // 🟤 محرك لعبة الكيرم الخشبية وسحب المضرب الرئيسي
        socket.on('join_carrom_game', (data) => {
            let cId = "carrom_1000";
            if (!carromRooms[cId]) {
                carromRooms[cId] = { roomId: cId, players: [], turn: 0, strikerPos: 0 };
            }
            let cRoom = carromRooms[cId];
            if (cRoom.players.length < 2) {
                cRoom.players.push({ socketId: socket.id, username: data.username });
                socket.join(cId); socket.cId = cId;
            }
            if (cRoom.players.length === 1) {
                cRoom.players.push({ socketId: 'bot_carrom', username: "🤖 بوت كيرم محترف" });
            }
            io.to(cId).emit('carrom_state_changed', cRoom);
        });

        socket.on('carrom_strike_shot', (data) => {
            let cRoom = carromRooms[socket.cId || "carrom_1000"]; if (!cRoom) return;
            io.to(cRoom.roomId).emit('carrom_visual_shot', { posX: data.posX });
            cRoom.turn = (cRoom.turn + 1) % 2;
            io.to(cRoom.roomId).emit('carrom_state_changed', cRoom);
        });

        // ❌ / ⭕ محرك لعبة إكس أو المنضبط بالدور التبادلي
        socket.on('join_xo_game', (data) => {
            let xId = "xo_1000";
            if (!xoRooms[xId]) {
                xoRooms[xId] = { roomId: xId, players: [], turn: 0, board: Array(9).fill(null) };
            }
            let xRoom = xoRooms[xId];
            if (xRoom.players.length < 2) {
                xRoom.players.push({ socketId: socket.id, username: data.username, symbol: xRoom.players.length === 0 ? 'X' : 'O' });
                socket.join(xId); socket.xId = xId;
            }
            if (xRoom.players.length === 1) {
                xRoom.players.push({ socketId: 'bot_xo', username: "🤖 بوت ذكي", symbol: 'O' });
            }
            io.to(xId).emit('xo_state_changed', xRoom);
        });

        socket.on('xo_move_step', (data) => {
            let xRoom = xoRooms[socket.xId || "xo_1000"]; if (!xRoom) return;
            if (xRoom.board[data.index] === null) {
                xRoom.board[data.index] = xRoom.players[xRoom.turn].symbol;
                xRoom.turn = (xRoom.turn + 1) % 2;
                io.to(xRoom.roomId).emit('xo_state_changed', xRoom);
            }
        });

        // ✊ محرك لعبة المحيبس 
        socket.on('join_mheibes', (data) => {
            let mId = "mheibes_1000";
            if (!mheibesRooms[mId]) { mheibesRooms[mId] = { roomId: mId, players: [], stage: 'playing', seekerIdx: 0, hiderIdx: 1, winningHand: 'right' }; }
            let mRoom = mheibesRooms[mId];
            if (mRoom.players.length < 2) { mRoom.players.push({ socketId: socket.id, username: data.username, score: 0 }); socket.join(mId); socket.mRoomId = mId; }
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
