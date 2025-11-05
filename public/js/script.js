"use strict";
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
let scatterItems = [];
let doodles = [];
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resize();
window.addEventListener("resize", () => {
  resize();
  scatterItems = generateScatter();
});

const doodlePaths = [
  "/assets/star.svg",
  "/assets/bowl.svg",
  "/assets/cloud.svg",
  "/assets/diamond.svg",
  "/assets/egg.svg",
  "/assets/paper.svg",
  "/assets/pencil.svg",
  "/assets/square.svg",
];

function loadDoodles(callbacks) {
  let loaded = 0;
  doodlePaths.forEach((path) => {
    let img = new Image();
    img.src = path;
    img.onload = () => {
      doodles.push(img);
      loaded++;
      if (loaded == doodlePaths.length) callbacks();
    };
  });
}

function generateScatter() {
  let items = [];
  const count = 80;
  for (let i = 0; i < count; i++) {
    let img = doodles[Math.floor(Math.random() * doodles.length)];
    items.push({
      img,
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: 40 + Math.random() * 50,
      rotation: Math.random() * Math.PI * 2,
      drift: Math.random() * 0.5 + 0.2,
    });
  }
  return items;
}
let t = 0;
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  scatterItems.forEach((item) => {
    ctx.save();
    ctx.translate(item.x, item.y + Math.sin(t * item.drift) * 0.5);

    ctx.rotate(item.rotation + Math.sin(t * 0.01) * 0.05);
    ctx.drawImage(
      item.img,
      -item.size / 2,
      -item.size / 2,
      item.size,
      item.size
    );

    ctx.restore();
  });

  t++;
  requestAnimationFrame(draw);
}

loadDoodles(() => {
  scatterItems = generateScatter();
  draw();
});

const startScreen = document.getElementById("startScreen");
const usernameInput = document.getElementById("username");
const playBtn = document.getElementById("playBtn");
const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");

const closePopupBtn = document.getElementById("closePopupBtn");
const confirmJoinBtn = document.getElementById("confirmJoinBtn");
const joinPopup = document.getElementById("joinPopup");
const joinRoomIdInput = document.getElementById("joinRoomId");
const joinErrorMsg = joinPopup.querySelector(".errMsg");

const gameOverPopup = document.getElementById("gameOverPopup");
const gameOverMessage = document.getElementById("gameOverMessage");
const finalScoreBoard = document.getElementById("finalScoreBoard");
const playAgainBtn = document.getElementById("playAgainBtn");
const backToMenuBtn = document.getElementById("backToMenuBtn");

const user = localStorage.getItem("username");
if (user != null) {
  usernameInput.value = user;
}

function validateUsername() {
  if (usernameInput.value === "" || usernameInput.value.length < 3) {
    usernameInput.style.border = "2px solid red";
    return false;
  } else {
    usernameInput.style.border = "2px solid green";
    localStorage.setItem("username", usernameInput.value);
    return true;
  }
}

const socket = io();

createRoomBtn.addEventListener("click", () => {
  if (!validateUsername()) return;
  window.location.href = "create-room.html";
});

joinRoomBtn.addEventListener("click", function () {
  if (!validateUsername()) return;
  joinPopup.style.display = "flex";
  joinErrorMsg.textContent = "";
  joinRoomIdInput.style.border = "1px solid var(--border)";
});

closePopupBtn.addEventListener("click", function () {
  joinPopup.style.display = "none";
  joinRoomIdInput.value = "";
  joinErrorMsg.textContent = "";
  joinRoomIdInput.style.border = "1px solid var(--border)";
});

confirmJoinBtn.addEventListener("click", () => {
  const roomId = joinRoomIdInput.value.trim();
  if (!roomId) {
    joinRoomIdInput.style.border = "2px solid red";
    joinErrorMsg.textContent = "Please enter a Room ID.";
    joinErrorMsg.style.display = "block";
    joinErrorMsg.style.color = "red";
    return;
  }
  joinRoomIdInput.style.border = "1px solid green";
  socket.emit("check-room", { roomId });
});

socket.on("room-ok", ({ roomId }) => {
  localStorage.setItem("username", usernameInput.value);

  joinPopup.style.display = "none";
  window.location.href = `create-room.html?roomId=${roomId}`;
});

socket.on("error-msg", (msg) => {
  joinErrorMsg.textContent = msg;
  joinErrorMsg.style.display = "block";
  joinErrorMsg.style.color = "red";
  joinRoomIdInput.style.border = "2px solid red";
});

socket.on("game-end", ({ finalScores }) => {
  startScreen.classList.add("hidden");
  joinPopup.classList.add("hidden");
  gameOverPopup.classList.remove("hidden");

  gameOverMessage.textContent = "Thanks for playing!";
  finalScoreBoard.innerHTML = "";
  finalScores
    .sort((a, b) => b.score - a.score)
    .forEach((player, index) => {
      const li = document.createElement("li");
      li.textContent = `${index + 1}. ${player.username}: ${
        player.score
      } points`;
      finalScoreBoard.appendChild(li);
    });
  localStorage.removeItem("roomId");
  localStorage.removeItem("hostId");
  localStorage.removeItem("isHost");
  localStorage.removeItem("isDrawer");
});

playAgainBtn.addEventListener("click", () => {
  gameOverPopup.classList.add("hidden");
  startScreen.classList.remove("hidden");
  usernameInput.style.border = "2px solid var(--border)";
});

backToMenuBtn.addEventListener("click", () => {
  gameOverPopup.classList.add("hidden");
  startScreen.classList.remove("hidden");
  usernameInput.style.border = "2px solid var(--border)";
});

gameOverPopup.classList.add("hidden");
