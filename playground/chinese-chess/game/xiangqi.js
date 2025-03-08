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

// square size - updated to match CSS
const CELL_WIDTH = 52;  // Changed from 46 to match CSS
const CELL_HEIGHT = 52; // Changed from 46 to match CSS

// select color
const SELECT_COLOR = 'brown';

// flip board
var flip = 0;

// flip board
function flipBoard() {
  flip ^= 1;
  drawBoard();  
}

// render board in browser
function drawBoard() {
  var chessBoard = '<table cellspacing="0" cellpadding="0"><tbody>'
  let isCCBridge = document.getElementById('xiangqiboard').style.backgroundImage.includes('ccbridge');
  
  // board table
  for (let row = 0; row < 14; row++) {
    chessBoard += '<tr>'
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
      // Removed inline width styling to use CSS instead
      var pieceImage = '<img draggable="true"';
      pieceImage += 'src="game/images/' + pieceFolder + '/' + piece + (isCCBridge ? '.png' : '.svg') + '"></img>';

      if (engine.squareToString(square) != 'xx') {
        chessBoard += 
          '<td align="center" id="' + square + 
          '" width="' + CELL_WIDTH + 'px" height="' + CELL_HEIGHT +  'px" ' +
          ' onclick="tapPiece(this.id)" ' + 
          ' ondragstart="dragPiece(event, this.id)" ' +
          ' ondragover="dragOver(event, this.id)"'+
          ' ondrop="dropPiece(event, this.id)">' + (piece ? pieceImage : '') +
          '</td>';
      }
    }

    chessBoard += '</tr>';
  }

  chessBoard += '</tbody></table>';
  document.getElementById('xiangqiboard').innerHTML = chessBoard;
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
      dot.style.backgroundColor = 'rgba(0, 220, 0, 0.7)';
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

// 3 fold repetitions
var repetitions = 0;

// pick piece handler
function dragPiece(event, square) {
  userSource = square;
  highlightMoves(square);
}

// drag piece handler
function dragOver(event, square) {
  event.preventDefault();
  if (square == userSource) event.target.src = '';
}

// drop piece handler
function dropPiece(event, square) {
  userTarget = square;
  let valid = validateMove(userSource, userTarget);  
  movePiece(userSource, userTarget);
  if (engine.getPiece(userTarget) == 0) valid = 0;
  clickLock = 0;
  
  if (engine.getPiece(square) && valid) {
    userTime = Date.now() - userTime;
    // Remove background color highlighting
    playSound(valid);
    updatePgn();
  }
  
  event.preventDefault();
  if (valid) setTimeout(function() { think(); }, 100);
}

// click event handler
// Modified click event handler to improve piece selection behavior
function tapPiece(square) {
  clearMoveIndicators();
  
  var clickSquare = parseInt(square, 10);
  
  if (!clickLock) {
    // First click - select a piece
    if (engine.getPiece(clickSquare)) {
      userSource = clickSquare;
      clickLock = 1;
      drawBoard();
      highlightMoves(clickSquare);
    }
  } else {
    // Second click
    if (clickSquare === userSource) {
      // Clicking the same piece again - cancel selection
      clickLock = 0;
      drawBoard();
    } else if (engine.getPiece(clickSquare) && 
              (engine.getPiece(userSource) & 8) === (engine.getPiece(clickSquare) & 8)) {
      // Clicking another piece of the same color - switch selection to new piece
      userSource = clickSquare;
      drawBoard();
      highlightMoves(clickSquare);
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

// check for game state
function isGameOver() {
  if (engine.isRepetition()) repetitions++;
  if (repetitions >= 3) {
    gameResult = '3 fold repetition ' + (engine.getSide() ? 'black' : 'red') + ' lost';
    return 1;
  } else if (engine.generateLegalMoves().length == 0) {
    gameResult = (engine.getSide() ? '1-0' : '0-1') + ' mate';
    return 1;
  } else if (engine.getSixty() >= 120) {
    gameResult = '1/2-1/2 Draw by 60 rule move';
    return 1;
  } // TODO: material draw?

  if (engine.generateLegalMoves().length == 0) {
    gameResult = (engine.getSide() ? '1-0' : '0-1') + ' mate';
    return 1;
  }
  
  return 0;
}

// engine move
function think() {
  if (isGameOver()) {updatePgn(); return;}
  
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
        // Remove background color highlighting
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
        // Remove background color highlighting
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

  if (isGameOver() == 0) engine.loadMoves(moveString);
  else updatePgn();
  drawBoard();
}

// take move back
function undo() {
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

// Update the game status
function updateStatus() {
  let statusElement = document.getElementById('status');
  
  if (isGameOver()) {
    statusElement.innerText = gameResult;
  } else {
    statusElement.innerText = (engine.getSide() === 0) ? "Red to move" : "Black to move";
  }
}

// Updated updatePgn function to remove time information
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
  
  if (gameResult == '1-0 Mate' || gameResult == '0-1 Mate') {
    gameMoves.innerText += '# ' + gameResult;
  } else if (gameResult != '*') {
    gameMoves.innerText += ' ' + gameResult;
  }
  
  // Update game status
  updateStatus();
  
  // Reset lastSuggestedMove since the position has changed
  lastSuggestedMove = 0;
  
  // Always update AI suggestion
  updateAiSuggestion();
}

// Update AI suggestion and store the suggested move
function updateAiSuggestion() {
  let aiSuggestionElement = document.getElementById('aiSuggestion');
  
  if (isGameOver()) {
    aiSuggestionElement.innerHTML = "<strong>Game over</strong>";
    lastSuggestedMove = 0;
    return;
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