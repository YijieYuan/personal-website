/****************************\
 ============================

         INIT ENGINE

 ============================              
\****************************/

// init engine
var engine = new Engine();

// run in browser mode  
console.log('\n  Wukong JS - BROWSER MODE - v' + engine.VERSION);
console.log('  type "engine" for public API reference');


/****************************\
 ============================

           GLOBALS

 ============================              
\****************************/


var book = [];
var botName = '';
// Store the last suggested move globally
var lastSuggestedMove = 0;
// Variables for autoplay
var autoplayEnabled = false;
var autoplaySide = -1; // -1 = none, 0 = red, 1 = black


/****************************\
 ============================

        XIANGQI BOARD

 ============================              
\****************************/

// piece folder
var pieceFolder = 'traditional_pieces';

// import sounds
const MOVE_SOUND = new Audio('game/sounds/move.wav');
const CAPTURE_SOUND = new Audio('game/sounds/capture.wav');

// square size
const CELL_WIDTH = 52;
const CELL_HEIGHT = 52;

// select color
const SELECT_COLOR = 'brown';

// flip board
var flip = 0;

// flip board
function flipBoard() {
  const selectedSquare = userSource;
  flip ^= 1;
  drawBoard();
  if (clickLock && selectedSquare) {
    highlightMoves(selectedSquare);
    addGlowToSelectedPiece(selectedSquare);
  }
}

// Toggle AI autoplay
function toggleAutoplay() {
  const autoplayBtn = document.getElementById('autoplayBtn');
  const statusSpan = document.getElementById('autoplayStatus');
  
  if (!autoplayEnabled) {
    // Enable autoplay for current side
    autoplayEnabled = true;
    autoplaySide = engine.getSide();
    
    // Update UI
    autoplayBtn.innerText = "AI Autoplay: On";
    autoplayBtn.classList.add('active');
    
    // Update status
    statusSpan.innerText = autoplaySide ? "Black" : "Red";
    statusSpan.className = autoplaySide ? "black" : "red";
    
    // Start AI move if it's AI's turn
    if (engine.getSide() === autoplaySide) {
      userTime = 0;
      think();
    }
  } else {
    // Disable autoplay
    autoplayEnabled = false;
    autoplaySide = -1;
    
    // Update UI
    autoplayBtn.innerText = "AI Autoplay: Off";
    autoplayBtn.classList.remove('active');
    
    // Update status
    statusSpan.innerText = "None";
    statusSpan.className = "";
  }
}

// Force PNG mode for all pieces
const isCCBridgeEnabled = true;

function drawBoard() {
  // Clear any existing glow effects before redrawing
  clearSelectedPieceGlow();
  
  // Check if we should use PNG or SVG files
  // By default, check if we're using a CCBridge-style board which traditionally uses PNGs
  let boardElement = document.getElementById('xiangqiboard');
  let usesPng = false
                
  // Determine file extension to use
  let fileExtension = usesPng ? '.png' : '.svg';
  
  // For debugging
  console.log("Using file extension:", fileExtension);
  
  var chessBoard = '<table cellspacing="0" cellpadding="0"><tbody>';
  
  // Check if black pieces should be flipped
  let blackPiecesFlipped = window.blackPiecesFlipped || false;
  
  // For debugging
  console.log("Black pieces flipped:", blackPiecesFlipped);
  
  // board table
  for (let row = 0; row < 14; row++) {
    chessBoard += '<tr>';
    for (let col = 0; col < 11; col++) {
      let file, rank;
      
      // flip board
      if (flip) {
        file = 11 - 1 - col;
        rank = 14 - 1 - row;
      } else {
        file = col;
        rank = row;
      }
      
      let square = rank * 11 + file;
      let piece = engine.getPiece(square);
      
      // Only create piece image if there is a piece
      let pieceImage = '';
      if (piece) {
        // Check if it's a black piece (piece & 8 is true for black in xiangqi.js)
        let isBlack = (piece & 8);
        
        // Determine the correct piece folder and/or rotation
        let pieceSrc = pieceFolder;
        let pieceStyle = '';
        
        // Apply rotation for black pieces if needed
        if (isBlack && blackPiecesFlipped) {
          if (fileExtension === '.png') {
            // For PNG: use pre-rotated images if available
            if (pieceExists('flipped_pieces', piece, fileExtension)) {
              pieceSrc = 'flipped_pieces';
            } else {
              // Fallback to CSS rotation if flipped PNGs don't exist
              pieceStyle = ' style="transform: rotate(180deg); transform-origin: center;"';
            }
          } else {
            // For SVG: always use CSS transform (more reliable)
            pieceStyle = ' style="transform: rotate(180deg); transform-origin: center;"';
          }
        }
        
        // Check if file exists - log for debugging
        let imagePath = 'game/images/' + pieceSrc + '/' + piece + fileExtension;
        console.log(`Trying to load: ${imagePath} (Black: ${isBlack}, Flipped: ${blackPiecesFlipped})`);
        
        // Create the image tag
        pieceImage = '<img draggable="true"' + pieceStyle;
        pieceImage += ' src="' + imagePath + '"';
        pieceImage += ' onerror="this.onerror=null; console.error(\'Failed to load: \' + this.src); ';
        
        // If SVG fails, try PNG as fallback
        if (fileExtension === '.svg') {
          pieceImage += 'this.src=this.src.replace(\'.svg\', \'.png\');';
        }
        
        pieceImage += '"></img>';
      }

      if (engine.squareToString(square) != 'xx') {
        chessBoard += 
          '<td align="center" id="' + square + 
          '" width="' + CELL_WIDTH + 'px" height="' + CELL_HEIGHT +  'px" ' +
          ' onclick="tapPiece(this.id)" ' + 
          ' ondragstart="dragPiece(event, this.id)" ' +
          ' ondragover="dragOver(event, this.id)"'+
          ' ondrop="dropPiece(event, this.id)">' + pieceImage +
          '</td>';
      }
    }
    chessBoard += '</tr>';
  }

  chessBoard += '</tbody></table>';
  document.getElementById('xiangqiboard').innerHTML = chessBoard;
  
  // Reapply the glow to the selected piece if one is selected
  if (clickLock && userSource) {
    addGlowToSelectedPiece(userSource);
  }
}

