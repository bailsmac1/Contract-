
// server.js — Sakura Arcade (Contract + Trick High) with Chat, Reactions, Timers
const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
app.use(express.static('public'));
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const uuid = () => Math.random().toString(36).slice(2,10);
const rooms = {};

const DEFAULT_SETTINGS = { bidSeconds: 25, playSeconds: 35, sounds: true, chatEnabled: true, reactionsEnabled: true };
const ROUND_SIZES = [7,6,5,4,3,2,1,1,2,3,4,5,6,7];
const TRUMP_ORDER = ['H','C','D','S','NT'];

const GAME_DEFS = {
  contract: {
    name: "Contract",
    needsBids: true,
    scoreAtRound(r) {
      const delta = {}, totals = {};
      for (const p of r.players) {
        const id = p.id;
        const bid = (r.bids && r.bids[id] != null) ? r.bids[id] : 0;
        const won = r.tricksWon[id] || 0;
        const add = (won === bid) ? (10 + won) : won;
        r.scores[id] = (r.scores[id] || 0) + add;
        delta[id] = add; totals[id] = r.scores[id];
      }
      return { delta, totals };
    }
  },
  trickhigh: {
    name: "Trick High",
    needsBids: false,
    scoreAtRound(r) {
      const delta = {}, totals = {};
      for (const p of r.players) {
        const id = p.id;
        const won = r.tricksWon[id] || 0;
        const add = won;
        r.scores[id] = (r.scores[id] || 0) + add;
        delta[id] = add; totals[id] = r.scores[id];
      }
      return { delta, totals };
    }
  }
};

function newDeck() {
  const suits = ['H','D','C','S'];
  const ranks = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  const deck = [];
  for (const s of suits) for (const r of ranks) deck.push(r + s);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i)];
  }
  return deck;
}
function rankValue(card) { return ['2','3','4','5','6','7','8','9','10','J','Q','K','A'].indexOf(card.slice(0, -1)); }
function cardWins(a, b, leadSuit, trump) {
  const suitA = a.slice(-1), suitB = b.slice(-1);
  if (suitA === suitB) return rankValue(a) > rankValue(b);
  if (trump !== 'NT') {
    if (suitA === trump && suitB !== trump) return true;
    if (suitB === trump && suitA !== trump) return false;
  }
  if (suitA === leadSuit && suitB !== leadSuit) return true;
  return false;
}
function rotateToFirst(arr, id) { const i = arr.indexOf(id); return (i<=0)?arr.slice():arr.slice(i).concat(arr.slice(0,i)); }
function maxTricksWinner(players, tricksWon) {
  let bestId=null,best=-1,tie=false;
  for (const p of players){ const w=tricksWon[p.id]||0; if(w>best){best=w;bestId=p.id;tie=false;} else if(w===best){tie=true;} }
  return tie?null:bestId;
}
function totalTricksThisRound(r){ return r.roundSizes[r.roundIndex]; }
function trumpLabel(t){ return t==='NT'?'No Trump':t; }

function sanitizeRoom(r, pid=null){
  const handsCount = Object.fromEntries(r.players.map(p=>[p.id,(r.hands&&r.hands[p.id])?r.hands[p.id].length:0]));
  const timers = r.timers?{type:r.timers.type, deadline:r.timers.deadline}:null;
  return {
    id:r.id, adminId:r.adminId, settings:r.settings, gameKey:r.gameKey, gameName:GAME_DEFS[r.gameKey]?.name||'Contract',
    players:r.players.map(p=>({id:p.id,name:p.name,avatar:p.avatar,connected:p.connected,seatIndex:p.seatIndex})),
    dealerIndex:r.dealerIndex, roundIndex:r.roundIndex, roundSize:r.roundSizes[r.roundIndex], roundSizes:r.roundSizes,
    phase:r.phase, trump:trumpLabel(r.currentTrump), bids:r.bids||{}, tricksWon:r.tricksWon||{},
    handsCount, scores:r.scores, history:r.history||[], turnOrder:r.turnOrder, currentTrick:r.currentTrick||[],
    me:pid, hand: pid&&r.hands? r.hands[pid]:null, leadSuit: r.currentTrick && r.currentTrick[0]? r.currentTrick[0].card.slice(-1):null,
    timers, chat:(r.chat||[]).slice(-100), trickReactions:r.trickReactions||{}
  };
}

