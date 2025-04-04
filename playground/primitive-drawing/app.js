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
const resultStatusDiv = document.getElementById('result-status');
const svgOutput = document.getElementById('svg-output');
const svgOutputCompact = document.getElementById('svg-output-compact');
const copySuccessDiv = document.getElementById('copy-success');
const copySuccessCompactDiv = document.getElementById('copy-success-compact');
const inputSizeSelect = document.getElementById('input-size');
const outputSizeSelect = document.getElementById('output-size');
const copySvgBtn = document.getElementById('copy-svg-btn');
const useTrianglesCheckbox = document.getElementById('use-triangles');
const useRectanglesCheckbox = document.getElementById('use-rectangles');
const useEllipsesCheckbox = document.getElementById('use-ellipses');
const originalWrapper = document.getElementById('original-wrapper');
const resultWrapper = document.getElementById('result-wrapper');
const uploadLabel = document.getElementById('upload-label');

// Select all control elements
const controlElements = document.querySelectorAll('.form-grid select, .form-grid input, .form-group input, .button-group button, .upload-btn');

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
let isRunning = false;
let currentStep = 0;
let totalSteps = 0;
let startTime = 0;
let copyInProgress = false;
let rawSvgData = null; // Store raw SVG data for debugging

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initialize);
window.addEventListener('load', initialize);

// Initialize application
function initialize() {
  updateCanvasSizes();
  enforceSquareWrappers();
  resetButtons();
  updateProgressBorder(0);
  setupCanvasDragAndDrop(originalWrapper);
  setupCanvasDragAndDrop(resultWrapper);
  setupUploadButtonDragAndDrop(uploadLabel);
  setupShapeTypeToggles();
  setupSliders();
  setupTabs();
  setTimeout(loadDefaultImage, 500);
  
  // Observe canvas resize
  const resizeObserver = new ResizeObserver(entries => {
    entries.forEach(entry => {
      if (entry.target.classList.contains('canvas-wrapper')) {
        const canvas = entry.target.querySelector('canvas');
        if (canvas) resizeCanvasToFillWrapper(canvas);
      }
    });
  });
  
  document.querySelectorAll('.canvas-wrapper').forEach(wrapper => {
    resizeObserver.observe(wrapper);
  });
}

// Transform SVG shapes - convert polygons to rectangles and fix triangles
function transformSvgShapes(svgString) {
  if (!svgString) return '';
  
  try {
    // Create a DOM parser to properly handle the SVG
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgString, 'image/svg+xml');
    
    // Check for parsing errors
    const parserError = svgDoc.querySelector('parsererror');
    if (parserError) {
      console.error("SVG parsing error:", parserError.textContent);
      return svgString; // Return original if parsing fails
    }
    
    // Process all polygon elements
    svgDoc.querySelectorAll('polygon').forEach(polygon => {
      const points = polygon.getAttribute('points');
      if (!points) return;
      
      // Split points into an array of coordinates
      const coords = points.trim().split(/\s+|,/).map(parseFloat);
      
      // Check if this is a rectangle (4 points forming a rectangle)
      if (coords.length === 8) {
        // Extract the points
        const x1 = coords[0];
        const y1 = coords[1];
        const x2 = coords[2];
        const y2 = coords[3];
        const x3 = coords[4];
        const y3 = coords[5];
        const x4 = coords[6];
        const y4 = coords[7];
        
        // Check if these points form a rectangle (parallel sides)
        // This is a simple check - we're looking for points forming a rectangle
        if ((Math.abs(y1 - y2) < 0.001 && Math.abs(y3 - y4) < 0.001 && 
             Math.abs(x1 - x4) < 0.001 && Math.abs(x2 - x3) < 0.001)) {
          
          // Create a new rect element
          const rect = svgDoc.createElementNS("http://www.w3.org/2000/svg", "rect");
          
          // Set attributes
          rect.setAttribute("x", Math.min(x1, x2, x3, x4));
          rect.setAttribute("y", Math.min(y1, y2, y3, y4));
          rect.setAttribute("width", Math.abs(x2 - x1));
          rect.setAttribute("height", Math.abs(y3 - y2));
          rect.setAttribute("fill", polygon.getAttribute("fill"));
          
          // Replace the polygon with the rect
          polygon.parentNode.replaceChild(rect, polygon);
        }
      }
      // If it's a triangle (3 points), ensure its format is correct
      else if (coords.length === 6) {
        // Make sure the points are properly formatted with commas
        const formattedPoints = 
          `${coords[0]},${coords[1]} ${coords[2]},${coords[3]} ${coords[4]},${coords[5]}`;
        polygon.setAttribute('points', formattedPoints);
      }
    });
    
    // Set dimensions
    const svgRoot = svgDoc.documentElement;
    svgRoot.setAttribute('width', outputWidth);
    svgRoot.setAttribute('height', outputHeight);
    svgRoot.setAttribute('viewBox', `0 0 ${processingWidth} ${processingHeight}`);
    svgRoot.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    
    // Serialize back to string
    const serializer = new XMLSerializer();
    return serializer.serializeToString(svgDoc);
  } catch (error) {
    console.error("Error transforming SVG:", error);
    return svgString; // Return original on error
  }
}

