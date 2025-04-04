// DOM elements
const originalCanvas = document.getElementById('original-canvas');
const resultCanvas = document.getElementById('result-canvas');
const originalCtx = originalCanvas.getContext('2d');
const resultCtx = resultCanvas.getContext('2d');
const fileInput = document.getElementById('image-upload');
const startButton = document.getElementById('start-button');
const downloadSvgButton = document.getElementById('download-svg');
const downloadPngButton = document.getElementById('download-png');
const progressBorder = document.querySelector('.progress-border');
const statusDiv = document.getElementById('status');
const resultStatusDiv = document.getElementById('result-status');
const svgOutput = document.getElementById('svg-output');
const svgOutputCompact = document.getElementById('svg-output-compact');
const inputSizeSelect = document.getElementById('input-size');
const outputSizeSelect = document.getElementById('output-size');
const copySvgBtn = document.getElementById('copy-svg-btn');
const useTrianglesCheckbox = document.getElementById('use-triangles');
const useRectanglesCheckbox = document.getElementById('use-rectangles');
const useEllipsesCheckbox = document.getElementById('use-ellipses');
const controlElements = document.querySelectorAll('.controls select, .controls input, .controls button, .action-controls button');
const originalWrapper = document.getElementById('original-wrapper');
const resultWrapper = document.getElementById('result-wrapper');
const uploadLabel = document.getElementById('upload-label');

// Variables
let sourceImage = null;
let optimizerPtr = null;
let wasmInstance = null;
let processingWidth = 256;
let processingHeight = 256;
let outputWidth = 256;
let outputHeight = 256;
let svgString = '';
let svgCompactString = '';
let currentSvgSize = 0;
let currentPngSize = 0;
let isRunning = false;
let currentStep = 0;
let totalSteps = 0;
let startTime = 0; // Track when optimization started

// Initialize canvases
function updateCanvasSizes() {
    processingWidth = parseInt(inputSizeSelect.value, 10);
    processingHeight = processingWidth; // Keep processing square
    
    outputWidth = parseInt(outputSizeSelect.value, 10);
    outputHeight = outputWidth; // Keep output square
    
    // Update canvas sizes for processing
    originalCanvas.width = processingWidth;
    originalCanvas.height = processingHeight;
    resultCanvas.width = processingWidth;
    resultCanvas.height = processingHeight;
}

// Resize canvas to fill wrapper while maintaining aspect ratio
function resizeCanvasToFillWrapper(canvas) {
    const wrapper = canvas.parentElement;
    
    // Set display dimensions (CSS) to match wrapper exactly
    canvas.style.width = '100%';
    canvas.style.height = '100%';
}

// Make sure canvas wrappers maintain a square aspect ratio
function enforceSquareWrappers() {
    const wrappers = document.querySelectorAll('.canvas-wrapper');
    
    wrappers.forEach(wrapper => {
        // Ensure the wrapper has a minimum size (prevent disappearing)
        wrapper.style.minWidth = '250px';
        wrapper.style.minHeight = '250px';
    });
}

// Update the progress border display
function updateProgressBorder(progress) {
    // Set the progress as a CSS variable
    progressBorder.style.setProperty('--progress', progress);
    
    // Calculate which edges should be visible based on progress
    if (progress <= 25) {
        // Top edge only (0-25%)
        progressBorder.className = 'progress-border';
    } else if (progress <= 50) {
        // Top edge + right edge (25-50%)
        progressBorder.className = 'progress-border right-visible';
    } else if (progress <= 75) {
        // Top, right, and bottom edges (50-75%)
        progressBorder.className = 'progress-border right-visible bottom-visible';
    } else if (progress < 100) {
        // All edges (75-100%)
        progressBorder.className = 'progress-border right-visible bottom-visible left-visible';
    } else {
        // Completed animation
        progressBorder.className = 'progress-border completed';
    }
}