wss.on('connection',(ws)=>{
  ws.id = uuid();
  ws.on('message',(raw)=>{
    let data; try{data=JSON.parse(raw);}catch{ return; }
    const { action, roomId, name, payload } = data;

    if (action==='create'){
      const rid = uuid();
      rooms[rid] = {
        id:rid, adminId:ws.id, players:[], dealerIndex:0, roundSizes:ROUND_SIZES.slice(), roundIndex:0,
        trumpOrder:TRUMP_ORDER.slice(), phase:'lobby', scores:{}, bids:{}, tricksWon:{}, hands:{},
        currentTrick:[], turnOrder:[], turnIndex:0, nextRoundLeaderId:null, history:[], settings:{...DEFAULT_SETTINGS},
        timers:null, chat:[], trickReactions:{}, gameKey:'contract'
      };
      const p = { id:ws.id, name:name||'Player', avatar:'🌸', ws, connected:true, seatIndex:0 };
      rooms[rid].players.push(p); rooms[rid].scores[p.id]=0;
      ws.roomId=rid; ws.playerId=ws.id;
      sysMsg(rid, `${p.name} created the room`);
      ws.send(JSON.stringify({action:'created', roomId:rid, playerId:ws.id}));
      sendRoomToAll(rid);
      return;
    }

    if (action==='join'){
      const r = rooms[roomId]; if(!r) return ws.send(JSON.stringify({action:'error', msg:'Room not found'}));
      if (r.locked) return ws.send(JSON.stringify({action:'error', msg:'Room is locked'}));
      if (r.phase!=='lobby') return ws.send(JSON.stringify({action:'error', msg:'Game already started'}));
      const p = { id:ws.id, name:name||`Player${r.players.length+1}`, avatar:'🌸', ws, connected:true, seatIndex:r.players.length };
      r.players.push(p); r.scores[p.id]=0; ws.roomId=roomId; ws.playerId=ws.id;
      sysMsg(roomId, `${p.name} joined`); sendRoomToAll(roomId); return;
    }

    if (action==='rename'){ const r=rooms[roomId]; if(!r) return;
      const { playerId, newName }=payload; const p=r.players.find(x=>x.id===playerId);
      if(p){ sysMsg(roomId, `${p.name} → ${newName}`); p.name=String(newName||'').slice(0,24); }
      sendRoomToAll(roomId); return; }

    if (action==='avatar'){ const r=rooms[roomId]; if(!r) return;
      const { playerId, emoji }=payload; const p=r.players.find(x=>x.id===playerId);
      if(p){ p.avatar=String(emoji||'🌸').slice(0,4); sysMsg(roomId, `${p.name} changed avatar ${p.avatar}`); }
      sendRoomToAll(roomId); return; }

    if (action==='setGame'){ const r=rooms[roomId]; if(!r) return;
      if (ws.id!==r.adminId) return ws.send(JSON.stringify({action:'error', msg:'Only admin can change game'}));
      const { gameKey } = payload||{}; if(!GAME_DEFS[gameKey]) return;
      r.gameKey=gameKey; sysMsg(roomId, `Game set to ${GAME_DEFS[gameKey].name}`); sendRoomToAll(roomId); return; }

    if (action==='settings'){ const r=rooms[roomId]; if(!r) return;
      if (ws.id!==r.adminId) return ws.send(JSON.stringify({action:'error', msg:'Only admin can change settings'}));
      const { bidSeconds, playSeconds, sounds, chatEnabled, reactionsEnabled }=payload||{};
      if (bidSeconds!=null) r.settings.bidSeconds=Math.max(5,Math.min(120,bidSeconds|0));
      if (playSeconds!=null) r.settings.playSeconds=Math.max(5,Math.min(120,playSeconds|0));
      if (typeof sounds==='boolean') r.settings.sounds=sounds;
      if (typeof chatEnabled==='boolean') r.settings.chatEnabled=chatEnabled;
      if (typeof reactionsEnabled==='boolean') r.settings.reactionsEnabled=reactionsEnabled;
      sysMsg(roomId,'Settings updated'); sendRoomToAll(roomId); return; }

    if (action==='start'){ const r=rooms[roomId]; if(!r) return;
      if (r.phase!=='lobby') return;
      if (r.players.length<3 || r.players.length>6) return ws.send(JSON.stringify({action:'error', msg:'Players must be between 3 and 6'}));
      r.roundIndex=0; r.dealerIndex=0; startRound(roomId); return; }

    if (action==='bid'){ const r=rooms[roomId]; if(!r) return;
      const gd=GAME_DEFS[r.gameKey]; if(!gd.needsBids) return;
      if (r.phase!=='bidding') return;
      const { playerId, bid }=payload;
      const left = r.players[(r.dealerIndex+1)%r.players.length].id;
      if (!r.bidOrder){ r.bidOrder=r.players.map(p=>p.id); r.bidOrder=rotateToFirst(r.bidOrder,left); r.bidIndex=0; setBidTimer(r); }
      const expected=r.bidOrder[r.bidIndex]; if (playerId!==expected) return ws.send(JSON.stringify({action:'error', msg:'Not your turn to bid'}));
      const isDealer=(playerId===r.players[r.dealerIndex].id);
      const total=totalTricksThisRound(r); const current=Object.values(r.bids).reduce((a,b)=>a+(b||0),0);
      if (isDealer && current+bid===total) return ws.send(JSON.stringify({action:'error', msg:'Dealer cannot make total bids equal total tricks'}));
      if (bid<0 || bid>total) return ws.send(JSON.stringify({action:'error', msg:'Invalid bid value'}));
      r.bids[playerId]=bid; r.bidIndex++; if (r.bidIndex>=r.players.length){ r.phase='playing'; clearTimer(r); setPlayTimer(r); sysMsg(roomId,'Bidding complete. Play begins.'); } else { setBidTimer(r); }
      sendRoomToAll(roomId); return; }

    if (action==='play'){ const r=rooms[roomId]; if(!r) return;
      if (r.phase!=='playing') return;
      const { playerId, card }=payload;
      const expected=r.turnOrder[r.turnIndex]; if (playerId!==expected) return ws.send(JSON.stringify({action:'error', msg:'Not your turn to play'}));
      const h=r.hands[playerId]||[]; const idx=h.indexOf(card); if(idx===-1) return ws.send(JSON.stringify({action:'error', msg:'Card not in your hand'}));
      const lead=r.currentTrick[0]? r.currentTrick[0].card.slice(-1):null;
      if (lead){ const hasLead=h.some(c=>c.slice(-1)===lead); if (hasLead && card.slice(-1)!==lead) return ws.send(JSON.stringify({action:'error', msg:`Must follow suit ${lead}` })); }
      r.hands[playerId].splice(idx,1); r.currentTrick.push({playerId, card}); r.turnIndex=(r.turnIndex+1)%r.turnOrder.length; clearTimer(r);
      if (r.currentTrick.length===r.turnOrder.length){
        const leadSuit=r.currentTrick[0].card.slice(-1); let winner=r.currentTrick[0].playerId; let best=r.currentTrick[0].card;
        for (let i=1;i<r.currentTrick.length;i++){ const it=r.currentTrick[i]; if (cardWins(it.card,best,leadSuit,r.currentTrump)){ best=it.card; winner=it.playerId; } }
        r.tricksWon[winner]=(r.tricksWon[winner]||0)+1; r.currentTrick=[]; r.trickReactions={}; r.turnOrder=rotateToFirst(r.turnOrder,winner); r.turnIndex=0;
        const anyLeft=Object.values(r.hands).some(hand=>hand.length>0); if(!anyLeft){ finalizeRound(roomId); return; }
      }
      setPlayTimer(r); sendRoomToAll(roomId); return; }

    if (action==='chat'){ const r=rooms[roomId]; if(!r) return; if (!r.settings.chatEnabled) return;
      const text=String((payload&&payload.text)||'').trim(); if(!text) return;
      const p=r.players.find(x=>x.id===ws.id); const msg={id:uuid(), ts:Date.now(), playerId:ws.id, name:p?p.name:'Player', text, reactions:{}};
      r.chat.push(msg); if (r.chat.length>500) r.chat.shift(); sendRoomToAll(roomId); return; }

    if (action==='reactChat'){ const r=rooms[roomId]; if(!r) return; if(!r.settings.reactionsEnabled) return;
      const { messageId, emoji }=payload||{}; const msg=(r.chat||[]).find(m=>m.id===messageId); if(!msg) return;
      msg.reactions = msg.reactions || {}; msg.reactions[emoji]=msg.reactions[emoji]||{};
      if (msg.reactions[emoji][ws.id]) delete msg.reactions[emoji][ws.id]; else msg.reactions[emoji][ws.id]=true;
      sendRoomToAll(roomId); return; }

    if (action==='reactTrick'){ const r=rooms[roomId]; if(!r) return; if(!r.settings.reactionsEnabled) return;
      const { index, emoji }=payload||{}; r.trickReactions=r.trickReactions||{}; r.trickReactions[index]=r.trickReactions[index]||{};
      r.trickReactions[index][emoji]=r.trickReactions[index][emoji]||{};
      if (r.trickReactions[index][emoji][ws.id]) delete r.trickReactions[index][emoji][ws.id]; else r.trickReactions[index][emoji][ws.id]=true;
      sendRoomToAll(roomId); return; }

    if (action==='admin'){ const r=rooms[roomId]; if(!r) return; if (ws.id!==r.adminId) return ws.send(JSON.stringify({action:'error', msg:'Only admin can do that'}));
      const { op }=payload||{};
      if (op==='lock'){ r.locked=true; sysMsg(roomId,'Room locked'); }
      else if (op==='unlock'){ r.locked=false; sysMsg(roomId,'Room unlocked'); }
      else if (op==='kick'){ const { playerId }=payload; const idx=r.players.findIndex(p=>p.id===playerId);
        if(idx>-1){ const target=r.players[idx]; if (target.ws) try{target.ws.close();}catch{} r.players.splice(idx,1); delete r.scores[playerId]; r.players.forEach((p,i)=>p.seatIndex=i); sysMsg(roomId,'A player was removed by admin'); } }
      else if (op==='newgame'){ resetToLobby(r); sysMsg(roomId,'Reset to lobby'); }
      else if (op==='rematch'){ resetToLobby(r); r.roundIndex=0; r.dealerIndex=0; sysMsg(roomId,'Rematch!'); startRound(roomId); }
      sendRoomToAll(roomId); return; }

  });
  ws.on('close',()=>{
    for (const rid in rooms){ const r=rooms[rid]; const p=r.players.find(x=>x.id===ws.id); if(p){ p.connected=false; p.ws=null; sysMsg(rid, `${p.name} disconnected`); sendRoomToAll(rid); } }
  });
});