// Setup tabs
function setupTabs() {
  document.querySelectorAll('.svg-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.svg-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.svg-content').forEach(c => c.classList.remove('active'));
      
      tab.classList.add('active');
      
      const tabId = tab.getAttribute('data-tab');
      document.getElementById(tabId + '-tab').classList.add('active');
      
      updateCopyButton();
    });
  });
  
  copySvgBtn.addEventListener('click', copyActiveSvg);
}

// Set up shape type toggle behavior
function setupShapeTypeToggles() {
  const shapeCheckboxes = [useTrianglesCheckbox, useRectanglesCheckbox, useEllipsesCheckbox];
  const labels = [
    document.getElementById('triangles-label'),
    document.getElementById('rectangles-label'),
    document.getElementById('ellipses-label')
  ];

  // Add event listeners to checkboxes
  shapeCheckboxes.forEach((checkbox, index) => {
    checkbox.addEventListener('change', function(e) {
      // Update active class
      labels[index].classList.toggle('active', this.checked);
      
      // Check if at least one shape type is selected
      const anySelected = shapeCheckboxes.some(cb => cb.checked);
      if (!anySelected) {
        // If none selected, re-enable the current one
        this.checked = true;
        labels[index].classList.add('active');
      }
    });
  });

  // Add click handlers for labels
  labels.forEach((label, index) => {
    label.addEventListener('click', function(e) {
      // Only toggle if click wasn't directly on the checkbox
      if (e.target.tagName !== 'INPUT') {
        const checkbox = shapeCheckboxes[index];
        checkbox.checked = !checkbox.checked;
        
        // Toggle active class
        label.classList.toggle('active', checkbox.checked);
        
        // Ensure at least one is selected
        const anySelected = shapeCheckboxes.some(cb => cb.checked);
        if (!anySelected) {
          checkbox.checked = true;
          label.classList.add('active');
        }
      }
    });
  });
}

// Setup sliders
function setupSliders() {
  setupSlider('shapes-slider', 'num-shapes');
  setupSlider('candidates-slider', 'shape-candidates');
  setupSlider('mutations-slider', 'num-mutations');
  
  // Set default values
  document.getElementById('num-shapes').value = 500;
  document.getElementById('shapes-slider').value = 500;
  document.getElementById('shape-candidates').value = 350;
  document.getElementById('candidates-slider').value = 350;
  document.getElementById('num-mutations').value = 50;
  document.getElementById('mutations-slider').value = 50;
  
  // Set default canvas size
  inputSizeSelect.value = "256";
  outputSizeSelect.value = "256";
}