// Helper function to check if a piece image exists
// Note: This function doesn't actually verify file existence (which isn't possible in client JS)
// but it's included for logical completeness and future implementation
function pieceExists(folder, piece, extension) {
  // In a real implementation, this would check if the file exists
  // For now, we assume flipped_pieces exists if the folder is requested
  return folder === 'flipped_pieces';
}

// Add a function to clear all indicators when needed
function clearMoveIndicators() {
  const indicators = document.querySelectorAll('.move-indicator');
  indicators.forEach(indicator => indicator.remove());
}

// highlight legal moves
function highlightMoves(square) {  
  if (document.getElementById('showMoves').checked == false) return;
  
  let legalMoves = engine.generateLegalMoves();
  
  for (let count = 0; count < legalMoves.length; count++) {
    let move = legalMoves[count].move;
    let sourceSquare = engine.getSourceSquare(move);
    let targetSquare = engine.getTargetSquare(move);
    if (square == sourceSquare) {
      let parent = document.getElementById(targetSquare);
      
      // Instead of using background image, create and append a dot element
      const dot = document.createElement('div');
      dot.className = 'move-indicator';
      
      // Position the dot at the center of the cell
      dot.style.position = 'absolute';
      dot.style.top = '50%';
      dot.style.left = '50%';
      dot.style.transform = 'translate(-50%, -50%)';
      dot.style.width = '16px';
      dot.style.height = '16px';
      dot.style.backgroundColor = 'rgba(74, 197, 242, 0.7)';
      dot.style.borderRadius = '50%';
      dot.style.zIndex = '5';
      
      // Clear any existing indicators
      const existingDots = parent.querySelectorAll('.move-indicator');
      existingDots.forEach(dot => dot.remove());
      
      // Add the dot to the cell
      parent.appendChild(dot);
      
      // Ensure the piece remains fully visible
      if (parent.querySelector('img')) {
        parent.querySelector('img').style.opacity = '1';
      }
    }
  }
}

// Function to add glow effect to the selected piece
function addGlowToSelectedPiece(square) {
  const pieceElement = document.getElementById(square).querySelector('img');
  if (pieceElement) {
    // Check if it's a red or black piece
    // In xiangqi.js, red pieces have odd piece codes, black pieces have even codes
    // OR red is < 8, black is >= 8
    const piece = engine.getPiece(square);
    const isBlack = (piece & 8); // Bitwise AND with 8 (black pieces have this bit set)
    
    if (isBlack) {
      pieceElement.classList.add('selected-piece-black');
    } else {
      pieceElement.classList.add('selected-piece-red');
    }
  }
}

