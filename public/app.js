"use strict";
const $ = id => document.getElementById(id);
const socket = io();
const ui = Object.fromEntries([
  'joinScreen','mainScreen','joinForm','nameInput','joinError','slotText','usersNav','publicNav','privateNav','mapNav',
  'privateName','mapOpen','backFromPrivate','backFromMap','chatScreen','chatPanel','mapScreen','chatStatus',
  'messages','messageForm','messageInput','mapVisibility','pinButton','pathButton','mapHelp',
  'mapCanvas','mapLines','mapPins','draftActions','draftCount','undoPoint','cancelDraft','finishPath',
  'annotationList','annotationCount','noteDialog','noteForm','noteInput','noteTitle','cancelNote','toast','connectionStatus'
].map(id => [id,$(id)]));

let myId = null;
let roster = [];
let target = 'public';
let onMap = false;
let messages = [];
let annotations = [];
let roomRequest = 0;
let toolMode = 'browse';
let draftPoints = [];
let pendingPoints = [];
let pendingType = 'pin';
let noteOpenId = null;
let toastTimeout;

function create(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function toast(text) {
  ui.toast.textContent = text;
  ui.toast.classList.remove('hidden');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => ui.toast.classList.add('hidden'), 3200);
}
function peer(id) { return roster.find(u => u.id === id); }
function roomId() { return target === 'public' ? 'public' : `dm:${[myId,target].sort().join(':')}`; }
function isCurrentRoom(room) { return Boolean(myId) && room === roomId(); }
function time(timestamp) { return new Date(timestamp).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}); }