// Helper for slider setup
function setupSlider(sliderId, inputId) {
  const slider = document.getElementById(sliderId);
  const input = document.getElementById(inputId);
  
  if (!slider || !input) return;
  
  // Update input when slider changes
  slider.addEventListener('input', function() {
    input.value = this.value;
  });
  
  // Update slider when input changes
  input.addEventListener('change', function() {
    let value = parseInt(this.value);
    const min = parseInt(slider.min);
    const max = parseInt(slider.max);
    
    if (isNaN(value)) value = slider.value;
    if (value < min) value = min;
    if (value > max) value = max;
    
    this.value = value;
    slider.value = value;
  });
}

// Reset button states
function resetButtons() {
  downloadSvgButton.disabled = true;
  downloadPngButton.disabled = true;
}

// Update canvas sizes
function updateCanvasSizes() {
  processingWidth = parseInt(inputSizeSelect.value, 10);
  processingHeight = processingWidth;
  
  outputWidth = parseInt(outputSizeSelect.value, 10);
  outputHeight = outputWidth;
  
  originalCanvas.width = processingWidth;
  originalCanvas.height = processingHeight;
  resultCanvas.width = processingWidth;
  resultCanvas.height = processingHeight;
}

// Enforce square wrappers
function enforceSquareWrappers() {
  document.querySelectorAll('.canvas-wrapper').forEach(wrapper => {
    wrapper.style.minWidth = '250px';
    wrapper.style.minHeight = '250px';
  });
}

// Resize canvas to fill wrapper
function resizeCanvasToFillWrapper(canvas) {
  canvas.style.width = '100%';
  canvas.style.height = '100%';
}

// Setup canvas drag and drop
function setupCanvasDragAndDrop(target) {
  target.addEventListener('dragover', (e) => {
    e.preventDefault();
    target.classList.add('dragover');
  });
  
  target.addEventListener('dragleave', (e) => {
    e.preventDefault();
    target.classList.remove('dragover');
  });
  
  target.addEventListener('drop', handleDroppedFile);
  
  if (target === originalWrapper) {
    target.addEventListener('click', triggerFileUpload);
  }
}

// Setup upload button drag and drop
function setupUploadButtonDragAndDrop(target) {
  target.addEventListener('dragover', (e) => {
    e.preventDefault();
    target.classList.add('dragover');
  });
  
  target.addEventListener('dragleave', (e) => {
    e.preventDefault();
    target.classList.remove('dragover');
  });
  
  target.addEventListener('drop', handleDroppedFile);
}

// Handle dropped file
function handleDroppedFile(e) {
  e.preventDefault();
  
  document.querySelectorAll('.dragover').forEach(el => {
    el.classList.remove('dragover');
  });
  
  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
    const file = e.dataTransfer.files[0];
    const input = document.getElementById('image-upload');
    
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    input.files = dataTransfer.files;
    
    const event = new Event('change', { bubbles: true });
    input.dispatchEvent(event);
  }
}

// Trigger file upload dialog
function triggerFileUpload() {
  if (!isRunning) {
    document.getElementById('image-upload').click();
  }
}

// Load default image
function loadDefaultImage() {
  if (!sourceImage) {
    sourceImage = new Image();
    sourceImage.crossOrigin = "Anonymous";
    
    sourceImage.onload = () => {
      updateCanvasSizes();
      drawOriginalImage();
      startButton.disabled = false;
      updateProgressBorder(0);
      resultStatusDiv.textContent = '';
    };
    
    sourceImage.onerror = (err) => {
      console.error("Error loading default image:", err);
      resultStatusDiv.textContent = 'Error loading default image';
    };
    
    sourceImage.src = './example-dolphin-input-cropped.jpg';
  }
}