// Helper function to format file size adaptively (bytes to KB, MB, GB)
function formatFileSize(bytes) {
    if (bytes === 0) return '0 KB';
    
    if (bytes < 1024) {
        return bytes + ' B';
    } else if (bytes < 1024 * 1024) {
        return (bytes / 1024).toFixed(1) + ' KB';
    } else if (bytes < 1024 * 1024 * 1024) {
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    } else {
        return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
    }
}

// Create a compact version of SVG by removing extra whitespace
function createCompactSVG(svgString) {
    if (!svgString) return '';
    
    // Remove newlines and unnecessary spaces
    let compact = svgString
        .replace(/>\s+</g, '><') // Remove whitespace between tags
        .replace(/\s+/g, ' ')    // Replace multiple spaces with single space
        .replace(/\s+>/g, '>')   // Remove spaces before closing brackets
        .replace(/<\s+/g, '<')   // Remove spaces after opening brackets
        .replace(/\s+=/g, '=')   // Remove spaces before equals
        .replace(/=\s+/g, '=')   // Remove spaces after equals
        .trim();                 // Trim any leading/trailing whitespace
    
    return compact;
}

// Update file size information on buttons
function updateFileSizeInfo() {
    // Force recalculation of the SVG strings if needed
    if (!svgCompactString && svgString) {
        svgCompactString = createCompactSVG(svgString);
    }
    
    // Calculate SVG sizes (making sure to get fresh calculations each time)
    const originalSize = new Blob([svgString || '']).size;
    const compactSize = new Blob([svgCompactString || '']).size;
    
    console.log("Original SVG size:", originalSize, "bytes");
    console.log("Compact SVG size:", compactSize, "bytes");
    
    // Update copy button based on active tab
    const activeTab = document.querySelector('.svg-tab.active').getAttribute('data-tab');
    if (activeTab === 'original') {
        copySvgBtn.textContent = `Copy SVG (${formatFileSize(originalSize)})`;
    } else {
        copySvgBtn.textContent = `Copy SVG (${formatFileSize(compactSize)})`;
    }
    
    // Update download SVG button - always shows original size
    downloadSvgButton.textContent = `Download SVG (${formatFileSize(originalSize)})`;
    
    // Calculate actual PNG size by generating the PNG data
    createTempPngAndGetSize().then(exactSize => {
        downloadPngButton.textContent = `Download PNG (${formatFileSize(exactSize)})`;
    }).catch(err => {
        console.error("Error calculating PNG size:", err);
        // Fallback to estimation if actual generation fails
        const rawSize = outputWidth * outputHeight * 4;
        const estimatedPngSize = Math.round(rawSize * 0.5);
        downloadPngButton.textContent = `Download PNG (${formatFileSize(estimatedPngSize)})`;
    });
}

// Function to create a temporary PNG and get its exact size
async function createTempPngAndGetSize() {
    return new Promise((resolve, reject) => {
        try {
            // Create a temporary canvas with the output dimensions
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = outputWidth;
            tempCanvas.height = outputHeight;
            const tempCtx = tempCanvas.getContext('2d');
            
            // Draw the result onto the temporary canvas at the output size
            tempCtx.drawImage(resultCanvas, 0, 0, processingWidth, processingHeight, 
                             0, 0, outputWidth, outputHeight);
            
            // Convert to PNG data URL
            const dataUrl = tempCanvas.toDataURL('image/png');
            
            // Calculate size from the data URL
            // Remove the data:image/png;base64, prefix and calculate byte size
            const base64 = dataUrl.split(',')[1];
            const byteSize = Math.ceil((base64.length * 3) / 4); // Base64 size to byte size conversion
            
            resolve(byteSize);
        } catch (error) {
            reject(error);
        }
    });
}

// Calculate elapsed time since optimization started
function getElapsedTime() {
    if (startTime === 0) return 0;
    return (Date.now() - startTime) / 1000; // Convert to seconds
}

