const STORAGE_KEY = "mahjong-tournament-scoreboard-v1";
const REQUIRED_TOTAL_SCORE = 100000;
const FIXED_SETTINGS = {
  tournamentName: "麻雀大会",
  startScore: 25000,
  returnScore: 30000,
  uma: [50, 10, -10, -30],
};

const defaultState = {
  settings: FIXED_SETTINGS,
  players: [],
  matches: [],
};

let state = loadState();
let activeView = "input";
let editingMatchId = null;

const els = {
  inputTab: document.querySelector("#inputTab"),
  rankingTab: document.querySelector("#rankingTab"),
  inputPage: document.querySelector("#inputPage"),
  rankingPage: document.querySelector("#rankingPage"),
  playerForm: document.querySelector("#playerForm"),
  playerName: document.querySelector("#playerName"),
  playerList: document.querySelector("#playerList"),
  playerCount: document.querySelector("#playerCount"),
  matchForm: document.querySelector("#matchForm"),
  matchMemo: document.querySelector("#matchMemo"),
  matchCount: document.querySelector("#matchCount"),
  seatRows: document.querySelector("#seatRows"),
  scoreTotal: document.querySelector("#scoreTotal"),
  seatTemplate: document.querySelector("#seatTemplate"),
  standingsBody: document.querySelector("#standingsBody"),
  matchHistory: document.querySelector("#matchHistory"),
  saveStatus: document.querySelector("#saveStatus"),
  editNotice: document.querySelector("#editNotice"),
  submitMatchButton: document.querySelector("#submitMatchButton"),
  cancelEditButton: document.querySelector("#cancelEditButton"),
  importInput: document.querySelector("#importInput"),
  sampleButton: document.querySelector("#sampleButton"),
};

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved ? { ...defaultState, ...saved } : structuredClone(defaultState);
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  els.saveStatus.textContent = "保存済み";
}

function playerNameById(id) {
  return state.players.find((player) => player.id === id)?.name || "不明";
}

function formatPoint(value) {
  return `${value.toFixed(1)} pt`;
}

function scoreToPoint(score, rankPoint) {
  const base = (Number(score) - Number(state.settings.returnScore)) / 1000;
  return base + Number(rankPoint || 0);
}

function rankSeats(seats) {
  const sorted = [...seats].sort((a, b) => Number(b.score) - Number(a.score));
  const ranked = [];
  let index = 0;

  while (index < sorted.length) {
    const sameScoreSeats = sorted.filter((seat) => Number(seat.score) === Number(sorted[index].score));
    const rank = index + 1;
    const rankPoints = state.settings.uma.slice(index, index + sameScoreSeats.length);
    const sharedRankPoint = rankPoints.reduce((sum, point) => sum + Number(point), 0) / sameScoreSeats.length;
    sameScoreSeats.forEach((seat) => {
      ranked.push({
        ...seat,
        rank,
        rankEnd: index + sameScoreSeats.length,
        rankLabel: `${rank}位${sameScoreSeats.length > 1 ? "タイ" : ""}`,
        point: scoreToPoint(seat.score, sharedRankPoint),
      });
    });
    index += sameScoreSeats.length;
  }

  return ranked;
}

function aggregateStandings() {
  const rows = state.players.map((player) => ({
    id: player.id,
    name: player.name,
    games: 0,
    total: 0,
    rawScore: 0,
    firsts: 0,
    lasts: 0,
  }));

  const rowById = new Map(rows.map((row) => [row.id, row]));
  state.matches.forEach((match) => {
    rankSeats(match.seats).forEach((seat) => {
      const row = rowById.get(seat.playerId);
      if (!row) return;
      row.games += 1;
      row.total += seat.point;
      row.rawScore += Number(seat.score);
      if (seat.rank === 1) row.firsts += 1;
      if (seat.rankEnd === 4) row.lasts += 1;
    });
  });

  return rows.sort((a, b) => b.total - a.total || b.rawScore - a.rawScore || a.name.localeCompare(b.name, "ja"));
}

function renderSettings() {
  state.settings = structuredClone(FIXED_SETTINGS);
}