// Draw original image
function drawOriginalImage() {
  if (!sourceImage) return;
  
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
    
    originalWrapper.classList.remove('empty');
    resultWrapper.classList.remove('empty');
    
    resizeCanvasToFillWrapper(originalCanvas);
    resizeCanvasToFillWrapper(resultCanvas);
  } catch (error) {
    console.error("Error drawing image:", error);
    // Simple fallback if there's an error
    try {
      originalCtx.drawImage(sourceImage, 0, 0, processingWidth, processingHeight);
      resultCtx.fillStyle = '#cccccc';
      resultCtx.fillRect(0, 0, resultCanvas.width, resultCanvas.height);
      
      originalWrapper.classList.remove('empty');
      resultWrapper.classList.remove('empty');
    } catch (fallbackError) {
      console.error("Fallback drawing also failed:", fallbackError);
    }
  }
}

// Update the progress border
function updateProgressBorder(progress) {
  progressBorder.style.setProperty('--progress', progress);
  
  // Update classes based on progress
  if (progress <= 25) {
    progressBorder.className = 'progress-border';
  } else if (progress <= 50) {
    progressBorder.className = 'progress-border right-visible';
  } else if (progress <= 75) {
    progressBorder.className = 'progress-border right-visible bottom-visible';
  } else if (progress < 100) {
    progressBorder.className = 'progress-border right-visible bottom-visible left-visible';
  } else {
    progressBorder.className = 'progress-border completed';
  }
}

// Format file size helper
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

// Create a compact version of SVG - preserve exact shape data
function createCompactSVG(svgString) {
  if (!svgString) return '';
  
  // Try to use the transformer to create a cleaner SVG
  try {
    // Create a DOM parser to properly handle the SVG
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgString, 'image/svg+xml');
    
    // Check for parsing errors
    const parserError = svgDoc.querySelector('parsererror');
    if (parserError) {
      console.error("SVG parsing error in compaction:", parserError.textContent);
      return basicCompactSvg(svgString);
    }
    
    // Remove whitespace from text nodes
    const removeWhitespace = (node) => {
      if (node.nodeType === 3) { // Text node
        node.textContent = node.textContent.trim();
      } else if (node.nodeType === 1) { // Element node
        Array.from(node.childNodes).forEach(removeWhitespace);
      }
    };
    
    removeWhitespace(svgDoc.documentElement);
    
    // Serialize back to string
    const serializer = new XMLSerializer();
    let output = serializer.serializeToString(svgDoc);
    
    // Basic string cleanup
    output = output.replace(/>\s+</g, '><').trim();
    
    return output;
  } catch (error) {
    console.error("Error in SVG compaction:", error);
    return basicCompactSvg(svgString);
  }
}

// Basic string-based SVG compaction as fallback
function basicCompactSvg(svgString) {
  return svgString
    .replace(/>\s+</g, '><')   // Remove whitespace between tags
    .replace(/\s+>/g, '>')     // Remove spaces before closing brackets
    .replace(/<\s+/g, '<')     // Remove spaces after opening brackets
    .trim();                   // Trim leading/trailing whitespace
}

// Update the result status
function updateResultStatus(currentStep, totalSteps, similarity) {
  const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
  const statusText = `Step ${currentStep}/${totalSteps} (${similarity.toFixed(1)}%) - ${elapsedTime}s`;
  resultStatusDiv.textContent = statusText;
  resultStatusDiv.style.display = 'block';
}

// Update file size information
function updateFileSizeInfo() {
  if (svgString) {
    const originalSize = new Blob([svgString || '']).size;
    const compactSize = new Blob([svgCompactString || '']).size;
    
    const activeTab = document.querySelector('.svg-tab.active').getAttribute('data-tab');
    if (activeTab === 'original') {
      copySvgBtn.textContent = `Copy SVG (${formatFileSize(originalSize)})`;
      svgOutput.textContent = svgString;
    } else {
      copySvgBtn.textContent = `Copy SVG (${formatFileSize(compactSize)})`;
      svgOutputCompact.textContent = svgCompactString;
    }
    
    downloadSvgButton.textContent = `Download SVG (${formatFileSize(originalSize)})`;
    
    // Calculate PNG size
    createTempPngAndGetSize().then(exactSize => {
      downloadPngButton.textContent = `Download PNG (${formatFileSize(exactSize)})`;
    }).catch(err => {
      console.error("Error calculating PNG size:", err);
      const rawSize = outputWidth * outputHeight * 4;
      const estimatedPngSize = Math.round(rawSize * 0.5);
      downloadPngButton.textContent = `Download PNG (${formatFileSize(estimatedPngSize)})`;
    });
  }
}

