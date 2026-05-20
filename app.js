const PLAYER_NAMES = {
  pink: "粉方",
  blue: "蓝方",
};

const PLAYER_LABELS = {
  pink: "粉方",
  blue: "蓝方",
};

const OTHER_PLAYER = {
  pink: "blue",
  blue: "pink",
};

const DIRECTIONS = [
  [2, 0],
  [1, -1],
  [-1, -1],
  [-2, 0],
  [-1, 1],
  [1, 1],
];

const STORAGE_KEYS = {
  firebaseConfig: "junyunJumpchessFirebaseConfig",
  playerId: "junyunJumpchessPlayerId",
  lastName: "junyunJumpchessLastName",
};

const FIREBASE_VERSION = "10.12.5";
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyClJR1879kFCHT8diGSXP3h4js-WhOLF2c",
  authDomain: "junyun-jumpchess.firebaseapp.com",
  databaseURL: "https://junyun-jumpchess-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "junyun-jumpchess",
  storageBucket: "junyun-jumpchess.firebasestorage.app",
  messagingSenderId: "440662662294",
  appId: "1:440662662294:web:bdfcbe657e73e86ecffbb7",
};
const BOARD_COORDS = buildBoardCoords();
const BOARD_KEYS = new Set(BOARD_COORDS.map(coordKey));
const BOARD_LINES = buildBoardLines();
const TOP_CAMP = BOARD_COORDS.filter((coord) => coord.r <= -5);
const BOTTOM_CAMP = BOARD_COORDS.filter((coord) => coord.r >= 5);
const TOP_CAMP_KEYS = new Set(TOP_CAMP.map(coordKey));
const BOTTOM_CAMP_KEYS = new Set(BOTTOM_CAMP.map(coordKey));

const els = {
  board: document.querySelector("#board"),
  turnBadge: document.querySelector("#turnBadge"),
  moveBadge: document.querySelector("#moveBadge"),
  message: document.querySelector("#message"),
  winnerBanner: document.querySelector("#winnerBanner"),
  winnerTitle: document.querySelector("#winnerTitle"),
  winnerReset: document.querySelector("#winnerReset"),
  localModeButton: document.querySelector("#localModeButton"),
  onlineModeButton: document.querySelector("#onlineModeButton"),
  onlinePanel: document.querySelector("#onlinePanel"),
  pinkName: document.querySelector("#pinkName"),
  blueName: document.querySelector("#blueName"),
  pinkStatus: document.querySelector("#pinkStatus"),
  blueStatus: document.querySelector("#blueStatus"),
  playerName: document.querySelector("#playerName"),
  firebaseConfigInput: document.querySelector("#firebaseConfigInput"),
  saveConfigButton: document.querySelector("#saveConfigButton"),
  createRoomButton: document.querySelector("#createRoomButton"),
  joinRoomButton: document.querySelector("#joinRoomButton"),
  roomCodeInput: document.querySelector("#roomCodeInput"),
  copyLinkButton: document.querySelector("#copyLinkButton"),
  undoButton: document.querySelector("#undoButton"),
  resetButton: document.querySelector("#resetButton"),
};

let state = createInitialState();
let selectedPieceId = null;
let legalDestinations = new Set();
let mode = "local";
let firebaseLib = null;
let firebaseApp = null;
let database = null;
let activeRoomRef = null;
let unsubscribeRoom = null;
let localPlayer = null;
let isApplyingRemote = false;
let lastSavedState = "";

const clientId = getOrCreateClientId();

hydrateStoredSettings();
wireEvents();
render();

const queryRoom = new URLSearchParams(window.location.search).get("room");
if (queryRoom) {
  setMode("online");
  els.roomCodeInput.value = queryRoom.toUpperCase();
  if (els.firebaseConfigInput.value.trim()) {
    joinRoom().catch((error) => showMessage(error.message));
  }
}