function renderPlayers() {
  els.playerCount.textContent = `${state.players.length}人`;
  els.playerList.innerHTML = "";

  if (state.players.length === 0) {
    els.playerList.innerHTML = '<p class="empty-state">選手を追加してください。</p>';
    return;
  }

  state.players.forEach((player) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = player.name;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.ariaLabel = `${player.name}を削除`;
    remove.addEventListener("click", () => removePlayer(player.id));
    chip.append(remove);
    els.playerList.append(chip);
  });
}

function renderSeats() {
  els.seatRows.innerHTML = "";
  for (let index = 0; index < 4; index += 1) {
    const row = els.seatTemplate.content.firstElementChild.cloneNode(true);
    const select = row.querySelector(".seat-player");
    select.innerHTML = '<option value="">選手を選択</option>';
    state.players.forEach((player) => {
      const option = document.createElement("option");
      option.value = player.id;
      option.textContent = player.name;
      select.append(option);
    });
    row.querySelector(".seat-score").addEventListener("input", updateSeatPreview);
    select.addEventListener("change", updateSeatPreview);
    els.seatRows.append(row);
  }
  updateSeatPreview();
}

function setSeatForm(match = null) {
  els.matchMemo.value = match?.memo || "";
  const rows = [...document.querySelectorAll(".seat-row")];
  rows.forEach((row, index) => {
    const seat = match?.seats[index];
    row.querySelector(".seat-player").value = seat?.playerId || "";
    row.querySelector(".seat-score").value = seat?.score ?? "";
  });
  updateSeatPreview();
}

