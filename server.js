const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
app.use(express.static("public"));
app.get("/", (req, res) => res.sendFile(__dirname + "/public/index.html"));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ------------------------ Game Helpers ------------------------
const RANKS = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
const SUITS = ["H","D","C","S"]; // ♥ ♦ ♣ ♠ on client
const ROUND_SIZES = [7,6,5,4,3,2,1,1,2,3,4,5,6,7];
const TRUMP_ORDER = ["H","C","D","S","NT"]; // Hearts, Clubs, Diamonds, Spades, No-Trump

function newDeck(){
  const deck=[];
  for (const s of SUITS) for (const r of RANKS) deck.push(r+s);
  for (let i=deck.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [deck[i],deck[j]]=[deck[j],deck[i]];
  }
  return deck;
}
function rankValue(card){ return RANKS.indexOf(card.slice(0,-1)); }
function cardSuit(card){ return card.slice(-1); }
function cardWins(a,b,lead,trump){
  const sa=cardSuit(a), sb=cardSuit(b);
  if (sa===sb) return rankValue(a)>rankValue(b);
  if (trump!=="NT"){
    if (sa===trump && sb!==trump) return true;
    if (sb===trump && sa!==trump) return false;
  }
  if (sa===lead && sb!==lead) return true;
  return false;
}
function rotateToFirst(list, firstId){
  const i=list.indexOf(firstId);
  if (i<=0) return list.slice();
  return list.slice(i).concat(list.slice(0,i));
}

// ------------------------ Room / Game State ------------------------
const rooms = {}; // roomId -> {sockets:[], nameById:{}, game:{...}}

function broadcast(roomId, payload){
  const r = rooms[roomId]; if (!r) return;
  const msg = JSON.stringify(payload);
  for (const ws of r.sockets) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}
function ensureRoom(roomId){
  rooms[roomId] ||= { sockets: [], nameById:{}, game: null };
}
function addSocketToRoom(ws, roomId){
  ensureRoom(roomId);
  const r = rooms[roomId];
  if (!r.sockets.includes(ws)) r.sockets.push(ws);
}

function sendRoomState(roomId){
  const r = rooms[roomId]; if (!r || !r.game) return;
  const g = r.game;
  const safe = {
    type: "state",
    phase: g.phase,
    players: g.players.map(p=>({id:p.id, name:p.name})),
    dealerIndex: g.dealerIndex,
    roundIndex: g.roundIndex,
    roundSize: ROUND_SIZES[g.roundIndex],
    trump: g.trump,
    bids: g.bids,
    bidOrder: g.bidOrder,  // include in state
    bidIndex: g.bidIndex,  // include in state
    tricksWon: g.tricksWon,
    scores: g.scores,
    currentTrick: g.currentTrick,
    turnOrder: g.turnOrder,
    turnIndex: g.turnIndex,
    history: g.history
  };
  for (const ws of r.sockets){
    if (ws.readyState!==WebSocket.OPEN) continue;
    const hand = g.hands[ws.pid] || [];
    ws.send(JSON.stringify({...safe, me: ws.pid, hand}));
  }
}

function initGame(roomId){
  const r = rooms[roomId]; if (!r) return;
  const players = r.sockets
    .filter(s => s.roomId===roomId)
    .map((s,i)=>({id:s.pid, name: s.playerName || `Player${i+1}`}));
  if (players.length < 3 || players.length > 6) {
    broadcast(roomId, {type: "chat", sender:"System", text:"Need 3 to 6 players to start."});
    return;
  }
  r.game = {
    phase: "lobby",
    dealerIndex: 0,
    roundIndex: 0,
    trump: TRUMP_ORDER[0],
    players,
    hands: {},
    bids: {},
    bidOrder: [],
    bidIndex: 0,
    turnOrder: [],
    turnIndex: 0,
    currentTrick: [],
    tricksWon: {},
    scores: Object.fromEntries(players.map(p=>[p.id,0])),
    history: [],
    nextRoundLeaderId: null
  };
}

