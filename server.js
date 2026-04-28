const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// BANCO DE PALABRAS
const WORDS = [
    "ELEFANTE", "JIRAFA", "CANGREJO", "MARIPOSA", "GOLONDRINA", "DELFIN", "CABALLO", 
    "TORTUGA", "HORMIGA", "CONEJO", "MANZANA", "SANDIA", "FRESA", "NARANJA", "PERA", 
    "UVAS", "LIMON", "BROCOLI", "ZANAHORIA", "PEPINO", "TELEFONO", "COMPUTADORA", 
    "LINTERNA", "MALETA", "PARAGUAS", "ESPADA", "GAFAS", "RELOJ", "BICICLETA", 
    "MARTILLO", "SABIDURIA", "VALENTIA", "SECRETO", "ARMONIA", "AVENTURA", "LIBERTAD", 
    "SILENCIO", "MONTAÑA", "VOLCAN", "PLAYA", "BOSQUE", "DESIERTO", "ISLA", "CIUDAD", 
    "PUENTE", "OCEANO", "ESTRELLA", "TELESCOPIO", "GALAXIA", "ROBOTICA", "FUTBOL", 
    "BALONCESTO", "NATACION", "AJEDREZ", "GUITARRA", "PINTURA", "HAMBURGUESA", 
    "CHOCOLATE", "PIZZA", "EMPANADA", "CEREZA"
];

// Estado del juego
let gameState = {
    currentWord: "",
    wordDisplay: [],
    guessedLetters: [],
    wrongCount: 0,
    maxErrors: 7,
    gameActive: false,
    currentTurn: null,      // ID del jugador que está jugando
    players: [],            // Lista de jugadores conectados
    waitingForNext: false,
    winner: null,
    lastWord: ""
};

let players = new Map(); // socket.id -> { id, name, score }

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

// Función para iniciar nueva ronda
function startNewRound() {
    // Elegir palabra diferente a la anterior
    let availableWords = WORDS.filter(w => w !== gameState.lastWord);
    if (availableWords.length === 0) availableWords = [...WORDS];
    
    const randomIndex = Math.floor(Math.random() * availableWords.length);
    gameState.currentWord = availableWords[randomIndex];
    gameState.lastWord = gameState.currentWord;
    
    gameState.wordDisplay = gameState.currentWord.split('').map(() => '_');
    gameState.guessedLetters = [];
    gameState.wrongCount = 0;
    gameState.gameActive = true;
    gameState.waitingForNext = false;
    gameState.winner = null;
    
    // Elegir el siguiente jugador (turno rotativo)
    if (gameState.players.length > 0) {
        if (!gameState.currentTurn || !players.has(gameState.currentTurn)) {
            gameState.currentTurn = gameState.players[0].id;
        } else {
            // Rotar al siguiente
            const currentIndex = gameState.players.findIndex(p => p.id === gameState.currentTurn);
            const nextIndex = (currentIndex + 1) % gameState.players.length;
            gameState.currentTurn = gameState.players[nextIndex].id;
        }
    }
    
    // Emitir nuevo estado a todos
    io.emit('game-update', {
        wordDisplay: gameState.wordDisplay,
        guessedLetters: gameState.guessedLetters,
        wrongCount: gameState.wrongCount,
        maxErrors: gameState.maxErrors,
        gameActive: gameState.gameActive,
        currentTurn: gameState.currentTurn,
        players: Array.from(players.values()),
        winner: gameState.winner
    });
    
    // Notificar quién juega
    const currentPlayer = players.get(gameState.currentTurn);
    if (currentPlayer) {
        io.emit('turn-notification', `${currentPlayer.name} está adivinando la palabra...`);
    }
}