// Update the result status text with time elapsed
function updateResultStatus(currentStep, totalSteps, similarity) {
    const elapsedTime = getElapsedTime().toFixed(1);
    const statusText = `Step ${currentStep}/${totalSteps} (${similarity.toFixed(1)}%) - ${elapsedTime}s`;
    resultStatusDiv.textContent = statusText;
}

// Function to handle dropped files
function handleDroppedFile(e) {
    e.preventDefault();
    
    // Remove dragover class from all potential drop targets
    document.querySelectorAll('.dragover').forEach(el => {
        el.classList.remove('dragover');
    });
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        const file = e.dataTransfer.files[0];
        const input = document.getElementById('image-upload');
        
        // Create a DataTransfer to programmatically set the file
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        input.files = dataTransfer.files;
        
        // Dispatch a change event to trigger the handler
        const event = new Event('change', { bubbles: true });
        input.dispatchEvent(event);
    }
}

// Function to trigger file upload dialog
function triggerFileUpload() {
    if (!isRunning) {
        document.getElementById('image-upload').click();
    }
}

// Set up drag-and-drop handlers for a target element
function setupDragAndDrop(target) {
    // Drag over
    target.addEventListener('dragover', (e) => {
        e.preventDefault();
        target.classList.add('dragover');
    });
    
    // Drag leave
    target.addEventListener('dragleave', (e) => {
        e.preventDefault();
        target.classList.remove('dragover');
    });
    
    // Drop
    target.addEventListener('drop', handleDroppedFile);
    
    // Click to upload
    target.addEventListener('click', triggerFileUpload);
}

// Load the default example image
function loadDefaultImage() {
    if (!sourceImage) {
        sourceImage = new Image();
        sourceImage.crossOrigin = "Anonymous"; // Handle CORS if needed
        
        sourceImage.onload = () => {
            updateCanvasSizes();
            drawOriginalImage();
            startButton.disabled = false;
            
            // Reset progress and status displays
            updateProgressBorder(0);
            resultStatusDiv.textContent = '';
        };
        
        sourceImage.onerror = (err) => {
            console.error("Error loading default image:", err);
            resultStatusDiv.textContent = 'Error loading default image';
        };
        
        // Load the example image
        sourceImage.src = './example-dolphin-input-cropped.jpg';
    }
}

// Event listeners
inputSizeSelect.addEventListener('change', function() {
    if (!isRunning) { // Only allow changes when not running
        updateCanvasSizes();
        // Input size affects processing, so we need to redraw
        if (sourceImage) {
            drawOriginalImage();
        }
    }
});

outputSizeSelect.addEventListener('change', function() {
    if (!isRunning) { // Only allow changes when not running
        // Only update the output dimensions, don't redraw canvas
        outputWidth = parseInt(outputSizeSelect.value, 10);
        outputHeight = outputWidth;
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length === 0) return;
    
    const file = e.target.files[0];
    const reader = new FileReader();
    
    reader.onload = (event) => {
        sourceImage = new Image();
        sourceImage.onload = () => {
            updateCanvasSizes();
            drawOriginalImage();
            startButton.disabled = false;
            
            // Reset progress and status displays
            updateProgressBorder(0);
            resultStatusDiv.textContent = '';
        };
        sourceImage.src = event.target.result;
    };
    
    reader.readAsDataURL(file);
});

startButton.addEventListener('click', startOptimization);
downloadSvgButton.addEventListener('click', downloadSvg);
downloadPngButton.addEventListener('click', downloadPng);

// Make sure the canvas is properly sized on window resize
window.addEventListener('resize', () => {
    enforceSquareWrappers();
    if (sourceImage) {
        resizeCanvasToFillWrapper(originalCanvas);
        resizeCanvasToFillWrapper(resultCanvas);
    }
});