function displayHeader() {
  const priv = target !== 'public';
  ui.mainScreen.classList.toggle('is-private',priv);
  ui.publicNav.classList.toggle('hidden',onMap || priv);
  ui.privateNav.classList.toggle('hidden',onMap || !priv);
  ui.mapNav.classList.toggle('hidden',!onMap);
  ui.mapOpen.classList.toggle('hidden',onMap);
  ui.chatScreen.classList.toggle('hidden',onMap);
  ui.mapScreen.classList.toggle('hidden',!onMap);
  ui.privateName.textContent = peer(target)?.name || 'name';
  ui.chatStatus.textContent = priv ? `private: ${peer(target)?.name||''}` : 'public chat';
  ui.mapVisibility.textContent = priv ? `private • ${peer(target)?.name||'name'}` : 'public • all three';
}
function renderRoster() {
  ui.usersNav.replaceChildren();
  for (let i=0; i<3; i++) {
    const person=roster[i];
    const label = person ? person.name : 'name';
    const btn=create('button','person-tab'+(person?.id === myId ? ' is-me' : '')+(!person ? ' is-empty':''),label);
    btn.type='button';
    if(person) {
      btn.title=person.id===myId ? 'Public chat' : `Private chat with ${person.name}`;
      btn.addEventListener('click',()=>openConversation(person.id === myId ? 'public' : person.id));
    } else { btn.disabled=true;btn.title='Waiting for another person'; }
    ui.usersNav.append(btn);
  }
  if(target !== 'public' && !peer(target)) {
    target='public';onMap=false;resetTool();loadConversation();
  }
  if(!myId) ui.slotText.textContent=`${roster.length} / 3 people online`;
  displayHeader();
}
function renderMessages() {
  ui.messages.replaceChildren();
  if(messages.length===0) { ui.messages.append(create('div','empty-chat','chat')); return; }
  for(const msg of messages) {
    const own = msg.userId === myId;
    const row=create('div','message'+(own?' own':''));
    row.append(
      create('div','sender',own?'you':msg.name),
      create('div','bubble',msg.text),
      create('div','time',time(msg.time))
    );
    ui.messages.append(row);
  }
  ui.messages.scrollTop=ui.messages.scrollHeight;
}
function resetTool() {
  toolMode='browse'; draftPoints=[];pendingPoints=[];
  paintDraft();
}
function loadConversation() {
  const request=++roomRequest;
  socket.emit('room:load',target,(result)=>{
    if(request!==roomRequest)return;
    if(!result?.ok){toast(result?.error||'Cannot open chat');return;}
    messages=result.messages||[];
    annotations=(result.annotations||[]).filter(a=>a.base==='reference');
    noteOpenId=null;
    renderMessages();renderMap();
  });
}
function openConversation(nextTarget) {
  if(!myId || (nextTarget!=='public' && !peer(nextTarget)))return;
  target=nextTarget;
  onMap=false;
  resetTool();
  displayHeader();
  loadConversation();
}
function enterMap() {
  onMap=true;
  resetTool();
  displayHeader();
  renderMap();
}
function leaveMap() {
  onMap=false;
  resetTool();
  displayHeader();
}
function pointButton(p,text,draft=false,onClick) {
  const button=create('button','map-pin'+(draft?' draft':''),text);
  button.type='button';
  button.style.left=`${p.x*100}%`;
  button.style.top=`${p.y*100}%`;
  button.addEventListener('click',e=>{e.stopPropagation();if(onClick)onClick();});
  ui.mapPins.append(button);
  return button;
}
function drawPath(points,draft=false) {
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');
  path.setAttribute('d',points.map((p,index)=>`${index?'L':'M'}${(p.x*1000).toFixed(1)} ${(p.y*1000).toFixed(1)}`).join(' '));
  if(draft)path.setAttribute('class','draft');
  ui.mapLines.append(path);
}
function showNote(item) {
  noteOpenId = noteOpenId===item.id ? null : item.id;
  paintMap();
}
function paintMap() {
  ui.mapLines.replaceChildren();
  ui.mapPins.replaceChildren();
  for(const a of annotations) {
    if(a.kind==='path')drawPath(a.points);
    a.points.forEach((p,i)=>{
      pointButton(p,a.kind==='pin'?'●':String(i+1),false,()=>showNote(a));
    });
    if(noteOpenId===a.id) {
      const point=a.points[Math.floor((a.points.length-1)/2)];
      const tip=create('div','map-note');
      tip.textContent=a.note|| (a.kind==='pin'?'marked area':'saved path');
      tip.append(create('small','',`— ${a.name}`));
      tip.style.left=`${Math.min(78,Math.max(22,point.x*100))}%`;
      tip.style.top=`${Math.min(80,Math.max(7,point.y*100+4))}%`;
      tip.setAttribute('role','note');
      ui.mapPins.append(tip);
    }
  }
  paintDraft();
}
function paintDraft() {
  ui.pinButton.classList.toggle('active',toolMode==='pin');
  ui.pathButton.classList.toggle('active',toolMode==='path');
  ui.draftActions.classList.toggle('hidden',toolMode!=='path');
  ui.draftCount.textContent=`${draftPoints.length} point${draftPoints.length===1?'':'s'}`;
  ui.finishPath.disabled=draftPoints.length<2;
  ui.mapHelp.textContent=toolMode==='pin'?'tap the image to place a marker':toolMode==='path'?'tap to add points, then finish':'tap “mark area” or “path”';
  ui.mapPins.querySelectorAll('.draft').forEach(n=>n.remove());
  ui.mapLines.querySelectorAll('.draft').forEach(n=>n.remove());
  if(draftPoints.length>1)drawPath(draftPoints,true);
  draftPoints.forEach((p,i)=>pointButton(p,String(i+1),true));
}
function renderMap() {
  paintMap();
  ui.annotationCount.textContent=`${annotations.length} saved`;
  ui.annotationList.replaceChildren();
  if(!annotations.length) {
    ui.annotationList.append(create('span','annotation-empty','no markers or paths yet'));
    return;
  }
  for(const a of [...annotations].reverse()) {
    const row=create('div','annotation-row');
    const open=create('button','annotation-open',`${a.kind==='pin'?'●':'⌁'} ${a.note||'path'} · ${a.name}`);
    open.type='button';open.title='Show note on the map';
    open.addEventListener('click',()=>{noteOpenId=a.id;paintMap();});
    row.append(open);
    if(a.userId===myId){
      const del=create('button','annotation-remove','×');del.type='button';
      del.title='Delete your map item';
      del.addEventListener('click',()=>socket.emit('map:delete',{to:target,id:a.id},r=>{if(!r?.ok)toast(r?.error||'Could not delete');}));
      row.append(del);
    }
    ui.annotationList.append(row);
  }
}
function setTool(mode) {
  toolMode=toolMode===mode?'browse':mode;
  draftPoints=[];
  paintMap();
}
function canvasClicked(event) {
  if(toolMode==='browse' || event.target.closest('.map-pin') || event.target.closest('.map-note'))return;
  const bounds=ui.mapCanvas.getBoundingClientRect();
  const p={x:Math.max(0,Math.min(1,(event.clientX-bounds.left)/bounds.width)),y:Math.max(0,Math.min(1,(event.clientY-bounds.top)/bounds.height))};
  if(toolMode==='pin'){
    pendingPoints=[p];pendingType='pin';ui.noteTitle.textContent='marker message';ui.noteInput.value='';
    ui.noteDialog.showModal();
  } else if (toolMode==='path') {
    if(draftPoints.length>=30){toast('Maximum 30 path points');return;}
    draftPoints.push(p);
    paintMap();
  }
}
function saveMapItem(){
  const points=[...pendingPoints],kind=pendingType,note=ui.noteInput.value.trim();
  ui.noteDialog.close();resetTool();
  socket.emit('map:add',{to:target,base:'reference',kind,points,note},result=>{
    if(!result?.ok)toast(result?.error||'Could not save map item');
  });
}

