const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mqtt = require('mqtt');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// --- Configuration ---
const CONFIG = {
  CAMERA_IP: '10.246.144.3', // ESP32-CAM IP Address
  CAMERA_PORT: '80',
};

// Middleware
app.use(cors());
app.use(express.json());
// public/script.js

document.addEventListener("DOMContentLoaded", () => {
  // --- Element References ---
  const connectionStatusEl = document.getElementById("connectionStatus");
  const cameraStreamEl = document.getElementById("cameraStream");
  const detectionOverlayEl = document.getElementById("detectionOverlay");
  const detectionCountEl = document.getElementById("detectionCount");
  const fpsEl = document.getElementById("fps");
  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");
  const distanceDisplayEl = document.getElementById("distanceDisplay");
  const sensorIndicatorEl = document.getElementById("sensorIndicator");
  const ledIndicatorEl = document.getElementById("ledIndicator");
  const ledStatusEl = document.getElementById("ledStatus");
  const cameraIndicatorEl = document.getElementById("cameraIndicator");
  const cameraStatusEl = document.getElementById("cameraStatus");
  const streamUrlEl = document.getElementById("streamUrl");

  // --- State ---
  let model = null;
  let detectionInterval = null;
  let isDetecting = false;
  const detectionFrameRate = 100; // ms, ~10 FPS

  // --- Socket.IO Connection ---
  const socket = io();

  socket.on("connect", () => {
    updateConnectionStatus(true);
    // Request initial state from server
    socket.emit("get-initial-state");
  });

  socket.on("disconnect", () => {
    updateConnectionStatus(false);
  });

  function updateConnectionStatus(isConnected) {
    if (isConnected) {
      connectionStatusEl.textContent = "✅ Connected to Server";
      connectionStatusEl.className = "connection-status connected";
    } else {
      connectionStatusEl.textContent = "❌ Disconnected from Server";
      connectionStatusEl.className = "connection-status disconnected";
    }
  }

  // --- System State Updates from Server ---
  socket.on("system-state", (state) => {
    console.log("Received initial system state:", state);
    updateDistance(state.distance);
    updateLedStatus(state.ledStatus);
    updateSensorStatus(state.sensorStatus);
    updateCameraStatus(state.cameraStatus);
  });

  socket.on("mqtt-distance", updateDistance);
  socket.on("mqtt-led-status", updateLedStatus);
  socket.on("mqtt-sensor-status", updateSensorStatus);
  socket.on("mqtt-camera-status", updateCameraStatus);

  // --- UI Update Functions ---
  function updateStatusIndicator(element, status) {
    element.className = "status-indicator " + status.toLowerCase();
  }

  function updateDistance(distance) {
    if (distance !== null && distance !== undefined) {
      distanceDisplayEl.innerHTML = `<div class="distance-value">${distance.toFixed(1)}<span>cm</span></div>`;
    } else {
      distanceDisplayEl.innerHTML = `<div class="loading">N/A</div>`;
    }
  }

  function updateLedStatus(status) {
    ledStatusEl.textContent = status;
    updateStatusIndicator(ledIndicatorEl, status === "ON" ? "online" : "offline");
  }

  function updateSensorStatus(status) {
    updateStatusIndicator(sensorIndicatorEl, status);
  }

  function updateCameraStatus(status) {
    cameraStatusEl.textContent = status;
    updateStatusIndicator(cameraIndicatorEl, status);
  }

  // --- Camera Stream & Object Detection ---
  const streamUrl = "/api/camera-stream";
  cameraStreamEl.src = streamUrl;
  streamUrlEl.textContent = window.location.origin + streamUrl;

  cameraStreamEl.onload = () => {
    console.log("Camera stream loaded.");
    // Match canvas size to the displayed image size
    detectionOverlayEl.width = cameraStreamEl.clientWidth;
    detectionOverlayEl.height = cameraStreamEl.clientHeight;
  };

  // Load TensorFlow.js model
  async function loadModel() {
    try {
      console.log("Loading YOLOv11n model...");
      // Ganti dengan path ke model Anda jika di-host secara lokal
      // Contoh: model = await tf.loadGraphModel('/model/yolov11n/model.json');
      // Untuk sekarang, kita gunakan placeholder. Anda harus mengganti ini.
      // Karena saya tidak memiliki model YOLOv11n, saya akan membuat fungsi deteksi palsu.
      // DI SINI ANDA HARUS MENGGANTI DENGAN KODE PEMUATAN MODEL TFJS ANDA
      console.warn("Using placeholder model. Replace with your actual YOLOv11n model loading code.");
      model = {
        // Ini adalah fungsi palsu. Ganti dengan `model.executeAsync` atau `model.detect`
        detect: async (img) => {
            // Simulasi deteksi objek
            if (Math.random() > 0.5) {
                const x = Math.random() * (img.width - 100);
                const y = Math.random() * (img.height - 80);
                const width = 80 + Math.random() * 20;
                const height = 70 + Math.random() * 10;
                return [{
                    bbox: [x, y, width, height],
                    class: 'vehicle',
                    score: Math.random() * 0.5 + 0.5 // score between 0.5 and 1.0
                }];
            }
            return [];
        }
      };
      console.log("Model loaded successfully.");
      startBtn.disabled = false;
      startBtn.textContent = "Start Detection";
    } catch (error) {
      console.error("Failed to load model:", error);
      startBtn.textContent = "Model Load Failed";
      startBtn.disabled = true;
    }
  }

  // Run detection on the camera stream
  async function runDetection() {
    if (!model || !isDetecting) return;

    const startTime = performance.now();

    // 1. Get image data from <img> tag
    const imageTensor = tf.browser.fromPixels(cameraStreamEl);

    // 2. Run inference
    // Ganti `model.detect` dengan metode yang sesuai untuk model Anda (misal: `model.executeAsync`)
    const predictions = await model.detect(imageTensor);

    // 3. Draw results on canvas
    drawDetections(predictions);

    // 4. Update stats
    detectionCountEl.textContent = predictions.length;
    const endTime = performance.now();
    const fps = 1000 / (endTime - startTime);
    fpsEl.textContent = fps.toFixed(1);

    // 5. Clean up tensors
    tf.dispose([imageTensor]);
  }

  // Draw bounding boxes and labels on the overlay canvas
  function drawDetections(predictions) {
    const ctx = detectionOverlayEl.getContext("2d");
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    predictions.forEach(prediction => {
      const [x, y, width, height] = prediction.bbox;
      const label = `${prediction.class} (${Math.round(prediction.score * 100)}%)`;

      // Bounding box
      ctx.strokeStyle = "#00FF00";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, width, height);

      // Label background
      ctx.fillStyle = "#00FF00";
      const textWidth = ctx.measureText(label).width;
      ctx.fillRect(x, y, textWidth + 4, 20);

      // Label text
      ctx.fillStyle = "#000000";
      ctx.font = "16px Arial";
      ctx.fillText(label, x + 2, y + 14);
    });
  }

  // --- Event Listeners ---
  startBtn.addEventListener("click", () => {
    isDetecting = true;
    startBtn.style.display = "none";
    stopBtn.style.display = "inline-block";
    detectionInterval = setInterval(runDetection, detectionFrameRate);
    console.log("Object detection started.");
  });

  stopBtn.addEventListener("click", () => {
    isDetecting = false;
    stopBtn.style.display = "none";
    startBtn.style.display = "inline-block";
    if (detectionInterval) {
      clearInterval(detectionInterval);
    }
    // Clear canvas
    const ctx = detectionOverlayEl.getContext("2d");
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    detectionCountEl.textContent = "0";
    fpsEl.textContent = "0";
    console.log("Object detection stopped.");
  });

  // --- Initialization ---
  startBtn.disabled = true;
  startBtn.textContent = "Loading Model...";
  loadModel();
});
app.use(express.static(path.join(__dirname, 'public')));

