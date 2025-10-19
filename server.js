const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
app.use(express.static("public"));
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// --- simple socket test ---
wss.on("connection", (ws) => {
  console.log("Client connected");
  ws.send("Welcome to Sakura Arcade!");
  ws.on("close", () => console.log("Client disconnected"));
});

// --- handle errors clearly ---
process.on("uncaughtException", (err) => console.error("Uncaught:", err));
process.on("unhandledRejection", (err) => console.error("Unhandled:", err));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
