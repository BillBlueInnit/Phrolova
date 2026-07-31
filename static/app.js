// ============================================================
// 角色猜谜游戏 - 前端逻辑
// 包含：主菜单 / 单人模式 / 多人模式 / 排行榜 / 玩家ID
// ============================================================

// ---------------- 全局配置 ----------------
const MAX_ATTEMPTS = 4;                 // 单人 & 多人每局 4 次机会

// 玩家ID（每设备唯一，存于 localStorage）
const ID_KEY = 'phrolova_player_id';
let myPlayerId = localStorage.getItem(ID_KEY) || '';
let myScore = 0;
let myIdTouched = false;   // 是否已初始化

// 单人游戏状态
let currentTarget = null;
let guessHistory = [];
let gameOver = false;

// 多人游戏状态
let multiRoomCode = '';
let multiPollTimer = null;
let multiGuessInputHandler = null;
let multiTarget = null;
let multiGameRef = null;   // 最近一次 room_state
let myCurrentRoom = null;  // { room_code, room_status } —— 左下角返回按钮用
let roomNavCheckTimer = null;

// 自动补全数据
let allNames = [];
let singleSuggestions = [];
let singleActive = -1;
let multiSuggestions = [];
let multiActive = -1;

// ==================== 工具函数 ====================
function starStr(num) { return '★'.repeat(num); }
function formatVersion(v) { return parseFloat(v).toFixed(1); }
function statusClass(status) {
    if (status === 'match') return 'match-green';
    if (status === 'near') return 'match-orange';
    return 'match-gray';
}

function $(id) { return document.getElementById(id); }

function showView(id) {
    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
    $(id).style.display = 'block';
    window.scrollTo(0, 0);
}

function showModal(id) { $(id).classList.add('active'); }
function hideModal(id) { $(id).classList.remove('active'); }

function genDeviceId() {
    // 生成设备唯一 ID
    const cryptoObj = window.crypto || window.msCrypto;
    if (cryptoObj && cryptoObj.randomUUID) return 'P-' + cryptoObj.randomUUID().slice(0, 13);
    return 'P-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8).toUpperCase();
}

// ==================== 玩家 ID 管理 ====================
async function initPlayer() {
    if (!myPlayerId) {
        myPlayerId = genDeviceId();
        localStorage.setItem(ID_KEY, myPlayerId);
        myIdTouched = true;
    }
    try {
        const res = await fetch('/api/player/init', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ player_id: myPlayerId })
        });
        const data = await res.json();
        if (data.status === 'success') {
            myScore = data.player.score;
            localStorage.setItem(ID_KEY, data.player.player_id);
            myPlayerId = data.player.player_id;
        }
    } catch (e) { /* 忽略 */ }
    refreshPlayerDisplay();
}

function refreshPlayerDisplay() {
    $('mainPlayerId').textContent = myPlayerId;
    $('mainPlayerScore').textContent = `(${myScore} 分)`;
}

function openIdEditor() {
    $('idInput').value = myPlayerId;
    $('idError').textContent = '';
    showModal('idEditor');
    setTimeout(() => $('idInput').focus(), 50);
}
function closeIdEditor() { hideModal('idEditor'); }

async function saveId() {
    const newId = $('idInput').value.trim();
    if (!newId) { $('idError').textContent = 'ID 不能为空'; return; }
    try {
        const res = await fetch('/api/player/update_id', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ old_id: myPlayerId, new_id: newId })
        });
        const data = await res.json();
        if (data.status === 'success') {
            myPlayerId = data.player.player_id;
            myScore = data.player.score;
            localStorage.setItem(ID_KEY, myPlayerId);
            refreshPlayerDisplay();
            closeIdEditor();
            alert('修改成功！');
        } else {
            $('idError').textContent = data.message || '修改失败';
        }
    } catch (e) {
        $('idError').textContent = '无法连接服务器';
    }
}

