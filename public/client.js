let socket;
let currentPlayerName = '';
let gameActive = false;
let currentTurnId = null;
let myPlayerId = null;
let currentWordLength = 0;
let currentWordPoints = 0;
let myStealAttempts = 2;

function connectToGame() {
    const nameInput = document.getElementById('playerName');
    const name = nameInput.value.trim();
    
    if (!name) {
        alert('Por favor ingresa tu nombre');
        return;
    }
    
    currentPlayerName = name;
    
    socket = io();
    
    socket.on('connect', () => {
        myPlayerId = socket.id;
        socket.emit('player-name', currentPlayerName);
    });
    
    socket.on('game-full', (msg) => {
        alert(msg);
    });
    
    socket.on('request-name', () => {
        socket.emit('player-name', currentPlayerName);
    });
    
    socket.on('player-joined', (data) => {
        updatePlayersList(data.players);
        document.getElementById('playerCount').innerText = data.players.length;
    });
    
    socket.on('player-left', (data) => {
        updatePlayersList(data.players);
        document.getElementById('playerCount').innerText = data.players.length;
        addGameMessage(`⚠️ ${data.playerName} abandonó el juego`);
    });
    
    socket.on('game-update', (data) => {
        updateGame(data);
    });
    
    socket.on('turn-notification', (msg) => {
        const turnDiv = document.getElementById('currentTurn');
        if (turnDiv) {
            turnDiv.innerHTML = `🎲 ${msg}`;
        }
    });
    
    socket.on('game-message', (msg) => {
        addGameMessage(msg);
    });
    
    socket.on('chat-message', (data) => {
        addChatMessage(data);
    });
    
    socket.on('steal-result', (data) => {
        if (data.attemptsLeft !== undefined) {
            myStealAttempts = data.attemptsLeft;
            updateStealAttemptsDisplay();
        }
        if (data.message) {
            addGameMessage(data.message);
        }
    });
    
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('gameScreen').style.display = 'block';
    
    // Eventos separados
    document.getElementById('sendChat').onclick = sendChatMessage;
    document.getElementById('chatInput').onkeypress = (e) => {
        if (e.key === 'Enter') sendChatMessage();
    };
    
    document.getElementById('sendSteal').onclick = sendStealAttempt;
    document.getElementById('stealInput').onkeypress = (e) => {
        if (e.key === 'Enter') sendStealAttempt();
    };
    
    addGameMessage('💡 TIP: ¡Usa el área ROBA PALABRA para adivinar la palabra completa! 2 intentos por ronda.');
    addGameMessage('💬 El chat normal es solo para conversar con amigos.');
}

function updateGame(data) {
    gameActive = data.gameActive;
    currentTurnId = data.currentTurn;
    currentWordLength = data.wordLength || 0;
    currentWordPoints = data.wordPoints || 0;
    
    // Resetear intentos de robo si es nueva ronda
    if (data.newRound) {
        myStealAttempts = 2;
        updateStealAttemptsDisplay();
    }
    
    const wordDisplay = data.wordDisplay.join(' ');
    document.getElementById('wordDisplay').innerHTML = wordDisplay;
    
    const pointsDisplay = document.getElementById('pointsAtStake');
    if (pointsDisplay) {
        pointsDisplay.innerHTML = `💰 Puntos en juego: ${currentWordPoints}`;
    }
    
    document.getElementById('errorCount').innerText = data.wrongCount;
    document.getElementById('maxErrors').innerText = data.maxErrors;
    
    const guessedLetters = data.guessedLetters || [];
    const isMyTurn = (currentTurnId === myPlayerId && data.gameActive);
    updateKeyboard(guessedLetters, data.gameActive, isMyTurn);
    
    const currentPlayer = data.players.find(p => p.id === data.currentTurn);
    const turnDiv = document.getElementById('currentTurn');
    
    if (currentPlayer) {
        if (currentTurnId === myPlayerId && data.gameActive) {
            turnDiv.innerHTML = `🎯 ¡ES TU TURNO! Adivina una letra - Palabra de ${currentWordLength} letras (${currentWordPoints} pts)`;
            turnDiv.style.background = '#d4edda';
            turnDiv.style.color = '#155724';
            turnDiv.style.fontWeight = 'bold';
        } else if (data.gameActive) {
            turnDiv.innerHTML = `🎲 Turno de: ${currentPlayer.name} - ${currentWordLength} letras (${currentWordPoints} pts en juego)`;
            turnDiv.style.background = '#f8f9fa';
            turnDiv.style.color = '#667eea';
        } else {
            turnDiv.innerHTML = `⏳ Esperando nueva ronda...`;
            turnDiv.style.background = '#fff3cd';
            turnDiv.style.color = '#856404';
        }
    }
    
    updatePlayersList(data.players);
    drawHangman(data.wrongCount);
    
    if (!data.gameActive && data.wordRevealed) {
        addGameMessage(`📖 Palabra revelada: ${data.wordRevealed} (valía ${data.wordPoints} puntos)`);
        // Resetear intentos de robo para nueva ronda
        myStealAttempts = 2;
        updateStealAttemptsDisplay();
    }
    
    if (data.winner && data.winner === myPlayerId) {
        addGameMessage(`🏆 ¡ADIVINASTE LA PALABRA! +${data.wordPoints} puntos 🏆`);
    }
}