function wireEvents() {
  els.board.addEventListener("click", onBoardClick);
  els.localModeButton.addEventListener("click", () => setMode("local"));
  els.onlineModeButton.addEventListener("click", () => setMode("online"));
  els.saveConfigButton.addEventListener("click", saveFirebaseConfig);
  els.createRoomButton.addEventListener("click", () => createRoom().catch((error) => showMessage(error.message)));
  els.joinRoomButton.addEventListener("click", () => joinRoom().catch((error) => showMessage(error.message)));
  els.copyLinkButton.addEventListener("click", copyInviteLink);
  els.undoButton.addEventListener("click", undoMove);
  els.resetButton.addEventListener("click", resetGame);
  els.winnerReset.addEventListener("click", resetGame);
  els.pinkName.addEventListener("input", syncNamesFromInputs);
  els.blueName.addEventListener("input", syncNamesFromInputs);
  els.playerName.addEventListener("input", () => {
    localStorage.setItem(STORAGE_KEYS.lastName, els.playerName.value.trim());
  });

  const resizeObserver = new ResizeObserver(() => layoutBoard());
  resizeObserver.observe(els.board);
}

function hydrateStoredSettings() {
  const savedConfig = localStorage.getItem(STORAGE_KEYS.firebaseConfig);
  const savedName = localStorage.getItem(STORAGE_KEYS.lastName);

  els.firebaseConfigInput.value = savedConfig || JSON.stringify(DEFAULT_FIREBASE_CONFIG, null, 2);

  if (savedName) {
    els.playerName.value = savedName;
    els.pinkName.value = savedName;
  }
}

function setMode(nextMode) {
  mode = nextMode;
  els.localModeButton.classList.toggle("active", mode === "local");
  els.onlineModeButton.classList.toggle("active", mode === "online");
  els.onlinePanel.classList.toggle("hidden", mode !== "online");

  if (mode === "local") {
    localPlayer = null;
    showMessage(`${PLAYER_LABELS[state.turn]}回合。`);
  } else {
    showMessage("在线房间已打开。");
  }

  render();
}

function onBoardClick(event) {
  const cell = event.target.closest(".cell");
  if (!cell) return;

  const key = cell.dataset.key;
  const piece = getPieceAt(key);

  if (state.winner) {
    showMessage(`${getPlayerDisplayName(state.winner)}已经赢了。`);
    return;
  }

  if (mode === "online" && localPlayer && localPlayer !== state.turn) {
    showMessage(`现在是${getPlayerDisplayName(state.turn)}的回合。`);
    return;
  }

  if (piece && piece.player === state.turn) {
    selectPiece(piece.id);
    return;
  }

  if (selectedPieceId && legalDestinations.has(key)) {
    moveSelectedPiece(key);
    return;
  }

  if (piece) {
    showMessage(`这颗棋子属于${getPlayerDisplayName(piece.player)}。`);
    return;
  }

  showMessage("请选择当前回合的棋子。");
}

function selectPiece(pieceId) {
  selectedPieceId = pieceId;
  legalDestinations = getLegalMoves(state.pieces[pieceId], state.pieces);

  if (!legalDestinations.size) {
    showMessage("这颗棋子暂时没有可走的位置。");
  } else {
    showMessage(`可走 ${legalDestinations.size} 个位置。`);
  }

  render();
}

function moveSelectedPiece(destinationKey) {
  const previous = snapshotState(state);
  const piece = state.pieces[selectedPieceId];
  const destination = parseKey(destinationKey);

  state = {
    ...state,
    pieces: {
      ...state.pieces,
      [selectedPieceId]: {
        ...piece,
        q: destination.q,
        r: destination.r,
      },
    },
    history: [...state.history.slice(-24), previous],
    turn: OTHER_PLAYER[state.turn],
    moveNumber: state.moveNumber + 1,
    updatedAt: Date.now(),
  };

  selectedPieceId = null;
  legalDestinations = new Set();

  const winner = getWinner(state);
  if (winner) {
    state = {
      ...state,
      winner,
      turn: winner,
      updatedAt: Date.now(),
    };
    showMessage(`${getPlayerDisplayName(winner)}赢了。`);
  } else {
    showMessage(`${getPlayerDisplayName(state.turn)}回合。`);
  }

  commitState();
}

function undoMove() {
  if (!state.history.length) {
    showMessage("没有可以撤回的棋步。");
    return;
  }

  const previous = state.history[state.history.length - 1];
  state = {
    ...previous,
    history: state.history.slice(0, -1),
    updatedAt: Date.now(),
  };

  selectedPieceId = null;
  legalDestinations = new Set();
  showMessage(`已撤回，${getPlayerDisplayName(state.turn)}回合。`);
  commitState();
}

