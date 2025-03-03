/**
 * Improved Gomoku AI Implementation
 * Fixed random move suggestions
 */
class GomokuAI {
    constructor() {
        // Set fixed difficulty parameters
        this.maxDepth = 5;        // Medium depth
        this.movesToAnalyze = [12, 8]; // From original algorithm
        
        // Board size (standard Gomoku is 15x15)
        this.boardSize = 15;
        
        // Constants for board representation
        this.EMPTY = 0;
        this.BLACK = 1;
        this.WHITE = 2;
        
        // Pattern scoring values (from strongest to weakest)
        this.scores = {
            five: 100000000000,      // Five in a row (win)
            openFour: 1000000,       // Four in a row with open ends (virtual win)
            blockedFour: 10000,      // Four in a row with one end blocked
            openThree: 5000,         // Three in a row with open ends
            blockedThree: 100,       // Three in a row with one end blocked
            openTwo: 10,             // Two in a row with open ends
            blockedTwo: 1,           // Two in a row with one end blocked
            one: 0.1                 // Single stone
        };
        
        // Cache for evaluated positions to improve performance
        this.transpositionTable = {};
        
        // Directions to check: horizontal, vertical, diagonal, anti-diagonal
        this.directions = [
            [0, 1],  // horizontal
            [1, 0],  // vertical
            [1, 1],  // diagonal
            [1, -1]  // anti-diagonal
        ];
        
        // Keep track of computation state
        this.isComputing = false;
        this.cancelComputation = false;
    }
    
    /**
     * Find the best move for the current board state
     * @param {Object} boardState - Object with 'black' and 'white' arrays of stone positions
     * @param {string} currentPlayer - Player to move ('black' or 'white')
     * @returns {Object} - Best move {r, c, score}
     */
    findBestMove(boardState, currentPlayer) {
        this.isComputing = true;
        this.cancelComputation = false;
        
        // Clear cache for new evaluation
        this.transpositionTable = {};
        
        // Create a board representation from the boardState
        const board = this.createBoard(boardState);
        
        // Get all valid moves
        const validMoves = this.getValidMoves(board);
        
        // If no valid moves, return null
        if (validMoves.length === 0) {
            this.isComputing = false;
            return null;
        }
        
        // For first move or second move, play near the center
        const totalStones = (boardState.black ? boardState.black.length : 0) + 
                           (boardState.white ? boardState.white.length : 0);
        
        if (totalStones === 0) {
            // First move - play center
            this.isComputing = false;
            return { r: 7, c: 7, score: 0 };
        } else if (totalStones === 1) {
            // Second move - play near center 
            const center = 7;
            this.isComputing = false;
            
            // Check if center is taken, if so play adjacent to center
            if (board[center][center] !== this.EMPTY) {
                const adjacentMoves = [
                    {r: center-1, c: center},
                    {r: center+1, c: center},
                    {r: center, c: center-1},
                    {r: center, c: center+1}
                ];
                // Return first valid adjacent move
                for (const move of adjacentMoves) {
                    if (move.r >= 0 && move.r < this.boardSize && 
                        move.c >= 0 && move.c < this.boardSize &&
                        board[move.r][move.c] === this.EMPTY) {
                        return { r: move.r, c: move.c, score: 0 };
                    }
                }
            }
            
            return { r: center, c: center, score: 0 };
        }
        
        // Enhanced check for immediate winning or forced moves
        const criticalMove = this.checkForCriticalMove(board, currentPlayer);
        if (criticalMove) {
            this.isComputing = false;
            return criticalMove;
        }
        
        // Get the player's numerical value
        const playerValue = (currentPlayer === 'black') ? this.BLACK : this.WHITE;
        
        // Get promising moves to evaluate
        const promisingMoves = this.getPromisingMoves(board, validMoves, currentPlayer);
        
        // Log promising moves to debug - make sure there's at least one
        // console.log("Promising moves: ", promisingMoves.length);
        
        // Evaluate each promising move
        let bestMove = null;
        let bestScore = -Infinity;
        
        for (const move of promisingMoves) {
            if (this.cancelComputation) {
                this.isComputing = false;
                return bestMove || promisingMoves[0];
            }
            
            // Make the move on the board
            board[move.r][move.c] = playerValue;
            
            // Get score from negamax
            const opponentColor = (currentPlayer === 'black') ? 'white' : 'black';
            const score = -this.negamax(
                board, 
                this.maxDepth - 1, 
                -Infinity, 
                Infinity, 
                opponentColor
            );
            
            // Undo the move
            board[move.r][move.c] = this.EMPTY;
            
            // Update best move if needed
            if (score > bestScore) {
                bestScore = score;
                bestMove = { 
                    r: move.r, 
                    c: move.c, 
                    score: score,
                    isRandom: false // explicitly mark as not random
                };
            }
        }
        
        // Safety check - if something went wrong and we didn't find a move,
        // find any valid move but mark it as random
        if (!bestMove && validMoves.length > 0) {
            // Prioritize center and moves near existing stones
            const scoredValidMoves = validMoves.map(move => {
                // Score based on distance to center
                const centerDist = Math.abs(move.r - 7) + Math.abs(move.c - 7);
                let score = this.boardSize - centerDist;
                
                // Add score for proximity to existing stones
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        if (dr === 0 && dc === 0) continue;
                        
                        const nr = move.r + dr;
                        const nc = move.c + dc;
                        
                        if (nr >= 0 && nr < this.boardSize && nc >= 0 && nc < this.boardSize &&
                            board[nr][nc] !== this.EMPTY) {
                            score += 5;
                        }
                    }
                }
                
                return { ...move, score };
            });
            
