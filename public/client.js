let ws, roomId=null, playerId=null, lastRoom=null, tickTimer=null;
const suitsMap = { H:'♥', D:'♦', C:'♣', S:'♠' };
const REACTS = ['👍','❤️','😂','👏','🔥','🌸'];

function connect(){
  const proto = location.protocol==='https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.onopen = ()=> setStatus('Connected');
  ws.onmessage = (ev)=>{
    const msg = JSON.parse(ev.data);
    if (msg.action==='created'){ roomId=msg.roomId; playerId=msg.playerId; setStatus(`Room created: ${roomId}`); }
    if (msg.action==='roomUpdate'){ const prev=lastRoom; lastRoom=msg.room; render(msg.room, prev); }
    if (msg.action==='error'){ showError(msg.msg); }
  };
  ws.onclose = ()=> setStatus('Disconnected');
}
connect();

function setStatus(t){ document.getElementById('status').textContent=t; }
function showError(t){ const e=document.getElementById('errors'); e.textContent=t; setTimeout(()=>e.textContent='',3000); }

function createRoom(){ const name = prompt('Your name?')||'You'; ws.send(JSON.stringify({action:'create', name})); }
function joinRoom(){ const rid=prompt('Room id?'); const name=prompt('Your name?')||'You'; ws.send(JSON.stringify({action:'join', roomId:rid, name})); }
function startGame(){ const rid=lastRoom?.id||roomId; ws.send(JSON.stringify({action:'start', roomId:rid})); }

function sendBid(bid){ ws.send(JSON.stringify({action:'bid', roomId:lastRoom.id, payload:{playerId:lastRoom.me, bid}})); }
function playCard(card){ ws.send(JSON.stringify({action:'play', roomId:lastRoom.id, payload:{playerId:lastRoom.me, card}})); }
function sendChat(){ const input=document.getElementById('chatInput'); const text=input.value.trim(); if(!text) return; ws.send(JSON.stringify({action:'chat', roomId:lastRoom.id, payload:{text}})); input.value=''; }
function reactChat(messageId, emoji){ ws.send(JSON.stringify({action:'reactChat', roomId:lastRoom.id, payload:{messageId, emoji}})); }
function reactTrick(index, emoji){ ws.send(JSON.stringify({action:'reactTrick', roomId:lastRoom.id, payload:{index, emoji}})); }

function renameSelf(){ const newName=prompt('New display name?'); if(!newName) return; ws.send(JSON.stringify({action:'rename', roomId:lastRoom.id, payload:{playerId:lastRoom.me, newName}})); }
function setAvatar(){ const emoji=prompt('Pick an emoji avatar (e.g., 🗻, 🌸, 🦊)'); if(!emoji) return; ws.send(JSON.stringify({action:'avatar', roomId:lastRoom.id, payload:{playerId:lastRoom.me, emoji}})); }
function updateSettings(){
  const bid=prompt('Bid seconds (5–120):', lastRoom.settings?.bidSeconds??25);
  const play=prompt('Play seconds (5–120):', lastRoom.settings?.playSeconds??35);
  const sounds=confirm('Enable sounds? OK=Yes');
  const chatEnabled=confirm('Chat enabled? OK=Yes');
  const reactionsEnabled=confirm('Reactions enabled? OK=Yes');
  ws.send(JSON.stringify({action:'settings', roomId:lastRoom.id, payload:{bidSeconds:Number(bid), playSeconds:Number(play), sounds, chatEnabled, reactionsEnabled}}));
}
function setGame(key){ ws.send(JSON.stringify({action:'setGame', roomId:lastRoom.id, payload:{gameKey:key}})); }

