const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3003;
app.use(express.static(path.join(__dirname, "public")));

const rooms = {};
const wordList = [
  "Dinosaur",
  "Volcano",
  "Jungle",
  "Meteor",
  "Fossil",
  "T-Rex",
  "Laptop",
  "Keyboard",
  "Mountain",
  "Star",
  "River",
  "Castle",
  "Bicycle",
  "Telescope",
  "Guitar",
  "Sunflower",
  "Ocean",
  "Pirate",
  "Robot",
  "Dragon",
  "Wizard",
  "Spaceship",
  "Alien",
  "Moon",
];

const GAME_SETTINGS = {
  DRAW_TIME: 90,
  ROUNDS: 3,
};

const getThreeRandomWords = () => {
  const shuffled = [...wordList].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, 3);
};

io.on("connection", (socket) => {
  socket.on("create-room", ({ username }) => {
    const roomId = Math.random().toString(36).substring(2, 7);

    rooms[roomId] = {
      hostId: socket.id,
      players: [],
      drawingHistory: [],
      currentDrawerIndex: -1,
      currentWord: "",
      round: 0,
      timer: null,
      timerValue: GAME_SETTINGS.DRAW_TIME,
    };

    socket.join(roomId);

    rooms[roomId].players.push({
      id: socket.id,
      username: username || "Host",
      score: 0,
      hasGuessed: false,
      isDrawing: false,
    });

    socket.emit("room-created", {
      roomId,
      hostId: socket.id,
      players: rooms[roomId].players,
    });

    io.to(roomId).emit("update-player-list", rooms[roomId].players);
  });

  socket.on("check-room", ({ roomId }) => {
    if (rooms[roomId]) {
      socket.emit("room-ok", { roomId });
    } else {
      socket.emit("error-msg", "Room does not exist.");
    }
  });

  socket.on("join-room", ({ username, roomId }) => {
    const room = rooms[roomId];
    if (!room) {
      return socket.emit("error-msg", "Room does not exist.");
    }

    socket.join(roomId);

    // Find player by persistent username
    let existingPlayer = room.players.find((p) => p.username === username);

    if (existingPlayer) {
      // Player is RECONNECTING: Reassign the new socket ID to the existing player object
      existingPlayer.id = socket.id;

      io.to(roomId).emit("chat-message", {
        message: `${username} has re-joined the game.`,
        type: "server",
      });
    } else {
      room.players.push({
        id: socket.id,
        username,
        score: 0,
        hasGuessed: false,
        isDrawing: false,
      });

      io.to(roomId).emit("chat-message", {
        message: `${username} has joined the game!`,
        type: "server",
      });
    }

    socket.emit("joined-room", {
      roomId,
      hostId: room.hostId,
      players: room.players,
    });

    io.to(roomId).emit("update-player-list", room.players);
    socket.emit("canvas-history", room.drawingHistory);
  });

  socket.on("start-game", ({ roomId }) => {
    if (!rooms[roomId] || rooms[roomId].hostId !== socket.id) return;
    rooms[roomId].round = 1;
    startGameTurn(roomId);
  });

  socket.on("word-selected", ({ roomId, word }) => {
    const room = rooms[roomId];
    if (!room || room.players[room.currentDrawerIndex].id !== socket.id) return;

    room.currentWord = word;
    const hiddenWord = word.replace(/./g, "_ ");

    io.to(roomId).emit("turn-start", { hiddenWord });
    startTurnTimer(roomId);
  });

  // --- REAL-TIME COMMUNICATION (No changes needed here) ---
  socket.on("send-message", ({ roomId, username, message }) => {
    const room = rooms[roomId];
    if (!room) return;

    // Check for correct guess
    if (
      message.toLowerCase() === room.currentWord.toLowerCase() &&
      room.currentWord !== ""
    ) {
      const player = room.players.find((p) => p.id === socket.id);
      if (
        player &&
        !player.hasGuessed &&
        player.id !== room.players[room.currentDrawerIndex].id
      ) {
        const drawer = room.players[room.currentDrawerIndex];

        player.score += room.timerValue;
        drawer.score += 20;
        player.hasGuessed = true;

        io.to(roomId).emit("chat-message", {
          message: `${username} has guessed the word!`,
          type: "correct",
        });
        io.to(roomId).emit("update-player-list", room.players);

        const allGuessed = room.players.every(
          (p) => p.hasGuessed || p.id === drawer.id
        );
        if (allGuessed) {
          endTurn(roomId);
        }
      }
    } else {
      io.to(roomId).emit("chat-message", { username, message });
    }
  });

  socket.on("drawing", (data) => {
    if (!rooms[data.roomId]) return;
    rooms[data.roomId].drawingHistory.push(data);
    socket.to(data.roomId).emit("draw", data);
  });

  socket.on("clear-canvas", ({ roomId }) => {
    if (!rooms[roomId]) return;
    rooms[roomId].drawingHistory = [];
    io.to(roomId).emit("clear-canvas");
  });

  socket.on("request-canvas-history", (roomId) => {
    if (rooms[roomId]) {
      socket.emit("canvas-history", rooms[roomId].drawingHistory);
    }
  });

  // --- UPDATED: Disconnect Logic with 30s Grace Period ---
  socket.on("disconnect", () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      // Find the player by the disconnecting socket ID
      const playerIndex = room.players.findIndex((p) => p.id === socket.id);

      if (playerIndex !== -1) {
        const player = room.players[playerIndex];

        // Announce temporary disconnection (but keep player in array for now)
        io.to(roomId).emit("chat-message", {
          message: `${player.username} has disconnected (waiting for reconnect...).`,
          type: "server",
        });

        // End the turn if the drawer disconnected
        if (player.isDrawing) {
          endTurn(roomId);
        }
        setTimeout(() => {
          const updatedRoom = rooms[roomId];
          if (!updatedRoom) return;

          const disconnectedPlayerIndex = updatedRoom.players.findIndex(
            (p) => p.id === socket.id
          );

          if (disconnectedPlayerIndex !== -1) {
            updatedRoom.players.splice(disconnectedPlayerIndex, 1);
            io.to(roomId).emit("chat-message", {
              message: `${player.username} has been permanently removed due to timeout.`,
              type: "server",
            });
            io.to(roomId).emit("update-player-list", updatedRoom.players);

            if (updatedRoom.players.length === 0) {
              delete rooms[roomId];
              console.log(`Room ${roomId} deleted after player timeout.`);
            }
          }
        }, 30000);

        break;
      }
    }
  });
});