function setEditingMatch(matchId) {
  const match = state.matches.find((entry) => entry.id === matchId);
  if (!match) return;
  editingMatchId = matchId;
  setView("input");
  setSeatForm(match);
  renderEditState();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function clearEditingMatch() {
  editingMatchId = null;
  els.matchForm.reset();
  setSeatForm();
  renderEditState();
}

function renderEditState() {
  const editing = Boolean(editingMatchId);
  els.editNotice.hidden = !editing;
  els.cancelEditButton.hidden = !editing;
  els.submitMatchButton.textContent = editing ? "修正を保存" : "スコアを登録";
}

function renderStandings() {
  const rows = aggregateStandings();
  els.standingsBody.innerHTML = "";

  if (rows.length === 0) {
    els.standingsBody.innerHTML = '<tr><td colspan="8">まだ集計対象がありません。</td></tr>';
    return;
  }

  rows.forEach((row, index) => {
    const tr = document.createElement("tr");
    const average = row.games ? row.total / row.games : 0;
    tr.innerHTML = `
      <td data-label="順位">${index + 1}</td>
      <td data-label="選手">${escapeHtml(row.name)}</td>
      <td data-label="半荘">${row.games}</td>
      <td data-label="合計">${formatPoint(row.total)}</td>
      <td data-label="平均">${formatPoint(average)}</td>
      <td data-label="トップ">${row.firsts}</td>
      <td data-label="ラス">${row.lasts}</td>
      <td data-label="素点合計">${row.rawScore.toLocaleString("ja-JP")}</td>
    `;
    els.standingsBody.append(tr);
  });
}

function renderHistory() {
  els.matchCount.textContent = `${state.matches.length}半荘`;
  els.matchHistory.innerHTML = "";

  if (state.matches.length === 0) {
    els.matchHistory.innerHTML = '<p class="empty-state">半荘結果を入力すると履歴が表示されます。</p>';
    return;
  }

  [...state.matches].reverse().forEach((match) => {
    const ranked = rankSeats(match.seats);
    const item = document.createElement("article");
    item.className = "history-item";
    const title = match.memo || "半荘";
    item.innerHTML = `
      <div>
        <p class="history-title">${escapeHtml(title || "半荘")}</p>
        <div class="history-scores">
          ${ranked
            .map(
              (seat) =>
                `<span class="score-badge">${seat.rankLabel} ${escapeHtml(playerNameById(seat.playerId))} ${Number(
                  seat.score,
                ).toLocaleString("ja-JP")} / ${formatPoint(seat.point)}</span>`,
            )
            .join("")}
        </div>
      </div>
      <div class="history-actions">
        <button class="ghost-button edit-match-button" type="button">修正</button>
        <button class="icon-button delete-match-button" type="button" aria-label="半荘を削除">×</button>
      </div>
    `;
    item.querySelector(".edit-match-button").addEventListener("click", () => setEditingMatch(match.id));
    item.querySelector(".delete-match-button").addEventListener("click", () => removeMatch(match.id));
    els.matchHistory.append(item);
  });
}

function updateSeatPreview() {
  const rows = [...document.querySelectorAll(".seat-row")];
  const seats = rows.map((row) => ({
    row,
    rawScore: row.querySelector(".seat-score").value,
    score: Number(row.querySelector(".seat-score").value || 0),
  }));

  rankSeats(seats).forEach((seat) => {
    seat.row.querySelector(".seat-preview").textContent = seat.rawScore === "" ? "未入力" : formatPoint(seat.point);
  });
  updateScoreTotal(seats);
}

function updateScoreTotal(seats) {
  const enteredSeats = seats.filter((seat) => seat.rawScore !== "");
  const total = enteredSeats.reduce((sum, seat) => sum + Number(seat.score), 0);
  const complete = enteredSeats.length === 4;
  const valid = complete && total === REQUIRED_TOTAL_SCORE;
  els.scoreTotal.classList.toggle("valid", valid);
  els.scoreTotal.classList.toggle("invalid", complete && !valid);
  els.scoreTotal.querySelector("strong").textContent = `${total.toLocaleString("ja-JP")}点`;
  const diff = REQUIRED_TOTAL_SCORE - total;
  const message =
    diff === 0
      ? "合計OK"
      : diff > 0
        ? `あと${diff.toLocaleString("ja-JP")}点`
        : `${Math.abs(diff).toLocaleString("ja-JP")}点超過`;
  els.scoreTotal.querySelector("small").textContent = complete || total > 0 ? message : "100,000点にしてください";
}

function renderAll() {
  renderSettings();
  renderPlayers();
  renderSeats();
  renderStandings();
  renderHistory();
  renderEditState();
  setView(activeView);
}

function removePlayer(playerId) {
  const used = state.matches.some((match) => match.seats.some((seat) => seat.playerId === playerId));
  if (used) {
    alert("半荘履歴に使われている選手は削除できません。先に該当する半荘を削除してください。");
    return;
  }
  state.players = state.players.filter((player) => player.id !== playerId);
  saveState();
  renderAll();
}

function removeMatch(matchId) {
  if (editingMatchId === matchId) {
    clearEditingMatch();
  }
  state.matches = state.matches.filter((match) => match.id !== matchId);
  saveState();
  renderAll();
}

function addPlayer(name) {
  const trimmed = name.trim();
  if (!trimmed) return;
  if (state.players.some((player) => player.name === trimmed)) {
    alert("同じ名前の選手がいます。");
    return;
  }
  state.players.push({ id: crypto.randomUUID(), name: trimmed });
  saveState();
  renderAll();
}

function collectMatchForm() {
  const rows = [...document.querySelectorAll(".seat-row")];
  const seats = rows.map((row) => ({
    playerId: row.querySelector(".seat-player").value,
    score: Number(row.querySelector(".seat-score").value),
  }));
  const ids = seats.map((seat) => seat.playerId);
  if (ids.some((id) => !id) || new Set(ids).size !== 4) {
    throw new Error("4人の選手を重複なしで選択してください。");
  }
  if (seats.some((seat) => !Number.isFinite(seat.score))) {
    throw new Error("素点を入力してください。");
  }
  const total = seats.reduce((sum, seat) => sum + Number(seat.score), 0);
  if (total !== REQUIRED_TOTAL_SCORE) {
    throw new Error(`4人の合計点が100,000点になるように入力してください。現在は${total.toLocaleString("ja-JP")}点です。`);
  }
  return {
    id: crypto.randomUUID(),
    tableName: "",
    memo: els.matchMemo.value.trim(),
    createdAt: new Date().toISOString(),
    seats,
  };
}

function saveMatchFromForm() {
  const match = collectMatchForm();
  if (editingMatchId) {
    state.matches = state.matches.map((entry) =>
      entry.id === editingMatchId ? { ...match, id: editingMatchId, createdAt: entry.createdAt } : entry,
    );
    editingMatchId = null;
  } else {
    state.matches.push(match);
  }
  saveState();
  els.matchForm.reset();
  renderAll();
}

function setView(view) {
  activeView = view;
  const isRanking = view === "ranking";
  els.inputPage.classList.toggle("active", !isRanking);
  els.rankingPage.classList.toggle("active", isRanking);
  els.inputTab.classList.toggle("active", !isRanking);
  els.rankingTab.classList.toggle("active", isRanking);
  els.inputTab.setAttribute("aria-selected", String(!isRanking));
  els.rankingTab.setAttribute("aria-selected", String(isRanking));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return entities[char];
  });
}

