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
    // Cortas (3-5 letras)
    "SOL", "LUNA", "MAR", "CIELO", "COCHE", "CASA", "PERRO", "GATO", "PAZ", "AMOR",
    "VIDA", "TIEMPO", "JUEGO", "COLOR", "FLOR", "ARBOL", "RÍO", "MONTE", "NUBE",
    
    // Medias (6-9 letras)
    "ELEFANTE", "MARIPOSA", "CHOCOLATE", "COMPUTADORA", "TELÉFONO", "AVENTURA",
    "LIBERTAD", "SABIDURÍA", "MONTAÑA", "VOLCÁN", "OCÉANO", "GALAXIA", "FÚTBOL",
    "GUITARRA", "PINTURA", "BICICLETA", "MARTILLO", "PARAGUAS", "MALETA",
    
    // Largas (10-15 letras)
    "ESTRELLAS", "TELESCOPIO", "MICROSCOPIO", "ALGORITMO", "ROBÓTICA", "NATACIÓN",
    "BALONCESTO", "HAMBURGUESA", "ENSALADA", "EDUCACIÓN", "TECNOLOGÍA", "SORPRESA",
    
    // Muy largas (16+ letras)
    "CONSTELACIÓN", "ELECTRICIDAD", "FERROCARRIL", "INCREÍBLEMENTE", "MAGNÍFICAMENTE",
    "EXTRAORDINARIO", "FUNCIONALIDAD", "INTERNACIONAL", "DESARROLLADOR", "RECOMENDACIÓN"
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
    wordPoints: 0,
    turnStarting: true,
    roundActive: true
};

let players = new Map(); // socket.id -> { id, name, score, stealAttempts, canSteal }

// Función para normalizar letras
function normalizeLetter(ch) {
    const accentsMap = {
        'á':'a', 'é':'e', 'í':'i', 'ó':'o', 'ú':'u', 'ü':'u', 
        'Á':'A', 'É':'E', 'Í':'I', 'Ó':'O', 'Ú':'U', 'Ü':'U'
    };
    let normalized = ch;
    if(accentsMap[normalized]) normalized = accentsMap[normalized];
    return normalized.toUpperCase();
}

// Calcular puntos basado en la longitud de la palabra
function calculateWordPoints(word) {
    return word.length;
}

// Iniciar nueva ronda
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
    gameState.roundActive = true;
    gameState.turnStarting = true;
    
    // Resetear intentos de robo para todos los jugadores
    for (let [id, player] of players.entries()) {
        player.stealAttempts = 0;
        player.canSteal = true;
        players.set(id, player);
    }
    
    // Elegir siguiente jugador
    if (gameState.players.length > 0) {
        if (!gameState.currentTurn || !players.has(gameState.currentTurn)) {
            gameState.currentTurn = gameState.players[0].id;
        } else {
            const currentIndex = gameState.players.findIndex(p => p.id === gameState.currentTurn);
            const nextIndex = (currentIndex + 1) % gameState.players.length;
            gameState.currentTurn = gameState.players[nextIndex].id;
        }
    }
    
    // Emitir nuevo estado
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
        wordLength: gameState.currentWord.length
    });
    
    const currentPlayer = players.get(gameState.currentTurn);
    if (currentPlayer) {
        io.emit('turn-notification', `🎯 Turno de ${currentPlayer.name} - Palabra de ${gameState.currentWord.length} letras (${gameState.wordPoints} pts en juego)`);
    }
    
    io.emit('game-message', `🎲 ¡Nueva ronda! Palabra de ${gameState.currentWord.length} letras - ${gameState.wordPoints} puntos en juego. Turno de ${currentPlayer?.name}`);
}