function startGameTurn(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  room.players.forEach((p) => (p.hasGuessed = false));
  room.currentDrawerIndex++;

  if (room.currentDrawerIndex >= room.players.length) {
    room.currentDrawerIndex = 0;
    room.round++;
  }

  if (room.round > GAME_SETTINGS.ROUNDS) {
    if (room.players.length >= 2) {
      endGame(roomId);
    } else {
      delete rooms[roomId];
    }
    return;
  }

  if (room.players.length < 2) {
    io.to(roomId).emit("chat-message", {
      message: "Not enough players to continue. Waiting for more...",
      type: "server",
    });
    return;
  }

  const drawer = room.players[room.currentDrawerIndex];
  drawer.isDrawing = true;

  room.players.forEach((p) => (p.isDrawing = p.id === drawer.id));

  io.to(roomId).emit("new-turn", {
    drawerId: drawer.id,
    round: room.round,
    totalRounds: GAME_SETTINGS.ROUNDS,
  });

  io.to(roomId).emit("update-player-list", room.players);

  const words = getThreeRandomWords();
  io.to(drawer.id).emit("word-choices", words);
}

function startTurnTimer(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  room.timerValue = GAME_SETTINGS.DRAW_TIME;
  io.to(roomId).emit("update-timer", room.timerValue);

  room.timer = setInterval(() => {
    room.timerValue--;
    io.to(roomId).emit("update-timer", room.timerValue);

    if (room.timerValue <= 0) {
      endTurn(roomId);
    }
  }, 1000);
}

function endTurn(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  clearInterval(room.timer);
  room.timer = null;

  io.to(roomId).emit("reveal-word", room.currentWord);

  room.currentWord = "";
  room.drawingHistory = [];

  setTimeout(() => {
    startGameTurn(roomId);
  }, 5000);
}

function endGame(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  clearInterval(room.timer);
  io.to(roomId).emit("game-end", { finalScores: room.players });
  delete rooms[roomId];
}

server.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`)
);