function resetGame() {
  const roomId = state.roomId;
  const players = state.players;
  const pinkName = mode === "online" ? players.pink.name : els.pinkName.value.trim() || "你";
  const blueName = mode === "online" ? players.blue.name : els.blueName.value.trim() || "筠筠";

  state = createInitialState();
  state.roomId = roomId;
  state.players = {
    pink: { ...state.players.pink, ...players.pink, name: pinkName },
    blue: { ...state.players.blue, ...players.blue, name: blueName },
  };
  state.updatedAt = Date.now();
  selectedPieceId = null;
  legalDestinations = new Set();
  showMessage("新棋局开始。");
  commitState();
}

function syncNamesFromInputs() {
  if (mode === "online") return;

  state = {
    ...state,
    players: {
      pink: {
        ...state.players.pink,
        name: els.pinkName.value.trim() || "粉方",
      },
      blue: {
        ...state.players.blue,
        name: els.blueName.value.trim() || "蓝方",
      },
    },
    updatedAt: Date.now(),
  };

  commitState({ quiet: true });
}

function render() {
  const occupied = getOccupiedMap(state.pieces);
  const fragment = document.createDocumentFragment();
  const boardArt = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  boardArt.classList.add("board-art");
  boardArt.setAttribute("aria-hidden", "true");
  fragment.appendChild(boardArt);

  for (const coord of BOARD_COORDS) {
    const key = coordKey(coord);
    const pieceId = occupied.get(key);
    const piece = pieceId ? state.pieces[pieceId] : null;
    const button = document.createElement("button");
    button.type = "button";
    button.className = [
      "cell",
      selectedPieceId === pieceId ? "selected" : "",
      legalDestinations.has(key) ? "legal" : "",
    ]
      .filter(Boolean)
      .join(" ");
    button.dataset.key = key;
    button.dataset.q = coord.q;
    button.dataset.r = coord.r;
    button.setAttribute("aria-label", getCellLabel(coord, piece));

    if (piece) {
      const pieceEl = document.createElement("span");
      pieceEl.className = `piece ${piece.player}`;
      button.appendChild(pieceEl);
    }

    fragment.appendChild(button);
  }

  els.board.replaceChildren(fragment);
  layoutBoard();
  renderStatus();
}

function renderStatus() {
  const turnName = getPlayerDisplayName(state.turn);
  els.turnBadge.textContent = state.winner ? `${getPlayerDisplayName(state.winner)}胜出` : `${turnName}回合`;
  els.turnBadge.classList.toggle("badge-pink", state.turn === "pink");
  els.turnBadge.classList.toggle("badge-blue", state.turn === "blue");
  els.moveBadge.textContent = `第 ${state.moveNumber} 手`;

  const hasOnlinePerspective = mode === "online" && (localPlayer === "pink" || localPlayer === "blue");
  els.pinkName.value = getPlayerDisplayName("pink");
  els.blueName.value = getPlayerDisplayName("blue");
  els.pinkName.readOnly = hasOnlinePerspective;
  els.blueName.readOnly = hasOnlinePerspective;
  els.pinkName.title = hasOnlinePerspective ? `粉方：${getPlayerName("pink")}` : "";
  els.blueName.title = hasOnlinePerspective ? `蓝方：${getPlayerName("blue")}` : "";
  els.pinkStatus.textContent = state.turn === "pink" && !state.winner ? "当前" : getCampProgress("pink");
  els.blueStatus.textContent = state.turn === "blue" && !state.winner ? "当前" : getCampProgress("blue");

  els.undoButton.disabled = !state.history.length;
  els.copyLinkButton.disabled = !state.roomId;

  els.winnerBanner.classList.toggle("hidden", !state.winner);
  if (state.winner) {
    els.winnerTitle.textContent = `${getPlayerDisplayName(state.winner)}赢了`;
  }
}

