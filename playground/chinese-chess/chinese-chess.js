/*************************************************************
 * Xiangqi: Check/Checkmate logic with no king capture.
 * - If you are in check, you must make a move that removes it.
 * - Capturing the other King is disallowed (invalid move).
 * - Game ends only by checkmate (one side cannot escape check).
 ************************************************************/

// DOM references
const boardEl     = document.getElementById('board');
const statusEl    = document.getElementById('status');
const pgnEl       = document.getElementById('pgn');
const undoBtn     = document.getElementById('undoBtn');
const flipBtn     = document.getElementById('flipBtn');
const clearBtn    = document.getElementById('clearBtn');
const startBtn    = document.getElementById('startBtn');
const applyAiBtn  = document.getElementById('applyAiBtn');
const aiToggleEl  = document.getElementById('aiToggle');

// Game variables
let boardState;
let currentTurn   = 'red';        // 'red' or 'black'
let selectedPiece = null;         // { x, y, pieceData }
let moveLog       = [];
let undoStack     = [];
let boardFlipped  = false;
let aiOn          = true;
let gameOver      = false;        // once checkmate => no more moves

// On load
initGame();

// ---------------------
// MAIN INIT
// ---------------------
function initGame() {
  boardState   = createInitialBoard();
  currentTurn  = 'red';
  selectedPiece= null;
  moveLog      = [];
  undoStack    = [];
  boardFlipped = false;
  gameOver     = false;

  statusEl.textContent = 'Ready';
  generateBoardIntersections();
  renderBoard();
  renderMoveLog();
  updateWinPrediction(50, 50);
}

// Create standard Xiangqi layout
function createInitialBoard() {
  const newBoard = [];
  for (let row = 0; row < 10; row++) {
    const rowArr = Array(9).fill(null);
    newBoard.push(rowArr);
  }

  // Red
  newBoard[9][0] = { type: 'R', color: 'red' };
  newBoard[9][8] = { type: 'R', color: 'red' };
  newBoard[9][1] = { type: 'N', color: 'red' };
  newBoard[9][7] = { type: 'N', color: 'red' };
  newBoard[9][2] = { type: 'B', color: 'red' };
  newBoard[9][6] = { type: 'B', color: 'red' };
  newBoard[9][3] = { type: 'A', color: 'red' };
  newBoard[9][5] = { type: 'A', color: 'red' };
  newBoard[9][4] = { type: 'K', color: 'red' };
  newBoard[7][1] = { type: 'C', color: 'red' };
  newBoard[7][7] = { type: 'C', color: 'red' };
  for (let x of [0, 2, 4, 6, 8]) {
    newBoard[6][x] = { type: 'P', color: 'red' };
  }

  // Black
  newBoard[0][0] = { type: 'R', color: 'black' };
  newBoard[0][8] = { type: 'R', color: 'black' };
  newBoard[0][1] = { type: 'N', color: 'black' };
  newBoard[0][7] = { type: 'N', color: 'black' };
  newBoard[0][2] = { type: 'B', color: 'black' };
  newBoard[0][6] = { type: 'B', color: 'black' };
  newBoard[0][3] = { type: 'A', color: 'black' };
  newBoard[0][5] = { type: 'A', color: 'black' };
  newBoard[0][4] = { type: 'K', color: 'black' };
  newBoard[2][1] = { type: 'C', color: 'black' };
  newBoard[2][7] = { type: 'C', color: 'black' };
  for (let x of [0, 2, 4, 6, 8]) {
    newBoard[3][x] = { type: 'P', color: 'black' };
  }

  return newBoard;
}

// Build 9×10 cells in the DOM
function generateBoardIntersections() {
  boardEl.innerHTML = '';
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 9; col++) {
      const cell = document.createElement('div');
      cell.className = 'intersection';

      // Data for clicking
      cell.dataset.x = col;
      cell.dataset.y = row;

      // Click => onCellClick
      cell.addEventListener('click', () => {
        onCellClick(col, row);
      });

      boardEl.appendChild(cell);
    }
  }
}

// Rerender all pieces
function renderBoard() {
  // Clear any child .piece elements
  const cells = boardEl.querySelectorAll('.intersection');
  cells.forEach(c => (c.innerHTML = ''));

  // Place pieces in correct intersections
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 9; x++) {
      const piece = boardState[y][x];
      if (piece) {
        // Find the correct cell DOM based on flip logic
        const cell = getCellElement(x, y);
        if (cell) {
          const pieceEl = document.createElement('div');
          pieceEl.classList.add('piece', piece.color);
          pieceEl.textContent = getPieceText(piece);

          // highlight if selected
          if (
            selectedPiece &&
            selectedPiece.x === x &&
            selectedPiece.y === y
          ) {
            pieceEl.classList.add('selected');
          }

          cell.appendChild(pieceEl);
        }
      }
    }
  }
}

