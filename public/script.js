// path: public/js/app.js

// Configuration
const CONFIG = {
    YOLO_THRESHOLD: 0.3,
    DETECTION_CLASSES: ['Mobil', 'PengendaraMotor', 'pejalan kaki']
};

// Global variables
let socket;
let model;
let isDetecting = false;
let lastFrameTime = 0;
let systemData = {
    distance: null,
    ledStatus: 'OFF',
    sensorStatus: 'OFFLINE',
    cameraStatus: 'OFFLINE'
};

let rafId = null; // track requestAnimationFrame id

// DOM elements
const elements = {
    cameraStream: document.getElementById('cameraStream'),
    detectionOverlay: document.getElementById('detectionOverlay'),
    startBtn: document.getElementById('startBtn'),
    stopBtn: document.getElementById('stopBtn'),
    connectionStatus: document.getElementById('connectionStatus'),
    distanceDisplay: document.getElementById('distanceDisplay'),
    sensorStatus: document.getElementById('sensorStatus'),
    sensorIndicator: document.getElementById('sensorIndicator'),
    ledStatus: document.getElementById('ledStatus'),
    ledIndicator: document.getElementById('ledIndicator'),
    ledIcon: document.getElementById('ledIcon'),
    cameraStatus: document.getElementById('cameraStatus'),
    cameraIndicator: document.getElementById('cameraIndicator'),
    cameraIcon: document.getElementById('cameraIcon'),
    streamUrl: document.getElementById('streamUrl')
};

// Initialize application
async function init() {
    console.log('🚀 Initializing Blind Spot Detection System...');

    // Setup Socket.IO connection
    setupSocketConnection();

    // Setup camera stream
    setupCameraStream();

    // Load YOLO model
    await loadYOLOModel();

    // Setup event listeners
    setupEventListeners();

    // Add canvas context-lost handler to fail-safe
    if (elements.detectionOverlay) {
        elements.detectionOverlay.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            console.warn('⚠️ WebGL context lost. Stopping detection to prevent further errors.');
            stopDetection();
        });
    }

    console.log('✅ System initialized successfully');
}

// Socket.IO connection setup
function setupSocketConnection() {
    socket = io();

    socket.on('connect', () => {
        console.log('✅ Connected to server');
        updateConnectionStatus('Connected', 'online');
    });

    socket.on('disconnect', () => {
        console.log('❌ Disconnected from server');
        updateConnectionStatus('Disconnected', 'offline');
    });

    // MQTT data handlers
    socket.on('mqtt-distance', (distance) => {
        console.log('📏 Distance update:', distance);
        updateDistanceDisplay(distance);
    });

    socket.on('mqtt-led-status', (status) => {
        console.log('💡 LED status update:', status);
        try {
            let parsedStatus = status;
            if (typeof status === 'string') {
                try {
                    parsedStatus = JSON.parse(status);
                } catch {
                    parsedStatus = status;
                }
            }
            if (typeof parsedStatus === 'string') {
                const match = parsedStatus.match(/"led_status"\s*:\s*"(\w+)"/);
                if (match) {
                    updateLEDStatus(match[1]);
                    return;
                } else {
                    updateLEDStatus('OFF');
                    return;
                }
            }
            updateLEDStatus(parsedStatus.led_status || parsedStatus.ledStatus || 'OFF');
        } catch (error) {
            console.error('Error parsing LED status:', error);
            updateLEDStatus('OFF');
        }
    });

    socket.on('mqtt-sensor-status', (status) => {
        console.log('📡 Sensor status update:', status);
        updateSensorStatus(status);
    });

    socket.on('mqtt-camera-status', (status) => {
        console.log('📷 Camera status update:', status);
        updateCameraStatus(status);
    });

    socket.on('system-state', (state) => {
        console.log('📊 System state update:', state);
        systemData = { ...systemData, ...state };
        updateAllDisplays();
    });
}

// Camera stream setup
function setupCameraStream() {
    const streamUrl = '/api/camera-stream';
    elements.cameraStream.src = streamUrl;
    elements.streamUrl.textContent = streamUrl;

    elements.cameraStream.onload = () => {
        console.log('📹 Camera stream loaded');
        setupDetectionCanvas();
    };

    elements.cameraStream.onerror = () => {
        console.error('❌ Failed to load camera stream');
        elements.cameraStream.alt = 'Camera stream unavailable';
    };
}

