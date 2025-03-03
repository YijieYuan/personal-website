/**
 * Gomoku Game Controller
 * With randomness control
 */
window.onload = function() {
    // Game constants
    const BOARD_SIZE = 15;
    const N_IN_ROW = 5; // Five in a row to win
    const BLACK = 'black';
    const WHITE = 'white';
    
    // DOM elements
    const board = new GoBoard($('#board'));
    const statusEl = document.getElementById('status');
    const moveHistoryEl = document.getElementById('moveHistory');
    const aiSuggestionEl = document.getElementById('aiSuggestion');
    const whiteBarEl = document.getElementById('whiteBar');
    const blackBarEl = document.getElementById('blackBar');
    
    // Game state
    let currentPlayer = BLACK; // Black goes first
    let moveHistory = [];
    let gameOver = false;
    let aiEnabled = false; // AI suggestion disabled by default
    let analysisTimer = null;
    const analysisDelay = 500; // ms to wait after move before analyzing
    let bestMove = null;
    let aiRandomness = 0; // 0 means no randomness, 1 means very random
    
    // Initialize AI
    let ai = new GomokuAI({
        randomnessFactor: aiRandomness
    });
    
    /**
     * Make a move at the specified position
     */
    function makeMove(r, c) {
        if (gameOver || !isValidMove(r, c)) return false;
        
        // Place the stone
        board.setStone(r, c, currentPlayer);
        board.highlight(r, c);
        
        // Record the move
        const move = {
            r: r,
            c: c,
            color: currentPlayer,
            notation: board.coordToString(r, c)
        };
        moveHistory.push(move);
        
        // Update move history display
        updateMoveHistoryDisplay();
        
        // Check for win
        if (checkWin(r, c, currentPlayer)) {
            gameOver = true;
            const winner = currentPlayer.charAt(0).toUpperCase() + currentPlayer.slice(1);
            statusEl.textContent = `Game over! ${winner} wins!`;
            updateWinPrediction();
            return true;
        }
        
        // Check for draw
        if (moveHistory.length === BOARD_SIZE * BOARD_SIZE) {
            gameOver = true;
            statusEl.textContent = 'Game over! It\'s a draw.';
            updateWinPrediction();
            return true;
        }
        
        // Switch player
        currentPlayer = (currentPlayer === BLACK) ? WHITE : BLACK;
        
        // Update status
        const playerName = currentPlayer.charAt(0).toUpperCase() + currentPlayer.slice(1);
        statusEl.textContent = `${playerName}'s turn.`;
        
        // Cancel any ongoing AI analysis
        if (ai.isComputing) {
            ai.cancelSearch();
        }
        
        // Schedule AI analysis for the next player
        if (aiEnabled) {
            scheduleEngineAnalysis();
        }
        
        return true;
    }
    
    /**
     * Check if a move is valid
     */
    function isValidMove(r, c) {
        // Check if coordinates are within bounds
        if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) {
            return false;
        }
        
        // Check if the position is empty
        return !board.isSet(r, c);
    }
    
    /**
     * Check if the current move wins the game
     */
    function checkWin(r, c, color) {
        // Directions to check: horizontal, vertical, diagonal, anti-diagonal
        const directions = [
            [0, 1],  // horizontal
            [1, 0],  // vertical
            [1, 1],  // diagonal
            [1, -1]  // anti-diagonal
        ];
        
        for (const [dr, dc] of directions) {
            let count = 1;  // Start with 1 for the current stone
            
            // Check in the positive direction
            for (let i = 1; i < N_IN_ROW; i++) {
                const newR = r + i * dr;
                const newC = c + i * dc;
                
                if (newR < 0 || newR >= BOARD_SIZE || newC < 0 || newC >= BOARD_SIZE) {
                    break;
                }
                
                if (board.isSet(newR, newC) && board.getColor(newR, newC) === color) {
                    count++;
                } else {
                    break;
                }
            }
            
            // Check in the negative direction
            for (let i = 1; i < N_IN_ROW; i++) {
                const newR = r - i * dr;
                const newC = c - i * dc;
                
                if (newR < 0 || newR >= BOARD_SIZE || newC < 0 || newC >= BOARD_SIZE) {
                    break;
                }
                
                if (board.isSet(newR, newC) && board.getColor(newR, newC) === color) {
                    count++;
                } else {
                    break;
                }
            }
            
            if (count >= N_IN_ROW) {
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * Update the move history display
     */
    function updateMoveHistoryDisplay() {
        let historyText = '';
        
        for (let i = 0; i < moveHistory.length; i++) {
            const move = moveHistory[i];
            const moveNum = Math.floor(i / 2) + 1;
            
            if (i % 2 === 0) {
                historyText += `${moveNum}. ${move.notation}`;
            } else {
                historyText += ` ${move.notation}\n`;
            }
        }
        
        // Add a newline if the last move was black's
        if (moveHistory.length % 2 === 1) {
            historyText += '\n';
        }
        
        moveHistoryEl.textContent = historyText;
        moveHistoryEl.scrollTop = moveHistoryEl.scrollHeight;
    }
    
    /**
     * Update AI randomness factor
     */
    function updateRandomness(value) {
        aiRandomness = parseFloat(value);
        ai = new GomokuAI({
            randomnessFactor: aiRandomness
        });
        
        // Update UI
        const randomnessLevel = document.getElementById('randomnessLevel');
        if (randomnessLevel) {
            const levelText = aiRandomness === 0 ? 'None' : 
                             (aiRandomness <= 0.2 ? 'Low' : 
                             (aiRandomness <= 0.5 ? 'Medium' : 'High'));
            randomnessLevel.textContent = levelText;
        }
        
        if (aiEnabled) {
            scheduleEngineAnalysis();
        }
    }
    
    /**
     * Initialize the game
     */
    function initGame() {
        // If AI is computing, cancel the computation
        if (ai.isComputing) {
            ai.cancelSearch();
        }
        
        // Reset the game state
        board.init();
        currentPlayer = BLACK;
        moveHistory = [];
        gameOver = false;
        bestMove = null;
        statusEl.textContent = 'Black\'s turn.';
        moveHistoryEl.textContent = '';
        
        if (aiEnabled) {
            aiSuggestionEl.textContent = 'AI is analyzing...';
        } else {
            aiSuggestionEl.textContent = 'AI Suggestions: Disabled';
        }
        
        // Reset the AI
        ai = new GomokuAI({
            randomnessFactor: aiRandomness
        });
        
        updateWinPrediction();
        
        if (aiEnabled) {
            scheduleEngineAnalysis();
        }
    }
    
    /**
     * Handle board clicks
     */
    board.clicked = function(r, c) {
        if (gameOver) return;
        
        // Allow placing stones for both sides
        makeMove(r, c);
    };
    
    /**
     * Apply the AI's suggestion
     */
    function applyAISuggestion() {
        if (gameOver || !aiEnabled || !bestMove) return;
        
        // Apply the best move for current player
        if (isValidMove(bestMove.r, bestMove.c)) {
            makeMove(bestMove.r, bestMove.c);
        } else {
            // If the suggested move is invalid, update the analysis
            scheduleEngineAnalysis();
        }
    }
    
    /**
     * Undo the last move
     */
    function undoMove() {
        // If AI is computing, cancel it
        if (ai.isComputing) {
            ai.cancelSearch();
        }
        
        if (moveHistory.length === 0) return;
        
        // Undo the last move
        const lastMove = moveHistory.pop();
        board.unsetStone(lastMove.r, lastMove.c);
        
        // Switch back to the previous player
        currentPlayer = lastMove.color;
        
        // Update status and game state
        gameOver = false;
        
        // Update move history display
        updateMoveHistoryDisplay();
        
        // Update status text
        const playerName = currentPlayer.charAt(0).toUpperCase() + currentPlayer.slice(1);
        statusEl.textContent = `${playerName}'s turn.`;
        
        // Highlight the new last move if there is one
        if (moveHistory.length > 0) {
            const newLastMove = moveHistory[moveHistory.length - 1];
            board.highlight(newLastMove.r, newLastMove.c);
        }
        
        // Update analysis
        if (aiEnabled) {
            scheduleEngineAnalysis();
        } else {
            aiSuggestionEl.textContent = 'AI Suggestions: Disabled';
        }
    }
    
    /**
     * Schedule AI analysis after a short delay
     */
    function scheduleEngineAnalysis() {
        if (!aiEnabled) {
            aiSuggestionEl.textContent = 'AI Suggestions: Disabled';
            updateWinPrediction();
            return;
        }
        
        if (analysisTimer) {
            clearTimeout(analysisTimer);
        }
        
        aiSuggestionEl.textContent = 'AI is analyzing...';
        
        analysisTimer = setTimeout(() => {
            startEngineAnalysis();
        }, analysisDelay);
    }
    
    /**
     * Start the AI analysis
     */
    function startEngineAnalysis() {
        if (!aiEnabled || gameOver) {
            aiSuggestionEl.textContent = gameOver ? 
                "Game is over" : "AI Suggestions: Disabled";
            return;
        }
        
        // Get current board state
        const boardState = board.getBoardState();
        
        // Use setTimeout to allow UI to update
        setTimeout(() => {
            // Find best move for current player
            bestMove = ai.findBestMove(boardState, currentPlayer);
            
            // Make sure the suggested move is valid (not already occupied)
            if (bestMove && !board.isSet(bestMove.r, bestMove.c)) {
                const notation = board.coordToString(bestMove.r, bestMove.c);
                
                // Determine if this is a winning or critical move
                let moveType = '';
                if (bestMove.isWinningMove) {
                    moveType = ' (Winning Move!)';
                } else if (bestMove.isForcedMove) {
                    moveType = ' (Must Block!)';
                } else if (bestMove.isOpenFour) {
                    moveType = ' (Creates Open Four!)';
                } else if (bestMove.isBlockingOpenFour) {
                    moveType = ' (Blocks Open Four!)';
                } else if (bestMove.isMultipleOpenThrees) {
                    moveType = ` (Creates ${bestMove.openThreeCount} Open Threes!)`;
                } else if (bestMove.isBlockingMultipleOpenThrees) {
                    moveType = ' (Blocks Multiple Open Threes!)';
                } else if (bestMove.isOpenThree) {
                    moveType = ' (Creates Open Three)';
                } else if (bestMove.isRandom) {
                    moveType = ' (Randomized Move)';
                }
                
                // Show suggestion without win probability
                aiSuggestionEl.textContent = `Suggestion for ${currentPlayer}: ${notation}${moveType}`;
            } else {
                aiSuggestionEl.textContent = `Suggestion for ${currentPlayer}: No valid move found`;
                
                // Should never happen with the improved AI that prevents random moves
                console.error("AI failed to find a move - this should not happen");
            }
            
            // Update win prediction
            updateWinPrediction();
        }, 50);
    }
    
    /**
     * Update the win prediction bars with improved evaluation
     */
    function updateWinPrediction() {
        if (gameOver) {
            if (moveHistory.length > 0 && checkWin(moveHistory[moveHistory.length-1].r, moveHistory[moveHistory.length-1].c, moveHistory[moveHistory.length-1].color)) {
                const winner = moveHistory[moveHistory.length-1].color;
                
                if (winner === BLACK) {
                    blackBarEl.style.width = '100%';
                    blackBarEl.textContent = '100%';
                    whiteBarEl.style.width = '0%';
                    whiteBarEl.textContent = '0%';
                } else {
                    whiteBarEl.style.width = '100%';
                    whiteBarEl.textContent = '100%';
                    blackBarEl.style.width = '0%';
                    blackBarEl.textContent = '0%';
                }
            } else {
                // Draw
                whiteBarEl.style.width = '50%';
                blackBarEl.style.width = '50%';
                whiteBarEl.textContent = '50%';
                blackBarEl.textContent = '50%';
            }
            return;
        }
        
        if (!aiEnabled) {
            // Show 50/50 when AI is disabled
            whiteBarEl.style.width = '50%';
            blackBarEl.style.width = '50%';
            whiteBarEl.textContent = '50%';
            blackBarEl.textContent = '50%';
            return;
        }
        
        // Get current board state
        const boardState = board.getBoardState();
        
        // Evaluate current position probabilities
        const currentProb = ai.evaluateWinProbability(boardState, currentPlayer);
        
        // If we have a best move, calculate the probabilities after that move
        if (bestMove && currentPlayer === BLACK) {
            // Simulate board after black makes the best move
            const simulatedBoardState = JSON.parse(JSON.stringify(boardState));
            simulatedBoardState.black.push([bestMove.r, bestMove.c]);
            
            // Show 100% for winning moves or virtual wins
            if (bestMove.isWinningMove) {
                blackBarEl.style.width = '100%';
                blackBarEl.textContent = '100%';
                whiteBarEl.style.width = '0%';
                whiteBarEl.textContent = '0%';
            } 
            else if (bestMove.isOpenFour) {
                blackBarEl.style.width = '95%';
                blackBarEl.textContent = '95%';
                whiteBarEl.style.width = '5%';
                whiteBarEl.textContent = '5%';
            }
            else {
                // Calculate probabilities after the best move
                const afterMoveProb = ai.evaluateWinProbability(simulatedBoardState, WHITE);
                
                // Use the black probability after the move for black's bar
                // and white probability after the move for white's bar
                const blackPerc = Math.round(afterMoveProb.black * 100);
                const whitePerc = Math.round(afterMoveProb.white * 100);
                
                blackBarEl.style.width = blackPerc + '%';
                blackBarEl.textContent = blackPerc + '%';
                whiteBarEl.style.width = whitePerc + '%';
                whiteBarEl.textContent = whitePerc + '%';
            }
        } 
        else if (bestMove && currentPlayer === WHITE) {
            // Simulate board after white makes the best move
            const simulatedBoardState = JSON.parse(JSON.stringify(boardState));
            simulatedBoardState.white.push([bestMove.r, bestMove.c]);
            
            // Show 100% for winning moves or virtual wins
            if (bestMove.isWinningMove) {
                whiteBarEl.style.width = '100%';
                whiteBarEl.textContent = '100%';
                blackBarEl.style.width = '0%';
                blackBarEl.textContent = '0%';
            }
            else if (bestMove.isOpenFour) {
                whiteBarEl.style.width = '95%';
                whiteBarEl.textContent = '95%';
                blackBarEl.style.width = '5%';
                blackBarEl.textContent = '5%';
            }
            else {
                // Calculate probabilities after the best move
                const afterMoveProb = ai.evaluateWinProbability(simulatedBoardState, BLACK);
                
                // Use the black probability after the move for black's bar
                // and white probability after the move for white's bar
                const blackPerc = Math.round(afterMoveProb.black * 100);
                const whitePerc = Math.round(afterMoveProb.white * 100);
                
                blackBarEl.style.width = blackPerc + '%';
                blackBarEl.textContent = blackPerc + '%';
                whiteBarEl.style.width = whitePerc + '%';
                whiteBarEl.textContent = whitePerc + '%';
            }
        }
        else {
            // Just use current probabilities if no best move is available
            const blackPerc = Math.round(currentProb.black * 100);
            const whitePerc = Math.round(currentProb.white * 100);
            
            blackBarEl.style.width = blackPerc + '%';
            blackBarEl.textContent = blackPerc + '%';
            whiteBarEl.style.width = whitePerc + '%';
            whiteBarEl.textContent = whitePerc + '%';
        }
    }
    
    // Event listeners for buttons
    document.getElementById('startBtn').addEventListener('click', initGame);
    document.getElementById('clearBtn').addEventListener('click', initGame);
    document.getElementById('undoBtn').addEventListener('click', undoMove);
    document.getElementById('applyAiBtn').addEventListener('click', applyAISuggestion);
    
    // AI toggle (if exists)
    const aiToggle = document.getElementById('aiToggle');
    if (aiToggle) {
        // Set initial state - unchecked (disabled)
        aiToggle.checked = aiEnabled;
        
        aiToggle.addEventListener('change', (e) => {
            aiEnabled = e.target.checked;
            if (!aiEnabled) {
                aiSuggestionEl.textContent = 'AI Suggestions: Disabled';
                // Set even probabilities when AI is disabled
                whiteBarEl.style.width = '50%';
                blackBarEl.style.width = '50%';
                whiteBarEl.textContent = '50%';
                blackBarEl.textContent = '50%';
            } else {
                scheduleEngineAnalysis();
            }
        });
    }
    
    // Randomness slider (if exists)
    const randomnessSlider = document.getElementById('randomnessSlider');
    if (randomnessSlider) {
        // Set initial state
        randomnessSlider.value = aiRandomness;
        
        randomnessSlider.addEventListener('input', (e) => {
            updateRandomness(e.target.value);
        });
        
        // Initialize randomness level display
        updateRandomness(aiRandomness);
    }
    
    // Initialize the game
    initGame();
    
    // Update the last modified date
    const updateDateEl = document.getElementById("update-date");
    if (updateDateEl) {
        updateDateEl.textContent = new Date(document.lastModified).toLocaleDateString();
    }
};