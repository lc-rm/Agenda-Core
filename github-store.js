/* Agenda Core - GitHub Store + Auth
 * Import Core 認証システム仕様 v1 をベースに、
 * Agenda Core 用にカスタマイズ。
 */
(function (global) {
  'use strict';

  // ========== 設定 ==========
  const GITHUB_CONFIG = {
    owner: 'lc-rm',                         // GitHubユーザー名
    repo: 'Agenda-Core-Data',               // Privateデータリポジトリ名
    tasksFile: 'tasks.json',
    usersFile: 'users.json',
    clientsFile: 'clients.json',
    branch: 'main'
  };

  const SUPER_ADMIN_EMAIL = 'r_murai@link-core.co.jp'; // 絶対管理者(村井さん)

  const SHARED_LOGIN_ID = 'a_mukaemura@link-core.co.jp';  // 共有ログインID
  const SHARED_LOGIN_PW = 'lcakira2291';                  // 共有ログインPW

  // localStorage キー
  const LS_KEY_TOKEN = 'agendaCore.github.pat';
  const LS_KEY_OPERATOR = 'agendaCore.operator.email';
  const LS_KEY_SESSION = 'agendaCore.session.unlocked';

  // ========== 内部状態 ==========
  const cache = { tasks: null, users: null, clients: null };

  // ========== localStorage アクセサ ==========
  function getToken() { return localStorage.getItem(LS_KEY_TOKEN); }
  function setToken(t) { localStorage.setItem(LS_KEY_TOKEN, t); }
  function clearToken() { localStorage.removeItem(LS_KEY_TOKEN); }

  function getOperatorEmail() { return localStorage.getItem(LS_KEY_OPERATOR); }
  function setOperatorEmail(e) {
    if (e) localStorage.setItem(LS_KEY_OPERATOR, e);
    else localStorage.removeItem(LS_KEY_OPERATOR);
  }

  function isUnlocked() { return localStorage.getItem(LS_KEY_SESSION) === '1'; }
  function setUnlocked(v) {
    if (v) localStorage.setItem(LS_KEY_SESSION, '1');
    else localStorage.removeItem(LS_KEY_SESSION);
  }

  // ========== Base64 (UTF-8 safe) ==========
  function b64encode(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }
  function b64decode(b64) {
    return decodeURIComponent(escape(atob(b64)));
  }

  // ========== GitHub API ==========
  async function fetchFile(filename) {
    const token = getToken();
    if (!token) throw new Error('NO_TOKEN');

    const url = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${filename}?ref=${GITHUB_CONFIG.branch}`;
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json'
      }
    });
    if (res.status === 401 || res.status === 403) throw new Error('UNAUTHORIZED');
    if (res.status === 404) throw new Error('NOT_FOUND');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const content = JSON.parse(b64decode(json.content.replace(/\s/g, '')));
    return { content, sha: json.sha };
  }

  async function saveFile(filename, content, oldSha, message) {
    const token = getToken();
    if (!token) throw new Error('NO_TOKEN');

    const url = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${filename}`;
    const body = {
      message: message || `Update ${filename}`,
      content: b64encode(JSON.stringify(content, null, 2)),
      sha: oldSha,
      branch: GITHUB_CONFIG.branch
    };
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (res.status === 409) throw new Error('SHA_CONFLICT');
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    const json = await res.json();
    return { sha: json.content.sha };
  }

  // ========== キャッシュ + リトライ付きデータ操作 ==========
  async function loadTasks(forceRefresh) {
    if (!forceRefresh && cache.tasks) return cache.tasks.content;
    try {
      const result = await fetchFile(GITHUB_CONFIG.tasksFile);
      cache.tasks = result;
      return result.content;
    } catch (e) {
      if (e.message === 'NOT_FOUND') {
        // 初回:空のtasks.jsonを作る
        const initial = { tasks: [], version: 1 };
        const url = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.tasksFile}`;
        const res = await fetch(url, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${getToken()}`,
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: 'Initialize tasks.json',
            content: b64encode(JSON.stringify(initial, null, 2)),
            branch: GITHUB_CONFIG.branch
          })
        });
        if (!res.ok) throw new Error(`Init failed: HTTP ${res.status}`);
        const json = await res.json();
        cache.tasks = { content: initial, sha: json.content.sha };
        return initial;
      }
      throw e;
    }
  }

  async function loadUsers(forceRefresh) {
    if (!forceRefresh && cache.users) return cache.users.content;
    const result = await fetchFile(GITHUB_CONFIG.usersFile);
    cache.users = result;
    return result.content;
  }

  async function loadClients(forceRefresh) {
    if (!forceRefresh && cache.clients) return cache.clients.content;
    try {
      const result = await fetchFile(GITHUB_CONFIG.clientsFile);
      cache.clients = result;
      return result.content;
    } catch (e) {
      if (e.message === 'NOT_FOUND') {
        // 初回:空のclients.jsonを作る
        const initial = { clients: [], version: 1 };
        const url = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.clientsFile}`;
        const res = await fetch(url, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${getToken()}`,
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: 'Initialize clients.json',
            content: b64encode(JSON.stringify(initial, null, 2)),
            branch: GITHUB_CONFIG.branch
          })
        });
        if (!res.ok) throw new Error(`Init failed: HTTP ${res.status}`);
        const json = await res.json();
        cache.clients = { content: initial, sha: json.content.sha };
        return initial;
      }
      throw e;
    }
  }

  async function updateTasks(mutator, msg) {
    if (!cache.tasks) await loadTasks();
    let attempts = 0;
    while (attempts < 2) {
      attempts++;
      const newContent = mutator(JSON.parse(JSON.stringify(cache.tasks.content)));
      newContent.lastModifiedAt = new Date().toISOString();
      newContent.lastModifiedBy = getCurrentUserDisplayName() || 'unknown';
      try {
        const { sha } = await saveFile(GITHUB_CONFIG.tasksFile, newContent, cache.tasks.sha, msg);
        cache.tasks = { content: newContent, sha };
        return newContent;
      } catch (e) {
        if (e.message === 'SHA_CONFLICT' && attempts < 2) {
          await loadTasks(true);
          continue;
        }
        throw e;
      }
    }
  }

  async function updateUsers(mutator, msg) {
    if (!cache.users) await loadUsers();
    let attempts = 0;
    while (attempts < 2) {
      attempts++;
      const newContent = mutator(JSON.parse(JSON.stringify(cache.users.content)));
      try {
        const { sha } = await saveFile(GITHUB_CONFIG.usersFile, newContent, cache.users.sha, msg);
        cache.users = { content: newContent, sha };
        return newContent;
      } catch (e) {
        if (e.message === 'SHA_CONFLICT' && attempts < 2) {
          await loadUsers(true);
          continue;
        }
        throw e;
      }
    }
  }

  async function updateClients(mutator, msg) {
    if (!cache.clients) await loadClients();
    let attempts = 0;
    while (attempts < 2) {
      attempts++;
      const newContent = mutator(JSON.parse(JSON.stringify(cache.clients.content)));
      newContent.lastModifiedAt = new Date().toISOString();
      newContent.lastModifiedBy = getCurrentUserDisplayName() || 'unknown';
      try {
        const { sha } = await saveFile(GITHUB_CONFIG.clientsFile, newContent, cache.clients.sha, msg);
        cache.clients = { content: newContent, sha };
        return newContent;
      } catch (e) {
        if (e.message === 'SHA_CONFLICT' && attempts < 2) {
          await loadClients(true);
          continue;
        }
        throw e;
      }
    }
  }

  // ========== 認証 ==========
  async function authenticate(token) {
    setToken(token);
    try {
      await loadUsers(true);
      return true;
    } catch (e) {
      clearToken();
      throw e;
    }
  }

  function logout() {
    clearToken();
    setOperatorEmail(null);
    setUnlocked(false);
    cache.tasks = null;
    cache.users = null;
  }

  function softLogout() {
    // PATは保持、セッションロックと担当者選択だけクリア
    setOperatorEmail(null);
    setUnlocked(false);
  }

  function checkSharedCredentials(id, pw) {
    return id === SHARED_LOGIN_ID && pw === SHARED_LOGIN_PW;
  }

  function getCurrentUserDisplayName() {
    const email = getOperatorEmail();
    if (!email) return null;
    if (!cache.users) return email;
    const user = (cache.users.content.users || []).find(u => u.email === email);
    return user ? user.displayName : email;
  }

  function getCurrentUserRole() {
    const email = getOperatorEmail();
    if (!email) return null;
    if (email === SUPER_ADMIN_EMAIL) return 'super_admin';
    if (!cache.users) return null;
    const user = (cache.users.content.users || []).find(u => u.email === email);
    return user ? user.role : null;
  }

  function isLoggedIn() {
    return !!getToken() && !!getOperatorEmail() && isUnlocked();
  }

  function isSuperAdmin() { return getCurrentUserRole() === 'super_admin'; }
  function isAdmin() {
    const r = getCurrentUserRole();
    return r === 'super_admin' || r === 'admin';
  }

  async function selectOperator(email) {
    if (!cache.users) await loadUsers();
    const user = (cache.users.content.users || []).find(u => u.email === email);
    if (!user && email !== SUPER_ADMIN_EMAIL) {
      throw new Error('該当する担当者が見つかりません');
    }
    setOperatorEmail(email);
    return user;
  }

  // ========== 担当者管理 ==========
  async function loadUserList() {
    const users = await loadUsers();
    return users.users || [];
  }

  async function addUser({ email, displayName, role }) {
    if (!email || !displayName) throw new Error('氏名とメールアドレスは必須です');
    return updateUsers(content => {
      const users = content.users || [];
      if (users.some(u => u.email === email)) {
        throw new Error('このメールアドレスは既に登録されています');
      }
      users.push({
        email,
        displayName,
        role: role || 'member',
        addedAt: new Date().toISOString(),
        addedBy: getCurrentUserDisplayName() || 'unknown'
      });
      content.users = users;
      return content;
    }, `Add user: ${email}`);
  }

  async function deleteUser(email) {
    if (email === SUPER_ADMIN_EMAIL) throw new Error('絶対管理者は削除できません');
    return updateUsers(content => {
      content.users = (content.users || []).filter(u => u.email !== email);
      return content;
    }, `Delete user: ${email}`);
  }

  async function updateUserRole(email, newRole) {
    if (email === SUPER_ADMIN_EMAIL) throw new Error('絶対管理者の権限は変更できません');
    return updateUsers(content => {
      const u = (content.users || []).find(x => x.email === email);
      if (!u) throw new Error('該当する担当者が見つかりません');
      u.role = newRole;
      return content;
    }, `Change role: ${email} -> ${newRole}`);
  }

  // ========== クライアント操作 ==========
  function genClientId() {
    return 'client_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  async function loadClientList() {
    const data = await loadClients();
    return (data.clients || []).filter(c => !c.deleted);
  }

  async function addClient(name) {
    const trimmed = (name || '').trim();
    if (!trimmed) throw new Error('クライアント名を入力してください');
    const me = getCurrentUserDisplayName() || 'unknown';
    let createdClient = null;
    await updateClients(content => {
      content.clients = content.clients || [];
      // 同名(削除済み含む)があれば、既存を返す or 復活させる
      const existing = content.clients.find(c => c.name === trimmed);
      if (existing) {
        if (existing.deleted) {
          existing.deleted = false;
          existing.updatedAt = new Date().toISOString();
          existing.updatedBy = me;
        }
        createdClient = existing;
        return content;
      }
      const newClient = {
        id: genClientId(),
        name: trimmed,
        createdAt: new Date().toISOString(),
        createdBy: me
      };
      content.clients.push(newClient);
      createdClient = newClient;
      return content;
    }, `Add client: ${trimmed}`);
    return createdClient;
  }

  async function updateClient(id, newName) {
    const trimmed = (newName || '').trim();
    if (!trimmed) throw new Error('クライアント名を入力してください');
    const me = getCurrentUserDisplayName() || 'unknown';
    return updateClients(content => {
      const c = (content.clients || []).find(x => x.id === id);
      if (!c) throw new Error('該当クライアントが見つかりません');
      c.name = trimmed;
      c.updatedAt = new Date().toISOString();
      c.updatedBy = me;
      return content;
    }, `Update client: ${id} -> ${trimmed}`);
  }

  async function deleteClient(id) {
    return updateClients(content => {
      const c = (content.clients || []).find(x => x.id === id);
      if (!c) throw new Error('該当クライアントが見つかりません');
      // 論理削除(タスク側のclientId参照を生かすため)
      c.deleted = true;
      c.deletedAt = new Date().toISOString();
      return content;
    }, `Delete client: ${id}`);
  }

  // ========== タスク操作 ==========
  function genTaskId() {
    return 'task_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  async function loadTaskList() {
    const data = await loadTasks();
    return data.tasks || [];
  }

  async function addTask(taskData) {
    const now = new Date().toISOString();
    const me = getCurrentUserDisplayName() || 'unknown';
    const task = {
      id: genTaskId(),
      chatworkUrl: taskData.chatworkUrl || '',
      summary: taskData.summary || '',
      details: taskData.details || '',
      deadline: taskData.deadline || '',
      status: taskData.status || '未着手',
      assignee: taskData.assignee || '向江村 章',
      clientId: taskData.clientId || '',
      memos: [],
      createdAt: now,
      createdBy: me,
      updatedAt: now,
      updatedBy: me
    };
    await updateTasks(content => {
      content.tasks = content.tasks || [];
      content.tasks.unshift(task);
      return content;
    }, `Add task: ${task.summary || task.id}`);
    return task;
  }

  async function updateTask(id, patch) {
    const me = getCurrentUserDisplayName() || 'unknown';
    return updateTasks(content => {
      const t = (content.tasks || []).find(x => x.id === id);
      if (!t) throw new Error('該当タスクが見つかりません');
      Object.assign(t, patch);
      t.updatedAt = new Date().toISOString();
      t.updatedBy = me;
      return content;
    }, `Update task: ${id}`);
  }

  async function deleteTask(id) {
    return updateTasks(content => {
      content.tasks = (content.tasks || []).filter(x => x.id !== id);
      return content;
    }, `Delete task: ${id}`);
  }

  async function addMemo(id, text) {
    const me = getCurrentUserDisplayName() || 'unknown';
    return updateTasks(content => {
      const t = (content.tasks || []).find(x => x.id === id);
      if (!t) throw new Error('該当タスクが見つかりません');
      t.memos = t.memos || [];
      t.memos.push({
        at: new Date().toISOString(),
        by: me,
        text: text
      });
      t.updatedAt = new Date().toISOString();
      t.updatedBy = me;
      return content;
    }, `Add memo: ${id}`);
  }

  // ========== 互換 Auth API ==========
  const Auth = {
    requireLogin() {
      if (!isLoggedIn()) {
        window.location.href = 'login.html';
        return false;
      }
      return true;
    },
    requireSetup() {
      if (!getToken()) {
        document.body.innerHTML = `
          <div class="auth-screen">
            <div class="auth-card">
              <div class="auth-brand">
                <img src="assets/koala-cheer.png" alt="" class="koala auth-koala">
                <h1 class="auth-brand-title">Agenda Core</h1>
              </div>
              <div class="alert alert-error">初期設定が完了していません。管理者から「初期設定リンク」を受け取り、開いてください。</div>
            </div>
          </div>`;
        return false;
      }
      return true;
    },
    requireAdmin() {
      if (!isAdmin()) {
        alert('管理者権限が必要です');
        window.location.href = 'index.html';
        return false;
      }
      return true;
    },
    getCurrentUserId: getOperatorEmail,
    clearSession: logout
  };

  // ========== 公開 ==========
  global.AgendaStore = {
    // 設定情報の参照
    config: GITHUB_CONFIG,
    SUPER_ADMIN_EMAIL,
    LS_KEY_TOKEN,

    // 認証
    authenticate, logout, softLogout, isLoggedIn,
    checkSharedCredentials,
    setUnlocked, isUnlocked,
    getCurrentUserId: getOperatorEmail,
    getCurrentUserDisplayName,
    getCurrentUserRole,
    isSuperAdmin, isAdmin,
    selectOperator,

    // 担当者
    loadUserList, addUser, deleteUser, updateUserRole,

    // クライアント
    loadClients, loadClientList, addClient, updateClient, deleteClient,

    // タスク
    loadTaskList, addTask, updateTask, deleteTask, addMemo,

    // 低レベル
    loadUsers, loadTasks, fetchFile, saveFile,
    getToken, setToken
  };
  global.Auth = Auth;

})(window);