// Procesar letra
function processLetter(socketId, letter) {
    if (!gameState.gameActive) return false;
    if (gameState.currentTurn !== socketId) return false;
    
    const normalizedLetter = normalizeLetter(letter);
    
    // Verificar si ya fue adivinada
    if (gameState.guessedLetters.includes(normalizedLetter)) {
        return false;
    }
    
    gameState.guessedLetters.push(normalizedLetter);
    
    // Verificar si la letra está en la palabra
    let letterFound = false;
    const wordUpper = gameState.currentWord.toUpperCase();
    const wordNormalized = gameState.currentWord.split('').map(c => normalizeLetter(c));
    
    for (let i = 0; i < wordNormalized.length; i++) {
        if (wordNormalized[i] === normalizedLetter) {
            gameState.wordDisplay[i] = gameState.currentWord[i];
            letterFound = true;
        }
    }
    
    if (!letterFound) {
        gameState.wrongCount++;
        
        // Verificar derrota
        if (gameState.wrongCount >= gameState.maxErrors) {
            gameState.gameActive = false;
            gameState.waitingForNext = true;
            
            // El jugador que falló no suma punto
            io.emit('game-update', {
                wordDisplay: gameState.wordDisplay,
                guessedLetters: gameState.guessedLetters,
                wrongCount: gameState.wrongCount,
                maxErrors: gameState.maxErrors,
                gameActive: false,
                currentTurn: gameState.currentTurn,
                players: Array.from(players.values()),
                winner: null,
                wordRevealed: gameState.currentWord
            });
            
            io.emit('game-message', `❌ ¡${players.get(gameState.currentTurn)?.name} perdió! La palabra era: ${gameState.currentWord}. Nueva ronda en 3 segundos...`);
            
            setTimeout(() => {
                startNewRound();
            }, 3000);
            return false;
        }
    }
    
    // Verificar victoria
    const isWin = !gameState.wordDisplay.includes('_');
    
    if (isWin) {
        gameState.gameActive = false;
        gameState.waitingForNext = true;
        gameState.winner = gameState.currentTurn;
        
        // Sumar punto al jugador
        const winner = players.get(gameState.currentTurn);
        if (winner) {
            winner.score = (winner.score || 0) + 1;
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
            wordRevealed: gameState.currentWord
        });
        
        io.emit('game-message', `🎉 ¡${winner?.name} adivinó la palabra! +1 punto. Nueva ronda en 3 segundos...`);
        
        setTimeout(() => {
            startNewRound();
        }, 3000);
        return true;
    }
    
    // Actualizar todos los clientes
    io.emit('game-update', {
        wordDisplay: gameState.wordDisplay,
        guessedLetters: gameState.guessedLetters,
        wrongCount: gameState.wrongCount,
        maxErrors: gameState.maxErrors,
        gameActive: gameState.gameActive,
        currentTurn: gameState.currentTurn,
        players: Array.from(players.values()),
        winner: null
    });
    
    return letterFound;
}

// Socket.io conexiones
io.on('connection', (socket) => {
    console.log(`Usuario conectado: ${socket.id}`);
    
    // Limitar a 10 jugadores
    if (players.size >= 10) {
        socket.emit('game-full', 'El juego está lleno (máximo 10 jugadores)');
        socket.disconnect();
        return;
    }
    
    // Solicitar nombre
    socket.emit('request-name');
    
    // Registrar jugador
    socket.on('player-name', (name) => {
        if (players.has(socket.id)) return;
        
        const newPlayer = {
            id: socket.id,
            name: name.substring(0, 20),
            score: 0
        };
        
        players.set(socket.id, newPlayer);
        gameState.players = Array.from(players.values());
        
        // Informar a todos
        io.emit('player-joined', {
            players: gameState.players,
            newPlayer: name
        });
        
        io.emit('game-message', `✨ ${name} se unió al juego! (${players.size}/10 jugadores)`);
        
        // Si es el primer jugador, iniciar el juego
        if (players.size === 1 && !gameState.gameActive) {
            startNewRound();
        } else if (gameState.gameActive) {
            // Enviar estado actual al nuevo jugador
            socket.emit('game-update', {
                wordDisplay: gameState.wordDisplay,
                guessedLetters: gameState.guessedLetters,
                wrongCount: gameState.wrongCount,
                maxErrors: gameState.maxErrors,
                gameActive: gameState.gameActive,
                currentTurn: gameState.currentTurn,
                players: gameState.players,
                winner: gameState.winner
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
    
    // Chat messages
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
            
            // Si ya no hay jugadores, resetear juego
            if (players.size === 0) {
                gameState.gameActive = false;
                gameState.currentTurn = null;
                gameState.waitingForNext = false;
            } 
            // Si el jugador que tenía el turno se fue, pasar al siguiente
            else if (gameState.currentTurn === socket.id && gameState.gameActive) {
                // Rotar turno
                if (gameState.players.length > 0) {
                    gameState.currentTurn = gameState.players[0].id;
                    io.emit('turn-notification', `Turno transferido a ${gameState.players[0].name}`);
                    io.emit('game-update', {
                        wordDisplay: gameState.wordDisplay,
                        guessedLetters: gameState.guessedLetters,
                        wrongCount: gameState.wrongCount,
                        maxErrors: gameState.maxErrors,
                        gameActive: gameState.gameActive,
                        currentTurn: gameState.currentTurn,
                        players: gameState.players,
                        winner: null
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