// MQTT Configuration
const MQTT_BROKER = 'mqtt://test.mosquitto.org';
const MQTT_TOPICS = {
  DISTANCE: 'SkripsiFuji/blindspot/sensor/distance',
  LED_STATUS: 'SkripsiFuji/blindspot/led_status',
  SENSOR_STATUS: 'SkripsiFuji/blindspot/sensor/status',
  CAMERA_STATUS: 'SkripsiFuji/blindspot/camera/status',
  WEB_COMMANDS: 'SkripsiFuji/blindspot/web/commands'
};

// Connect to MQTT broker
const mqttClient = mqtt.connect(MQTT_BROKER, {
  clientId: `blindspot-server-${Math.random().toString(16).substr(2, 8)}`,
  clean: true,
  connectTimeout: 4000,
  reconnectPeriod: 1000,
});

// System state
let systemState = {
  distance: null,
  ledStatus: 'OFF',
  sensorStatus: 'OFFLINE',
  cameraStatus: 'OFFLINE',
  lastUpdate: null
};

// MQTT Connection Events
mqttClient.on('connect', () => {
  console.log('✅ Connected to MQTT broker:', MQTT_BROKER);

  // Subscribe to all relevant topics
  Object.values(MQTT_TOPICS).forEach(topic => {
    if (topic !== MQTT_TOPICS.WEB_COMMANDS) {
      mqttClient.subscribe(topic, (err) => {
        if (err) {
          console.error(`❌ Failed to subscribe to ${topic}:`, err);
        } else {
          console.log(`📡 Subscribed to: ${topic}`);
        }
      });
    }
  });
});

