const SUPABASE_URL = "https://irxsgvqazsqxsmpylhoy.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_nsg85bJVjJjWcZNmgF7y3Q_x7_3YZYU";
const ADMIN_EMAIL = "admin@mahjong.local";
const TABLE_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
let participants = [];
let draftSchedule = [];
let teamSettings = {
  enabled: false,
  teamAName: "チーム1",
  teamBName: "チーム2",
};

const els = {
  loginPanel: document.querySelector("#loginPanel"),
  loginForm: document.querySelector("#loginForm"),
  adminPassword: document.querySelector("#adminPassword"),
  loginStatus: document.querySelector("#loginStatus"),
  adminContent: document.querySelector("#adminContent"),
  logoutButton: document.querySelector("#logoutButton"),
  teamEnabled: document.querySelector("#teamEnabled"),
  teamSettingsFields: document.querySelector("#teamSettingsFields"),
  teamAName: document.querySelector("#teamAName"),
  teamBName: document.querySelector("#teamBName"),
  saveTeamSettingsButton: document.querySelector("#saveTeamSettingsButton"),
  addPlayerForm: document.querySelector("#addPlayerForm"),
  newPlayerName: document.querySelector("#newPlayerName"),
  newPlayerCanScore: document.querySelector("#newPlayerCanScore"),
  newPlayerIsGuest: document.querySelector("#newPlayerIsGuest"),
  adminPlayerCount: document.querySelector("#adminPlayerCount"),
  adminRoster: document.querySelector("#adminRoster"),
  adminPlayerTemplate: document.querySelector("#adminPlayerTemplate"),
  generatorRounds: document.querySelector("#generatorRounds"),
  generatorMinScorers: document.querySelector("#generatorMinScorers"),
  generatorMaxScorers: document.querySelector("#generatorMaxScorers"),
  requireGuestMeeting: document.querySelector("#requireGuestMeeting"),
  loadCurrentScheduleButton: document.querySelector("#loadCurrentScheduleButton"),
  generateScheduleButton: document.querySelector("#generateScheduleButton"),
  publishScheduleButton: document.querySelector("#publishScheduleButton"),
  scheduleStatus: document.querySelector("#scheduleStatus"),
  scheduleValidation: document.querySelector("#scheduleValidation"),
  adminSchedulePreview: document.querySelector("#adminSchedulePreview"),
};

function setLoginStatus(text, isError = false) {
  els.loginStatus.textContent = text;
  els.loginStatus.classList.toggle("error", isError);
}

function setScheduleStatus(text, isError = false) {
  els.scheduleStatus.textContent = text;
  els.scheduleStatus.classList.toggle("error", isError);
}

function tableOptions(selected = "") {
  return ['<option value="">固定なし</option>']
    .concat(
      TABLE_LETTERS.slice(0, Math.max(10, participants.filter((player) => player.active).length / 4)).map(
        (table) => `<option value="${table}"${table === selected ? " selected" : ""}>${table}卓</option>`,
      ),
    )
    .join("");
}

function preferredGuestId(value) {
  if (!value) return "";
  const directGuest = participants.find((player) => player.is_guest && player.id === value);
  if (directGuest) return directGuest.id;
  const legacyTableGuest = participants.find(
    (player) => player.is_guest && player.fixed_table === value,
  );
  return legacyTableGuest?.id || "";
}

function guestOptions(selected = "") {
  const selectedGuestId = preferredGuestId(selected);
  return ['<option value="">指定なし</option>']
    .concat(
      participants
        .filter((player) => player.active && player.is_guest)
        .map(
          (guest) =>
            `<option value="${guest.id}"${guest.id === selectedGuestId ? " selected" : ""}>${escapeHtml(guest.name)}</option>`,
        ),
    )
    .join("");
}

function playerOptions(selected = "", excludedId = "") {
  return ['<option value="">指定なし</option>']
    .concat(
      participants
        .filter((player) => player.active && player.id !== excludedId)
        .map(
          (player) =>
            `<option value="${player.id}"${player.id === selected ? " selected" : ""}>${escapeHtml(player.name)}</option>`,
        ),
    )
    .join("");
}

function teamOptions(selected = "") {
  return `
    <option value="">所属なし</option>
    <option value="A"${selected === "A" ? " selected" : ""}>${escapeHtml(teamSettings.teamAName)}</option>
    <option value="B"${selected === "B" ? " selected" : ""}>${escapeHtml(teamSettings.teamBName)}</option>
  `;
}

