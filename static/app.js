// ============================================================
// 角色猜谜游戏 - 前端逻辑
// 包含：主菜单 / 单人模式 / 多人模式 / 排行榜 / 玩家ID
// ============================================================

// ---------------- 全局配置 ----------------
const RESONATOR_ATTEMPTS = 4;           // 猜共鸣者：每局 4 次机会
const SKELETON_ATTEMPTS = 8;            // 猜声骸：每局 8 次机会
function maxAttempts(qtype) {           // 根据猜谜类型返回本局最多猜测次数
    return qtype === 'skeleton' ? SKELETON_ATTEMPTS : RESONATOR_ATTEMPTS;
}

// 玩家ID（每设备唯一，存于 localStorage）
const ID_KEY = 'phrolova_player_id';
const TOKEN_KEY = 'phrolova_player_secret';
const AUTH_KEY = 'phrolova_logged_in';   // '1' = 已登录账号
let myPlayerId = localStorage.getItem(ID_KEY) || '';
let myToken = localStorage.getItem(TOKEN_KEY) || '';
let loggedIn = localStorage.getItem(AUTH_KEY) === '1';
let myScore = 0;

// 单人游戏状态
let currentTarget = null;
let guessHistory = [];
let gameOver = false;
let singleQuizType = 'resonator';   // 'resonator' 猜共鸣者 / 'skeleton' 猜声骸

// 猜谜类型选择弹窗：确认后的回调
let pendingQuizTypeCallback = null;

// 多人开局配置弹窗：类型 / 局制(bo) / 难度
let multiSetupState = { mode: 'create', type: 'resonator', bo: 3, diff: 'hard', boLocked: false };

// 多人游戏状态
let multiRoomCode = '';
let multiQuizType = 'resonator';   // 本房间猜谜类型
let multiPollTimer = null;
let multiGuessInputHandler = null;
let multiTarget = null;
let multiGameRef = null;   // 最近一次 room_state
let myCurrentRoom = null;  // { room_code, room_status } —— 左下角返回按钮用
let roomNavCheckTimer = null;

// WebSocket 实时推送（代替秒级 HTTP 轮询）
let ws = null;              // 全局 WebSocket 连接
let wsReady = false;        // 是否已连接并完成鉴权
let wsOpen = false;         // 连接是否处于打开状态

// 计时器：客户端本地平滑倒计时
let timerInterval = null;

// 进入对局倒计时（双方匹配成功后统一等待 2 秒）
let enterCountdownTimer = null;

// 防止「对手弃权」通知被 WS 推送与 HTTP 兜底重复弹出
let wsForfeitShown = false;

// 自动补全数据
let allNames = [];
let allSkeletonNames = [];
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
// 逗号分离字段的「整格底色」状态：绿=数量全对，黄=数量不对，灰=全没猜中
function cellStatusClass(cell) {
    if (cell === 'match') return 'cell-match';
    if (cell === 'partial') return 'cell-partial';
    return 'cell-different';
}

function $(id) { return document.getElementById(id); }

function showView(id) {
    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
    $(id).style.display = 'block';
    window.scrollTo(0, 0);
}

function showModal(id) { $(id).classList.add('active'); }
function hideModal(id) { $(id).classList.remove('active'); }

// ==================== 猜谜类型选择（共鸣者 / 声骸） ====================
function showQuizTypeModal(callback) {
    pendingQuizTypeCallback = callback;
    showModal('quizTypeModal');
}
function hideQuizTypeModal() { hideModal('quizTypeModal'); pendingQuizTypeCallback = null; }

function confirmQuizType(type) {
    const cb = pendingQuizTypeCallback;
    hideQuizTypeModal();
    if (cb) cb(type);
}

// ==================== 多人开局配置弹窗（选类型 / BO 局制 / 声骸难度） ====================
function openMultiSetup(mode) {
    // mode: 'create'（创建房间，可自定义BO） / 'rank'（排位，BO 固定 3）
    multiSetupState = {
        mode,
        type: 'resonator',
        bo: mode === 'rank' ? 3 : 3,
        diff: 'hard',
        boLocked: mode === 'rank',
    };
    $('msTitle').textContent = mode === 'rank' ? '排位匹配' : '创建房间';
    $('msConfig').style.display = 'none';
    $('msNote').textContent = '';
    showModal('multiSetupModal');
}

function msPickType(type) {
    multiSetupState.type = type;
    $('msConfig').style.display = 'block';
    // 声骸才显示难度选择
    $('msDiffRow').style.display = type === 'skeleton' ? 'flex' : 'none';
    updateMsUi();
}

function msPickBo(bo) {
    if (multiSetupState.boLocked) return;   // 排位 BO 固定 3
    multiSetupState.bo = bo;
    updateMsUi();
}

function msPickDiff(diff) {
    multiSetupState.diff = diff;
    updateMsUi();
}