// Create temporary PNG and get size
async function createTempPngAndGetSize() {
  return new Promise((resolve, reject) => {
    try {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = outputWidth;
      tempCanvas.height = outputHeight;
      const tempCtx = tempCanvas.getContext('2d');
      
      // Draw the result at output size
      tempCtx.drawImage(resultCanvas, 0, 0, processingWidth, processingHeight, 
                       0, 0, outputWidth, outputHeight);
      
      const dataUrl = tempCanvas.toDataURL('image/png');
      const base64 = dataUrl.split(',')[1];
      const byteSize = Math.ceil((base64.length * 3) / 4);
      
      resolve(byteSize);
    } catch (error) {
      reject(error);
    }
  });
}

// Reset state after optimization
function resetOptimizationState() {
  disableControls(false);
  
  if (svgString) {
    downloadSvgButton.disabled = false;
    downloadPngButton.disabled = false;
    updateFileSizeInfo();
  }
  
  isRunning = false;
}

// Disable controls during processing
function disableControls(disable) {
  controlElements.forEach(element => {
    element.disabled = disable;
  });
  
  if (!svgString || disable) {
    downloadSvgButton.disabled = true;
    downloadPngButton.disabled = true;
  }
  
  if (!disable) {
    startButton.disabled = !sourceImage;
  }
}

// Get SVG string from optimizer with minimal processing
function getRawSvgFromOptimizer() {
  if (!wasmInstance || !optimizerPtr) return null;
  
  try {
    // Get the SVG string pointer
    const svgStrPtr = wasmInstance.ccall(
      'export_svg_string',
      'number',
      ['number'],
      [optimizerPtr]
    );
    
    if (!svgStrPtr) return null;
    
    // Convert the C string to a JavaScript string
    let str = '';
    let idx = svgStrPtr;
    const maxLength = 1000000; // Increased for safety
    let count = 0;
    
    while (wasmInstance.HEAPU8[idx] !== 0 && count < maxLength) {
      str += String.fromCharCode(wasmInstance.HEAPU8[idx]);
      idx++;
      count++;
    }
    
    // Store raw SVG for debugging
    rawSvgData = str;
    
    return str;
  } catch (error) {
    console.error('Error getting SVG from optimizer:', error);
    return null;
  }
}

// Process SVG - transform shapes and fix triangles
function processSvg(rawSvg) {
  if (!rawSvg) return;
  
  try {
    // Transform SVG - convert polygons to rectangles and fix triangles
    svgString = transformSvgShapes(rawSvg);
    svgCompactString = createCompactSVG(svgString);
    
    // Update output display
    svgOutput.textContent = svgString;
    svgOutputCompact.textContent = svgCompactString;
    updateFileSizeInfo();
  } catch (error) {
    console.error("Error processing SVG:", error);
  }
}