function render(r, prev){
  roomId=r.id; const isAdmin = (r.adminId===r.me);

  // Admin bar
  const admin = document.getElementById('admin'); admin.innerHTML='';
  const bar = document.createElement('div'); bar.className='row';
  if (isAdmin){
    bar.innerHTML = `
      <label>Game:</label>
      <select onchange="setGame(this.value)">
        <option value="contract"${r.gameKey==='contract'?' selected':''}>Contract</option>
        <option value="trickhigh"${r.gameKey==='trickhigh'?' selected':''}>Trick High</option>
      </select>
      <button class="ghost" onclick="updateSettings()">Settings</button>
      <button class="ghost" onclick="renameSelf()">Rename</button>
      <button class="ghost" onclick="setAvatar()">Avatar</button>
    `;
  }
  admin.appendChild(bar);

  // Room info
  const info=document.getElementById('roomInfo');
  info.innerHTML = `<div class="row">
    <span class="pill">Room: ${r.id}</span>
    <span class="pill">Game: ${r.gameName}</span>
    <span class="pill">Phase: ${r.phase}</span>
    <span class="pill">Round: ${r.roundIndex!=null?(r.roundIndex+1):'-'}/${r.roundSizes?.length||'-'}</span>
    <span class="pill">Cards: ${r.roundSize||'-'}</span>
    <span class="pill">Trump: ${r.trump||'-'}</span>
    <span class="pill">⏱️ Bid ${r.settings?.bidSeconds}s • Play ${r.settings?.playSeconds}s</span>
  </div>`;

  // Players
  const players = document.getElementById('players'); players.innerHTML='';
  r.players.forEach((p, idx)=>{
    const d=document.createElement('div'); d.className='player';
    const tricks=r.tricksWon[p.id]||0; const bid=r.bids[p.id];
    const dealer=(idx===r.dealerIndex)?'（親）':'';
    const turn=(r.turnOrder && r.turnOrder[0]===p.id && r.phase==='playing')?' • 手番':'';
    d.innerHTML=`<div class="row"><div style="font-size:24px">${p.avatar||'🌸'}</div><div><div><b>${p.name}</b> ${dealer}${turn}</div><div class="pill">Bid: ${r.gameKey==='contract'?(bid??'-'):'—'}</div><div class="pill">Tricks: ${tricks}</div><div class="pill">Cards: ${r.handsCount[p.id]??'-'}</div></div></div>`;
    if (p.id===r.me) d.style.outline='2px solid #60d394';
    players.appendChild(d);
  });

  // Bidding
  const bidding = document.getElementById('bidding'); bidding.innerHTML='';
  if (r.phase==='bidding' && r.gameKey==='contract'){
    const totalSoFar = Object.values(r.bids).reduce((a,b)=>a+(b||0),0);
    const isDealer = (r.players[r.dealerIndex].id===r.me);
    const forbidden = isDealer ? (r.roundSize - totalSoFar) : null;
    const row=document.createElement('div'); row.className='row';
    for (let i=0;i<=r.roundSize;i++){
      if (forbidden!=null && i===forbidden) continue;
      const b=document.createElement('button'); b.className='tag'; b.textContent=i; b.onclick=()=>sendBid(i); row.appendChild(b);
    }
    bidding.appendChild(row);
  }

  // Table / Trick
  const table=document.getElementById('table'); table.innerHTML=`<div class="row"><span class="pill">Lead suit: ${r.leadSuit||'-'}</span><span class="pill" id="timer">--</span></div>`;
  const trick=document.createElement('div'); trick.className='trick';
  (r.currentTrick||[]).forEach((t,i)=>{
    const c=renderCard(t.card);
    const reacts=document.createElement('div'); reacts.className='reactions';
    REACTS.forEach(e=>{ const b=document.createElement('button'); b.className='react-btn'; b.textContent=e; b.onclick=()=>reactTrick(i,e); reacts.appendChild(b); });
    c.appendChild(reacts);
    trick.appendChild(c);
  });
  table.appendChild(trick);
  startTick(r);

  // Hand
  const hand=document.getElementById('hand'); hand.innerHTML='';
  (r.hand||[]).slice().sort(cardSort).forEach(cstr=>{
    const c=renderCard(cstr,true);
    const need=r.leadSuit; if (need){ const hasLead=(r.hand||[]).some(x=>x.slice(-1)===need); if (hasLead && cstr.slice(-1)!==need) c.style.opacity=.5; }
    c.onclick=()=>playCard(cstr);
    hand.appendChild(c);
  });

  // Scores
  const scores=document.getElementById('scores'); scores.innerHTML='<b>Scores</b>';
  r.players.forEach(p=>{ const sc=r.scores[p.id]||0; const row=document.createElement('div'); row.className='row'; row.innerHTML=`<span class="pill">${p.avatar||'🌸'} ${p.name}</span><span class="pill">Score: ${sc}</span>`; scores.appendChild(row); });

  // History
  const hist=document.getElementById('history'); hist.innerHTML='<b>Round-by-round</b>';
  if (r.history && r.history.length){
    const table=document.createElement('table'); const head=document.createElement('tr');
    head.innerHTML='<th>#</th><th>Game</th><th>Cards</th><th>Trump</th>'+r.players.map(p=>`<th>${p.name}<br/>Bid/Won/Δ/Σ</th>`).join('');
    table.appendChild(head);
    r.history.forEach(h=>{
      const tr=document.createElement('tr'); let cols=`<td>${h.round}</td><td>${h.game||r.gameName}</td><td>${h.cards}</td><td>${h.trump}</td>`;
      r.players.forEach(p=>{ const bid = h.bids[p.id]!=null? h.bids[p.id] : (r.gameKey==='contract' ? '-' : '—'); const won=h.won[p.id]??'-'; const d=h.delta[p.id]??'-'; const tot=h.totals[p.id]??'-'; cols+=`<td>${bid}/${won}/${d}/${tot}</td>`; });
      tr.innerHTML=cols; table.appendChild(tr);
    });
    hist.appendChild(table);
  }

  // Chat
  document.getElementById('chatStatus').textContent = r.settings?.chatEnabled ? 'Enabled' : 'Disabled';
  const chat=document.getElementById('chat'); chat.innerHTML='';
  (r.chat||[]).forEach(m=>{
    const row=document.createElement('div'); row.className='bubble';
    const name=m.sys?'• system':(m.name||'Player'); const time=new Date(m.ts).toLocaleTimeString();
    const reactions=renderChatReacts(m);
    row.innerHTML=`<div style="font-size:12px;color:#a7a1b2">${name} • ${time}</div><div>${escapeHTML(m.text||'')}</div>${reactions}`;
    chat.appendChild(row);
  });
  chat.scrollTop=chat.scrollHeight;

  // Sounds
  if (lastRoom?.phase !== r.phase && r.settings?.sounds) {
    if (r.phase === 'bidding') sfx('sfxDeal');
    if (r.phase === 'playing') sfx('sfxPlay');
    if (r.phase === 'finished') sfx('sfxWin');
  }
}