function isAvoidedPair(first, second) {
  const firstAvoids = [first?.avoid_player_id, first?.avoid_player_id_2, first?.avoid_player_id_3];
  const secondAvoids = [second?.avoid_player_id, second?.avoid_player_id_2, second?.avoid_player_id_3];
  return firstAvoids.includes(second?.id) || secondAvoids.includes(first?.id);
}

function updateAvoidOptions(selects) {
  const selectedIds = selects.map((select) => select.value).filter(Boolean);
  selects.forEach((select) => {
    [...select.options].forEach((option) => {
      option.disabled = Boolean(option.value) && option.value !== select.value && selectedIds.includes(option.value);
    });
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return entities[char];
  });
}

async function applySession(session) {
  const loggedIn = Boolean(session);
  els.loginPanel.hidden = loggedIn;
  els.adminContent.hidden = !loggedIn;
  if (loggedIn) await loadParticipants();
}

async function loadParticipants() {
  const [playersResult, settingsResult] = await Promise.all([
    db
      .from("participants")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    db.from("tournament_settings").select("*").eq("id", 1).maybeSingle(),
  ]);
  if (playersResult.error) {
    console.error(playersResult.error);
    alert("選手情報を読み込めませんでした。Supabaseの設定SQLが完了しているか確認してください。");
    return;
  }
  participants = playersResult.data || [];
  if (settingsResult.data) {
    teamSettings = {
      enabled: Boolean(settingsResult.data.team_enabled),
      teamAName: settingsResult.data.team_a_name || "チーム1",
      teamBName: settingsResult.data.team_b_name || "チーム2",
    };
  }
  renderTeamSettings();
  renderRoster();
}

function renderTeamSettings() {
  els.teamEnabled.checked = teamSettings.enabled;
  els.teamAName.value = teamSettings.teamAName;
  els.teamBName.value = teamSettings.teamBName;
  els.teamSettingsFields.classList.toggle("disabled", !teamSettings.enabled);
  els.teamAName.disabled = !teamSettings.enabled;
  els.teamBName.disabled = !teamSettings.enabled;
  document.querySelectorAll(".admin-player-team").forEach((select) => {
    select.disabled = !teamSettings.enabled;
  });
}

async function saveTeamSettings() {
  const values = {
    id: 1,
    team_enabled: els.teamEnabled.checked,
    team_a_name: els.teamAName.value.trim() || "チーム1",
    team_b_name: els.teamBName.value.trim() || "チーム2",
  };
  const { error } = await db.from("tournament_settings").upsert(values, { onConflict: "id" });
  if (error) {
    console.error(error);
    alert(`チーム設定を保存できませんでした。\n${error.message}`);
    return;
  }
  teamSettings = {
    enabled: values.team_enabled,
    teamAName: values.team_a_name,
    teamBName: values.team_b_name,
  };
  renderTeamSettings();
  renderRoster();
  alert("チーム設定を保存しました。");
}