// ==================== 视图导航 ====================
function goBackToMenu() { showView('view-mainmenu'); }
function enterSingle() {
    refreshPlayerDisplay();
    showView('view-single');
    startGame();
}
function enterMultiMenu() {
    showView('view-multimenu');
}
async function enterLeaderboard() {
    showView('view-leaderboard');
    await loadLeaderboard();
}
function enterRules() {
    showView('view-rules');
}

// ==================== 排行榜 ====================
async function loadLeaderboard() {
    const tbody = $('leaderboardTbody');
    const empty = $('lbEmptyState');
    tbody.innerHTML = '';
    try {
        const res = await fetch('/api/leaderboard');
        const data = await res.json();
        if (data.status === 'success' && data.leaderboard.length) {
            empty.style.display = 'none';
            data.leaderboard.forEach((row, i) => {
                const tr = document.createElement('tr');
                tr.appendChild(makeCell(String(i + 1), 'rownum'));
                const nameTd = document.createElement('td');
                nameTd.textContent = row.player_id;
                if (row.player_id === myPlayerId) nameTd.style.color = '#ffd700';
                nameTd.style.fontWeight = 'bold';
                tr.appendChild(nameTd);
                tr.appendChild(makeCell(String(row.score)));
                tbody.appendChild(tr);
            });
        } else {
            empty.style.display = 'block';
        }
    } catch (e) {
        empty.style.display = 'block';
        empty.textContent = '无法加载排行榜';
    }
}

// ==================== 单人模式 ====================
function renderAttemptBadge() {
    const used = guessHistory.length;
    $('attemptBadge').textContent = used >= MAX_ATTEMPTS ? '游戏结束' : `第 ${used + 1} / ${MAX_ATTEMPTS} 次猜测`;
}

function renderSingleTable() {
    const tbody = $('singleTbody');
    const empty = $('singleEmptyState');
    tbody.innerHTML = '';
    if (guessHistory.length === 0) { empty.style.display = 'block'; return; }
    empty.style.display = 'none';
    guessHistory.forEach((rec, idx) => {
        const g = rec.guess, c = rec.compare;
        const tr = document.createElement('tr');
        tr.appendChild(makeCell(String(idx + 1), 'rownum'));
        tr.appendChild(makeCell(g.name));
        tr.appendChild(makeCell(g.attribute, null, null, c.attribute));
        tr.appendChild(makeCell(starStr(g.star_rating), null, null, c.star_rating));
        tr.appendChild(makeCell(g.weapon, null, null, c.weapon));
        tr.appendChild(makeCell(g.birthplace, null, null, c.birthplace));
        const gv = parseFloat(g.version);
        const tv = currentTarget ? parseFloat(currentTarget.version) : null;
        let verText = formatVersion(g.version);
        if (tv != null && gv < tv) verText += ' ↑';
        else if (tv != null && gv > tv) verText += ' ↓';
        tr.appendChild(makeCell(verText, null, null, c.version));
        tbody.appendChild(tr);
    });
}

function makeCell(text, extraClass = '', cellClass = '', status = null) {
    const td = document.createElement('td');
    td.textContent = text;
    if (extraClass) td.classList.add(extraClass);
    if (cellClass) td.classList.add(cellClass);
    if (status) td.classList.add(statusClass(status));
    return td;
}

async function startGame() {
    try {
        const res = await fetch('/api/draw');
        const data = await res.json();
        if (data.status === 'success') {
            currentTarget = data.character;
            guessHistory = [];
            gameOver = false;
            $('guessInput').value = '';
            $('guessInput').disabled = false;
            $('btnGuess').disabled = false;
            $('btnViewAnswer').disabled = false;
            $('singleEmptyState').textContent = '请输入角色名开始猜测 👆';
            hideSingleSuggestions();
            renderAttemptBadge();
            renderSingleTable();
            $('guessInput').focus();
        } else {
            alert(data.message || '抽取角色失败');
        }
    } catch (e) {
        alert('无法连接服务器，请确认后端已启动');
    }
}