ui.joinForm.addEventListener('submit',e=>{
  e.preventDefault();
  if(!socket.connected){ui.joinError.textContent='Not connected yet. Try again.';return;}
  socket.emit('join',ui.nameInput.value,result=>{
    if(!result?.ok){ui.joinError.textContent=result?.error||'Cannot join';return;}
    myId=result.id;
    ui.joinScreen.classList.add('hidden');
    ui.mainScreen.classList.remove('hidden');
    if(!roster.some(u=>u.id===myId))roster=[...roster,{id:myId,name:result.name}];
    renderRoster();openConversation('public');
  });
});
ui.backFromPrivate.addEventListener('click',()=>openConversation('public'));
ui.mapOpen.addEventListener('click',enterMap);
ui.backFromMap.addEventListener('click',leaveMap);
ui.messageForm.addEventListener('submit',e=>{
  e.preventDefault();
  const text=ui.messageInput.value.trim();
  if(!text)return;
  socket.emit('message:send',{to:target,text},result=>{if(!result?.ok)toast(result?.error||'Message not sent');});
  ui.messageInput.value='';ui.messageInput.focus();
});
ui.pinButton.addEventListener('click',()=>setTool('pin'));
ui.pathButton.addEventListener('click',()=>setTool('path'));
ui.mapCanvas.addEventListener('click',canvasClicked);
ui.undoPoint.addEventListener('click',()=>{draftPoints.pop();paintMap();});
ui.cancelDraft.addEventListener('click',resetTool);
ui.finishPath.addEventListener('click',()=>{
  if(draftPoints.length<2)return;
  pendingPoints=[...draftPoints];pendingType='path';
  ui.noteInput.value='';ui.noteTitle.textContent='path message';ui.noteDialog.showModal();
});
ui.noteForm.addEventListener('submit',e=>{e.preventDefault();saveMapItem();});
ui.cancelNote.addEventListener('click',()=>ui.noteDialog.close());
ui.noteDialog.addEventListener('close',()=>{pendingPoints=[];});

socket.on('connect',()=>{
  ui.connectionStatus.textContent='online';
  if(myId){
    // Socket IDs change after a reconnect; rejoining is required to restore access permissions.
    myId=null;roster=[];target='public';onMap=false;
    ui.mainScreen.classList.add('hidden');ui.joinScreen.classList.remove('hidden');
    ui.joinError.textContent='Connection restored. Enter your name again.';
  }
});
socket.on('disconnect',()=>{ui.connectionStatus.textContent='offline';ui.joinError.textContent='Disconnected. Checking connection…';});
socket.on('users',list=>{
  roster=Array.isArray(list)?list:[];
  ui.slotText.textContent=`${roster.length} / 3 people online`;
  if(myId)renderRoster();
});
socket.on('message:new',({room,item})=>{
  if(isCurrentRoom(room)){
    if(!messages.some(m=>m.id===item.id)){messages.push(item);renderMessages();}
  }else if(myId&&room.startsWith('dm:')&&room.split(':').includes(myId))toast(`Private message from ${item.name}`);
});
socket.on('map:new',({room,item})=>{
  if(isCurrentRoom(room)){
    if(item.base==='reference'&&!annotations.some(a=>a.id===item.id)){
      annotations.push(item);renderMap();
    }
  }else if(myId&&room.startsWith('dm:')&&room.split(':').includes(myId))toast(`Private map item from ${item.name}`);
});
socket.on('map:removed',({room,id})=>{
  if(!isCurrentRoom(room))return;
  annotations=annotations.filter(a=>a.id!==id);
  if(noteOpenId===id)noteOpenId=null;
  renderMap();
});
renderMap();