function renderRoster() {
  const activeCount = participants.filter((player) => player.active).length;
  els.adminPlayerCount.textContent = `${activeCount}人`;
  els.adminRoster.innerHTML = "";

  participants.forEach((player) => {
    const row = els.adminPlayerTemplate.content.firstElementChild.cloneNode(true);
    const name = row.querySelector(".admin-player-name");
    const scorer = row.querySelector(".admin-player-scorer");
    const guest = row.querySelector(".admin-player-guest");
    const team = row.querySelector(".admin-player-team");
    const fixedTable = row.querySelector(".admin-player-fixed-table");
    const guestPreference = row.querySelector(".admin-player-guest-preference");
    const avoidPlayers = [...row.querySelectorAll(".admin-player-avoid")];
    name.value = player.name;
    scorer.checked = Boolean(player.can_score);
    guest.checked = Boolean(player.is_guest);
    team.innerHTML = teamOptions(player.team_code || "");
    team.disabled = !teamSettings.enabled;
    fixedTable.innerHTML = tableOptions(player.fixed_table || "");
    guestPreference.innerHTML = guestOptions(player.guest_table_preference || "");
    const avoidIds = [player.avoid_player_id, player.avoid_player_id_2, player.avoid_player_id_3];
    avoidPlayers.forEach((select, index) => {
      select.innerHTML = playerOptions(avoidIds[index] || "", player.id);
      select.addEventListener("change", () => updateAvoidOptions(avoidPlayers));
    });
    updateAvoidOptions(avoidPlayers);
    guestPreference.disabled = guest.checked;
    row.classList.toggle("inactive", !player.active);

    guest.addEventListener("change", () => {
      guestPreference.disabled = guest.checked;
      if (guest.checked) guestPreference.value = "";
    });
    row.querySelector(".admin-save-player").addEventListener("click", () => {
      const selectedAvoidIds = avoidPlayers.map((select) => select.value).filter(Boolean);
      if (new Set(selectedAvoidIds).size !== selectedAvoidIds.length) {
        alert("同じNG選手が重複しています。");
        return;
      }
      saveParticipant(player.id, {
        name: name.value.trim(),
        can_score: scorer.checked,
        is_guest: guest.checked,
        team_code: team.value || null,
        fixed_table: fixedTable.value || null,
        guest_table_preference: guest.checked ? null : guestPreference.value || null,
        avoid_player_id: avoidPlayers[0].value || null,
        avoid_player_id_2: avoidPlayers[1].value || null,
        avoid_player_id_3: avoidPlayers[2].value || null,
        active: true,
      });
    });
    row.querySelector(".admin-delete-player").addEventListener("click", () => removeParticipant(player));
    els.adminRoster.append(row);
  });
}

async function saveParticipant(id, values) {
  if (!values.name) {
    alert("選手名を入力してください。");
    return;
  }
  const duplicate = participants.some((player) => player.id !== id && player.name === values.name && player.active);
  if (duplicate) {
    alert("同じ選手名がすでに登録されています。");
    return;
  }
  const { error } = await db.from("participants").update(values).eq("id", id);
  if (error) {
    console.error(error);
    alert(`選手情報を保存できませんでした。\n${error.message}`);
    return;
  }
  await loadParticipants();
}

async function removeParticipant(player) {
  if (!confirm(`${player.name}を参加選手から削除しますか？`)) return;
  const { error } = await db.from("participants").delete().eq("id", player.id);
  if (!error) {
    await loadParticipants();
    return;
  }

  const { error: deactivateError } = await db.from("participants").update({ active: false }).eq("id", player.id);
  if (deactivateError) {
    console.error(error, deactivateError);
    alert("選手を削除できませんでした。");
    return;
  }
  alert("過去の成績があるため、データを残したまま参加選手から外しました。");
  await loadParticipants();
}

