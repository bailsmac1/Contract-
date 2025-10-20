// server.js
const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
app.use(express.static("public"));            // serve /public

// serve index.html at /
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// simple in-memory rooms
const rooms = new Map(); // roomId -> { players:Set<WebSocket>, started:boolean }

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { players: new Set(), started: false });
  }
  return rooms.get(roomId);
}

function broadcast(room, dataObj) {
  const msg = JSON.stringify(dataObj);
  for (const ws of room.players) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

// --- websocket handling ---
wss.on("connection", (ws) => {
  ws.roomId = null;
  ws.playerName = null;

  // greet (optional)
  ws.send(JSON.stringify({ type: "hello", message: "Welcome to Sakura Arcade!" }));

  ws.on("message", (raw) => {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      return; // ignore non-JSON
    }

    // join/create a room
    if (data.type === "join") {
      const roomId = (data.roomId || "").trim().toUpperCase();
      const name = (data.name || "Player").trim().slice(0, 20);

      if (!roomId) {
        ws.send(JSON.stringify({ type: "error", message: "Missing roomId" }));
        return;
      }
      const room = getRoom(roomId);

      // track attachment
      ws.roomId = roomId;
      ws.playerName = name;
      room.players.add(ws);

      // notify this client
      ws.send(JSON.stringify({ type: "joined", roomId, you: name }));
      // notify others
      broadcast(room, { type: "system", message: `${name} joined room ${roomId}` });
      // send roster
      broadcast(room, {
        type: "roster",
        players: [...room.players].map(p => p.playerName).filter(Boolean)
      });
      return;
    }

    // chat
    if (data.type === "chat") {
      if (!ws.roomId) return;
      const room = getRoom(ws.roomId);
      broadcast(room, { type: "chat", from: ws.playerName || "Player", text: data.text || "" });
      return;
    }

    // start game (minimal demo)
    if (data.type === "start") {
      if (!ws.roomId) return;
      const room = getRoom(ws.roomId);
      if (room.started) {
        ws.send(JSON.stringify({ type: "info", message: "Game already started." }));
        return;
      }
      // require 3–6 players
      if (room.players.size < 3 || room.players.size > 6) {
        ws.send(JSON.stringify({ type: "error", message: "Need 3–6 players to start." }));
        return;
      }
      room.started = true;
      broadcast(room, { type: "started", message: "Game started!" });
      return;
    }
  });

  ws.on("close", () => {
    const { roomId, playerName } = ws;
    if (roomId && rooms.has(roomId)) {
      const room = rooms.get(roomId);
      room.players.delete(ws);
      broadcast(room, { type: "system", message: `${playerName || "Player"} left.` });
      // update roster
      broadcast(room, {
        type: "roster",
        players: [...room.players].map(p => p.playerName).filter(Boolean)
      });
      if (room.players.size === 0) rooms.delete(roomId); // tidy up
    }
  });
});

// helpful error logs instead of silent crashes
process.on("uncaughtException", (err) => {
  console.error("uncaughtException:", err);
});
process.on("unhandledRejection", (err) => {
  console.error("unhandledRejection:", err);
});

// PORT from Render, fallback for local
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