// 根据当前选择刷新弹窗里的激活态与提示文案
function updateMsUi() {
    const s = multiSetupState;
    // BO 选择激活态
    $('msBo1').classList.toggle('active', s.bo === 1 && !s.boLocked);
    $('msBo3').classList.toggle('active', s.bo === 3 && !s.boLocked);
    $('msBo5').classList.toggle('active', s.bo === 5 && !s.boLocked);
    // 排位锁定 BO3
    $('msBo1').classList.toggle('locked', s.boLocked);
    $('msBo3').classList.toggle('locked', s.boLocked);
    $('msBo5').classList.toggle('locked', s.boLocked);
    if (s.boLocked) {
        $('msBo3').classList.add('active');
    }
    // 难度激活态
    $('msDiffEasy').classList.toggle('active', s.diff === 'easy');
    $('msDiffHard').classList.toggle('active', s.diff === 'hard');

    // 提示 + 分值预览
    const bo = s.boLocked ? 3 : s.bo;
    const typeName = s.type === 'skeleton' ? '声骸' : '共鸣者';
    let score = '';
    if (s.type === 'skeleton') {
        score = s.diff === 'easy'
            ? ({ 1: 5, 3: 10, 5: 15 }[bo] ?? 10)
            : ({ 1: 30, 3: 50, 5: 70 }[bo] ?? 50);
    } else {
        score = ({ 1: 10, 3: 30, 5: 50 }[bo] ?? 30);
    }
    const boLabel = 'BO' + bo;
    const diffLabel = s.type === 'skeleton' ? (s.diff === 'easy' ? '简单' : '困难') : '';
    $('msNote').innerHTML = `${typeName} · ${boLabel}（三局${bo}后整场结束）· ${diffLabel || '无难度'}
        <br><span class="ms-score-preview">胜负各 ±${score} 分</span>`;
    $('msConfirmBtn').textContent = s.mode === 'rank' ? '确认匹配' : '确认创建';
}

// 确认后调用真正创建/匹配接口
async function msConfirm() {
    const s = multiSetupState;
    hideModal('multiSetupModal');
    multiQuizType = s.type;
    if (s.mode === 'rank') {
        await doRandomMatch(s.type, s.diff);
    } else {
        await doCreateRoom(s.type, s.bo, s.diff);
    }
}

// ==================== 玩家 ID 管理 ====================
function refreshAuthControls() {
    // 未登录：显示「注册/登录」按钮；已登录：显示 ID/分数/修改ID/退出
    const authBtn = $('btnAuth');
    const loggedControls = $('loggedInControls');
    if (!authBtn || !loggedControls) return;
    if (loggedIn) {
        authBtn.style.display = 'none';
        loggedControls.style.display = 'inline-block';
    } else {
        authBtn.style.display = 'inline-block';
        loggedControls.style.display = 'none';
    }
}

async function initPlayer() {
    try {
        // 仅已登录账号才同步分数（用账号名作为 player_id）
        if (loggedIn && myPlayerId) {
            const res = await fetch('/api/player/init', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ player_id: myPlayerId })
            });
            const data = await res.json();
            if (data.status === 'success') {
                myScore = data.player.score;
                if (data.token) { myToken = data.token; localStorage.setItem(TOKEN_KEY, myToken); }
            }
        }
        // 未登录：不做任何初始化 —— 不生成临时账号、不写入数据库、不建立玩家凭证
    } catch (e) { /* 忽略 */ }
    refreshPlayerDisplay();
    refreshAuthControls();
    // 已登录且具备凭证时才建立 WebSocket 实时通道；未登录则跳过
    if (loggedIn && myPlayerId && myToken) connectWS();
}

function refreshPlayerDisplay() {
    const idLab = $('mainPlayerId');
    const scoreLab = $('mainPlayerScore');
    const label = $('mainIdLabel');
    // 未登录时隐藏 ID、分数及其标签，仅保留「注册/登录」按钮
    if (loggedIn) {
        idLab.textContent = myPlayerId || '--';
        scoreLab.textContent = `(${myScore} 分)`;
        if (label) label.style.display = '';
        idLab.style.display = '';
        scoreLab.style.display = '';
    } else {
        idLab.textContent = '';
        scoreLab.textContent = '';
        if (label) label.style.display = 'none';
        idLab.style.display = 'none';
        scoreLab.style.display = 'none';
    }
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
            body: JSON.stringify({ old_id: myPlayerId, new_id: newId, token: myToken })
        });
        const data = await res.json();
        if (data.status === 'success') {
            myPlayerId = data.player.player_id;
            myScore = data.player.score;
            if (data.token) {
                myToken = data.token;
                localStorage.setItem(TOKEN_KEY, myToken);
            }
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

// ==================== 账号：注册 / 登录 / 退出 ====================
// 每个表单分别缓存最新验证码 ID，避免来回切换导致验证码错乱
let loginCaptchaId = '';
let registerCaptchaId = '';
let currentAuthView = 'login';   // 'login' / 'register'

function enterAuth() {
    if (loggedIn) return;   // 已登录则无需进入
    showView('view-auth');
    currentAuthView = 'login';
    showLoginForm();
}

function showLoginForm() {
    currentAuthView = 'login';
    $('authTitle').textContent = '🔑 登录';
    $('loginForm').style.display = 'flex';
    $('registerForm').style.display = 'none';
    if ($('loginError')) $('loginError').textContent = '';
    loadCaptcha('loginCaptcha');
}

function showRegisterForm() {
    currentAuthView = 'register';
    $('authTitle').textContent = '📝 注册';
    $('loginForm').style.display = 'none';
    $('registerForm').style.display = 'flex';
    if ($('registerError')) $('registerError').textContent = '';
    loadCaptcha('registerCaptcha');
}

async function loadCaptcha(which) {
    // which ∈ {'loginCaptcha', 'registerCaptcha'}
    const imgId = which === 'loginCaptcha' ? 'loginCaptchaImg' : 'registerCaptchaImg';
    const img = $(imgId);
    if (!img) return;
    img.src = '';
    try {
        const res = await fetch('/api/auth/captcha');
        const data = await res.json();
        if (data.status !== 'success') { img.title = '生成失败，点击重试'; return; }
        img.src = data.image;
        if (which === 'loginCaptcha') loginCaptchaId = data.captcha_id;
        else registerCaptchaId = data.captcha_id;
    } catch (e) {
        img.title = '无法连接服务器';
    }
}

function applyLoginSuccess(data) {
    myPlayerId = data.player.player_id;
    myScore = data.player.score;
    myToken = data.token;
    loggedIn = true;
    localStorage.setItem(ID_KEY, myPlayerId);
    localStorage.setItem(TOKEN_KEY, myToken);
    localStorage.setItem(AUTH_KEY, '1');
    refreshPlayerDisplay();
    refreshAuthControls();
    connectWS();      // 账号变更后重建 WebSocket 通道
    showView('view-mainmenu');
}

async function doLogin() {
    const username = $('loginUsername').value.trim();
    const password = $('loginPassword').value;
    const captcha_text = $('loginCaptchaInput').value.trim();
    $('loginError').textContent = '';
    if (!username || !password) { $('loginError').textContent = '请输入账号和密码'; loadCaptcha('loginCaptcha'); $('loginCaptchaInput').value=''; return; }
    if (!captcha_text) { $('loginError').textContent = '请输入验证码'; loadCaptcha('loginCaptcha'); return; }
    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, captcha_id: loginCaptchaId, captcha_text })
        });
        const data = await res.json();
        if (data.status === 'success') {
            alert('登录成功！');
            applyLoginSuccess(data);
        } else {
            $('loginError').textContent = data.message || '登录失败';
            loadCaptcha('loginCaptcha');
            $('loginCaptchaInput').value = '';
        }
    } catch (e) {
        $('loginError').textContent = '无法连接服务器';
        loadCaptcha('loginCaptcha');
    }
}