// Return the cell DOM for the real board coordinate (x, y)
function getCellElement(x, y) {
  let dispX = x, dispY = y;
  if (boardFlipped) {
    dispX = 8 - x;
    dispY = 9 - y;
  }
  const index = dispY * 9 + dispX; // row-major
  return boardEl.children[index] || null;
}

// Convert a clicked cell's displayed row/col to real board coords
function getRealCoords(clickedX, clickedY) {
  if (!boardFlipped) {
    return { realX: clickedX, realY: clickedY };
  } else {
    return {
      realX: 8 - clickedX,
      realY: 9 - clickedY
    };
  }
}

// Clicking a cell
function onCellClick(dispX, dispY) {
  // No moves allowed if game is over
  if (gameOver) return;

  const { realX, realY } = getRealCoords(dispX, dispY);

  // If no piece is selected
  if (!selectedPiece) {
    const piece = boardState[realY][realX];
    if (piece && piece.color === currentTurn) {
      selectedPiece = { x: realX, y: realY, pieceData: piece };
      renderBoard();
    }
    return;
  }

  // If already selected a piece
  const { x: sx, y: sy, pieceData: sp } = selectedPiece;
  const targetPiece = boardState[realY][realX];

  // If we clicked same-color piece => reselect
  if (targetPiece && targetPiece.color === sp.color) {
    selectedPiece = { x: realX, y: realY, pieceData: targetPiece };
    renderBoard();
    return;
  }

  // Otherwise, attempt move
  attemptMove(sx, sy, realX, realY);
}

// Attempt move from (sx, sy) => (tx, ty)
function attemptMove(sx, sy, tx, ty) {
  if (!isValidMove(sx, sy, tx, ty)) {
    // invalid => deselect
    selectedPiece = null;
    renderBoard();
    return;
  }

  // Save for undo
  undoStack.push(JSON.parse(JSON.stringify(boardState)));

  // Make the move
  boardState[ty][tx] = boardState[sy][sx];
  boardState[sy][sx] = null;

  const movedPiece = boardState[ty][tx];
  const moveStr = `${movedPiece.color} ${getPieceText(movedPiece)}: (${sx},${sy}) -> (${tx},${ty})`;
  moveLog.push(moveStr);
  renderMoveLog();
  updateStatus(`Moved: ${moveStr}`);

  // Switch turn
  const moverColor = currentTurn;
  currentTurn = moverColor === 'red' ? 'black' : 'red';

  // Deselect
  selectedPiece = null;
  renderBoard();

  // After the move, check if new side is in checkmate
  checkForCheckmate(moverColor);
}

// If the new side to move is in check and cannot escape => checkmate
function checkForCheckmate(moverColor) {
  if (gameOver) return;

  const sideToMove = currentTurn;
  if (!isInCheck(sideToMove)) {
    return; // not in check => no mate
  }

  // if side is in check => see if there's any legal move to escape
  if (canSideMove(sideToMove)) {
    updateStatus('Check!');
  } else {
    gameOver = true;
    updateStatus(`Checkmate: ${moverColor} wins!`);
    if (moverColor === 'red') {
      updateWinPrediction(100, 0);
    } else {
      updateWinPrediction(0, 100);
    }
  }
}

// King location
function findKing(color) {
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 9; x++) {
      const p = boardState[y][x];
      if (p && p.type === 'K' && p.color === color) {
        return { kx: x, ky: y };
      }
    }
  }
  // If no king => let's return -1
  return { kx: -1, ky: -1 };
}