async function guessCharacter() {
    if (!currentTarget || gameOver) return;
    const name = $('guessInput').value.trim();
    if (!name) { alert('请输入角色名！'); return; }

    try {
        const res = await fetch('/api/guess', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target: currentTarget, guess: name })
        });
        const data = await res.json();
        if (data.status === 'error') { alert(data.message); return; }

        guessHistory.push({ guess: data.guess, compare: data.compare });
        $('guessInput').value = '';
        hideSingleSuggestions();
        renderAttemptBadge();
        renderSingleTable();

        const allMatch = Object.values(data.compare).every(v => v === 'match');
        if (allMatch || guessHistory.length >= MAX_ATTEMPTS) {
            endGame(allMatch, data.target);
        }
    } catch (e) {
        alert('无法连接服务器');
    }
}

function endGame(isWin, target, viaAnswer) {
    gameOver = true;
    $('guessInput').disabled = true;
    $('btnGuess').disabled = true;
    $('btnViewAnswer').disabled = true;

    const modal = $('gameOverModal');
    const m = $('resultModal');
    m.className = 'modal ' + (isWin ? 'win' : 'lose');
    $('resultIcon').textContent = isWin ? '🎉' : '😢';
    $('resultTitle').textContent = isWin ? '恭喜你，猜对了！' : viaAnswer ? '你查看了答案' : '很遗憾，机会用完了';
    $('correctAnswer').style.display = 'block';
    $('correctAnswer').innerHTML = `正确答案是：<br><strong>${target.name}</strong>`;
    $('resultDetail').textContent = isWin
        ? `你用了 ${guessHistory.length} / ${MAX_ATTEMPTS} 次就猜出了正确答案！`
        : viaAnswer
            ? '你选择了查看答案，答案揭晓啦！'
            : '4 次机会都用完了，来看看正确答案吧！';
    $('btnContinue').style.display = 'inline-block';
    showModal('gameOverModal');
}

function closeModal() { hideModal('gameOverModal'); }

function viewAnswer() {
    if (!currentTarget || gameOver) return;
    // 查看答案：立即揭示答案，结束本局（不再影响得分）
    endGame(false, currentTarget, true);
}

// ==================== 单人自动补全 ====================
async function loadNames() {
    try {
        const res = await fetch('/api/names');
        const data = await res.json();
        if (data.status === 'success') allNames = data.names;
    } catch (e) { allNames = []; }
}

function filterSuggestions(keyword) {
    if (!keyword) return [];
    const kw = keyword.toLowerCase();
    return allNames.filter(n => n.name.toLowerCase().includes(kw)).slice(0, 10);
}

function renderSingleSuggestions() {
    const list = $('autocompleteList');
    const keyword = $('guessInput').value.trim();
    singleSuggestions = filterSuggestions(keyword);
    singleActive = -1;
    if (!singleSuggestions.length) { hideSingleSuggestions(); return; }
    list.innerHTML = '';
    singleSuggestions.forEach((item, i) => {
        const div = document.createElement('div');
        div.className = 'ac-item' + (i === singleActive ? ' active' : '');
        div.innerHTML = `<span class="ac-name">${item.name}</span><span class="ac-attr">${item.attribute}</span><span class="ac-stars">${starStr(item.star_rating)}</span>`;
        div.onclick = () => { $('guessInput').value = item.name; hideSingleSuggestions(); $('guessInput').focus(); };
        list.appendChild(div);
    });
    list.classList.add('active');
}
function hideSingleSuggestions() { $('autocompleteList').innerHTML = ''; $('autocompleteList').classList.remove('active'); singleSuggestions = []; singleActive = -1; }

$('guessInput') && ($('guessInput').addEventListener('input', function () {
    if (gameOver) return;
    renderSingleSuggestions();
}));

