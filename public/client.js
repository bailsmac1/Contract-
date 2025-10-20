// public/client.js

let ws;
let roomId = null;
let playerName = null;

const chatBox = document.getElementById("chat");
const chatInput = document.getElementById("chatInput");
const playersDiv = document.getElementById("players");
const statusDiv = document.getElementById("status");
const startButton = document.getElementById("startButton");
const joinButton = document.getElementById("joinButton");
const createButton = document.getElementById("createButton");

function logChat(message) {
  const p = document.createElement("p");
  p.textContent = message;
  chatBox.appendChild(p);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function updatePlayers(list) {
  playersDiv.innerHTML = "";
  list.forEach((name) => {
    const li = document.createElement("p");
    li.textContent = name;
    playersDiv.appendChild(li);
  });
}

function connectWS() {
  ws = new WebSocket(
    (location.protocol === "https:" ? "wss://" : "ws://") + location.host
  );

  ws.onopen = () => {
    logChat("Connected to server.");
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    switch (data.type) {
      case "hello":
        logChat(data.message);
        break;
      case "joined":
        logChat(`Joined room ${data.roomId} as ${data.you}.`);
        break;
      case "chat":
        logChat(`${data.from}: ${data.text}`);
        break;
      case "system":
        logChat(`[SYSTEM] ${data.message}`);
        break;
      case "roster":
        updatePlayers(data.players);
        break;
      case "error":
        logChat(`⚠️ ${data.message}`);
        break;
      case "started":
        logChat(`🎴 ${data.message}`);
        statusDiv.textContent = "Game Started!";
        break;
      default:
        console.log("Unknown message", data);
    }
  };

  ws.onclose = () => {
    logChat("Disconnected from server.");
  };
}

// Create Room
createButton.onclick = () => {
  const randomId = Math.random().toString(36).substring(2, 7).toUpperCase();
  roomId = randomId;
  playerName = prompt("Enter your name:", "Player") || "Player";
  ws.send(JSON.stringify({ type: "join", roomId, name: playerName }));
  document.getElementById("roomIdDisplay").textContent = `Room: ${roomId}`;
};

// Join Room
joinButton.onclick = () => {
  const inputId = prompt("Enter Room ID:").trim().toUpperCase();
  if (!inputId) return alert("Room ID required.");
  roomId = inputId;
  playerName = prompt("Enter your name:", "Player") || "Player";
  ws.send(JSON.stringify({ type: "join", roomId, name: playerName }));
  document.getElementById("roomIdDisplay").textContent = `Room: ${roomId}`;
};

// Start Game
startButton.onclick = () => {
  if (!roomId) return alert("Join or create a room first!");
  ws.send(JSON.stringify({ type: "start" }));
};

// Send Chat
function sendChat() {
  const text = chatInput.value.trim();
  if (!text || !roomId) return;
  ws.send(JSON.stringify({ type: "chat", text }));
  chatInput.value = "";
}
document.getElementById("sendButton").onclick = sendChat;
chatInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendChat();
});

connectWS();