function layoutBoard() {
  const rect = els.board.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  const size = Math.min(width, height);
  if (!size) return;

  const rawPoints = BOARD_COORDS.map((coord) => {
    const x = coord.q;
    const y = Math.sqrt(3) * coord.r;
    return { ...coord, x, y };
  });

  const minX = Math.min(...rawPoints.map((point) => point.x));
  const maxX = Math.max(...rawPoints.map((point) => point.x));
  const minY = Math.min(...rawPoints.map((point) => point.y));
  const maxY = Math.max(...rawPoints.map((point) => point.y));
  const margin = size * 0.08;
  const scale = Math.min((width - margin * 2) / (maxX - minX), (height - margin * 2) / (maxY - minY));
  const offsetX = (width - (maxX - minX) * scale) / 2;
  const offsetY = (height - (maxY - minY) * scale) / 2;
  const cellSize = Math.max(16, Math.min(34, size * 0.043));
  const placedPoints = new Map();

  els.board.style.setProperty("--cell-size", `${cellSize}px`);

  for (const point of rawPoints) {
    const cell = els.board.querySelector(`[data-key="${coordKey(point)}"]`);
    if (!cell) continue;

    const x = offsetX + (point.x - minX) * scale;
    const y = offsetY + (point.y - minY) * scale;
    placedPoints.set(coordKey(point), { ...point, x, y });
    cell.style.left = `${x}px`;
    cell.style.top = `${y}px`;
  }

  drawBoardArt(placedPoints, width, height, cellSize);
}

function drawBoardArt(points, width, height, cellSize) {
  const svg = els.board.querySelector(".board-art");
  if (!svg) return;

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.replaceChildren();

  const lineGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
  lineGroup.setAttribute("class", "board-lines");

  for (const [fromKey, toKey] of BOARD_LINES) {
    const from = points.get(fromKey);
    const to = points.get(toKey);
    if (!from || !to) continue;

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", from.x);
    line.setAttribute("y1", from.y);
    line.setAttribute("x2", to.x);
    line.setAttribute("y2", to.y);
    lineGroup.appendChild(line);
  }

  svg.appendChild(lineGroup);
}

function getLegalMoves(piece, pieces) {
  const occupied = getOccupiedMap(pieces);
  occupied.delete(coordKey(piece));

  const moves = new Set();

  for (const [dq, dr] of DIRECTIONS) {
    const adjacent = { q: piece.q + dq, r: piece.r + dr };
    const adjacentKey = coordKey(adjacent);
    if (BOARD_KEYS.has(adjacentKey) && !occupied.has(adjacentKey)) {
      moves.add(adjacentKey);
    }
  }

  collectJumpMoves(piece, occupied, moves, new Set([coordKey(piece)]));
  return moves;
}

function collectJumpMoves(from, occupied, moves, visited) {
  for (const [dq, dr] of DIRECTIONS) {
    const middle = { q: from.q + dq, r: from.r + dr };
    const destination = { q: from.q + dq * 2, r: from.r + dr * 2 };
    const middleKey = coordKey(middle);
    const destinationKey = coordKey(destination);

    if (!BOARD_KEYS.has(destinationKey)) continue;
    if (!occupied.has(middleKey)) continue;
    if (occupied.has(destinationKey)) continue;
    if (visited.has(destinationKey)) continue;

    moves.add(destinationKey);
    visited.add(destinationKey);
    collectJumpMoves(destination, occupied, moves, visited);
  }
}

function getWinner(nextState) {
  const pinkDone = Object.values(nextState.pieces)
    .filter((piece) => piece.player === "pink")
    .every((piece) => TOP_CAMP_KEYS.has(coordKey(piece)));
  const blueDone = Object.values(nextState.pieces)
    .filter((piece) => piece.player === "blue")
    .every((piece) => BOTTOM_CAMP_KEYS.has(coordKey(piece)));

  if (pinkDone) return "pink";
  if (blueDone) return "blue";
  return null;
}

function getCampProgress(player) {
  const target = player === "pink" ? TOP_CAMP_KEYS : BOTTOM_CAMP_KEYS;
  const count = Object.values(state.pieces).filter((piece) => piece.player === player && target.has(coordKey(piece))).length;
  return `${count}/10`;
}

function getPieceAt(key) {
  return Object.values(state.pieces).find((piece) => coordKey(piece) === key) || null;
}

function getOccupiedMap(pieces) {
  const occupied = new Map();
  for (const piece of Object.values(pieces)) {
    occupied.set(coordKey(piece), piece.id);
  }
  return occupied;
}

function createInitialState() {
  const pieces = {};
  BOTTOM_CAMP.forEach((coord, index) => {
    pieces[`pink-${index}`] = {
      id: `pink-${index}`,
      player: "pink",
      q: coord.q,
      r: coord.r,
    };
  });
  TOP_CAMP.forEach((coord, index) => {
    pieces[`blue-${index}`] = {
      id: `blue-${index}`,
      player: "blue",
      q: coord.q,
      r: coord.r,
    };
  });

  return {
    version: 2,
    roomId: "",
    players: {
      pink: { name: "你", clientId: "" },
      blue: { name: "筠筠", clientId: "" },
    },
    pieces,
    turn: "pink",
    winner: null,
    moveNumber: 1,
    history: [],
    updatedAt: Date.now(),
  };
}