function setBidTimer(r){ clearTimer(r); const current=r.bidOrder?.[r.bidIndex]; if(!current) return; r.timers={type:'bid', for:current, deadline:Date.now()+r.settings.bidSeconds*1000}; }
function setPlayTimer(r){ clearTimer(r); const current=r.turnOrder?.[r.turnIndex]; if(!current) return; r.timers={type:'play', for:current, deadline:Date.now()+r.settings.playSeconds*1000}; }
function clearTimer(r){ r.timers=null; }

function sysMsg(roomId,text){ const r=rooms[roomId]; if(!r) return; r.chat.push({id:uuid(), ts:Date.now(), sys:true, text}); if(r.chat.length>500) r.chat.shift(); }

function sendRoomToAll(roomId){ const r=rooms[roomId]; if(!r) return; for (const p of r.players){ if(!p.ws || p.ws.readyState!==1) continue; p.ws.send(JSON.stringify({action:'roomUpdate', room:sanitizeRoom(r,p.id)})); } }

function startRound(roomId){
  const r=rooms[roomId]; const gd=GAME_DEFS[r.gameKey];
  r.deck=newDeck(); const size=r.roundSizes[r.roundIndex]; r.hands={}; for(const p of r.players) r.hands[p.id]=[];
  let start=(r.dealerIndex+1)%r.players.length;
  for (let i=0;i<size;i++){ for (let j=0;j<r.players.length;j++){ const p=r.players[(start+j)%r.players.length]; r.hands[p.id].push(r.deck.pop()); } }
  r.currentTrump=r.trumpOrder[r.roundIndex % r.trumpOrder.length];
  r.bids={}; r.tricksWon={}; r.phase=gd.needsBids?'bidding':'playing'; r.currentTrick=[]; r.trickReactions={};
  r.turnOrder=r.players.map(p=>p.id); let leader=r.nextRoundLeaderId; if(!leader) leader=r.players[(r.dealerIndex+1)%r.players.length].id;
  r.turnOrder=rotateToFirst(r.turnOrder,leader); r.turnIndex=0; r.bidOrder=null; r.bidIndex=0;
  if (gd.needsBids) setBidTimer(r); else setPlayTimer(r);
  sendRoomToAll(roomId);
}
function finalizeRound(roomId){
  const r=rooms[roomId]; const gd=GAME_DEFS[r.gameKey]; const {delta, totals}=gd.scoreAtRound(r);
  r.history.push({ round:r.roundIndex+1, cards:r.roundSizes[r.roundIndex], trump:trumpLabel(r.currentTrump), bids:{...r.bids}, won:{...r.tricksWon}, delta, totals, game:gd.name });
  r.nextRoundLeaderId=maxTricksWinner(r.players,r.tricksWon); r.dealerIndex=(r.dealerIndex+1)%r.players.length; r.roundIndex++;
  if (r.roundIndex < r.roundSizes.length) startRound(roomId); else { r.phase='finished'; clearTimer(r); sendRoomToAll(roomId); }
}
function resetToLobby(r){
  r.phase='lobby'; r.scores=Object.fromEntries(r.players.map(p=>[p.id,0])); r.history=[]; r.bids={}; r.tricksWon={};
  r.hands={}; r.currentTrick=[]; r.trickReactions={}; r.turnOrder=[]; r.turnIndex=0; r.nextRoundLeaderId=null; r.timers=null;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=>console.log('Server listening on', PORT));
