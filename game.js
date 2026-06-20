module.exports = function(io) {
    let rooms = {};
    let mheibesRooms = {};
    let koutRooms = {};
    let carromRooms = {};
    let xoRooms = {};
    let activeUsers = {}; // مخزن حسابات المستخدمين والـ VIP

    io.on('connection', (socket) => {
        
        // 💎 نظام الحسابات والـ VIP والشات الحي القديم (تعب قلبي / كويت 777)
        socket.on('user_login_attempt', (data) => {
            let username = data.username || "زائر فخم";
            let isVip = data.isVip || false;
            activeUsers[socket.id] = { username: username, isVip: isVip, color: isVip ? '#ff9f43' : '#fff' };
            socket.emit('login_success', activeUsers[socket.id]);
            io.emit('chat_sys_message', { msg: `📢 انضم للمجلس الحين: ${username} ${isVip?'[💎 VIP]':''}` });
        });

        socket.on('send_global_chat_msg', (data) => {
            let u = activeUsers[socket.id] || { username: "زائر", isVip: false, color: '#fff' };
            io.emit('receive_global_chat_msg', { username: u.username, isVip: u.isVip, color: u.color, text: data.text });
        });

        // 🃏 محرك لعبة الكوت بو 4 (الكوت بو ستة المطور) مع الأصوات
        socket.on('join_kout_game', (data) => {
            let kId = "kout_1000";
            if (!koutRooms[kId]) {
                koutRooms[kId] = { roomId: kId, players: [], currentTurn: 0, stage: 'playing', team1Score: 0, team2Score: 0 };
            }
            let kRoom = koutRooms[kId];
            if (kRoom.players.length < 4) {
                kRoom.players.push({ socketId: socket.id, username: data.username, team: kRoom.players.length % 2 === 0 ? 1 : 2 });
                socket.join(kId); socket.kId = kId;
            }
            // إكمال البوتات تلقائياً لسرعة اللعب الملحمي
            while (kRoom.players.length < 4) {
                kRoom.players.push({ socketId: 'bot_kout_' + kRoom.players.length, username: `🤖 بوت كوت ${kRoom.players.length}`, team: kRoom.players.length % 2 === 0 ? 1 : 2 });
            }
            io.to(kId).emit('kout_state_changed', kRoom);
        });

        socket.on('kout_play_action', (data) => {
            let kRoom = koutRooms[socket.kId || "kout_1000"]; if (!kRoom) return;
            // بث الحكم الصوتي المباشر لايف لجميع أفراد المجلس
            io.to(kRoom.roomId).emit('play_kout_sound_signal', { command: data.command }); 
            kRoom.currentTurn = (kRoom.currentTurn + 1) % 4;
            io.to(kRoom.roomId).emit('kout_state_changed', kRoom);
        });

        // 🟤 محرك لعبة الكيرم الخشبية التوجيهية وسحب الحجر الرئيسي
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
                cRoom.players.push({ socketId: 'bot_carrom', username: "🤖 محترف الكيرم (بوت)" });
            }
            io.to(cId).emit('carrom_state_changed', cRoom);
        });

        socket.on('carrom_strike_shot', (data) => {
            let cRoom = carromRooms[socket.cId || "carrom_1000"]; if (!cRoom) return;
            // بث حركة إطلاق المضرب لجميع الهواتف المتصلة
            io.to(cRoom.roomId).emit('carrom_visual_shot', { angle: data.angle, power: data.power, posX: data.posX });
            cRoom.turn = (cRoom.turn + 1) % 2;
            io.to(cRoom.roomId).emit('carrom_state_changed', cRoom);
        });

        // ❌ / ⭕ محرك لعبة إكس أو المنضبط بالدور
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
                xRoom.players.push({ socketId: 'bot_xo', username: "🤖 ذكاء XO (بوت)", symbol: 'O' });
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

        // ==========================================
        // ✊ كود لعبة المحيبس وبث الصوت
        // ==========================================
        socket.on('join_mheibes', (data) => {
            let mId = "mheibes_1000";
            if (!mheibesRooms[mId]) { mheibesRooms[mId] = { roomId: mId, players: [], stage: 'playing', seekerIdx: 0, hiderIdx: 1, winningHand: 'right' }; }
            let mRoom = mheibesRooms[mId];
            if (mRoom.players.length < 2) { mRoom.players.push({ socketId: socket.id, username: data.username, avatar: data.avatar, score: 0 }); socket.join(mId); socket.mRoomId = mId; }
            if (mRoom.players.length === 1) { mRoom.players.push({ socketId: 'bot_mheibes', username: "🤖 بو فهد (البوت)", avatar: "m2.png", score: 0 }); }
            io.to(mId).emit('mheibes_state_changed', mRoom);
        });

        socket.on('mheibes_guess_attempt', (data) => {
            let mRoom = mheibesRooms[socket.mRoomId || "mheibes_1000"]; if (!mRoom) return;
            let isCorrect = (data.hand === mRoom.winningHand);
            if (isCorrect) { mRoom.players[mRoom.seekerIdx].score += 1; io.to(mRoom.roomId).emit('mheibes_round_result', { result: 'correct', winnerName: mRoom.players[mRoom.seekerIdx].username, hand: mRoom.winningHand, mRoom: mRoom }); }
            else { mRoom.players[mRoom.hiderIdx].score += 1; io.to(mRoom.roomId).emit('mheibes_round_result', { result: 'wrong', winnerName: mRoom.players[mRoom.hiderIdx].username, hand: mRoom.winningHand, mRoom: mRoom }); }
            setTimeout(() => { let temp = mRoom.seekerIdx; mRoom.seekerIdx = mRoom.hiderIdx; mRoom.hiderIdx = temp; mRoom.winningHand = Math.random() > 0.5 ? 'right' : 'left'; io.to(mRoom.roomId).emit('mheibes_state_changed', mRoom); }, 2500);
        });

        socket.on('voice_signaling_stream', (payload) => { socket.broadcast.emit('voice_signaling_receive', payload); });
    });
};
