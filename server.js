const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');

const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Robust static path resolution for Node CLI & pkg Executable binaries
const publicDirInside = path.join(__dirname, 'public');
const publicDirOutside = path.join(process.cwd(), 'public');

if (fs.existsSync(publicDirOutside)) {
  app.use(express.static(publicDirOutside));
}
if (fs.existsSync(publicDirInside)) {
  app.use(express.static(publicDirInside));
}

app.use(express.json());

// Fallback index.html route handler
app.get('/', (req, res) => {
  const indexOutside = path.join(publicDirOutside, 'index.html');
  const indexInside = path.join(publicDirInside, 'index.html');

  if (fs.existsSync(indexOutside)) {
    return res.sendFile(indexOutside);
  } else if (fs.existsSync(indexInside)) {
    return res.sendFile(indexInside);
  } else {
    res.send('QuizMaster LIVE Server is running! Place the public folder next to the .exe file.');
  }
});

// In-memory store for game rooms
const rooms = {};

// Helper to get local network IP address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

function generatePin() {
  let pin;
  do {
    pin = Math.floor(100000 + Math.random() * 900000).toString();
  } while (rooms[pin]);
  return pin;
}

// Global public tunnel URL store
let publicTunnelUrl = null;

function setupPublicTunnel(port) {
  const { spawn } = require('child_process');
  
  try {
    const sshProcess = spawn('ssh', [
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'ServerAliveInterval=30',
      '-R', `80:127.0.0.1:${port}`,
      'nokey@localhost.run'
    ]);

    const handleOutput = (data) => {
      const text = data.toString();
      const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.lhr\.life/);
      if (match) {
        publicTunnelUrl = match[0];
        console.log(`🌐 Public Tunnel Online URL (4G/5G Clean): ${publicTunnelUrl}`);
      }
    };

    sshProcess.stdout.on('data', handleOutput);
    sshProcess.stderr.on('data', handleOutput);

    sshProcess.on('close', () => {
      publicTunnelUrl = null;
      setTimeout(() => setupPublicTunnel(port), 5000);
    });

    sshProcess.on('error', () => {
      setupLocaltunnelFallback(port);
    });
  } catch (err) {
    setupLocaltunnelFallback(port);
  }
}

async function setupLocaltunnelFallback(port) {
  try {
    const localtunnel = require('localtunnel');
    const tunnel = await localtunnel({ port, local_host: '127.0.0.1' });
    publicTunnelUrl = tunnel.url;
    console.log(`🌐 Public Tunnel Online URL (Fallback): ${publicTunnelUrl}`);

    tunnel.on('close', () => {
      publicTunnelUrl = null;
      setTimeout(() => setupPublicTunnel(port), 5000);
    });
  } catch (e) {}
}