// Draw the source image on the original canvas, filling the canvas
function drawOriginalImage() {
    if (!sourceImage) return;
    
    // Clear canvases
    originalCtx.clearRect(0, 0, originalCanvas.width, originalCanvas.height);
    resultCtx.clearRect(0, 0, resultCanvas.width, resultCanvas.height);
    
    try {
        // Calculate source dimensions for a square crop from center
        let sourceSize, sourceX, sourceY;
        if (sourceImage.width > sourceImage.height) {
            sourceSize = sourceImage.height;
            sourceX = (sourceImage.width - sourceSize) / 2;
            sourceY = 0;
        } else {
            sourceSize = sourceImage.width;
            sourceX = 0;
            sourceY = (sourceImage.height - sourceSize) / 2;
        }
        
        // Draw the cropped and resized image on the original canvas
        originalCtx.drawImage(
            sourceImage,
            sourceX, sourceY, sourceSize, sourceSize,
            0, 0, processingWidth, processingHeight
        );
        
        // Calculate average color for the result canvas
        const imageData = originalCtx.getImageData(0, 0, processingWidth, processingHeight);
        const data = imageData.data;
        let r = 0, g = 0, b = 0;
        const pixelCount = data.length / 4;
        
        for (let i = 0; i < data.length; i += 4) {
            r += data[i];
            g += data[i + 1];
            b += data[i + 2];
        }
        
        r = Math.round(r / pixelCount);
        g = Math.round(g / pixelCount);
        b = Math.round(b / pixelCount);
        
        // Fill the result canvas with the average color
        resultCtx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        resultCtx.fillRect(0, 0, resultCanvas.width, resultCanvas.height);
        
        // Remove empty class from wrappers
        document.getElementById('original-wrapper').classList.remove('empty');
        document.getElementById('result-wrapper').classList.remove('empty');
        
        // Make sure canvas display size fits wrapper
        resizeCanvasToFillWrapper(originalCanvas);
        resizeCanvasToFillWrapper(resultCanvas);
    } catch (error) {
        console.error("Error drawing image:", error);
        // If there's an error, try again with a simpler approach
        try {
            // Simple fallback - just stretch to fill
            originalCtx.drawImage(sourceImage, 0, 0, processingWidth, processingHeight);
            
            // Simple average color
            resultCtx.fillStyle = '#cccccc';
            resultCtx.fillRect(0, 0, resultCanvas.width, resultCanvas.height);
            
            document.getElementById('original-wrapper').classList.remove('empty');
            document.getElementById('result-wrapper').classList.remove('empty');
        } catch (fallbackError) {
            console.error("Fallback drawing also failed:", fallbackError);
        }
    }
}

// Create an ImageData from the original canvas
function getOriginalImageData() {
    return originalCtx.getImageData(0, 0, processingWidth, processingHeight);
}

// Validate shape selection
function validateShapeSelection() {
    // At least one shape type must be selected
    if (!useTrianglesCheckbox.checked && !useRectanglesCheckbox.checked && !useEllipsesCheckbox.checked) {
        alert("Please select at least one shape type.");
        return false;
    }
    return true;
}

// Disable all control elements during optimization
function disableControls(disable) {
    // Disable all form controls and buttons
    controlElements.forEach(element => {
        element.disabled = disable;
    });
    
    // Always disable download buttons if no SVG is available
    if (!svgString || disable) {
        downloadSvgButton.disabled = true;
        downloadPngButton.disabled = true;
    }
    
    // Specific logic for start button
    if (!disable) {
        // Only enable start button if there's a source image
        startButton.disabled = !sourceImage;
    }
    
    // Add visual indication that controls are disabled
    const controlsContainer = document.querySelector('.controls-container');
    if (disable) {
        controlsContainer.classList.add('processing');
    } else {
        controlsContainer.classList.remove('processing');
    }
}