// Function to clear glow effects
function clearSelectedPieceGlow() {
  const allPieces = document.querySelectorAll('.board img');
  allPieces.forEach(piece => {
    piece.classList.remove('selected-piece-red');
    piece.classList.remove('selected-piece-black');
  });
}

// set bot
// Update the setBot function in xiangqi.js to work with the level selector
function setBot(bot) {
  botName = bot;
  // Update levels in UI
  const levelMap = {
    'Baihua': '1',
    'CMK': '2',
    'HGM': '3',
    'Haucheng': '4',
    'Wukong': '5',
    'Huronghua': '6',
    'Liudahua': '7'
  };
  
  if (levelMap[bot]) {
    document.getElementById('level-select').value = levelMap[bot];
  }
  
  fixedTime = bots[bot].time;
  fixedDepth = bots[bot].depth;
  book = JSON.parse(JSON.stringify(bots[bot].book));
  
  // Reset last suggested move when changing bot
  lastSuggestedMove = 0;
  
  // Update AI suggestion
  document.getElementById('aiSuggestion').innerHTML = '<strong>Analyzing...</strong>';
  
  // Use setTimeout to ensure the UI updates before the potentially heavy analysis starts
  setTimeout(function() {
    updateAiSuggestion();
  }, 50);
}

// set board theme
function setBoardTheme(theme) {
  document.getElementById('xiangqiboard').style.backgroundImage = 'url(' + theme + ')';
  drawBoard();
}

// set piece theme
function setPieceTheme(theme) {
  pieceFolder = theme;
  drawBoard();
}

// play sound
function playSound(move) {
  if (engine.getCaptureFlag(move)) CAPTURE_SOUND.play();
  else MOVE_SOUND.play();
}


/****************************\
 ============================

          USER INPUT

 ============================              
\****************************/

// stats
var guiScore = 0;
var guiDepth = 0;
var guiTime = 0;
var guiPv = '';
var guiSide = 0;
var userTime = 0;
var gameResult = '*';
var guiFen = '';

// difficulty
var fixedTime = 0;
var fixedDepth = 0;

// user input controls
var clickLock = 0;
var allowBook = 1;
var userSource, userTarget;

// 3 fold repetitions - kept for compatibility but no longer used for game termination
var repetitions = 0;

// Modified drag piece handler with turn-based selection
function dragPiece(event, square) {
  const piece = engine.getPiece(square);
  if (!piece) return;
  
  // Get current side to move (0 = red, 1 = black)
  const currentSide = engine.getSide();
  
  // Check if piece exists and belongs to the current player
  // In xiangqi.js, black pieces have the 8 bit set (piece & 8 is true for black)
  const isPieceBlack = (piece & 8);
  const isCorrectTurn = (currentSide === 0 && !isPieceBlack) || (currentSide === 1 && isPieceBlack);
  
  // Only allow dragging pieces of the current player's color
  if (isCorrectTurn) {
    // If auto-play is enabled for the current side, don't allow manual moves
    if (autoplayEnabled && autoplaySide === currentSide) {
      event.preventDefault();
      return;
    }
    
    userSource = square;
    highlightMoves(square);
    // No glow effect on drag as requested
    event.dataTransfer.setData("text", square);
  } else {
    // Prevent dragging opponent's pieces
    event.preventDefault();
  }
}

function dragOver(event, square) {
  event.preventDefault();
}

function dropPiece(event, square) {
  event.preventDefault();
  
  let fromSquare = parseInt(event.dataTransfer.getData("text"));
  let toSquare = parseInt(square);
  
  if (fromSquare == toSquare) return;
  
  // Get the piece at the destination - used for making a capture sound
  let targetPiece = engine.getPiece(toSquare);
  
  // Try the move
  let valid = validateMove(fromSquare, toSquare);
  
  if (valid) {
    movePiece(fromSquare, toSquare);
    playSound(valid);
    updatePgn();
    
    // Always clear the user source reference after a move
    userSource = undefined;
    
    // If the move was made, have the AI think about a response
    setTimeout(function() { think(); }, 1);
  }
}

