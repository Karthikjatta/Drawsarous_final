"use strict";

const socket = io();

const canvas = document.querySelector("#canvas");
const ctx = canvas.getContext("2d");
const toolbar = document.getElementById("toolbar");
const toolButtons = document.querySelectorAll(".tool");
const fillColorCheckbox = document.querySelector("#fill-color");
const sizeSlider = document.querySelector("#size-slider");
const colorButtons = document.querySelectorAll(".colors .option");
const colorPicker = document.querySelector("#color-picker");
const clearCanvasBtn = document.querySelector("#clearCanvasBtn");

const playerListEl = document.getElementById("playerList");
const messagesEl = document.getElementById("messages");
const guessInput = document.getElementById("guessInput");
const timerEl = document.getElementById("timer");
const roundInfoEl = document.getElementById("roundInfo");
const hiddenWordEl = document.getElementById("hiddenWord");
const wordChoicePopup = document.getElementById("wordChoicePopup");
const wordOptionsEl = document.getElementById("wordOptions");

let isDrawing = false;
let isMyTurn = false;
let brushWidth = 5;
let selectedTool = "brush";
let selectedColor = "#e02020";
let prevMouseX, prevMouseY, snapshot;

const { roomId, username } = {
  roomId: new URLSearchParams(window.location.search).get("roomId"),
  username: localStorage.getItem("username") || "Anonymous",
};

if (!roomId || !username) {
  window.location.href = "/";
}

const setCanvasBackground = () => {
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
};

const resizeCanvas = () => {
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  setCanvasBackground();
  socket.emit("request-canvas-history", roomId);
};

window.addEventListener("load", resizeCanvas);
window.addEventListener("resize", resizeCanvas);

socket.on("connect", () => {
  socket.emit("join-room", { username, roomId });
});

socket.on("error-msg", (message) => {
  alert(message);
  window.location.href = "/";
});

socket.on("joined-room", ({ hostId, players }) => {
  const me = players.find((p) => p.id === socket.id);

  if (me) {
    isMyTurn = me.isDrawing;
  }

  updateGameState();
});

socket.on("update-player-list", (players) => {
  playerListEl.innerHTML = "";
  players
    .sort((a, b) => b.score - a.score)
    .forEach((player) => {
      const playerItem = document.createElement("li");
      playerItem.className = "player-item";
      if (player.isDrawing) playerItem.classList.add("drawer");
      if (player.hasGuessed) playerItem.classList.add("correct-guesser");
      playerItem.innerHTML = `<span class="player-name">${player.username}${
        player.id === socket.id ? " (You)" : ""
      }</span> <span class="player-score">${player.score}</span>`;
      playerListEl.appendChild(playerItem);
    });
});

socket.on("chat-message", ({ username, message, type = "chat" }) => {
  const msgEl = document.createElement("p");
  if (type === "server" || type === "correct") {
    msgEl.className = "server-message";
    if (type === "correct") msgEl.classList.add("correct");
    msgEl.textContent = message;
  } else {
    msgEl.className = "chat-message";
    msgEl.textContent = `${username}: ${message}`;
  }
  messagesEl.appendChild(msgEl);
  messagesEl.scrollTop = messagesEl.scrollHeight;
});

socket.on("new-turn", ({ drawerId, round, totalRounds }) => {
  isMyTurn = socket.id === drawerId;
  clearCanvas();
  updateGameState();
  roundInfoEl.textContent = `Round ${round} / ${totalRounds}`;
  hiddenWordEl.textContent = "";
});

socket.on("word-choices", (words) => {
  if (!isMyTurn) return;
  wordOptionsEl.innerHTML = "";
  words.forEach((word) => {
    const button = document.createElement("button");
    button.className = "word-option-btn";
    button.textContent = word;
    button.onclick = () => {
      socket.emit("word-selected", { roomId, word });
      wordChoicePopup.classList.add("hidden");
    };
    wordOptionsEl.appendChild(button);
  });
  wordChoicePopup.classList.remove("hidden");
});

socket.on("turn-start", ({ hiddenWord }) => {
  hiddenWordEl.textContent = hiddenWord;
});

socket.on("update-timer", (time) => {
  timerEl.textContent = time;
});

socket.on("reveal-word", (word) => {
  hiddenWordEl.textContent = word;
});

socket.on("game-end", ({ finalScores }) => {
  localStorage.setItem("finalScores", JSON.stringify(finalScores));

  localStorage.removeItem("roomId");
  localStorage.removeItem("hostId");
  localStorage.removeItem("isHost");
  localStorage.removeItem("isDrawer");

  window.location.href = "/";
});

const startDraw = (e) => {
  if (!isMyTurn) return;
  isDrawing = true;
  prevMouseX = e.offsetX;
  prevMouseY = e.offsetY;
  ctx.beginPath();
  ctx.lineWidth = brushWidth;
  ctx.strokeStyle = selectedColor;
  ctx.fillStyle = selectedColor;
  snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
};