io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  // TEACHER / HOST EVENTS
  socket.on('create-room', ({ quiz, isVip }) => {
    const pin = generatePin();
    rooms[pin] = {
      pin,
      hostSocketId: socket.id,
      quiz: quiz || { title: 'Trắc nghiệm Kahoot', questions: [] },
      isVip: !!isVip,
      currentQuestionIndex: -1,
      state: 'LOBBY',
      players: {},
      answers: {}, // questionIndex -> { socketId -> choiceIndex }
      timerInterval: null,
      timeLeft: 0
    };

    socket.join(pin);
    const localIp = getLocalIP();
    const publicUrl = publicTunnelUrl || `http://${localIp}:${PORT}`;

    socket.emit('room-created', {
      pin,
      quiz: rooms[pin].quiz,
      localIp,
      port: PORT,
      publicUrl
    });
    console.log(`🏠 Room created with PIN: ${pin} | Public URL: ${publicUrl}`);
  });

  socket.on('kick-player', ({ pin, socketId }) => {
    const room = rooms[pin];
    if (room && room.hostSocketId === socket.id && room.players[socketId]) {
      const playerSocket = io.sockets.sockets.get(socketId);
      delete room.players[socketId];
      if (playerSocket) {
        playerSocket.emit('kicked');
        playerSocket.leave(pin);
      }
      io.to(pin).emit('update-player-list', Object.values(room.players));
    }
  });

  socket.on('start-game', ({ pin }) => {
    const room = rooms[pin];
    if (!room || room.hostSocketId !== socket.id) return;
    if (!room.quiz.questions || room.quiz.questions.length === 0) return;

    room.currentQuestionIndex = 0;
    sendQuestion(room);
  });

  socket.on('next-step', ({ pin }) => {
    const room = rooms[pin];
    if (!room || room.hostSocketId !== socket.id) return;

    if (room.state === 'REVEAL') {
      // Move to Leaderboard after reveal
      room.state = 'LEADERBOARD';
      const leaderboard = getLeaderboard(room);
      io.to(pin).emit('show-leaderboard', {
        leaderboard,
        isLastQuestion: room.currentQuestionIndex >= room.quiz.questions.length - 1
      });
    } else if (room.state === 'LEADERBOARD') {
      // Move to next question or finish
      if (room.currentQuestionIndex < room.quiz.questions.length - 1) {
        room.currentQuestionIndex++;
        sendQuestion(room);
      } else {
        room.state = 'FINISHED';
        const finalLeaderboard = getLeaderboard(room);
        io.to(pin).emit('game-over', { leaderboard: finalLeaderboard });
      }
    }
  });

  // STUDENT EVENTS
  socket.on('join-room', ({ pin, nickname, avatar }) => {
    const room = rooms[pin];
    if (!room) {
      return socket.emit('join-error', 'Mã Game PIN không tồn tại!');
    }
    if (room.state !== 'LOBBY') {
      return socket.emit('join-error', 'Trò chơi đã bắt đầu, không thể tham gia!');
    }

    // Limit non-activated accounts to 1 student
    if (!room.isVip && Object.keys(room.players).length >= 1) {
      return socket.emit('join-error', 'Tài khoản chưa được kích hoạt chỉ cho phép tối đa 1 học sinh tham gia phòng!');
    }

    // Check duplicate nickname
    const nameExists = Object.values(room.players).some(
      (p) => p.nickname.trim().toLowerCase() === nickname.trim().toLowerCase()
    );
    if (nameExists) {
      return socket.emit('join-error', 'Tên biệt danh này đã có người dùng trong phòng!');
    }

    room.players[socket.id] = {
      socketId: socket.id,
      nickname: nickname.trim(),
      avatar: avatar || '🐱',
      score: 0,
      streak: 0,
      lastPointsGained: 0,
      lastAnswerCorrect: false
    };

    socket.join(pin);
    socket.emit('joined-successfully', {
      pin,
      nickname: nickname.trim(),
      avatar: avatar || '🐱',
      quizTitle: room.quiz.title
    });

    // Notify host and all players in lobby
    io.to(pin).emit('update-player-list', Object.values(room.players));
    console.log(`👤 Player ${nickname} joined room ${pin}`);
  });

  socket.on('submit-answer', ({ pin, choiceIndex }) => {
    const room = rooms[pin];
    if (!room || room.state !== 'QUESTION') return;

    const player = room.players[socket.id];
    if (!player) return;

    const qIndex = room.currentQuestionIndex;
    if (!room.answers[qIndex]) room.answers[qIndex] = {};
    if (room.answers[qIndex][socket.id] !== undefined) return; // Already answered

    const question = room.quiz.questions[qIndex];
    const isCorrect = choiceIndex === question.correctIndex;
    const timeLimit = question.timeLimit || 20;
    const timeRatio = Math.max(0, room.timeLeft / timeLimit);

    let pointsGained = 0;
    if (isCorrect) {
      player.streak += 1;
      const streakBonus = Math.min(player.streak - 1, 5) * 100;
      pointsGained = Math.round(1000 * (0.5 + 0.5 * timeRatio)) + streakBonus;
      player.score += pointsGained;
      player.lastAnswerCorrect = true;
      player.lastPointsGained = pointsGained;
    } else {
      player.streak = 0;
      player.lastAnswerCorrect = false;
      player.lastPointsGained = 0;
    }

    room.answers[qIndex][socket.id] = {
      choiceIndex,
      isCorrect,
      pointsGained
    };

    // Send instant submission ack to player
    socket.emit('answer-received', {
      isCorrect,
      pointsGained,
      totalScore: player.score,
      streak: player.streak
    });

    // Update count to host
    const totalAnswered = Object.keys(room.answers[qIndex]).length;
    const totalPlayers = Object.keys(room.players).length;

    io.to(room.hostSocketId).emit('answer-count-update', {
      answeredCount: totalAnswered,
      totalPlayers
    });

    // If everyone answered, finish question early
    if (totalAnswered >= totalPlayers && totalPlayers > 0) {
      clearInterval(room.timerInterval);
      revealQuestionResults(room);
    }
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
    for (const pin in rooms) {
      const room = rooms[pin];
      if (room.hostSocketId === socket.id) {
        // Host disconnected
        clearInterval(room.timerInterval);
        io.to(pin).emit('room-closed', 'Giáo viên đã đóng phòng học!');
        delete rooms[pin];
      } else if (room.players[socket.id]) {
        // Player disconnected
        delete room.players[socket.id];
        io.to(pin).emit('update-player-list', Object.values(room.players));
      }
    }
  });
});