// Setup detection canvas
function setupDetectionCanvas() {
    const canvas = elements.detectionOverlay;
    const img = elements.cameraStream;

    canvas.width = img.naturalWidth || 480;
    canvas.height = img.naturalHeight || 320;

    console.log(`🖼️ Canvas size: ${canvas.width}x${canvas.height}`);
}

// Load YOLO model
async function loadYOLOModel() {
    try {
        console.log('🤖 Loading YOLOv11n model...');
        model = await tf.loadGraphModel('best_web_model/model.json');
        console.log('✅ YOLO model loaded successfully');
    } catch (error) {
        console.warn('⚠️ Could not load YOLO model:', error);
        console.log('🔄 Running in simulation mode');
        model = null;
    }
}

// Event listeners setup
function setupEventListeners() {
    elements.startBtn.addEventListener('click', startDetection);
    elements.stopBtn.addEventListener('click', stopDetection);
}

// Start detection
async function startDetection() {
    if (isDetecting) return;

    console.log('▶️ Starting detection...');
    isDetecting = true;
    elements.startBtn.style.display = 'none';
    elements.stopBtn.style.display = 'block';

    // optional: log backend
    if (window.tf) {
        console.log('TF backend:', tf.getBackend(), 'numTensors:', tf.memory().numTensors);
    }

    detectObjects();
}

// Stop detection
function stopDetection() {
    console.log('⏹️ Stopping detection...');
    isDetecting = false;
    elements.startBtn.style.display = 'block';
    elements.stopBtn.style.display = 'none';

    // cancel pending animation frame
    if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
    }

    // Clear canvas
    const canvas = elements.detectionOverlay;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // small debug log of tensors
    if (window.tf) {
        console.log('TF memory after stop:', tf.memory());
    }
}

// Object detection loop
async function detectObjects() {
    if (!isDetecting) return;

    try {
        // Calculate FPS - removed as per user request

        if (model) {
            // Real YOLO detection
            await performRealDetection();
        } else {
            // Simulation mode detection removed as per user request
        }

        // Log tensor count occasionally for debugging (every ~60 frames)
        if (window.tf && (lastFrameTime % 60000 < 1000)) {
            console.log('TF memory:', tf.memory());
        }

        // Continue detection loop and keep rafId for canceling
        rafId = requestAnimationFrame(detectObjects);

    } catch (error) {
        console.error('❌ Detection error:', error);
        // Avoid tight infinite loop on error
        setTimeout(() => { if (isDetecting) detectObjects(); }, 200);
    }
}

// Real YOLO detection (when model is loaded)
async function performRealDetection() {
    const img = elements.cameraStream;
    if (!img.complete || !img.naturalWidth) return;

    // Preprocess image in tidy to auto-dispose intermediate tensors
    const batched = tf.tidy(() => {
        // keep only the preprocessed tensor out of tidy
        return tf.browser.fromPixels(img)
            .resizeNearestNeighbor([480, 480])
            .expandDims(0)
            .toFloat()
            .div(255.0);
    });

    let predictionTensor = null;
    let predictionsData = null;

    try {
        // model.predict usually returns a tensor (or array of tensors)
        predictionTensor = model.predict(batched);

        // handle both single tensor or array of tensors
        if (Array.isArray(predictionTensor)) {
            // collect data from each tensor then concatenate if needed
            const dataArrays = await Promise.all(predictionTensor.map(t => t.data()));
            // if your model returns a single concatenated output, flatten here; for now assume single output -> take first
            predictionsData = dataArrays[0]; // adapt if needed
        } else {
            // single tensor
            predictionsData = await predictionTensor.data();
        }

        // Process predictions and draw bounding boxes
        const detections = processYOLOOutput(predictionsData);
        drawDetections(detections);

        // detectionCount and UI update removed as per user request

    } finally {
        // Dispose everything created
        try { batched.dispose(); } catch (e) {}
        if (predictionTensor) {
            if (Array.isArray(predictionTensor)) predictionTensor.forEach(t => t.dispose && t.dispose());
            else predictionTensor.dispose && predictionTensor.dispose();
        }
        // debug: show number of active tensors
        if (window.tf) {
            console.log('TF memory (post-inference):', tf.memory());
        }
    }
}