// Modified click event handler with piece glow effect and turn-based selection
function tapPiece(square) {
  clearMoveIndicators();
  // Also clear any existing glow effects
  clearSelectedPieceGlow();
  
  var clickSquare = parseInt(square, 10);
  const piece = engine.getPiece(clickSquare);
  
  // Get current side to move (0 = red, 1 = black)
  const currentSide = engine.getSide();
  
  // Don't allow manual moves if autoplay is enabled for current side
  if (autoplayEnabled && autoplaySide === currentSide) {
    return;
  }
  
  // Check if piece exists and belongs to the current player
  // In xiangqi.js, black pieces have the 8 bit set (piece & 8 is true for black)
  const isPieceBlack = piece && (piece & 8);
  const isCorrectTurn = (currentSide === 0 && !isPieceBlack) || (currentSide === 1 && isPieceBlack);
  
  if (!clickLock) {
    // First click - select a piece only if it's the correct player's turn
    if (piece && isCorrectTurn) {
      userSource = clickSquare;
      clickLock = 1;
      drawBoard();
      highlightMoves(clickSquare);
      addGlowToSelectedPiece(clickSquare);
    }
  } else {
    // Second click
    if (clickSquare === userSource) {
      // Clicking the same piece again - cancel selection
      clickLock = 0;
      drawBoard();
    } else if (piece && isCorrectTurn && 
              (engine.getPiece(userSource) & 8) === (piece & 8)) {
      // Clicking another piece of the same color - switch selection to new piece
      userSource = clickSquare;
      drawBoard();
      highlightMoves(clickSquare);
      addGlowToSelectedPiece(clickSquare);
    } else {
      // Clicking an empty square or an opponent's piece - try to move
      userTarget = clickSquare;
      let valid = validateMove(userSource, userTarget);
      movePiece(userSource, userTarget);
      if (engine.getPiece(userTarget) == 0) valid = 0;
      clickLock = 0;
      
      if (valid) {
        playSound(valid);
        updatePgn();
        setTimeout(function() { think(); }, 1);
      } else {
        drawBoard();
      }
    }
  }
}


/****************************\
 ============================

        ENGINE MOVES

 ============================              
\****************************/

// use opening book
function getBookMove() {
  if (allowBook == 0) return 0;

  let moves = engine.getMoves();
  let lines = [];
  
  if (moves.length == 0) {
    let randomLine = book[Math.floor(Math.random() * book.length)];
    let firstMove = randomLine.split(' ')[0];
    return engine.moveFromString(firstMove);
  } else if (moves.length) {
    for (let line = 0; line < book.length; line++) {
      let currentLine = moves.join(' ');

      if (book[line].includes(currentLine) && book[line].split(currentLine)[0] == '')
        lines.push(book[line]);
    }
  }
  
  if (lines.length) {
    let currentLine = moves.join(' ');
    let randomLine = lines[Math.floor(Math.random() * lines.length)];

    try {
      let bookMove = randomLine.split(currentLine)[1].split(' ')[1];
      return engine.moveFromString(bookMove);
    } catch(e) { return 0; }
  }

  return 0;
}

// check for game state - MODIFIED to use more user-friendly game over messages
function isGameOver() {
  // REMOVED: Repetition detection code
  // if (engine.isRepetition()) repetitions++;
  // if (repetitions >= 3) {
  //   gameResult = '3 fold repetition ' + (engine.getSide() ? 'black' : 'red') + ' lost';
  //   return 1;
  // }
  
  // Only check for checkmate and 60-move rule with improved messages
  if (engine.generateLegalMoves().length == 0) {
    // If side is 1 (black to move), then red wins; if side is 0 (red to move), then black wins
    gameResult = engine.getSide() ? 'Red wins by checkmate!' : 'Black wins by checkmate!';
    return 1;
  } else if (engine.getSixty() >= 120) {
    gameResult = 'Draw by 60-move rule';
    return 1;
  }
  
  return 0;
}

// engine move
function think() {
  // Even if game is over, we'll update the PGN but continue
  if (isGameOver()) {
    updatePgn();
    // REMOVED: return statement - AI can still move after game is technically over
  }
  
  if (document.getElementById('editMode').checked == true) return;
  
  // If we have a valid suggested move, use it
  if (lastSuggestedMove) {
    let bestMove = lastSuggestedMove;
    let sourceSquare = engine.getSourceSquare(bestMove);
    let targetSquare = engine.getTargetSquare(bestMove);
    let delayMove = 100;
    
    setTimeout(function() {
      movePiece(sourceSquare, targetSquare);
      drawBoard();
      
      if (engine.getPiece(targetSquare)) {
        playSound(bestMove);
        updatePgn();
        userTime = Date.now();
      }
    }, delayMove);
    
    return;
  }
  
  // If no suggested move is available, run the analysis
  updateAiSuggestion();

  // And then use the suggested move
  if (lastSuggestedMove) {
    let bestMove = lastSuggestedMove;
    let sourceSquare = engine.getSourceSquare(bestMove);
    let targetSquare = engine.getTargetSquare(bestMove);
    let delayMove = 100;
    
    setTimeout(function() {
      movePiece(sourceSquare, targetSquare);
      drawBoard();
      
      if (engine.getPiece(targetSquare)) {
        playSound(bestMove);
        updatePgn();
        userTime = Date.now();
      }
    }, delayMove);
  }
}

