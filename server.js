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

const rooms = {};

wss.on("connection", (ws) => {
  console.log("Client connected");

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);

      // When someone joins a room
      if (data.type === "join") {
        ws.room = data.room;
        if (!rooms[ws.room]) rooms[ws.room] = [];
        rooms[ws.room].push(ws);
        console.log(`Client joined room ${ws.room}`);
      }

      // When someone sends a chat message
      if (data.type === "chat" && ws.room && rooms[ws.room]) {
        rooms[ws.room].forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: "chat",
              sender: data.sender,
              text: data.text
            }));
          }
        });
      }
    } catch (err) {
      console.error("Error handling message:", err);
    }
  });

  ws.on("close", () => {
    if (ws.room && rooms[ws.room]) {
      rooms[ws.room] = rooms[ws.room].filter(c => c !== ws);
    }
    console.log("Client disconnected");
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