function buildBoardCoords() {
  const coords = [];

  for (let r = -8; r <= 8; r += 1) {
    const length = getRowLength(r);
    for (let index = 0; index < length; index += 1) {
      const q = index * 2 - (length - 1);
      coords.push({ q, r });
    }
  }

  return coords;
}

function buildBoardLines() {
  const lines = [];
  const forwardDirections = [
    [2, 0],
    [1, 1],
    [-1, 1],
  ];

  for (const coord of BOARD_COORDS) {
    for (const [dq, dr] of forwardDirections) {
      const next = { q: coord.q + dq, r: coord.r + dr };
      const nextKey = coordKey(next);
      if (BOARD_KEYS.has(nextKey)) {
        lines.push([coordKey(coord), nextKey]);
      }
    }
  }

  return lines;
}

function getRowLength(r) {
  if (r <= -5) return r + 9;
  if (r >= 5) return 9 - r;
  return 9 + Math.abs(r);
}

function coordKey(coord) {
  return `${coord.q},${coord.r}`;
}

function parseKey(key) {
  const [q, r] = key.split(",").map(Number);
  return { q, r };
}

function getCellLabel(coord, piece) {
  if (piece) return `${getPlayerDisplayName(piece.player)}棋子，${coord.q},${coord.r}`;
  return `空位，${coord.q},${coord.r}`;
}

function getPlayerName(player) {
  return state.players[player]?.name || PLAYER_NAMES[player];
}

function getPlayerDisplayName(player) {
  if (mode === "online" && (localPlayer === "pink" || localPlayer === "blue")) {
    return player === localPlayer ? "自己" : "对方";
  }

  return getPlayerName(player);
}

function snapshotState(source) {
  return JSON.parse(JSON.stringify({ ...source, history: [] }));
}

function normalizeRemoteState(remoteState) {
  const baseState = createInitialState();
  const nextState = {
    ...createInitialState(),
    ...remoteState,
    players: {
      pink: { name: "你", clientId: "", ...(remoteState.players?.pink || {}) },
      blue: { name: "筠筠", clientId: "", ...(remoteState.players?.blue || {}) },
    },
    history: Array.isArray(remoteState.history) ? remoteState.history : [],
  };

  if (!hasValidPieces(nextState.pieces)) {
    nextState.version = baseState.version;
    nextState.pieces = baseState.pieces;
    nextState.turn = "pink";
    nextState.winner = null;
    nextState.moveNumber = 1;
    nextState.history = [];
  }

  return nextState;
}

function hasValidPieces(pieces) {
  if (!pieces || typeof pieces !== "object") return false;

  return Object.values(pieces).every((piece) => BOARD_KEYS.has(coordKey(piece)));
}

function commitState(options = {}) {
  render();

  if (mode !== "online" || !activeRoomRef || isApplyingRemote) return;

  const serialized = JSON.stringify(state);
  if (serialized === lastSavedState) return;
  lastSavedState = serialized;

  writeRoomState(state).catch((error) => {
    if (!options.quiet) showMessage(error.message);
  });
}

function showMessage(text) {
  els.message.textContent = text;
}

function saveFirebaseConfig() {
  const rawConfig = els.firebaseConfigInput.value.trim();

  try {
    const config = JSON.parse(rawConfig);
    validateFirebaseConfig(config);
    localStorage.setItem(STORAGE_KEYS.firebaseConfig, JSON.stringify(config, null, 2));
    els.firebaseConfigInput.value = JSON.stringify(config, null, 2);
    showMessage("Firebase 配置已保存。");
  } catch (error) {
    showMessage(error.message);
  }
}

async function createRoom() {
  await ensureFirebase();
  const roomCode = createRoomCode();
  const playerName = els.playerName.value.trim() || els.pinkName.value.trim() || "你";
  localStorage.setItem(STORAGE_KEYS.lastName, playerName);

  state = createInitialState();
  state.roomId = roomCode;
  state.players.pink = {
    name: playerName,
    clientId,
  };
  state.players.blue = {
    name: "筠筠",
    clientId: "",
  };
  state.updatedAt = Date.now();
  localPlayer = "pink";
  activeRoomRef = firebaseLib.ref(database, `rooms/${roomCode}`);

  await firebaseLib.set(activeRoomRef, state);
  subscribeToRoom(roomCode);
  els.roomCodeInput.value = roomCode;
  updateUrlRoom(roomCode);
  showMessage(`房间 ${roomCode} 已创建。`);
  render();
}