// move piece in GUI
function movePiece(userSource, userTarget) {
  let moveString = engine.squareToString(userSource) +
                   engine.squareToString(userTarget);

  // Always load moves, regardless of game state
  engine.loadMoves(moveString);
  drawBoard();
}

// take move back - MODIFIED to reset game state and allow continued play
function undo() {
  // Reset game result to allow continued play
  gameResult = '*';
  try {
    engine.takeBack();
    drawBoard();
    // Reset the last suggested move because the position has changed
    lastSuggestedMove = 0;
    // Update the UI
    updateStatus();
    // Always update AI suggestion
    updateAiSuggestion();
  } catch(e) {}
}

// validate move
function validateMove(userSource, userTarget) {
  let moveString = engine.squareToString(userSource) + 
                   engine.squareToString(userTarget);

  let move = engine.moveFromString(moveString);
  return move;
}


/****************************\
 ============================

             PGN

 ============================              
\****************************/

// Update the game status with more descriptive messages
function updateStatus() {
  let statusElement = document.getElementById('status');
  
  if (isGameOver()) {
    statusElement.innerText = gameResult;
    return;
  }
  
  // Current player's turn
  const currentSide = engine.getSide();
  
  if (currentSide === 0) {
    // Red's turn
    statusElement.innerText = "Red to move";
    // Add class for visual indication if needed
    statusElement.className = "status-text status-red";
  } else {
    // Black's turn
    statusElement.innerText = "Black to move";
    // Add class for visual indication if needed
    statusElement.className = "status-text status-black";
  }
}

// Updated updatePgn function with improved game result display
function updatePgn() {
  let pgn = '';
  let moveStack = engine.moveStack();
  
  for (let index = 0; index < moveStack.length; index++) {
    let move = moveStack[index].move;
    let moveScore = moveStack[index].score;
    let moveString = engine.moveToString(move);
    let moveNumber = (index % 2 === 0) ? ((index / 2 + 1) + '. ') : '';
    
    // Format evaluation only (no time)
    let evalStr = '';
    if (moveScore) {
      if (typeof moveScore === 'string' && moveScore.includes('M')) {
        evalStr = `Mate in ${moveScore.substring(1)}`;
      } else if (!isNaN(parseFloat(moveScore))) {
        let evalScore = parseFloat(moveScore) / 100;
        evalStr = `${evalScore > 0 ? '+' : ''}${evalScore.toFixed(2)}`;
      }
    }
    
    // Create info string with eval if available (no time info)
    let infoStr = '';
    if (evalStr) {
      infoStr = ` {${evalStr}}`;
    }
    
    if (index % 2 === 0) {
      // Start a new line for each full move (Red's move)
      if (index > 0) pgn += '\n';
      pgn += moveNumber + moveString + infoStr;
    } else {
      // Black's move on the same line
      pgn += ' ' + moveString + infoStr;
    }
  }
  
  let gameMoves = document.getElementById('pgn');
  gameMoves.innerText = pgn;
  
  // Add game result with improved formatting
  if (gameResult && gameResult != '*') {
    gameMoves.innerText += '\n' + gameResult;
  }
  
  // Update game status
  updateStatus();
  
  // Reset lastSuggestedMove since the position has changed
  lastSuggestedMove = 0;
  
  // Always update AI suggestion
  updateAiSuggestion();
  
  // Check if autoplay is enabled and it's AI's turn
  if (autoplayEnabled && engine.getSide() === autoplaySide) {
    setTimeout(function() { userTime = 0; think(); }, 500);
  }
}