// Prepare the WASM module and start optimization
async function startOptimization() {
    if (isRunning || !sourceImage) return;
    if (!validateShapeSelection()) return;
    
    try {
        isRunning = true;
        startTime = Date.now(); // Record start time
        disableControls(true);
        statusDiv.textContent = 'Initializing...';
        resultStatusDiv.textContent = 'Initializing...';
        updateProgressBorder(0);
        svgOutput.textContent = ''; // Clear previous SVG output
        svgOutputCompact.textContent = ''; // Clear compact SVG output
        
        // Load the Wasm module if not already loaded
        if (!wasmInstance) {
            try {
                wasmInstance = await PrimitiveModule();
            } catch (error) {
                throw new Error('Error loading WebAssembly module: ' + error.message);
            }
        }
        
        // Get parameters
        totalSteps = parseInt(document.getElementById('num-shapes').value, 10);
        const shapeCandidates = parseInt(document.getElementById('shape-candidates').value, 10);
        const numMutations = parseInt(document.getElementById('num-mutations').value, 10);
        
        // Reset current step counter
        currentStep = 0;
        
        // Get image data from the original canvas
        const imageData = getOriginalImageData();
        
        // Allocate memory for the image data in the Wasm module
        const targetDataPtr = wasmInstance._malloc(imageData.data.length);
        wasmInstance.HEAPU8.set(imageData.data, targetDataPtr);
        
        // Auto-detect background color (use white for now)
        const bgR = 255, bgG = 255, bgB = 255;
        
        // Get shape type selection
        const useTriangles = useTrianglesCheckbox.checked ? 1 : 0;
        const useRectangles = useRectanglesCheckbox.checked ? 1 : 0;
        const useEllipses = useEllipsesCheckbox.checked ? 1 : 0;
        
        // Create the optimizer - now correctly passing shape type selection
        optimizerPtr = wasmInstance.ccall(
            'create_optimizer',
            'number',
            ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
            [processingWidth, processingHeight, targetDataPtr, bgR, bgG, bgB, useTriangles, useRectangles, useEllipses]
        );
        
        // Free the allocated memory for the image data
        wasmInstance._free(targetDataPtr);
        
        // Run the optimization step by step to show progress
        const stepsPerBatch = 5;
        
        function runBatch() {
            if (currentStep >= totalSteps) {
                finalizeOptimization();
                return;
            }
            
            const batchSize = Math.min(stepsPerBatch, totalSteps - currentStep);
            
            // Run a batch of optimization steps
            wasmInstance.ccall(
                'run_optimization',
                null,
                ['number', 'number', 'number', 'number'],
                [optimizerPtr, batchSize, shapeCandidates, numMutations]
            );
            
            currentStep += batchSize;
            
            // Get the current similarity
            const similarity = wasmInstance.ccall(
                'get_current_similarity',
                'number',
                ['number'],
                [optimizerPtr]
            );
            
            // Update progress
            const progress = (currentStep / totalSteps) * 100;
            updateProgressBorder(progress);
            
            // Update status text with step count and elapsed time
            updateResultStatus(currentStep, totalSteps, similarity);
            
            // Update the result canvas
            updateResultCanvas();
            
            // Get current SVG and update output (for real-time updates)
            updateSvgOutput();
            
            // Schedule the next batch
            setTimeout(runBatch, 0);
        }
        
        // Start the optimization process
        runBatch();
    } catch (error) {
        console.error('Optimization error:', error);
        statusDiv.textContent = 'Error: ' + error.message;
        resultStatusDiv.textContent = 'Error';
        resetOptimizationState();
    }
}

