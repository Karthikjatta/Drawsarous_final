"use strict";
const socket = io();
const playerList = document.getElementById("playerList");
const startBtn = document.getElementById("startBtn");
const chatInput = document.getElementById("chatInput");
const messages = document.getElementById("messages");
const copyBtn = document.getElementById("copyBtn");
const roomIdElem = document.getElementById("roomid");
const username =
  localStorage.getItem("username") ||
  "Player" + Math.floor(Math.random() * 100);

const urlParams = new URLSearchParams(window.location.search);
const urlRoomId = urlParams.get("roomId");

if (urlRoomId) {
  socket.emit("join-room", { username, roomId: urlRoomId });
} else {
  socket.emit("create-room", { username });
}

socket.on("room-created", ({ roomId, players, hostId }) => {
  roomIdElem.value = roomId;
  localStorage.setItem("roomId", roomId);
  localStorage.setItem("hostId", hostId);
  localStorage.setItem("isHost", "true");
  updatePlayerList(players, hostId);
});

socket.on("joined-room", ({ roomId, players, hostId }) => {
  roomIdElem.value = roomId;
  localStorage.setItem("roomId", roomId);
  localStorage.setItem("hostId", hostId);
  localStorage.setItem("isHost", socket.id === hostId ? "true" : "false");
  updatePlayerList(players, hostId);
});

socket.on("update-player-list", (players) => {
  const hostId = localStorage.getItem("hostId");
  updatePlayerList(players, hostId);
});

socket.on("chat-message", ({ username, message, type = "chat" }) => {
  appendMessage(username, message, type);
});

socket.on("new-turn", ({ drawerId }) => {
  const roomId = localStorage.getItem("roomId");
  if (!roomId) return;
  const amDrawer = socket.id === drawerId;
  localStorage.setItem("isDrawer", amDrawer ? "true" : "false");
  window.location.href = `paint.html?roomId=${roomId}`;
});

socket.on("error-msg", (msg) => alert(msg));

chatInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    const message = chatInput.value.trim();
    if (!message) return;

    const roomId = getRoomId();
    socket.emit("send-message", { roomId, username, message });

    chatInput.value = "";
  }
});

startBtn.addEventListener("click", () => {
  const roomId = getRoomId();
  const hostId = localStorage.getItem("hostId");
  if (socket.id !== hostId) {
    alert("Only the host can start the game!");
    return;
  }
  socket.emit("start-game", { roomId });
});

copyBtn.addEventListener("click", () => {
  const roomId = getRoomId();
  navigator.clipboard
    .writeText(roomId)
    .then(() => alert("Room ID Copied ✅"))
    .catch(() => alert("Failed to copy ❌"));
});

function updatePlayerList(players, hostId) {
  playerList.innerHTML = "";
  let amIHost = false;

  players.forEach((player) => {
    const li = document.createElement("li");
    li.textContent = player.username + (player.id === hostId ? " (Host)" : "");
    if (player.id === hostId) li.classList.add("host");
    li.classList.add("player");
    playerList.appendChild(li);

    if (player.id === socket.id && player.id === hostId) {
      amIHost = true;
    }
  });

  const isHost = localStorage.getItem("isHost") === "true" || amIHost;
  if (isHost) {
    startBtn.style.display = "block";
    startBtn.disabled = players.length < 2;
    startBtn.textContent =
      players.length < 2 ? "Waiting for players..." : "Start Game";
  } else {
    startBtn.style.display = "none";
  }
}

function appendMessage(username, message, type = "chat") {
  const p = document.createElement("p");

  if (type === "server" || type === "correct") {
    p.className = "server-message";
    if (type === "correct") p.classList.add("correct");
    p.textContent = message;
  } else {
    p.className = "chat-message";
    p.textContent = `${username}: ${message}`;
  }

  messages.appendChild(p);
  messages.scrollTop = messages.scrollHeight;
}

function getRoomId() {
  return roomIdElem.value.trim();
}