$('guessInput') && $('guessInput').addEventListener('keydown', function (e) {
    if (e.key === 'Tab') {
        if (singleSuggestions.length) {
            const idx = singleActive >= 0 ? singleActive : 0;
            this.value = singleSuggestions[idx].name;
            hideSingleSuggestions();
            e.preventDefault();
        } else {
            const m = filterSuggestions(this.value.trim());
            if (m.length) { this.value = m[0].name; e.preventDefault(); }
        }
        return;
    }
    if (e.key === 'ArrowDown' && singleSuggestions.length) { singleActive = (singleActive + 1) % singleSuggestions.length; highlightSingle(); e.preventDefault(); return; }
    if (e.key === 'ArrowUp' && singleSuggestions.length) { singleActive = (singleActive - 1 + singleSuggestions.length) % singleSuggestions.length; highlightSingle(); e.preventDefault(); return; }
    if (e.key === 'Enter') {
        e.preventDefault();
        if (singleSuggestions.length && this.value.trim() !== singleSuggestions[singleActive >= 0 ? singleActive : 0].name) {
            this.value = singleSuggestions[singleActive >= 0 ? singleActive : 0].name;
            hideSingleSuggestions();
        } else {
            hideSingleSuggestions();
        }
        guessCharacter();
        return;
    }
    if (e.key === 'Escape') hideSingleSuggestions();
});
function highlightSingle() {
    document.querySelectorAll('#autocompleteList .ac-item').forEach((el, i) => el.classList.toggle('active', i === singleActive));
}

// ==================== 多人模式：菜单操作 ====================
function openJoinDialog() {
    $('joinCodeInput').value = '';
    showModal('joinDialog');
    setTimeout(() => $('joinCodeInput').focus(), 50);
}
function closeJoinDialog() { hideModal('joinDialog'); }

async function createRoom() {
    try {
        const res = await fetch('/api/multi/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ player_id: myPlayerId })
        });
        const data = await res.json();
        if (data.status === 'error') { alert(data.message || '创建失败'); return; }
        if (data.in_room) {
            // 已在其他房间：返回该房间
            enterGameByExistingRoom(data.room_code, data.room_status);
            return;
        }
        multiRoomCode = data.room_code;
        showWaitRoom(data.room_code);
    } catch (e) { alert('无法连接服务器'); }
}

function showWaitRoom(code) {
    $('waitTitle').textContent = '房间已创建，等待对手加入...';
    $('waitRoomCode').innerHTML = `房间号<br>${code}`;
    $('waitDesc').textContent = '请将房间号告知另一位玩家，或稍后在匹配中等待';
    showModal('waitDialog');
    // 轮询等待对手加入
    startWaitPolling();
}

async function randomMatch() {
    // 先取消可能的排队后重新匹配
    try {
        const res = await fetch('/api/multi/random_match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ player_id: myPlayerId })
        });
        const data = await res.json();
        if (data.status === 'error') { alert(data.message || '匹配失败'); return; }
        multiRoomCode = data.room_code;
        if (data.in_queue) {
            $('waitTitle').textContent = '正在匹配中...';
            $('waitRoomCode').innerHTML = '';
            $('waitDesc').textContent = '正在为你寻找对手，请稍候';
            showModal('waitDialog');
            startWaitPolling();
        } else if (data.room_code) {
            enterMultiGame(data.room_code);
        } else if (data.already_in_room) {
            hideModal('waitDialog');
            stopPolling();
            enterGameByExistingRoom(data.room_code, data.room_status);
        }
    } catch (e) { alert('无法连接服务器'); }
}

function startWaitPolling() {
    stopPolling();
    multiPollTimer = setInterval(async () => {
        // 检查随机匹配是否已配对（未拿到 room_code 的情况）
        if (!multiRoomCode) {
            try {
                const res = await fetch('/api/multi/random_match', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ player_id: myPlayerId })
                });
                const data = await res.json();
                if (data.status !== 'success') return;
                if (data.room_code) {
                    multiRoomCode = data.room_code;
                    hideModal('waitDialog');
                    stopPolling();
                    enterMultiGame(data.room_code);
                    return;
                }
                if (data.already_in_room) {
                    hideModal('waitDialog');
                    stopPolling();
                    enterGameByExistingRoom(data.room_code, data.room_status);
                    return;
                }
                if (data.in_queue) return;
            } catch (e) {
                return;
            }
            return;
        }
        // 已有房间：检查是否开始
        const res = await fetch(`/api/multi/room_state?player_id=${encodeURIComponent(myPlayerId)}&room_code=${multiRoomCode}`);
        const data = await res.json();
        if (data.status === 'success' && (data.room_status === 'playing' || data.room_status === 'finished')) {
            hideModal('waitDialog');
            stopPolling();
            enterMultiGame(multiRoomCode);
        }
    }, 1500);
}

