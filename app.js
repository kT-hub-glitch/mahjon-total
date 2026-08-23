const SUPABASE_URL = "https://irxsgvqazsqxsmpylhoy.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_nsg85bJVjJjWcZNmgF7y3Q_x7_3YZYU";
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

let state = structuredClone(defaultState);
let activeView = "input";
let editingMatchId = null;
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const els = {
  inputTab: document.querySelector("#inputTab"),
  rankingTab: document.querySelector("#rankingTab"),
  inputPage: document.querySelector("#inputPage"),
  rankingPage: document.querySelector("#rankingPage"),
  scoreEntryPanel: document.querySelector("#scoreEntryPanel"),
  playerForm: document.querySelector("#playerForm"),
  playerName: document.querySelector("#playerName"),
  playerList: document.querySelector("#playerList"),
  playerCount: document.querySelector("#playerCount"),
  matchForm: document.querySelector("#matchForm"),
  matchCount: document.querySelector("#matchCount"),
  seatRows: document.querySelector("#seatRows"),
  scoreTotal: document.querySelector("#scoreTotal"),
  seatTemplate: document.querySelector("#seatTemplate"),
  standingsBody: document.querySelector("#standingsBody"),
  playerDetailDialog: document.querySelector("#playerDetailDialog"),
  detailPlayerName: document.querySelector("#detailPlayerName"),
  detailStats: document.querySelector("#detailStats"),
  closeDetailButton: document.querySelector("#closeDetailButton"),
  matchHistory: document.querySelector("#matchHistory"),
  saveStatus: document.querySelector("#saveStatus"),
  editNotice: document.querySelector("#editNotice"),
  submitMatchButton: document.querySelector("#submitMatchButton"),
  cancelEditButton: document.querySelector("#cancelEditButton"),
};

function setStatus(text, isError = false) {
  els.saveStatus.textContent = text;
  els.saveStatus.classList.toggle("error", isError);
}

async function loadRemoteState({ keepForm = false } = {}) {
  setStatus("同期中");
  const [{ data: participants, error: playersError }, { data: matches, error: matchesError }] = await Promise.all([
    db.from("participants").select("id,name,created_at").order("created_at", { ascending: true }),
    db.from("matches").select("id,created_at,scores(participant_id,score)").order("created_at", { ascending: true }),
  ]);

  if (playersError || matchesError) {
    console.error(playersError || matchesError);
    setStatus("接続エラー", true);
    return;
  }

  state = {
    settings: structuredClone(FIXED_SETTINGS),
    players: (participants || []).map((player) => ({
      id: player.id,
      name: player.name,
    })),
    matches: (matches || []).map((match) => ({
      id: match.id,
      tableName: "",
      memo: "",
      createdAt: match.created_at,
      seats: (match.scores || []).map((score) => ({
        playerId: score.participant_id,
        score: Number(score.score),
      })),
    })),
  };

  renderAll({ keepForm });
  setStatus("");
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
    rankTotal: 0,
    rankCounts: [0, 0, 0, 0],
  }));

  const rowById = new Map(rows.map((row) => [row.id, row]));
  state.matches.forEach((match) => {
    rankSeats(match.seats).forEach((seat) => {
      const row = rowById.get(seat.playerId);
      if (!row) return;
      row.games += 1;
      row.total += seat.point;
      row.rawScore += Number(seat.score);
      row.rankTotal += seat.rank;
      row.rankCounts[Math.min(seat.rank, 4) - 1] += 1;
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
  els.scoreEntryPanel.scrollIntoView({ behavior: "smooth", block: "start" });
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
    els.standingsBody.innerHTML = '<tr><td colspan="11">まだ集計対象がありません。</td></tr>';
    return;
  }

  rows.forEach((row, index) => {
    const tr = document.createElement("tr");
    const average = row.games ? row.total / row.games : 0;
    const averageRank = row.games ? row.rankTotal / row.games : 0;
    const rawAverage = row.games ? row.rawScore / row.games : 0;
    tr.className = "standing-row";
    tr.tabIndex = 0;
    tr.setAttribute("role", "button");
    tr.setAttribute("aria-label", `${row.name}の個人成績を表示`);
    tr.innerHTML = `
      <td data-label="順位">${index + 1}</td>
      <td data-label="選手">${escapeHtml(row.name)}</td>
      <td data-label="対局数">${row.games}</td>
      <td data-label="合計">${formatPoint(row.total)}</td>
      <td data-label="平均">${formatPoint(average)}</td>
      <td data-label="平均順位">${averageRank ? averageRank.toFixed(2) : "-"}</td>
      <td data-label="1着">${row.rankCounts[0]}</td>
      <td data-label="2着">${row.rankCounts[1]}</td>
      <td data-label="3着">${row.rankCounts[2]}</td>
      <td data-label="4着">${row.rankCounts[3]}</td>
      <td data-label="素点平均">${rawAverage ? Math.round(rawAverage).toLocaleString("ja-JP") : "-"}</td>
    `;
    tr.addEventListener("click", () => openPlayerDetail(row, index + 1, average, averageRank, rawAverage));
    tr.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openPlayerDetail(row, index + 1, average, averageRank, rawAverage);
      }
    });
    els.standingsBody.append(tr);
  });
}

