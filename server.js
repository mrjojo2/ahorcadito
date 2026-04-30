const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname, 'public')));

// BANCO DE PALABRAS - Variadas (cortas, largas, muy largas)
const WORDS = [
    "SOL", "LUNA", "MAR", "CIELO", "COCHE", "CASA", "PERRO", "GATO", "PAZ", "AMOR",
    "VIDA", "TIEMPO", "JUEGO", "COLOR", "FLOR", "ARBOL", "RIO", "MONTE", "NUBE",
    "ELEFANTE", "MARIPOSA", "CHOCOLATE", "COMPUTADORA", "TELEFONO", "AVENTURA",
    "LIBERTAD", "SABIDURIA", "MONTAÑA", "VOLCAN", "OCEANO", "GALAXIA", "FUTBOL",
    "GUITARRA", "PINTURA", "BICICLETA", "MARTILLO", "PARAGUAS", "MALETA",
    "ESTRELLAS", "TELESCOPIO", "MICROSCOPIO", "ALGORITMO", "ROBOTICA", "NATACION",
    "BALONCESTO", "HAMBURGUESA", "ENSALADA", "EDUCACION", "TECNOLOGIA", "SORPRESA",
    "CONSTELACION", "ELECTRICIDAD", "FERROCARRIL", "INCREIBLEMENTE", "MAGNIFICAMENTE",
    "EXTRAORDINARIO", "FUNCIONALIDAD", "INTERNACIONAL", "DESARROLLADOR", "RECOMENDACION"
];

let gameState = {
    currentWord: "",
    wordDisplay: [],
    guessedLetters: [],
    wrongCount: 0,
    maxErrors: 7,
    gameActive: false,
    currentTurn: null,
    players: [],
    waitingForNext: false,
    winner: null,
    lastWord: "",
    wordPoints: 0
};

let players = new Map();

function normalizeLetter(ch) {
    const accentsMap = {
        'á':'a', 'é':'e', 'í':'i', 'ó':'o', 'ú':'u', 'ü':'u', 
        'Á':'A', 'É':'E', 'Í':'I', 'Ó':'O', 'Ú':'U', 'Ü':'U'
    };
    let normalized = ch;
    if(accentsMap[normalized]) normalized = accentsMap[normalized];
    return normalized.toUpperCase();
}

function calculateWordPoints(word) {
    return word.length;
}

function startNewRound() {
    let availableWords = WORDS.filter(w => w !== gameState.lastWord);
    if (availableWords.length === 0) availableWords = [...WORDS];
    
    const randomIndex = Math.floor(Math.random() * availableWords.length);
    gameState.currentWord = availableWords[randomIndex].toUpperCase();
    gameState.lastWord = gameState.currentWord;
    gameState.wordPoints = calculateWordPoints(gameState.currentWord);
    
    gameState.wordDisplay = gameState.currentWord.split('').map(() => '_');
    gameState.guessedLetters = [];
    gameState.wrongCount = 0;
    gameState.gameActive = true;
    gameState.waitingForNext = false;
    gameState.winner = null;
    
    for (let [id, player] of players.entries()) {
        player.stealAttempts = 0;
        players.set(id, player);
    }
    
    if (gameState.players.length > 0) {
        if (!gameState.currentTurn || !players.has(gameState.currentTurn)) {
            gameState.currentTurn = gameState.players[0].id;
        } else {
            const currentIndex = gameState.players.findIndex(p => p.id === gameState.currentTurn);
            const nextIndex = (currentIndex + 1) % gameState.players.length;
            gameState.currentTurn = gameState.players[nextIndex].id;
        }
    }
    
    io.emit('game-update', {
        wordDisplay: gameState.wordDisplay,
        guessedLetters: gameState.guessedLetters,
        wrongCount: gameState.wrongCount,
        maxErrors: gameState.maxErrors,
        gameActive: gameState.gameActive,
        currentTurn: gameState.currentTurn,
        players: Array.from(players.values()),
        winner: null,
        wordPoints: gameState.wordPoints,
        wordLength: gameState.currentWord.length,
        newRound: true
    });
    
    const currentPlayer = players.get(gameState.currentTurn);
    if (currentPlayer) {
        io.emit('turn-notification', `🎯 Turno de ${currentPlayer.name} - Palabra de ${gameState.currentWord.length} letras (${gameState.wordPoints} pts en juego)`);
    }
    
    io.emit('game-message', `🎲 ¡Nueva ronda! Palabra de ${gameState.currentWord.length} letras - ${gameState.wordPoints} puntos en juego. Turno de ${currentPlayer?.name}`);
}

