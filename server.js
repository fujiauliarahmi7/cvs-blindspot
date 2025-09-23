const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const mqtt = require("mqtt");
const cors = require("cors");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// --- Configuration ---
const CONFIG = {
  CAMERA_IP: "10.240.215.3", // ESP32-CAM IP Address
  CAMERA_PORT: "80",
};

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// MQTT Configuration
const MQTT_BROKER = "mqtt://test.mosquitto.org";
const MQTT_TOPICS = {
  DISTANCE: "SkripsiFuji/blindspot/sensor/distance",
  LED_STATUS: "SkripsiFuji/blindspot/led_status",
  SENSOR_STATUS: "SkripsiFuji/blindspot/sensor/status",
  CAMERA_STATUS: "SkripsiFuji/blindspot/camera/status",
  WEB_COMMANDS: "SkripsiFuji/blindspot/web/commands",
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
  ledStatus: "OFF",
  sensorStatus: "OFFLINE",
  cameraStatus: "OFFLINE",
  lastUpdate: null,
};

// MQTT Connection Events
mqttClient.on("connect", () => {
  console.log("✅ Connected to MQTT broker:", MQTT_BROKER);

  // Subscribe to all relevant topics
  Object.values(MQTT_TOPICS).forEach((topic) => {
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

mqttClient.on("error", (error) => {
  console.error("❌ MQTT connection error:", error);
});

mqttClient.on("offline", () => {
  console.log("⚠️ MQTT client is offline");
});

mqttClient.on("reconnect", () => {
  console.log("🔄 Reconnecting to MQTT broker...");
});

// MQTT Message Handler
mqttClient.on("message", (topic, message) => {
  const messageStr = message.toString();
  console.log(`📨 MQTT Message - Topic: ${topic}, Message: ${messageStr}`);

  // Update system state and broadcast to clients
  switch (topic) {
    case MQTT_TOPICS.DISTANCE:
      if (messageStr !== "ERROR") {
        try {
          const payload = JSON.parse(messageStr);
          systemState.distance = payload.distance_cm || null;
        } catch (e) {
          console.error("❌ Failed to parse distance message JSON:", e);
          systemState.distance = null;
        }
      } else {
        systemState.distance = null;
      }
      systemState.lastUpdate = new Date().toISOString();
      io.emit("mqtt-distance", systemState.distance);
      break;

    case MQTT_TOPICS.LED_STATUS:
      systemState.ledStatus = messageStr;
      systemState.lastUpdate = new Date().toISOString();
      io.emit("mqtt-led-status", messageStr);
      break;

    case MQTT_TOPICS.SENSOR_STATUS:
      systemState.sensorStatus = messageStr;
      systemState.lastUpdate = new Date().toISOString();
      io.emit("mqtt-sensor-status", messageStr);
      break;

    case MQTT_TOPICS.CAMERA_STATUS:
      systemState.cameraStatus = messageStr;
      systemState.lastUpdate = new Date().toISOString();
      io.emit("mqtt-camera-status", messageStr);
      break;

    default:
      console.log(`⚠️ Unknown topic: ${topic}`);
  }
});

// Socket.IO Connection Handler
io.on("connection", (socket) => {
  console.log(`👤 Client connected: ${socket.id}`);

  // Send current system state to newly connected client
  socket.emit("system-state", systemState);

  // Handle commands from frontend
  socket.on("mqtt-command", (command) => {
    console.log(`📤 Publishing command: ${command}`);
    mqttClient.publish(MQTT_TOPICS.WEB_COMMANDS, JSON.stringify(command));
  });

  // Handle client disconnect
  socket.on("disconnect", () => {
    console.log(`👤 Client disconnected: ${socket.id}`);
  });

  // Handle ping for connection testing
  socket.on("ping", () => {
    socket.emit("pong", { timestamp: new Date().toISOString() });
  });
});

// --- Proxy for Camera Stream to avoid CORS issues ---
app.get("/api/camera-stream", (req, res) => {
  const options = {
    hostname: CONFIG.CAMERA_IP,
    port: CONFIG.CAMERA_PORT,
    path: "/stream",
    method: "GET",
  };

  const proxyReq = http.request(options, (proxyRes) => {
    // Forward the headers from the camera to our client
    res.writeHead(proxyRes.statusCode, proxyRes.headers);

    // Pipe the data from the camera stream to our client's response
    proxyRes.pipe(res);
  });

  proxyReq.on("error", (e) => {
    console.error(`❌ Proxy request error: ${e.message}`);
    if (!res.headersSent) {
      res.status(502).send("Bad Gateway: Could not connect to camera stream.");
    }
  });

  // If the client disconnects, abort the request to the camera to save resources.
  req.on("close", () => {
    console.log("👤 Client disconnected from stream, aborting proxy request.");
    proxyReq.destroy();
  });

  proxyReq.end();
});

// REST API Routes
app.get("/api/status", (req, res) => {
  res.json({
    success: true,
    data: {
      ...systemState,
      mqttConnected: mqttClient.connected,
      uptime: process.uptime(),
    },
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    mqtt: mqttClient.connected ? "connected" : "disconnected",
  });
});

// Serve the frontend
app.get("/", (req, res) => {
  res.sendFile("/public/index.html");
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("❌ Server error:", err.stack);
  res.status(500).json({
    success: false,
    error: "Internal server error",
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(
    `🚀 Blind Spot Detection Server running on http://localhost:${PORT}`
  );
  console.log(`📊 System Dashboard: http://localhost:${PORT}`);
  console.log(`📡 MQTT Broker: ${MQTT_BROKER}`);
  console.log("📋 Topics:");
  Object.entries(MQTT_TOPICS).forEach(([key, topic]) => {
    console.log(`   ${key}: ${topic}`);
  });
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down gracefully...");

  if (mqttClient.connected) {
    mqttClient.end();
  }

  server.close(() => {
    console.log("✅ Server closed");
    process.exit(0);
  });
});

module.exports = { app, server, io, mqttClient };
