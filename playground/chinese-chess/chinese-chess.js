document.addEventListener("DOMContentLoaded", function () {
    const board = document.getElementById("xiangqi-board");
    const moveLogElement = document.getElementById("move-log");
    const turnIndicator = document.getElementById("turn-indicator");
    const undoButton = document.getElementById("undoMove");

    // Global variables
    let boardState = {};          // Maps "row,col" to the piece element on that cell.
    let selectedPiece = null;     // Currently selected piece (if any)
    let currentTurn = "r";        // 'r' (red) starts
    let gameOver = false;         // When true, no further moves are allowed.
    const cellSize = 60;
    const boardOffsetX = 30;      // Adjust based on board’s actual graphic offset
    const boardOffsetY = 30;
    let moveLog = [];             // Array of move strings (last 10 moves)
    let moveHistory = [];         // For undo functionality

    // Starting position configuration (keys: "row,col" ; values: piece codes)
    const startPosition = {
        "0,0": "bR", "0,1": "bH", "0,2": "bE", "0,3": "bA", "0,4": "bK", "0,5": "bA", "0,6": "bE", "0,7": "bH", "0,8": "bR",
        "2,1": "bC", "2,7": "bC",
        "3,0": "bS", "3,2": "bS", "3,4": "bS", "3,6": "bS", "3,8": "bS",
        "6,0": "rS", "6,2": "rS", "6,4": "rS", "6,6": "rS", "6,8": "rS",
        "7,1": "rC", "7,7": "rC",
        "9,0": "rR", "9,1": "rH", "9,2": "rE", "9,3": "rA", "9,4": "rK", "9,5": "rA", "9,6": "rE", "9,7": "rH", "9,8": "rR"
    };

    const pieceNames = {
        bR: "车", bH: "马", bE: "象", bA: "士", bK: "将", bC: "炮", bS: "卒",
        rR: "车", rH: "马", rE: "相", rA: "仕", rK: "帅", rC: "炮", rS: "兵"
    };

    // Initialize board with pieces – create DOM elements and record their positions.
    for (let key in startPosition) {
        const [row, col] = key.split(",").map(Number);
        const code = startPosition[key];
        const piece = document.createElement("div");
        piece.classList.add("piece", code.startsWith("b") ? "black" : "red");
        piece.textContent = pieceNames[code];
        piece.dataset.row = row;
        piece.dataset.col = col;
        piece.dataset.code = code;
        piece.dataset.color = code[0];
        piece.dataset.type = code.substring(1);
        piece.style.top = `${row * cellSize + boardOffsetY}px`;
        piece.style.left = `${col * cellSize + boardOffsetX}px`;
        board.appendChild(piece);
        boardState[`${row},${col}`] = piece;
    }

    // Update the turn indicator.
    function updateTurnIndicator() {
        turnIndicator.textContent = "Current Turn: " + (currentTurn === "r" ? "Red" : "Black");
    }
    updateTurnIndicator();

    // Returns true if the two kings are on the same column with no intervening pieces.
    function kingsFacing() {
        let redKingPos = null, blackKingPos = null;
        for (let key in boardState) {
            const p = boardState[key];
            if (p.dataset.code === "rK") {
                redKingPos = { row: parseInt(p.dataset.row), col: parseInt(p.dataset.col) };
            }
            if (p.dataset.code === "bK") {
                blackKingPos = { row: parseInt(p.dataset.row), col: parseInt(p.dataset.col) };
            }
        }
        if (redKingPos && blackKingPos && redKingPos.col === blackKingPos.col) {
            let col = redKingPos.col;
            let startRow = Math.min(redKingPos.row, blackKingPos.row);
            let endRow = Math.max(redKingPos.row, blackKingPos.row);
            for (let r = startRow + 1; r < endRow; r++) {
                if (boardState[`${r},${col}`]) {
                    return false;
                }
            }
            return true; // Illegal: kings face each other.
        }
        return false;
    }

    // Validate moves based on piece type and basic Xiangqi rules.
    function validMove(piece, fromRow, fromCol, toRow, toCol) {
        const code = piece.dataset.code; // e.g. "rK"
        const color = code[0];
        const type = code.substring(1);  // "K", "R", "H", "E", "A", "C", "S"
        if (fromRow === toRow && fromCol === toCol) return false;
        // Cannot land on a piece of the same color.
        const destPiece = boardState[`${toRow},${toCol}`];
        if (destPiece && destPiece.dataset.color === color) return false;

        const deltaRow = toRow - fromRow;
        const deltaCol = toCol - fromCol;

        switch (type) {
            case "K":
                // King: one step orthogonally inside the palace.
                if (Math.abs(deltaRow) + Math.abs(deltaCol) !== 1) return false;
                if (color === "r") {
                    if (toRow < 7 || toRow > 9 || toCol < 3 || toCol > 5) return false;
                } else {
                    if (toRow < 0 || toRow > 2 || toCol < 3 || toCol > 5) return false;
                }
                return true;
            case "A":
                // Advisor: moves one step diagonally within the palace.
                if (Math.abs(deltaRow) !== 1 || Math.abs(deltaCol) !== 1) return false;
                if (color === "r") {
                    if (toRow < 7 || toRow > 9 || toCol < 3 || toCol > 5) return false;
                } else {
                    if (toRow < 0 || toRow > 2 || toCol < 3 || toCol > 5) return false;
                }
                return true;
            case "E":
                // Elephant: moves two steps diagonally; its “eye” (midpoint) must be empty.
                // Also cannot cross the river.
                if (Math.abs(deltaRow) !== 2 || Math.abs(deltaCol) !== 2) return false;
                const midRow = fromRow + deltaRow / 2;
                const midCol = fromCol + deltaCol / 2;
                if (boardState[`${midRow},${midCol}`]) return false;
                if (color === "r") {
                    if (toRow < 5) return false; // red elephant may not cross the river.
                } else {
                    if (toRow > 4) return false; // black elephant may not cross.
                }
                return true;
            case "H":
                // Horse: moves in an L-shape; check for “leg” blocking.
                if (!((Math.abs(deltaRow) === 2 && Math.abs(deltaCol) === 1) ||
                      (Math.abs(deltaRow) === 1 && Math.abs(deltaCol) === 2))) return false;
                if (Math.abs(deltaRow) === 2) {
                    const blockRow = fromRow + deltaRow / 2;
                    const blockCol = fromCol;
                    if (boardState[`${blockRow},${blockCol}`]) return false;
                } else {
                    const blockRow = fromRow;
                    const blockCol = fromCol + deltaCol / 2;
                    if (boardState[`${blockRow},${blockCol}`]) return false;
                }
                return true;
            case "R":
                // Chariot: moves in a straight line (horizontally or vertically) with no blocking pieces.
                if (deltaRow !== 0 && deltaCol !== 0) return false;
                if (deltaRow === 0) {
                    const step = deltaCol > 0 ? 1 : -1;
                    for (let c = fromCol + step; c !== toCol; c += step) {
                        if (boardState[`${fromRow},${c}`]) return false;
                    }
                } else {
                    const step = deltaRow > 0 ? 1 : -1;
                    for (let r = fromRow + step; r !== toRow; r += step) {
                        if (boardState[`${r},${fromCol}`]) return false;
                    }
                }
                return true;
            case "C":
                // Cannon: moves like the chariot, but for capturing must jump exactly one piece.
                if (deltaRow !== 0 && deltaCol !== 0) return false;
                let count = 0;
                if (deltaRow === 0) {
                    const step = deltaCol > 0 ? 1 : -1;
                    for (let c = fromCol + step; c !== toCol; c += step) {
                        if (boardState[`${fromRow},${c}`]) count++;
                    }
                } else {
                    const step = deltaRow > 0 ? 1 : -1;
                    for (let r = fromRow + step; r !== toRow; r += step) {
                        if (boardState[`${r},${fromCol}`]) count++;
                    }
                }
                if (destPiece) {
                    return count === 1;
                } else {
                    return count === 0;
                }
            case "S":
                // Soldier: moves one step forward. After crossing the river it can also move horizontally.
                if (color === "r") {
                    if (fromRow >= 5) {
                        // Not crossed river: only move forward (upward → row - 1)
                        return deltaRow === -1 && deltaCol === 0;
                    } else {
                        // After crossing: forward or sideways.
                        return (deltaRow === -1 && deltaCol === 0) || (deltaRow === 0 && Math.abs(deltaCol) === 1);
                    }
                } else {
                    if (fromRow <= 4) {
                        return deltaRow === 1 && deltaCol === 0;
                    } else {
                        return (deltaRow === 1 && deltaCol === 0) || (deltaRow === 0 && Math.abs(deltaCol) === 1);
                    }
                }
            default:
                return false;
        }
    }

    // Record a move (as a string) for the move log.
    function recordMove(piece, fromRow, fromCol, toRow, toCol, capturedPiece) {
        let moveText = (piece.dataset.color === "r" ? "Red" : "Black") + " " + piece.textContent;
        moveText += `: (${fromRow},${fromCol}) → (${toRow},${toCol})`;
        if (capturedPiece) {
            moveText += `  x ${capturedPiece.textContent}`;
        }
        moveLog.push(moveText);
        if (moveLog.length > 10) {
            moveLog.shift();
        }
        updateMoveLog();
    }

    // Update the move log panel.
    function updateMoveLog() {
        moveLogElement.innerHTML = "";
        moveLog.forEach(function(move) {
            const li = document.createElement("li");
            li.textContent = move;
            moveLogElement.appendChild(li);
        });
    }

    // Attempt to move the currently selected piece to the given grid cell.
    function attemptMove(piece, toRow, toCol) {
        const fromRow = parseInt(piece.dataset.row);
        const fromCol = parseInt(piece.dataset.col);

        // Validate the move per piece rules.
        if (!validMove(piece, fromRow, fromCol, toRow, toCol)) {
            return;
        }

        // Save current style and state (for undo).
        const oldTop = piece.style.top;
        const oldLeft = piece.style.left;
        const capturedPiece = boardState[`${toRow},${toCol}`] || null;

        // If a piece is captured, remove it from play.
        if (capturedPiece) {
            delete boardState[`${toRow},${toCol}`];
            capturedPiece.style.display = "none";
        }

        // Remove the moving piece from its old position.
        delete boardState[`${fromRow},${fromCol}`];

        // Update the piece’s DOM position and dataset.
        piece.style.top = `${toRow * cellSize + boardOffsetY}px`;
        piece.style.left = `${toCol * cellSize + boardOffsetX}px`;
        piece.dataset.row = toRow;
        piece.dataset.col = toCol;
        boardState[`${toRow},${toCol}`] = piece;

        // Check if the move causes the two kings to face each other (illegal).
        if (kingsFacing()) {
            // Revert the move.
            piece.style.top = oldTop;
            piece.style.left = oldLeft;
            piece.dataset.row = fromRow;
            piece.dataset.col = fromCol;
            boardState[`${fromRow},${fromCol}`] = piece;
            if (capturedPiece) {
                boardState[`${toRow},${toCol}`] = capturedPiece;
                capturedPiece.style.display = "block";
            }
            return;
        }

        // Save move details for undo.
        moveHistory.push({
            piece: piece,
            fromRow: fromRow,
            fromCol: fromCol,
            toRow: toRow,
            toCol: toCol,
            captured: capturedPiece,
            oldTop: oldTop,
            oldLeft: oldLeft
        });

        // Record the move in the log.
        recordMove(piece, fromRow, fromCol, toRow, toCol, capturedPiece);

        // Check for game over if a king was captured.
        if (capturedPiece && (capturedPiece.dataset.code === "rK" || capturedPiece.dataset.code === "bK")) {
            const winner = capturedPiece.dataset.code === "rK" ? "Black" : "Red";
            moveLog.push(`${winner} wins!`);
            if (moveLog.length > 10) moveLog.shift();
            updateMoveLog();
            gameOver = true;
            // (Undo is still allowed even after a win.)
        }

        // Deselect the piece.
        piece.classList.remove("selected");
        selectedPiece = null;

        // Switch turn.
        currentTurn = currentTurn === "r" ? "b" : "r";
        updateTurnIndicator();
    }

    // The board’s click handler manages both selection and move attempts.
    board.addEventListener("click", function (event) {
        // If game over, still allow selection and undo (moves will be blocked by gameOver flag in attemptMove)
        const rect = board.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const clickY = event.clientY - rect.top;
        // Determine the nearest grid cell.
        const gridRow = Math.round((clickY - boardOffsetY) / cellSize);
        const gridCol = Math.round((clickX - boardOffsetX) / cellSize);

        if (event.target.classList.contains("piece")) {
            // Clicked directly on a piece.
            if (!selectedPiece) {
                // If no piece is selected, select this one if it belongs to the current turn.
                if (event.target.dataset.color === currentTurn) {
                    selectedPiece = event.target;
                    selectedPiece.classList.add("selected");
                }
            } else {
                if (event.target === selectedPiece) {
                    // Deselect if clicking the same piece.
                    selectedPiece.classList.remove("selected");
                    selectedPiece = null;
                } else if (event.target.dataset.color === currentTurn) {
                    // Switch selection to a different friendly piece.
                    selectedPiece.classList.remove("selected");
                    selectedPiece = event.target;
                    selectedPiece.classList.add("selected");
                } else {
                    // If an enemy piece is clicked, attempt a capture by moving to its cell.
                    const destRow = parseInt(event.target.dataset.row);
                    const destCol = parseInt(event.target.dataset.col);
                    attemptMove(selectedPiece, destRow, destCol);
                }
            }
        } else {
            // Clicked on an empty spot: if a piece is selected, try to move it there.
            if (selectedPiece) {
                attemptMove(selectedPiece, gridRow, gridCol);
            }
        }
    });

    // Undo button: reverts the last move (even if game is over).
    undoButton.addEventListener("click", function () {
        if (moveHistory.length === 0) return;
        const lastMove = moveHistory.pop();
        moveLog.pop();  // Remove the move log record (if it was a winning move, this removes the win message)
        updateMoveLog();
        // Remove the piece from its new cell.
        delete boardState[`${lastMove.toRow},${lastMove.toCol}`];
        // Move it back.
        lastMove.piece.style.top = lastMove.oldTop;
        lastMove.piece.style.left = lastMove.oldLeft;
        lastMove.piece.dataset.row = lastMove.fromRow;
        lastMove.piece.dataset.col = lastMove.fromCol;
        boardState[`${lastMove.fromRow},${lastMove.fromCol}`] = lastMove.piece;
        // If a piece was captured, restore it.
        if (lastMove.captured) {
            lastMove.captured.style.display = "block";
            boardState[`${lastMove.toRow},${lastMove.toCol}`] = lastMove.captured;
            // If a king was captured in that move, undo game over.
            if (lastMove.captured.dataset.code === "rK" || lastMove.captured.dataset.code === "bK") {
                gameOver = false;
            }
        }
        // Switch turn back.
        currentTurn = currentTurn === "r" ? "b" : "r";
        updateTurnIndicator();
    });

    // Reset button: simply reloads the page.
    document.getElementById("resetBoard").addEventListener("click", function () {
        location.reload();
    });
});