// Update AI suggestion and store the suggested move
function updateAiSuggestion() {
  let aiSuggestionElement = document.getElementById('aiSuggestion');
  
  // MODIFIED: Allow AI suggestions even when game is over
  if (isGameOver()) {
    // Still allow analysis when game is over
    aiSuggestionElement.innerHTML = "<strong>Game is over, but still analyzing...</strong>";
    // Don't return - continue with analysis
  }

  // Show that analysis is in progress
  aiSuggestionElement.innerHTML = "<strong>Analyzing...</strong>";
  
  // Use setTimeout to allow the UI to update before potentially heavy analysis
  setTimeout(function() {
    // Reset time control and prepare for analysis
    engine.resetTimeControl();
    let timing = engine.getTimeControl();
    let startTime = new Date().getTime();
    
    if (fixedTime) {
      fixedDepth = 64;
      timing.timeSet = 1;
      timing.time = fixedTime * 1000;
      timing.stopTime = startTime + timing.time;
      engine.setTimeControl(timing);
    }
    
    // Try to get a book move first
    let bookMove = getBookMove();
    let bestMove = 0;
    
    if (botName == 'Baihua') {
      // For Baihua (level 1), use a consistent selection method
      let moves = engine.generateLegalMoves();
      if (moves.length > 0) {
        let seed = engine.moveStack().length % moves.length;
        bestMove = moves[seed].move;
      }
    } else {
      if (bookMove) {
        bestMove = bookMove;
      } else {
        // For higher levels, ensure proper search configuration
        try {
          bestMove = engine.search(fixedDepth);
        } catch (e) {
          console.error("Search error:", e);
          // Fallback to legal moves if search fails
          let moves = engine.generateLegalMoves();
          if (moves.length > 0) {
            bestMove = moves[0].move;
          }
        }
      }
    }
    
    // Store the suggested move for think() to use
    lastSuggestedMove = bestMove;
    
    if (bestMove) {
      let moveStr = engine.moveToString(bestMove);
      let evalText = '';
      
      // Extract evaluation information
      if (typeof guiScore !== 'undefined') {
        if (typeof guiScore === 'string' && guiScore.includes('M')) {
          evalText = `(Mate in ${guiScore.substring(1)})`;
        } else if (!isNaN(parseFloat(guiScore))) {
          let evalScore = parseFloat(guiScore) / 100;
          evalText = `(Eval: ${evalScore.toFixed(2)})`;
        }
      }
      
      // Display the suggestion
      aiSuggestionElement.innerHTML = `<strong>Suggestion:</strong> ${moveStr} ${evalText}`;
      
      // Add current position evaluation below suggestion
      if (typeof guiScore !== 'undefined') {
        let currentEval = '';
        if (typeof guiScore === 'string' && guiScore.includes('M')) {
          currentEval = `Mate in ${guiScore.substring(1)}`;
        } else if (!isNaN(parseFloat(guiScore))) {
          let evalScore = parseFloat(guiScore) / 100;
          let side = engine.getSide() === 0 ? "Red" : "Black";
          currentEval = `Evaluation: ${evalScore.toFixed(2)} for ${side}`;
        }
        
        if (currentEval) {
          aiSuggestionElement.innerHTML += `<br><span class="current-eval">${currentEval}</span>`;
        }
      }
    } else {
      aiSuggestionElement.innerHTML = "<strong>No suggestion available</strong>";
      lastSuggestedMove = 0;
      
      // Try a fallback approach - get any legal move
      let moves = engine.generateLegalMoves();
      if (moves.length > 0) {
        lastSuggestedMove = moves[0].move;
        let moveStr = engine.moveToString(lastSuggestedMove);
        aiSuggestionElement.innerHTML = `<strong>Suggestion:</strong> ${moveStr} (fallback)`;
      }
    }
  }, 50); // Small timeout to let UI update
}

/****************************\
 ============================

        GAME CONTROLS

 ============================              
\****************************/

// start new game
function newGame() {
  guiScore = 0;
  guiDepth = 0;
  guiTime = 0;
  guiPv = '';
  gameResult = '';
  userTime = 0;
  allowBook = 1;
  engine.setBoard(engine.START_FEN);
  drawBoard();
  document.getElementById('pgn').innerHTML = '';
  repetitions = 0;
  // Reset the last suggested move
  lastSuggestedMove = 0;
  
  // Reset autoplay when starting a new game
  if (autoplayEnabled) {
    // Update autoplay for the current side (which is now red/0)
    autoplaySide = 0; // Red starts in a new game
    document.getElementById('autoplayStatus').innerText = "Red";
    document.getElementById('autoplayStatus').className = "red";
    
    // If autoplay is enabled for red, trigger AI move
    if (autoplayEnabled) {
      setTimeout(function() { userTime = 0; think(); }, 500);
    }
  }
  
  // Update status and AI suggestion
  updateStatus();
  // Always update AI suggestion
  updateAiSuggestion();
}

/****************************\
 ============================

          ON STARTUP

 ============================              
\****************************/

newGame();
setBot('Baihua'); // Changed default bot to Level 1 (Baihua)