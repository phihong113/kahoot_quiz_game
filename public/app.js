/* ==========================================================================
   KAHOOT LIVE - FRONTEND JAVASCRIPT APPLICATION LOGIC
   ========================================================================== */

(function () {
  // Event listeners registry & Real Socket.io client
  const eventListeners = {};
  const realSocket = typeof io !== 'undefined' ? io({
    transports: ['polling', 'websocket'],
    reconnection: true,
    reconnectionAttempts: 3,
    timeout: 2500
  }) : null;

  // STUN & TURN Relay ICE Servers configuration for 4G/5G mobile cross-NAT networks
  const peerIceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.services.mozilla.com' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ];

  // PeerJS WebRTC Engine for Serverless (Vercel) Online Multiplayer
  const peerEngine = {
    peer: null,
    isHost: false,
    hostConn: null,
    clientConns: {},
    room: null,

    handleEmit(event, data) {
      if (event === 'create-room') {
        this.createRoom(data.quiz, data.isVip);
      } else if (event === 'join-room') {
        this.joinRoom(data.pin, data.nickname, data.avatar);
      } else if (event === 'start-game') {
        this.startGame();
      } else if (event === 'submit-answer') {
        this.submitAnswer(data.choiceIndex);
      } else if (event === 'next-step') {
        this.nextStep();
      } else if (event === 'kick-player') {
        this.kickPlayer(data.socketId);
      }
    },

    createRoom(quiz, isVip) {
      this.isHost = true;
      const pin = Math.floor(100000 + Math.random() * 900000).toString();
      const peerId = 'qm-pin-' + pin;

      this.room = {
        pin,
        quiz,
        isVip: !!isVip,
        state: 'LOBBY',
        currentQuestionIndex: 0,
        players: {},
        answers: {},
        timerInterval: null,
        timeLeft: 0
      };

      if (typeof Peer !== 'undefined') {
        if (this.peer) this.peer.destroy();
        this.peer = new Peer(peerId, {
          config: { iceServers: peerIceServers },
          debug: 1
        });

        this.peer.on('open', () => {
          socket.trigger('room-created', {
            pin,
            quiz,
            localIp: window.location.host,
            port: ''
          });
        });

        this.peer.on('connection', (conn) => {
          conn.on('data', (msg) => {
            if (msg.event === 'join-room') {
              this.handleStudentJoin(conn, msg.data);
            } else if (msg.event === 'submit-answer') {
              this.handleStudentAnswer(conn, msg.data);
            }
          });

          conn.on('close', () => {
            delete this.clientConns[conn.peer];
            if (this.room && this.room.players[conn.peer]) {
              delete this.room.players[conn.peer];
              const playerList = Object.values(this.room.players);
              this.broadcastToRoom('update-player-list', playerList);
              socket.trigger('update-player-list', playerList);
            }
          });
        });

        this.peer.on('error', (err) => {
          console.warn('Peer host error:', err);
          if (err.type === 'unavailable-id') {
            this.createRoom(quiz, isVip);
          }
        });
      } else {
        alert('Thư viện WebRTC chưa tải xong! Vui lòng làm mới trang.');
      }
    },

    handleStudentJoin(conn, { pin, nickname, avatar }) {
      if (!this.room) return;
      if (this.room.state !== 'LOBBY') {
        return conn.send({ event: 'join-error', data: 'Trò chơi đã bắt đầu, không thể tham gia!' });
      }
      if (!this.room.isVip && Object.keys(this.room.players).length >= 1) {
        return conn.send({ event: 'join-error', data: 'Tài khoản chưa được kích hoạt chỉ cho phép tối đa 1 học sinh tham gia phòng!' });
      }
      const nameExists = Object.values(this.room.players).some(p => p.nickname.trim().toLowerCase() === nickname.trim().toLowerCase());
      if (nameExists) {
        return conn.send({ event: 'join-error', data: 'Tên biệt danh này đã có người dùng trong phòng!' });
      }

      const player = {
        socketId: conn.peer,
        nickname: nickname.trim(),
        avatar: avatar || '🐱',
        score: 0,
        streak: 0,
        lastPointsGained: 0,
        lastAnswerCorrect: false
      };

      this.room.players[conn.peer] = player;
      this.clientConns[conn.peer] = conn;

      conn.send({
        event: 'joined-successfully',
        data: { pin, nickname: player.nickname, avatar: player.avatar, quizTitle: this.room.quiz.title }
      });

      const playerList = Object.values(this.room.players);
      this.broadcastToRoom('update-player-list', playerList);
      socket.trigger('update-player-list', playerList);
    },

    joinRoom(pin, nickname, avatar) {
      this.isHost = false;
      const peerId = 'qm-pin-' + pin;
      if (typeof Peer === 'undefined') return alert('Thư viện WebRTC chưa sẵn sàng!');

      if (this.peer) this.peer.destroy();
      this.peer = new Peer(undefined, {
        config: { iceServers: peerIceServers },
        debug: 1
      });

      let joinTimeout = setTimeout(() => {
        socket.trigger('join-error', 'Kết nối tới phòng thi đấu quá thời gian. Vui lòng kiểm tra lại Mã PIN hoặc thử lại!');
      }, 6000);

      this.peer.on('open', () => {
        const conn = this.peer.connect(peerId, { reliable: true });
        this.hostConn = conn;

        conn.on('open', () => {
          clearTimeout(joinTimeout);
          conn.send({
            event: 'join-room',
            data: { pin, nickname, avatar }
          });
        });

        conn.on('data', (msg) => {
          if (msg.event) {
            if (msg.event === 'joined-successfully' || msg.event === 'join-error') {
              clearTimeout(joinTimeout);
            }
            socket.trigger(msg.event, msg.data);
          }
        });

        conn.on('close', () => {
          clearTimeout(joinTimeout);
          alert('Kết nối đến máy chủ giáo viên đã bị ngắt!');
          showScreen('home');
        });
      });

      this.peer.on('error', (err) => {
        clearTimeout(joinTimeout);
        console.warn('Peer join error:', err);
        socket.trigger('join-error', 'Không tìm thấy Mã Game PIN này hoặc phòng đã đóng!');
      });
    },

    startGame() {
      if (!this.room) return;
      this.room.currentQuestionIndex = 0;
      this.sendQuestion();
    },

    sendQuestion() {
      const room = this.room;
      if (!room || !room.quiz || !room.quiz.questions) return;
      const qIndex = room.currentQuestionIndex;
      const q = room.quiz.questions[qIndex];
      if (!q) return;

      room.state = 'QUESTION';
      room.timeLeft = q.timeLimit || 20;
      room.answers[qIndex] = {};

      const qData = {
        index: qIndex,
        total: room.quiz.questions.length,
        questionText: q.questionText,
        options: q.options,
        timeLimit: room.timeLeft
      };

      socket.trigger('host-question-start', qData);
      this.broadcastToRoom('player-question-start', qData);

      if (room.timerInterval) clearInterval(room.timerInterval);
      room.timerInterval = setInterval(() => {
        room.timeLeft--;
        socket.trigger('timer-tick', room.timeLeft);
        this.broadcastToRoom('timer-tick', room.timeLeft);

        if (room.timeLeft <= 0) {
          clearInterval(room.timerInterval);
          this.revealResults();
        }
      }, 1000);
    },

    handleStudentAnswer(conn, { choiceIndex }) {
      const room = this.room;
      if (!room || room.state !== 'QUESTION') return;

      const player = room.players[conn.peer];
      if (!player) return;

      const qIndex = room.currentQuestionIndex;
      if (!room.answers[qIndex]) room.answers[qIndex] = {};
      if (room.answers[qIndex][conn.peer] !== undefined) return;

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

      room.answers[qIndex][conn.peer] = { choiceIndex, isCorrect, pointsGained };

      conn.send({
        event: 'answer-received',
        data: { isCorrect, pointsGained, totalScore: player.score, streak: player.streak }
      });

      const totalAnswered = Object.keys(room.answers[qIndex]).length;
      const totalPlayers = Object.keys(room.players).length;

      socket.trigger('answer-count-update', { answeredCount: totalAnswered, totalPlayers });

      if (totalAnswered >= totalPlayers && totalPlayers > 0) {
        clearInterval(room.timerInterval);
        this.revealResults();
      }
    },

    submitAnswer(choiceIndex) {
      if (this.hostConn) {
        this.hostConn.send({
          event: 'submit-answer',
          data: { choiceIndex }
        });
      }
    },

    revealResults() {
      const room = this.room;
      if (!room) return;
      room.state = 'ANSWER_REVEAL';

      const qIndex = room.currentQuestionIndex;
      const question = room.quiz.questions[qIndex];
      const answersMap = room.answers[qIndex] || {};
      const stats = [0, 0, 0, 0];

      Object.values(answersMap).forEach(ans => {
        if (ans.choiceIndex >= 0 && ans.choiceIndex < 4) {
          stats[ans.choiceIndex]++;
        }
      });

      const revealData = {
        correctIndex: question.correctIndex,
        explanation: question.explanation || '',
        stats
      };

      socket.trigger('question-reveal', revealData);
      this.broadcastToRoom('question-reveal', revealData);
    },

    nextStep() {
      const room = this.room;
      if (!room) return;

      if (room.state === 'ANSWER_REVEAL') {
        room.state = 'LEADERBOARD';
        const leaderboard = Object.values(room.players)
          .map(p => ({ socketId: p.socketId, nickname: p.nickname, avatar: p.avatar, score: p.score, streak: p.streak, lastPointsGained: p.lastPointsGained }))
          .sort((a, b) => b.score - a.score);

        const lbData = { leaderboard };
        socket.trigger('show-leaderboard', lbData);
        this.broadcastToRoom('show-leaderboard', lbData);
      } else if (room.state === 'LEADERBOARD') {
        if (room.currentQuestionIndex < room.quiz.questions.length - 1) {
          room.currentQuestionIndex++;
          this.sendQuestion();
        } else {
          room.state = 'FINISHED';
          const leaderboard = Object.values(room.players)
            .map(p => ({ socketId: p.socketId, nickname: p.nickname, avatar: p.avatar, score: p.score, streak: p.streak, lastPointsGained: p.lastPointsGained }))
            .sort((a, b) => b.score - a.score);

          const finishData = { leaderboard };
          socket.trigger('game-over', finishData);
          this.broadcastToRoom('game-over', finishData);
        }
      }
    },

    kickPlayer(socketId) {
      if (this.room && this.room.players[socketId]) {
        delete this.room.players[socketId];
        const conn = this.clientConns[socketId];
        if (conn) {
          conn.send({ event: 'kicked', data: {} });
          conn.close();
          delete this.clientConns[socketId];
        }
        const playerList = Object.values(this.room.players);
        this.broadcastToRoom('update-player-list', playerList);
        socket.trigger('update-player-list', playerList);
      }
    },

    broadcastToRoom(event, data) {
      Object.values(this.clientConns).forEach(conn => {
        try {
          conn.send({ event, data });
        } catch (e) {}
      });
    }
  };

  // Unified Socket Adapter Interface
  const socket = {
    connected: false,
    on(event, fn) {
      if (!eventListeners[event]) eventListeners[event] = [];
      eventListeners[event].push(fn);
      if (realSocket) {
        realSocket.on(event, fn);
      }
    },
    emit(event, data) {
      if (realSocket && realSocket.connected) {
        realSocket.emit(event, data);
      } else {
        peerEngine.handleEmit(event, data);
      }
    },
    trigger(event, data) {
      if (eventListeners[event]) {
        eventListeners[event].forEach(fn => fn(data));
      }
    },
    connect() {
      if (realSocket) realSocket.connect();
    }
  };

  if (realSocket) {
    realSocket.on('connect', () => {
      socket.connected = true;
    });
    realSocket.on('disconnect', () => {
      socket.connected = false;
    });
  }

  // Sound Engine using Web Audio API
  let audioCtx = null;
  let soundEnabled = true;
  let bgMusicLoop = null;

  function initAudio() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContext();
    }
  }

  function playTone(freq, type = 'sine', duration = 0.2, gainValue = 0.5) {
    if (!soundEnabled || !audioCtx) return;
    try {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(gainValue, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }

  function playSoundCorrect() {
    initAudio();
    playTone(523.25, 'triangle', 0.18, 0.6); // C5
    setTimeout(() => playTone(659.25, 'triangle', 0.18, 0.6), 100); // E5
    setTimeout(() => playTone(783.99, 'triangle', 0.35, 0.7), 200); // G5
  }

  function playSoundWrong() {
    initAudio();
    playTone(300, 'sawtooth', 0.25, 0.6);
    setTimeout(() => playTone(220, 'sawtooth', 0.35, 0.6), 150);
  }

  function playSoundTick() {
    initAudio();
    playTone(850, 'sine', 0.08, 0.4);
  }

  function playSoundFanfare() {
    initAudio();
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, idx) => {
      setTimeout(() => playTone(freq, 'triangle', 0.35, 0.7), idx * 140);
    });
  }

  let selectedBgMusicTrack = 'kahoot';

  // Multi-style Audio Synthesizer Loop
  function startKahootBgMusic() {
    initAudio();
    if (!soundEnabled || !audioCtx) return;
    stopKahootBgMusic();

    let step = 0;

    if (selectedBgMusicTrack === 'edm') {
      // Fast Upbeat EDM Track (170ms step)
      const bassline = [65.41, 65.41, 77.78, 87.31, 98.00, 87.31, 77.78, 65.41];
      const arp = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1046.50, 783.99, 659.25];
      bgMusicLoop = setInterval(() => {
        if (!soundEnabled || !audioCtx) return;
        try {
          if (audioCtx.state === 'suspended') audioCtx.resume();
          const now = audioCtx.currentTime;
          // Heavy Bass
          const bOsc = audioCtx.createOscillator();
          const bGain = audioCtx.createGain();
          bOsc.type = 'sawtooth';
          bOsc.frequency.setValueAtTime(bassline[step % bassline.length], now);
          bGain.gain.setValueAtTime(0.4, now);
          bGain.gain.exponentialRampToValueAtTime(0.01, now + 0.14);
          bOsc.connect(bGain);
          bGain.connect(audioCtx.destination);
          bOsc.start(now);
          bOsc.stop(now + 0.15);

          // Fast Arpeggio Synth
          const aOsc = audioCtx.createOscillator();
          const aGain = audioCtx.createGain();
          aOsc.type = 'square';
          aOsc.frequency.setValueAtTime(arp[step % arp.length], now);
          aGain.gain.setValueAtTime(0.2, now);
          aGain.gain.exponentialRampToValueAtTime(0.005, now + 0.1);
          aOsc.connect(aGain);
          aGain.connect(audioCtx.destination);
          aOsc.start(now);
          aOsc.stop(now + 0.11);
          step++;
        } catch (e) {}
      }, 170);
    } else if (selectedBgMusicTrack === 'lofi') {
      // Chill Lofi Track (420ms step)
      const chords = [
        [261.63, 329.63, 392.00], // C maj
        [220.00, 261.63, 329.63], // A min
        [293.66, 349.23, 440.00], // D min
        [196.00, 246.94, 293.66]  // G maj
      ];
      bgMusicLoop = setInterval(() => {
        if (!soundEnabled || !audioCtx) return;
        try {
          if (audioCtx.state === 'suspended') audioCtx.resume();
          const now = audioCtx.currentTime;
          const currentChord = chords[Math.floor(step / 2) % chords.length];
          currentChord.forEach(freq => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now);
            gain.gain.setValueAtTime(0.18, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.4);
          });
          step++;
        } catch (e) {}
      }, 420);
    } else if (selectedBgMusicTrack === '8bit') {
      // 8-Bit Retro Chiptune Track (190ms step)
      const mel = [523.25, 587.33, 659.25, 698.46, 783.99, 880.00, 987.77, 1046.50];
      const bass = [130.81, 164.81, 196.00, 130.81];
      bgMusicLoop = setInterval(() => {
        if (!soundEnabled || !audioCtx) return;
        try {
          if (audioCtx.state === 'suspended') audioCtx.resume();
          const now = audioCtx.currentTime;
          // Pulse lead
          const lOsc = audioCtx.createOscillator();
          const lGain = audioCtx.createGain();
          lOsc.type = 'square';
          lOsc.frequency.setValueAtTime(mel[step % mel.length], now);
          lGain.gain.setValueAtTime(0.28, now);
          lGain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
          lOsc.connect(lGain);
          lGain.connect(audioCtx.destination);
          lOsc.start(now);
          lOsc.stop(now + 0.14);

          // 8bit Bass
          const bOsc = audioCtx.createOscillator();
          const bGain = audioCtx.createGain();
          bOsc.type = 'triangle';
          bOsc.frequency.setValueAtTime(bass[Math.floor(step / 2) % bass.length], now);
          bGain.gain.setValueAtTime(0.35, now);
          bGain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
          bOsc.connect(bGain);
          bGain.connect(audioCtx.destination);
          bOsc.start(now);
          bOsc.stop(now + 0.17);
          step++;
        } catch (e) {}
      }, 190);
    } else {
      // Default Kahoot Funky Track (240ms step)
      const bassNotes = [130.81, 130.81, 155.56, 174.61, 196.00, 174.61, 155.56, 130.81];
      const leadNotes = [523.25, 659.25, 783.99, 1046.50, 783.99, 659.25];
      bgMusicLoop = setInterval(() => {
        if (!soundEnabled || !audioCtx) return;
        try {
          if (audioCtx.state === 'suspended') audioCtx.resume();
          const now = audioCtx.currentTime;
          const bassOsc = audioCtx.createOscillator();
          const bassGain = audioCtx.createGain();
          bassOsc.type = 'sawtooth';
          bassOsc.frequency.setValueAtTime(bassNotes[step % bassNotes.length], now);
          bassGain.gain.setValueAtTime(0.35, now);
          bassGain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
          bassOsc.connect(bassGain);
          bassGain.connect(audioCtx.destination);
          bassOsc.start(now);
          bassOsc.stop(now + 0.2);

          if (step % 2 === 0) {
            const leadOsc = audioCtx.createOscillator();
            const leadGain = audioCtx.createGain();
            leadOsc.type = 'square';
            leadOsc.frequency.setValueAtTime(leadNotes[(step / 2) % leadNotes.length], now);
            leadGain.gain.setValueAtTime(0.25, now);
            leadGain.gain.exponentialRampToValueAtTime(0.005, now + 0.15);
            leadOsc.connect(leadGain);
            leadGain.connect(audioCtx.destination);
            leadOsc.start(now);
            leadOsc.stop(now + 0.16);
          }
          step++;
        } catch (e) {}
      }, 240);
    }
  }

  function stopKahootBgMusic() {
    if (bgMusicLoop) {
      clearInterval(bgMusicLoop);
      bgMusicLoop = null;
    }
  }

  // App State
  const state = {
    role: null, // 'TEACHER' or 'STUDENT'
    quizzes: [],
    currentQuiz: null,
    currentPin: null,
    studentInfo: {
      nickname: '',
      avatar: '🐱',
      score: 0,
      streak: 0
    },
    importedQuestions: [],
    editorQuestions: []
  };

  // DOM Elements
  const screens = {
    home: document.getElementById('screenHome'),
    teacherDashboard: document.getElementById('screenTeacherDashboard'),
    teacherLobby: document.getElementById('screenTeacherLobby'),
    teacherQuestion: document.getElementById('screenTeacherQuestion'),
    teacherReveal: document.getElementById('screenTeacherReveal'),
    teacherLeaderboard: document.getElementById('screenTeacherLeaderboard'),
    podium: document.getElementById('screenPodium'),
    studentJoin: document.getElementById('screenStudentJoin'),
    studentWaiting: document.getElementById('screenStudentWaiting'),
    studentPlay: document.getElementById('screenStudentPlay'),
    studentSubmitted: document.getElementById('screenStudentSubmitted'),
    studentResult: document.getElementById('screenStudentResult')
  };

  function renderMath(el) {
    if (window.renderMathInElement) {
      try {
        window.renderMathInElement(el || document.body, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false },
            { left: '\\(', right: '\\)', display: false },
            { left: '\\[', right: '\\]', display: true }
          ],
          throwOnError: false
        });
      } catch (e) {}
    }
  }

  function showScreen(screenKey) {
    Object.keys(screens).forEach((key) => {
      if (screens[key]) {
        screens[key].classList.remove('active');
      }
    });
    if (screens[screenKey]) {
      screens[screenKey].classList.add('active');
      setTimeout(() => renderMath(screens[screenKey]), 50);
    }

    // Footer Visibility: Only display on Home or Teacher screens, hide on Student screens
    const footer = document.querySelector('.app-footer');
    if (footer) {
      if (screenKey.startsWith('student')) {
        footer.style.display = 'none';
      } else {
        footer.style.display = 'block';
      }
    }
  }

  // Initial Local Storage Loading
  function loadQuizzes() {
    const saved = localStorage.getItem('kahoot_quizzes');
    if (saved) {
      try {
        state.quizzes = JSON.parse(saved);
      } catch (e) {
        state.quizzes = [];
      }
    }

    // Default Sample Quiz if empty or missing explanation
    if (!state.quizzes || state.quizzes.length === 0 || !state.quizzes[0].questions[0].explanation) {
      state.quizzes = [
        {
          id: 'quiz_sample_1',
          title: 'Đố Vui Kiến Thức Tổng Hợp 🇻🇳',
          questions: [
            {
              questionText: 'Thủ đô của Việt Nam là thành phố nào?',
              options: ['Đà Nẵng', 'Hà Nội', 'TP. Hồ Chí Minh', 'Cần Thơ'],
              correctIndex: 1,
              timeLimit: 20,
              explanation: 'Hà Nội là thủ đô của Nước Cộng hòa Xã hội Chủ nghĩa Việt Nam kể từ năm 1976.'
            },
            {
              questionText: 'Kết quả của phép tính 15 + 27 là bao nhiêu?',
              options: ['32', '40', '42', '45'],
              correctIndex: 2,
              timeLimit: 15,
              explanation: 'Ta thực hiện phép tính cộng: 15 + 27 = 42.'
            },
            {
              questionText: 'Hành tinh nào gần Mặt Trời nhất trong Hệ Mặt Trời?',
              options: ['Sao Thủy', 'Sao Kim', 'Trái Đất', 'Sao Hỏa'],
              correctIndex: 0,
              timeLimit: 20,
              explanation: 'Sao Thủy (Mercury) là hành tinh nhỏ nhất và nằm gần Mặt Trời nhất trong Hệ Mặt Trời.'
            },
            {
              questionText: 'Quốc gia nào có diện tích lớn nhất thế giới?',
              options: ['Trung Quốc', 'Mỹ', 'Nga', 'Canada'],
              correctIndex: 2,
              timeLimit: 20,
              explanation: 'Nga là quốc gia có diện tích lớn nhất thế giới với hơn 17.1 triệu km².'
            }
          ]
        }
      ];
      saveQuizzes();
    }

    // Ensure all existing loaded quizzes have an explanation field
    if (state.quizzes && state.quizzes.length > 0) {
      state.quizzes.forEach((quiz) => {
        if (quiz.questions) {
          quiz.questions.forEach((q) => {
            if (!q.explanation || q.explanation.trim() === '') {
              const labels = ['A', 'B', 'C', 'D'];
              const correctText = q.options && q.options[q.correctIndex] ? q.options[q.correctIndex] : labels[q.correctIndex || 0];
              q.explanation = `Đáp án chính xác là: ${correctText}.`;
            }
          });
        }
      });
      saveQuizzes();
    }
    renderQuizGrid();
  }

  function saveQuizzes() {
    localStorage.setItem('kahoot_quizzes', JSON.stringify(state.quizzes));
  }

  function renderQuizGrid() {
    const grid = document.getElementById('quizGrid');
    if (!grid) return;
    grid.innerHTML = '';

    state.quizzes.forEach((quiz, index) => {
      const card = document.createElement('div');
      card.className = 'quiz-card';
      card.innerHTML = `
        <div>
          <div class="quiz-card-title">${escapeHtml(quiz.title)}</div>
          <div class="quiz-card-info"><i class="fa-solid fa-circle-question"></i> ${quiz.questions ? quiz.questions.length : 0} câu hỏi</div>
        </div>
        <div class="quiz-card-actions" style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
          <button class="btn-success btn-host-quiz" data-index="${index}" style="flex: 2;">
            <i class="fa-solid fa-play"></i> HOST GAME
          </button>
          <button class="btn-secondary btn-edit-quiz" data-index="${index}" title="Chỉnh sửa câu hỏi" style="flex: 1; padding: 0.4rem 0.6rem;">
            <i class="fa-solid fa-pen-to-square"></i> Sửa
          </button>
          <button class="btn-secondary btn-delete-quiz" data-index="${index}" style="padding: 0.4rem 0.6rem;">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      `;
      grid.appendChild(card);
    });

    // Event listeners for host / edit / delete
    document.querySelectorAll('.btn-host-quiz').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const idx = e.currentTarget.getAttribute('data-index');
        hostQuiz(state.quizzes[idx]);
      });
    });

    document.querySelectorAll('.btn-edit-quiz').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const idx = e.currentTarget.getAttribute('data-index');
        const quizToEdit = state.quizzes[idx];
        if (!quizToEdit) return;

        state.editorQuestions = JSON.parse(JSON.stringify(quizToEdit.questions || []));
        const editorTitleInput = document.getElementById('editorQuizTitle');
        if (editorTitleInput) editorTitleInput.value = quizToEdit.title;
        state.editingQuizIndex = parseInt(idx, 10);

        renderEditorQuestions();
        const tabEd = document.querySelector('[data-tab="tabEditor"]');
        if (tabEd) tabEd.click();
      });
    });

    document.querySelectorAll('.btn-delete-quiz').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const idx = e.currentTarget.getAttribute('data-index');
        if (confirm(`Bạn có chắc chắn muốn xóa bộ câu hỏi "${state.quizzes[idx].title}"?`)) {
          state.quizzes.splice(idx, 1);
          saveQuizzes();
          renderQuizGrid();
        }
      });
    });
  }

  // Host Quiz
  function hostQuiz(quiz) {
    state.currentQuiz = quiz;
    socket.emit('create-room', { quiz, isVip: licenseState.isVip });
  }

  // ==================== QUESTION PARSER (EXCEL / CSV / TEXT / JSON) ====================

  function parseVietnameseQuizText(text) {
    const questions = [];
    // Split text by lines or question markers "Câu"
    const blocks = text.split(/(?=Câu\s*\d+[:\.]?)/i).filter((b) => b.trim().length > 0);

    blocks.forEach((block) => {
      const lines = block.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
      if (lines.length < 5) return; // Must have question + 4 options

      let questionText = lines[0].replace(/^Câu\s*\d+[:\.]?\s*/i, '').trim();
      let optA = '', optB = '', optC = '', optD = '';
      let correctIndex = 0;
      let timeLimit = 20;
      let explanation = '';

      lines.forEach((line) => {
        if (/^A[\.\:]\s*/i.test(line)) optA = line.replace(/^A[\.\:]\s*/i, '').trim();
        else if (/^B[\.\:]\s*/i.test(line)) optB = line.replace(/^B[\.\:]\s*/i, '').trim();
        else if (/^C[\.\:]\s*/i.test(line)) optC = line.replace(/^C[\.\:]\s*/i, '').trim();
        else if (/^D[\.\:]\s*/i.test(line)) optD = line.replace(/^D[\.\:]\s*/i, '').trim();
        else if (/^Đáp án[\:\=]\s*/i.test(line)) {
          const ansChar = line.replace(/^Đáp án[\:\=]\s*/i, '').trim().toUpperCase();
          if (ansChar === 'A' || ansChar === '1') correctIndex = 0;
          else if (ansChar === 'B' || ansChar === '2') correctIndex = 1;
          else if (ansChar === 'C' || ansChar === '3') correctIndex = 2;
          else if (ansChar === 'D' || ansChar === '4') correctIndex = 3;
        } else if (/^Thời gian[\:\=]\s*/i.test(line)) {
          const t = parseInt(line.replace(/^Thời gian[\:\=]\s*/i, '').trim(), 10);
          if (!isNaN(t) && t > 0) timeLimit = t;
        } else if (/^(Giải thích|Explanation|HDG|Hướng dẫn giải|Ghi chú)[\:\=\-]\s*/i.test(line)) {
          explanation = line.replace(/^(Giải thích|Explanation|HDG|Hướng dẫn giải|Ghi chú)[\:\=\-]\s*/i, '').trim();
        }
      });

      if (questionText && optA && optB) {
        questions.push({
          questionText,
          options: [optA, optB, optC || 'Không có', optD || 'Không có'],
          correctIndex,
          timeLimit,
          explanation
        });
      }
    });

    return questions;
  }

  function showImportPreview(questions, defaultTitle) {
    if (!questions || questions.length === 0) {
      return alert('Không tìm thấy câu hỏi hợp lệ!');
    }
    state.importedQuestions = questions;
    document.getElementById('importPreviewArea').style.display = 'block';
    document.getElementById('previewCount').innerText = questions.length;
    document.getElementById('importQuizTitle').value = defaultTitle || 'Bộ Trắc Nghiệm Mới';

    const list = document.getElementById('previewQuestionsList');
    list.innerHTML = '';

    questions.forEach((q, idx) => {
      const labels = ['A', 'B', 'C', 'D'];
      const correctLabel = labels[q.correctIndex || 0];
      const correctText = q.options && q.options[q.correctIndex] ? q.options[q.correctIndex] : correctLabel;
      const expToShow = (q.explanation && q.explanation.trim().length > 0) ? q.explanation : `Đáp án chính xác là phương án ${correctLabel}: ${correctText}`;
      q.explanation = expToShow; // Ensure explanation is always populated

      const item = document.createElement('div');
      item.className = 'preview-q-card';
      item.innerHTML = `
        <div class="preview-q-title">Câu ${idx + 1}: ${escapeHtml(q.questionText)} (${q.timeLimit || 20}s)</div>
        <div class="preview-q-opts">
          <div class="opt-item ${q.correctIndex === 0 ? 'correct' : ''}">A. ${escapeHtml(q.options[0])}</div>
          <div class="opt-item ${q.correctIndex === 1 ? 'correct' : ''}">B. ${escapeHtml(q.options[1])}</div>
          <div class="opt-item ${q.correctIndex === 2 ? 'correct' : ''}">C. ${escapeHtml(q.options[2])}</div>
          <div class="opt-item ${q.correctIndex === 3 ? 'correct' : ''}">D. ${escapeHtml(q.options[3])}</div>
        </div>
        <div class="preview-q-exp" style="margin-top: 0.6rem; color: #ffcc00; font-size: 0.95rem; font-weight: 600;"><i class="fa-solid fa-lightbulb"></i> Giải thích: ${escapeHtml(expToShow)}</div>
      `;
      list.appendChild(item);
    });
  }

  // File Drop Zone
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) handleFileImport(e.target.files[0]);
    });
  }

  if (dropZone) {
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = '#ffcc00';
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.style.borderColor = 'rgba(255, 255, 255, 0.4)';
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'rgba(255, 255, 255, 0.4)';
      if (e.dataTransfer.files.length > 0) handleFileImport(e.dataTransfer.files[0]);
    });
  }

  // Quick Text / JSON Import Button
  const btnParseQuickText = document.getElementById('btnParseQuickText');
  if (btnParseQuickText) {
    btnParseQuickText.addEventListener('click', () => {
      let rawText = document.getElementById('txtQuickImport').value.trim();
      if (!rawText) return alert('Vui lòng dán văn bản câu hỏi hoặc đoạn mã JSON vào khung!');

      // Auto strip markdown code fences if copied from AI tools (```json ... ```)
      rawText = rawText.replace(/^```(?:json)?/gi, '').replace(/```$/gi, '').trim();

      // Strip outer quotes if whole JSON is enclosed in quotes e.g. "[ { ... } ]"
      if ((rawText.startsWith('"') && rawText.endsWith('"')) || (rawText.startsWith("'") && rawText.endsWith("'"))) {
        let unquoted = rawText.slice(1, -1).trim();
        if (unquoted.startsWith('[') || unquoted.startsWith('{')) {
          rawText = unquoted;
        }
      }

      let questions = [];
      // Always try smartParseJSON first, fallback to text parser if no questions returned
      try {
        const parsed = smartParseJSON(rawText);
        if (Array.isArray(parsed) && parsed.length > 0) {
          questions = parsed;
        } else if (parsed && parsed.questions && parsed.questions.length > 0) {
          questions = parsed.questions;
        }
      } catch (e) {
        console.warn("smartParseJSON error, trying text parser:", e);
      }

      if (!questions || questions.length === 0) {
        questions = parseVietnameseQuizText(rawText);
      }

      showImportPreview(questions, 'Bộ Câu Hỏi Nhập Nhanh');
    });
  }

  function smartParseJSON(rawText) {
    let text = rawText.trim().replace(/^\uFEFF/, '');

    // Strip markdown fences if present
    text = text.replace(/^```(?:json)?/gi, '').replace(/```$/gi, '').trim();

    // Strip outer quotes wrapping JSON arrays or objects e.g. "[ { ... } ]"
    if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
      let unquoted = text.slice(1, -1).trim();
      if (unquoted.startsWith('[') || unquoted.startsWith('{')) {
        text = unquoted;
      }
    }

    // Handle stringified JSON (when JSON.parse evaluates to a string primitive)
    try {
      const firstParse = JSON.parse(text);
      if (typeof firstParse === 'string') {
        const secondParse = JSON.parse(firstParse);
        if (Array.isArray(secondParse) || (secondParse && secondParse.questions)) return secondParse;
      } else if (Array.isArray(firstParse) || (firstParse && firstParse.questions)) {
        return firstParse;
      }
    } catch (e) {}

    // Unescape doubly-escaped json string if needed
    if (text.includes('\\"')) {
      try {
        const unescaped = JSON.parse('"' + text + '"');
        if (typeof unescaped === 'string') text = unescaped;
      } catch (e) {}
    }

    // 1. Try standard JSON parse
    try {
      const data = JSON.parse(text);
      if (Array.isArray(data) || (data && data.questions)) return data;
    } catch (e1) {
      console.warn("Standard JSON.parse failed, trying smart repair...", e1);
    }

    // 2. Try JavaScript Function evaluation (handles loose quotes / single quotes)
    try {
      const fn = new Function('return ' + text);
      const res = fn();
      if (res && (Array.isArray(res) || res.questions)) return res;
    } catch (e2) {
      console.warn("JS evaluation failed...", e2);
    }

    // 3. Smart Regex Repair for unescaped inner quotes
    try {
      let repaired = text;
      // Fix questionText inner quotes
      repaired = repaired.replace(/("questionText"\s*:\s*")([\s\S]*?)("\s*,\s*"options"\s*:)/gi, (fullMatch, head, body, tail) => {
        return head + body.replace(/"/g, '’') + tail;
      });

      // Fix explanation inner quotes
      repaired = repaired.replace(/("explanation"\s*:\s*")([\s\S]*?)("\s*\}|\s*"\s*,\s*"[a-zA-Z0-9_]+"\s*:)/gi, (fullMatch, head, body, tail) => {
        return head + body.replace(/"/g, '’') + tail;
      });

      // Fix options inner quotes
      repaired = repaired.replace(/("options"\s*:\s*\[)([\s\S]*?)(\]\s*,\s*"correctIndex"\s*:)/gi, (fullMatch, head, body, tail) => {
        let cleanBody = body.replace(/"([^"]*)"/g, (m, optText) => '"' + optText.replace(/"/g, '’') + '"');
        return head + cleanBody + tail;
      });

      const res = JSON.parse(repaired);
      if (Array.isArray(res) || (res && res.questions)) return res;
    } catch (e3) {
      console.warn("Regex repair failed, trying structural fallback...", e3);
    }

    // 4. Structural Fallback: Parse question blocks directly (100% immune to syntax errors, unescaped quotes & missing outer brackets)
    const questions = [];
    const blocks = text.split(/(?=\{|\s*"questionText")/gi);

    blocks.forEach((block) => {
      if (!block.includes('options')) return;

      // Extract questionText
      let qText = '';
      const qMatch = block.match(/"questionText"\s*:\s*"([\s\S]*?)"\s*,\s*"options"/i)
                  || block.match(/"questionText"\s*:\s*"([\s\S]*?)"(?=\s*,\s*"options")/i);
      
      if (qMatch) {
        qText = qMatch[1].replace(/\\"/g, '"');
      } else {
        const qIdx = block.indexOf('"questionText"');
        const oIdx = block.indexOf('"options"');
        if (qIdx !== -1 && oIdx !== -1 && oIdx > qIdx) {
          let rawQ = block.substring(qIdx + 14, oIdx).trim();
          rawQ = rawQ.replace(/^:\s*"/, '').replace(/",?\s*$/, '').trim();
          qText = rawQ;
        } else {
          const oIdx2 = block.indexOf('"options"');
          if (oIdx2 > 0) {
            let rawQ = block.substring(0, oIdx2).trim();
            rawQ = rawQ.replace(/^[^{]*{\s*/, '').replace(/^"questionText"\s*:\s*"/i, '').replace(/",?\s*$/, '').trim();
            if (rawQ.length > 2) qText = rawQ;
          }
        }
      }

      // Extract options (array [ ... ])
      const optionsMatch = block.match(/"options"\s*:\s*\[([\s\S]*?)\]/i);
      const optItems = [];
      if (optionsMatch) {
        const rawOpts = optionsMatch[1];
        const optRegex = /"([^"\\]*(?:\\.[^"\\]*)*)"/g;
        let optM;
        while ((optM = optRegex.exec(rawOpts)) !== null) {
          optItems.push(optM[1].replace(/\\"/g, '"'));
        }
        if (optItems.length < 2) {
          const parts = rawOpts.split(/",\s*"/).map(s => s.replace(/^"|"$/g, '').trim());
          if (parts.length >= 2) {
            optItems.length = 0;
            optItems.push(...parts);
          }
        }
      }

      while (optItems.length < 4) optItems.push('Không có');

      // Extract correctIndex & timeLimit
      const correctMatch = block.match(/"correctIndex"\s*:\s*(\d+)/i);
      const timeMatch = block.match(/"timeLimit"\s*:\s*(\d+)/i);

      // Extract explanation
      let expText = '';
      const expMatch = block.match(/"explanation"\s*:\s*"([\s\S]*?)"(?=\s*\}|\s*$|\s*,\s*")/i);
      if (expMatch) {
        expText = expMatch[1].replace(/\\"/g, '"');
      } else {
        const eIdx = block.indexOf('"explanation"');
        if (eIdx !== -1) {
          let rawE = block.substring(eIdx + 13).trim();
          rawE = rawE.replace(/^:\s*"/, '').replace(/["\}]*\s*$/, '').trim();
          expText = rawE;
        }
      }

      if (qText && optItems.length >= 2) {
        questions.push({
          questionText: qText,
          options: optItems.slice(0, 4),
          correctIndex: correctMatch ? parseInt(correctMatch[1], 10) : 0,
          timeLimit: timeMatch ? parseInt(timeMatch[1], 10) : 20,
          explanation: expText
        });
      }
    });

    if (questions.length > 0) {
      return questions;
    }

    throw new Error("Không thể phân tích câu hỏi trong nội dung này.");
  }

  function handleFileImport(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext !== 'json' && ext !== 'csv') {
      return alert('Hệ thống chỉ hỗ trợ nhập dữ liệu từ File .JSON hoặc .CSV! Vui lòng chọn đúng định dạng.');
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const textContent = e.target.result;
        if (ext === 'csv') {
          const questions = parseCSVQuiz(textContent);
          showImportPreview(questions, file.name.replace(/\.csv$/i, ''));
        } else {
          const data = smartParseJSON(textContent);
          if (Array.isArray(data)) {
            showImportPreview(data, file.name.replace(/\.json$/i, ''));
          } else if (data && data.questions) {
            showImportPreview(data.questions, data.title || file.name.replace(/\.json$/i, ''));
          } else {
            alert('File JSON phải chứa một mảng danh sách câu hỏi hợp lệ!');
          }
        }
      } catch (err) {
        alert(`Lỗi phân tích File ${ext.toUpperCase()}!\n${err.message}`);
      }
    };
    reader.readAsText(file);
  }

  function parseCSVQuiz(csvText) {
    if (!csvText || !csvText.trim()) throw new Error("File CSV rỗng!");

    function parseCSVRows(str) {
      const rows = [];
      const lines = str.split(/\r?\n/);
      if (lines.length === 0) return rows;
      const delimiter = (lines[0] && lines[0].includes(';')) ? ';' : ',';

      for (let line of lines) {
        if (!line.trim()) continue;
        const row = [];
        let insideQuote = false;
        let cell = '';

        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            insideQuote = !insideQuote;
          } else if (char === delimiter && !insideQuote) {
            row.push(cell.trim().replace(/^"|"$/g, ''));
            cell = '';
          } else {
            cell += char;
          }
        }
        row.push(cell.trim().replace(/^"|"$/g, ''));
        rows.push(row);
      }
      return rows;
    }

    const rows = parseCSVRows(csvText);
    if (!rows || rows.length === 0) throw new Error("Không thể đọc được dữ liệu trong file CSV.");

    let startIdx = 0;
    const headerLine = rows[0].map(c => String(c || '').toLowerCase());
    const isHeader = headerLine.some(c => c.includes('câu hỏi') || c.includes('question') || c.includes('phương án') || c.includes('đáp án'));
    if (isHeader) {
      startIdx = 1;
    }

    const questions = [];
    for (let i = startIdx; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 2) continue;

      const questionText = row[0] ? row[0].trim() : '';
      if (!questionText) continue;

      let options = ['A', 'B', 'C', 'D'];
      if (row.length >= 5) {
        options = [row[1] || '', row[2] || '', row[3] || '', row[4] || ''];
      }

      let correctRaw = (row[5] || '0').trim().toUpperCase();
      let correctIndex = 0;
      if (correctRaw === 'A' || correctRaw === '1') correctIndex = 0;
      else if (correctRaw === 'B' || correctRaw === '2') correctIndex = 1;
      else if (correctRaw === 'C' || correctRaw === '3') correctIndex = 2;
      else if (correctRaw === 'D' || correctRaw === '4') correctIndex = 3;
      else {
        const parsed = parseInt(correctRaw, 10);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 3) correctIndex = parsed;
      }

      let timeLimit = parseInt((row[6] || '20').trim(), 10) || 20;
      let explanation = (row[7] || '').trim();

      questions.push({
        questionText,
        options,
        correctIndex,
        timeLimit,
        explanation
      });
    }

    if (questions.length === 0) throw new Error("Không tìm thấy câu hỏi hợp lệ trong file CSV!");
    return questions;
  }

  function showImportPreview(questions, defaultTitle) {
    if (!questions || questions.length === 0) {
      document.getElementById('importPreviewArea').style.display = 'none';
      state.importedQuestions = [];
      const list = document.getElementById('previewQuestionsList');
      if (list) list.innerHTML = '';
      return alert('Không tìm thấy câu hỏi hợp lệ! Vui lòng kiểm tra lại file đã chọn.');
    }

    state.importedQuestions = questions;
    document.getElementById('importPreviewArea').style.display = 'block';
    if (defaultTitle) {
      document.getElementById('importQuizTitle').value = defaultTitle;
    }

    renderImportPreviewList();
  }

  function renderImportPreviewList() {
    const list = document.getElementById('previewQuestionsList');
    if (!list) return;
    list.innerHTML = '';

    document.getElementById('previewCount').innerText = state.importedQuestions.length;

    state.importedQuestions.forEach((q, idx) => {
      if (!q.options) q.options = ['A', 'B', 'C', 'D'];
      while (q.options.length < 4) q.options.push('Không có');
      if (q.correctIndex === undefined || q.correctIndex === null) q.correctIndex = 0;
      if (!q.timeLimit) q.timeLimit = 20;

      const labels = ['A', 'B', 'C', 'D'];
      const correctLabel = labels[q.correctIndex || 0];
      const correctText = q.options && q.options[q.correctIndex] ? q.options[q.correctIndex] : correctLabel;
      if (!q.explanation || q.explanation.trim().length === 0) {
        q.explanation = `Đáp án chính xác là phương án ${correctLabel}: ${correctText}`;
      }

      const item = document.createElement('div');
      item.className = 'preview-q-card editable-q-card';
      item.style.cssText = 'background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.18); border-radius: 18px; padding: 1.25rem; margin-bottom: 1.2rem;';

      item.innerHTML = `
        <div class="q-header-row" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
          <strong style="color: #ffcc00; font-size: 1.05rem;"><i class="fa-solid fa-pen-to-square"></i> Câu ${idx + 1}:</strong>
          <button class="btn-secondary btn-del-imp-q" data-idx="${idx}" style="color: #ff6b6b; border-color: rgba(255,107,107,0.4); padding: 0.3rem 0.75rem; font-size: 0.85rem;">
            <i class="fa-solid fa-trash"></i> Xóa câu này
          </button>
        </div>

        <div class="form-group" style="margin-bottom: 0.75rem;">
          <label style="font-size: 0.88rem; opacity: 0.9;">Nội dung câu hỏi:</label>
          <input type="text" class="form-control imp-q-text" data-idx="${idx}" value="${escapeHtml(q.questionText)}" placeholder="Nhập câu hỏi...">
        </div>

        <label style="font-size: 0.88rem; opacity: 0.9; display: block; margin-bottom: 0.4rem;">4 Phương án trả lời:</label>
        <div class="preview-q-opts" style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; margin-bottom: 0.75rem;">
          <div class="input-group-opt" style="display: flex; align-items: center; gap: 0.5rem; background: rgba(0, 0, 0, 0.25); padding: 0.35rem 0.6rem; border-radius: 10px; border: 1px solid ${q.correctIndex === 0 ? '#10b981' : 'rgba(255, 255, 255, 0.15)'};">
            <span style="background: #e21b3c; color: #fff; font-weight: 800; font-size: 0.85rem; min-width: 26px; height: 26px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;">A</span>
            <input type="text" class="form-control imp-opt" data-idx="${idx}" data-opt="0" value="${escapeHtml(q.options[0])}" placeholder="Đáp án A" style="border: none; background: transparent; padding: 0.2rem 0.4rem;">
          </div>
          <div class="input-group-opt" style="display: flex; align-items: center; gap: 0.5rem; background: rgba(0, 0, 0, 0.25); padding: 0.35rem 0.6rem; border-radius: 10px; border: 1px solid ${q.correctIndex === 1 ? '#10b981' : 'rgba(255, 255, 255, 0.15)'};">
            <span style="background: #1368ce; color: #fff; font-weight: 800; font-size: 0.85rem; min-width: 26px; height: 26px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;">B</span>
            <input type="text" class="form-control imp-opt" data-idx="${idx}" data-opt="1" value="${escapeHtml(q.options[1])}" placeholder="Đáp án B" style="border: none; background: transparent; padding: 0.2rem 0.4rem;">
          </div>
          <div class="input-group-opt" style="display: flex; align-items: center; gap: 0.5rem; background: rgba(0, 0, 0, 0.25); padding: 0.35rem 0.6rem; border-radius: 10px; border: 1px solid ${q.correctIndex === 2 ? '#10b981' : 'rgba(255, 255, 255, 0.15)'};">
            <span style="background: #d89e00; color: #fff; font-weight: 800; font-size: 0.85rem; min-width: 26px; height: 26px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;">C</span>
            <input type="text" class="form-control imp-opt" data-idx="${idx}" data-opt="2" value="${escapeHtml(q.options[2])}" placeholder="Đáp án C" style="border: none; background: transparent; padding: 0.2rem 0.4rem;">
          </div>
          <div class="input-group-opt" style="display: flex; align-items: center; gap: 0.5rem; background: rgba(0, 0, 0, 0.25); padding: 0.35rem 0.6rem; border-radius: 10px; border: 1px solid ${q.correctIndex === 3 ? '#10b981' : 'rgba(255, 255, 255, 0.15)'};">
            <span style="background: #26890c; color: #fff; font-weight: 800; font-size: 0.85rem; min-width: 26px; height: 26px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;">D</span>
            <input type="text" class="form-control imp-opt" data-idx="${idx}" data-opt="3" value="${escapeHtml(q.options[3])}" placeholder="Đáp án D" style="border: none; background: transparent; padding: 0.2rem 0.4rem;">
          </div>
        </div>

        <div class="inline-group" style="display: flex; gap: 1.5rem; align-items: center; flex-wrap: wrap; margin-bottom: 0.75rem;">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <label style="font-size: 0.88rem; margin: 0;">Đáp án đúng:</label>
            <select class="form-control imp-correct" data-idx="${idx}" style="width: 80px; font-weight: bold; color: #10b981;">
              <option value="0" ${q.correctIndex === 0 ? 'selected' : ''}>A</option>
              <option value="1" ${q.correctIndex === 1 ? 'selected' : ''}>B</option>
              <option value="2" ${q.correctIndex === 2 ? 'selected' : ''}>C</option>
              <option value="3" ${q.correctIndex === 3 ? 'selected' : ''}>D</option>
            </select>
          </div>

          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <label style="font-size: 0.88rem; margin: 0;">Thời gian (giây):</label>
            <input type="number" class="form-control imp-time" data-idx="${idx}" value="${q.timeLimit || 20}" style="width: 85px;">
          </div>
        </div>

        <div class="form-group" style="margin-bottom: 0;">
          <label style="font-size: 0.88rem; color: #ffcc00;"><i class="fa-solid fa-lightbulb"></i> Giải thích đáp án:</label>
          <input type="text" class="form-control imp-exp" data-idx="${idx}" value="${escapeHtml(q.explanation || '')}" placeholder="Nhập lời giải thích hiển thị khi đưa ra kết quả...">
        </div>
      `;
      list.appendChild(item);
    });

    // Add "Thêm 1 câu hỏi" button
    const addBtnContainer = document.createElement('div');
    addBtnContainer.style.cssText = 'text-align: center; margin-top: 1rem; margin-bottom: 1.5rem;';
    addBtnContainer.innerHTML = `
      <button id="btnAddImpQuestion" class="btn-secondary" style="border-style: dashed; padding: 0.6rem 1.5rem;">
        <i class="fa-solid fa-plus"></i> Thêm 1 Câu Hỏi Mới Vào Bộ Này
      </button>
    `;
    list.appendChild(addBtnContainer);

    // Input change listeners
    document.querySelectorAll('.imp-q-text').forEach((inp) => {
      inp.addEventListener('input', (e) => {
        const i = e.target.getAttribute('data-idx');
        state.importedQuestions[i].questionText = e.target.value;
      });
    });

    document.querySelectorAll('.imp-opt').forEach((inp) => {
      inp.addEventListener('input', (e) => {
        const i = e.target.getAttribute('data-idx');
        const optIdx = parseInt(e.target.getAttribute('data-opt'), 10);
        state.importedQuestions[i].options[optIdx] = e.target.value;
      });
    });

    document.querySelectorAll('.imp-correct').forEach((sel) => {
      sel.addEventListener('change', (e) => {
        const i = e.target.getAttribute('data-idx');
        state.importedQuestions[i].correctIndex = parseInt(e.target.value, 10);
        renderImportPreviewList();
      });
    });

    document.querySelectorAll('.imp-time').forEach((inp) => {
      inp.addEventListener('input', (e) => {
        const i = e.target.getAttribute('data-idx');
        state.importedQuestions[i].timeLimit = parseInt(e.target.value, 10) || 20;
      });
    });

    document.querySelectorAll('.imp-exp').forEach((inp) => {
      inp.addEventListener('input', (e) => {
        const i = e.target.getAttribute('data-idx');
        state.importedQuestions[i].explanation = e.target.value;
      });
    });

    document.querySelectorAll('.btn-del-imp-q').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const i = e.currentTarget.getAttribute('data-idx');
        state.importedQuestions.splice(i, 1);
        renderImportPreviewList();
      });
    });

    const btnAdd = document.getElementById('btnAddImpQuestion');
    if (btnAdd) {
      btnAdd.addEventListener('click', () => {
        state.importedQuestions.push({
          questionText: 'Nội dung câu hỏi mới?',
          options: ['Lựa chọn A', 'Lựa chọn B', 'Lựa chọn C', 'Lựa chọn D'],
          correctIndex: 0,
          timeLimit: 20,
          explanation: 'Giải thích chi tiết cho đáp án đúng A.'
        });
        renderImportPreviewList();
      });
    }
  }

  // ==================== MANUAL EDITOR LOGIC ====================
  function initEditor() {
    state.editorQuestions = [
      {
        questionText: 'Câu hỏi mẫu số 1?',
        options: ['Lựa chọn A', 'Lựa chọn B', 'Lựa chọn C', 'Lựa chọn D'],
        correctIndex: 0,
        timeLimit: 20,
        explanation: ''
      }
    ];
    renderEditorQuestions();
  }

  function renderEditorQuestions() {
    const list = document.getElementById('editorQuestionsList');
    if (!list) return;
    list.innerHTML = '';

    state.editorQuestions.forEach((q, idx) => {
      if (!q.options) q.options = ['A', 'B', 'C', 'D'];
      while (q.options.length < 4) q.options.push('Không có');
      if (q.correctIndex === undefined || q.correctIndex === null) q.correctIndex = 0;
      if (!q.timeLimit) q.timeLimit = 20;

      const el = document.createElement('div');
      el.className = 'preview-q-card editable-q-card';
      el.style.cssText = 'background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.18); border-radius: 18px; padding: 1.25rem; margin-bottom: 1.2rem;';
      el.innerHTML = `
        <div class="q-header-row" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
          <strong style="color: #ffcc00; font-size: 1.05rem;"><i class="fa-solid fa-pen-to-square"></i> Câu ${idx + 1}:</strong>
          <button class="btn-secondary btn-del-ed-q" data-idx="${idx}" style="color: #ff6b6b; border-color: rgba(255,107,107,0.4); padding: 0.3rem 0.75rem; font-size: 0.85rem;">
            <i class="fa-solid fa-trash"></i> Xóa câu này
          </button>
        </div>

        <div class="form-group" style="margin-bottom: 0.75rem;">
          <label style="font-size: 0.88rem; opacity: 0.9;">Nội dung câu hỏi:</label>
          <input type="text" class="form-control ed-q-text" data-idx="${idx}" value="${escapeHtml(q.questionText)}" placeholder="Nhập câu hỏi...">
        </div>

        <label style="font-size: 0.88rem; opacity: 0.9; display: block; margin-bottom: 0.4rem;">4 Phương án trả lời:</label>
        <div class="preview-q-opts" style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; margin-bottom: 0.75rem;">
          <div class="input-group-opt" style="display: flex; align-items: center; gap: 0.5rem; background: rgba(0, 0, 0, 0.25); padding: 0.35rem 0.6rem; border-radius: 10px; border: 1px solid ${q.correctIndex === 0 ? '#10b981' : 'rgba(255, 255, 255, 0.15)'};">
            <span style="background: #e21b3c; color: #fff; font-weight: 800; font-size: 0.85rem; min-width: 26px; height: 26px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;">A</span>
            <input type="text" class="form-control ed-opt" data-idx="${idx}" data-opt="0" value="${escapeHtml(q.options[0])}" placeholder="Đáp án A" style="border: none; background: transparent; padding: 0.2rem 0.4rem;">
          </div>
          <div class="input-group-opt" style="display: flex; align-items: center; gap: 0.5rem; background: rgba(0, 0, 0, 0.25); padding: 0.35rem 0.6rem; border-radius: 10px; border: 1px solid ${q.correctIndex === 1 ? '#10b981' : 'rgba(255, 255, 255, 0.15)'};">
            <span style="background: #1368ce; color: #fff; font-weight: 800; font-size: 0.85rem; min-width: 26px; height: 26px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;">B</span>
            <input type="text" class="form-control ed-opt" data-idx="${idx}" data-opt="1" value="${escapeHtml(q.options[1])}" placeholder="Đáp án B" style="border: none; background: transparent; padding: 0.2rem 0.4rem;">
          </div>
          <div class="input-group-opt" style="display: flex; align-items: center; gap: 0.5rem; background: rgba(0, 0, 0, 0.25); padding: 0.35rem 0.6rem; border-radius: 10px; border: 1px solid ${q.correctIndex === 2 ? '#10b981' : 'rgba(255, 255, 255, 0.15)'};">
            <span style="background: #d89e00; color: #fff; font-weight: 800; font-size: 0.85rem; min-width: 26px; height: 26px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;">C</span>
            <input type="text" class="form-control ed-opt" data-idx="${idx}" data-opt="2" value="${escapeHtml(q.options[2])}" placeholder="Đáp án C" style="border: none; background: transparent; padding: 0.2rem 0.4rem;">
          </div>
          <div class="input-group-opt" style="display: flex; align-items: center; gap: 0.5rem; background: rgba(0, 0, 0, 0.25); padding: 0.35rem 0.6rem; border-radius: 10px; border: 1px solid ${q.correctIndex === 3 ? '#10b981' : 'rgba(255, 255, 255, 0.15)'};">
            <span style="background: #26890c; color: #fff; font-weight: 800; font-size: 0.85rem; min-width: 26px; height: 26px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;">D</span>
            <input type="text" class="form-control ed-opt" data-idx="${idx}" data-opt="3" value="${escapeHtml(q.options[3])}" placeholder="Đáp án D" style="border: none; background: transparent; padding: 0.2rem 0.4rem;">
          </div>
        </div>

        <div class="inline-group" style="display: flex; gap: 1.5rem; align-items: center; flex-wrap: wrap; margin-bottom: 0.75rem;">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <label style="font-size: 0.88rem; margin: 0;">Đáp án đúng:</label>
            <select class="form-control ed-correct" data-idx="${idx}" style="width: 80px; font-weight: bold; color: #10b981;">
              <option value="0" ${q.correctIndex === 0 ? 'selected' : ''}>A</option>
              <option value="1" ${q.correctIndex === 1 ? 'selected' : ''}>B</option>
              <option value="2" ${q.correctIndex === 2 ? 'selected' : ''}>C</option>
              <option value="3" ${q.correctIndex === 3 ? 'selected' : ''}>D</option>
            </select>
          </div>

          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <label style="font-size: 0.88rem; margin: 0;">Thời gian (giây):</label>
            <input type="number" class="form-control ed-time" data-idx="${idx}" value="${q.timeLimit || 20}" style="width: 85px;">
          </div>
        </div>

        <div class="form-group" style="margin-bottom: 0;">
          <label style="font-size: 0.88rem; color: #ffcc00;"><i class="fa-solid fa-lightbulb"></i> Giải thích đáp án:</label>
          <input type="text" class="form-control ed-exp" data-idx="${idx}" value="${escapeHtml(q.explanation || '')}" placeholder="Nhập lời giải thích hiển thị khi đưa ra kết quả...">
        </div>
      `;
      list.appendChild(el);
    });

    // Listeners for ed-q inputs
    document.querySelectorAll('.ed-q-text').forEach((inp) => {
      inp.addEventListener('input', (e) => {
        const i = e.target.getAttribute('data-idx');
        state.editorQuestions[i].questionText = e.target.value;
      });
    });

    document.querySelectorAll('.ed-opt').forEach((inp) => {
      inp.addEventListener('input', (e) => {
        const i = e.target.getAttribute('data-idx');
        const o = e.target.getAttribute('data-opt');
        state.editorQuestions[i].options[o] = e.target.value;
      });
    });

    document.querySelectorAll('.ed-correct').forEach((sel) => {
      sel.addEventListener('change', (e) => {
        const i = e.target.getAttribute('data-idx');
        state.editorQuestions[i].correctIndex = parseInt(e.target.value, 10);
        renderEditorQuestions();
      });
    });

    document.querySelectorAll('.ed-time').forEach((inp) => {
      inp.addEventListener('input', (e) => {
        const i = e.target.getAttribute('data-idx');
        state.editorQuestions[i].timeLimit = parseInt(e.target.value, 10) || 20;
      });
    });

    document.querySelectorAll('.ed-exp').forEach((inp) => {
      inp.addEventListener('input', (e) => {
        const i = e.target.getAttribute('data-idx');
        state.editorQuestions[i].explanation = e.target.value;
      });
    });

    document.querySelectorAll('.btn-del-ed-q').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const i = e.currentTarget.getAttribute('data-idx');
        state.editorQuestions.splice(i, 1);
        renderEditorQuestions();
      });
    });
  }

  // ==================== EVENT LISTENERS ====================

  function bindEvents() {
    // Navigation / Role selection
    document.getElementById('cardSelectTeacher').addEventListener('click', () => {
      state.role = 'TEACHER';
      showScreen('teacherDashboard');
    });

    document.getElementById('cardSelectStudent').addEventListener('click', () => {
      state.role = 'STUDENT';
      showScreen('studentJoin');
    });

    document.getElementById('btnRoleSwitch').addEventListener('click', () => {
      showScreen('home');
    });

    document.getElementById('btnHome').addEventListener('click', () => {
      showScreen('home');
    });

    // Background Music Selection
    const bgMusicSelect = document.getElementById('bgMusicSelect');
    if (bgMusicSelect) {
      bgMusicSelect.addEventListener('change', (e) => {
        selectedBgMusicTrack = e.target.value;
        if (bgMusicLoop) {
          startKahootBgMusic();
        }
      });
    }

    // VIP License Modal Listeners
    const btnOpenLicenseModal = document.getElementById('btnOpenLicenseModal');
    const btnCloseLicenseModal = document.getElementById('btnCloseLicenseModal');
    const modalLicense = document.getElementById('modalLicense');

    if (btnOpenLicenseModal && modalLicense) {
      btnOpenLicenseModal.addEventListener('click', () => {
        modalLicense.style.display = 'flex';
      });
    }

    if (btnCloseLicenseModal && modalLicense) {
      btnCloseLicenseModal.addEventListener('click', () => {
        modalLicense.style.display = 'none';
      });
    }

    const btnVerifyLicenseKey = document.getElementById('btnVerifyLicenseKey');
    if (btnVerifyLicenseKey) {
      btnVerifyLicenseKey.addEventListener('click', async () => {
        const keyInp = document.getElementById('txtLicenseKey').value.trim();
        if (!keyInp) return alert('Vui lòng nhập Mã Bản Quyền!');

        btnVerifyLicenseKey.disabled = true;
        btnVerifyLicenseKey.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xác thực với Google Sheets...';

        const res = await verifyLicenseKeyWithGoogleSheets(keyInp);
        btnVerifyLicenseKey.disabled = false;
        btnVerifyLicenseKey.innerHTML = '<i class="fa-solid fa-bolt"></i> Kích Hoạt Bản Quyền Ngay';

        if (res && res.valid) {
          licenseState.isVip = true;
          licenseState.key = keyInp;
          licenseState.customerName = res.customerName || 'Giáo Viên VIP';
          licenseState.plan = res.plan || 'VIP Pro';
          licenseState.expiresAt = res.expiresAt || 'Vĩnh viễn';
          licenseState.remainingDays = res.remainingDays || 9999;

          localStorage.setItem('qm_license_key', keyInp);
          updateLicenseUI();
          alert(`🎉 Kích hoạt Bản Quyền thành công!\nXin chào ${licenseState.customerName} (${licenseState.plan})`);
        } else {
          alert(`❌ ${res.message || 'Mã bản quyền không hợp lệ!'}`);
        }
      });
    }

    const btnDeactivateKey = document.getElementById('btnDeactivateKey');
    if (btnDeactivateKey) {
      btnDeactivateKey.addEventListener('click', () => {
        if (confirm('Bạn có chắc chắn muốn hủy kích hoạt mã bản quyền trên thiết bị này?')) {
          localStorage.removeItem('qm_license_key');
          licenseState.isVip = false;
          licenseState.key = '';
          updateLicenseUI();
          alert('Đã hủy kích hoạt bản quyền.');
        }
      });
    }

    // Tabs navigation in Teacher Dashboard
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));

        e.currentTarget.classList.add('active');
        const target = e.currentTarget.getAttribute('data-tab');
        document.getElementById(target).classList.add('active');

        if (target === 'tabEditor') {
          if (!state.editorQuestions || state.editorQuestions.length === 0) {
            initEditor();
          } else {
            renderEditorQuestions();
          }
        }
      });
    });

    // File Import Drop Zone
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');

    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) handleFileImport(e.target.files[0]);
    });

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = '#ffcc00';
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.style.borderColor = 'rgba(255, 255, 255, 0.4)';
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'rgba(255, 255, 255, 0.4)';
      if (e.dataTransfer.files.length > 0) handleFileImport(e.dataTransfer.files[0]);
    });

    // Save Imported Quiz
    const btnSaveImported = document.getElementById('btnSaveImportedQuiz');
    if (btnSaveImported) {
      btnSaveImported.addEventListener('click', () => {
        const title = document.getElementById('importQuizTitle').value.trim() || 'Bộ Câu Hỏi Mới';
        if (!state.importedQuestions || state.importedQuestions.length === 0) {
          return alert('Không tìm thấy danh sách câu hỏi để lưu!');
        }

        state.quizzes.push({
          id: 'quiz_' + Date.now(),
          title,
          questions: state.importedQuestions
        });

        saveQuizzes();
        renderQuizGrid();
        alert('Đã lưu bộ câu hỏi thành công!');
        const tabMyQuizzes = document.querySelector('[data-tab="tabMyQuizzes"]');
        if (tabMyQuizzes) tabMyQuizzes.click();
      });
    }

    // Save Editor Quiz
    const btnSaveEditorQuiz = document.getElementById('btnSaveEditorQuiz');
    if (btnSaveEditorQuiz) {
      btnSaveEditorQuiz.addEventListener('click', () => {
        const title = document.getElementById('editorQuizTitle').value.trim() || 'Bài Trắc Nghiệm Soạn Thảo';
        if (state.editorQuestions.length === 0) return alert('Vui lòng thêm ít nhất 1 câu hỏi!');

        if (state.editingQuizIndex !== undefined && state.editingQuizIndex !== null && state.quizzes[state.editingQuizIndex]) {
          state.quizzes[state.editingQuizIndex].title = title;
          state.quizzes[state.editingQuizIndex].questions = state.editorQuestions;
          state.editingQuizIndex = null;
          alert('Đã cập nhật bộ câu hỏi thành công!');
        } else {
          state.quizzes.push({
            id: 'quiz_' + Date.now(),
            title,
            questions: state.editorQuestions
          });
          alert('Đã lưu bộ câu hỏi soạn thảo thành công!');
        }

        saveQuizzes();
        renderQuizGrid();
        const tabMyQuizzes = document.querySelector('[data-tab="tabMyQuizzes"]');
        if (tabMyQuizzes) tabMyQuizzes.click();
      });
    }

    // Add Editor Question Button
    document.getElementById('btnAddEditorQuestion').addEventListener('click', () => {
      state.editorQuestions.push({
        questionText: `Câu hỏi số ${state.editorQuestions.length + 1}`,
        options: ['Lựa chọn A', 'Lựa chọn B', 'Lựa chọn C', 'Lựa chọn D'],
        correctIndex: 0,
        timeLimit: 20
      });
      renderEditorQuestions();
    });

    // Start Game from Lobby
    document.getElementById('btnStartGame').addEventListener('click', () => {
      if (socket && state.currentPin) {
        socket.emit('start-game', { pin: state.currentPin });
      }
    });

    // Host Next Step
    document.getElementById('btnHostNextStep').addEventListener('click', () => {
      if (socket && state.currentPin) {
        socket.emit('next-step', { pin: state.currentPin });
      }
    });

    document.getElementById('btnLbNext').addEventListener('click', () => {
      if (socket && state.currentPin) {
        socket.emit('next-step', { pin: state.currentPin });
      }
    });

    document.getElementById('btnPlayAgain').addEventListener('click', () => {
      showScreen('home');
    });

    // Student Avatar selection
    document.querySelectorAll('.avatar-opt').forEach((opt) => {
      opt.addEventListener('click', (e) => {
        document.querySelectorAll('.avatar-opt').forEach((o) => o.classList.remove('active'));
        e.currentTarget.classList.add('active');
        state.studentInfo.avatar = e.currentTarget.getAttribute('data-avatar');
      });
    });

    // Student Join Form
    document.getElementById('formStudentJoin').addEventListener('submit', (e) => {
      e.preventDefault();
      const pin = document.getElementById('inputPin').value.trim();
      const nickname = document.getElementById('inputNickname').value.trim();

      if (!pin || !nickname) return alert('Vui lòng nhập đủ Mã PIN và Tên biệt danh!');

      state.studentInfo.nickname = nickname;
      state.currentPin = pin;

      const btnJoin = document.getElementById('btnJoinGame');
      if (btnJoin) {
        btnJoin.disabled = true;
        if (!btnJoin.dataset.origText) btnJoin.dataset.origText = btnJoin.innerHTML;
        btnJoin.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang vào...';
      }

      if (socket) {
        socket.emit('join-room', {
          pin,
          nickname,
          avatar: state.studentInfo.avatar
        });
      }
    });

    // Student Answer Button Clicks
    document.querySelectorAll('.student-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const choice = parseInt(e.currentTarget.getAttribute('data-choice'), 10);
        if (socket && state.currentPin) {
          socket.emit('submit-answer', {
            pin: state.currentPin,
            choiceIndex: choice
          });
          showScreen('studentSubmitted');
        }
      });
    });

    // Sound toggle
    document.getElementById('btnSoundToggle').addEventListener('click', (e) => {
      soundEnabled = !soundEnabled;
      e.currentTarget.innerHTML = soundEnabled
        ? '<i class="fa-solid fa-volume-high"></i>'
        : '<i class="fa-solid fa-volume-xmark"></i>';
    });
  }

  // ==================== SOCKET.IO SERVER EVENT LISTENERS ====================

  function bindSocketEvents() {
    if (!socket) return;

    // Room Created (Teacher)
    socket.on('room-created', ({ pin, quiz, localIp, port, publicUrl }) => {
      state.currentPin = pin;
      showScreen('teacherLobby');
      document.getElementById('lobbyPinDisplay').innerText = pin;

      const hostUrl = publicUrl || `http://${localIp}:${port}`;
      document.getElementById('lobbyHostUrl').innerText = hostUrl;

      // Render QR code
      const qrBox = document.getElementById('lobbyQrCode');
      qrBox.innerHTML = '';
      if (typeof QRCode !== 'undefined') {
        new QRCode(qrBox, {
          text: `${hostUrl}/?pin=${pin}`,
          width: 160,
          height: 160
        });
      }
    });

    // Update Player List in Lobby (Teacher)
    socket.on('update-player-list', (players) => {
      document.getElementById('playerCount').innerText = players.length;
      const grid = document.getElementById('lobbyPlayerGrid');
      grid.innerHTML = '';

      players.forEach((p) => {
        const chip = document.createElement('div');
        chip.className = 'player-chip';
        chip.innerHTML = `
          <span>${p.avatar}</span>
          <span>${escapeHtml(p.nickname)}</span>
          <button class="btn-kick" data-id="${p.socketId}"><i class="fa-solid fa-xmark"></i></button>
        `;
        grid.appendChild(chip);
      });

      // Kick listener
      document.querySelectorAll('.btn-kick').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const sId = e.currentTarget.getAttribute('data-id');
          socket.emit('kick-player', { pin: state.currentPin, socketId: sId });
        });
      });
    });

    // Joined Successfully (Student)
    socket.on('joined-successfully', ({ pin, nickname, avatar }) => {
      const btnJoin = document.getElementById('btnJoinGame');
      if (btnJoin && btnJoin.dataset.origText) {
        btnJoin.disabled = false;
        btnJoin.innerHTML = btnJoin.dataset.origText;
      }
      document.getElementById('studentMyAvatar').innerText = avatar;
      document.getElementById('studentMyName').innerText = nickname;
      showScreen('studentWaiting');
    });

    socket.on('join-error', (msg) => {
      const btnJoin = document.getElementById('btnJoinGame');
      if (btnJoin && btnJoin.dataset.origText) {
        btnJoin.disabled = false;
        btnJoin.innerHTML = btnJoin.dataset.origText;
      }
      alert(`Lỗi: ${msg}`);
    });

    socket.on('kicked', () => {
      alert('Bạn đã bị giáo viên mời ra khỏi phòng học!');
      showScreen('home');
    });

    // Question Start (Teacher Host)
    socket.on('host-question-start', (qData) => {
      startKahootBgMusic();
      showScreen('teacherQuestion');
      document.getElementById('hostQIndex').innerText = qData.index + 1;
      document.getElementById('hostQTotal').innerText = qData.total;
      document.getElementById('hostTimerText').innerText = qData.timeLimit;
      document.getElementById('hostQuestionText').innerText = qData.questionText;
      document.getElementById('hostAnsweredCount').innerText = 0;

      document.getElementById('hostOpt0').innerText = qData.options[0];
      document.getElementById('hostOpt1').innerText = qData.options[1];
      document.getElementById('hostOpt2').innerText = qData.options[2];
      document.getElementById('hostOpt3').innerText = qData.options[3];

      const timerBar = document.getElementById('hostTimerBar');
      timerBar.style.transition = 'none';
      timerBar.style.width = '100%';
      setTimeout(() => {
        timerBar.style.transition = `width ${qData.timeLimit}s linear`;
        timerBar.style.width = '0%';
      }, 50);
    });

    // Answer count update on host screen
    socket.on('answer-count-update', ({ answeredCount, totalPlayers }) => {
      document.getElementById('hostAnsweredCount').innerText = answeredCount;
      document.getElementById('hostTotalPlayers').innerText = totalPlayers;
    });

    // Question Start (Student Player)
    socket.on('player-question-start', (qData) => {
      startKahootBgMusic();
      showScreen('studentPlay');
      document.getElementById('studentQNum').innerText = qData.index + 1;
      document.getElementById('studentTimer').innerText = `${qData.timeLimit}s`;
    });

    // Timer Tick
    socket.on('timer-tick', (timeLeft) => {
      playSoundTick();
      const hostTimerText = document.getElementById('hostTimerText');
      if (hostTimerText) hostTimerText.innerText = timeLeft;

      const studentTimer = document.getElementById('studentTimer');
      if (studentTimer) studentTimer.innerText = `${timeLeft}s`;
    });

    // Answer Received Ack (Student)
    socket.on('answer-received', ({ isCorrect, pointsGained, totalScore, streak }) => {
      state.studentInfo.score = totalScore;
      state.studentInfo.streak = streak;
    });

    // Question Reveal (Stats & Correct Answer)
    socket.on('question-reveal', ({ correctIndex, explanation, stats }) => {
      stopKahootBgMusic();
      playSoundFanfare();

      if (state.role === 'TEACHER') {
        showScreen('teacherReveal');
        const labels = ['A', 'B', 'C', 'D'];
        document.getElementById('correctAnswerLabel').innerText = `${labels[correctIndex]}`;

        // Handle Explanation Box Display - Guaranteed 100% Display
        const expBox = document.getElementById('explanationBox');
        const expText = document.getElementById('explanationText');
        if (expBox && expText) {
          if (explanation && explanation.trim().length > 0) {
            expText.innerText = explanation;
          } else {
            expText.innerText = `Đáp án chính xác là phương án ${labels[correctIndex]}. Hãy chú ý phân tích kỹ câu hỏi này để đạt điểm cao hơn nhé!`;
          }
          expBox.style.display = 'block';
        }

        const maxCount = Math.max(...stats, 1);
        stats.forEach((count, i) => {
          document.getElementById(`statCount${i}`).innerText = count;
          const pct = Math.round((count / maxCount) * 100);
          document.getElementById(`statBar${i}`).style.height = `${pct}%`;
        });
      } else if (state.role === 'STUDENT') {
        // Show result feedback to student
        showScreen('studentResult');
        const card = document.getElementById('studentResultCard');
        const icon = document.getElementById('studentResultIcon');
        const title = document.getElementById('studentResultTitle');
        const pts = document.getElementById('studentPointsGained');

        document.getElementById('studentTotalScore').innerText = state.studentInfo.score;
        document.getElementById('studentStreak').innerText = `🔥 ${state.studentInfo.streak}`;

        if (card.classList.contains('correct-bg')) card.classList.remove('correct-bg');
        if (card.classList.contains('wrong-bg')) card.classList.remove('wrong-bg');

        if (state.studentInfo.streak > 0) {
          card.classList.add('correct-bg');
          icon.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
          title.innerText = 'ĐÚNG RỒI! 🎉';
          pts.innerText = `+${state.studentInfo.score} điểm!`;
          playSoundCorrect();
        } else {
          card.classList.add('wrong-bg');
          icon.innerHTML = '<i class="fa-solid fa-circle-xmark"></i>';
          title.innerText = 'RẤT TIẾC, CHƯA ĐÚNG!';
          pts.innerText = '+0 điểm';
          playSoundWrong();
        }
      }
    });

    // Show Leaderboard (Teacher)
    socket.on('show-leaderboard', ({ leaderboard }) => {
      stopKahootBgMusic();
      if (state.role === 'TEACHER') {
        showScreen('teacherLeaderboard');
        const list = document.getElementById('lbList');
        list.innerHTML = '';

        leaderboard.slice(0, 5).forEach((item, idx) => {
          const row = document.createElement('div');
          row.className = 'lb-item';
          row.innerHTML = `
            <div class="lb-left">
              <div class="lb-rank rank-${idx + 1}">${idx + 1}</div>
              <div>${item.avatar} ${escapeHtml(item.nickname)}</div>
            </div>
            <div class="lb-score">${item.score} đ</div>
          `;
          list.appendChild(row);
        });
      }
    });

    // Game Over & Victory Podium
    socket.on('game-over', ({ leaderboard }) => {
      showScreen('podium');
      playSoundFanfare();

      if (typeof confetti !== 'undefined') {
        confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
      }

      const p1 = leaderboard[0];
      const p2 = leaderboard[1];
      const p3 = leaderboard[2];

      if (p1) {
        document.getElementById('podium1').style.display = 'flex';
        document.getElementById('p1Avatar').innerText = p1.avatar;
        document.getElementById('p1Name').innerText = p1.nickname;
        document.getElementById('p1Score').innerText = `${p1.score} đ`;
      }

      if (p2) {
        document.getElementById('podium2').style.display = 'flex';
      document.getElementById('p2Avatar').innerText = p2.avatar;
        document.getElementById('p2Name').innerText = p2.nickname;
        document.getElementById('p2Score').innerText = `${p2.score} đ`;
      }

      if (p3) {
        document.getElementById('podium3').style.display = 'flex';
        document.getElementById('p3Avatar').innerText = p3.avatar;
        document.getElementById('p3Name').innerText = p3.nickname;
        document.getElementById('p3Score').innerText = `${p3.score} đ`;
      }
    });

    socket.on('room-closed', (msg) => {
      alert(msg);
      showScreen('home');
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Check URL parameters for direct PIN join link
  function checkUrlPin() {
    const params = new URLSearchParams(window.location.search);
    const pin = params.get('pin');
    if (pin) {
      state.role = 'STUDENT';
      showScreen('studentJoin');
      document.getElementById('inputPin').value = pin;
    }
  }

  // ==================== GOOGLE SHEETS & OAUTH LICENSE MANAGEMENT ====================
  let GOOGLE_SHEET_API_URL = 'https://script.google.com/macros/s/AKfycbyaJgi_twiKpeY_TtvVQ4RX9iTRRXjDD2pPwxVsBTjuJrOg0cUYKZNRPMDBEI2UKzgOOw/exec';
  let GOOGLE_CLIENT_ID = '817345480416-riq2vgigkj27nnqs8uqrofot0oe4t5pp.apps.googleusercontent.com';

  const licenseState = {
    isVip: false,
    key: '',
    email: '',
    customerName: '',
    plan: '',
    expiresAt: '',
    remainingDays: 0
  };

  function parseJwt(token) {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(jsonPayload);
    } catch (e) {
      return null;
    }
  }

  // Handle Official Google OAuth Callback
  window.handleGoogleSignInResponse = async function(response) {
    if (!response || !response.credential) return;
    const payload = parseJwt(response.credential);
    if (!payload || !payload.email) {
      return alert('Không thể đọc thông tin từ tài khoản Google!');
    }
    await checkAndVerifyGoogleTeacher(payload.email, payload.name || 'Giáo Viên Google');
  };

  function renderGoogleSignInButton() {
    const container = document.getElementById('googleSignInBtnContainer');
    if (!container) return;

    if (window.google && window.google.accounts && window.google.accounts.id) {
      container.innerHTML = '';
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: window.handleGoogleSignInResponse
      });
      window.google.accounts.id.renderButton(container, {
        theme: 'filled_blue',
        size: 'large',
        shape: 'pill',
        text: 'signin_with'
      });
    } else {
      setTimeout(renderGoogleSignInButton, 300);
    }
  }

  async function checkAndVerifyGoogleTeacher(email, name = 'Giáo Viên Google') {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return alert('Vui lòng cung cấp email Google!');

    if (!GOOGLE_SHEET_API_URL || GOOGLE_SHEET_API_URL.includes('YOUR_GOOGLE_APPS_SCRIPT')) {
      return alert('Chưa dán URL Google Apps Script Web App trong code!\n\nVui lòng làm theo hướng dẫn trong file GOOGLE_APPS_SCRIPT.gs để tạo Web App URL.');
    }

    try {
      const url = `${GOOGLE_SHEET_API_URL}?action=google_auth&email=${encodeURIComponent(cleanEmail)}&name=${encodeURIComponent(name)}`;
      const resp = await fetch(url);
      const data = await resp.json();

      if (data && data.success) {
        if (data.active) {
          licenseState.isVip = true;
          licenseState.email = cleanEmail;
          licenseState.customerName = data.name || name || 'Giáo Viên VIP';
          licenseState.plan = 'Đã Kích Hoạt (Cột Active "x")';
          licenseState.expiresAt = 'Vĩnh viễn';
          licenseState.remainingDays = 9999;

          localStorage.setItem('qm_teacher_email', cleanEmail);
          localStorage.setItem('qm_teacher_name', licenseState.customerName);
          updateLicenseUI();

          alert('Tài khoản đã được kích hoạt. Chúc thầy cô giảng dạy thành công với công cụ này nhé!');
        } else {
          licenseState.isVip = false;
          updateLicenseUI();
          alert('Tài khoản chưa được kích hoạt, liên hệ admin để kích hoạt!');
        }
      } else {
        alert(`Không thể xác thực: ${data.message || 'Lỗi không xác định'}`);
      }
    } catch (err) {
      console.error('Lỗi kiểm tra Google Sheet:', err);
      alert('Không thể kết nối tới API Google Sheet. Vui lòng kiểm tra lại kết nối hoặc URL Web App!');
    }
  }

  async function verifyLicenseKeyWithGoogleSheets(keyToVerify) {
    if (!keyToVerify) return { success: false, message: 'Vui lòng nhập Mã Bản Quyền!' };

    // Demo keys for immediate testing
    if (keyToVerify.toUpperCase() === 'VIP-PRO-2026' || keyToVerify.toUpperCase() === 'DEMO-1234') {
      return {
        success: true,
        valid: true,
        customerName: 'Giáo Viên VIP (Demo)',
        plan: 'Gói VIP Vĩnh Viễn',
        expiresAt: 'Vĩnh viễn',
        remainingDays: 9999,
        message: 'Kích hoạt Mã Bản Quyền Demo thành công!'
      };
    }

    if (!GOOGLE_SHEET_API_URL || GOOGLE_SHEET_API_URL.includes('YOUR_GOOGLE_APPS_SCRIPT')) {
      return {
        success: false,
        message: 'Chưa dán URL Google Sheets Web App!'
      };
    }

    try {
      const resp = await fetch(`${GOOGLE_SHEET_API_URL}?action=verify&key=${encodeURIComponent(keyToVerify)}`);
      const data = await resp.json();
      return data;
    } catch (err) {
      console.warn('Lỗi kết nối Google Sheets License API:', err);
      return { success: false, message: 'Không thể kết nối đến hệ thống xác thực Google Sheets.' };
    }
  }

  function updateLicenseUI() {
    const btnOpenModal = document.getElementById('btnOpenLicenseModal');
    const lblStatus = document.getElementById('lblLicenseStatus');
    const infoBox = document.getElementById('licenseInfoBox');
    const inputArea = document.getElementById('licenseInputArea');

    if (licenseState.isVip) {
      if (btnOpenModal) btnOpenModal.classList.add('is-active');
      if (lblStatus) lblStatus.innerHTML = `👑 VIP PRO (${licenseState.customerName})`;

      if (infoBox) {
        infoBox.style.display = 'block';
        const licNameElem = document.getElementById('licCustomerName');
        const licEmailElem = document.getElementById('licEmail');
        const licPlanElem = document.getElementById('licPlanName');

        if (licNameElem) licNameElem.innerText = licenseState.customerName;
        if (licEmailElem) licEmailElem.innerText = licenseState.email || 'Chưa cung cấp';
        if (licPlanElem) licPlanElem.innerText = licenseState.plan;
      }
      if (inputArea) inputArea.style.display = 'none';
    } else {
      if (btnOpenModal) btnOpenModal.classList.remove('is-active');
      if (lblStatus) lblStatus.innerText = 'Kích Hoạt VIP';

      if (infoBox) infoBox.style.display = 'none';
      if (inputArea) inputArea.style.display = 'block';
      renderGoogleSignInButton();
    }
  }

  async function initLicenseSystem() {
    // Check saved email or license key
    const savedEmail = localStorage.getItem('qm_teacher_email');
    const savedName = localStorage.getItem('qm_teacher_name') || 'Giáo Viên Google';
    const savedKey = localStorage.getItem('qm_license_key');

    if (savedEmail && GOOGLE_SHEET_API_URL && !GOOGLE_SHEET_API_URL.includes('YOUR_GOOGLE_APPS_SCRIPT')) {
      await checkAndVerifyGoogleTeacher(savedEmail, savedName);
    } else if (savedKey) {
      const res = await verifyLicenseKeyWithGoogleSheets(savedKey);
      if (res && res.valid) {
        licenseState.isVip = true;
        licenseState.key = savedKey;
        licenseState.customerName = res.customerName || 'Giáo Viên VIP';
        licenseState.plan = res.plan || 'VIP Pro';
        licenseState.expiresAt = res.expiresAt || 'Vĩnh viễn';
        licenseState.remainingDays = res.remainingDays || 9999;
      } else {
        localStorage.removeItem('qm_license_key');
      }
    }
    updateLicenseUI();
  }

  function bindGoogleAuthEvents() {
    const btnSaveClientId = document.getElementById('btnSaveGoogleClientId');
    if (btnSaveClientId) {
      btnSaveClientId.addEventListener('click', () => {
        const val = (document.getElementById('txtGoogleClientId').value || '').trim();
        if (!val) return alert('Vui lòng nhập Google Client ID!');
        GOOGLE_CLIENT_ID = val;
        localStorage.setItem('qm_google_client_id', val);
        renderGoogleSignInButton();
        alert('Đã lưu Google Client ID thành công! Nút đăng nhập Google chính thức đã sẵn sàng.');
      });
    }

    const btnDeactivate = document.getElementById('btnDeactivateKey');
    if (btnDeactivate) {
      btnDeactivate.addEventListener('click', () => {
        licenseState.isVip = false;
        licenseState.key = '';
        licenseState.email = '';
        localStorage.removeItem('qm_license_key');
        localStorage.removeItem('qm_teacher_email');
        localStorage.removeItem('qm_teacher_name');
        updateLicenseUI();
        alert('Đã đăng xuất tài khoản thành công!');
      });
    }
  }

  // App Initialization
  document.addEventListener('DOMContentLoaded', () => {
    loadQuizzes();
    bindEvents();
    bindGoogleAuthEvents();
    bindSocketEvents();
    checkUrlPin();
    initLicenseSystem();
  });
})();