function processLetter(socketId, letter) {
    if (!gameState.gameActive) return false;
    if (gameState.currentTurn !== socketId) return false;
    
    const normalizedLetter = normalizeLetter(letter);
    
    if (gameState.guessedLetters.includes(normalizedLetter)) {
        io.to(socketId).emit('game-message', `⚠️ La letra "${letter}" ya fue intentada.`);
        return false;
    }
    
    gameState.guessedLetters.push(normalizedLetter);
    
    let letterFound = false;
    const wordNormalized = gameState.currentWord.split('').map(c => normalizeLetter(c));
    
    for (let i = 0; i < wordNormalized.length; i++) {
        if (wordNormalized[i] === normalizedLetter) {
            gameState.wordDisplay[i] = gameState.currentWord[i];
            letterFound = true;
        }
    }
    
    if (!letterFound) {
        gameState.wrongCount++;
        
        if (gameState.wrongCount >= gameState.maxErrors) {
            const currentIndex = gameState.players.findIndex(p => p.id === gameState.currentTurn);
            const nextIndex = (currentIndex + 1) % gameState.players.length;
            gameState.currentTurn = gameState.players[nextIndex].id;
            gameState.wrongCount = 0;
            
            const newPlayer = players.get(gameState.currentTurn);
            io.emit('game-message', `❌ ${players.get(socketId)?.name} falló! La horca suma un error. Ahora juega ${newPlayer?.name}`);
            io.emit('turn-notification', `🔄 Turno transferido a ${newPlayer?.name} - Palabra de ${gameState.wordPoints} pts`);
            
            io.emit('game-update', {
                wordDisplay: gameState.wordDisplay,
                guessedLetters: gameState.guessedLetters,
                wrongCount: gameState.wrongCount,
                maxErrors: gameState.maxErrors,
                gameActive: gameState.gameActive,
                currentTurn: gameState.currentTurn,
                players: Array.from(players.values()),
                winner: null,
                wordPoints: gameState.wordPoints,
                wordLength: gameState.currentWord.length,
                letterFailed: true
            });
            return false;
        }
        
        io.emit('game-update', {
            wordDisplay: gameState.wordDisplay,
            guessedLetters: gameState.guessedLetters,
            wrongCount: gameState.wrongCount,
            maxErrors: gameState.maxErrors,
            gameActive: gameState.gameActive,
            currentTurn: gameState.currentTurn,
            players: Array.from(players.values()),
            winner: null,
            wordPoints: gameState.wordPoints,
            wordLength: gameState.currentWord.length,
            letterFailed: true
        });
        
        io.emit('game-message', `❌ ${players.get(socketId)?.name} falló la letra "${letter}". Error ${gameState.wrongCount}/${gameState.maxErrors}`);
        return false;
    }
    
    const isWin = !gameState.wordDisplay.includes('_');
    
    if (isWin) {
        gameState.gameActive = false;
        gameState.winner = gameState.currentTurn;
        
        const winner = players.get(gameState.currentTurn);
        if (winner) {
            winner.score = (winner.score || 0) + gameState.wordPoints;
            players.set(gameState.currentTurn, winner);
        }
        
        io.emit('game-update', {
            wordDisplay: gameState.wordDisplay,
            guessedLetters: gameState.guessedLetters,
            wrongCount: gameState.wrongCount,
            maxErrors: gameState.maxErrors,
            gameActive: false,
            currentTurn: gameState.currentTurn,
            players: Array.from(players.values()),
            winner: gameState.currentTurn,
            wordRevealed: gameState.currentWord,
            wordPoints: gameState.wordPoints,
            wordLength: gameState.currentWord.length
        });
        
        io.emit('game-message', `🎉 ¡${winner?.name} ADIVINÓ LA PALABRA! +${gameState.wordPoints} puntos 🎉`);
        
        setTimeout(() => {
            startNewRound();
        }, 4000);
        return true;
    }
    
    io.emit('game-update', {
        wordDisplay: gameState.wordDisplay,
        guessedLetters: gameState.guessedLetters,
        wrongCount: gameState.wrongCount,
        maxErrors: gameState.maxErrors,
        gameActive: gameState.gameActive,
        currentTurn: gameState.currentTurn,
        players: Array.from(players.values()),
        winner: null,
        wordPoints: gameState.wordPoints,
        wordLength: gameState.currentWord.length,
        letterSuccess: true
    });
    
    io.emit('game-message', `✅ ${players.get(socketId)?.name} acertó la letra "${letter}". Sigue jugando!`);
    return true;
}