function enterGameByExistingRoom(code, roomStatus) {
    stopPolling();
    hideModal('waitDialog');
    if (!code) { goBackToMenu(); return; }
    multiRoomCode = code;
    if (roomStatus === 'waiting') {
        showWaitRoom(code);          // 回到等待房间界面
    } else {
        enterMultiGame(code);        // 进入对局/结束
    }
}

function stopPolling() { if (multiPollTimer) { clearInterval(multiPollTimer); multiPollTimer = null; } }

function cancelWait() {
    stopPolling();
    hideModal('waitDialog');
    if (multiRoomCode) {
        // 创建的房间等待中取消：直接删除房间
        fetch('/api/multi/leave_room', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ player_id: myPlayerId, room_code: multiRoomCode })
        });
    } else {
        // 随机匹配排队中：取消排队
        fetch('/api/multi/cancel_match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ player_id: myPlayerId })
        });
    }
    multiRoomCode = '';
}

// -------------------- 左下角：返回房间按钮 --------------------
async function checkMyRoom() {
    try {
        // 兜底检查「对手弃权」通知：即使 pollRoom 在轮询竞态中漏掉，
        // 这个每 3 秒运行的检查也能稳定弹出「对手放弃、判定你胜利」提示。
        await checkForfeitNotice();

        const res = await fetch(`/api/multi/my_room?player_id=${encodeURIComponent(myPlayerId)}`);
        const data = await res.json();
        const btn = $('btnRoomNav');
        if (data.status === 'success' && data.in_room) {
            myCurrentRoom = { room_code: data.room_code, room_status: data.room_status };
            // 仅当「对抗进行中」且「当前不在对抗房间界面」时才显示返回按钮
            const inBattle = data.room_status === 'playing';
            const inBattleView = $('view-multi').style.display === 'block';
            if (inBattle && !inBattleView) {
                btn.style.display = 'inline-block';
                btn.textContent = '🏠 返回对战';
            } else {
                btn.style.display = 'none';
            }
        } else {
            myCurrentRoom = null;
            btn.style.display = 'none';
        }
    } catch (e) {
        // 网络异常时不做处理，保持原状
    }
}

function goToMyRoom() {
    if (!myCurrentRoom || !myCurrentRoom.room_code) return;
    // 若已在该房间的对战界面中，仅刷新即可，避免重置输入
    if (multiRoomCode === myCurrentRoom.room_code
        && $('view-multi').style.display === 'block') {
        pollRoom();
        return;
    }
    enterGameByExistingRoom(myCurrentRoom.room_code, myCurrentRoom.room_status);
}

function startRoomNavCheck() {
    stopRoomNavCheck();
    roomNavCheckTimer = setInterval(checkMyRoom, 3000);
}
function stopRoomNavCheck() {
    if (roomNavCheckTimer) { clearInterval(roomNavCheckTimer); roomNavCheckTimer = null; }
}

async function joinRoom() {
    const code = $('joinCodeInput').value.trim().toUpperCase();
    if (!code) { alert('请输入房间号'); return; }
    try {
        const res = await fetch('/api/multi/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ player_id: myPlayerId, room_code: code })
        });
        const data = await res.json();
        if (data.status === 'error') { alert(data.message || '加入失败'); return; }
        hideModal('joinDialog');
        multiRoomCode = data.room_code;
        enterMultiGame(data.room_code);
    } catch (e) { alert('无法连接服务器'); }
}