function updateStealAttemptsDisplay() {
    const infoDiv = document.getElementById('stealAttemptsInfo');
    if (infoDiv) {
        infoDiv.innerHTML = `🔫 Intentos de robo restantes: ${myStealAttempts}`;
        if (myStealAttempts === 0) {
            infoDiv.style.color = '#ff6666';
        } else {
            infoDiv.style.color = '#ffaa00';
        }
    }
}

function updateKeyboard(guessedLetters, gameActive, isMyTurn) {
    const keyboardDiv = document.getElementById('keyboardContainer');
    if (!keyboardDiv) return;
    
    keyboardDiv.innerHTML = '';
    
    const alphabet = ['A','B','C','D','E','F','G','H','I','J','K','L','M',
                      'N','Ñ','O','P','Q','R','S','T','U','V','W','X','Y','Z'];
    
    alphabet.forEach(letter => {
        const btn = document.createElement('button');
        btn.textContent = letter;
        btn.className = 'key-btn';
        
        const isGuessed = guessedLetters.includes(letter);
        
        if (isGuessed || !gameActive || !isMyTurn) {
            btn.disabled = true;
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
        } else {
            btn.style.cursor = 'pointer';
            btn.onclick = (e) => {
                e.preventDefault();
                if (gameActive && isMyTurn && !isGuessed) {
                    socket.emit('guess-letter', letter);
                    btn.disabled = true;
                    btn.style.opacity = '0.5';
                }
            };
        }
        
        keyboardDiv.appendChild(btn);
    });
}

function updatePlayersList(players) {
    const container = document.getElementById('playersList');
    if (!container) return;
    
    container.innerHTML = '';
    
    players.forEach(player => {
        const playerCard = document.createElement('div');
        playerCard.className = 'player-card';
        if (player.id === myPlayerId) {
            playerCard.classList.add('current');
        }
        playerCard.innerHTML = `${player.name} <span class="score">⭐ ${player.score || 0}</span>`;
        container.appendChild(playerCard);
    });
}

function drawHangman(errors) {
    const canvas = document.getElementById('hangmanCanvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#4a3320";
    ctx.fillStyle = "#3d2a18";
    ctx.lineCap = "round";
    
    ctx.beginPath();
    ctx.moveTo(50, height - 40);
    ctx.lineTo(width - 50, height - 40);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(100, height - 40);
    ctx.lineTo(100, 50);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(98, 50);
    ctx.lineTo(230, 50);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(210, 50);
    ctx.lineTo(210, 80);
    ctx.stroke();
    
    if (errors >= 1) {
        ctx.beginPath();
        ctx.arc(210, 110, 22, 0, 2 * Math.PI);
        ctx.stroke();
    }
    if (errors >= 2) {
        ctx.beginPath();
        ctx.moveTo(210, 132);
        ctx.lineTo(210, 200);
        ctx.stroke();
    }
    if (errors >= 3) {
        ctx.beginPath();
        ctx.moveTo(210, 150);
        ctx.lineTo(175, 180);
        ctx.stroke();
    }
    if (errors >= 4) {
        ctx.beginPath();
        ctx.moveTo(210, 150);
        ctx.lineTo(245, 180);
        ctx.stroke();
    }
    if (errors >= 5) {
        ctx.beginPath();
        ctx.moveTo(210, 200);
        ctx.lineTo(175, 245);
        ctx.stroke();
    }
    if (errors >= 6) {
        ctx.beginPath();
        ctx.moveTo(210, 200);
        ctx.lineTo(245, 245);
        ctx.stroke();
    }
    if (errors >= 7) {
        ctx.fillStyle = "#7a3e1a";
        ctx.font = "bold 18px monospace";
        ctx.fillText("X_X", 200, 115);
    }
}

function addGameMessage(msg) {
    const messagesDiv = document.getElementById('messagesList');
    if (!messagesDiv) return;
    
    const messageEl = document.createElement('div');
    messageEl.className = 'message-item';
    messageEl.innerHTML = `📢 ${msg}`;
    messagesDiv.appendChild(messageEl);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    
    while (messagesDiv.children.length > 50) {
        messagesDiv.removeChild(messagesDiv.firstChild);
    }
}

function addChatMessage(data) {
    const chatDiv = document.getElementById('chatMessagesList');
    if (!chatDiv) return;
    
    const messageEl = document.createElement('div');
    messageEl.className = 'chat-message-item';
    messageEl.innerHTML = `💬 <strong>${data.player}:</strong> ${data.message}`;
    chatDiv.appendChild(messageEl);
    chatDiv.scrollTop = chatDiv.scrollHeight;
    
    while (chatDiv.children.length > 100) {
        chatDiv.removeChild(chatDiv.firstChild);
    }
}

function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const msg = input.value.trim();
    if (msg && socket) {
        socket.emit('chat-message', msg);
        input.value = '';
    }
}

function sendStealAttempt() {
    const input = document.getElementById('stealInput');
    const guess = input.value.trim().toUpperCase();
    
    if (!guess) {
        addGameMessage('⚠️ Escribe una palabra para intentar robar');
        return;
    }
    
    if (myStealAttempts <= 0) {
        addGameMessage('❌ Ya no te quedan intentos de robo en esta ronda');
        return;
    }
    
    if (socket) {
        socket.emit('steal-attempt', guess);
        myStealAttempts--;
        updateStealAttemptsDisplay();
        input.value = '';
        
        if (myStealAttempts === 0) {
            addGameMessage('⚠️ Usaste tus 2 intentos de robo. Quedas bloqueado hasta la próxima ronda.');
        }
    }
}