function parseCsv(text) {
  const rows = [];
  let cell = "";
  let row = [];
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value !== "")) rows.push(row);
  return rows;
}

function importCsv(text) {
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  const body = rows.slice(1);
  const imported = structuredClone(defaultState);
  const playersByName = new Map();
  let currentMatch = null;

  body.forEach((row) => {
    const [type, tournament, returnScore, uma1, uma2, uma3, uma4, table, memo, player, score] = row;
    if (type === "settings") {
      imported.settings = {
        tournamentName: tournament || "麻雀大会",
        returnScore: Number(returnScore || 30000),
        uma: [Number(uma1 || 50), Number(uma2 || 10), Number(uma3 || -10), Number(uma4 || -30)],
      };
    }
    if (type === "player" && player) {
      const record = { id: crypto.randomUUID(), name: player };
      imported.players.push(record);
      playersByName.set(player, record.id);
    }
    if (type === "match" && player) {
      if (!playersByName.has(player)) {
        const record = { id: crypto.randomUUID(), name: player };
        imported.players.push(record);
        playersByName.set(player, record.id);
      }
      const key = `${table}|${memo}`;
      if (!currentMatch || currentMatch.key !== key || currentMatch.seats.length === 4) {
        currentMatch = {
          key,
          id: crypto.randomUUID(),
          tableName: table,
          memo,
          createdAt: new Date().toISOString(),
          seats: [],
        };
        imported.matches.push(currentMatch);
      }
      currentMatch.seats.push({ playerId: playersByName.get(player), score: Number(score) });
    }
  });

  imported.matches = imported.matches.filter((match) => match.seats.length === 4).map(({ key, ...match }) => match);
  state = imported;
  editingMatchId = null;
  saveState();
  renderAll();
}

function loadSample() {
  editingMatchId = null;
  state = {
    settings: {
      ...FIXED_SETTINGS,
      tournamentName: "週末麻雀リーグ",
    },
    players: ["高橋", "佐藤", "鈴木", "田中", "伊藤", "山本"].map((name) => ({ id: crypto.randomUUID(), name })),
    matches: [],
  };
  const id = (name) => state.players.find((player) => player.name === name).id;
  state.matches = [
    {
      id: crypto.randomUUID(),
      tableName: "",
      memo: "第1回戦",
      createdAt: new Date().toISOString(),
      seats: [
        { playerId: id("高橋"), score: 43200 },
        { playerId: id("佐藤"), score: 27800 },
        { playerId: id("鈴木"), score: 21400 },
        { playerId: id("田中"), score: 7600 },
      ],
    },
    {
      id: crypto.randomUUID(),
      tableName: "",
      memo: "第1回戦",
      createdAt: new Date().toISOString(),
      seats: [
        { playerId: id("伊藤"), score: 38100 },
        { playerId: id("山本"), score: 32200 },
        { playerId: id("高橋"), score: 19100 },
        { playerId: id("佐藤"), score: 10600 },
      ],
    },
  ];
  saveState();
  renderAll();
}

els.playerForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addPlayer(els.playerName.value);
  els.playerName.value = "";
  els.playerName.focus();
});

els.matchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    saveMatchFromForm();
  } catch (error) {
    alert(error.message);
  }
});

els.inputTab.addEventListener("click", () => setView("input"));
els.rankingTab.addEventListener("click", () => setView("ranking"));
els.cancelEditButton.addEventListener("click", clearEditingMatch);

els.importInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  importCsv(await file.text());
  event.target.value = "";
});
els.sampleButton.addEventListener("click", loadSample);

renderAll();
