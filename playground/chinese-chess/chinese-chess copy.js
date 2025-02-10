document.addEventListener("DOMContentLoaded", function () {
    const board = document.getElementById("xiangqi-board");

    // Chessboard setup
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

    const cellSize = 60;
    const boardOffsetX = 30; // Adjust based on board's actual offset
    const boardOffsetY = 30; 

    let selectedPiece = null;
    let selectedPieceRow = null;
    let selectedPieceCol = null;

    // Place pieces at the correct intersections
    for (let key in startPosition) {
        const [row, col] = key.split(",").map(Number);
        const piece = document.createElement("div");
        piece.classList.add("piece", startPosition[key].startsWith("b") ? "black" : "red");
        piece.textContent = pieceNames[startPosition[key]];
        piece.dataset.row = row;
        piece.dataset.col = col;

        // Position at the intersections
        piece.style.top = `${row * cellSize + boardOffsetY}px`;
        piece.style.left = `${col * cellSize + boardOffsetX}px`;

        // Click event for selection and movement
        piece.addEventListener("click", function (event) {
            event.stopPropagation(); // Prevent board click from triggering
            if (!selectedPiece) {
                // Select piece
                selectedPiece = this;
                selectedPieceRow = parseInt(this.dataset.row);
                selectedPieceCol = parseInt(this.dataset.col);
                this.style.border = "3px solid blue";  // Highlight selected piece
            } else {
                // Move piece
                if (this !== selectedPiece) return; // Prevent capturing for now

                selectedPiece.style.border = "2px solid black";  // Remove highlight
                selectedPiece = null;
                selectedPieceRow = null;
                selectedPieceCol = null;
            }
        });

        board.appendChild(piece);
    }

    // Click event for moving pieces
    board.addEventListener("click", function (event) {
        if (!selectedPiece) return; // No piece selected

        // Get mouse click position
        const rect = board.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const clickY = event.clientY - rect.top;

        // Convert click position to nearest grid cell
        const newRow = Math.round((clickY - boardOffsetY) / cellSize);
        const newCol = Math.round((clickX - boardOffsetX) / cellSize);

        // Ensure it's a valid move (inside board bounds)
        if (newRow < 0 || newRow > 9 || newCol < 0 || newCol > 8) return;

        // Move piece to new position
        selectedPiece.style.top = `${newRow * cellSize + boardOffsetY}px`;
        selectedPiece.style.left = `${newCol * cellSize + boardOffsetX}px`;

        // Update piece dataset
        selectedPiece.dataset.row = newRow;
        selectedPiece.dataset.col = newCol;

        // Deselect piece
        selectedPiece.style.border = "2px solid black";
        selectedPiece = null;
    });

    document.getElementById("resetBoard").addEventListener("click", () => location.reload());
});