async function doRegister() {
    const username = $('regUsername').value.trim();
    const password = $('regPassword').value;
    const captcha_text = $('registerCaptchaInput').value.trim();
    $('registerError').textContent = '';
    if (!username) { $('registerError').textContent = '请输入账号'; loadCaptcha('registerCaptcha'); return; }
    if (password.length < 6) { $('registerError').textContent = '密码至少 6 位'; loadCaptcha('registerCaptcha'); return; }
    if (!captcha_text) { $('registerError').textContent = '请输入验证码'; loadCaptcha('registerCaptcha'); return; }
    try {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, captcha_id: registerCaptchaId, captcha_text })
        });
        const data = await res.json();
        if (data.status === 'success') {
            alert('注册成功，已自动登录！');
            applyLoginSuccess(data);
        } else {
            $('registerError').textContent = data.message || '注册失败';
            loadCaptcha('registerCaptcha');
            $('registerCaptchaInput').value = '';
        }
    } catch (e) {
        $('registerError').textContent = '无法连接服务器';
        loadCaptcha('registerCaptcha');
    }
}

function logout() {
    // 清除本地登录状态，回到「未登录」状态（不自动创建临时账号）
    try { fetch('/api/auth/logout', { method: 'POST' }); } catch (e) {}
    loggedIn = false;
    localStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(ID_KEY);
    localStorage.removeItem(TOKEN_KEY);
    myPlayerId = '';
    myToken = '';
    myScore = 0;
    // 断开 WebSocket（未登录时无身份凭证）
    try { if (ws) ws.close(); } catch (e) {}
    ws = null;
    wsReady = false;
    wsOpen = false;
    refreshPlayerDisplay();
    refreshAuthControls();
    showView('view-mainmenu');
}

// ==================== 视图导航 ====================
function goBackToMenu() { showView('view-mainmenu'); }

// 未登录不允许进入多人对战：跳转到登录页并提示
function requireLogin() {
    if (loggedIn) return true;
    alert('请先注册/登录账号，再进行多人游戏');
    showView('view-auth');
    showLoginForm();
    return false;
}

function enterSingle() {
    refreshPlayerDisplay();
    // 先询问猜谜类型，再进入单人模式开始随机抽题
    showQuizTypeModal((type) => {
        singleQuizType = type;
        showView('view-single');
        startGame();
    });
}
function enterMultiMenu() {
    if (!requireLogin()) return;   // 未登录不允许多人对战
    showView('view-multimenu');
}
async function enterLeaderboard() {
    showView('view-leaderboard');
    await loadLeaderboard();
}
function enterRules() {
    showView('view-rules');
}

// ==================== 数据库预览 ====================
let dbCharacters = [];
let dbSkeletons = [];
let dbActiveTab = 'characters';   // 当前显示的页签：'characters' / 'skeletons'
const DB_PAGE_SIZE = 30;          // 每页显示条数
let dbPage = 1;                   // 当前页码

function enterDbPreview() {
    showView('view-dbpreview');
    loadDbPreview();
}

async function loadDbPreview() {
    try {
        const res = await fetch('/api/db_preview');
        const data = await res.json();
        if (data.status === 'success') {
            dbCharacters = data.characters || [];
            dbSkeletons = data.skeletons || [];
            $('dbCountInfo').textContent =
                `数据库共收录 共鸣者 ${dbCharacters.length} 条 · 声骸 ${dbSkeletons.length} 条`;
            switchDbTab('characters');
        } else {
            $('dbEmptyState').textContent = '加载失败';
            $('dbEmptyState').style.display = 'block';
        }
    } catch (e) {
        $('dbEmptyState').textContent = '无法连接服务器';
        $('dbEmptyState').style.display = 'block';
    }
}

// 切换页签（角色 / 声骸），并重置到第一页
function switchDbTab(tab) {
    dbActiveTab = tab;
    dbPage = 1;
    $('tabCharacters').classList.toggle('active', tab === 'characters');
    $('tabSkeletons').classList.toggle('active', tab === 'skeletons');
    renderDbTable();
}