// Start optimization
async function startOptimization() {
  if (isRunning || !sourceImage) return;
  
  // Check that at least one shape type is selected
  if (!useTrianglesCheckbox.checked && !useRectanglesCheckbox.checked && !useEllipsesCheckbox.checked) {
    alert("Please select at least one shape type.");
    return;
  }
  
  try {
    isRunning = true;
    startTime = Date.now();
    disableControls(true);
    resultStatusDiv.textContent = 'Initializing...';
    resultStatusDiv.style.display = 'block';
    updateProgressBorder(0);
    svgOutput.textContent = '';
    svgOutputCompact.textContent = '';
    
    // Load WASM module if not already loaded
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
    
    // Get image data
    const imageData = originalCtx.getImageData(0, 0, processingWidth, processingHeight);
    
    // Allocate memory for the image data
    const targetDataPtr = wasmInstance._malloc(imageData.data.length);
    wasmInstance.HEAPU8.set(imageData.data, targetDataPtr);
    
    // Background color (white)
    const bgR = 255, bgG = 255, bgB = 255;
    
    // Shape type selection - explicit 0 or 1
    const useTriangles = useTrianglesCheckbox.checked ? 1 : 0;
    const useRectangles = useRectanglesCheckbox.checked ? 1 : 0;
    const useEllipses = useEllipsesCheckbox.checked ? 1 : 0;
    
    console.log(`Shape selection - Triangles: ${useTriangles}, Rectangles: ${useRectangles}, Ellipses: ${useEllipses}`);
    
    // Create the optimizer
    optimizerPtr = wasmInstance.ccall(
      'create_optimizer',
      'number',
      ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
      [processingWidth, processingHeight, targetDataPtr, bgR, bgG, bgB, useTriangles, useRectangles, useEllipses]
    );
    
    // Free the allocated memory
    wasmInstance._free(targetDataPtr);
    
    // Run optimization in batches
    const stepsPerBatch = 5;
    
    function runBatch() {
      if (currentStep >= totalSteps) {
        finalizeOptimization();
        return;
      }
      
      const batchSize = Math.min(stepsPerBatch, totalSteps - currentStep);
      
      // Run a batch of steps
      wasmInstance.ccall(
        'run_optimization',
        null,
        ['number', 'number', 'number', 'number'],
        [optimizerPtr, batchSize, shapeCandidates, numMutations]
      );
      
      currentStep += batchSize;
      
      // Get current similarity
      const similarity = wasmInstance.ccall(
        'get_current_similarity',
        'number',
        ['number'],
        [optimizerPtr]
      );
      
      // Update progress
      const progress = (currentStep / totalSteps) * 100;
      updateProgressBorder(progress);
      
      // Update status
      updateResultStatus(currentStep, totalSteps, similarity);
      
      // Update result canvas
      updateResultCanvas();
      
      // Get and process raw SVG
      const rawSvg = getRawSvgFromOptimizer();
      if (rawSvg) {
        processSvg(rawSvg);
      }
      
      // Schedule next batch
      setTimeout(runBatch, 0);
    }
    
    // Start optimization
    runBatch();
  } catch (error) {
    console.error('Optimization error:', error);
    resultStatusDiv.textContent = 'Error: ' + error.message;
    resultStatusDiv.style.display = 'block';
    resetOptimizationState();
  }
}

// Update the result canvas
function updateResultCanvas() {
  if (!wasmInstance || !optimizerPtr) return;
  
  try {
    // Get pointer to the current image data
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
    
    // Draw the image data
    resultCtx.putImageData(imageData, 0, 0);
    resultWrapper.classList.remove('empty');
  } catch (error) {
    console.error('Canvas update error:', error);
  }
}

// Finalize optimization
function finalizeOptimization() {
  try {
    // Get and process final SVG
    const finalSvg = getRawSvgFromOptimizer();
    if (finalSvg) {
      processSvg(finalSvg);
    }
    
    // Update final status
    const similarity = wasmInstance.ccall(
      'get_current_similarity',
      'number',
      ['number'],
      [optimizerPtr]
    );
    
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    resultStatusDiv.textContent = `Complete: ${similarity.toFixed(1)}% similar - ${totalTime}s total`;
    
    // Show complete progress
    updateProgressBorder(100);
    
    resetOptimizationState();
  } catch (error) {
    console.error('Finalization error:', error);
    resultStatusDiv.textContent = 'Error';
    resultStatusDiv.style.display = 'block';
    resetOptimizationState();
  }
}

