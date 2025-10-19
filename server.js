const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
app.use(express.static("public"));
app.get("/", (req, res) => res.sendFile(__dirname + "/public/index.html"));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// roomId -> [ws, ws, ...]
const rooms = {};

function broadcastToRoom(roomId, payload) {
  const list = rooms[roomId] || [];
  const data = JSON.stringify(payload);
  for (const client of list) {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  }
}

wss.on("connection", (ws) => {
  ws.room = null;
  ws.name = "Player";

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);

      // join a room
      if (data.type === "join") {
        ws.room = String(data.room || "").toUpperCase();
        ws.name = String(data.name || "Player");
        rooms[ws.room] ||= [];
        rooms[ws.room].push(ws);

        // notify just this user they joined
        ws.send(JSON.stringify({ type: "system", text: `Joined room ${ws.room}` }));
        // announce to room
        broadcastToRoom(ws.room, { type: "chat", sender: "System", text: `${ws.name} joined.` });
      }

      // chat to room
      if (data.type === "chat" && ws.room) {
        broadcastToRoom(ws.room, { type: "chat", sender: data.sender || ws.name, text: data.text || "" });
      }

      // start game signal
      if (data.type === "start" && ws.room) {
        broadcastToRoom(ws.room, { type: "start", sender: data.sender || ws.name });
      }

    } catch (e) {
      console.error("Bad message:", e);
    }
  });

  ws.on("close", () => {
    if (ws.room && rooms[ws.room]) {
      rooms[ws.room] = rooms[ws.room].filter((c) => c !== ws);
      broadcastToRoom(ws.room, { type: "chat", sender: "System", text: `${ws.name} left.` });
      if (rooms[ws.room].length === 0) delete rooms[ws.room];
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
