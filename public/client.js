let socket;
let currentPlayerName = '';
let gameActive = false;

function connectToGame() {
    const nameInput = document.getElementById('playerName');
    const name = nameInput.value.trim();
    
    if (!name) {
        alert('Por favor ingresa tu nombre');
        return;
    }
    
    currentPlayerName = name;
    
    // Conectar al servidor
    const socket = io();
    
    socket.on('connect', () => {
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
        document.getElementById('currentTurn').innerHTML = `🎲 ${msg}`;
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
    // Actualizar display de palabra
    const wordDisplay = data.wordDisplay.join(' ');
    document.getElementById('wordDisplay').innerHTML = wordDisplay;
    
    // Actualizar errores
    document.getElementById('errorCount').innerText = data.wrongCount;
    document.getElementById('maxErrors').innerText = data.maxErrors;
    
    // Actualizar teclado
    updateKeyboard(data.guessedLetters, data.gameActive, data.currentTurn === socket.id);
    
    // Actualizar turno actual
    const currentPlayer = data.players.find(p => p.id === data.currentTurn);
    if (currentPlayer) {
        if (data.currentTurn === socket.id && data.gameActive) {
            document.getElementById('currentTurn').innerHTML = `🎯 ¡ES TU TURNO! Adivina una letra`;
            document.getElementById('currentTurn').style.background = '#d4edda';
        } else {
            document.getElementById('currentTurn').innerHTML = `🎲 Turno de: ${currentPlayer.name}`;
            document.getElementById('currentTurn').style.background = '#f0f0f0';
        }
    }
    
    // Actualizar lista de jugadores
    updatePlayersList(data.players);
    
    // Dibujar ahorcado
    drawHangman(data.wrongCount);
    
    if (!data.gameActive && data.wordRevealed) {
        addGameMessage(`📖 Palabra revelada: ${data.wordRevealed}`);
    }
    
    if (data.winner && data.winner === socket.id) {
        addGameMessage(`🏆 ¡Ganaste la ronda! +1 punto 🏆`);
    }
}

function updateKeyboard(guessedLetters, gameActive, isMyTurn) {
    const keyboard = document.getElementById('keyboardContainer');
    keyboard.innerHTML = '';
    
    const alphabet = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'.split('');
    
    alphabet.forEach(letter => {
        const btn = document.createElement('button');
        btn.textContent = letter;
        btn.className = 'key-btn';
        
        const isGuessed = guessedLetters.includes(letter);
        
        if (isGuessed || !gameActive || !isMyTurn) {
            btn.disabled = true;
        }
        
        btn.onclick = () => {
            if (gameActive && isMyTurn && !isGuessed) {
                socket.emit('guess-letter', letter);
                btn.disabled = true;
            }
        };
        
        keyboard.appendChild(btn);
    });
}

function updatePlayersList(players) {
    const container = document.getElementById('playersList');
    container.innerHTML = '';
    
    players.forEach(player => {
        const playerCard = document.createElement('div');
        playerCard.className = 'player-card';
        if (player.id === socket.id) {
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
    const ctx = canvas.getContext('2d');
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#333";
    
    // Base
    ctx.beginPath();
    ctx.moveTo(50, 320);
    ctx.lineTo(300, 320);
    ctx.stroke();
    
    // Poste vertical
    ctx.beginPath();
    ctx.moveTo(100, 320);
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
}

function addGameMessage(msg) {
    const messagesDiv = document.getElementById('messagesList');
    const messageEl = document.createElement('div');
    messageEl.className = 'message-item';
    messageEl.innerHTML = `📢 ${msg}`;
    messagesDiv.appendChild(messageEl);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    
    // Limitar mensajes
    while (messagesDiv.children.length > 50) {
        messagesDiv.removeChild(messagesDiv.firstChild);
    }
}

function addChatMessage(data) {
    const messagesDiv = document.getElementById('messagesList');
    const messageEl = document.createElement('div');
    messageEl.className = 'message-item';
    messageEl.innerHTML = `💬 <strong>${data.player}:</strong> ${data.message}`;
    messagesDiv.appendChild(messageEl);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const msg = input.value.trim();
    if (msg) {
        socket.emit('chat-message', msg);
        input.value = '';
    }
}