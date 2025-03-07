/**
 * Gomoku Board UI Implementation
 * Improved for mobile responsiveness
 */
(function() {
    'use strict';

    // Constants
    const BOARD_SIZE = 15;
    const LETTERS = 'ABCDEFGHJKLMNOP'.split(''); // Skip 'I' for clarity

    /**
     * Place class for a single position on the board
     */
    class Place {
        constructor(r, c, board) {
            this.r = r;
            this.c = c;
            this.board = board;
            
            // Create DOM element for the cell
            const elm = document.createElement("div");
            elm.className = "go-place";
            
            // Calculate position - place in the center of cells with exact cell dimensions
            const s = elm.style;
            s.position = 'absolute';
            
            // Position calculation for cell centers in a 15x15 grid
            const cellSize = 100 / BOARD_SIZE;
            s.top = (r * cellSize) + '%';  // Top of cell
            s.left = (c * cellSize) + '%'; // Left of cell
            s.width = cellSize + '%';      // Set width to match cell
            s.height = cellSize + '%';     // Set height to match cell
            
            // Create inner stone element centered within the cell
            const inner = document.createElement("div");
            inner.className = "go";
            // Positioning is now handled by CSS for better responsiveness
            
            elm.appendChild(inner);
            
            // Add click handler with better touch support
            elm.onclick = (e) => {
                // Only handle clicks if the position is valid
                if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
                    board.clicked(r, c);
                    e.preventDefault(); // Prevent zoom/scroll on mobile
                }
            };
            
            // Improved touch support with handling for zoom and scroll prevention
            if ("ontouchstart" in window) {
                let moved = false;
                let startX, startY;
                
                elm.ontouchstart = (e) => {
                    moved = false;
                    startX = e.touches[0].clientX;
                    startY = e.touches[0].clientY;
                    e.preventDefault(); // Prevent zoom/scroll
                    return false;
                };
                
                elm.ontouchmove = (e) => {
                    // Only consider it a move if there's significant movement
                    // This prevents slight finger movements from canceling clicks
                    const diffX = Math.abs(e.touches[0].clientX - startX);
                    const diffY = Math.abs(e.touches[0].clientY - startY);
                    
                    if (diffX > 5 || diffY > 5) { // Threshold of 5 pixels
                        moved = true;
                    }
                    e.preventDefault(); // Prevent zoom/scroll
                    return false;
                };
                
                elm.ontouchend = (e) => {
                    if (!moved) {
                        board.clicked(r, c);
                    }
                    moved = false;
                    e.preventDefault(); // Prevent zoom/scroll
                    return false;
                };
            }
            
            this.elm = $(elm);
            this.isSet = false;
        }
        
        set(color) {
            this.elm.addClass("set").addClass(color).removeClass("warning").removeClass("ai-suggestion");
            this.isSet = true;
        }
        
        unset() {
            this.elm.removeClass("black").removeClass("white").removeClass("set").removeClass("last-move").removeClass("ai-suggestion");
            this.isSet = false;
        }
        
        highlight() {
            this.elm.addClass("last-move");
        }
        
        removeHighlight() {
            this.elm.removeClass("last-move");
        }
        
        markAsSuggestion() {
            if (!this.isSet) {
                this.elm.addClass("ai-suggestion");
            }
        }
        
        unmarkAsSuggestion() {
            this.elm.removeClass("ai-suggestion");
        }
    }

    /**
     * GoBoard class for the entire Gomoku board UI
     */
    window.GoBoard = function(boardElm, config = {}) {
        // Private variables
        let places = [];
        let clickable = true;
        let lastMove = null;
        let currentSuggestion = null;
        
        // Initialize the grid
        const createGrid = () => {
            // Create grid lines SVG
            const svgNS = "http://www.w3.org/2000/svg";
            const grid = document.createElementNS(svgNS, "svg");
            grid.setAttribute("class", "board-grid");
            grid.setAttribute("width", "100%");
            grid.setAttribute("height", "100%");
            grid.setAttribute("viewBox", "0 0 100 100"); // Add viewBox for better scaling
            
            // Add row indices and column letters (outside grid container)
            for (let i = 0; i < BOARD_SIZE; i++) {
                // Row indices (1-15 from top to bottom)
                const rowLabel = document.createElement("div");
                rowLabel.className = "board-label row-label";
                rowLabel.textContent = (BOARD_SIZE - i).toString(); // 15 at top, 1 at bottom
                // Position at center of cells
                rowLabel.style.top = ((i + 0.5) * (100 / BOARD_SIZE)) + '%';
                boardElm.append(rowLabel);
                
                // Column letters (A-P, skip I)
                const colLabel = document.createElement("div");
                colLabel.className = "board-label col-label";
                colLabel.textContent = LETTERS[i]; // A at left, P at right
                // Position at center of cells
                colLabel.style.left = ((i + 0.5) * (100 / BOARD_SIZE)) + '%';
                boardElm.append(colLabel);
            }
            
            // Add background grid for cells
            const background = document.createElementNS(svgNS, "rect");
            background.setAttribute("width", "100%");
            background.setAttribute("height", "100%");
            background.setAttribute("fill", "#e9bb7d");
            grid.appendChild(background);
            
            // Add horizontal lines for 15x15 grid
            for (let i = 0; i <= BOARD_SIZE; i++) {
                const y = i * (100 / BOARD_SIZE);
                const line = document.createElementNS(svgNS, "line");
                line.setAttribute("x1", "0%");
                line.setAttribute("y1", y + "%");
                line.setAttribute("x2", "100%");
                line.setAttribute("y2", y + "%");
                line.setAttribute("stroke", "#333");
                line.setAttribute("stroke-width", "0.5"); // Thinner for better mobile appearance
                grid.appendChild(line);
            }
            
            // Add vertical lines for 15x15 grid
            for (let i = 0; i <= BOARD_SIZE; i++) {
                const x = i * (100 / BOARD_SIZE);
                const line = document.createElementNS(svgNS, "line");
                line.setAttribute("x1", x + "%");
                line.setAttribute("y1", "0%");
                line.setAttribute("x2", x + "%");
                line.setAttribute("y2", "100%");
                line.setAttribute("stroke", "#333");
                line.setAttribute("stroke-width", "0.5"); // Thinner for better mobile appearance
                grid.appendChild(line);
            }
            
            boardElm.append(grid);
        };
        
        // Initialize places
        const initPlaces = () => {
            const frag = document.createDocumentFragment();
            
            for (let r = 0; r < BOARD_SIZE; r++) {
                places.push([]);
                for (let c = 0; c < BOARD_SIZE; c++) {
                    places[r].push(new Place(r, c, this));
                    frag.appendChild(places[r][c].elm[0]);
                }
            }
            
            // Add star points (dark dots) for 15x15 board - traditional star points
            const starPoints = [[3, 3], [3, 7], [3, 11], 
                                [7, 3], [7, 7], [7, 11], 
                                [11, 3], [11, 7], [11, 11]];
            
            starPoints.forEach(e => {
                places[e[0]][e[1]].elm.addClass("go-darkdot");
            });
            
            boardElm.append(frag);
        };
        
        // Prevent default on touch events for the entire board to avoid unwanted zooming
        boardElm.on('touchstart touchmove', function(e) {
            // Allow scrolling in the move history, but prevent zoom/scroll on the board
            if (!$(e.target).closest('.history-text').length) {
                e.preventDefault();
            }
        });
        
        // Initialize
        createGrid();
        initPlaces();
        
        // Handle clicks - this will be overridden by the game controller
        this.clicked = function(r, c) {
            // Check if coordinates are valid board positions
            if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) {
                console.log(`Invalid click position: row ${r}, col ${c}`);
                return;
            }
            console.log(`Clicked: row ${r}, col ${c}`);
        };
        
        // Public methods
        this.setClickable = function(yes, color) {
            clickable = yes;
            if (yes) {
                boardElm.removeClass('disabled').addClass("playing");
            } else {
                boardElm.removeClass("playing").addClass('disabled');
            }
            if (color) {
                boardElm.removeClass("black").removeClass("white").addClass(color);
            }
        };
        
        this.setStone = function(r, c, color) {
            places[r][c].set(color);
            return true;
        };
        
        this.unsetStone = function(r, c) {
            places[r][c].unset();
        };
        
        this.highlight = function(r, c) {
            if (lastMove !== null) {
                places[lastMove.r][lastMove.c].removeHighlight();
            }
            places[r][c].highlight();
            lastMove = {r, c};
        };
        
        this.clearLastMoveHighlight = function() {
            if (lastMove !== null) {
                places[lastMove.r][lastMove.c].removeHighlight();
                lastMove = null;
            }
        };
        
        this.showSuggestion = function(r, c) {
            // Clear previous suggestion if it exists
            if (currentSuggestion !== null) {
                places[currentSuggestion.r][currentSuggestion.c].unmarkAsSuggestion();
            }
            
            // Mark the new suggestion if it's not already set
            if (!places[r][c].isSet) {
                places[r][c].markAsSuggestion();
                currentSuggestion = {r, c};
            } else {
                currentSuggestion = null;
            }
        };
        
        this.clearSuggestion = function() {
            if (currentSuggestion !== null) {
                places[currentSuggestion.r][currentSuggestion.c].unmarkAsSuggestion();
                currentSuggestion = null;
            }
        };
        
        this.isSet = function(r, c) {
            return places[r][c].isSet;
        };

        this.getColor = function(r, c) {
            if (places[r][c].elm.hasClass("black")) return "black";
            if (places[r][c].elm.hasClass("white")) return "white";
            return null;
        };
        
        this.init = function() {
            lastMove = null;
            currentSuggestion = null;
            for (let r = 0; r < BOARD_SIZE; r++) {
                for (let c = 0; c < BOARD_SIZE; c++) {
                    places[r][c].unset();
                }
            }
        };

        this.getBoardState = function() {
            const state = {
                black: [],
                white: []
            };

            for (let r = 0; r < BOARD_SIZE; r++) {
                for (let c = 0; c < BOARD_SIZE; c++) {
                    if (places[r][c].isSet) {
                        const color = this.getColor(r, c);
                        if (color === "black") {
                            state.black.push([r, c]);
                        } else if (color === "white") {
                            state.white.push([r, c]);
                        }
                    }
                }
            }

            return state;
        };
        
        // Coordinate conversion methods
        this.coordToString = function(r, c) {
            return LETTERS[c] + (BOARD_SIZE - r);
        };
        
        this.stringToCoord = function(str) {
            const col = LETTERS.indexOf(str.charAt(0).toUpperCase());
            const row = BOARD_SIZE - parseInt(str.substring(1), 10);
            return { r: row, c: col };
        };

        // Add a method to help with screen size detection and adjustments
        this.adjustForScreenSize = function() {
            const isMobile = window.matchMedia('(max-width: 600px)').matches;
            const isTablet = window.matchMedia('(max-width: 900px)').matches && !isMobile;
            
            // Apply different classes based on screen size
            boardElm.removeClass('mobile tablet desktop');
            
            if (isMobile) {
                boardElm.addClass('mobile');
            } else if (isTablet) {
                boardElm.addClass('tablet');
            } else {
                boardElm.addClass('desktop');
            }
        };
        
        // Run initial screen size adjustment
        this.adjustForScreenSize();
        
        // Listen for resize events to adjust the UI
        window.addEventListener('resize', () => {
            this.adjustForScreenSize();
        });
        
        return this;
    };
})();