function leaveMulti() {
    stopPolling();
    hideModal('roundModal');
    hideModal('waitDialog');
    if (multiRoomCode) {
        // 通知服务端离开房间（对战中退出会判负结算并删除房间）
        fetch('/api/multi/leave_room', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ player_id: myPlayerId, room_code: multiRoomCode })
        }).then(r => r.json()).catch(() => {});
    }
    multiRoomCode = '';
    multiGameRef = null;
    goBackToMenu();
}

// ==================== 多人游戏 ====================
function enterMultiGame(roomCode) {
    multiRoomCode = roomCode;
    showView('view-multi');
    setupMultiInput();
    pollRoom();
    stopPolling();
    multiPollTimer = setInterval(pollRoom, 1500);
}

function setupMultiInput() {
    $('multiGuessInput').disabled = false;
    $('btnMultiGuess').disabled = false;
    $('multiGuessInput').value = '';
    // 清空上一次的输入监听
    if (multiGuessInputHandler) {
        $('multiGuessInput').removeEventListener('input', multiGuessInputHandler);
    }
    multiGuessInputHandler = function () { renderMultiSuggestions(); };
    $('multiGuessInput').addEventListener('input', multiGuessInputHandler);
}

async function pollRoom() {
    if (!multiRoomCode) return;
    try {
        const res = await fetch(`/api/multi/room_state?player_id=${encodeURIComponent(myPlayerId)}&room_code=${multiRoomCode}`);
        const data = await res.json();
        if (data.status === 'error') {
            // 房间已消失：可能是对手主动退出（强制胜利），也可能是房间结束/被清理
            await checkForfeitNotice();
            leaveMulti();
            return;
        }
        renderMultiGame(data);
    } catch (e) { /* 忽略轮询错误 */ }
}

// 拉取「对手弃权，判定你胜利」通知并弹出提示框
async function checkForfeitNotice() {
    if (!myPlayerId) return false;
    try {
        const res = await fetch(`/api/multi/forfeit_notice?player_id=${encodeURIComponent(myPlayerId)}`);
        const data = await res.json();
        if (data.status === 'success' && data.forfeit) {
            stopPolling();
            $('forfeitIcon').textContent = '🏆';
            $('forfeitTitle').textContent = '对方已放弃对局';
            $('forfeitDetail').textContent = data.message;
            showModal('forfeitModal');
            return true;
        }
    } catch (e) { /* 忽略 */ }
    return false;
}

function closeForfeitModal() {
    hideModal('forfeitModal');
    $('btnRoomNav').style.display = 'none';
}

function formatTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function renderMultiGame(data) {
    multiGameRef = data;
    const round = data.round;
    const maxRound = data.best_of;
    $('roundBadge').textContent = `第 ${round} 局`;

    // 计时器
    const timerEl = $('timerBadge');
    const tl = data.time_left;
    timerEl.textContent = '⏱ ' + formatTime(tl);
    timerEl.classList.toggle('warn', tl <= 15);

    // 比分（局胜）
    const wins = data.round_wins || [0, 0];
    $('myScoreItem').textContent = `我 ${wins[data.player_index] || 0}`;
    $('oppScoreItem').textContent = `对手 ${wins[1 - (data.player_index)] || 0}`;

    // 对手 ID
    if (data.opponent_id) $('oppIdLabel').textContent = data.opponent_id;

    // 渲染双方表格
    const players = data.players || [];
    const me = players.find(p => p.is_me);
    const opp = players.find(p => !p.is_me);
    // 对战中用 target_version 提供升/降方向提示（不泄露完整答案）
    const targetVersion = data.target_version != null ? data.target_version : null;
    renderOppTable(me ? me.guesses : [], 'myTbody', 'myEmptyState', true, targetVersion);
    renderOppTable(opp ? opp.guesses : [], 'oppTbody', 'oppEmptyState', false, targetVersion);

    // 局结束/游戏结束弹窗
    if (data.round_status === 'finished' || data.room_status === 'finished') {
        handleRoundEnd(data);
    } else {
        $('multiGuessInput').disabled = false;
        $('btnMultiGuess').disabled = false;
    }
}