function openPlayerDetail(row, standingRank, average, averageRank, rawAverage) {
  els.detailPlayerName.textContent = `${standingRank}位 ${row.name}`;
  els.detailStats.innerHTML = `
    <div><span>合計</span><strong>${formatPoint(row.total)}</strong></div>
    <div><span>対局数</span><strong>${row.games}</strong></div>
    <div><span>平均</span><strong>${formatPoint(average)}</strong></div>
    <div><span>平均順位</span><strong>${averageRank ? averageRank.toFixed(2) : "-"}</strong></div>
    <div><span>1着</span><strong>${row.rankCounts[0]}</strong></div>
    <div><span>2着</span><strong>${row.rankCounts[1]}</strong></div>
    <div><span>3着</span><strong>${row.rankCounts[2]}</strong></div>
    <div><span>4着</span><strong>${row.rankCounts[3]}</strong></div>
    <div><span>素点平均</span><strong>${rawAverage ? Math.round(rawAverage).toLocaleString("ja-JP") : "-"}</strong></div>
  `;
  els.playerDetailDialog.showModal();
}

function renderHistory() {
  els.matchCount.textContent = `${state.matches.length}対局`;
  els.matchHistory.innerHTML = "";

  if (state.matches.length === 0) {
    els.matchHistory.innerHTML = '<p class="empty-state">対局結果を入力すると履歴が表示されます。</p>';
    return;
  }

  [...state.matches].reverse().forEach((match) => {
    const ranked = rankSeats(match.seats);
    const item = document.createElement("article");
    item.className = "history-item";
    const matchNumber = state.matches.findIndex((entry) => entry.id === match.id) + 1;
    const title = `第${matchNumber}対局`;
    item.innerHTML = `
      <div>
        <p class="history-title">${escapeHtml(title || "対局")}</p>
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
        <button class="icon-button delete-match-button" type="button" aria-label="対局を削除">×</button>
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

function renderAll({ keepForm = false } = {}) {
  renderSettings();
  renderPlayers();
  if (!keepForm) {
    renderSeats();
  }
  renderStandings();
  renderHistory();
  renderEditState();
  setView(activeView);
}

async function removePlayer(playerId) {
  const used = state.matches.some((match) => match.seats.some((seat) => seat.playerId === playerId));
  if (used) {
    alert("対局履歴に使われている選手は削除できません。先に該当する対局を削除してください。");
    return;
  }
  setStatus("削除中");
  const { error } = await db.from("participants").delete().eq("id", playerId);
  if (error) {
    console.error(error);
    alert("選手を削除できませんでした。");
    setStatus("保存エラー", true);
    return;
  }
  await loadRemoteState();
}

async function removeMatch(matchId) {
  if (editingMatchId === matchId) {
    clearEditingMatch();
  }
  setStatus("削除中");
  const { error } = await db.from("matches").delete().eq("id", matchId);
  if (error) {
    console.error(error);
    alert("対局を削除できませんでした。");
    setStatus("保存エラー", true);
    return;
  }
  await loadRemoteState();
}

async function addPlayer(name) {
  const trimmed = name.trim();
  if (!trimmed) return;
  if (state.players.some((player) => player.name === trimmed)) {
    alert("同じ名前の選手がいます。");
    return;
  }
  setStatus("保存中");
  const { error } = await db.from("participants").insert({ name: trimmed });
  if (error) {
    console.error(error);
    alert("選手を追加できませんでした。");
    setStatus("保存エラー", true);
    return;
  }
  await loadRemoteState();
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
    memo: "",
    createdAt: new Date().toISOString(),
    seats,
  };
}

async function saveMatchFromForm() {
  const match = collectMatchForm();
  if (editingMatchId) {
    setStatus("修正中");
    const { error: deleteError } = await db.from("scores").delete().eq("match_id", editingMatchId);
    if (deleteError) {
      console.error(deleteError);
      alert("修正前のスコアを更新できませんでした。");
      setStatus("保存エラー", true);
      return;
    }
    const { error: insertError } = await db.from("scores").insert(
      match.seats.map((seat) => ({
        match_id: editingMatchId,
        participant_id: seat.playerId,
        score: seat.score,
      })),
    );
    if (insertError) {
      console.error(insertError);
      alert("修正したスコアを保存できませんでした。");
      setStatus("保存エラー", true);
      return;
    }
    editingMatchId = null;
  } else {
    setStatus("保存中");
    const { data: createdMatch, error: matchError } = await db.from("matches").insert({}).select("id").single();
    if (matchError) {
      console.error(matchError);
      alert("対局を作成できませんでした。");
      setStatus("保存エラー", true);
      return;
    }
    const { error: scoresError } = await db.from("scores").insert(
      match.seats.map((seat) => ({
        match_id: createdMatch.id,
        participant_id: seat.playerId,
        score: seat.score,
      })),
    );
    if (scoresError) {
      console.error(scoresError);
      await db.from("matches").delete().eq("id", createdMatch.id);
      alert("スコアを保存できませんでした。");
      setStatus("保存エラー", true);
      return;
    }
  }
  els.matchForm.reset();
  await loadRemoteState();
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

els.playerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await addPlayer(els.playerName.value);
  els.playerName.value = "";
  els.playerName.focus();
});

els.matchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await saveMatchFromForm();
  } catch (error) {
    alert(error.message);
  }
});

els.inputTab.addEventListener("click", () => setView("input"));
els.rankingTab.addEventListener("click", () => setView("ranking"));
els.cancelEditButton.addEventListener("click", clearEditingMatch);
els.closeDetailButton.addEventListener("click", () => els.playerDetailDialog.close());

renderAll();
loadRemoteState();
setInterval(() => {
  if (document.visibilityState === "visible" && !editingMatchId) {
    loadRemoteState({ keepForm: true });
  }
}, 5000);