function processSteal(socketId, guessedWord) {
    if (!gameState.gameActive) return { success: false, reason: "No hay ronda activa" };
    if (socketId === gameState.currentTurn) return { success: false, reason: "Es tu turno, no puedes robar" };
    
    const player = players.get(socketId);
    if (!player) return { success: false, reason: "Jugador no encontrado" };
    
    if (player.stealAttempts >= 2) {
        return { success: false, reason: "Ya usaste tus 2 intentos de robo en esta ronda" };
    }
    
    const normalizedGuess = guessedWord.toUpperCase().trim();
    const normalizedWord = gameState.currentWord;
    
    if (normalizedGuess === normalizedWord) {
        gameState.gameActive = false;
        gameState.winner = socketId;
        
        player.score = (player.score || 0) + gameState.wordPoints;
        player.stealAttempts++;
        players.set(socketId, player);
        
        io.emit('game-update', {
            wordDisplay: gameState.wordDisplay,
            guessedLetters: gameState.guessedLetters,
            wrongCount: gameState.wrongCount,
            maxErrors: gameState.maxErrors,
            gameActive: false,
            currentTurn: gameState.currentTurn,
            players: Array.from(players.values()),
            winner: socketId,
            wordRevealed: gameState.currentWord,
            wordPoints: gameState.wordPoints,
            wordLength: gameState.currentWord.length
        });
        
        io.emit('game-message', `🔫 ¡ROBO ESPECTACULAR! ${player.name} adivinó la palabra "${gameState.currentWord}" y ganó ${gameState.wordPoints} puntos!`);
        
        setTimeout(() => {
            startNewRound();
        }, 4000);
        
        return { success: true, message: `¡Robaste la palabra! +${gameState.wordPoints} puntos` };
    } else {
        player.stealAttempts++;
        players.set(socketId, player);
        
        let message = "";
        if (player.stealAttempts >= 2) {
            message = `❌ ${player.name} falló su 2do intento de robo. Queda bloqueado hasta la próxima ronda.`;
        } else {
            message = `❌ ${player.name} intentó robar con "${guessedWord}" pero no era correcta. Le queda ${2 - player.stealAttempts} intento(s).`;
        }
        
        io.emit('game-message', message);
        
        return { success: false, reason: "Palabra incorrecta", attemptsLeft: 2 - player.stealAttempts };
    }
}

