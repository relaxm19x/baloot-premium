module.exports = function(io) {
    let activeUsers = {}; 
    let quizRooms = {};

    // خوارزمية بنك الأسئلة المتنوعة والصعبة جداً والقابلة للتمدد العشوائي لعدم التكرار
    const masterDifficultQuiz = [
        { q: "من هو العالم المسلم الذي يعتبر أول من وضع أسس علم الجبر بشكل مستقل؟", a: ["الخوارزمي", "ابن الهيثم", "ابن سينا", "الكندي"], correct: 0 },
        { q: "في أي عام تم توقيع معاهدة صلح الحديبية التاريخية؟", a: ["6 هـ", "5 هـ", "7 هـ", "8 هـ"], correct: 0 },
        { q: "ما هو العنصر الكيميائي الذي يمتلك أعلى درجة انصهار بين جميع العناصر النقية؟", a: ["التنجستن", "البلاتين", "الكروم", "التيتانيوم"], correct: 0 },
        { q: "ما هي الدولة التي وقعت فيها معركة واترلو الشهيرة عام 1815؟", a: ["بلجيكا", "فرنسا", "ألمانيا", "هولندا"], correct: 0 },
        { q: "أين وقعت معركة ملاذكرد الشهيرة التاريخية؟", a: ["تركيا", "إيران", "العراق", "سوريا"], correct: 0 },
        { q: "كم استغرق بناء سور الصين العظيم تقريباً؟", a: ["أكثر من 2000 سنة", "500 سنة", "100 سنة", "50 سنة"], correct: 0 },
        { q: "من هو القائد المسلم الذي فتح بلاد السند؟", a: ["محمد بن القاسم", "قتيبة بن مسلم", "طارق بن زياد", "خالد بن الوليد"], correct: 0 },
        { q: "ما هو الكوكب الأكثر سخونة في المجموعة الشمسية؟", a: ["الزهرة", "عطارد", "المريخ", "المشتري"], correct: 0 }
    ];

    io.on('connection', (socket) => {
        console.log(`[ADD MORE Q8 Official] متصل جديد مستقر: ${socket.id}`);

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

        // ❓ محرك تحدي الأسئلة المتنوعة الصعبة جداً (توليد عشوائي غير متكرر كلياً)
        socket.on('join_quiz_game', (data) => {
            let qId = "quiz_1000";
            if (!quizRooms[qId]) { 
                // خلط عشوائي كامل لمصفوفة الأسئلة فور إنشاء الغرفة لضمان عدم التكرار
                let shuffledQuestions = [...masterDifficultQuiz].sort(() => Math.random() - 0.5);
                quizRooms[qId] = { roomId: qId, players: [], currentQ: 0, scores: {}, pool: shuffledQuestions }; 
            }
            let qRoom = quizRooms[qId];
            if (qRoom.players.length < 2) {
                qRoom.players.push({ socketId: socket.id, username: data.username || "تحدي الأسئلة" });
                qRoom.scores[socket.id] = 0; socket.join(qId); socket.qId = qId;
            }
            if (qRoom.players.length === 1) { qRoom.players.push({ socketId: 'bot_quiz', username: "🤖 عبقري الأسئلة (بوت)" }); qRoom.scores['bot_quiz'] = 0; }
            
            let currentQuestionData = qRoom.pool[qRoom.currentQ];
            io.to(qId).emit('quiz_next_question', { question: currentQuestionData.q, options: currentQuestionData.a, scores: qRoom.scores });
        });

        socket.on('quiz_submit_answer', (data) => {
            let qRoom = quizRooms[socket.qId || "quiz_1000"]; if (!qRoom) return;
            let currentQuestionData = qRoom.pool[qRoom.currentQ];
            
            if (data.index === currentQuestionData.correct) {
                if (qRoom.scores[socket.id] !== undefined) qRoom.scores[socket.id] += 10;
                io.to(qRoom.roomId).emit('quiz_round_result', { winner: data.username, correct: true });
            } else {
                io.to(qRoom.roomId).emit('quiz_round_result', { winner: data.username, correct: false });
            }
            
            setTimeout(() => {
                // الانتقال للسؤال العشوائي التالي، وإعادة الخلط إذا انتهت الأسئلة لضمان اللانهائية
                qRoom.currentQ++;
                if(qRoom.currentQ >= qRoom.pool.length) {
                    qRoom.pool = [...masterDifficultQuiz].sort(() => Math.random() - 0.5);
                    qRoom.currentQ = 0;
                }
                let nextQ = qRoom.pool[qRoom.currentQ];
                io.to(qRoom.roomId).emit('quiz_next_question', { question: nextQ.q, options: nextQ.a, scores: qRoom.scores });
            }, 2500);
        });

        socket.on('disconnect', () => { delete activeUsers[socket.id]; });
    });
};
