const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});
const path = require('path');

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
  socket.on('user_login_attempt', (data) => {
    console.log(`👤 تسجيل دخول رسمي: ${data.username}`);
  });

  socket.on('send_global_chat_msg', (data) => {
    io.emit('receive_global_chat_msg', {
      room: data.room,
      username: "بو محمد (المشرف)",
      text: data.text
    });
  });
});

http.listen(PORT, () => {
  console.log(`🚀 السيرفر شغال بنجاح على البورت ${PORT}`);
});