function dbPrevPage() {
    if (dbPage <= 1) return;
    dbPage--;
    renderDbTable();
}

function dbNextPage() {
    const total = dbActiveTab === 'characters' ? dbCharacters.length : dbSkeletons.length;
    const maxPage = Math.max(1, Math.ceil(total / DB_PAGE_SIZE));
    if (dbPage >= maxPage) return;
    dbPage++;
    renderDbTable();
}

function renderDbTable() {
    const thead = $('dbThead');
    const tbody = $('dbTbody');
    const empty = $('dbEmptyState');
    let rows;
    let columns = [];   // 每列为 {key, label}

    if (dbActiveTab === 'characters') {
        rows = dbCharacters;
        columns = [
            { key: 'id',          label: 'ID' },
            { key: 'name',        label: '姓名' },
            { key: 'attribute',   label: '属性' },
            { key: 'star_rating', label: '星级',  stars: true },
            { key: 'weapon',      label: '武器' },
            { key: 'birthplace',  label: '出生地' },
            { key: 'version',     label: '实装版本', version: true },
        ];
    } else {
        rows = dbSkeletons;
        columns = [
            { key: 'id',             label: 'ID' },
            { key: 'name',           label: '声骸名称' },
            { key: 'skill_attribute',label: '技能属性' },
            { key: 'cost',           label: 'COST' },
            { key: 'is_aberration',  label: '异相' },
            { key: 'set_name',       label: '所属套装' },
            { key: 'drop_location',  label: '掉落位置' },
        ];
    }

    // 表头
    thead.innerHTML = '<tr>' + columns.map(c => `<th>${c.label}</th>`).join('') + '</tr>';

    // 分页
    const total = rows.length;
    const maxPage = Math.max(1, Math.ceil(total / DB_PAGE_SIZE));
    if (dbPage > maxPage) dbPage = maxPage;
    const start = (dbPage - 1) * DB_PAGE_SIZE;
    const pageRows = rows.slice(start, start + DB_PAGE_SIZE);

    $('dbPageInfo').textContent = `第 ${dbPage} / ${maxPage} 页（共 ${total} 条）`;
    $('dbPrevBtn').disabled = dbPage <= 1;
    $('dbNextBtn').disabled = dbPage >= maxPage;

    tbody.innerHTML = '';
    if (!pageRows.length) {
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';

    pageRows.forEach((r, idx) => {
        const tr = document.createElement('tr');
        columns.forEach(c => {
            let text = r[c.key];
            const td = document.createElement('td');
            if (c.stars) {
                text = starStr(Number(text) || 0);
            } else if (c.version) {
                text = formatVersion(text);
            }
            td.textContent = (text === null || text === undefined) ? '' : String(text);
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
}

// ==================== 排行榜 ====================
async function loadLeaderboard() {
    const tbody = $('leaderboardTbody');
    const empty = $('lbEmptyState');
    tbody.innerHTML = '';
    try {
        // 传入当前玩家ID，服务端据此决定是否返回其个人名次
        const q = myPlayerId ? `?player_id=${encodeURIComponent(myPlayerId)}` : '';
        const res = await fetch('/api/leaderboard' + q);
        const data = await res.json();
        if (data.status === 'success' && data.leaderboard.length) {
            empty.style.display = 'none';
            // 前 40 名榜单：玩家自己的ID标黄
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

            // 玩家不在前 40 名：在最底部单独标出个人位置（黄色）
            const mi = data.my_info;
            if (myPlayerId && mi && !mi.in_top && mi.rank) {
                const cr = document.createElement('tr');
                cr.style.borderTop = '2px dashed rgba(255,255,255,0.25)';
                cr.appendChild(makeCell(String(mi.rank), 'rownum'));
                const nameTd = document.createElement('td');
                nameTd.textContent = mi.player_id + '（我的位置）';
                nameTd.style.color = '#ffd700';
                nameTd.style.fontWeight = 'bold';
                cr.appendChild(nameTd);
                cr.appendChild(makeCell(String(mi.score)));
                tbody.appendChild(cr);
            }
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
    const limit = maxAttempts(singleQuizType);
    $('attemptBadge').textContent = used >= limit ? '游戏结束' : `第 ${used + 1} / ${limit} 次猜测`;
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
                if (singleQuizType === 'skeleton') {
            tr.appendChild(renderAttrCell(c.skill_attribute, false));
            tr.appendChild(makeCell(String(g.cost), null, null, c.cost));
            tr.appendChild(makeCell(g.is_aberration, null, null, c.is_aberration));
            tr.appendChild(renderSetCell(c.set_name, false));
            tr.appendChild(renderLocCell(c.drop_location, false));
        } else {
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
        }
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

// -------------------- 声骸逗号分离字段（技能属性/所属套装/掉落位置）单格渲染 -------------------- 
// 每个字段返回 {cell, items:[...]}：cell 表示整格底色（数量对不对），items 中每项单独上底色。
// 通用渲染：chipClass 用于每项色块样式，labelFn 从 item 中取出要显示的文本。
function renderCommaCell(fieldObj, masked, chipClass, labelFn) {
    const td = document.createElement('td');
    if (!fieldObj || !fieldObj.items || !fieldObj.items.length) { td.textContent = ''; return td; }
    // 整格底色（依据数量判断：全对绿 / 缺项黄 / 全错灰）
    td.classList.add(cellStatusClass(fieldObj.cell));
    const wrap = document.createElement('div');
    wrap.className = 'set-wrap';
    fieldObj.items.forEach(item => {
        const chip = document.createElement('span');
        chip.className = chipClass + ' ' + statusClass(item.status);
        if (masked) { chip.classList.add('masked-cell'); chip.textContent = '***'; }
        else chip.textContent = labelFn(item);
        wrap.appendChild(chip);
    });
    td.appendChild(wrap);
    return td;
}

// skill_attribute：逗号分离，每项为独立色块
function renderAttrCell(fieldObj, masked) {
    return renderCommaCell(fieldObj, masked, 'loc-chip', item => item.attr);
}

// set_name：拆分“，”后每项为独立色块
function renderSetCell(fieldObj, masked) {
    return renderCommaCell(fieldObj, masked, 'set-text-chip', item => item.set);
}

// drop_location：拆分“，”后每项为独立色块
function renderLocCell(fieldObj, masked) {
    return renderCommaCell(fieldObj, masked, 'loc-chip', item => item.loc);
}

async function startGame() {
    try {
        const res = await fetch('/api/draw?type=' + singleQuizType);
        const data = await res.json();
        if (data.status === 'success') {
            currentTarget = data.character;
            guessHistory = [];
            gameOver = false;
            $('guessInput').value = '';
            $('guessInput').disabled = false;
            $('btnGuess').disabled = false;
            $('btnViewAnswer').disabled = false;
            $('singleEmptyState').textContent = singleQuizType === 'skeleton' ? '请输入声骸名称开始猜测 👆' : '请输入角色名开始猜测 👆';
            hideSingleSuggestions();
            renderSingleThead();
            renderAttemptBadge();
            renderSingleTable();
            $('guessInput').focus();
        } else {
            alert(data.message || '抽取目标失败');
        }
    } catch (e) {
        alert('无法连接服务器，请确认后端已启动');
    }
}

// 渲染单人表格表头（按猜谜类型切换字段）
function renderSingleThead() {
    const thead = $('singleThead');
    if (!thead) return;
        let ths;
    if (singleQuizType === 'skeleton') {
        ths = ['序号', '名称', '技能属性', 'COST', '异相', '所属套装', '掉落位置'];
    } else {
        ths = ['序号', '姓名', '属性', '星级', '武器', '出生地', '实装版本'];
    }
    thead.innerHTML = '<tr>' + ths.map(t => `<th>${t}</th>`).join('') + '</tr>';
}

async function guessCharacter() {
    if (!currentTarget || gameOver) return;
    const name = $('guessInput').value.trim();
    if (!name) { alert('请输入角色名！'); return; }

        try {
        const res = await fetch('/api/guess', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target: currentTarget, guess: name, type: singleQuizType })
        });
        const data = await res.json();
        if (data.status === 'error') { alert(data.message); return; }

        guessHistory.push({ guess: data.guess, compare: data.compare });
        $('guessInput').value = '';
        hideSingleSuggestions();
        renderAttemptBadge();
        renderSingleTable();

                                const allMatch = Object.values(data.compare).every(v => {
                    if (v && typeof v === 'object' && Array.isArray(v.items)) return v.items.length > 0 && v.cell === 'match';
                    if (Array.isArray(v)) return v.length > 0 && v.every(x => x.status === 'match');
                    return v === 'match';
                });
        if (allMatch || guessHistory.length >= maxAttempts(singleQuizType)) {
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
        const limit = maxAttempts(singleQuizType);
    $('resultDetail').textContent = isWin
        ? `你用了 ${guessHistory.length} / ${limit} 次就猜出了正确答案！`
        : viaAnswer
            ? '你选择了查看答案，答案揭晓啦！'
            : `${limit} 次机会都用完了，来看看正确答案吧！`;
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
    try {
        const res2 = await fetch('/api/skeleton_names');
        const data2 = await res2.json();
        if (data2.status === 'success') allSkeletonNames = data2.names;
    } catch (e) { allSkeletonNames = []; }
}

function currentSuggestionPool(qtype) {
    return qtype === 'skeleton' ? allSkeletonNames : allNames;
}

function filterSuggestions(keyword, qtype) {
    if (!keyword) return [];
    const kw = keyword.toLowerCase();
    return currentSuggestionPool(qtype)
        .filter(n => (n.name || '').toLowerCase().includes(kw))
        .slice(0, 10);
}

function renderSingleSuggestions() {
    const list = $('autocompleteList');
    const keyword = $('guessInput').value.trim();
    singleSuggestions = filterSuggestions(keyword, singleQuizType);
    singleActive = -1;
    if (!singleSuggestions.length) { hideSingleSuggestions(); return; }
    list.innerHTML = '';
    singleSuggestions.forEach((item, i) => {
        const div = document.createElement('div');
        div.className = 'ac-item' + (i === singleActive ? ' active' : '');
        if (singleQuizType === 'skeleton') {
            div.innerHTML = `<span class="ac-name">${item.name}</span><span class="ac-attr">${item.set_name || ''}</span><span class="ac-stars">COST${item.cost}</span>`;
        } else {
            div.innerHTML = `<span class="ac-name">${item.name}</span><span class="ac-attr">${item.attribute}</span><span class="ac-stars">${starStr(item.star_rating)}</span>`;
        }
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
            const m = filterSuggestions(this.value.trim(), singleQuizType);
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

// ==================== WebSocket 实时推送 ====================
function getWsUrl() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${location.hostname}:5001/ws`;
}

function connectWS() {
    try { if (ws) ws.close(); } catch (e) {}
    wsOpen = false;
    wsReady = false;
    if (!myPlayerId || !myToken) return;
    try {
        ws = new WebSocket(getWsUrl());
    } catch (e) { return; }
    ws.onopen = () => {
        wsOpen = true;
        try { ws.send(JSON.stringify({ type: 'auth', player_id: myPlayerId, token: myToken })); } catch (e) {}
    };
    ws.onmessage = (ev) => {
        let msg = null;
        try { msg = JSON.parse(ev.data); } catch (e) { return; }
        if (!msg || !msg.type) return;
        // 服务端鉴权成功会返回 auth_ack，表示推送通道就此就绪
        if (msg.type === 'auth_ack') { wsReady = true; return; }
        wsReady = true;
        handleWsMessage(msg);
    };
    ws.onclose = () => { wsOpen = false; wsReady = false; };
    ws.onerror = () => { /* 保持静默，后续靠 HTTP 兜底 */ };
}

function handleWsMessage(msg) {
    if (msg.type === 'game_started') {
        // 匹配/加入成功：服务端同时推送给双方，统一等待 2 秒后进入对局
        const code = msg.room_code || multiRoomCode;
        enterGameCountdown(code);
    } else if (msg.type === 'room_updated') {
        // 对局状态变化（出牌/开局/超时等）：立即渲染
        renderMultiGame(msg);
    } else if (msg.type === 'forfeit') {
        // 对手主动退出，判定本玩家胜利
        stopPolling();
        wsForfeitShown = true;
        $('forfeitIcon').textContent = '🏆';
        $('forfeitTitle').textContent = '对方已放弃对局';
        $('forfeitDetail').textContent = msg.message || '对手已放弃对局，判定你获得胜利！';
        showModal('forfeitModal');
    } else if (msg.type === 'matching') {
        // 重新连接后仍处于匹配排队中：恢复等待界面
        $('waitTitle').textContent = '正在匹配中...';
        $('waitRoomCode').innerHTML = '';
        $('waitDesc').textContent = '正在为你寻找对手，请稍候';
        showModal('waitDialog');
    }
}

function enterGameCountdown(code) {
    if (!code) return;
    // 避免重复进入
    if (multiRoomCode === code && $('view-multi').style.display === 'block') return;
    multiRoomCode = code;
    stopPolling();
    // 显示「即将开始」等待窗，2 秒后自动进入房间
    $('waitTitle').textContent = '对手已加入！';
    $('waitRoomCode').innerHTML = '';
    $('waitDesc').textContent = '即将开始对局...';
    showModal('waitDialog');
    clearTimeout(enterCountdownTimer);
    enterCountdownTimer = setTimeout(() => {
        hideModal('waitDialog');
        enterMultiGame(code);
    }, 2000);
}

function wsSendText(text) {
    try { if (ws && ws.readyState === WebSocket.OPEN) ws.send(text); } catch (e) {}
}

// 心跳：保持连接活跃并探测存活
setInterval(() => { wsSendText(JSON.stringify({ type: 'ping' })); }, 20000);


async function createRoom() {
    if (!requireLogin()) return;
    openMultiSetup('create');
}

// 创建房间（携带类型 / BO 局制 / 难度）
async function doCreateRoom(type, bo, diff) {
    try {
        const res = await fetch('/api/multi/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ player_id: myPlayerId, token: myToken, quiz_type: type, best_of: bo, difficulty: diff })
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
    // WebSocket 会在对手加入时推送「game_started」；此兜底仅在 WS 未联通时启用
    startWaitFallback(code);
}

async function randomMatch() {
    if (!requireLogin()) return;
    openMultiSetup('rank');
}

// 随机匹配（排位）：BO 固定 3，声骸可带难度
async function doRandomMatch(type, diff) {
    diff = diff || 'hard';
    // 先取消可能的排队后重新匹配
    try {
        const res = await fetch('/api/multi/random_match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ player_id: myPlayerId, token: myToken, quiz_type: type, difficulty: diff })
        });
        const data = await res.json();
        if (data.status === 'error') { alert(data.message || '匹配失败'); return; }
        multiRoomCode = data.room_code;
        if (data.in_queue) {
            $('waitTitle').textContent = '正在匹配中...';
            $('waitRoomCode').innerHTML = '';
            $('waitDesc').textContent = '正在为你寻找对手，请稍候';
            showModal('waitDialog');
            // WebSocket 在配对成功时推送「game_started」；兜底仅在 WS 未联通时启用
            startWaitFallback(null);
        } else if (data.room_code) {
            // 本次配对立即完成：双方统一等待 2 秒后进入
            enterGameCountdown(data.room_code);
        } else if (data.already_in_room) {
            hideModal('waitDialog');
            stopPolling();
            enterGameByExistingRoom(data.room_code, data.room_status);
        }
    } catch (e) { alert('无法连接服务器'); }
}

// WebSocket 不可用时的 HTTP 兜底轮询（正常联机时不会触发，仅在 WS 失败时兜底）
function startWaitFallback(codeOrNull) {
    stopPolling();
    multiPollTimer = setInterval(async () => {
        // WS 已就绪：一切交给实时推送，此兜底轮询不再工作
        if (wsReady && wsOpen) return;
        // 随机匹配排队中（尚无 room_code）：周期重询，检查是否配对
        if (!multiRoomCode) {
            try {
                                                                const res = await fetch('/api/multi/random_match', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ player_id: myPlayerId, token: myToken, quiz_type: multiQuizType, difficulty: multiSetupState.diff || 'hard' })
                });
                const data = await res.json();
                if (data.status !== 'success') return;
                if (data.room_code) {
                    multiRoomCode = data.room_code;
                    hideModal('waitDialog');
                    stopPolling();
                    enterGameCountdown(data.room_code);
                    return;
                }
                if (data.already_in_room) {
                    hideModal('waitDialog');
                    stopPolling();
                    enterGameByExistingRoom(data.room_code, data.room_status);
                    return;
                }
            } catch (e) { return; }
            return;
        }
        // 已有房间：检查是否已开始
        const res = await fetch(`/api/multi/room_state?player_id=${encodeURIComponent(myPlayerId)}&room_code=${multiRoomCode}&token=${encodeURIComponent(myToken)}`);
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
            body: JSON.stringify({ player_id: myPlayerId, room_code: multiRoomCode, token: myToken })
        });
    } else {
        // 随机匹配排队中：取消排队
        fetch('/api/multi/cancel_match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ player_id: myPlayerId, token: myToken })
        });
    }
    multiRoomCode = '';
}

// -------------------- 左下角：返回房间按钮 --------------------
async function checkMyRoom() {
    if (!loggedIn || !myPlayerId) {   // 未登录无需检查房间/弃权
        $('btnRoomNav').style.display = 'none';
        myCurrentRoom = null;
        return;
    }
    try {
        // 兜底检查「对手弃权」通知：即使 pollRoom 在轮询竞态中漏掉，
        // 这个每 3 秒运行的检查也能稳定弹出「对手放弃、判定你胜利」提示。
        await checkForfeitNotice();

        const res = await fetch(`/api/multi/my_room?player_id=${encodeURIComponent(myPlayerId)}&token=${encodeURIComponent(myToken)}`);
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
    if (!requireLogin()) return;
    const code = $('joinCodeInput').value.trim().toUpperCase();
    if (!code) { alert('请输入房间号'); return; }
    try {
        const res = await fetch('/api/multi/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ player_id: myPlayerId, room_code: code, token: myToken })
        });
        const data = await res.json();
        if (data.status === 'error') { alert(data.message || '加入失败'); return; }
        hideModal('joinDialog');
        multiRoomCode = data.room_code;
        // 与房主（创建者）同步：等待 2 秒后一同进入对局
        enterGameCountdown(data.room_code);
    } catch (e) { alert('无法连接服务器'); }
}

function leaveMulti() {
    stopPolling();
    stopTimer();
    clearTimeout(enterCountdownTimer);
    hideModal('roundModal');
    hideModal('waitDialog');
    if (multiRoomCode) {
        // 通知服务端离开房间（对战中退出会判负结算并删除房间）
        fetch('/api/multi/leave_room', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ player_id: myPlayerId, room_code: multiRoomCode, token: myToken })
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
    // 先拉取一次最新状态（覆盖进入瞬间的显示）
    pollRoom();
    stopPolling();
    // 不再每秒轮询 —— 实时更新由 WebSocket 推送驱动；
    // 仅保留一个低频兜底（WS 断开时保护，避免界面永久卡住）
    multiPollTimer = setInterval(pollRoomFallback, 4000);
}

async function pollRoomFallback() {
    // WebSocket 已联通时，由推送驱动，兜底轮询不再重复请求
    if (wsReady && wsOpen) return;
    await pollRoom();
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
        const res = await fetch(`/api/multi/room_state?player_id=${encodeURIComponent(myPlayerId)}&room_code=${multiRoomCode}&token=${encodeURIComponent(myToken)}`);
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
        const res = await fetch(`/api/multi/forfeit_notice?player_id=${encodeURIComponent(myPlayerId)}&token=${encodeURIComponent(myToken)}`);
        const data = await res.json();
        if (data.status === 'success' && data.forfeit && !wsForfeitShown) {
            stopPolling();
            wsForfeitShown = true;
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
    wsForfeitShown = false;
    $('btnRoomNav').style.display = 'none';
}

function formatTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

// 客户端本地平滑倒计时：基于服务端提供的「本局开始时刻」逐秒刷新，
// 不依赖网络往返，因此显示不会忽快忽慢，且终局用时仍由服务端权威结算。
function stopTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

function startTimer(data) {
    stopTimer();
    const limit = data.time_limit || 90;
    const roundStart = data.round_start;

    const update = () => {
        let left;
        if (roundStart == null) {
            left = limit;
        } else {
            left = Math.max(0, Math.ceil(limit - (Date.now() / 1000 - roundStart)));
        }
        $('timerBadge').textContent = '⏱ ' + formatTime(left);
        $('timerBadge').classList.toggle('warn', left <= 15);
        if (left <= 0) stopTimer();
    };
    update();
    timerInterval = setInterval(update, 1000);
}

function renderMultiGame(data) {
    multiGameRef = data;
    multiQuizType = data.quiz_type || 'resonator';
    const round = data.round;
    const maxRound = data.best_of;
    const diff = data.difficulty || 'hard';
    const typeName = multiQuizType === 'skeleton' ? '声骸' : '共鸣者';
    const diffName = multiQuizType === 'skeleton' ? (diff === 'easy' ? '·简单' : '·困难') : '';
    $('roundBadge').textContent = `第 ${round} 局 · ${typeName}${diffName} · BO${maxRound || 3}`;

    // 计时器（毫秒级本地平滑倒计时，不再随轮询跳动）
    startTimer(data);

    // 比分（局胜）
    const wins = data.round_wins || [0, 0];
    $('myScoreItem').textContent = `我 ${wins[data.player_index] || 0}`;
    $('oppScoreItem').textContent = `对手 ${wins[1 - (data.player_index)] || 0}`;

    // 对手 ID
    if (data.opponent_id) $('oppIdLabel').textContent = data.opponent_id;

    // 按猜谜类型渲染动态表头
    renderMultiTheads(multiQuizType);

    // 渲染双方表格
    const players = data.players || [];
    const me = players.find(p => p.is_me);
    const opp = players.find(p => !p.is_me);
    // 对战中用 target_version / target_cost 提供升/降方向提示（不泄露完整答案）
    const targetVersion = data.target_version != null ? data.target_version : null;
    const targetCost = data.target_cost != null ? data.target_cost : null;
    renderOppTable(me ? me.guesses : [], 'myTbody', 'myEmptyState', true, targetVersion, targetCost, multiQuizType);
    renderOppTable(opp ? opp.guesses : [], 'oppTbody', 'oppEmptyState', false, targetVersion, targetCost, multiQuizType);

    // 局结束/游戏结束弹窗
    if (data.round_status === 'finished' || data.room_status === 'finished') {
        handleRoundEnd(data);
    } else {
        $('multiGuessInput').disabled = false;
        $('btnMultiGuess').disabled = false;
    }
}

function renderMultiTheads(qtype) {
        let ths;
    if (qtype === 'skeleton') {
        ths = ['序号', '名称', '技能属性', 'COST', '异相', '所属套装', '掉落位置'];
    } else {
        ths = ['序号', '姓名', '属性', '星级', '武器', '出生地', '实装版本'];
    }
    const html = '<tr>' + ths.map(t => `<th>${t}</th>`).join('') + '</tr>';
    const myT = $('myThead');
    const oppT = $('oppThead');
    if (myT) myT.innerHTML = html;
    if (oppT) oppT.innerHTML = html;
}

function renderOppTable(guesses, tbodyId, emptyId, revealed, targetVersion, targetCost, qtype) {
    const tbody = $(tbodyId);
    const empty = $(emptyId);
    tbody.innerHTML = '';
    if (!guesses.length) { empty.style.display = 'block'; return; }
    empty.style.display = 'none';
    // 对手打码时使用 `masked`，自己时显示真实值
    guesses.forEach((rec, idx) => {
        const g = rec.guess, c = rec.compare;
        const tr = document.createElement('tr');
        const masked = !revealed;
        tr.appendChild(makeCell(String(idx + 1), 'rownum'));
                tr.appendChild(makeCell(g.name, masked ? 'masked-cell' : ''));
                if (qtype === 'skeleton') {
            tr.appendChild(renderAttrCell(c.skill_attribute, masked));
            // COST 列：带 ↑/↓ 方向提示（不泄露具体数值但可看到等级）
            let costText = String(g.cost);
            if (revealed && targetCost != null) {
                const gc = parseInt(g.cost, 10), tc = parseInt(targetCost, 10);
                if (gc < tc) costText += ' ↑';
                else if (gc > tc) costText += ' ↓';
            }
            tr.appendChild(makeCell(costText, masked ? 'masked-cell' : '', null, c.cost));
            tr.appendChild(makeCell(g.is_aberration, masked ? 'masked-cell' : '', null, c.is_aberration));
            tr.appendChild(renderSetCell(c.set_name, masked));
            tr.appendChild(renderLocCell(c.drop_location, masked));
        } else {
            tr.appendChild(makeCell(g.attribute, masked ? 'masked-cell' : '', null, c.attribute));
            tr.appendChild(makeCell(revealed ? starStr(g.star_rating) : '***', masked ? 'masked-cell' : '', null, c.star_rating));
            tr.appendChild(makeCell(g.weapon, masked ? 'masked-cell' : '', null, c.weapon));
            tr.appendChild(makeCell(g.birthplace, masked ? 'masked-cell' : '', null, c.birthplace));
            // 版本列：目标可见时显示 ↑/↓ 方向提示
            let verText = revealed ? formatVersion(g.version) : '***';
            if (revealed && targetVersion != null) {
                const gv = parseFloat(g.version), tv = parseFloat(targetVersion);
                if (gv < tv) verText += ' ↑';
                else if (gv > tv) verText += ' ↓';
            }
            tr.appendChild(makeCell(verText, masked ? 'masked-cell' : '', null, c.version));
        }
        tbody.appendChild(tr);
    });
}

let roundModalShown = null;
function handleRoundEnd(data) {
    // 仅弹出一次（避免重复）
    const key = `${data.round}-${data.room_status}`;
    if (roundModalShown === key) return;
    roundModalShown = key;

    // 本局结束：暂停本地倒计时（下一局开始时会由 renderMultiGame 重新拉起）
    stopTimer();
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
        const bo = data.best_of || 3;
        msg = `BO${bo} 最终比分：我 ${wins[myIdx]} : ${wins[1-myIdx]} 对手 · 胜负各 ${data.score ?? 0} 分`;
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
            body: JSON.stringify({ player_id: myPlayerId, room_code: multiRoomCode, token: myToken })
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
            body: JSON.stringify({ player_id: myPlayerId, room_code: multiRoomCode, guess: name, token: myToken })
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
    multiSuggestions = filterSuggestions(keyword, multiQuizType);
    multiActive = -1;
    if (!multiSuggestions.length) { hideMultiSuggestions(); return; }
    list.innerHTML = '';
    multiSuggestions.forEach((item, i) => {
        const div = document.createElement('div');
        div.className = 'ac-item' + (i === multiActive ? ' active' : '');
        if (multiQuizType === 'skeleton') {
            div.innerHTML = `<span class="ac-name">${item.name}</span><span class="ac-attr">${item.set_name || ''}</span><span class="ac-stars">COST${item.cost}</span>`;
        } else {
            div.innerHTML = `<span class="ac-name">${item.name}</span><span class="ac-attr">${item.attribute}</span><span class="ac-stars">${starStr(item.star_rating)}</span>`;
        }
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
            const m = filterSuggestions(this.value.trim(), multiQuizType);
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