function shuffled(values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function pairKey(firstId, secondId) {
  return [firstId, secondId].sort().join(":");
}

function chooseCandidate(pool, table, pairCounts, guestCoverage, guestTable) {
  const eligible = pool.filter((player) => {
    if (table.some((seated) => isAvoidedPair(player, seated))) return false;
    if (!guestTable || !player.guest_table_preference) return true;
    const guestId = preferredGuestId(player.guest_table_preference);
    return guestId
      ? table.some((seated) => seated.is_guest && seated.id === guestId)
      : player.guest_table_preference === guestTable;
  });
  if (!eligible.length) return null;
  const ranked = eligible.map((player) => {
    const repeats = guestTable ? guestCoverage.get(player.id) || 0 : 0;
    const pairPenalty = guestTable || table.length
      ? table.reduce((sum, seated) => sum + (pairCounts.get(pairKey(player.id, seated.id)) || 0) * 18, 0)
      : 0;
    const guestId = preferredGuestId(player.guest_table_preference);
    const matchesPreference = guestId
      ? table.some((seated) => seated.is_guest && seated.id === guestId)
      : player.guest_table_preference === guestTable;
    const preferenceBonus = guestTable && matchesPreference ? -160 : 0;
    const uncoveredBonus = guestTable && repeats === 0 ? -110 : 0;
    return { player, score: pairPenalty + preferenceBonus + uncoveredBonus + Math.random() * 24 };
  });
  ranked.sort((a, b) => a.score - b.score);
  return ranked[0].player;
}

function buildScheduleCandidate(activePlayers, rounds, minScorers, maxScorers) {
  const tableCount = activePlayers.length / 4;
  const tableNames = TABLE_LETTERS.slice(0, tableCount);
  const fixedPlayers = activePlayers.filter((player) => player.fixed_table);
  const pairCounts = new Map();
  const guestCoverage = new Map();
  const schedule = [];

  for (let roundIndex = 0; roundIndex < rounds; roundIndex += 1) {
    const tables = Object.fromEntries(tableNames.map((name) => [name, []]));
    for (const player of fixedPlayers) {
      if (!tables[player.fixed_table] || tables[player.fixed_table].length >= 4) return null;
      if (tables[player.fixed_table].some((seated) => isAvoidedPair(player, seated))) return null;
      tables[player.fixed_table].push(player);
    }

    const remaining = shuffled(
      activePlayers.filter((player) => !fixedPlayers.some((fixed) => fixed.id === player.id)),
    );
    if (teamSettings.enabled) {
      const tablesWithoutTeamPlayer = shuffled(
        tableNames.filter((name) => !tables[name].some((player) => player.team_code)),
      );
      const availableTeamPlayers = remaining.filter((player) => player.team_code).length;
      if (availableTeamPlayers < tablesWithoutTeamPlayer.length) return null;

      for (const tableName of tablesWithoutTeamPlayer) {
        const table = tables[tableName];
        if (table.length >= 4) return null;
        const guestTable = table.some((player) => player.is_guest) ? tableName : "";
        const candidate = chooseCandidate(
          remaining.filter((player) => player.team_code),
          table,
          pairCounts,
          guestCoverage,
          guestTable,
        );
        if (!candidate) return null;
        table.push(candidate);
        remaining.splice(remaining.findIndex((player) => player.id === candidate.id), 1);
      }
    }

    const targetScorers = Object.fromEntries(
      tableNames.map((name) => [name, Math.max(minScorers, tables[name].filter((player) => player.can_score).length)]),
    );
    if (
      tableNames.some((name) => {
        const scorerCount = tables[name].filter((player) => player.can_score).length;
        return scorerCount > maxScorers || tables[name].length + Math.max(0, minScorers - scorerCount) > 4;
      })
    ) return null;
    const placedPlayers = Object.values(tables).flat();
    let scorerSlots = activePlayers.filter((player) => player.can_score).length -
      placedPlayers.filter((player) => player.can_score).length;
    const requiredSlots = tableNames.reduce(
      (sum, name) => sum + Math.max(0, targetScorers[name] - tables[name].filter((player) => player.can_score).length),
      0,
    );
    if (requiredSlots > scorerSlots) return null;
    scorerSlots -= requiredSlots;
    const distributionOrder = shuffled(tableNames);
    while (scorerSlots > 0) {
      const available = distributionOrder.filter(
        (name) => targetScorers[name] < maxScorers && targetScorers[name] < 4,
      );
      if (!available.length) return null;
      const name = available[Math.floor(Math.random() * available.length)];
      targetScorers[name] += 1;
      scorerSlots -= 1;
    }

    const orderedTables = [...tableNames].sort((a, b) => {
      const aGuest = tables[a].some((player) => player.is_guest) ? 0 : 1;
      const bGuest = tables[b].some((player) => player.is_guest) ? 0 : 1;
      return aGuest - bGuest || Math.random() - 0.5;
    });

    for (const tableName of orderedTables) {
      const table = tables[tableName];
      const guestTable = table.some((player) => player.is_guest) ? tableName : "";
      while (table.filter((player) => player.can_score).length < targetScorers[tableName]) {
        const scorerPool = remaining.filter((player) => player.can_score);
        const candidate = chooseCandidate(scorerPool, table, pairCounts, guestCoverage, guestTable);
        if (!candidate) return null;
        table.push(candidate);
        remaining.splice(remaining.findIndex((player) => player.id === candidate.id), 1);
      }
      while (table.length < 4) {
        const nonScorerPool = remaining.filter((player) => !player.can_score);
        const candidate = chooseCandidate(nonScorerPool, table, pairCounts, guestCoverage, guestTable);
        if (!candidate) return null;
        table.push(candidate);
        remaining.splice(remaining.findIndex((player) => player.id === candidate.id), 1);
      }
    }
    if (remaining.length) return null;

    Object.values(tables).forEach((table) => {
      for (let first = 0; first < table.length; first += 1) {
        for (let second = first + 1; second < table.length; second += 1) {
          const key = pairKey(table[first].id, table[second].id);
          pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
        }
      }
      if (table.some((player) => player.is_guest)) {
        table.filter((player) => !player.is_guest).forEach((player) => {
          guestCoverage.set(player.id, (guestCoverage.get(player.id) || 0) + 1);
        });
      }
    });
    schedule.push(tables);
  }

  const repeatedPairs = [...pairCounts.values()].reduce((sum, count) => sum + Math.max(0, count - 1) ** 2, 0);
  const uncovered = activePlayers.filter((player) => !player.is_guest && !guestCoverage.get(player.id)).length;
  const maxPairCount = Math.max(0, ...pairCounts.values());
  return { schedule, score: repeatedPairs * 20 + uncovered * 10000 + maxPairCount * 200, uncovered, maxPairCount };
}

function generateSchedule() {
  const activePlayers = participants.filter((player) => player.active);
  const rounds = Number(els.generatorRounds.value);
  const minScorers = Number(els.generatorMinScorers.value);
  const maxScorers = Number(els.generatorMaxScorers.value);
  if (!activePlayers.length || activePlayers.length % 4 !== 0) {
    alert("参加選手数を4の倍数にしてください。");
    return;
  }
  if (minScorers > maxScorers) {
    alert("点数計算できる人の最少人数は上限以下にしてください。");
    return;
  }
  const tableCount = activePlayers.length / 4;
  if (teamSettings.enabled && activePlayers.filter((player) => player.team_code).length < tableCount) {
    alert(`チーム所属選手を${tableCount}人以上設定してください。各卓に1人必要です。`);
    return;
  }
  const scorerCount = activePlayers.filter((player) => player.can_score).length;
  if (scorerCount < tableCount * minScorers || scorerCount > tableCount * maxScorers) {
    alert(`点数計算できる人が${scorerCount}人です。各卓${minScorers}〜${maxScorers}人にするには人数が足りないか多すぎます。`);
    return;
  }
  const invalidFixed = activePlayers.find(
    (player) => player.fixed_table && !TABLE_LETTERS.slice(0, tableCount).includes(player.fixed_table),
  );
  if (invalidFixed) {
    alert(`${invalidFixed.name}の固定卓が、現在の卓数の範囲外です。`);
    return;
  }

  setScheduleStatus("作成中");
  let best = null;
  for (let attempt = 0; attempt < 350; attempt += 1) {
    const candidate = buildScheduleCandidate(activePlayers, rounds, minScorers, maxScorers);
    if (candidate && (!best || candidate.score < best.score)) best = candidate;
    if (best && best.uncovered === 0 && best.maxPairCount <= 2) break;
  }
  if (!best) {
    setScheduleStatus("作成失敗", true);
    alert("条件を満たす卓組を作れませんでした。固定卓や点数計算人数を見直してください。");
    return;
  }
  if (els.requireGuestMeeting.checked && best.uncovered > 0) {
    setScheduleStatus("条件未達", true);
    alert(`ゲストと同卓できていない選手が${best.uncovered}人います。再度作成するか条件を調整してください。`);
  } else {
    setScheduleStatus("未保存");
  }
  draftSchedule = best.schedule;
  renderSchedulePreview();
}

function namesToDraftSchedule(rounds) {
  const activeByName = new Map(participants.filter((player) => player.active).map((player) => [player.name, player]));
  return (rounds || []).map((round) =>
    Object.fromEntries(
      Object.entries(round).map(([table, names]) => [table, names.map((name) => activeByName.get(name)).filter(Boolean)]),
    ),
  );
}

async function loadCurrentSchedule() {
  setScheduleStatus("読込中");
  const { data, error } = await db
    .from("schedule_assignments")
    .select("round_number,table_name,seat_number,participant_id")
    .order("round_number")
    .order("table_name")
    .order("seat_number");
  if (error) {
    console.error(error);
    setScheduleStatus("読込エラー", true);
    return;
  }
  const byId = new Map(participants.map((player) => [player.id, player]));
  if (!data?.length) {
    draftSchedule = namesToDraftSchedule(window.EVENT_SCHEDULE?.rounds || []);
  } else {
    draftSchedule = [];
    data.forEach((assignment) => {
      const roundIndex = Number(assignment.round_number) - 1;
      if (!draftSchedule[roundIndex]) draftSchedule[roundIndex] = {};
      if (!draftSchedule[roundIndex][assignment.table_name]) draftSchedule[roundIndex][assignment.table_name] = [];
      draftSchedule[roundIndex][assignment.table_name][Number(assignment.seat_number) - 1] = byId.get(
        assignment.participant_id,
      );
    });
  }
  els.generatorRounds.value = String(draftSchedule.length || 8);
  setScheduleStatus(data?.length ? "公開中の卓組" : "現在の固定卓組");
  renderSchedulePreview();
}

function swapPlayerInRound(roundIndex, tableName, seatIndex, newPlayerId) {
  const round = draftSchedule[roundIndex];
  const currentPlayer = round[tableName][seatIndex];
  let otherLocation = null;
  Object.entries(round).some(([otherTable, players]) => {
    const otherSeat = players.findIndex((player) => player?.id === newPlayerId);
    if (otherSeat === -1) return false;
    otherLocation = { table: otherTable, seat: otherSeat };
    return true;
  });
  const newPlayer = participants.find((player) => player.id === newPlayerId);
  if (!newPlayer) return;
  round[tableName][seatIndex] = newPlayer;
  if (otherLocation) round[otherLocation.table][otherLocation.seat] = currentPlayer;
  renderSchedulePreview();
  setScheduleStatus("未保存");
}

function validateDraftSchedule() {
  const minScorers = Number(els.generatorMinScorers.value);
  const maxScorers = Number(els.generatorMaxScorers.value);
  const activePlayers = participants.filter((player) => player.active);
  const issues = [];
  const guestCoverage = new Set();
  draftSchedule.forEach((round, roundIndex) => {
    const ids = Object.values(round).flat().map((player) => player?.id).filter(Boolean);
    if (ids.length !== activePlayers.length || new Set(ids).size !== activePlayers.length) {
      issues.push(`${roundIndex + 1}回戦の選手に重複または不足があります。`);
    }
    Object.entries(round).forEach(([tableName, players]) => {
      if (players.length !== 4 || players.some((player) => !player)) {
        issues.push(`${roundIndex + 1}回戦${tableName}卓が4人ではありません。`);
        return;
      }
      const scorerCount = players.filter((player) => player.can_score).length;
      if (scorerCount < minScorers || scorerCount > maxScorers) {
        issues.push(`${roundIndex + 1}回戦${tableName}卓の点数計算できる人は${scorerCount}人です。`);
      }
      if (teamSettings.enabled && !players.some((player) => player.team_code)) {
        issues.push(`${roundIndex + 1}回戦${tableName}卓にチーム所属選手がいません。`);
      }
      players.filter((player) => player.fixed_table && player.fixed_table !== tableName).forEach((player) => {
        issues.push(`${player.name}の固定卓が守られていません。`);
      });
      if (players.some((player) => player.is_guest)) {
        players.filter((player) => !player.is_guest).forEach((player) => guestCoverage.add(player.id));
      }
      players.filter((player) => player.guest_table_preference).forEach((player) => {
        const guestId = preferredGuestId(player.guest_table_preference);
        const matchesPreference = guestId
          ? players.some((entry) => entry.is_guest && entry.id === guestId)
          : player.guest_table_preference === tableName;
        if (players.some((entry) => entry.is_guest) && !matchesPreference) {
          const guestName = participants.find((entry) => entry.id === guestId)?.name || "指定ゲスト";
          issues.push(`${player.name}が${guestName}以外のゲストと同卓しています。`);
        }
      });
      for (let first = 0; first < players.length; first += 1) {
        for (let second = first + 1; second < players.length; second += 1) {
          if (isAvoidedPair(players[first], players[second])) {
            issues.push(`${players[first].name}と${players[second].name}はNG選手同士です。`);
          }
        }
      }
    });
  });
  if (els.requireGuestMeeting.checked) {
    const uncovered = activePlayers.filter((player) => !player.is_guest && !guestCoverage.has(player.id));
    if (uncovered.length) issues.push(`ゲストと同卓していない選手: ${uncovered.map((player) => player.name).join("、")}`);
  }
  return [...new Set(issues)];
}

function renderSchedulePreview() {
  els.adminSchedulePreview.innerHTML = "";
  if (!draftSchedule.length) {
    els.adminSchedulePreview.innerHTML = '<p class="empty-state">卓組を読み込むか、自動作成してください。</p>';
    els.scheduleValidation.textContent = "";
    return;
  }
  const activePlayers = participants.filter((player) => player.active);
  draftSchedule.forEach((round, roundIndex) => {
    const section = document.createElement("section");
    section.className = "admin-round";
    const heading = document.createElement("h3");
    heading.textContent = `${roundIndex + 1}回戦`;
    section.append(heading);
    Object.entries(round).forEach(([tableName, players]) => {
      const row = document.createElement("div");
      row.className = "admin-schedule-row";
      const label = document.createElement("strong");
      label.textContent = `${tableName}卓`;
      row.append(label);
      players.forEach((player, seatIndex) => {
        const select = document.createElement("select");
        select.setAttribute("aria-label", `${roundIndex + 1}回戦${tableName}卓 ${seatIndex + 1}人目`);
        activePlayers.forEach((candidate) => {
          const option = document.createElement("option");
          option.value = candidate.id;
          option.textContent = candidate.name;
          option.selected = candidate.id === player?.id;
          select.append(option);
        });
        select.addEventListener("change", () => swapPlayerInRound(roundIndex, tableName, seatIndex, select.value));
        row.append(select);
      });
      section.append(row);
    });
    els.adminSchedulePreview.append(section);
  });
  const issues = validateDraftSchedule();
  els.scheduleValidation.classList.toggle("error", issues.length > 0);
  els.scheduleValidation.textContent = issues.length ? issues.join(" ") : "条件チェックOK";
}

async function publishSchedule() {
  if (!draftSchedule.length) {
    alert("公開する卓組がありません。");
    return;
  }
  const issues = validateDraftSchedule();
  if (issues.length) {
    alert("条件を満たしていないため保存できません。画面の条件チェックを確認してください。");
    return;
  }
  const rows = [];
  draftSchedule.forEach((round, roundIndex) => {
    Object.entries(round).forEach(([tableName, players]) => {
      players.forEach((player, seatIndex) => {
        rows.push({
          round_number: roundIndex + 1,
          table_name: tableName,
          seat_number: seatIndex + 1,
          participant_id: player.id,
        });
      });
    });
  });
  setScheduleStatus("保存中");
  const { error } = await db.rpc("replace_tournament_schedule", { assignments: rows });
  if (error) {
    console.error(error);
    setScheduleStatus("保存エラー", true);
    alert("卓組を保存できませんでした。Supabaseの設定SQLが最新か確認してください。");
    return;
  }
  setScheduleStatus("公開済み");
  alert("卓組を公開しました。集計画面にも反映されます。");
}

els.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setLoginStatus("確認中");
  const { data, error } = await db.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password: els.adminPassword.value,
  });
  if (error) {
    console.error(error);
    setLoginStatus("パスワードが違います", true);
    return;
  }
  els.adminPassword.value = "";
  setLoginStatus("");
  await applySession(data.session);
});