// Download SVG
function downloadSvg() {
  if (!svgString) return;
  
  try {
    const blob = new Blob([svgString], {type: 'image/svg+xml'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'primitive-drawing-output.svg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('SVG download error:', error);
    alert('Error downloading SVG: ' + error.message);
  }
}

// Download PNG
function downloadPng() {
  if (!resultCanvas) return;
  
  try {
    // Create temp canvas with output dimensions
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = outputWidth;
    tempCanvas.height = outputHeight;
    const tempCtx = tempCanvas.getContext('2d');
    
    // Draw the result at output size
    tempCtx.drawImage(resultCanvas, 0, 0, processingWidth, processingHeight, 
                     0, 0, outputWidth, outputHeight);
    
    // Get data URL and download
    const pngDataUrl = tempCanvas.toDataURL('image/png');
    
    // Download
    const a = document.createElement('a');
    a.href = pngDataUrl;
    a.download = 'primitive-drawing-output.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (error) {
    console.error('PNG download error:', error);
    alert('Error downloading PNG: ' + error.message);
  }
}

// Clean up on unload
window.addEventListener('unload', () => {
  try {
    if (wasmInstance && optimizerPtr) {
      wasmInstance.ccall('free_optimizer', null, ['number'], [optimizerPtr]);
    }
  } catch (error) {
    console.error('Cleanup error:', error);
  }
});

// Event listeners
inputSizeSelect.addEventListener('change', function() {
  if (!isRunning) {
    updateCanvasSizes();
    if (sourceImage) {
      drawOriginalImage();
    }
  }
});

outputSizeSelect.addEventListener('change', function() {
  if (!isRunning) {
    outputWidth = parseInt(outputSizeSelect.value, 10);
    outputHeight = outputWidth;
    
    if (svgString && rawSvgData) {
      // Re-process SVG with new dimensions
      processSvg(rawSvgData);
    }
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
      updateProgressBorder(0);
      resultStatusDiv.textContent = '';
    };
    sourceImage.src = event.target.result;
  };
  
  reader.readAsDataURL(file);
});

resultWrapper.addEventListener('click', function(e) {
  if (sourceImage && !isRunning && resultStatusDiv.textContent.trim() !== '') {
    resultStatusDiv.style.display = resultStatusDiv.style.display === 'none' ? 'block' : 'none';
    e.stopPropagation();
  }
});

startButton.addEventListener('click', startOptimization);
downloadSvgButton.addEventListener('click', downloadSvg);
downloadPngButton.addEventListener('click', downloadPng);

// Handle window resize
window.addEventListener('resize', () => {
  enforceSquareWrappers();
  if (sourceImage) {
    resizeCanvasToFillWrapper(originalCanvas);
    resizeCanvasToFillWrapper(resultCanvas);
  }
});

// Update copy button based on active tab
function updateCopyButton() {
  const activeTab = document.querySelector('.svg-tab.active').getAttribute('data-tab');
  const copyBtn = document.getElementById('copy-svg-btn');
  
  if (activeTab === 'original') {
    const originalSize = new Blob([svgOutput.textContent || '']).size;
    copyBtn.textContent = `Copy SVG (${formatFileSize(originalSize)})`;
  } else {
    const compactSize = new Blob([svgOutputCompact.textContent || '']).size;
    copyBtn.textContent = `Copy SVG (${formatFileSize(compactSize)})`;
  }
}

// Copy active SVG tab content
function copyActiveSvg() {
  if (copyInProgress) return;
  copyInProgress = true;
  
  // Hide any previous success messages
  copySuccessDiv.classList.remove('visible');
  copySuccessCompactDiv.classList.remove('visible');
  
  const activeTab = document.querySelector('.svg-tab.active').getAttribute('data-tab');
  const content = activeTab === 'original' ? svgOutput.textContent : svgOutputCompact.textContent;
  const successElement = activeTab === 'original' ? copySuccessDiv : copySuccessCompactDiv;
  
  if (!content) {
    copyInProgress = false;
    return;
  }
  
  navigator.clipboard.writeText(content)
    .then(() => {
      successElement.classList.add('visible');
      setTimeout(() => {
        successElement.classList.remove('visible');
        copyInProgress = false;
      }, 1500);
    })
    .catch(err => {
      console.error('Failed to copy SVG:', err);
      copyInProgress = false;
      alert('Failed to copy SVG to clipboard');
    });
}






