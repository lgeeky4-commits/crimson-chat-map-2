"use strict";
const express = require("express");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const { Server } = require("socket.io");
const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 100000 });
const PORT = process.env.PORT || 3000;
const MAX_USERS = 3;
const users = new Map(); // socket id -> {name}
const roomState = new Map(); // room id -> {messages, annotations}
app.use(express.static(path.join(__dirname, "public")));

function trim(v, max) { return typeof v === "string" ? v.trim().slice(0, max) : ""; }
function roster() { return [...users].map(([id, u]) => ({id, name:u.name})); }
function privateId(a, b) { return `dm:${[a,b].sort().join(":")}`; }
function roomFor(socket, requested) {
  if (!users.has(socket.id)) return null;
  if (requested === "public") return "public";
  const peer = [...users.keys()].find(id => id === requested);
  return peer && peer !== socket.id ? privateId(socket.id, peer) : null;
}
function state(room) {
  if (!roomState.has(room)) roomState.set(room, { messages: [], annotations: [] });
  return roomState.get(room);
}
function pushLimited(arr, item, max) { arr.push(item); if (arr.length > max) arr.shift(); }
function sendUsers() { io.emit("users", roster()); }
function ack(reply, result) { if (typeof reply === "function") reply(result); }
function validRefPoint(p) {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y) &&
    p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
}
function normalizePoints(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 30 || !input.every(validRefPoint)) return null;
  return input.map(p => ({x:p.x, y:p.y}));
}

io.on("connection", socket => {
  socket.emit("hello", { maxUsers: MAX_USERS });
  socket.on("join", (nameValue, reply) => {
    if (users.has(socket.id)) { ack(reply, {ok:true, id:socket.id}); return; }
    if (users.size >= MAX_USERS) { ack(reply, {ok:false, error:"This chat already has three connected people."}); return; }
    const name = trim(nameValue, 20).replace(/\s+/g, " ");
    if (!name || name.length < 2) { ack(reply, {ok:false, error:"Enter a name (at least 2 characters)."}); return; }
    if ([...users.values()].some(u => u.name.toLowerCase() === name.toLowerCase())) {
      ack(reply, {ok:false, error:"That name is already taken."}); return;
    }
    users.set(socket.id, {name});
    socket.join("public");
    // Pair rooms are joined on the server for both peers, so private events go only to that pair.
    for (const id of users.keys()) {
      if (id === socket.id) continue;
      const room = privateId(socket.id, id);
      socket.join(room);
      io.sockets.sockets.get(id)?.join(room);
    }
    ack(reply, {ok:true, id:socket.id, name});
    sendUsers();
  });

  socket.on("room:load", (key, reply) => {
    const room = roomFor(socket, key);
    if (!room) return ack(reply, {ok:false, error:"Conversation unavailable."});
    const s = state(room);
    ack(reply, {ok:true, messages:s.messages, annotations:s.annotations});
  });

  socket.on("message:send", (data, reply) => {
    const room = roomFor(socket, data?.to);
    const text = trim(data?.text, 1500);
    if (!room || !text) return ack(reply, {ok:false, error:"Message was not sent."});
    const item = {id:crypto.randomUUID(), userId:socket.id, name:users.get(socket.id).name, text, time:Date.now()};
    pushLimited(state(room).messages, item, 200);
    io.to(room).emit("message:new", {room, item});
    ack(reply, {ok:true});
  });

  socket.on("map:add", (data, reply) => {
    const room = roomFor(socket, data?.to);
    const base = "reference";
    const kind = data?.kind === "path" ? "path" : "pin";
    const points = normalizePoints(data?.points);
    const note = trim(data?.note, 240);
    if (!room || !points || (kind === "path" && points.length < 2) || (kind === "pin" && points.length !== 1)) {
      return ack(reply, {ok:false, error:"Invalid map annotation."});
    }
    const item = {id:crypto.randomUUID(), userId:socket.id, name:users.get(socket.id).name,
      kind, base, points, note, time:Date.now()};
    pushLimited(state(room).annotations, item, 120);
    io.to(room).emit("map:new", {room, item});
    ack(reply, {ok:true});
  });

  socket.on("map:delete", (data, reply) => {
    const room = roomFor(socket, data?.to);
    if (!room) return ack(reply, {ok:false});
    const s = state(room);
    const idx = s.annotations.findIndex(item => item.id === data?.id && item.userId === socket.id);
    if (idx < 0) return ack(reply, {ok:false, error:"You can remove only your own markers and paths."});
    const [removed] = s.annotations.splice(idx, 1);
    io.to(room).emit("map:removed", {room, id:removed.id});
    ack(reply, {ok:true});
  });

  socket.on("disconnect", () => {
    if (!users.has(socket.id)) return;
    users.delete(socket.id);
    // Socket IDs are temporary: discard private conversation state when a member leaves.
    for (const key of [...roomState.keys()]) if (key.startsWith("dm:") && key.split(":").includes(socket.id)) roomState.delete(key);
    sendUsers();
  });
});
server.listen(PORT, "0.0.0.0", () => console.log(`Crimson Chat running on port ${PORT}`));
