window.onload = function() {
    let board = null;
    const game = new Chess();
    const statusEl = document.getElementById('status');
    const pgnEl = document.getElementById('pgn');
    const aiSuggestionEl = document.getElementById('aiSuggestion');
    const whiteBarEl = document.getElementById('whiteBar');
    const blackBarEl = document.getElementById('blackBar');
    let moveHistory = [];
    let gameOverByKingCapture = false;
    let aiEnabled = true;

    // Simple AI function to get all possible moves
    function getAllPossibleMoves() {
        return game.moves({ verbose: true });
    }

    // AI suggestion - randomly pick a valid move
    function getAISuggestion() {
        if (!aiEnabled || game.game_over() || gameOverByKingCapture) {
            aiSuggestionEl.textContent = "AI Suggestion: No suggestion available";
            return;
        }

        const moves = getAllPossibleMoves();
        if (moves.length === 0) {
            aiSuggestionEl.textContent = "AI Suggestion: No valid moves";
            return;
        }

        const randomMove = moves[Math.floor(Math.random() * moves.length)];
        const moveText = `${randomMove.from}${randomMove.to}`;
        aiSuggestionEl.textContent = `AI Suggestion: Move ${randomMove.piece.toUpperCase()} from ${randomMove.from} to ${randomMove.to}`;
    }

    // Generate random win predictions
    function updateWinPrediction() {
        if (game.game_over() || gameOverByKingCapture) {
            if (gameOverByKingCapture) {
                const winner = game.turn() === 'w' ? 'Black' : 'White';
                whiteBarEl.style.width = winner === 'White' ? '100%' : '0%';
                blackBarEl.style.width = winner === 'Black' ? '100%' : '0%';
                whiteBarEl.textContent = winner === 'White' ? '100%' : '0%';
                blackBarEl.textContent = winner === 'Black' ? '100%' : '0%';
            } else {
                whiteBarEl.style.width = '50%';
                blackBarEl.style.width = '50%';
                whiteBarEl.textContent = '50%';
                blackBarEl.textContent = '50%';
            }
            return;
        }

        const whiteChance = Math.floor(Math.random() * 101);
        const blackChance = 100 - whiteChance;
        
        whiteBarEl.style.width = `${whiteChance}%`;
        blackBarEl.style.width = `${blackChance}%`;
        whiteBarEl.textContent = `${whiteChance}%`;
        blackBarEl.textContent = `${blackChance}%`;
    }

    function updateStatus() {
        let status = '';
        let moveColor = 'White';
        if (game.turn() === 'b') {
            moveColor = 'Black';
        }

        // Check if a king has been captured
        const position = game.board();
        let whiteKingExists = false;
        let blackKingExists = false;
        
        for (let i = 0; i < position.length; i++) {
            for (let j = 0; j < position[i].length; j++) {
                const piece = position[i][j];
                if (piece) {
                    if (piece.type === 'k' && piece.color === 'w') whiteKingExists = true;
                    if (piece.type === 'k' && piece.color === 'b') blackKingExists = true;
                }
            }
        }

        if (!whiteKingExists) {
            status = 'Game over, Black wins by capturing the king!';
            gameOverByKingCapture = true;
        } else if (!blackKingExists) {
            status = 'Game over, White wins by capturing the king!';
            gameOverByKingCapture = true;
        } else if (game.in_checkmate()) {
            status = `Game over, ${moveColor} is in checkmate.`;
        } else if (game.in_draw()) {
            status = 'Game over, drawn position';
        } else {
            status = `${moveColor} to move`;
            if (game.in_check()) {
                status += `, ${moveColor} is in check`;
            }
        }

        statusEl.textContent = status;
        pgnEl.textContent = game.pgn({ max_width: 5, newline_char: '\n' });
        
        // Update AI suggestion and prediction
        getAISuggestion();
        updateWinPrediction();
    }

    function onDragStart(source, piece) {
        // Don't allow moves if game is over by king capture
        if (gameOverByKingCapture) return false;
        
        // Only pick up pieces for the side to move
        if (game.game_over()) return false;
        if ((game.turn() === 'w' && piece.search(/^b/) !== -1) ||
            (game.turn() === 'b' && piece.search(/^w/) !== -1)) {
            return false;
        }
    }

    function onDrop(source, target) {
        // Store the current position before making a move
        const currentPosition = game.fen();
        
        // See if the move is legal
        const move = game.move({
            from: source,
            to: target,
            promotion: 'q' // Always promote to a queen for simplicity
        });

        // Illegal move
        if (move === null) return 'snapback';

        // Store the move in history
        moveHistory.push({
            position: currentPosition,
            move: move
        });

        updateStatus();
    }

    function onSnapEnd() {
        board.position(game.fen());
    }

    const config = {
        pieceTheme: 'chesspieces/{piece}.png',
        draggable: true,
        position: 'start',
        onDragStart: onDragStart,
        onDrop: onDrop,
        onSnapEnd: onSnapEnd
    };

    board = Chessboard('board', config);
    updateStatus();

    // Add AI toggle functionality
    document.getElementById('aiToggle').addEventListener('change', (e) => {
        aiEnabled = e.target.checked;
        if (aiEnabled) {
            getAISuggestion();
        } else {
            aiSuggestionEl.textContent = "AI Suggestions: Disabled";
        }
    });

    // Modify existing button listeners to update AI suggestions
    document.getElementById('startBtn').addEventListener('click', () => {
        moveHistory = [];
        gameOverByKingCapture = false;
        game.reset();
        board.start();
        updateStatus();
    });

    document.getElementById('clearBtn').addEventListener('click', () => {
        moveHistory = [];
        gameOverByKingCapture = false;
        game.clear();
        board.clear();
        updateStatus();
    });

    document.getElementById('flipBtn').addEventListener('click', () => {
        board.flip();
    });

    document.getElementById('undoBtn').addEventListener('click', () => {
        if (moveHistory.length === 0) return;
        
        const lastMove = moveHistory.pop();
        game.load(lastMove.position);
        board.position(lastMove.position);
        gameOverByKingCapture = false;
        updateStatus();
    });

    window.addEventListener('resize', () => {
        board.resize();
    });
};