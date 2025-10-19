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