function startRound(roomId){
  const r = rooms[roomId]; if (!r || !r.game) return;
  const g = r.game;
  const deck = newDeck();
  const size = ROUND_SIZES[g.roundIndex];
  g.hands = Object.fromEntries(g.players.map(p=>[p.id,[]]));
  // deal starting to left of dealer
  const startSeat = (g.dealerIndex+1) % g.players.length;
  for (let i=0;i<size;i++){
    for (let j=0;j<g.players.length;j++){
      const p = g.players[(startSeat+j)%g.players.length];
      g.hands[p.id].push(deck.pop());
    }
  }
  g.trump = TRUMP_ORDER[g.roundIndex % TRUMP_ORDER.length];
  g.bids = {};
  g.tricksWon = {};
  g.currentTrick = [];
  g.bidOrder = g.players.map(p=>p.id);
  g.bidOrder = rotateToFirst(g.bidOrder, g.players[startSeat].id); // left of dealer first
  g.bidIndex = 0;
  g.turnOrder = g.players.map(p=>p.id);
  g.turnOrder = rotateToFirst(g.turnOrder, g.players[startSeat].id);
  g.turnIndex = 0;
  g.phase = "bidding";
  broadcast(roomId,{type:"chat", sender:"System", text:`Round ${g.roundIndex+1}: ${size} cards, trump ${g.trump==='NT'?'No-Trump':g.trump}`});
  sendRoomState(roomId);
}

function finalizeTrick(roomId){
  const r = rooms[roomId]; if (!r || !r.game) return;
  const g = r.game;
  const leadSuit = cardSuit(g.currentTrick[0].card);
  let winner = g.currentTrick[0].playerId;
  let best = g.currentTrick[0].card;
  for (let i=1;i<g.currentTrick.length;i++){
    const it = g.currentTrick[i];
    if (cardWins(it.card, best, leadSuit, g.trump)){ best = it.card; winner = it.playerId; }
  }
  g.tricksWon[winner] = (g.tricksWon[winner]||0)+1;
  g.currentTrick = [];
  g.turnOrder = rotateToFirst(g.turnOrder, winner); // winner leads
  g.turnIndex = 0;
  broadcast(roomId,{type:"chat", sender:"System", text:`${rooms[roomId].nameById[winner]||'A player'} won the trick.`});
}

function finishRound(roomId){
  const r = rooms[roomId]; if (!r || !r.game) return;
  const g = r.game;
  const delta={}, totals={};
  for (const p of g.players){
    const id=p.id;
    const won=g.tricksWon[id]||0;
    const bid=(g.bids[id]??0);
    const add = (won===bid) ? (10+won) : won;
    g.scores[id] = (g.scores[id]||0) + add;
    delta[id]=add; totals[id]=g.scores[id];
  }
  g.history.push({
    round: g.roundIndex+1,
    cards: ROUND_SIZES[g.roundIndex],
    trump: g.trump,
    bids: {...g.bids},
    won: {...g.tricksWon},
    delta, totals
  });
  g.dealerIndex = (g.dealerIndex+1)%g.players.length;
  g.roundIndex++;
  if (g.roundIndex < ROUND_SIZES.length){
    startRound(roomId);
  } else {
    g.phase="finished";
    broadcast(roomId,{type:"chat", sender:"System", text:"Game finished!"});
    sendRoomState(roomId);
  }
}

