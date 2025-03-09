/**
 * Gomoku Game Controller
 * Updated with:
 * 1. Visual hint toggle (can be changed anytime)
 * 2. AI analysis toggle (can only be set before first move)
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
    const aiSection = document.querySelector('.ai-section');
    const undoBtn = document.getElementById('undoBtn');
    const startBtn = document.getElementById('startBtn');
    const makeMoveBtn = document.getElementById('makeMoveBtn');
    const autoBlackBtn = document.getElementById('autoBlackBtn');
    const autoWhiteBtn = document.getElementById('autoWhiteBtn');
    const toggleVisualHintBtn = document.getElementById('toggleVisualHintBtn');
    const toggleAiAnalysisBtn = document.getElementById('toggleAiAnalysisBtn');
    
    // Game state
    let currentPlayer = BLACK; // Black goes first
    let moveHistory = [];
    let gameOver = false;
    let boardClickable = true; // Flag to control board clickability
    let showVisualSuggestion = true; // Default: show visual suggestion (dashed line)
    let useAiAnalysis = true; // Default: use AI analysis
    
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
    
    // Initialize AI workers
    let blackAiWorker = new Worker('ai-worker.js');
    let whiteAiWorker = new Worker('ai-worker.js');
    
    // Predefined first moves for consistent behavior across devices
    const PREDEFINED_MOVES = {
        // Center position is always the first move for black
        "first_black": { r: 7, c: 7 }
    };
    
    /**
     * Generate a random response for White's first move based on a strategy
     * - If Black played center, choose one of the 8 surrounding positions randomly
     * - If Black didn't play center, only consider positions that are:
     *   1. Adjacent to the Black stone
     *   2. Within the rectangle defined by the Black stone and the center
     * @param {number} r - Row of the first black move
     * @param {number} c - Column of the first black move
     * @return {Object} The coordinates for white's response
     */
    function getRandomResponse(r, c) {
        const centerR = 7;
        const centerC = 7;
        
        // All possible surrounding positions to Black's stone
        const surroundingPositions = [
            {r: r-1, c: c-1}, // Northwest
            {r: r-1, c: c},   // North
            {r: r-1, c: c+1}, // Northeast
            {r: r, c: c-1},   // West
            {r: r, c: c+1},   // East
            {r: r+1, c: c-1}, // Southwest
            {r: r+1, c: c},   // South
            {r: r+1, c: c+1}  // Southeast
        ];
        
        // Filter out invalid positions (outside the board)
        const validPositions = surroundingPositions.filter(pos => 
            pos.r >= 0 && pos.r < BOARD_SIZE && 
            pos.c >= 0 && pos.c < BOARD_SIZE
        );
        
        // If Black played center, any of the 8 surrounding positions are valid
        if (r === centerR && c === centerC) {
            // Use true randomness instead of deterministic selection
            const randomIndex = Math.floor(Math.random() * validPositions.length);
            return validPositions[randomIndex];
        }
        
        // Otherwise, determine the rectangle between Black stone and center
        const minR = Math.min(r, centerR);
        const maxR = Math.max(r, centerR);
        const minC = Math.min(c, centerC);
        const maxC = Math.max(c, centerC);
        
        // Filter positions that are within the rectangle
        const positionsInRectangle = validPositions.filter(pos => 
            pos.r >= minR && pos.r <= maxR &&
            pos.c >= minC && pos.c <= maxC
        );
        
        // Use the positions in rectangle if there are any, otherwise use all valid positions
        const finalPositions = positionsInRectangle.length > 0 ? 
                               positionsInRectangle : validPositions;
        
        // Make a truly random selection
        const randomIndex = Math.floor(Math.random() * finalPositions.length);
        
        console.log("Valid positions for White's response:", finalPositions);
        console.log("Selected position:", finalPositions[randomIndex]);
        
        return finalPositions[randomIndex];
    }
    
    /**
     * Update the AI Analysis section title to include difficulty
     */
    function updateAiTitle() {
        aiSectionTitle.textContent = `AI Analysis (${aiDifficulty})`;
    }
    
    /**
     * Toggle visual AI suggestion (dashed line on board)
     * This can be changed at any time during the game
     */
    function toggleVisualHint() {
        showVisualSuggestion = !showVisualSuggestion;
        updateToggleVisualHintButton();
        
        // Update visual suggestion immediately
        if (!showVisualSuggestion) {
            board.clearSuggestion(); // Clear any visible suggestion on the board
        } else if (useAiAnalysis) {
            // Show suggestion if available and AI analysis is on
            if (currentPlayer === BLACK && blackBestMove && !blackAutoPlay) {
                board.showSuggestion(blackBestMove.r, blackBestMove.c);
            } else if (currentPlayer === WHITE && whiteBestMove && !whiteAutoPlay) {
                board.showSuggestion(whiteBestMove.r, whiteBestMove.c);
            }
        }
    }

    /**
     * Update the toggle visual hint button text based on current state
     */
    function updateToggleVisualHintButton() {
        if (showVisualSuggestion) {
            toggleVisualHintBtn.textContent = "Hide Visual Hints";
            toggleVisualHintBtn.classList.remove('active');
        } else {
            toggleVisualHintBtn.textContent = "Show Visual Hints";
            toggleVisualHintBtn.classList.add('active');
        }
    }

    /**
     * Toggle AI analysis on/off
     * Only allowed before first move is placed
     */
    function toggleAiAnalysis() {
        // Only allow toggling before first move is placed
        if (moveHistory.length > 0) {
            return;
        }
        
        useAiAnalysis = !useAiAnalysis;
        updateToggleAiAnalysisButton();
        
        // Update UI state immediately based on AI toggle
        if (useAiAnalysis) {
            // Show AI section and enable AI buttons
            aiSection.style.display = 'block';
            makeMoveBtn.disabled = false;
            makeMoveBtn.classList.remove('disabled');
            
            // Show visual suggestion if enabled
            if (showVisualSuggestion && currentPlayer === BLACK && blackBestMove) {
                board.showSuggestion(blackBestMove.r, blackBestMove.c);
            }
        } else {
            // Hide AI section and disable AI buttons
            aiSection.style.display = 'none';
            makeMoveBtn.disabled = true;
            makeMoveBtn.classList.add('disabled');
            
            // Turn off auto-play for both sides
            blackAutoPlay = false;
            whiteAutoPlay = false;
            updateAutoPlayButtons();
            
            // Clear any visual suggestion
            board.clearSuggestion();
        }
    }
    
    /**
     * Update toggle AI analysis button based on current state
     */
    function updateToggleAiAnalysisButton() {
        if (useAiAnalysis) {
            toggleAiAnalysisBtn.textContent = "Disable AI";
            toggleAiAnalysisBtn.classList.remove('active');
        } else {
            toggleAiAnalysisBtn.textContent = "Enable AI";
            toggleAiAnalysisBtn.classList.add('active');
        }
    }
    
    /**
     * Update AI toggle button state - disable after first move
     */
    function updateToggleAiAnalysisButtonState() {
        if (moveHistory.length > 0) {
            toggleAiAnalysisBtn.disabled = true;
            toggleAiAnalysisBtn.classList.add('disabled');
        } else {
            toggleAiAnalysisBtn.disabled = false;
            toggleAiAnalysisBtn.classList.remove('disabled');
        }
    }
    
    /**
     * Set up Black AI worker event listeners
     */
    function setupBlackAIWorkerEventListeners() {
        blackAiWorker.onmessage = function(e) {
            const data = e.data;
            
            // If AI analysis is disabled, ignore all AI messages
            if (!useAiAnalysis) return;
            
            switch(data.type) {
                case 'ini_complete':
                    console.log('Black AI initialized');
                    blackAiThinking = false;
                    updateBoardClickability();
                    
                    if (currentPlayer === BLACK && moveHistory.length === 0) {
                        // First move is always the center for consistency
                        blackBestMove = PREDEFINED_MOVES.first_black;
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
            
            // If AI analysis is disabled, ignore all AI messages
            if (!useAiAnalysis) return;
            
            switch(data.type) {
                case 'ini_complete':
                    console.log('White AI initialized');
                    whiteAiThinking = false;
                    updateBoardClickability();
                    
                    if (currentPlayer === WHITE && !gameOver) {
                        // If this is the first move for white (second move in the game)
                        // Use a random response based on Black's first move
                        if (moveHistory.length === 1) {
                            const firstBlackMove = moveHistory[0];
                            // Get a random response based on black's first move
                            whiteBestMove = getRandomResponse(firstBlackMove.r, firstBlackMove.c);
                            updateAiSuggestion();
                            
                            if (whiteAutoPlay && !gameOver) {
                                setTimeout(() => {
                                    makeMove(whiteBestMove.r, whiteBestMove.c);
                                }, 500);
                            }
                            return;
                        }
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
                        // If this is white's first move (2nd game move)
                        if (moveHistory.length === 1) {
                            // Use random response
                            const firstBlackMove = moveHistory[0];
                            whiteBestMove = getRandomResponse(firstBlackMove.r, firstBlackMove.c);
                            updateAiSuggestion();
                            
                            if (whiteAutoPlay && !gameOver) {
                                setTimeout(() => {
                                    makeMove(whiteBestMove.r, whiteBestMove.c);
                                }, 500);
                            }
                            whiteAiThinking = false;
                        } else {
                            startWhiteAIAnalysis();
                        }
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
        
        // Check if this is the first move, update AI analysis button state
        if (moveHistory.length === 1) {
            updateToggleAiAnalysisButtonState();
        }
        
        // Check for win
        if (checkWin(r, c, currentPlayer)) {
            gameOver = true;
            const winner = currentPlayer.charAt(0).toUpperCase() + currentPlayer.slice(1);
            statusEl.textContent = `Game over! ${winner} wins!`;
            if (useAiAnalysis) {
                aiSuggestionEl.textContent = 'Game over';
            }
            enableBoardClicks(); // Make sure board is enabled for viewing the final position
            updateUndoButtonState();
            updateAutoPlayButtons();
            return true;
        }
        
        // Check for draw
        if (moveHistory.length === BOARD_SIZE * BOARD_SIZE) {
            gameOver = true;
            statusEl.textContent = 'Game over! It\'s a draw.';
            if (useAiAnalysis) {
                aiSuggestionEl.textContent = 'Game over';
            }
            enableBoardClicks(); // Make sure board is enabled for viewing the final position
            updateUndoButtonState();
            updateAutoPlayButtons();
            return true;
        }
        
        // Only notify AI workers if AI analysis is enabled
        if (useAiAnalysis) {
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
        }
        
        // Switch player
        currentPlayer = (currentPlayer === BLACK) ? WHITE : BLACK;
        
        // Update status
        const playerName = currentPlayer.charAt(0).toUpperCase() + currentPlayer.slice(1);
        statusEl.textContent = `${playerName}'s turn.`;
        
        // Handle special cases for randomized AI behavior when AI is enabled
        if (useAiAnalysis && moveHistory.length === 1 && currentPlayer === WHITE) {
            // For white's first move, use a random response
            const firstBlackMove = moveHistory[0];
            whiteBestMove = getRandomResponse(firstBlackMove.r, firstBlackMove.c);
            updateAiSuggestion();
            
            if (whiteAutoPlay && !gameOver) {
                setTimeout(() => {
                    makeMove(whiteBestMove.r, whiteBestMove.c);
                }, 500);
            }
            return true;
        }
        
        // Update AI suggestion for the new current player (if AI is enabled)
        if (useAiAnalysis) {
            updateAiSuggestion();
        }
        
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
        // If AI analysis is disabled or game is over, clear suggestion and return
        if (!useAiAnalysis || gameOver) {
            board.clearSuggestion();
            if (gameOver && useAiAnalysis) {
                aiSuggestionEl.textContent = 'Game over';
            }
            return;
        }
        
        if (currentPlayer === BLACK) {
            if (blackAiThinking) {
                aiSuggestionEl.textContent = 'Black AI is analyzing...';
                board.clearSuggestion();
            } else if (blackBestMove) {
                const notation = board.coordToString(blackBestMove.r, blackBestMove.c);
                aiSuggestionEl.textContent = `Black AI suggests: ${notation}`;
                
                // Show suggestion on the board if auto play is off AND visual hints are enabled
                if (!blackAutoPlay && showVisualSuggestion) {
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
                
                // Show suggestion on the board if auto play is off AND visual hints are enabled
                if (!whiteAutoPlay && showVisualSuggestion) {
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
        
        // If AI analysis is enabled and AI is thinking, cancel it
        if (useAiAnalysis) {
            if (blackAiThinking) {
                blackAiCancelCount++;
            }
            if (whiteAiThinking) {
                whiteAiCancelCount++;
            }
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
        
        // If AI analysis is enabled, notify AI workers
        if (useAiAnalysis) {
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
        }
        
        // Highlight the new last move if there is one
        if (moveHistory.length > 0) {
            const newLastMove = moveHistory[moveHistory.length - 1];
            board.highlight(newLastMove.r, newLastMove.c);
        } else {
            // No moves left, clear any highlight
            board.clearLastMoveHighlight();
        }
        
        // If AI analysis is enabled, update suggestions
        if (useAiAnalysis) {
            // Clear previous AI suggestion and set appropriate suggestion
            if (currentPlayer === BLACK) {
                if (moveHistory.length === 0) {
                    // First move suggestion - always center for consistency
                    blackBestMove = PREDEFINED_MOVES.first_black;
                } else {
                    blackBestMove = null;
                }
            } else {
                // For white's first move, generate random response
                if (moveHistory.length === 1) {
                    const firstBlackMove = moveHistory[0];
                    whiteBestMove = getRandomResponse(firstBlackMove.r, firstBlackMove.c);
                } else {
                    whiteBestMove = null;
                }
            }
            
            // Update AI suggestion display
            updateAiSuggestion();
        }
        
        // Update UI states
        updateBoardClickability();
        updateAutoPlayButtons();
        updateToggleAiAnalysisButtonState();
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
        
        // Reset toggleable options to default
        showVisualSuggestion = true;
        useAiAnalysis = true;
        updateToggleVisualHintButton();
        updateToggleAiAnalysisButton();
        updateToggleAiAnalysisButtonState();
        
        // Show AI section by default
        aiSection.style.display = 'block';
        
        // Set initial suggestions for consistency
        blackBestMove = PREDEFINED_MOVES.first_black;
        whiteBestMove = null;
        
        statusEl.textContent = 'Black\'s turn.';
        moveHistoryEl.textContent = '';
        aiSuggestionEl.textContent = 'Initializing AI...';
        
        // Update the AI title with difficulty level
        updateAiTitle();
        
        // Reset auto-play states
        blackAutoPlay = false;
        whiteAutoPlay = false;
        
        // Disable Make AI Move button initially
        makeMoveBtn.disabled = true;
        makeMoveBtn.classList.add('disabled');
        
        // Enable board clicks
        enableBoardClicks();
        
        // Update button states
        updateUndoButtonState();
        updateMakeMoveButtonState();
        updateAutoPlayButtons();
        
        // Initialize both AI workers if AI analysis is enabled
        if (useAiAnalysis) {
            initBlackAIWorker();
            initWhiteAIWorker();
        }
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
        // If AI analysis is disabled or game is over, do nothing
        if (!useAiAnalysis || gameOver || currentPlayer !== BLACK) {
            return;
        }
        
        if (moveHistory.length === 0) {
            // For first move, always suggest center (consistent across devices)
            blackBestMove = PREDEFINED_MOVES.first_black;
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
        // If AI analysis is disabled or game is over, do nothing
        if (!useAiAnalysis || gameOver || currentPlayer !== WHITE) {
            return;
        }
        
        // Check for special case - white's first move after black center
        if (moveHistory.length === 1) {
            const firstBlackMove = moveHistory[0];
            whiteBestMove = getRandomResponse(firstBlackMove.r, firstBlackMove.c);
            updateAiSuggestion();
            
            // Auto-play if enabled
            if (whiteAutoPlay) {
                setTimeout(() => {
                    makeMove(whiteBestMove.r, whiteBestMove.c);
                }, 500);
            }
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
        // If AI analysis is disabled, enable board clicks unless game is over
        if (!useAiAnalysis) {
            if (gameOver) {
                disableBoardClicks();
            } else {
                enableBoardClicks();
            }
            return;
        }

        // With AI analysis enabled, determine if the board should be clickable
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
        // If AI analysis is disabled, disable the make move button
        if (!useAiAnalysis) {
            makeMoveBtn.disabled = true;
            makeMoveBtn.classList.add('disabled');
            return;
        }

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
        // If AI analysis is disabled, disable auto play buttons
        if (!useAiAnalysis) {
            autoBlackBtn.disabled = true;
            autoWhiteBtn.disabled = true;
            autoBlackBtn.classList.add('disabled');
            autoWhiteBtn.classList.add('disabled');
            return;
        }

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
        // If AI analysis is disabled or game is over, do nothing
        if (!useAiAnalysis || gameOver) return;
        
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
        // If AI analysis is disabled or game is over, do nothing
        if (!useAiAnalysis || gameOver) return;
        
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
        // If AI analysis is disabled or game is over, do nothing
        if (!useAiAnalysis || gameOver) return;
        
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
    toggleVisualHintBtn.addEventListener('click', toggleVisualHint);
    toggleAiAnalysisBtn.addEventListener('click', toggleAiAnalysis);
    
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