function renderOppTable(guesses, tbodyId, emptyId, revealed, targetVersion) {
    const tbody = $(tbodyId);
    const empty = $(emptyId);
    tbody.innerHTML = '';
    if (!guesses.length) { empty.style.display = 'block'; return; }
    empty.style.display = 'none';
    guesses.forEach((rec, idx) => {
        const g = rec.guess, c = rec.compare;
        const tr = document.createElement('tr');
        tr.appendChild(makeCell(String(idx + 1), 'rownum'));
        tr.appendChild(makeCell(g.name, revealed ? '' : 'masked-cell'));
        tr.appendChild(makeCell(g.attribute, revealed ? '' : 'masked-cell', null, c.attribute));
        tr.appendChild(makeCell(revealed ? starStr(g.star_rating) : '***', revealed ? '' : 'masked-cell', null, c.star_rating));
        tr.appendChild(makeCell(g.weapon, revealed ? '' : 'masked-cell', null, c.weapon));
        tr.appendChild(makeCell(g.birthplace, revealed ? '' : 'masked-cell', null, c.birthplace));
        // 版本列：目标可见时显示 ↑/↓ 方向提示
        let verText = revealed ? formatVersion(g.version) : '***';
        if (revealed && targetVersion != null) {
            const gv = parseFloat(g.version), tv = parseFloat(targetVersion);
            if (gv < tv) verText += ' ↑';
            else if (gv > tv) verText += ' ↓';
        }
        tr.appendChild(makeCell(verText, revealed ? '' : 'masked-cell', null, c.version));
        tbody.appendChild(tr);
    });
}

let roundModalShown = null;
function handleRoundEnd(data) {
    // 仅弹出一次（避免重复）
    const key = `${data.round}-${data.room_status}`;
    if (roundModalShown === key) return;
    roundModalShown = key;

    $('multiGuessInput').disabled = true;
    $('btnMultiGuess').disabled = true;
    $('roundTimerHint').style.display = 'none';

    const box = $('roundModalBox');
    const wins = data.round_wins || [0, 0];
    const myIdx = data.player_index;
    const roundWinner = data.round_winner;
    let msg = '';
    let title = '';
    let icon = '';

    if (data.room_status === 'finished') {
        // 整场结束
        const overallWinner = data.overall_winner;
        const iWon = overallWinner === myIdx;
        title = iWon ? '🎉 你赢了整场比赛！' : '😢 你输掉了整场比赛';
        icon = iWon ? '🏆' : '💔';
        box.className = 'modal ' + (iWon ? 'win' : 'lose');
        $('roundAnswer').innerHTML = data.target
            ? `最终答案：<strong>${data.target.name}</strong>`
            : '';
        msg = `三局两胜最终比分：我 ${wins[myIdx]} : ${wins[1-myIdx]} 对手`;
        $('roundDetail').textContent = msg;
        $('roundNextBtn').style.display = 'none';
        $('roundDoneBtn').style.display = 'inline-block';
        $('roundIcon').textContent = icon;
        $('roundTitle').textContent = title;
    } else {
        // 单局结束：无手动按钮，5 秒后自动关闭并开始下一局
        const iWon = roundWinner === myIdx;
        title = iWon ? '🎉 你拿下了这一局！' : roundWinner === null ? '🤝 这一局平局' : '😢 对手拿下了这一局';
        icon = iWon ? '🎯' : roundWinner === null ? '🤝' : '💥';
        box.className = 'modal ' + (iWon ? 'win' : (roundWinner === null ? '' : 'lose'));
        $('roundAnswer').innerHTML = data.target
            ? `本局答案：<strong>${data.target.name}</strong>`
            : '';
        msg = `当前比分：我 ${wins[myIdx]} : ${wins[1-myIdx]} 对手 · 稍后自动进入下一局`;
        $('roundDetail').textContent = msg;
        $('roundNextBtn').style.display = 'none';
        $('roundDoneBtn').style.display = 'none';
        $('roundTimerHint').style.display = 'block';
        $('roundIcon').textContent = icon;
        $('roundTitle').textContent = title;
        // 5 秒后自动关闭弹窗并开始下一局（下一局计时从此刻起算）
        clearTimeout(multiRoundTimer);
        multiRoundTimer = setTimeout(() => {
            closeRoundModal();
            nextRound();
        }, 5000);
    }
    showModal('roundModal');
}