// Procesar letra
function processLetter(socketId, letter) {
    if (!gameState.gameActive || !gameState.roundActive) return false;
    if (gameState.currentTurn !== socketId) return false;
    
    const normalizedLetter = normalizeLetter(letter);
    
    // Verificar si ya fue adivinada
    if (gameState.guessedLetters.includes(normalizedLetter)) {
        io.to(socketId).emit('game-message', `⚠️ La letra "${letter}" ya fue intentada.`);
        return false;
    }
    
    gameState.guessedLetters.push(normalizedLetter);
    
    // Verificar si la letra está en la palabra
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
        
        // Verificar derrota del turno (pasar turno)
        if (gameState.wrongCount >= gameState.maxErrors) {
            // La ronda no termina, solo cambia el turno
            gameState.turnStarting = true;
            
            // Pasar al siguiente jugador
            const currentIndex = gameState.players.findIndex(p => p.id === gameState.currentTurn);
            const nextIndex = (currentIndex + 1) % gameState.players.length;
            gameState.currentTurn = gameState.players[nextIndex].id;
            
            // Resetear contador de errores para el nuevo turno, pero mantener letras adivinadas
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
        
        // Actualizar después del error (sin cambiar turno aún)
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
    
    // Verificar victoria (adivinó toda la palabra)
    const isWin = !gameState.wordDisplay.includes('_');
    
    if (isWin) {
        gameState.gameActive = false;
        gameState.roundActive = false;
        gameState.winner = gameState.currentTurn;
        
        // Sumar puntos (tamaño de la palabra)
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
    
    // Acierto - sigue el mismo jugador
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

// Procesar intento de robo (adivinar palabra completa desde el chat)
function processSteal(socketId, guessedWord) {
    if (!gameState.gameActive || !gameState.roundActive) return { success: false, reason: "No hay ronda activa" };
    if (socketId === gameState.currentTurn) return { success: false, reason: "Es tu turno, no puedes robar" };
    
    const player = players.get(socketId);
    if (!player) return { success: false, reason: "Jugador no encontrado" };
    
    // Verificar intentos de robo
    if (player.stealAttempts >= 2) {
        return { success: false, reason: "Ya usaste tus 2 intentos de robo en esta ronda" };
    }
    
    // Normalizar la palabra adivinada
    const normalizedGuess = guessedWord.toUpperCase().trim();
    const normalizedWord = gameState.currentWord;
    
    if (normalizedGuess === normalizedWord) {
        // ¡Robo exitoso!
        gameState.gameActive = false;
        gameState.roundActive = false;
        gameState.winner = socketId;
        
        // Sumar puntos
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
        // Intento fallido
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

// Socket.io conexiones
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
            stealAttempts: 0,
            canSteal: true
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
    
    // Procesar letra
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
    
    // Procesar intento de robo desde el chat
    socket.on('steal-attempt', (guessedWord) => {
        if (!gameState.gameActive) {
            socket.emit('game-message', 'No hay una ronda activa para robar');
            return;
        }
        
        const result = processSteal(socket.id, guessedWord);
        if (!result.success) {
            socket.emit('game-message', `🔒 Intento de robo fallido: ${result.reason}`);
        }
    });
    
    // Chat normal
    socket.on('chat-message', (msg) => {
        const player = players.get(socket.id);
        if (player && msg.trim()) {
            // Detectar si alguien intenta adivinar la palabra completa
            const upperMsg = msg.trim().toUpperCase();
            const possibleWord = upperMsg.replace(/[¿?¡!]/g, '');
            
            // Si el mensaje tiene más de 3 letras y podría ser la palabra
            if (possibleWord.length >= 3 && gameState.gameActive && socket.id !== gameState.currentTurn) {
                // Es un intento de robo
                socket.emit('steal-attempt', possibleWord);
                io.emit('chat-message', {
                    player: player.name,
                    message: `[Intento de adivinar la palabra]`,
                    timestamp: new Date().toLocaleTimeString(),
                    isStealAttempt: true
                });
            } else {
                // Chat normal
                io.emit('chat-message', {
                    player: player.name,
                    message: msg.substring(0, 100),
                    timestamp: new Date().toLocaleTimeString(),
                    isStealAttempt: false
                });
            }
        }
    });
    
    // Desconexión
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
                gameState.waitingForNext = false;
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
});