io.on('connection', (socket) => {
    console.log(`Usuario conectado: ${socket.id}`);
    
    if (players.size >= 10) {
        socket.emit('game-full', 'El juego está lleno (máximo 10 jugadores)');
        socket.disconnect();
        return;
    }
    
    socket.emit('request-name');
    
    socket.on('player-name', (name) => {
        if (players.has(socket.id)) return;
        
        const newPlayer = {
            id: socket.id,
            name: name.substring(0, 20),
            score: 0,
            stealAttempts: 0
        };
        
        players.set(socket.id, newPlayer);
        gameState.players = Array.from(players.values());
        
        io.emit('player-joined', {
            players: gameState.players,
            newPlayer: name
        });
        
        io.emit('game-message', `✨ ${name} se unió al juego! (${players.size}/10 jugadores)`);
        
        if (players.size === 1 && !gameState.gameActive) {
            startNewRound();
        } else if (gameState.gameActive) {
            socket.emit('game-update', {
                wordDisplay: gameState.wordDisplay,
                guessedLetters: gameState.guessedLetters,
                wrongCount: gameState.wrongCount,
                maxErrors: gameState.maxErrors,
                gameActive: gameState.gameActive,
                currentTurn: gameState.currentTurn,
                players: gameState.players,
                winner: null,
                wordPoints: gameState.wordPoints,
                wordLength: gameState.currentWord.length
            });
        }
    });
    
    socket.on('guess-letter', (letter) => {
        if (!gameState.gameActive) {
            socket.emit('game-message', 'Esperando que comience la siguiente ronda...');
            return;
        }
        
        if (gameState.currentTurn !== socket.id) {
            socket.emit('game-message', 'No es tu turno! Espera tu turno para adivinar.');
            return;
        }
        
        if (gameState.guessedLetters.includes(normalizeLetter(letter))) {
            socket.emit('game-message', `La letra "${letter}" ya fue intentada.`);
            return;
        }
        
        processLetter(socket.id, letter);
    });
    
    socket.on('steal-attempt', (guessedWord) => {
        if (!gameState.gameActive) {
            socket.emit('steal-result', {
                success: false,
                attemptsLeft: players.get(socket.id)?.stealAttempts || 0,
                message: "No hay una ronda activa para robar"
            });
            return;
        }
        
        const result = processSteal(socket.id, guessedWord);
        socket.emit('steal-result', {
            success: result.success,
            attemptsLeft: 2 - (players.get(socket.id)?.stealAttempts || 0),
            message: result.message || result.reason
        });
    });
    
    socket.on('chat-message', (msg) => {
        const player = players.get(socket.id);
        if (player && msg.trim()) {
            io.emit('chat-message', {
                player: player.name,
                message: msg.substring(0, 100),
                timestamp: new Date().toLocaleTimeString()
            });
        }
    });
    
    socket.on('disconnect', () => {
        const player = players.get(socket.id);
        if (player) {
            players.delete(socket.id);
            gameState.players = Array.from(players.values());
            
            io.emit('player-left', {
                players: gameState.players,
                playerName: player.name
            });
            
            io.emit('game-message', `👋 ${player.name} abandonó el juego. (${players.size}/10 jugadores)`);
            
            if (players.size === 0) {
                gameState.gameActive = false;
                gameState.currentTurn = null;
            } else if (gameState.currentTurn === socket.id && gameState.gameActive) {
                if (gameState.players.length > 0) {
                    gameState.currentTurn = gameState.players[0].id;
                    io.emit('turn-notification', `🔄 Turno transferido a ${gameState.players[0].name}`);
                    io.emit('game-update', {
                        wordDisplay: gameState.wordDisplay,
                        guessedLetters: gameState.guessedLetters,
                        wrongCount: gameState.wrongCount,
                        maxErrors: gameState.maxErrors,
                        gameActive: gameState.gameActive,
                        currentTurn: gameState.currentTurn,
                        players: gameState.players,
                        winner: null,
                        wordPoints: gameState.wordPoints,
                        wordLength: gameState.currentWord.length
                    });
                }
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🎮 Servidor del Ahorcadito corriendo en http://localhost:${PORT}`);
    console.log(`🌐 En la red local, accede desde: http://<IP_DEL_SERVIDOR>:${PORT}`);
});