// Is color's King in check?
function isInCheck(color) {
  const oppColor = color === 'red' ? 'black' : 'red';
  const { kx, ky } = findKing(color);
  if (kx < 0) {
    // no king found => typically means not in check, but game is basically broken
    return false;
  }
  // If any opponent piece can move to (kx, ky), it's a check
  for (let sy = 0; sy < 10; sy++) {
    for (let sx = 0; sx < 9; sx++) {
      const piece = boardState[sy][sx];
      if (piece && piece.color === oppColor) {
        if (basicMovementCheck(sx, sy, kx, ky, piece)) {
          // Must do the hypothetical move check for that side, but that’s 
          // for your side. For checking if “any opp piece can capture king,”
          // we can skip the self-check logic. Just see if it’s physically possible
          // ignoring “king can’t be captured.” 
          if (noBlockOrCannonCheck(sx, sy, kx, ky, piece)) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

/*
  canSideMove(color): tries every piece and every possible target.
  If any valid move is found that ends up not in check => return true
*/
function canSideMove(color) {
  for (let sy = 0; sy < 10; sy++) {
    for (let sx = 0; sx < 9; sx++) {
      const piece = boardState[sy][sx];
      if (piece && piece.color === color) {
        for (let ty = 0; ty < 10; ty++) {
          for (let tx = 0; tx < 9; tx++) {
            if (sx !== tx || sy !== ty) {
              if (isValidMove(sx, sy, tx, ty)) {
                return true;
              }
            }
          }
        }
      }
    }
  }
  return false;
}

/*
  isValidMove(sx, sy, tx, ty):
    1) Basic Xiangqi movement check
    2) Disallow capturing the other King
    3) Hypothetical move => if you're still in check => invalid
*/
function isValidMove(sx, sy, tx, ty) {
  if (gameOver) return false;
  const piece = boardState[sy][sx];
  if (!piece) return false;

  const target = boardState[ty][tx];
  // No capturing own color
  if (target && target.color === piece.color) {
    return false;
  }
  // Disallow capturing the other King
  if (target && target.type === 'K') {
    return false;
  }

  // Step 1: Basic movement pattern
  if (!basicMovementCheck(sx, sy, tx, ty, piece)) {
    return false;
  }
  // Step 2: If it’s a Rook/Cannon, ensure no block in path, etc.
  if (!noBlockOrCannonCheck(sx, sy, tx, ty, piece)) {
    return false;
  }

  // Step 3: Hypothetically make the move => see if I'm still in check
  // (i.e. you can't move in a way that doesn't fix your own check).
  const saved = boardState[ty][tx];
  boardState[ty][tx] = piece;
  boardState[sy][sx] = null;

  const stillInCheck = isInCheck(piece.color);

  // revert
  boardState[sy][sx] = piece;
  boardState[ty][tx] = saved;

  if (stillInCheck) {
    return false;
  }

  return true;
}

/* 
  Basic Xiangqi movement check ignoring block/cannon logic:
  returns true if piece’s pattern is correct.
*/
function basicMovementCheck(sx, sy, tx, ty, piece) {
  const dx = tx - sx;
  const dy = ty - sy;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);

  switch (piece.type) {
    case 'R': // Rook
      // must be straight line
      return (dx === 0 || dy === 0);
    case 'N': // Knight
      return ((adx === 2 && ady === 1) || (adx === 1 && ady === 2));
    case 'B': // Bishop
      if (adx !== 2 || ady !== 2) return false;
      // can’t cross river
      if (piece.color === 'red' && ty < 5) return false;
      if (piece.color === 'black' && ty > 4) return false;
      return true;
    case 'A': // Advisor
      if (adx !== 1 || ady !== 1) return false;
      return inPalace(tx, ty, piece.color);
    case 'K': // King
      // 1 step orth only
      if (!((adx === 1 && ady === 0) || (adx === 0 && ady === 1))) return false;
      return inPalace(tx, ty, piece.color);
    case 'C': // Cannon => pattern same as Rook for movement
      return (dx === 0 || dy === 0);
    case 'P': // Pawn
      if (piece.color === 'red') {
        if (sy > 4) {
          // not crossed => only forward
          return (dx === 0 && dy === -1);
        } else {
          // crossed => forward or sideways
          return (
            (dx === 0 && dy === -1) ||
            (Math.abs(dx) === 1 && dy === 0)
          );
        }
      } else {
        // black
        if (sy < 5) {
          return (dx === 0 && dy === 1);
        } else {
          return (
            (dx === 0 && dy === 1) ||
            (Math.abs(dx) === 1 && dy === 0)
          );
        }
      }
  }
  return false;
}

/* 
  noBlockOrCannonCheck(sx, sy, tx, ty, piece):
  - For Rook, ensure no pieces in path
  - For Cannon, ensure path is clear if non-capture, exactly 1 piece if capture
*/
function noBlockOrCannonCheck(sx, sy, tx, ty, piece) {
  if (piece.type === 'R' || piece.type === 'C') {
    // must check how many pieces between
    const betweenCount = countPiecesBetween(sx, sy, tx, ty);
    if (piece.type === 'R') {
      // Rook => must be 0 between
      if (betweenCount !== 0) return false;
    } else {
      // Cannon => if capturing => 1 in between, else 0
      const target = boardState[ty][tx];
      if (target) {
        // capture => must have exactly 1 piece in between
        if (betweenCount !== 1) return false;
      } else {
        // not capture => 0 pieces in between
        if (betweenCount !== 0) return false;
      }
    }
  } else if (piece.type === 'N') {
    // Knight block check
    const dx = tx - sx;
    const dy = ty - sy;
    if (Math.abs(dx) === 2) {
      const blockX = sx + dx / 2;
      if (boardState[sy][blockX]) return false;
    } else {
      const blockY = sy + dy / 2;
      if (boardState[blockY][sx]) return false;
    }
  } else if (piece.type === 'B') {
    // Bishop => check the center
    const dx = tx - sx;
    const dy = ty - sy;
    if (boardState[sy + dy/2][sx + dx/2]) return false;
  }
  return true;
}

// Rook/Cannon path piece counting
function countPiecesBetween(sx, sy, tx, ty) {
  let count = 0;
  if (sx === tx) {
    let step = (ty > sy) ? 1 : -1;
    for (let y = sy + step; y !== ty; y += step) {
      if (boardState[y][sx]) count++;
    }
  } else if (sy === ty) {
    let step = (tx > sx) ? 1 : -1;
    for (let x = sx + step; x !== tx; x += step) {
      if (boardState[sy][x]) count++;
    }
  }
  return count;
}

function inPalace(x, y, color) {
  if (color === 'red') {
    return (x >= 3 && x <= 5 && y >= 7 && y <= 9);
  } else {
    return (x >= 3 && x <= 5 && y >= 0 && y <= 2);
  }
}

// --------------
// BUTTON HANDLERS
// --------------
undoBtn.addEventListener('click', () => {
  // Undo is allowed even if checkmate
  if (undoStack.length > 0) {
    boardState = undoStack.pop();
    if (moveLog.length > 0) {
      moveLog.pop();
    }
    currentTurn = (currentTurn === 'red') ? 'black' : 'red';
    selectedPiece = null;
    gameOver = false; // re-open the game
    updateStatus('Undid last move.');
    renderBoard();
    renderMoveLog();
  } else {
    updateStatus('No moves to undo.');
  }
});

flipBtn.addEventListener('click', () => {
  boardFlipped = !boardFlipped;
  renderBoard();
  updateStatus(boardFlipped ? 'Board flipped.' : 'Board unflipped.');
});

clearBtn.addEventListener('click', () => {
  undoStack.push(JSON.parse(JSON.stringify(boardState)));
  // Remove all pieces
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 9; x++) {
      boardState[y][x] = null;
    }
  }
  moveLog.push('*** Cleared board ***');
  renderMoveLog();
  selectedPiece = null;
  gameOver = false; // can keep playing on an empty board
  updateStatus('Board cleared.');
  renderBoard();
});

startBtn.addEventListener('click', () => {
  initGame();
  updateStatus('Game restarted.');
});

applyAiBtn.addEventListener('click', () => {
  alert('AI not implemented yet.');
});

aiToggleEl.addEventListener('change', (e) => {
  aiOn = e.target.checked;
  document.getElementById('aiSuggestion').textContent = aiOn
    ? 'AI suggestions ON (placeholder)'
    : 'AI suggestions OFF';
});

// ---------------------------
// UTILITY
// ---------------------------
function updateStatus(msg) {
  statusEl.textContent = msg;
}

function renderMoveLog() {
  const maxMoves = 50;
  const startIndex = Math.max(0, moveLog.length - maxMoves);
  const recentMoves = moveLog.slice(startIndex);
  pgnEl.textContent = recentMoves.join('\n');
}

// For the “Win Prediction” bars
function updateWinPrediction(redPercent, blackPercent) {
  const redBar = document.getElementById('whiteBar');
  const blkBar = document.getElementById('blackBar');
  redBar.style.width = redPercent + '%';
  redBar.textContent = redPercent + '%';
  blkBar.style.width = blackPercent + '%';
  blkBar.textContent = blackPercent + '%';
}

// Convert piece type -> Chinese char
function getPieceText({ type, color }) {
  switch (type) {
    case 'R': return '車';
    case 'N': return '馬';
    case 'B': return color === 'red' ? '相' : '象';
    case 'A': return color === 'red' ? '仕' : '士';
    case 'K': return color === 'red' ? '帥' : '將';
    case 'C': return color === 'red' ? '炮' : '砲';
    case 'P': return color === 'red' ? '兵' : '卒';
  }
  return '?';
}