            // Sort by score
            scoredValidMoves.sort((a, b) => b.score - a.score);
            
            // Take the best scored move
            bestMove = { 
                r: scoredValidMoves[0].r, 
                c: scoredValidMoves[0].c, 
                score: 0,
                isRandom: true // mark that this is a fallback random move
            };
        }
        
        this.isComputing = false;
        return bestMove;
    }
    
    /**
     * Enhanced check for critical moves (winning moves and forced defense)
     * This checks for more patterns like open-four which are virtually winning
     */
    checkForCriticalMove(board, currentPlayer) {
        const playerValue = (currentPlayer === 'black') ? this.BLACK : this.WHITE;
        const opponentValue = (currentPlayer === 'black') ? this.WHITE : this.BLACK;
        
        // First, check if we can win in one move (five in a row)
        for (let r = 0; r < this.boardSize; r++) {
            for (let c = 0; c < this.boardSize; c++) {
                if (board[r][c] === this.EMPTY) {
                    // Check if this move would win
                    board[r][c] = playerValue;
                    if (this.checkWin(board, r, c)) {
                        board[r][c] = this.EMPTY;
                        return { r, c, score: Infinity, isWinningMove: true, isRandom: false };
                    }
                    board[r][c] = this.EMPTY;
                }
            }
        }
        
        // Check if opponent has a winning move that we must block
        for (let r = 0; r < this.boardSize; r++) {
            for (let c = 0; c < this.boardSize; c++) {
                if (board[r][c] === this.EMPTY) {
                    // Check if opponent would win with this move
                    board[r][c] = opponentValue;
                    if (this.checkWin(board, r, c)) {
                        board[r][c] = this.EMPTY;
                        return { r, c, score: this.scores.five / 2, isForcedMove: true, isRandom: false };
                    }
                    board[r][c] = this.EMPTY;
                }
            }
        }
        
        // Check for open four (virtual win) for the current player
        for (let r = 0; r < this.boardSize; r++) {
            for (let c = 0; c < this.boardSize; c++) {
                if (board[r][c] === this.EMPTY) {
                    board[r][c] = playerValue;
                    const openFour = this.hasOpenFour(board, r, c, playerValue);
                    if (openFour) {
                        board[r][c] = this.EMPTY;
                        return { r, c, score: this.scores.openFour, isOpenFour: true, isRandom: false };
                    }
                    board[r][c] = this.EMPTY;
                }
            }
        }
        
        // Check if opponent would create an open four - must block
        for (let r = 0; r < this.boardSize; r++) {
            for (let c = 0; c < this.boardSize; c++) {
                if (board[r][c] === this.EMPTY) {
                    board[r][c] = opponentValue;
                    const openFour = this.hasOpenFour(board, r, c, opponentValue);
                    if (openFour) {
                        board[r][c] = this.EMPTY;
                        return { r, c, score: this.scores.openFour / 2, isBlockingOpenFour: true, isRandom: false };
                    }
                    board[r][c] = this.EMPTY;
                }
            }
        }
        
        // Check for creating multiple open threes (strong move)
        for (let r = 0; r < this.boardSize; r++) {
            for (let c = 0; c < this.boardSize; c++) {
                if (board[r][c] === this.EMPTY) {
                    board[r][c] = playerValue;
                    const openThrees = this.countOpenThrees(board, r, c, playerValue);
                    if (openThrees >= 2) {
                        board[r][c] = this.EMPTY;
                        return { 
                            r, c, 
                            score: this.scores.openThree * 2,
                            isMultipleOpenThrees: true,
                            openThreeCount: openThrees,
                            isRandom: false
                        };
                    }
                    board[r][c] = this.EMPTY;
                }
            }
        }
        
        // Check if opponent can create multiple open threes
        for (let r = 0; r < this.boardSize; r++) {
            for (let c = 0; c < this.boardSize; c++) {
                if (board[r][c] === this.EMPTY) {
                    board[r][c] = opponentValue;
                    const openThrees = this.countOpenThrees(board, r, c, opponentValue);
                    if (openThrees >= 2) {
                        board[r][c] = this.EMPTY;
                        return { 
                            r, c, 
                            score: this.scores.openThree,
                            isBlockingMultipleOpenThrees: true,
                            isRandom: false
                        };
                    }
                    board[r][c] = this.EMPTY;
                }
            }
        }
        
        // Check for creating a single open three
        for (let r = 0; r < this.boardSize; r++) {
            for (let c = 0; c < this.boardSize; c++) {
                if (board[r][c] === this.EMPTY) {
                    board[r][c] = playerValue;
                    const hasOpenThree = this.hasOpenThree(board, r, c, playerValue);
                    if (hasOpenThree) {
                        board[r][c] = this.EMPTY;
                        return { r, c, score: this.scores.openThree, isOpenThree: true, isRandom: false };
                    }
                    board[r][c] = this.EMPTY;
                }
            }
        }
        
        return null;
    }
    
    /**
     * Check if a position has an open four (four with both ends open)
     * This is a virtual win as the opponent can't block both sides
     */
    hasOpenFour(board, r, c, playerValue) {
        if (board[r][c] !== playerValue) return false;
        
        for (const [dr, dc] of this.directions) {
            const counts = this.countConsecutiveWithOpenness(board, r, c, dr, dc, playerValue);
            
            if (counts.consecutive === 4 && counts.openEnds === 2) {
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * Check if a position has an open three (three with both ends open)
     */
    hasOpenThree(board, r, c, playerValue) {
        if (board[r][c] !== playerValue) return false;
        
        for (const [dr, dc] of this.directions) {
            const counts = this.countConsecutiveWithOpenness(board, r, c, dr, dc, playerValue);
            
            if (counts.consecutive === 3 && counts.openEnds === 2) {
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * Count the number of open threes that would be created by a move
     */
    countOpenThrees(board, r, c, playerValue) {
        if (board[r][c] !== playerValue) return 0;
        
        let count = 0;
        
        for (const [dr, dc] of this.directions) {
            const counts = this.countConsecutiveWithOpenness(board, r, c, dr, dc, playerValue);
            
            if (counts.consecutive === 3 && counts.openEnds === 2) {
                count++;
            }
        }
        
        return count;
    }
    
    /**
     * Create a simple board array from boardState
     */
    createBoard(boardState) {
        // Initialize empty board
        const board = Array(this.boardSize).fill().map(() => Array(this.boardSize).fill(this.EMPTY));
        
        // Place black stones
        if (boardState.black && Array.isArray(boardState.black)) {
            for (const [r, c] of boardState.black) {
                if (r >= 0 && r < this.boardSize && c >= 0 && c < this.boardSize) {
                    board[r][c] = this.BLACK;
                }
            }
        }
        
        // Place white stones
        if (boardState.white && Array.isArray(boardState.white)) {
            for (const [r, c] of boardState.white) {
                if (r >= 0 && r < this.boardSize && c >= 0 && c < this.boardSize) {
                    board[r][c] = this.WHITE;
                }
            }
        }
        
        return board;
    }
    
    /**
     * Get all possible valid moves (empty spaces)
     */
    getValidMoves(board) {
        const moves = [];
        
        for (let r = 0; r < this.boardSize; r++) {
            for (let c = 0; c < this.boardSize; c++) {
                if (board[r][c] === this.EMPTY) {
                    moves.push({ r, c });
                }
            }
        }
        
        return moves;
    }
    
    /**
     * Filter to get promising moves for better efficiency
     * Focuses on moves near existing stones (based on original algorithm)
     */
    getPromisingMoves(board, allMoves, currentPlayer) {
        // If no stones on board yet, return center position
        const hasStones = this.hasAnyStones(board);
        if (!hasStones) {
            return [{ r: 7, c: 7 }];
        }
        
        // Score each move based on proximity and pattern formation
        const scoredMoves = allMoves.map(move => {
            const score = this.evaluateMovePromise(board, move.r, move.c, currentPlayer);
            return { ...move, score };
        });
        
        // Sort by score in descending order
        scoredMoves.sort((a, b) => b.score - a.score);
        
        // Filter out moves with very low scores that are likely not promising
        // This helps avoid random moves being considered
        const threshold = scoredMoves[0].score / 100; // 1% of best move score
        const filteredMoves = scoredMoves.filter(move => move.score > threshold);
        
        // Get number of moves to consider from difficulty level
        const playerIndex = (currentPlayer === 'black') ? 0 : 1;
        const numMovesToConsider = Math.min(filteredMoves.length, this.movesToAnalyze[playerIndex]);
        
        // Return top moves based on difficulty level
        return filteredMoves.slice(0, numMovesToConsider);
    }
    
    /**
     * Check if there are any stones on the board
     */
    hasAnyStones(board) {
        for (let r = 0; r < this.boardSize; r++) {
            for (let c = 0; c < this.boardSize; c++) {
                if (board[r][c] !== this.EMPTY) {
                    return true;
                }
            }
        }
        return false;
    }
    
    /**
     * Evaluate how promising a move is without deep search
     */
    evaluateMovePromise(board, r, c, currentPlayer) {
        const playerValue = (currentPlayer === 'black') ? this.BLACK : this.WHITE;
        const opponentValue = (currentPlayer === 'black') ? this.WHITE : this.BLACK;
        
        // Skip if not empty
        if (board[r][c] !== this.EMPTY) {
            return -Infinity;
        }
        
        // Base score
        let score = 0;
        
        // Check for immediate win if this move is made
        board[r][c] = playerValue;
        if (this.checkWin(board, r, c)) {
            board[r][c] = this.EMPTY;
            return Infinity;
        }
        
        // Check for blocking opponent's win
        board[r][c] = opponentValue;
        if (this.checkWin(board, r, c)) {
            board[r][c] = this.EMPTY;
            return this.scores.five * 0.9; // High priority but not as high as winning
        }
        
        // Check for creating an open four (virtually winning)
        board[r][c] = playerValue;
        if (this.hasOpenFour(board, r, c, playerValue)) {
            board[r][c] = this.EMPTY;
            return this.scores.openFour;
        }
        
        // Check for blocking opponent's open four
        board[r][c] = opponentValue;
        if (this.hasOpenFour(board, r, c, opponentValue)) {
            board[r][c] = this.EMPTY;
            return this.scores.openFour * 0.9;
        }
        
        // Check for creating open threes
        board[r][c] = playerValue;
        const openThreeCount = this.countOpenThrees(board, r, c, playerValue);
        if (openThreeCount > 0) {
            const threeScore = this.scores.openThree * (1 + (openThreeCount - 1) * 2);
            board[r][c] = this.EMPTY;
            return threeScore;
        }
        
        // Check for blocking opponent's open threes
        board[r][c] = opponentValue;
        const opponentOpenThreeCount = this.countOpenThrees(board, r, c, opponentValue);
        if (opponentOpenThreeCount > 0) {
            const blockScore = this.scores.openThree * 0.8 * (1 + (opponentOpenThreeCount - 1) * 2);
            board[r][c] = this.EMPTY;
            return blockScore;
        }
        
        // Reset the cell
        board[r][c] = this.EMPTY;
        
        // Check proximity to existing stones (favor moves near other stones)
        // Use larger radius for early game
        const radius = (this.countStones(board) < 10) ? 3 : 2;
        let hasAdjacentStone = false;
        
        for (let dr = -radius; dr <= radius; dr++) {
            for (let dc = -radius; dc <= radius; dc++) {
                if (dr === 0 && dc === 0) continue;
                
                const nr = r + dr;
                const nc = c + dc;
                
                if (nr >= 0 && nr < this.boardSize && nc >= 0 && nc < this.boardSize) {
                    // Add score for proximity to any stone, with higher score for closer stones
                    if (board[nr][nc] !== this.EMPTY) {
                        const distance = Math.max(Math.abs(dr), Math.abs(dc));
                        score += (radius + 1 - distance) * 10;
                        
                        if (distance === 1) {
                            hasAdjacentStone = true;
                        }
                    }
                    
                    // Add bonus for proximity to own stones
                    if (board[nr][nc] === playerValue) {
                        const distance = Math.max(Math.abs(dr), Math.abs(dc));
                        score += (radius + 1 - distance) * 5;
                    }
                }
            }
        }
        
        // Only consider moves that are adjacent to at least one stone in mid/late game
        if (this.countStones(board) >= 10 && !hasAdjacentStone) {
            return 0; // Not promising in mid/late game if not adjacent to any stone
        }
        
        // Evaluate patterns that could be formed
        board[r][c] = playerValue;
        score += this.evaluatePatterns(board, r, c, playerValue) * 0.8;  // Own patterns
        board[r][c] = opponentValue;
        score += this.evaluatePatterns(board, r, c, opponentValue) * 0.6;  // Blocking opponent
        board[r][c] = this.EMPTY;
        
        // Slightly favor center positions
        const centerDist = Math.abs(r - this.boardSize/2) + Math.abs(c - this.boardSize/2);
        score += Math.max(0, (this.boardSize - centerDist) * 2);
        
        return score;
    }
    
    /**
     * Count total stones on the board
     */
    countStones(board) {
        let count = 0;
        for (let r = 0; r < this.boardSize; r++) {
            for (let c = 0; c < this.boardSize; c++) {
                if (board[r][c] !== this.EMPTY) {
                    count++;
                }
            }
        }
        return count;
    }
    
    /**
     * Negamax algorithm with alpha-beta pruning
     */
    negamax(board, depth, alpha, beta, playerColor) {
        if (this.cancelComputation) {
            return 0; // Early termination if computation is cancelled
        }
        
        const playerValue = (playerColor === 'black') ? this.BLACK : this.WHITE;
        
        // Check for win conditions (terminal states)
        for (let r = 0; r < this.boardSize; r++) {
            for (let c = 0; c < this.boardSize; c++) {
                if (board[r][c] !== this.EMPTY) {
                    // Check for winning position
                    if (this.checkWin(board, r, c)) {
                        // If the winner is the current player, return a high positive score
                        // Otherwise, return a high negative score
                        return board[r][c] === playerValue ? this.scores.five : -this.scores.five;
                    }
                    
                    // Check for open four (virtually winning)
                    if (this.hasOpenFour(board, r, c, board[r][c])) {
                        return board[r][c] === playerValue ? this.scores.openFour : -this.scores.openFour;
                    }
                }
            }
        }
        
        // If max depth reached or board is full, evaluate the position
        if (depth === 0 || this.isBoardFull(board)) {
            return this.evaluatePosition(board, playerColor);
        }
        
        // Get valid moves
        const validMoves = this.getValidMoves(board);
        
        // If no moves, it's a draw
        if (validMoves.length === 0) {
            return 0;
        }
        
        // Get promising moves only
        const promisingMoves = this.getPromisingMoves(board, validMoves, playerColor);
        
        let maxScore = -Infinity;
        
        for (const move of promisingMoves) {
            if (this.cancelComputation) {
                return 0; // Early termination if computation is cancelled
            }
            
            // Make the move
            board[move.r][move.c] = playerValue;
            
            // Recursive negamax call
            const nextPlayer = (playerColor === 'black') ? 'white' : 'black';
            const score = -this.negamax(
                board, 
                depth - 1, 
                -beta, 
                -alpha, 
                nextPlayer
            );
            
            // Undo the move
            board[move.r][move.c] = this.EMPTY;
            
            // Update max score
            maxScore = Math.max(maxScore, score);
            
            // Alpha-beta pruning
            alpha = Math.max(alpha, score);
            if (alpha >= beta) {
                break;
            }
        }
        
        return maxScore;
    }
    
    /**
     * Check if board is full (no empty spaces)
     */
    isBoardFull(board) {
        for (let r = 0; r < this.boardSize; r++) {
            for (let c = 0; c < this.boardSize; c++) {
                if (board[r][c] === this.EMPTY) {
                    return false;
                }
            }
        }
        return true;
    }
    
    /**
     * Check if a move creates a win (5-in-a-row)
     */
    checkWin(board, r, c) {
        const playerValue = board[r][c];
        if (playerValue === this.EMPTY) return false;
        
        for (const [dr, dc] of this.directions) {
            let count = 1;  // Start with 1 for the current stone
            
            // Check in the positive direction
            for (let i = 1; i < 5; i++) {
                const nr = r + i * dr;
                const nc = c + i * dc;
                
                if (nr < 0 || nr >= this.boardSize || nc < 0 || nc >= this.boardSize ||
                    board[nr][nc] !== playerValue) {
                    break;
                }
                count++;
            }
            
            // Check in the negative direction
            for (let i = 1; i < 5; i++) {
                const nr = r - i * dr;
                const nc = c - i * dc;
                
                if (nr < 0 || nr >= this.boardSize || nc < 0 || nc >= this.boardSize ||
                    board[nr][nc] !== playerValue) {
                    break;
                }
                count++;
            }
            
            if (count >= 5) {
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * Evaluate current position for the given player
     */
    evaluatePosition(board, playerColor) {
        const playerValue = (playerColor === 'black') ? this.BLACK : this.WHITE;
        const opponentValue = (playerColor === 'black') ? this.WHITE : this.BLACK;
        
        let playerScore = this.evaluateForPlayer(board, playerValue);
        let opponentScore = this.evaluateForPlayer(board, opponentValue);
        
        // Return position value from current player's perspective
        return playerScore - opponentScore;
    }
    
    /**
     * Evaluate board position for a specific player
     */
    evaluateForPlayer(board, playerValue) {
        let score = 0;
        
        // Check for patterns
        for (let r = 0; r < this.boardSize; r++) {
            for (let c = 0; c < this.boardSize; c++) {
                if (board[r][c] === playerValue) {
                    score += this.evaluatePatterns(board, r, c, playerValue);
                }
            }
        }
        
        return score;
    }
    
    /**
     * Evaluate patterns from a specific stone
     */
    evaluatePatterns(board, r, c, playerValue) {
        let score = 0;
        
        for (const [dr, dc] of this.directions) {
            // Count stones and check openness in each direction
            const counts = this.countConsecutiveWithOpenness(board, r, c, dr, dc, playerValue);
            
            // Assign scores based on pattern
            if (counts.consecutive >= 5) {
                score += this.scores.five;
            } else if (counts.consecutive === 4) {
                if (counts.openEnds === 2) {
                    score += this.scores.openFour;
                } else if (counts.openEnds === 1) {
                    score += this.scores.blockedFour;
                }
            } else if (counts.consecutive === 3) {
                if (counts.openEnds === 2) {
                    score += this.scores.openThree;
                } else if (counts.openEnds === 1) {
                    score += this.scores.blockedThree;
                }
            } else if (counts.consecutive === 2) {
                if (counts.openEnds === 2) {
                    score += this.scores.openTwo;
                } else if (counts.openEnds === 1) {
                    score += this.scores.blockedTwo;
                }
            } else if (counts.consecutive === 1) {
                score += this.scores.one;
            }
        }
        
        return score;
    }
    
    /**
     * Enhanced version of countConsecutive that also checks if both ends are open
     */
    countConsecutiveWithOpenness(board, r, c, dr, dc, playerValue) {
        let consecutive = 1;  // Starting with this stone
        let openEnds = 0;
        
        // Check positive direction
        let posR = r + dr;
        let posC = c + dc;
        while (posR >= 0 && posR < this.boardSize && posC >= 0 && posC < this.boardSize && 
               board[posR][posC] === playerValue) {
            consecutive++;
            posR += dr;
            posC += dc;
        }
        
        // Check if that end is open
        if (posR >= 0 && posR < this.boardSize && posC >= 0 && posC < this.boardSize && 
            board[posR][posC] === this.EMPTY) {
            openEnds++;
        }
        
        // Check negative direction
        let negR = r - dr;
        let negC = c - dc;
        while (negR >= 0 && negR < this.boardSize && negC >= 0 && negC < this.boardSize && 
               board[negR][negC] === playerValue) {
            consecutive++;
            negR -= dr;
            negC -= dc;
        }
        
        // Check if that end is open
        if (negR >= 0 && negR < this.boardSize && negC >= 0 && negC < this.boardSize && 
            board[negR][negC] === this.EMPTY) {
            openEnds++;
        }
        
        return { consecutive, openEnds };
    }
    
    /**
     * Cancel the current computation
     */
    cancelSearch() {
        this.cancelComputation = true;
    }
    
    /**
     * Check if the position has any critical patterns that determine the outcome
     * Used for more accurate win probability
     */
    hasCriticalPattern(board, playerValue) {
        // Check for five in a row (win)
        for (let r = 0; r < this.boardSize; r++) {
            for (let c = 0; c < this.boardSize; c++) {
                if (board[r][c] === playerValue && this.checkWin(board, r, c)) {
                    return { type: 'win', player: playerValue === this.BLACK ? 'black' : 'white' };
                }
            }
        }
        
        // Check for open four (virtually winning)
        for (let r = 0; r < this.boardSize; r++) {
            for (let c = 0; c < this.boardSize; c++) {
                if (board[r][c] === playerValue && this.hasOpenFour(board, r, c, playerValue)) {
                    return { type: 'openFour', player: playerValue === this.BLACK ? 'black' : 'white' };
                }
            }
        }
        
        return null;
    }
    
    /**
     * Evaluate win probability for each side with improved accuracy
     */
    evaluateWinProbability(boardState, currentPlayer) {
        const board = this.createBoard(boardState);
        
        // Check for definitive patterns first (exact win/loss situations)
        const blackPattern = this.hasCriticalPattern(board, this.BLACK);
        if (blackPattern && blackPattern.type === 'win') {
            return { black: 1, white: 0 };
        }
        
        const whitePattern = this.hasCriticalPattern(board, this.WHITE);
        if (whitePattern && whitePattern.type === 'win') {
            return { black: 0, white: 1 };
        }
        
        // Check for open four (virtually winning) for black
        if (blackPattern && blackPattern.type === 'openFour') {
            // Black has an open four - virtually winning unless White has a winning move
            if (whitePattern && whitePattern.type === 'win') {
                return { black: 0, white: 1 }; // White can win immediately
            }
            // Check if white is to move and can create a five-in-a-row immediately
            if (currentPlayer === 'white') {
                for (let r = 0; r < this.boardSize; r++) {
                    for (let c = 0; c < this.boardSize; c++) {
                        if (board[r][c] === this.EMPTY) {
                            board[r][c] = this.WHITE;
                            if (this.checkWin(board, r, c)) {
                                board[r][c] = this.EMPTY;
                                return { black: 0, white: 1 }; // White can win immediately
                            }
                            board[r][c] = this.EMPTY;
                        }
                    }
                }
            }
            return { black: 0.95, white: 0.05 }; // Black has a virtual win
        }
        
        // Check for open four (virtually winning) for white
        if (whitePattern && whitePattern.type === 'openFour') {
            // White has an open four - virtually winning unless Black has a winning move
            if (blackPattern && blackPattern.type === 'win') {
                return { black: 1, white: 0 }; // Black can win immediately
            }
            // Check if black is to move and can create a five-in-a-row immediately
            if (currentPlayer === 'black') {
                for (let r = 0; r < this.boardSize; r++) {
                    for (let c = 0; c < this.boardSize; c++) {
                        if (board[r][c] === this.EMPTY) {
                            board[r][c] = this.BLACK;
                            if (this.checkWin(board, r, c)) {
                                board[r][c] = this.EMPTY;
                                return { black: 1, white: 0 }; // Black can win immediately
                            }
                            board[r][c] = this.EMPTY;
                        }
                    }
                }
            }
            return { black: 0.05, white: 0.95 }; // White has a virtual win
        }
        
        // Check for draw
        if (this.isBoardFull(board)) {
            return { black: 0.5, white: 0.5 };
        }
        
        // Get position evaluation with more weight on patterns
        const blackEval = this.evaluateForPlayer(board, this.BLACK);
        const whiteEval = this.evaluateForPlayer(board, this.WHITE);
        
        // Calculate stone count advantage
        const blackStones = boardState.black ? boardState.black.length : 0;
        const whiteStones = boardState.white ? boardState.white.length : 0;
        const stoneAdvantage = (blackStones > whiteStones) ? 
            Math.min(0.1, (blackStones - whiteStones) * 0.02) : 
            Math.min(0.1, (whiteStones - blackStones) * 0.02);
        
        // Adjust based on who's to move
        const moveAdvantage = 0.05; // Small advantage for having the move
        const blackAdjustment = currentPlayer === 'black' ? moveAdvantage : 0;
        const whiteAdjustment = currentPlayer === 'white' ? moveAdvantage : 0;
        
        // Use softmax with better temperature scaling for more realistic probabilities
        const temperature = Math.max(1000, Math.abs(blackEval) + Math.abs(whiteEval)); 
        
        // Add stone advantage to evaluation
        const adjustedBlackEval = blackEval + (blackStones > whiteStones ? stoneAdvantage * temperature : 0) + blackAdjustment * temperature;
        const adjustedWhiteEval = whiteEval + (whiteStones > blackStones ? stoneAdvantage * temperature : 0) + whiteAdjustment * temperature;
        
        const blackExp = Math.exp(adjustedBlackEval / temperature);
        const whiteExp = Math.exp(adjustedWhiteEval / temperature);
        const sumExp = blackExp + whiteExp;
        
        if (sumExp === 0) {
            return { black: 0.5, white: 0.5 };
        }
        
        // Calculate probability with reasonable bounds
        let blackProb = blackExp / sumExp;
        let whiteProb = whiteExp / sumExp;
        
        // Ensure probabilities stay reasonable
        const minProb = 0.05;
        const maxProb = 0.95;
        
        if (blackProb > maxProb) {
            blackProb = maxProb;
            whiteProb = 1 - blackProb;
        } else if (blackProb < minProb) {
            blackProb = minProb;
            whiteProb = 1 - blackProb;
        }
        
        return {
            black: blackProb,
            white: whiteProb
        };
    }
}