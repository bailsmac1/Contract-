// -------- CONTRACT — 3–6 players, 7→1→7, H→C→D→S→NT, bidding, play, scoring --------

// Simple UI skeleton
document.body.innerHTML = `
  <div style="max-width:980px;margin:16px auto;padding:12px;color:#fff;font-family:system-ui">
    <h1 style="margin:0 0 8px">桜アーケード — Contract</h1>
    <div style="margin-bottom:8px">
      <button id="btnCreate" style="margin-right:6px;padding:8px 12px;border:0;border-radius:10px;background:#ff5aa7;color:#fff;font-weight:600">Create room</button>
      <button id="btnJoin"   style="margin-right:6px;padding:8px 12px;border:0;border-radius:10px;background:#6b5bff;color:#fff;font-weight:600">Join room</button>
      <button id="btnStart"  style="padding:8px 12px;border:0;border-radius:10px;background:#25d0a4;color:#000;font-weight:700">Start</button>
    </div>
    <div id="info" style="margin:6px 0"></div>

    <div id="top" style="display:flex;gap:10px;flex-wrap:wrap">
      <div id="players" style="flex:1;min-width:260px;background:rgba(255,255,255,.06);padding:8px;border-radius:10px"></div>
      <div id="scores" style="flex:1;min-width:260px;background:rgba(255,255,255,.06);padding:8px;border-radius:10px"></div>
    </div>

    <div id="bidding" style="margin-top:10px;background:rgba(255,255,255,.06);padding:8px;border-radius:10px"></div>
    <div id="table"   style="margin-top:10px;background:rgba(255,255,255,.06);padding:8px;border-radius:10px"></div>
    <div id="hand"    style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"></div>

    <h3>Chat</h3>
    <div id="chat" style="height:160px;overflow:auto;padding:8px;background:rgba(255,255,255,.06);border-radius:10px"></div>
    <div style="margin-top:6px">
      <input id="chatInput" placeholder="Message…" style="width:70%;padding:8px;border-radius:8px;border:0;margin-right:6px"/>
      <button id="chatSend" style="padding:8px 12px;border:0;border-radius:8px;background:#7c5cff;color:#fff">Send</button>
    </div>
  </div>
`;

const $ = (s)=>document.querySelector(s);
const info = $("#info");
const playersEl = $("#players");
const scoresEl  = $("#scores");
const biddingEl = $("#bidding");
const tableEl   = $("#table");
const handEl    = $("#hand");
const chatEl    = $("#chat");
const chatInput = $("#chatInput");

function logChat(t){
  const d=document.createElement('div'); d.textContent=t; chatEl.appendChild(d); chatEl.scrollTop=chatEl.scrollHeight;
}

// --- socket ---
const proto = location.protocol==="https:"?"wss":"ws";
const ws = new WebSocket(`${proto}://${location.host}`);

let myRoom="", myName="", me=null;
let state=null;

ws.addEventListener("open", ()=>{
  info.textContent="Connected";
  const p=new URLSearchParams(location.search); const r=p.get("room");
  if (r) joinRoom(r);
});
ws.addEventListener("close", ()=> info.textContent="Disconnected");

ws.addEventListener("message",(e)=>{
  try{
    const m=JSON.parse(e.data);
    if (m.type==="system") logChat("* "+m.text);
    if (m.type==="chat")   logChat(`${m.sender}: ${m.text}`);
    if (m.type==="start")  logChat(`🎮 Game started by ${m.sender}`);

    if (m.type==="state"){
      me = m.me;
      state = m;
      renderAll();
    }
  }catch{ logChat(String(e.data)); }
});

// --- helpers ---
function send(type, payload={}){ if(ws.readyState===1) ws.send(JSON.stringify({type, ...payload})); }
function createRoom(){
  myRoom = Math.random().toString(36).slice(2,7).toUpperCase();
  if (!myName) myName = prompt("Your name?")||"Player";
  send("join",{room:myRoom, name:myName});
  renderRoomHeader();
  logChat(`You created room ${myRoom}.`);
}
function joinRoom(id){
  myRoom=(id||"").trim().toUpperCase();
  if (!myRoom) return alert("Enter a room code.");
  if (!myName) myName = prompt("Your name?")||"Player";
  send("join",{room:myRoom, name:myName});
  renderRoomHeader();
  logChat(`Joined room ${myRoom}.`);
}
function renderRoomHeader(){
  const link = `${location.origin}/?room=${encodeURIComponent(myRoom)}`;
  info.innerHTML = myRoom ? `Room <b>${myRoom}</b> • Share <a style="color:#9cf" href="${link}">${link}</a>` : "No room";
}