function sendQuestion(room) {
  if (room.timerInterval) clearInterval(room.timerInterval);

  room.state = 'QUESTION';
  const qIndex = room.currentQuestionIndex;
  const question = room.quiz.questions[qIndex];
  room.timeLeft = question.timeLimit || 20;
  if (!room.answers[qIndex]) room.answers[qIndex] = {};

  // Clean payload for players (do not send correctIndex to students!)
  const publicQuestion = {
    index: qIndex,
    total: room.quiz.questions.length,
    questionText: question.questionText,
    options: question.options,
    timeLimit: question.timeLimit || 20,
    imageUrl: question.imageUrl || ''
  };

  // Host gets complete question including correctIndex
  const hostQuestion = {
    ...publicQuestion,
    correctIndex: question.correctIndex
  };

  io.to(room.hostSocketId).emit('host-question-start', hostQuestion);

  // Send to players (without correctIndex)
  Object.keys(room.players).forEach((socketId) => {
    io.to(socketId).emit('player-question-start', publicQuestion);
  });

  // Countdown timer
  room.timerInterval = setInterval(() => {
    room.timeLeft--;
    io.to(room.pin).emit('timer-tick', room.timeLeft);

    if (room.timeLeft <= 0) {
      clearInterval(room.timerInterval);
      revealQuestionResults(room);
    }
  }, 1000);
}

function revealQuestionResults(room) {
  room.state = 'REVEAL';
  const qIndex = room.currentQuestionIndex;
  const question = room.quiz.questions[qIndex];

  // Count answer distribution per option
  const stats = [0, 0, 0, 0];
  const qAnswers = room.answers[qIndex] || {};
  Object.values(qAnswers).forEach((ans) => {
    if (ans.choiceIndex >= 0 && ans.choiceIndex < 4) {
      stats[ans.choiceIndex]++;
    }
  });

  io.to(room.pin).emit('question-reveal', {
    correctIndex: question.correctIndex,
    explanation: question.explanation || '',
    stats,
    leaderboard: getLeaderboard(room)
  });
}

function getLeaderboard(room) {
  return Object.values(room.players)
    .map((p) => ({
      socketId: p.socketId,
      nickname: p.nickname,
      avatar: p.avatar,
      score: p.score,
      streak: p.streak,
      lastPointsGained: p.lastPointsGained
    }))
    .sort((a, b) => b.score - a.score);
}

const { exec } = require('child_process');

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  const localIp = getLocalIP();
  console.log(`====================================================`);
  console.log(`🚀 QuizMaster Game Server đang chạy tại:`);
  console.log(`💻 Trình duyệt máy tính: http://localhost:${PORT}`);
  console.log(`📱 Mạng Wi-Fi / Điện thoại: http://${localIp}:${PORT}`);
  console.log(`====================================================`);
  
  // Tự động mở trình duyệt web mặc định khi nhấp đúp file .exe
  setTimeout(() => {
    try {
      if (process.platform === 'win32') {
        exec(`start http://localhost:${PORT}`);
      } else if (process.platform === 'darwin') {
        exec(`open http://localhost:${PORT}`);
      } else {
        exec(`xdg-open http://localhost:${PORT}`);
      }
    } catch (err) {}
  }, 1000);

  // Auto start public tunnel for 4G/5G mobile connectivity
  setupPublicTunnel(PORT);
});

module.exports = app;