const continueDraw = (e) => {
  if (!isMyTurn || !isDrawing) return;

  if (selectedTool === "brush" || selectedTool === "eraser") {
    const drawData = {
      tool: selectedTool,
      startX: prevMouseX,
      startY: prevMouseY,
      currentX: e.offsetX,
      currentY: e.offsetY,
      color: selectedTool === "eraser" ? "#FFFFFF" : selectedColor,
      width: brushWidth,
    };
    renderDraw(drawData);
    socket.emit("drawing", { roomId, ...drawData });

    prevMouseX = e.offsetX;
    prevMouseY = e.offsetY;
  } else {
    ctx.putImageData(snapshot, 0, 0);
    const shapeData = {
      tool: selectedTool,
      fill: fillColorCheckbox.checked,
      startX: prevMouseX,
      startY: prevMouseY,
      currentX: e.offsetX,
      currentY: e.offsetY,
      color: selectedColor,
      width: brushWidth,
    };
    renderShape(shapeData);
  }
};

const stopDraw = (e) => {
  if (!isMyTurn || !isDrawing) return;

  if (selectedTool !== "brush" && selectedTool !== "eraser") {
    const shapeData = {
      tool: selectedTool,
      fill: fillColorCheckbox.checked,
      startX: prevMouseX,
      startY: prevMouseY,
      currentX: e.offsetX,
      currentY: e.offsetY,
      color: selectedColor,
      width: brushWidth,
    };
    renderShape(shapeData);
    socket.emit("drawing", { roomId, ...shapeData });
  }

  isDrawing = false;
  ctx.closePath();
};

const renderDraw = (data) => {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = data.color;
  ctx.lineWidth = data.width;
  ctx.beginPath();
  ctx.moveTo(data.startX, data.startY);
  ctx.lineTo(data.currentX, data.currentY);
  ctx.stroke();
};

const renderShape = (data) => {
  ctx.lineWidth = data.width;
  ctx.strokeStyle = data.color;
  ctx.fillStyle = data.color;
  ctx.beginPath();
  if (data.tool === "rectangle") {
    data.fill
      ? ctx.fillRect(
          data.startX,
          data.startY,
          data.currentX - data.startX,
          data.currentY - data.startY
        )
      : ctx.strokeRect(
          data.startX,
          data.startY,
          data.currentX - data.startX,
          data.currentY - data.startY
        );
  } else if (data.tool === "circle") {
    let radius = Math.sqrt(
      Math.pow(data.currentX - data.startX, 2) +
        Math.pow(data.currentY - data.startY, 2)
    );
    ctx.arc(data.startX, data.startY, radius, 0, 2 * Math.PI);
    data.fill ? ctx.fill() : ctx.stroke();
  } else if (data.tool === "triangle") {
    ctx.moveTo(data.startX, data.startY);
    ctx.lineTo(data.currentX, data.currentY);
    ctx.lineTo(data.startX * 2 - data.currentX, data.currentY);
    ctx.closePath();
    data.fill ? ctx.fill() : ctx.stroke();
  }
};

socket.on("draw", (data) => {
  if (data.tool === "brush" || data.tool === "eraser") {
    renderDraw(data);
  } else {
    renderShape(data);
  }
});

socket.on("canvas-history", (history) => {
  clearCanvas();
  history.forEach((data) => {
    if (data.tool === "brush" || data.tool === "eraser") {
      renderDraw(data);
    } else {
      renderShape(data);
    }
  });
});

const clearCanvas = () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  setCanvasBackground();
};
socket.on("clear-canvas", clearCanvas);

guessInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    const guess = guessInput.value.trim();
    if (guess) {
      socket.emit("send-message", { roomId, username, message: guess });
      guessInput.value = "";
    }
  }
});

canvas.addEventListener("mousedown", startDraw);
canvas.addEventListener("mousemove", continueDraw);
canvas.addEventListener("mouseup", stopDraw);
canvas.addEventListener("mouseout", stopDraw);

toolButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelector(".options .active").classList.remove("active");
    btn.classList.add("active");
    selectedTool = btn.id;
  });
});
sizeSlider.addEventListener("change", () => (brushWidth = sizeSlider.value));
colorButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelector(".colors .selected").classList.remove("selected");
    btn.classList.add("selected");
    selectedColor = window
      .getComputedStyle(btn)
      .getPropertyValue("background-color");
  });
});
colorPicker.addEventListener("change", () => {
  colorPicker.parentElement.style.background = colorPicker.value;
  selectedColor = colorPicker.value;
});
clearCanvasBtn.addEventListener("click", () => {
  if (isMyTurn) {
    clearCanvas();
    socket.emit("clear-canvas", { roomId });
  }
});

function updateGameState() {
  if (isMyTurn) {
    toolbar.classList.remove("hidden");
    guessInput.disabled = true;
    guessInput.placeholder = "You are drawing!";
    canvas.style.cursor = "crosshair";
  } else {
    toolbar.classList.add("hidden");
    guessInput.disabled = false;
    guessInput.placeholder = "Type your guess here...";
    canvas.style.cursor = "not-allowed";
  }
}
