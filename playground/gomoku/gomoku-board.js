/**
 * Gomoku Board UI Implementation
 */
(function() {
    'use strict';

    // Constants
    const BOARD_SIZE = 15;
    const LETTERS = 'ABCDEFGHJKLMNOP'.split(''); // Skip 'I' for clarity

    /**
     * Place class for a single intersect on the board
     */
    class Place {
        constructor(r, c, board) {
            this.r = r;
            this.c = c;
            this.board = board;
            
            // Create DOM element
            const elm = document.createElement("div");
            elm.className = "go-place";
            
            // Calculate position
            const s = elm.style;
            s.position = 'absolute';
            
            // Position at the grid intersections (not in cells)
            s.top = r * (100 / (BOARD_SIZE - 1)) + '%';
            s.left = c * (100 / (BOARD_SIZE - 1)) + '%';
            s.transform = 'translate(-50%, -50%)';
            
            // Create inner stone element
            const inner = document.createElement("div");
            inner.className = "go";
            elm.appendChild(inner);
            
            // Add click handler
            elm.onclick = () => {
                board.clicked(r, c);
            };
            
            this.elm = $(elm);
            this.isSet = false;
        }
        
        set(color) {
            this.elm.addClass("set").addClass(color).removeClass("warning");
            this.isSet = true;
        }
        
        unset() {
            this.elm.removeClass("black").removeClass("white").removeClass("set").removeClass("last-move");
            this.isSet = false;
        }
        
        highlight() {
            this.elm.addClass("last-move");
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
        
        // Initialize the grid
        const createGrid = () => {
            // Create grid lines SVG
            const svgNS = "http://www.w3.org/2000/svg";
            const grid = document.createElementNS(svgNS, "svg");
            grid.setAttribute("class", "board-grid");
            grid.setAttribute("width", "100%");
            grid.setAttribute("height", "100%");
            
            // Add row indices and column letters (outside grid container)
            for (let i = 0; i < BOARD_SIZE; i++) {
                // Row indices (1-15 from bottom to top)
                const rowLabel = document.createElement("div");
                rowLabel.className = "board-label row-label";
                rowLabel.textContent = (BOARD_SIZE - i).toString();
                rowLabel.style.top = (i * (100 / (BOARD_SIZE - 1))) + '%';
                boardElm.append(rowLabel);
                
                // Column letters (A-P, skip I)
                const colLabel = document.createElement("div");
                colLabel.className = "board-label col-label";
                colLabel.textContent = LETTERS[i];
                colLabel.style.left = (i * (100 / (BOARD_SIZE - 1))) + '%';
                boardElm.append(colLabel);
            }
            
            // Add horizontal lines
            for (let i = 0; i < BOARD_SIZE; i++) {
                const y = i * (100 / (BOARD_SIZE - 1));
                const line = document.createElementNS(svgNS, "line");
                line.setAttribute("x1", "0%");
                line.setAttribute("y1", y + "%");
                line.setAttribute("x2", "100%");
                line.setAttribute("y2", y + "%");
                line.setAttribute("stroke", "#333");
                line.setAttribute("stroke-width", "1");
                grid.appendChild(line);
            }
            
            // Add vertical lines
            for (let i = 0; i < BOARD_SIZE; i++) {
                const x = i * (100 / (BOARD_SIZE - 1));
                const line = document.createElementNS(svgNS, "line");
                line.setAttribute("x1", x + "%");
                line.setAttribute("y1", "0%");
                line.setAttribute("x2", x + "%");
                line.setAttribute("y2", "100%");
                line.setAttribute("stroke", "#333");
                line.setAttribute("stroke-width", "1");
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
            
            // Add star points (dark dots) for 15x15 board
            const starPoints = [[3, 3], [3, 7], [3, 11], 
                                [7, 3], [7, 7], [7, 11], 
                                [11, 3], [11, 7], [11, 11]];
            
            starPoints.forEach(e => {
                places[e[0]][e[1]].elm.addClass("go-darkdot");
            });
            
            boardElm.append(frag);
        };
        
        // Initialize
        createGrid();
        initPlaces();
        
        // Handle clicks - this will be overridden by the game controller
        this.clicked = function(r, c) {
            console.log(`Clicked: row ${r}, col ${c}`);
        };
        
        // Public methods
        this.setClickable = function(yes, color) {
            clickable = yes;
            if (yes) {
                boardElm.addClass("playing");
            } else {
                boardElm.removeClass("playing");
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
                places[lastMove.r][lastMove.c].elm.removeClass("last-move");
            }
            places[r][c].highlight();
            lastMove = {r, c};
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
        
        return this;
    };
})();