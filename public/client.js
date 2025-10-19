// -------- CONTRACT — 3–6 players, 7→1→7, H→C→D→S→NT, bidding, play, scoring --------

// Simple UI
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
const chatInput