function renderChatReacts(m){
  const cont=document.createElement('div'); cont.className='reactions';
  const bar=document.createElement('div');
  REACTS.forEach(e=>{ const b=document.createElement('button'); b.className='react-btn'; b.textContent=e; b.onclick=()=>reactChat(m.id,e); bar.appendChild(b); });
  const agg=document.createElement('div');
  if (m.reactions){ const chunks=[]; for (const e in m.reactions){ const n=Object.keys(m.reactions[e]||{}).length; if (n>0) chunks.push(`${e}${n}`); } agg.textContent=chunks.join(' '); }
  cont.appendChild(bar); cont.appendChild(agg);
  return cont.outerHTML;
}

function sfx(id){ const el=document.getElementById(id); if(!el) return; try{ el.currentTime=0; el.play(); }catch{} }
function startTick(r){
  if (tickTimer){ clearInterval(tickTimer); tickTimer=null; }
  const tEl=document.getElementById('timer'); if(!r.timers){ if(tEl) tEl.textContent='--'; return; }
  tickTimer=setInterval(()=>{
    const now=Date.now(); const remain=Math.max(0, Math.floor((r.timers.deadline-now)/1000));
    if (tEl) tEl.textContent=remain+'s'; if (r.settings?.sounds && remain<=5) sfx('sfxTick');
    if (navigator.vibrate && remain<=3) navigator.vibrate(80); if (remain<=0){ clearInterval(tickTimer); tickTimer=null; }
  },300);
}
function cardSort(a,b){ const order=['2','3','4','5','6','7','8','9','10','J','Q','K','A']; const sa=a.slice(-1), sb=b.slice(-1);
  const ra=a.slice(0,-1), rb=b.slice(0,-1); const suitOrder={H:0,D:1,C:2,S:3}; if (sa!==sb) return suitOrder[sa]-suitOrder[sb]; return order.indexOf(ra)-order.indexOf(rb); }
function renderCard(cstr,big=false){ const rank=cstr.slice(0,-1), suit=cstr.slice(-1); const el=document.createElement('div'); el.className='card'; if(big) el.style.minWidth='66px'; const suitChar=suitsMap[suit]||suit; el.innerHTML=`<div style="font-weight:800">${rank}</div><div>${suitChar}</div>`; el.title=cstr; return el; }
function escapeHTML(s){ return (s||'').replace(/[&<>\"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); }