// Update the SVG output area with current progress
function updateSvgOutput() {
    try {
        if (!wasmInstance || !optimizerPtr) return;
        
        // Get the SVG string
        const svgStrPtr = wasmInstance.ccall(
            'export_svg_string',
            'number',
            ['number'],
            [optimizerPtr]
        );
        
        if (!svgStrPtr) return;
        
        // Convert the C string to a JavaScript string
        let str = '';
        let idx = svgStrPtr;
        const max_length = 100000; // Safety limit
        let count = 0;
        
        while (wasmInstance.HEAPU8[idx] !== 0 && count < max_length) {
            str += String.fromCharCode(wasmInstance.HEAPU8[idx]);
            idx++;
            count++;
        }
        
        if (count >= max_length) {
            console.warn('SVG string truncated due to length limit');
        }
        
        // Update SVG with correct output dimensions
        str = str.replace(
            /width="(\d+)" height="(\d+)"/,
            `width="${outputWidth}" height="${outputHeight}"`
        );
        
        // Store both versions in variables 
        svgString = str;
        svgCompactString = createCompactSVG(str);
        
        console.log("Generated SVGs - Original:", svgString.length, "bytes, Compact:", svgCompactString.length, "bytes");
        
        // Display the SVG string in the output areas
        svgOutput.textContent = svgString;
        svgOutputCompact.textContent = svgCompactString;
        
        // Update file size information
        updateFileSizeInfo();
        
    } catch (error) {
        console.error('SVG output update error:', error);
    }
}

// Update the result canvas with the current state
function updateResultCanvas() {
    if (!wasmInstance || !optimizerPtr) return;
    
    try {
        // Get a pointer to the current image data
        const currentImagePtr = wasmInstance.ccall(
            'get_current_image',
            'number',
            ['number'],
            [optimizerPtr]
        );
        
        // Create a new ImageData
        const imageData = new ImageData(processingWidth, processingHeight);
        
        // Copy the data from the Wasm memory
        const dataView = new Uint8Array(wasmInstance.HEAPU8.buffer, currentImagePtr, processingWidth * processingHeight * 4);
        imageData.data.set(dataView);
        
        // Draw the image data to the canvas
        resultCtx.putImageData(imageData, 0, 0);
        
        // Make sure the result wrapper doesn't have empty class
        document.getElementById('result-wrapper').classList.remove('empty');
    } catch (error) {
        console.error('Canvas update error:', error);
    }
}

// Finalize the optimization and get the SVG output
function finalizeOptimization() {
    try {
        if (!wasmInstance || !optimizerPtr) {
            throw new Error('WebAssembly instance or optimizer not initialized');
        }
        
        // Get the SVG string
        const svgStrPtr = wasmInstance.ccall(
            'export_svg_string',
            'number',
            ['number'],
            [optimizerPtr]
        );
        
        if (!svgStrPtr) {
            throw new Error('Failed to get SVG output');
        }
        
        // Convert the C string to a JavaScript string
        let str = '';
        let idx = svgStrPtr;
        const max_length = 100000; // Safety limit
        let count = 0;
        
        while (wasmInstance.HEAPU8[idx] !== 0 && count < max_length) {
            str += String.fromCharCode(wasmInstance.HEAPU8[idx]);
            idx++;
            count++;
        }
        
        if (count >= max_length) {
            console.warn('SVG string truncated due to length limit');
        }
        
        svgString = str;
        console.log('SVG string length:', svgString.length);
        
        // Update SVG with correct output dimensions
        svgString = svgString.replace(
            /width="(\d+)" height="(\d+)"/,
            `width="${outputWidth}" height="${outputHeight}"`
        );
        
        // Display the SVG string in both output areas
        svgOutput.textContent = svgString;
        svgCompactString = createCompactSVG(svgString);
        svgOutputCompact.textContent = svgCompactString;
        
        // Update file size information
        updateFileSizeInfo();
        
        // Update status with final similarity and total time
        const similarity = wasmInstance.ccall(
            'get_current_similarity',
            'number',
            ['number'],
            [optimizerPtr]
        );
        
        const totalTime = getElapsedTime().toFixed(1);
        resultStatusDiv.textContent = `Complete: ${similarity.toFixed(1)}% similar - ${totalTime}s total`;
        
        // Ensure progress is shown as complete
        updateProgressBorder(100);
        
        resetOptimizationState();
    } catch (error) {
        console.error('Finalization error:', error);
        resultStatusDiv.textContent = 'Error';
        resetOptimizationState();
    }
}