mqttClient.on('error', (error) => {
  console.error('❌ MQTT connection error:', error);
});

mqttClient.on('offline', () => {
  console.log('⚠️ MQTT client is offline');
});

mqttClient.on('reconnect', () => {
  console.log('🔄 Reconnecting to MQTT broker...');
});

// MQTT Message Handler
mqttClient.on('message', (topic, message) => {
  const messageStr = message.toString();
  console.log(`📨 MQTT Message - Topic: ${topic}, Message: ${messageStr}`);

  // Update system state and broadcast to clients
    switch (topic) {
    case MQTT_TOPICS.DISTANCE:
      if (messageStr !== 'ERROR') {
        try {
          const payload = JSON.parse(messageStr);
          systemState.distance = payload.distance_cm || null;
        } catch (e) {
          console.error('❌ Failed to parse distance message JSON:', e);
          systemState.distance = null;
        }
      } else {
        systemState.distance = null;
      }
      systemState.lastUpdate = new Date().toISOString();
      io.emit('mqtt-distance', systemState.distance);
      break;


    case MQTT_TOPICS.LED_STATUS:
      systemState.ledStatus = messageStr;
      systemState.lastUpdate = new Date().toISOString();
      io.emit('mqtt-led-status', messageStr);
      break;

    case MQTT_TOPICS.SENSOR_STATUS:
      systemState.sensorStatus = messageStr;
      systemState.lastUpdate = new Date().toISOString();
      io.emit('mqtt-sensor-status', messageStr);
      break;

    case MQTT_TOPICS.CAMERA_STATUS:
      systemState.cameraStatus = messageStr;
      systemState.lastUpdate = new Date().toISOString();
      io.emit('mqtt-camera-status', messageStr);
      break;

    default:
      console.log(`⚠️ Unknown topic: ${topic}`);
  }
});

// Socket.IO Connection Handler
io.on('connection', (socket) => {
  console.log(`👤 Client connected: ${socket.id}`);

  // Send current system state to newly connected client
  socket.emit('system-state', systemState);

  // Handle commands from frontend
  socket.on('mqtt-command', (command) => {
    console.log(`📤 Publishing command: ${command}`);
    mqttClient.publish(MQTT_TOPICS.WEB_COMMANDS, JSON.stringify(command));
  });

  // Handle client disconnect
  socket.on('disconnect', () => {
    console.log(`👤 Client disconnected: ${socket.id}`);
  });

  // Handle ping for connection testing
  socket.on('ping', () => {
    socket.emit('pong', { timestamp: new Date().toISOString() });
  });
});

// --- Proxy for Camera Stream to avoid CORS issues ---
app.get('/api/camera-stream', (req, res) => {
  const options = {
    hostname: CONFIG.CAMERA_IP,
    port: CONFIG.CAMERA_PORT,
    path: '/stream',
    method: 'GET'
  };

  const proxyReq = http.request(options, (proxyRes) => {
    // Forward the headers from the camera to our client
    res.writeHead(proxyRes.statusCode, proxyRes.headers);

    // Pipe the data from the camera stream to our client's response
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (e) => {
    console.error(`❌ Proxy request error: ${e.message}`);
    if (!res.headersSent) {
      res.status(502).send('Bad Gateway: Could not connect to camera stream.');
    }
  });

  // If the client disconnects, abort the request to the camera to save resources.
  req.on('close', () => {
    console.log('👤 Client disconnected from stream, aborting proxy request.');
    proxyReq.destroy();
  });

  proxyReq.end();
});

// REST API Routes
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    data: {
      ...systemState,
      mqttConnected: mqttClient.connected,
      uptime: process.uptime()
    }
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    mqtt: mqttClient.connected ? 'connected' : 'disconnected'
  });
});

// Serve the frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err.stack);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Blind Spot Detection Server running on http://localhost:${PORT}`);
  console.log(`📊 System Dashboard: http://localhost:${PORT}`);
  console.log(`📡 MQTT Broker: ${MQTT_BROKER}`);
  console.log('📋 Topics:');
  Object.entries(MQTT_TOPICS).forEach(([key, topic]) => {
    console.log(`   ${key}: ${topic}`);
  });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');

  if (mqttClient.connected) {
    mqttClient.end();
  }

  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

module.exports = { app, server, io, mqttClient };