// Draw detection bounding boxes
function drawDetections(detections) {
    const canvas = elements.detectionOverlay;
    const ctx = canvas.getContext('2d');

    const colorMap = {
        'Mobil': 'blue',
        'PengendaraMotor': 'red',
        'pejalan kaki': 'purple'
    };

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    detections.forEach(detection => {
        const { x, y, width, height, class: className, confidence } = detection;

        // Scale y and height to match canvas size (480x320)
        const scaledY = y * (canvas.height / 480);
        const scaledHeight = height * (canvas.height / 480);

        // Get color for the class
        const color = colorMap[className] || '#ff0000';

        // Draw bounding box
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(x, scaledY, width, scaledHeight);

        // Draw label background
        const label = `${className} (${(confidence * 100).toFixed(1)}%)`;
        ctx.font = '14px Arial';
        const labelWidth = ctx.measureText(label).width;

        ctx.fillStyle = color;
        ctx.fillRect(x, scaledY - 25, labelWidth + 10, 25);

        // Draw label text
        ctx.fillStyle = '#ffffff';
        ctx.fillText(label, x + 5, scaledY - 8);
    });
}

// Process YOLO output (assuming [num_boxes, 8] format: x, y, w, h, conf, c0, c1, c2)
function processYOLOOutput(predictions) {
    const detections = [];
    if (!predictions || !predictions.length) return detections;

    const numBoxes = Math.floor(predictions.length / 8);

    for (let i = 0; i < numBoxes; i++) {
        const offset = i * 8;
        const x_norm = predictions[offset + 0];
        const y_norm = predictions[offset + 1];
        const w_norm = predictions[offset + 2];
        const h_norm = predictions[offset + 3];
        const conf = predictions[offset + 4];
        const class_scores = [
            predictions[offset + 5],
            predictions[offset + 6],
            predictions[offset + 7]
        ];

        if (conf > CONFIG.YOLO_THRESHOLD) {
            const classId = class_scores.indexOf(Math.max(...class_scores));
            const className = CONFIG.DETECTION_CLASSES[classId] || 'unknown';
            detections.push({
                x: x_norm * 480,
                y: y_norm * 480,
                width: w_norm * 480,
                height: h_norm * 480,
                confidence: conf,
                class: className
            });
        }
    }

    return detections;
}

// Update functions
function updateConnectionStatus(status, type) {
    elements.connectionStatus.textContent = `Server: ${status}`;
    elements.connectionStatus.className = `connection-status ${type}`;
}

function updateDistanceDisplay(distance) {
    systemData.distance = distance;

    if (distance === null || distance === undefined) {
        elements.distanceDisplay.innerHTML = '<div class="loading">No Data</div>';
        elements.distanceDisplay.className = 'distance-display distance-error';
    } else {
        elements.distanceDisplay.innerHTML = `${distance} cm`;

        if (distance < 450) {
            elements.distanceDisplay.className = 'distance-display distance-danger';
        } else {
            elements.distanceDisplay.className = 'distance-display distance-safe';
        }
    }
}

function updateSensorStatus(status) {
    systemData.sensorStatus = status;

    if (elements.sensorStatus) {
        elements.sensorStatus.textContent = status;
    }

    if (status === 'ONLINE') {
        elements.sensorIndicator.className = 'status-indicator status-online';
    } else {
        elements.sensorIndicator.className = 'status-indicator status-offline';
    }
}

function updateLEDStatus(status) {
    systemData.ledStatus = status;
    elements.ledStatus.textContent = status;

    if (status === 'ON') {
        elements.ledIndicator.className = 'status-indicator status-on';
        elements.ledIcon.textContent = '💡';
        elements.ledIcon.style.filter = 'drop-shadow(0 0 10px orange)';
    } else {
        elements.ledIndicator.className = 'status-indicator status-off';
        elements.ledIcon.textContent = '🔘';
        elements.ledIcon.style.filter = 'none';
    }
}

function updateCameraStatus(status) {
    systemData.cameraStatus = status;
    elements.cameraStatus.textContent = status;

    if (status === 'ONLINE') {
        elements.cameraIndicator.className = 'status-indicator status-online';
        elements.cameraIcon.textContent = '📹';
    } else {
        elements.cameraIndicator.className = 'status-indicator status-offline';
        elements.cameraIcon.textContent = '📷';
    }
}

function updateAllDisplays() {
    updateDistanceDisplay(systemData.distance);
    updateSensorStatus(systemData.sensorStatus);
    updateLEDStatus(systemData.ledStatus);
    updateCameraStatus(systemData.cameraStatus);
}

// Helper: optionally force CPU backend for debugging
async function forceCPUBackendIfTFjs() {
    if (window.tf) {
        try {
            await tf.setBackend('cpu');
            await tf.ready();
            console.log('TF.js backend switched to', tf.getBackend());
        } catch (e) {
            console.warn('Unable to switch TF backend:', e);
        }
    }
}

// Start the application
document.addEventListener('DOMContentLoaded', init);