// Reset state after optimization (success or failure)
function resetOptimizationState() {
    disableControls(false);
    
    // Enable download buttons if we have SVG content
    if (svgString) {
        downloadSvgButton.disabled = false;
        downloadPngButton.disabled = false;
        
        // Update file size information on buttons
        updateFileSizeInfo();
    }
    
    isRunning = false;
}

// Download the SVG file
function downloadSvg() {
    if (!svgString) return;
    
    try {
        // Always use the original SVG version, just update output dimensions
        let outputSvg = svgString.replace(
            /width="(\d+)" height="(\d+)"/,
            `width="${outputWidth}" height="${outputHeight}"`
        );
        
        const blob = new Blob([outputSvg], {type: 'image/svg+xml'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'primitive_art.svg';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('SVG download error:', error);
        alert('Error downloading SVG: ' + error.message);
    }
}

// Download the PNG file
function downloadPng() {
    if (!resultCanvas) return;
    
    try {
        // Create a temporary canvas with the output dimensions
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = outputWidth;
        tempCanvas.height = outputHeight;
        const tempCtx = tempCanvas.getContext('2d');
        
        // Draw the result onto the temporary canvas at the output size
        tempCtx.drawImage(resultCanvas, 0, 0, processingWidth, processingHeight, 
                          0, 0, outputWidth, outputHeight);
        
        // Use the temporary canvas for download
        const pngDataUrl = tempCanvas.toDataURL('image/png');
        
        // Calculate actual file size for updating button
        const base64Data = pngDataUrl.split(',')[1];
        const pngSize = Math.ceil((base64Data.length * 3) / 4);
        downloadPngButton.textContent = `Download PNG (${formatFileSize(pngSize)})`;
        
        // Create download link
        const a = document.createElement('a');
        a.href = pngDataUrl;
        a.download = 'primitive_art.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } catch (error) {
        console.error('PNG download error:', error);
        alert('Error downloading PNG: ' + error.message);
    }
}

// Clean up resources when the page is unloaded
window.addEventListener('unload', () => {
    try {
        if (wasmInstance && optimizerPtr) {
            wasmInstance.ccall(
                'free_optimizer',
                null,
                ['number'],
                [optimizerPtr]
            );
        }
    } catch (error) {
        console.error('Cleanup error:', error);
    }
});

// Initialize on load
function initialize() {
    // Initialize canvas sizes
    updateCanvasSizes();
    
    // Enforce square wrappers
    enforceSquareWrappers();
    
    // Disable download buttons initially
    downloadSvgButton.disabled = true;
    downloadPngButton.disabled = true;
    
    // Set up initial progress border
    updateProgressBorder(0);
    
    // Add resize observer to ensure canvases are always visible
    const resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
            if (entry.target.classList.contains('canvas-wrapper')) {
                const canvas = entry.target.querySelector('canvas');
                if (canvas) {
                    resizeCanvasToFillWrapper(canvas);
                }
            }
        }
    });
    
    // Observe both canvas wrappers
    document.querySelectorAll('.canvas-wrapper').forEach(wrapper => {
        resizeObserver.observe(wrapper);
    });
    
    // Clear any previous event listeners (to avoid duplicates)
    const dropTargets = [originalWrapper, resultWrapper, uploadLabel];
    
    // Set up drag and drop for all drop targets
    dropTargets.forEach(target => {
        setupDragAndDrop(target);
    });
    
    // Load the default image if no image is already loaded
    setTimeout(loadDefaultImage, 500); // Short delay to ensure page is fully loaded
}

// Run initialization when DOM is fully loaded
document.addEventListener('DOMContentLoaded', initialize);
// Also run on load to be extra safe
window.addEventListener('load', initialize);