// ------------------------ WebSocket Handlers ------------------------
wss.on("connection",(ws)=>{
  ws.pid = Math.random().toString(36).slice(2,10).toUpperCase();
  ws.playerName = "Player";
  ws.roomId = null;

  ws.on("message",(raw)=>{
    let data; try{ data = JSON.parse(raw); } catch { return; }

    // Join
    if (data.type==="join"){
      const roomId = String(data.room||"").toUpperCase();
      ws.roomId = roomId;
      ws.playerName = String(data.name||"Player").slice(0,24);
      ensureRoom(roomId);
      rooms[roomId].nameById[ws.pid]=ws.playerName;
      addSocketToRoom(ws, roomId);
      ws.send(JSON.stringify({type:"system", text:`Joined room ${roomId}`}));
      broadcast(roomId,{type:"chat", sender:"System", text:`${ws.playerName} joined.`});
      if (rooms[roomId].game){
        sendRoomState(roomId);
      }
      return;
    }

    // Chat
    if (data.type==="chat" && ws.roomId){
      broadcast(ws.roomId, {type:"chat", sender: ws.playerName, text: String(data.text||"")});
      return;
    }

    // Start
    if (data.type==="start" && ws.roomId){
      if (!rooms[ws.roomId].game) {
        initGame(ws.roomId);
      }
      const g = rooms[ws.roomId].game;
      if (g && g.phase==="lobby"){
        broadcast(ws.roomId,{type:"start", sender: ws.playerName});
        startRound(ws.roomId);
      }
      return;
    }

    // Bid
    if (data.type==="bid" && ws.roomId){
      const roomId = ws.roomId, r=rooms[roomId], g=r?.game; if (!g || g.phase!=="bidding") return;
      const playerId = data.playerId, bid = data.bid|0;
      const expected = g.bidOrder[g.bidIndex];
      if (playerId!==expected) return;
      const total = ROUND_SIZES[g.roundIndex];
      if (bid<0 || bid>total) return;

      // dealer cannot make total bids == total
      const dealerId = g.players[g.dealerIndex].id;
      const currentSum = Object.values(g.bids).reduce((a,b)=>a+(b??0),0);
      const isDealer = (playerId===dealerId);
      if (isDealer && currentSum + bid === total) return;

      g.bids[playerId]=bid;
      g.bidIndex++;
      if (g.bidIndex>=g.players.length){
        g.phase="playing";
      }
      sendRoomState(roomId);
      return;
    }

    // Play a card
    if (data.type==="play" && ws.roomId){
      const roomId=ws.roomId, r=rooms[roomId], g=r?.game; if(!g || g.phase!=="playing") return;
      const playerId=data.playerId, card=data.card;
      const expected = g.turnOrder[g.turnIndex];
      if (playerId!==expected) return;
      const hand = g.hands[playerId]||[];
      const idx = hand.indexOf(card);
      if (idx===-1) return;

      // must follow suit if possible
      const lead = g.currentTrick[0]?.card ? cardSuit(g.currentTrick[0].card) : null;
      if (lead){
        const hasLead = hand.some(c => cardSuit(c)===lead);
        if (hasLead && cardSuit(card)!==lead) return;
      }

      // play
      g.hands[playerId].splice(idx,1);
      g.currentTrick.push({playerId, card});
      g.turnIndex = (g.turnIndex+1)%g.turnOrder.length;

      if (g.currentTrick.length===g.turnOrder.length){
        finalizeTrick(roomId);
        const anyLeft = g.players.some(p => (g.hands[p.id]||[]).length>0);
        if (!anyLeft){
          finishRound(roomId);
        }
      }
      sendRoomState(roomId);
      return;
    }
  });

  ws.on("close", ()=>{
    const roomId = ws.roomId;
    if (roomId && rooms[roomId]){
      rooms[roomId].sockets = rooms[roomId].sockets.filter(s=>s!==ws);
      broadcast(roomId,{type:"chat", sender:"System", text:`${ws.playerName} left.`});
      if (rooms[roomId].sockets.length===0){
        delete rooms[roomId];
      }
    }
  });
});

// robust logging
process.on("uncaughtException", (err) => {
  console.error("uncaughtException:", err && err.stack || err);
});
process.on("unhandledRejection", (err) => {
  console.error("unhandledRejection:", err && err.stack || err);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=> console.log(`Server running on port ${PORT}`));