els.logoutButton.addEventListener("click", async () => {
  await db.auth.signOut();
  await applySession(null);
});

els.teamEnabled.addEventListener("change", () => {
  teamSettings.enabled = els.teamEnabled.checked;
  renderTeamSettings();
  renderRoster();
});
els.saveTeamSettingsButton.addEventListener("click", saveTeamSettings);

els.addPlayerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = els.newPlayerName.value.trim();
  if (participants.some((player) => player.name === name && player.active)) {
    alert("同じ選手名がすでに登録されています。");
    return;
  }
  const sortOrder = Math.max(-1, ...participants.map((player) => Number(player.sort_order) || 0)) + 1;
  const { error } = await db.from("participants").insert({
    name,
    can_score: els.newPlayerCanScore.checked,
    is_guest: els.newPlayerIsGuest.checked,
    team_code: null,
    active: true,
    sort_order: sortOrder,
    avoid_player_id: null,
    avoid_player_id_2: null,
    avoid_player_id_3: null,
  });
  if (error) {
    console.error(error);
    alert("選手を追加できませんでした。");
    return;
  }
  els.addPlayerForm.reset();
  await loadParticipants();
});

els.loadCurrentScheduleButton.addEventListener("click", loadCurrentSchedule);
els.generateScheduleButton.addEventListener("click", generateSchedule);
els.publishScheduleButton.addEventListener("click", publishSchedule);

db.auth.getSession().then(({ data }) => applySession(data.session));