let multiRoundTimer = null;

function closeRoundModal() {
    hideModal('roundModal');
    roundModalShown = null;
    $('roundTimerHint').style.display = 'none';
    clearTimeout(multiRoundTimer);
}

async function nextRound() {
    if (!multiRoomCode) return;
    try {
        await fetch('/api/multi/next_round', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ player_id: myPlayerId, room_code: multiRoomCode })
        });
    } catch (e) { /* 忽略 */ }
    await pollRoom();
}

async function multiGuessCharacter() {
    if (!multiRoomCode) return;
    const name = $('multiGuessInput').value.trim();
    if (!name) { alert('请输入角色名！'); return; }
    // 若当前局已结束，忽略
    const ref = multiGameRef;
    if (ref && (ref.round_status === 'finished' || ref.room_status === 'finished')) {
        alert('本局已结束，请等待下一局');
        return;
    }
    try {
        const res = await fetch('/api/multi/guess', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ player_id: myPlayerId, room_code: multiRoomCode, guess: name })
        });
        const data = await res.json();
        if (data.status === 'error') { alert(data.message); return; }
        $('multiGuessInput').value = '';
        hideMultiSuggestions();
        // 立即刷新以显示我方最新猜测
        await pollRoom();
    } catch (e) { alert('无法连接服务器'); }
}

// ==================== 多人自动补全 ====================
function renderMultiSuggestions() {
    const list = $('multiAutocompleteList');
    const keyword = $('multiGuessInput').value.trim();
    multiSuggestions = filterSuggestions(keyword);
    multiActive = -1;
    if (!multiSuggestions.length) { hideMultiSuggestions(); return; }
    list.innerHTML = '';
    multiSuggestions.forEach((item, i) => {
        const div = document.createElement('div');
        div.className = 'ac-item' + (i === multiActive ? ' active' : '');
        div.innerHTML = `<span class="ac-name">${item.name}</span><span class="ac-attr">${item.attribute}</span><span class="ac-stars">${starStr(item.star_rating)}</span>`;
        div.onclick = () => { $('multiGuessInput').value = item.name; hideMultiSuggestions(); $('multiGuessInput').focus(); };
        list.appendChild(div);
    });
    list.classList.add('active');
}
function hideMultiSuggestions() { $('multiAutocompleteList').innerHTML = ''; $('multiAutocompleteList').classList.remove('active'); multiSuggestions = []; multiActive = -1; }

$('multiGuessInput') && $('multiGuessInput').addEventListener('keydown', function (e) {
    if (e.key === 'Tab') {
        if (multiSuggestions.length) {
            const idx = multiActive >= 0 ? multiActive : 0;
            this.value = multiSuggestions[idx].name;
            hideMultiSuggestions();
            e.preventDefault();
        } else {
            const m = filterSuggestions(this.value.trim());
            if (m.length) { this.value = m[0].name; hideMultiSuggestions(); e.preventDefault(); }
        }
        return;
    }
    if (e.key === 'Enter') {
        e.preventDefault();
        if (multiSuggestions.length && this.value.trim() !== multiSuggestions[multiActive >= 0 ? multiActive : 0].name) {
            this.value = multiSuggestions[multiActive >= 0 ? multiActive : 0].name;
            hideMultiSuggestions();
        } else {
            hideMultiSuggestions();
        }
        multiGuessCharacter();
        return;
    }
    if (e.key === 'Escape') hideMultiSuggestions();
});

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', async () => {
    await initPlayer();
    loadNames();
    showView('view-mainmenu');
    refreshPlayerDisplay();
    startRoomNavCheck();          // 左下角返回房间按钮
});