async function joinRoom() {
  await ensureFirebase();
  const roomCode = normalizeRoomCode(els.roomCodeInput.value);
  if (!roomCode) throw new Error("请输入房间码。");

  const roomRef = firebaseLib.ref(database, `rooms/${roomCode}`);
  const snapshot = await firebaseLib.get(roomRef);
  if (!snapshot.exists()) throw new Error("没有找到这个房间。");

  const remoteState = normalizeRemoteState(snapshot.val());
  const playerName = els.playerName.value.trim() || "筠筠";
  localStorage.setItem(STORAGE_KEYS.lastName, playerName);

  if (remoteState.players.pink.clientId === clientId) {
    localPlayer = "pink";
  } else if (!remoteState.players.blue.clientId || remoteState.players.blue.clientId === clientId) {
    localPlayer = "blue";
    remoteState.players.blue = {
      name: playerName,
      clientId,
    };
    await firebaseLib.update(roomRef, {
      "players/blue": remoteState.players.blue,
      updatedAt: Date.now(),
    });
  } else {
    localPlayer = "spectator";
  }

  activeRoomRef = roomRef;
  subscribeToRoom(roomCode);
  updateUrlRoom(roomCode);
  showMessage(localPlayer === "spectator" ? "已旁观房间。" : `已加入房间 ${roomCode}。`);
}

function subscribeToRoom(roomCode) {
  if (unsubscribeRoom) unsubscribeRoom();
  activeRoomRef = firebaseLib.ref(database, `rooms/${roomCode}`);
  unsubscribeRoom = firebaseLib.onValue(activeRoomRef, (snapshot) => {
    if (!snapshot.exists()) return;
    isApplyingRemote = true;
    state = normalizeRemoteState(snapshot.val());
    lastSavedState = JSON.stringify(state);
    selectedPieceId = null;
    legalDestinations = new Set();
    render();
    isApplyingRemote = false;
  });
}

async function writeRoomState(nextState) {
  if (!activeRoomRef) return;
  await firebaseLib.set(activeRoomRef, nextState);
}

async function ensureFirebase() {
  const rawConfig =
    els.firebaseConfigInput.value.trim() ||
    localStorage.getItem(STORAGE_KEYS.firebaseConfig) ||
    JSON.stringify(DEFAULT_FIREBASE_CONFIG);
  let config;

  try {
    config = JSON.parse(rawConfig);
    validateFirebaseConfig(config);
  } catch (error) {
    throw new Error("请先保存 Firebase 配置。");
  }

  if (!firebaseLib) {
    const [appModule, databaseModule] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-database.js`),
    ]);
    firebaseLib = { ...appModule, ...databaseModule };
  }

  if (!firebaseApp) {
    firebaseApp =
      firebaseLib.getApps().find((app) => app.name === "junyun-jumpchess") ||
      firebaseLib.initializeApp(config, "junyun-jumpchess");
  }

  database = firebaseLib.getDatabase(firebaseApp);
}

function validateFirebaseConfig(config) {
  const requiredKeys = ["apiKey", "authDomain", "databaseURL", "projectId", "appId"];
  const missing = requiredKeys.filter((key) => !config[key]);
  if (missing.length) {
    throw new Error(`Firebase 配置缺少 ${missing.join(", ")}。`);
  }
}

function createRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function normalizeRoomCode(value) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

function updateUrlRoom(roomCode) {
  const url = new URL(window.location.href);
  url.searchParams.set("room", roomCode);
  window.history.replaceState({}, "", url);
}

async function copyInviteLink() {
  if (!state.roomId) {
    showMessage("还没有房间链接。");
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.set("room", state.roomId);

  try {
    await navigator.clipboard.writeText(url.toString());
    showMessage("邀请链接已复制。");
  } catch {
    showMessage(url.toString());
  }
}

function getOrCreateClientId() {
  const saved = localStorage.getItem(STORAGE_KEYS.playerId);
  if (saved) return saved;
  const created = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  localStorage.setItem(STORAGE_KEYS.playerId, created);
  return created;
}
