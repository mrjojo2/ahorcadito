let socket;
let currentPlayerName = '';
let gameActive = false;
let currentTurnId = null;
let myPlayerId = null;

function connectToGame() {
    const nameInput = document.getElementById('playerName');
    const name = nameInput.value.trim();
    
    if (!name) {
        alert('Por favor ingresa tu nombre');
        return;
    }
    
    currentPlayerName = name;
    
    // Conectar al servidor
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
            turnDiv.style.background = '#f0f0f0';
        }
    });
    
    socket.on('game-message', (msg) => {
        addGameMessage(msg);
    });
    
    socket.on('chat-message', (data) => {
        addChatMessage(data);
    });
    
    // Ocultar login y mostrar juego
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('gameScreen').style.display = 'block';
    
    // Configurar chat
    document.getElementById('sendChat').onclick = sendChatMessage;
    document.getElementById('chatInput').onkeypress = (e) => {
        if (e.key === 'Enter') sendChatMessage();
    };
}

function updateGame(data) {
    gameActive = data.gameActive;
    currentTurnId = data.currentTurn;
    
    // Actualizar display de palabra
    const wordDisplay = data.wordDisplay.join(' ');
    document.getElementById('wordDisplay').innerHTML = wordDisplay;
    
    // Actualizar errores
    document.getElementById('errorCount').innerText = data.wrongCount;
    document.getElementById('maxErrors').innerText = data.maxErrors;
    
    // Actualizar teclado
    const guessedLetters = data.guessedLetters || [];
    const isMyTurn = (currentTurnId === myPlayerId && data.gameActive);
    updateKeyboard(guessedLetters, data.gameActive, isMyTurn);
    
    // Actualizar turno actual
    const currentPlayer = data.players.find(p => p.id === data.currentTurn);
    const turnDiv = document.getElementById('currentTurn');
    
    if (currentPlayer) {
        if (currentTurnId === myPlayerId && data.gameActive) {
            turnDiv.innerHTML = `🎯 ¡ES TU TURNO! Adivina una letra`;
            turnDiv.style.background = '#d4edda';
            turnDiv.style.color = '#155724';
            turnDiv.style.fontWeight = 'bold';
            turnDiv.style.fontSize = '18px';
        } else if (data.gameActive) {
            turnDiv.innerHTML = `🎲 Turno de: ${currentPlayer.name}`;
            turnDiv.style.background = '#f8f9fa';
            turnDiv.style.color = '#667eea';
            turnDiv.style.fontWeight = 'normal';
        } else {
            turnDiv.innerHTML = `⏳ Esperando nueva ronda...`;
            turnDiv.style.background = '#fff3cd';
            turnDiv.style.color = '#856404';
        }
    }
    
    // Actualizar lista de jugadores
    updatePlayersList(data.players);
    
    // Dibujar ahorcado
    drawHangman(data.wrongCount);
    
    if (!data.gameActive && data.wordRevealed) {
        addGameMessage(`📖 Palabra revelada: ${data.wordRevealed}`);
    }
    
    if (data.winner && data.winner === myPlayerId) {
        addGameMessage(`🏆 ¡Ganaste la ronda! +1 punto 🏆`);
    }
}

function updateKeyboard(guessedLetters, gameActive, isMyTurn) {
    const keyboardDiv = document.getElementById('keyboardContainer');
    if (!keyboardDiv) return;
    
    keyboardDiv.innerHTML = '';
    
    // Alfabeto completo incluyendo Ñ
    const alphabet = ['A','B','C','D','E','F','G','H','I','J','K','L','M',
                      'N','Ñ','O','P','Q','R','S','T','U','V','W','X','Y','Z'];
    
    alphabet.forEach(letter => {
        const btn = document.createElement('button');
        btn.textContent = letter;
        btn.className = 'key-btn';
        
        const isGuessed = guessedLetters.includes(letter);
        
        // Deshabilitar si ya fue usada, o el juego no está activo, o no es mi turno
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
        playerCard.innerHTML = `
            ${player.name} 
            <span class="score">⭐ ${player.score || 0}</span>
        `;
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
    
    // Base (suelo)
    ctx.beginPath();
    ctx.moveTo(50, height - 40);
    ctx.lineTo(width - 50, height - 40);
    ctx.stroke();
    
    // Poste vertical
    ctx.beginPath();
    ctx.moveTo(100, height - 40);
    ctx.lineTo(100, 50);
    ctx.stroke();
    
    // Viga superior
    ctx.beginPath();
    ctx.moveTo(98, 50);
    ctx.lineTo(230, 50);
    ctx.stroke();
    
    // Soga
    ctx.beginPath();
    ctx.moveTo(210, 50);
    ctx.lineTo(210, 80);
    ctx.stroke();
    
    // Dibujar según cantidad de errores
    if (errors >= 1) {
        // Cabeza
        ctx.beginPath();
        ctx.arc(210, 110, 22, 0, 2 * Math.PI);
        ctx.stroke();
    }
    if (errors >= 2) {
        // Torso
        ctx.beginPath();
        ctx.moveTo(210, 132);
        ctx.lineTo(210, 200);
        ctx.stroke();
    }
    if (errors >= 3) {
        // Brazo izquierdo
        ctx.beginPath();
        ctx.moveTo(210, 150);
        ctx.lineTo(175, 180);
        ctx.stroke();
    }
    if (errors >= 4) {
        // Brazo derecho
        ctx.beginPath();
        ctx.moveTo(210, 150);
        ctx.lineTo(245, 180);
        ctx.stroke();
    }
    if (errors >= 5) {
        // Pierna izquierda
        ctx.beginPath();
        ctx.moveTo(210, 200);
        ctx.lineTo(175, 245);
        ctx.stroke();
    }
    if (errors >= 6) {
        // Pierna derecha
        ctx.beginPath();
        ctx.moveTo(210, 200);
        ctx.lineTo(245, 245);
        ctx.stroke();
    }
    if (errors >= 7) {
        // Cara de ahorcado (opcional)
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
    
    // Limitar mensajes a 50
    while (messagesDiv.children.length > 50) {
        messagesDiv.removeChild(messagesDiv.firstChild);
    }
}

function addChatMessage(data) {
    const messagesDiv = document.getElementById('messagesList');
    if (!messagesDiv) return;
    
    const messageEl = document.createElement('div');
    messageEl.className = 'message-item';
    messageEl.innerHTML = `💬 <strong>${data.player}:</strong> ${data.message}`;
    messagesDiv.appendChild(messageEl);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const msg = input.value.trim();
    if (msg && socket) {
        socket.emit('chat-message', msg);
        input.value = '';
    }
}