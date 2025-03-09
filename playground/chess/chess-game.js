window.onload = function() {
    /**************************************************************
     * 1) Basic Chess Setup & Variables
     **************************************************************/
    let board = null;
    const game = new Chess();  // chess.js instance
    
    const statusEl = document.getElementById('status');
    const pgnEl = document.getElementById('pgn');
    const aiSuggestionEl = document.getElementById('aiSuggestion');
    const whiteBarEl = document.getElementById('whiteBar');
    const blackBarEl = document.getElementById('blackBar');

    let moveHistory = [];
    let gameOverByKingCapture = false;
    let aiEnabled = false;
    
    // Variables for click-to-move functionality
    let selectedSquare = null;

    /**************************************************************
     * 2) Stockfish Engine Variables
     **************************************************************/
    let engine = null;           // Web Worker for Stockfish
    let engineReady = false;     // true when we get "readyok" from engine
    let currentEvaluation = 0;   // current centipawn (side-to-move's perspective)
    let analysisTimer = null;
    const analysisDelay = 500;   // ms to wait after move before analyzing
    let bestMove = null;         // store the last bestmove from Stockfish

    /**************************************************************
     * 3) Create the Web Worker and Initialize Stockfish
     **************************************************************/
    function createEngine() {
        // The filenames MUST match your downloaded Stockfish files:
        engine = new Worker('stockfish-17-lite-single.js');

        engine.onmessage = function(e) {
            parseEngineMessage(e.data);
        };

        // Let's tell Stockfish to use UCI
        engine.postMessage('uci');
        engine.postMessage('ucinewgame');
        engine.postMessage('isready'); // once we get 'readyok' => engineReady = true
    }

    /**************************************************************
     * 4) Parsing the engine output (bestmove & info lines)
     **************************************************************/
    function parseEngineMessage(line) {
        // console.log("Engine says:", line);

        // "readyok" => engine is ready
        if (line === 'readyok') {
            engineReady = true;
            console.log('Stockfish engine is ready.');
            return;
        }

        // "info depth ..." => parse the current evaluation
        if (line.startsWith('info depth')) {
            // look for "score cp <value>" or "score mate <value>"
            const scoreMatch = line.match(/\bscore (\w+) (-?\d+)\b/);
            if (scoreMatch) {
                const type = scoreMatch[1]; // 'cp' or 'mate'
                let value = parseInt(scoreMatch[2], 10);

                if (type === 'cp') {
                    currentEvaluation = value;
                } else if (type === 'mate') {
                    // positive => White mates in `value` moves; negative => Black mates
                    if (value === 0) {
                        currentEvaluation = 100000; // immediate mate
                    } else if (value > 0) {
                        currentEvaluation = 99999;
                    } else {
                        currentEvaluation = -99999;
                    }
                }

                // <-- FIX #1: If it's Black's turn, invert the evaluation
                // so it's always from the perspective of the side to move.
                if (game.turn() === 'b') {
                    currentEvaluation = -currentEvaluation;
                }

                // Now that we have an updated score, update the probability
                updateWinPrediction();
            }
        }

        // "bestmove e2e4" => final result of the search
        if (line.startsWith('bestmove')) {
            const parts = line.split(' ');
            const moveStr = parts[1] || null;
            bestMove = moveStr; // store the bestmove for the "Make AI Move" button

            if (bestMove) {
                aiSuggestionEl.textContent = `AI Suggestion: ${bestMove}`;
            } else {
                aiSuggestionEl.textContent = 'AI Suggestion: No move found';
            }
        }
    }

    /**************************************************************
     * 5) Triggering the Engine Analysis
     **************************************************************/
    function startEngineAnalysis() {
        if (!engineReady) {
            console.log("Engine not ready yet.");
            return;
        }
        // If game is over, skip
        if (game.game_over() || gameOverByKingCapture) {
            aiSuggestionEl.textContent = "AI Suggestion: No suggestion available";
            return;
        }

        // Stop any current search
        engine.postMessage('stop');

        // Set position
        const fen = game.fen();
        engine.postMessage(`position fen ${fen}`);

        // Start searching (depth ~12 is decent, adjust as desired)
        engine.postMessage('go depth 12');

        aiSuggestionEl.textContent = 'AI is thinking...';
        currentEvaluation = 0;
        bestMove = null;
    }

    function scheduleEngineAnalysis() {
        if (!aiEnabled) {
            aiSuggestionEl.textContent = 'AI Suggestions: Disabled';
            return;
        }
        if (analysisTimer) {
            clearTimeout(analysisTimer);
        }
        analysisTimer = setTimeout(() => {
            startEngineAnalysis();
        }, analysisDelay);
    }

    /**************************************************************
     * 6) Updating the Win Probability Bars
     **************************************************************/
    function updateWinPrediction() {
        // If game is over by normal means or by king capture,
        // preserve your logic to set bars, but fix checkmate logic below.

        if (game.game_over() || gameOverByKingCapture) {
            if (gameOverByKingCapture) {
                // the winner is whichever color still has a king
                const winner = (game.turn() === 'w') ? 'Black' : 'White';
                whiteBarEl.style.width = (winner === 'White') ? '100%' : '0%';
                blackBarEl.style.width = (winner === 'Black') ? '100%' : '0%';
                whiteBarEl.textContent = (winner === 'White') ? '100%' : '0%';
                blackBarEl.textContent = (winner === 'Black') ? '100%' : '0%';
            } else {
                // <-- FIX #2: If checkmate, assign 100% to the winning side
                if (game.in_checkmate()) {
                    // side to move (game.turn()) is the one that got checkmated
                    if (game.turn() === 'w') {
                        // White is checkmated => Black wins => Black 100%
                        blackBarEl.style.width = '100%';
                        blackBarEl.textContent = '100%';
                        whiteBarEl.style.width = '0%';
                        whiteBarEl.textContent = '0%';
                    } else {
                        // Black is checkmated => White wins => White 100%
                        whiteBarEl.style.width = '100%';
                        whiteBarEl.textContent = '100%';
                        blackBarEl.style.width = '0%';
                        blackBarEl.textContent = '0%';
                    }
                } else {
                    // presumably a draw
                    whiteBarEl.style.width = '50%';
                    blackBarEl.style.width = '50%';
                    whiteBarEl.textContent = '50%';
                    blackBarEl.textContent = '50%';
                }
            }
            return;
        }

        // Convert currentEvaluation (already perspective-adjusted) to [0..1]
        let evalCp = currentEvaluation;
        let whiteProb = 0.5;

        // Large thresholds for forced mate
        if (evalCp > 9999) {
            whiteProb = 1.0;  
        } else if (evalCp < -9999) {
            whiteProb = 0.0;
        } else {
            // logistic function
            whiteProb = 1.0 / (1.0 + Math.pow(10, -evalCp / 400.0));
        }

        const bProb = 1.0 - whiteProb;
        const wPercent = Math.round(whiteProb * 100);
        const bPercent = 100 - wPercent;

        whiteBarEl.style.width = wPercent + '%';
        whiteBarEl.textContent = wPercent + '%';
        blackBarEl.style.width = bPercent + '%';
        blackBarEl.textContent = bPercent + '%';
    }

    /**************************************************************
     * 7) Apply the AI's Best Move
     **************************************************************/
    function applyAIMove() {
        // If we have no best move or the game is over, do nothing
        if (!bestMove || game.game_over() || gameOverByKingCapture) {
            return;
        }
        // bestMove is something like "e2e4"
        const from = bestMove.substring(0, 2);
        const to   = bestMove.substring(2, 4);
        
        // Promotion if needed (bestMove will be e.g. "e7e8q")
        let promotion = undefined;
        if (bestMove.length > 4) {
            promotion = bestMove.substring(4, 5);
        }

        // Attempt the move
        const moveObj = game.move({
            from: from,
            to: to,
            promotion: promotion || 'q'
        });

        if (moveObj === null) {
            console.log("AI move invalid for the current board position (possibly outdated).");
            return;
        }

        // If legal, add to moveHistory
        moveHistory.push(moveObj);
        
        // Update board & UI
        board.position(game.fen());
        updateStatus();
        // Clear any selected square
        clearSelection();
    }

    /**************************************************************
     * 8) Click-to-Move Functionality
     **************************************************************/
    function clearSelection() {
        selectedSquare = null;
        removeHighlights();
    }

    function removeHighlights() {
        $('.square-55d63').removeClass('highlight1-32417 highlight2-9c5d2');
    }

    function highlightSquare(square) {
        removeHighlights();
        
        // Highlight the selected square
        $('.square-' + square).addClass('highlight1-32417');
        
        // Get and highlight possible moves for this piece
        const moves = game.moves({
            square: square,
            verbose: true
        });
        
        // Highlight possible destinations
        for (let i = 0; i < moves.length; i++) {
            $('.square-' + moves[i].to).addClass('highlight2-9c5d2');
        }
    }

    function handleSquareClick(square) {
        // If game is over, do nothing
        if (gameOverByKingCapture || game.game_over()) return;
        
        // If a square is already selected
        if (selectedSquare !== null) {
            // If clicking the same square, deselect it
            if (square === selectedSquare) {
                clearSelection();
                return;
            }
            
            // Try to make a move from selected square to this square
            const move = game.move({
                from: selectedSquare,
                to: square,
                promotion: 'q' // Default to queen for simplicity
            });
            
            // If move is illegal, check if this square has a valid piece for the current player
            if (move === null) {
                const position = game.board();
                const row = 8 - parseInt(square[1]);
                const col = square.charCodeAt(0) - 'a'.charCodeAt(0);
                
                if (row >= 0 && row < 8 && col >= 0 && col < 8) {
                    const piece = position[row][col];
                    
                    if (piece && piece.color === game.turn()) {
                        // It's a valid piece for the current player, select it instead
                        selectedSquare = square;
                        highlightSquare(square);
                    }
                }
                return;
            }
            
            // Move was successful
            moveHistory.push(move);
            clearSelection();
            board.position(game.fen());
            updateStatus();
            return;
        }
        
        // No piece was previously selected - check if this square has a piece
        const position = game.board();
        const row = 8 - parseInt(square[1]);
        const col = square.charCodeAt(0) - 'a'.charCodeAt(0);
        
        if (row >= 0 && row < 8 && col >= 0 && col < 8) {
            const piece = position[row][col];
            
            // If there's a piece and it belongs to the player whose turn it is
            if (piece && piece.color === game.turn()) {
                selectedSquare = square;
                highlightSquare(square);
            }
        }
    }

    // check if a king is missing, checkmate/draw, etc.
    function updateStatus() {
        let status = '';
        const moveColor = (game.turn() === 'b') ? 'Black' : 'White';

        // check for missing kings
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
        
        // Update PGN display without the [SetUp "1"] tag
        const pgn = game.pgn({ max_width: 5, newline_char: '\n' });
        // Remove [SetUp "1"] and similar tags if present
        const cleanPgn = pgn.replace(/\[\s*SetUp\s*"1"\s*\]\s*/g, '')
                            .replace(/\[\s*FEN\s*"[^"]*"\s*\]\s*/g, '');
        pgnEl.textContent = cleanPgn;

        if (!game.game_over() && !gameOverByKingCapture && aiEnabled) {
            scheduleEngineAnalysis();
        } else if (!aiEnabled) {
            aiSuggestionEl.textContent = 'AI Suggestions: Disabled';
            updateWinPrediction(); 
        } else {
            // game is over
            updateWinPrediction();
        }
        
        // Reset selection whenever the board updates
        clearSelection();
    }

    /**************************************************************
     * 9) Initialize the Board & Set Up Event Listeners
     **************************************************************/
    const config = {
        pieceTheme: 'chesspieces/{piece}.png',
        draggable: false, // Disable dragging completely
        position: 'start'
    };
    
    board = Chessboard('board', config);
    updateStatus();
    
    // Set up click handlers
    $('#board').on('click', '.square-55d63', function() {
        const square = $(this).data('square');
        if (square) {
            handleSquareClick(square);
        }
    });

    // Toggle AI
    document.getElementById('aiToggle').addEventListener('change', (e) => {
        aiEnabled = e.target.checked;
        if (!aiEnabled) {
            aiSuggestionEl.textContent = 'AI Suggestions: Disabled';
        }
        updateStatus();
    });

    // Restart
    document.getElementById('startBtn').addEventListener('click', () => {
        moveHistory = [];
        gameOverByKingCapture = false;
        game.reset();
        board.start();
        updateStatus();
    });

    // Clear
    document.getElementById('clearBtn').addEventListener('click', () => {
        moveHistory = [];
        gameOverByKingCapture = false;
        game.clear();
        board.clear();
        updateStatus();
    });

    // Flip
    document.getElementById('flipBtn').addEventListener('click', () => {
        board.flip();
    });

    // Undo - FIXED to properly handle a single undo operation
    document.getElementById('undoBtn').addEventListener('click', () => {
        if (moveHistory.length === 0) return;
        
        // Get the last move from history and remove it
        moveHistory.pop();
        
        // Undo the last move in the game
        game.undo();
        
        // Update the board to reflect the new position
        board.position(game.fen());
        
        // Reset the gameOverByKingCapture flag as we're undoing
        gameOverByKingCapture = false;
        
        // Update the status and UI
        updateStatus();
    });

    // New "Apply AI Move" button
    document.getElementById('applyAiBtn').addEventListener('click', () => {
        applyAIMove();
    });

    // On window resize
    window.addEventListener('resize', () => {
        board.resize();
    });

    // Spin up the engine so it's ready
    createEngine();
};