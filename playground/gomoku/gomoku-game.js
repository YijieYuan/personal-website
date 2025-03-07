/**
 * Gomoku Game Controller
 * Updated for consistent AI behavior across devices
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
    const aiSectionTitle = document.querySelector('.ai-section h2');
    const undoBtn = document.getElementById('undoBtn');
    const startBtn = document.getElementById('startBtn');
    const makeMoveBtn = document.getElementById('makeMoveBtn');
    const autoBlackBtn = document.getElementById('autoBlackBtn');
    const autoWhiteBtn = document.getElementById('autoWhiteBtn');
    
    // Game state
    let currentPlayer = BLACK; // Black goes first
    let moveHistory = [];
    let gameOver = false;
    let boardClickable = true; // Flag to control board clickability
    
    // AI state
    let aiDifficulty = 'Expert'; // Store the current AI difficulty
    let blackAutoPlay = false;
    let whiteAutoPlay = false;
    let blackBestMove = null;
    let whiteBestMove = null;
    let blackAiThinking = false;
    let whiteAiThinking = false;
    let blackAiCancelCount = 0;
    let whiteAiCancelCount = 0;
    
    // Set a fixed computation time limit to ensure consistency across devices
    const AI_COMPUTATION_TIME = 2000; // 2 seconds computation time limit
    
    // Initialize AI workers
    let blackAiWorker = new Worker('ai-worker.js');
    let whiteAiWorker = new Worker('ai-worker.js');
    
    /**
     * Update the AI Analysis section title to include difficulty
     */
    function updateAiTitle() {
        aiSectionTitle.textContent = `AI Analysis (${aiDifficulty})`;
    }
    
    /**
     * Set up Black AI worker event listeners
     */
    function setupBlackAIWorkerEventListeners() {
        blackAiWorker.onmessage = function(e) {
            const data = e.data;
            
            switch(data.type) {
                case 'ini_complete':
                    console.log('Black AI initialized');
                    blackAiThinking = false;
                    updateBoardClickability();
                    
                    if (currentPlayer === BLACK && moveHistory.length === 0) {
                        // For first move, always suggest center - consistent for all devices
                        blackBestMove = { r: 7, c: 7 };
                        updateAiSuggestion();
                        
                        // Auto-play if enabled
                        if (blackAutoPlay && !gameOver) {
                            setTimeout(() => {
                                makeMove(blackBestMove.r, blackBestMove.c);
                            }, 500);
                        }
                    } else if (currentPlayer === BLACK && !gameOver) {
                        startBlackAIAnalysis();
                    }
                    break;
                    
                case 'watch_complete':
                    console.log('Black AI updated');
                    
                    // If there are cancel requests pending, don't start analysis
                    if (blackAiCancelCount > 0) {
                        blackAiCancelCount--;
                        blackAiThinking = false;
                        console.log('Black AI analysis cancelled, remaining cancels:', blackAiCancelCount);
                    }
                    // Otherwise, if it's black's turn, start computation
                    else if (currentPlayer === BLACK && !gameOver) {
                        startBlackAIAnalysis();
                    } else {
                        blackAiThinking = false;
                    }
                    
                    updateBoardClickability();
                    break;
                    
                case 'starting':
                    console.log('Black AI computing started');
                    blackAiThinking = true;
                    updateBoardClickability();
                    break;
                    
                case 'decision':
                    console.log('Black AI decision received', data);
                    
                    // If there are cancel requests, ignore this result
                    if (blackAiCancelCount > 0) {
                        blackAiCancelCount--;
                        console.log('Ignoring Black AI decision due to cancellation, remaining cancels:', blackAiCancelCount);
                    } else {
                        blackAiThinking = false;
                        blackBestMove = { r: data.r, c: data.c };
                        updateBoardClickability();
                        updateAiSuggestion();
                        
                        // Auto-play if enabled and it's black's turn
                        if (currentPlayer === BLACK && blackAutoPlay && !gameOver) {
                            setTimeout(() => {
                                makeMove(blackBestMove.r, blackBestMove.c);
                            }, 500);
                        }
                    }
                    break;
                    
                default:
                    console.log('Unknown message from Black AI:', data);
                    blackAiThinking = false;
                    updateBoardClickability();
            }
        };
    }
    
    /**
     * Set up White AI worker event listeners
     */
    function setupWhiteAIWorkerEventListeners() {
        whiteAiWorker.onmessage = function(e) {
            const data = e.data;
            
            switch(data.type) {
                case 'ini_complete':
                    console.log('White AI initialized');
                    whiteAiThinking = false;
                    updateBoardClickability();
                    
                    if (currentPlayer === WHITE && !gameOver) {
                        startWhiteAIAnalysis();
                    }
                    break;
                    
                case 'watch_complete':
                    console.log('White AI updated');
                    
                    // If there are cancel requests pending, don't start analysis
                    if (whiteAiCancelCount > 0) {
                        whiteAiCancelCount--;
                        whiteAiThinking = false;
                        console.log('White AI analysis cancelled, remaining cancels:', whiteAiCancelCount);
                    }
                    // Otherwise, if it's white's turn, start computation
                    else if (currentPlayer === WHITE && !gameOver) {
                        startWhiteAIAnalysis();
                    } else {
                        whiteAiThinking = false;
                    }
                    
                    updateBoardClickability();
                    break;
                    
                case 'starting':
                    console.log('White AI computing started');
                    whiteAiThinking = true;
                    updateBoardClickability();
                    break;
                    
                case 'decision':
                    console.log('White AI decision received', data);
                    
                    // If there are cancel requests, ignore this result
                    if (whiteAiCancelCount > 0) {
                        whiteAiCancelCount--;
                        console.log('Ignoring White AI decision due to cancellation, remaining cancels:', whiteAiCancelCount);
                    } else {
                        whiteAiThinking = false;
                        whiteBestMove = { r: data.r, c: data.c };
                        updateBoardClickability();
                        updateAiSuggestion();
                        
                        // Auto-play if enabled and it's white's turn
                        if (currentPlayer === WHITE && whiteAutoPlay && !gameOver) {
                            setTimeout(() => {
                                makeMove(whiteBestMove.r, whiteBestMove.c);
                            }, 500);
                        }
                    }
                    break;
                    
                default:
                    console.log('Unknown message from White AI:', data);
                    whiteAiThinking = false;
                    updateBoardClickability();
            }
        };
    }
    
    /**
     * Make a move at the specified position
     */
    function makeMove(r, c) {
        // Don't allow moves if the game is over or the move is invalid
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
            aiSuggestionEl.textContent = 'Game over';
            enableBoardClicks(); // Make sure board is enabled for viewing the final position
            updateUndoButtonState();
            updateAutoPlayButtons();
            return true;
        }
        
        // Check for draw
        if (moveHistory.length === BOARD_SIZE * BOARD_SIZE) {
            gameOver = true;
            statusEl.textContent = 'Game over! It\'s a draw.';
            aiSuggestionEl.textContent = 'Game over';
            enableBoardClicks(); // Make sure board is enabled for viewing the final position
            updateUndoButtonState();
            updateAutoPlayButtons();
            return true;
        }
        
        // Notify both AIs of the move - ensure consistency across both AIs
        blackAiWorker.postMessage({ 
            type: 'watch',
            r: r,
            c: c,
            color: currentPlayer
        });
        
        whiteAiWorker.postMessage({ 
            type: 'watch',
            r: r,
            c: c,
            color: currentPlayer
        });
        
        // Switch player
        currentPlayer = (currentPlayer === BLACK) ? WHITE : BLACK;
        
        // Update status
        const playerName = currentPlayer.charAt(0).toUpperCase() + currentPlayer.slice(1);
        statusEl.textContent = `${playerName}'s turn.`;
        
        // Update AI suggestion for the new current player
        updateAiSuggestion();
        
        // Update board clickability based on whose turn it is
        updateBoardClickability();
        
        return true;
    }
    
    /**
     * Check if a move is valid
     */
    function isValidMove(r, c) {
        // Check if coordinates are within bounds (0-based indexing, so 0 to BOARD_SIZE-1)
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
     * Update AI suggestion based on current player
     */
    function updateAiSuggestion() {
        if (gameOver) {
            aiSuggestionEl.textContent = 'Game over';
            board.clearSuggestion();
            return;
        }
        
        if (currentPlayer === BLACK) {
            if (blackAiThinking) {
                aiSuggestionEl.textContent = 'Black AI is analyzing...';
                board.clearSuggestion();
            } else if (blackBestMove) {
                const notation = board.coordToString(blackBestMove.r, blackBestMove.c);
                aiSuggestionEl.textContent = `Black AI suggests: ${notation}`;
                
                // Show suggestion on the board if auto play is off
                if (!blackAutoPlay) {
                    board.showSuggestion(blackBestMove.r, blackBestMove.c);
                } else {
                    board.clearSuggestion();
                }
            } else {
                aiSuggestionEl.textContent = 'Black AI is calculating...';
                board.clearSuggestion();
            }
        } else {
            if (whiteAiThinking) {
                aiSuggestionEl.textContent = 'White AI is analyzing...';
                board.clearSuggestion();
            } else if (whiteBestMove) {
                const notation = board.coordToString(whiteBestMove.r, whiteBestMove.c);
                aiSuggestionEl.textContent = `White AI suggests: ${notation}`;
                
                // Show suggestion on the board if auto play is off
                if (!whiteAutoPlay) {
                    board.showSuggestion(whiteBestMove.r, whiteBestMove.c);
                } else {
                    board.clearSuggestion();
                }
            } else {
                aiSuggestionEl.textContent = 'White AI is calculating...';
                board.clearSuggestion();
            }
        }
    }
    
    /**
     * Undo the last move
     */
    function undoMove() {
        // Don't allow undo if no moves to undo
        if (moveHistory.length === 0) return;
        
        // If either AI is thinking, increment the cancel counter
        if (blackAiThinking) {
            blackAiCancelCount++;
        }
        if (whiteAiThinking) {
            whiteAiCancelCount++;
        }
        
        // Undo the last move
        const lastMove = moveHistory.pop();
        board.unsetStone(lastMove.r, lastMove.c);
        
        // Switch back to the previous player
        currentPlayer = lastMove.color;
        
        // Update game state
        gameOver = false;
        
        // Update move history display
        updateMoveHistoryDisplay();
        
        // Update status text
        const playerName = currentPlayer.charAt(0).toUpperCase() + currentPlayer.slice(1);
        statusEl.textContent = `${playerName}'s turn.`;
        
        // Notify both AIs of the undo
        blackAiWorker.postMessage({ 
            type: 'watch',
            r: lastMove.r,
            c: lastMove.c,
            color: 'remove'
        });
        
        whiteAiWorker.postMessage({ 
            type: 'watch',
            r: lastMove.r,
            c: lastMove.c,
            color: 'remove'
        });
        
        // Highlight the new last move if there is one
        if (moveHistory.length > 0) {
            const newLastMove = moveHistory[moveHistory.length - 1];
            board.highlight(newLastMove.r, newLastMove.c);
        } else {
            // No moves left, clear any highlight
            board.clearLastMoveHighlight();
        }
        
        // Clear previous AI suggestion
        if (currentPlayer === BLACK) {
            if (moveHistory.length === 0) {
                // First move suggestion - always center for consistency
                blackBestMove = { r: 7, c: 7 };
            } else {
                blackBestMove = null;
            }
        } else {
            whiteBestMove = null;
        }
        
        // Update AI suggestion display
        updateAiSuggestion();
        
        // Update UI states
        updateBoardClickability();
        updateAutoPlayButtons();
    }
    
    /**
     * Initialize the game
     */
    function initGame() {
        // Always terminate and recreate both AI workers to ensure a clean state
        blackAiWorker.terminate();
        whiteAiWorker.terminate();
        
        blackAiWorker = new Worker('ai-worker.js');
        whiteAiWorker = new Worker('ai-worker.js');
        
        setupBlackAIWorkerEventListeners();
        setupWhiteAIWorkerEventListeners();
        
        // Reset the game state
        board.init();
        currentPlayer = BLACK;
        moveHistory = [];
        gameOver = false;
        blackAiThinking = false;
        whiteAiThinking = false;
        blackAiCancelCount = 0;
        whiteAiCancelCount = 0;
        blackBestMove = null;
        whiteBestMove = null;
        statusEl.textContent = 'Black\'s turn.';
        moveHistoryEl.textContent = '';
        aiSuggestionEl.textContent = 'Initializing AI...';
        
        // Update the AI title with difficulty level
        updateAiTitle();
        
        // Disable Make AI Move button initially
        makeMoveBtn.disabled = true;
        makeMoveBtn.classList.add('disabled');
        
        // Enable board clicks
        enableBoardClicks();
        
        // Update button states
        updateUndoButtonState();
        updateMakeMoveButtonState();
        updateAutoPlayButtons();
        
        // Initialize both AI workers
        initBlackAIWorker();
        initWhiteAIWorker();
    }
    
    /**
     * Initialize the Black AI worker with consistent settings
     */
    function initBlackAIWorker() {
        // Ensure consistent settings for all devices
        blackAiWorker.postMessage({
            type: 'ini',
            mode: 'expert', // Fixed to expert level
            color: 'black'
        });
    }
    
    /**
     * Initialize the White AI worker with consistent settings
     */
    function initWhiteAIWorker() {
        // Ensure consistent settings for all devices
        whiteAiWorker.postMessage({
            type: 'ini',
            mode: 'expert', // Fixed to expert level
            color: 'white'
        });
    }
    
    /**
     * Start Black AI analysis
     */
    function startBlackAIAnalysis() {
        if (gameOver || currentPlayer !== BLACK) {
            return;
        }
        
        if (moveHistory.length === 0) {
            // For first move, always suggest center (consistent across devices)
            blackBestMove = { r: 7, c: 7 };
            updateAiSuggestion();
            
            // Auto-play if enabled
            if (blackAutoPlay) {
                setTimeout(() => {
                    makeMove(blackBestMove.r, blackBestMove.c);
                }, 500);
            }
            return;
        }
        
        // Start computation
        blackAiThinking = true;
        updateBoardClickability();
        blackAiWorker.postMessage({ type: 'compute' });
        updateAiSuggestion();
    }
    
    /**
     * Start White AI analysis
     */
    function startWhiteAIAnalysis() {
        if (gameOver || currentPlayer !== WHITE) {
            return;
        }
        
        // Start computation
        whiteAiThinking = true;
        updateBoardClickability();
        whiteAiWorker.postMessage({ type: 'compute' });
        updateAiSuggestion();
    }
    
    /**
     * Enable board clicks
     */
    function enableBoardClicks() {
        boardClickable = true;
        $('#board').removeClass('disabled');
    }
    
    /**
     * Disable board clicks
     */
    function disableBoardClicks() {
        boardClickable = false;
        $('#board').addClass('disabled');
    }
    
    /**
     * Update board clickability based on current state
     */
    function updateBoardClickability() {
        // Determine if the board should be clickable
        const currentAiThinking = (currentPlayer === BLACK) ? blackAiThinking : whiteAiThinking;
        const currentAutoPlay = (currentPlayer === BLACK) ? blackAutoPlay : whiteAutoPlay;
        
        if (gameOver || currentAiThinking || currentAutoPlay) {
            disableBoardClicks();
        } else {
            enableBoardClicks();
        }
        
        // Update button states
        updateUndoButtonState();
        updateMakeMoveButtonState();
    }
    
    /**
     * Update the undo button state
     */
    function updateUndoButtonState() {
        if (moveHistory.length === 0) {
            undoBtn.disabled = true;
            undoBtn.classList.add('disabled');
        } else {
            undoBtn.disabled = false;
            undoBtn.classList.remove('disabled');
        }
    }
    
    /**
     * Update the make move button state
     */
    function updateMakeMoveButtonState() {
        const currentBestMove = (currentPlayer === BLACK) ? blackBestMove : whiteBestMove;
        const currentAiThinking = (currentPlayer === BLACK) ? blackAiThinking : whiteAiThinking;
        
        if (gameOver || currentAiThinking || !currentBestMove) {
            makeMoveBtn.disabled = true;
            makeMoveBtn.classList.add('disabled');
        } else {
            makeMoveBtn.disabled = false;
            makeMoveBtn.classList.remove('disabled');
        }
    }
    
    /**
     * Update auto play buttons state
     */
    function updateAutoPlayButtons() {
        // Update Black AI auto play button
        if (blackAutoPlay) {
            autoBlackBtn.textContent = "Stop Black";
            autoBlackBtn.classList.add('active');
        } else {
            autoBlackBtn.textContent = "Auto Black";
            autoBlackBtn.classList.remove('active');
        }
        
        // Update White AI auto play button
        if (whiteAutoPlay) {
            autoWhiteBtn.textContent = "Stop White";
            autoWhiteBtn.classList.add('active');
        } else {
            autoWhiteBtn.textContent = "Auto White";
            autoWhiteBtn.classList.remove('active');
        }
        
        // Disable buttons if game is over
        if (gameOver) {
            autoBlackBtn.disabled = true;
            autoWhiteBtn.disabled = true;
            autoBlackBtn.classList.add('disabled');
            autoWhiteBtn.classList.add('disabled');
        } else {
            autoBlackBtn.disabled = false;
            autoWhiteBtn.disabled = false;
            autoBlackBtn.classList.remove('disabled');
            autoWhiteBtn.classList.remove('disabled');
        }
    }
    
    /**
     * Toggle Black AI auto play
     */
    function toggleBlackAutoPlay() {
        if (gameOver) return;
        
        blackAutoPlay = !blackAutoPlay;
        updateAutoPlayButtons();
        updateBoardClickability();
        updateAiSuggestion(); // Update suggestion visibility
        
        // If it's black's turn and auto play is enabled, make the move
        if (currentPlayer === BLACK && blackAutoPlay && blackBestMove) {
            setTimeout(() => {
                makeMove(blackBestMove.r, blackBestMove.c);
            }, 500);
        }
    }
    
    /**
     * Toggle White AI auto play
     */
    function toggleWhiteAutoPlay() {
        if (gameOver) return;
        
        whiteAutoPlay = !whiteAutoPlay;
        updateAutoPlayButtons();
        updateBoardClickability();
        updateAiSuggestion(); // Update suggestion visibility
        
        // If it's white's turn and auto play is enabled, make the move
        if (currentPlayer === WHITE && whiteAutoPlay && whiteBestMove) {
            setTimeout(() => {
                makeMove(whiteBestMove.r, whiteBestMove.c);
            }, 500);
        }
    }
    
    /**
     * Make the current AI's suggested move
     */
    function makeAIMove() {
        if (gameOver) return;
        
        const currentBestMove = (currentPlayer === BLACK) ? blackBestMove : whiteBestMove;
        
        if (currentBestMove) {
            makeMove(currentBestMove.r, currentBestMove.c);
        }
    }
    
    /**
     * Handle board clicks
     */
    board.clicked = function(r, c) {
        // Only allow clicks when the board is clickable
        if (!boardClickable || gameOver) return;
        
        // Allow placing stones for both sides
        makeMove(r, c);
    };
    
    // Event listeners for buttons
    startBtn.addEventListener('click', initGame);
    undoBtn.addEventListener('click', undoMove);
    makeMoveBtn.addEventListener('click', makeAIMove);
    autoBlackBtn.addEventListener('click', toggleBlackAutoPlay);
    autoWhiteBtn.addEventListener('click', toggleWhiteAutoPlay);
    
    // Set up AI worker event listeners
    setupBlackAIWorkerEventListeners();
    setupWhiteAIWorkerEventListeners();
    
    // Initialize the game
    initGame();
    
    // Update the last modified date
    const updateDateEl = document.getElementById("update-date");
    if (updateDateEl) {
        updateDateEl.textContent = new Date(document.lastModified).toLocaleDateString();
    }
};