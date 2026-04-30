// Agrega esto en la función processSteal, después de actualizar los intentos:

// Enviar información de intentos restantes al jugador
io.to(socketId).emit('steal-result', {
    success: result.success,
    attemptsLeft: player.stealAttempts,
    message: result.message
});

// También modifica el evento 'steal-attempt' para que responda:
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
        attemptsLeft: players.get(socket.id)?.stealAttempts || 0,
        message: result.message || result.reason
    });
});