// controls
$("#btnCreate").onclick = ()=>{ if(ws.readyState!==1) return alert("Not connected"); createRoom(); };
$("#btnJoin").onclick   = ()=>{ const code=prompt("Enter room ID:"); if(code) joinRoom(code); };
$("#btnStart").onclick  = ()=>{ if(!myRoom) return alert("Create or join a room first."); send("start",{room:myRoom, sender:myName}); };

// chat
$("#chatSend").onclick = ()=>{
  const text=chatInput.value.trim(); if(!text||!myRoom) return;
  send("chat",{room:myRoom, sender:myName, text}); chatInput.value="";
};
chatInput.addEventListener("keydown",e=>{ if(e.key==="Enter") $("#chatSend").click(); });

// --- rendering ---
const S = {H:"♥", D:"♦", C:"♣", S:"♠"};

function renderAll(){
  if (!state) return;
  renderTop();
  renderBidding();
  renderTable();
  renderHand();
}

function renderTop(){
  const p = state.players||[];
  const size = state.roundSize ?? "-";
  playersEl.innerHTML = `<b>Players</b><div>${p.map((pl,i)=>{
    const dealer = (i===state.dealerIndex) ? " (Dealer)" : "";
    return `<div>• ${pl.name}${dealer}</div>`;
  }).join("")}</div>
  <div style="margin-top:6px">Phase: <b>${state.phase}</b> • Round ${state.roundIndex+1 || "-"} / ${14} • Cards: <b>${size}</b> • Trump: <b>${state.trump==="NT"?"No-Trump":(S[state.trump]||"-")}</b></div>`;

  scoresEl.innerHTML = `<b>Scores</b><div>${p.map(pl=>{
    const sc = state.scores?.[pl.id] ?? 0;
    return `<div>• ${pl.name}: ${sc}</div>`;
  }).join("")}</div>`;
}

function renderBidding(){
  biddingEl.innerHTML = "";
  if (state.phase!=="bidding") return;
  const p = state.players;
  const currentBidder = state.turnOrder ? state.bidOrder?.[state.bidIndex] : state.bidOrder?.[state.bidIndex];
  const meTurn = (currentBidder===me);
  const total = state.roundSize;
  const dealerId = p[state.dealerIndex].id;
  const sum = Object.values(state.bids||{}).reduce((a,b)=>a+(b??0),0);
  const forbidden = (currentBidder===dealerId) ? (total - sum) : null;

  const who = p.find(x=>x.id===currentBidder)?.name || "—";
  let html = `<div><b>Bidding</b> — Now: ${who}</div><div style="margin-top:6px">Bids: `;
  html += p.map(pl=>{
    const v = (state.bids||{})[pl.id];
    return `<span style="margin-right:8px">${pl.name}: <b>${v==null?'-':v}</b></span>`;
  }).join("");
  html += `</div>`;

  if (meTurn){
    html += `<div style="margin-top:8px">Your bid: `;
    for (let i=0;i<=total;i++){
      if (forbidden!=null && i===forbidden) continue;
      html += `<button class="bidBtn" data-b="${i}" style="margin:4px;padding:6px 10px;border:0;border-radius:8px;background:#333;color:#fff">${i}</button>`;
    }
    html += `</div>`;
  } else {
    html += `<div style="margin-top:8px;color:#aaa">Waiting for ${who}…</div>`;
  }

  biddingEl.innerHTML = html;
  biddingEl.querySelectorAll(".bidBtn").forEach(b=>{
    b.onclick=()=> send("bid",{playerId:me, bid: Number(b.dataset.b)});
  });
}

function renderTable(){
  const p = state.players||[];
  const trick = state.currentTrick||[];
  const order = state.turnOrder||[];
  const current = order[state.turnIndex];

  let html = `<div><b>Table</b> — `;
  if (state.phase==="bidding") html += `waiting for bids`;
  if (state.phase==="playing") html += `turn: <b>${p.find(x=>x.id===current)?.name||"-"}</b>`;
  if (state.phase==="finished") html += `finished`;
  html += `</div>`;

  html += `<div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap">`;
  trick.forEach(t=>{
    const name = p.find(x=>x.id===t.playerId)?.name||"?";
    const r=t.card.slice(0,-1), s=S[t.card.slice(-1)]||t.card.slice(-1);
    html += `<div style="padding:8px 10px;border-radius:10px;background:#2b2138;border:1px solid #3a2d4a"><b>${name}</b><div style="font-size:18px">${r}${s}</div></div>`;
  });
  html += `</div>`;

  // won so far
  html += `<div
