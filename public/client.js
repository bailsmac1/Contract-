// --- minimal front-end wiring for rooms/chat over plain WebSocket ---

// UI refs
const $ = (s) => document.querySelector(s);
const btnCreate = document.createElement('button');
const btnJoin = document.createElement('button');
const btnStart = document.createElement('button');
const statusEl = document.createElement('div');
const roomInfo = document.createElement('div');
const chatBox = document.createElement('div');
const chatInput = document.createElement('input');
const chatSend = document.createElement('button');

document.body.style.margin = '0';
document.body.style.fontFamily = 'system-ui, sans-serif';

// basic layout
const wrap = document.createElement('div');
wrap.style.maxWidth = '720px';
wrap.style.margin = '24px auto';
wrap.style.padding = '16px';
wrap.style.color = '#fff';
wrap.style.background = 'rgba(0,0,0,.25)';
wrap.style.borderRadius = '16px';
document.body.appendChild(wrap);

const title = document.createElement('h1');
title.textContent = '桜アーケード — Sakura Arcade';
title.style.marginTop = '0';
wrap.appendChild(title);

// controls
btnCreate.textContent = 'Create room';
btnJoin.textContent = 'Join room';
btnStart.textContent = 'Start';
[btnCreate, btnJoin, btnStart].forEach(b => {
  b.style.marginRight = '8px';
  b.style.padding = '10px 14px';
  b.style.borderRadius = '12px';
  b.style.border = '0';
  b.style.background = '#ff5aa7';
  b.style.color = '#fff';
  b.style.fontWeight = '600';
});
wrap.appendChild(btnCreate);
wrap.appendChild(btnJoin);
wrap.appendChild(btnStart);

statusEl.textContent = 'Connecting…';
statusEl.style.margin = '12px 0';
wrap.appendChild(statusEl);

roomInfo.style.padding = '12px';
roomInfo.style.borderRadius = '12px';
roomInfo.style.background = 'rgba(255,255,255,.06)';
roomInfo.style.marginBottom = '16px';
wrap.appendChild(roomInfo);

// chat
const chatTitle = document.createElement('h2');
chatTitle.textContent = 'Chat';
chatTitle.style.margin = '8px 0';
wrap.appendChild(chatTitle);

chatBox.style.height = '160px';
chatBox.style.overflowY = 'auto';
chatBox.style.padding = '8px';
chatBox.style.background = 'rgba(255,255,255,.05)';
chatBox.style.borderRadius = '12px';
chatBox.style.marginBottom = '8px';
wrap.appendChild(chatBox);

const chatRow = document.createElement('div');
chatInput.placeholder = 'Message…';
chatInput.style.width = '70%';
chatInput.style.padding = '10px';
chatInput.style.borderRadius = '10px';
chatInput.style.border = '0';
chatInput.style.marginRight = '8px';
chatSend.textContent = 'Send';
chatSend.style.padding = '10px 14px';
chatSend.style.borderRadius = '10px';
chatSend.style.border = '0';
chatSend.style.background = '#7c5cff';
chatSend.style.color = '#fff';
chatRow.appendChild(chatInput);
chatRow.appendChild(chatSend);
wrap.appendChild(chatRow);

function logChat(msg) {
  const line = document.createElement('div');
  line.textContent = msg;
  chatBox.appendChild(line);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// --- socket ---
const proto = location.protocol === 'https:' ? 'wss' : 'ws';
const ws = new WebSocket(`${proto}://${location.host}`);

ws.addEventListener('open', () => {
  statusEl.textContent = 'Connected';
  // auto-join if ?room=XYZ in URL
  const params = new URLSearchParams(location.search);
  const r = params.get('room');
  if (r) joinRoom(r);
});

ws.addEventListener('message', (e) => {
  // the server sends strings in this minimal demo
  try {
    const data = JSON.parse(e.data);
    if (data.type === 'chat') {
      logChat(data.text);
    }
  } catch {
    logChat(String(e.data));
  }
});

ws.addEventListener('close', () => (statusEl.textContent = 'Disconnected'));

// --- simple in-memory room state on the client (IDs only) ---
let myRoomId = '';
let isHost = false;

function generateRoomId() {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

function showRoom(id) {
  const link = `${location.origin}/?room=${encodeURIComponent(id)}`;
  roomInfo.innerHTML = `
    <div><b>Room ID:</b> <code>${id}</code></div>
    <div style="margin-top:6px;"><b>Share link:</b> <a href="${link}" style="color:#9cf">${link}</a></div>
    <button id="copyLink" style="margin-top:8px;padding:8px 12px;border:0;border-radius:10px;background:#2bd4a7;color:#000;font-weight:700">Copy link</button>
  `;
  roomInfo.querySelector('#copyLink').onclick = async () => {
    try {
      await navigator.clipboard.writeText(link);
      alert('Link copied!');
    } catch {
      alert('Copy failed. Long-press the link to share.');
    }
  };
}

function createRoom() {
  myRoomId = generateRoomId();
  isHost = true;
  showRoom(myRoomId);
  logChat(`You created room ${myRoomId}. Share the link above.`);
}

function joinRoom(id) {
  myRoomId = id.trim().toUpperCase();
  isHost = false;
  if (!myRoomId) return alert('Enter a room code.');
  showRoom(myRoomId);
  logChat(`Joined room ${myRoomId}. Wait for host to start.`);
}

btnCreate.onclick = () => {
  if (ws.readyState !== 1) return alert('Not connected yet.');
  createRoom();
};

btnJoin.onclick = () => {
  const code = prompt('Enter room ID:').trim();
  joinRoom(code);
};

btnStart.onclick = () => {
  if (!isHost || !myRoomId) return alert('Only the host can start after creating a room.');
  logChat('Game would start here (demo).');
};

// chat send (client-side only demo)
chatSend.onclick = () => {
  const text = chatInput.value.trim();
  if (!text) return;
  logChat(`You: ${text}`);
  // echo via server as simple broadcast (optional; current server just replies once)
  try {
    ws.send(JSON.stringify({ type: 'chat', text }));
  } catch {}
  chatInput.value = '';
};
