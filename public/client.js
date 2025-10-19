// ---------- Sakura Arcade minimal client: rooms + chat + start ----------

document.body.innerHTML = `
  <div style="max-width:720px;margin:24px auto;padding:16px;border-radius:16px;background:rgba(0,0,0,.25);color:#fff;font-family:system-ui">
    <h1 style="margin:0 0 12px">桜アーケード — Sakura Arcade</h1>
    <div style="margin-bottom:12px">
      <button id="btnCreate" style="margin-right:8px;padding:10px 14px;border:0;border-radius:12px;background:#ff5aa7;color:#fff;font-weight:600">Create room</button>
      <button id="btnJoin"   style="margin-right:8px;padding:10px 14px;border:0;border-radius:12px;background:#6b5bff;color:#fff;font-weight:600">Join room</button>
      <button id="btnStart"  style="padding:10px 14px;border:0;border-radius:12px;background:#25d0a4;color:#000;font-weight:700">Start</button>
    </div>
    <div id="status">Connecting…</div>
    <div id="roomInfo" style="padding:12px;border-radius:12px;background:rgba(255,255,255,.06);margin:12px 0"></div>

    <h2 style="margin:8px 0">Chat</h2>
    <div id="chatBox" style="height:220px;overflow:auto;padding:8px;background:rgba(255,255,255,.05);border-radius:12px;margin-bottom:8px"></div>
    <div>
      <input id="chatInput" placeholder="Message…" style="width:70%;padding:10px;border-radius:10px;border:0;margin-right:8px"/>
      <button id="chatSend" style="padding:10px 14px;border:0;border-radius:10px;background:#7c5cff;color:#fff">Send</button>
    </div>
  </div>
`;

const statusEl = document.querySelector("#status");
const roomInfo = document.querySelector("#roomInfo");
const chatBox  = document.querySelector("#chatBox");
const chatInput= document.querySelector("#chatInput");

function log(line) {
  const d = document.createElement("div");
  d.textContent = line;
  chatBox.appendChild(d);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// --- WebSocket ---
const proto = location.protocol === "https:" ? "wss" : "ws";
const ws = new WebSocket(`${proto}://${location.host}`);

ws.addEventListener("open", () => {
  statusEl.textContent = "Connected";
  const p = new URLSearchParams(location.search);
  const r = p.get("room");
  if (r) joinRoom(r);
});
ws.addEventListener("close", () => (statusEl.textContent = "Disconnected"));

// handle messages from server
ws.addEventListener("message", (e) => {
  try {
    const m = JSON.parse(e.data);
    if (m.type === "system") log(`* ${m.text}`);
    if (m.type === "chat")   log(`${m.sender}: ${m.text}`);
    if (m.type === "start")  log(`🎮 Game started by ${m.sender}!`);
  } catch {
    log(String(e.data));
  }
});

// --- room helpers ---
let myRoom = "";
let myName = "";

function send(type, payload={}) {
  if (ws.readyState !== 1) return;
  ws.send(JSON.stringify({ type, ...payload }));
}

function showRoom(id) {
  const link = `${location.origin}/?room=${encodeURIComponent(id)}`;
  roomInfo.innerHTML = `
    <div><b>Room ID:</b> <code>${id}</code></div>
    <div style="margin-top:6px"><b>Share link:</b> <a href="${link}" style="color:#9cf">${link}</a></div>
    <button id="copyLink" style="margin-top:8px;padding:8px 12px;border:0;border-radius:10px;background:#2bd4a7;color:#000;font-weight:700">Copy link</button>
  `;
  document.querySelector("#copyLink").onclick = async () => {
    try { await navigator.clipboard.writeText(link); alert("Link copied!"); }
    catch { alert("Copy failed. Long-press the link to share."); }
  };
}

function createRoom() {
  myRoom = Math.random().toString(36).slice(2,7).toUpperCase();
  if (!myName) myName = prompt("Your name?") || "Player";
  showRoom(myRoom);
  send("join", { room: myRoom, name: myName });
  log(`You created room ${myRoom}. Share the link above.`);
}

function joinRoom(id) {
  myRoom = (id || "").trim().toUpperCase();
  if (!myRoom) return alert("Enter a room code.");
  if (!myName) myName = prompt("Your name?") || "Player";
  showRoom(myRoom);
  send("join", { room: myRoom, name: myName });
  log(`Joined room ${myRoom}.`);
}

// buttons
document.querySelector("#btnCreate").onclick = () => {
  if (ws.readyState !== 1) return alert("Not connected yet.");
  createRoom();
};
document.querySelector("#btnJoin").onclick = () => {
  const code = prompt("Enter room ID:");
  if (code) joinRoom(code);
};
document.querySelector("#btnStart").onclick = () => {
  if (!myRoom) return alert("Create or join a room first.");
  send("start", { room: myRoom, sender: myName });
};

// chat send
document.querySelector("#chatSend").onclick = () => {
  const text = chatInput.value.trim();
  if (!text || !myRoom) return;
  send("chat", { room: myRoom, sender: myName, text });
  chatInput.value = "";
};
chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.querySelector("#chatSend").click();
});
