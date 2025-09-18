let db;
let auth;
let currentUser = null;
let selectedFolderId = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', function () {
  initFirebase();
  setupEventListeners();
  processUrlParams();
  createFloatingSaveButton();
});

/**
 * Initialize Firebase + Auth state handling
 */
function initFirebase() {
  firebase.initializeApp(window.projectConfig);
  db = firebase.firestore();
  auth = firebase.auth();

  auth.onAuthStateChanged((user) => {
    currentUser = user;
    console.log('Share page auth state:', user ? `signed in as ${user.email || user.uid}` : 'signed out');
    updateAuthUI(!!user);

    if (user) {
      renderFolderList();
    } else {
      // Signed out UI
      const container = document.getElementById('folderList');
      if (container) container.innerHTML = '<div class="empty-state">Sign in to select a folder</div>';
      selectedFolderId = null;
    }
  });

  // Surface redirect-based sign-in results
  auth.getRedirectResult()
    .then((res) => {
      if (res && res.user) {
        console.log('Share page redirect sign-in success for', res.user.email || res.user.uid);
      }
    })
    .catch((err) => {
      if (err) {
        console.error('Share page redirect sign-in error:', err);
        alert('Sign-in failed: ' + (err.message || err.code || 'Unknown error'));
      }
    });
}

/**
 * UI helpers for auth visibility
 */
function updateAuthUI(isSignedIn) {
  const signInBtn = document.getElementById('googleSignInBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const addFolderBtn = document.getElementById('addFolderBtn');
  const form = document.getElementById('form');

  if (signInBtn) signInBtn.style.display = isSignedIn ? 'none' : 'inline-block';
  if (logoutBtn) {
    logoutBtn.style.display = isSignedIn ? 'inline-block' : 'none';
    logoutBtn.textContent = 'Sign out';
  }
  if (addFolderBtn) addFolderBtn.style.display = isSignedIn ? 'inline-block' : 'none';

  // Disable form inputs when signed out
  if (form) {
    const disabled = !isSignedIn;
    Array.from(form.querySelectorAll('input, textarea, button')).forEach(el => {
      if (el.id === 'url' || el.id === 'title' || el.id === 'desc') {
        el.disabled = disabled;
      }
      // Keep floating save button enabled to show feedback, we handle in saveBookmark
    });
  }
}

async function signIn() {
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    // Try popup first
    await auth.signInWithPopup(provider);
  } catch (err) {
    console.warn('Popup sign-in failed on share page, falling back to redirect...', err && err.code);
    await auth.signInWithRedirect(provider);
  }
}

async function signOut() {
  try {
    await auth.signOut();
  } catch (e) {
    console.error('Sign-out error:', e);
    alert('Sign-out failed');
  }
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  const addFolderBtn = document.getElementById('addFolderBtn');
  if (addFolderBtn) addFolderBtn.addEventListener('click', addFolder);

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', signOut);

  const signInBtn = document.getElementById('googleSignInBtn');
  if (signInBtn) signInBtn.addEventListener('click', signIn);

  const form = document.getElementById('form');
  if (form) form.addEventListener('submit', saveBookmark);
}

/**
 * Create floating save button and attach manual form trigger
 */
function createFloatingSaveButton() {
  const floatingBtn = document.createElement("button");
  floatingBtn.type = "button";
  floatingBtn.className = "floating-save-btn";
  floatingBtn.innerHTML = "<span>💾 Save Bookmark</span>";
  floatingBtn.id = "floatingSaveBtn";

  floatingBtn.addEventListener("click", () => {
    const form = document.getElementById("form");
    if (!currentUser) {
      alert('Sign in to save bookmarks');
      return;
    }
    if (form) form.requestSubmit();
  });

  document.body.appendChild(floatingBtn);
}

/**
 * Returns a collection scoped to current user
 */
function userCol(name) {
  if (!auth || !auth.currentUser) {
    throw new Error('Not authenticated');
  }
  return db.collection('users').doc(auth.currentUser.uid).collection(name);
}

/**
 * Add a new folder
 */
async function addFolder() {
  if (!currentUser) return alert('Sign in first');
  const name = prompt('Folder name?');
  if (!name) return;
  const snap = await userCol('bookmark_secret').add({
    name: name.trim(),
    createdAt: new Date()
  });
  renderFolderList(snap.id);
}

/**
 * Render folder list (per-user)
 */
async function renderFolderList(selectId = null) {
  const container = document.getElementById('folderList');
  if (!container) return;
  container.innerHTML = 'Loading...';
  try {
    const snap = await userCol('bookmark_secret').orderBy('createdAt').get();
    if (snap.empty) {
      container.innerHTML = '<div class="empty-state">No folders</div>';
      selectedFolderId = null;
      return;
    }

    container.innerHTML = '';
    snap.forEach((doc, i) => {
      const btn = document.createElement('div');
      btn.className = 'folder-btn';
      btn.textContent = doc.data().name || 'Unnamed';
      btn.dataset.fid = doc.id;
      btn.onclick = () => {
        document.querySelectorAll('.folder-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedFolderId = doc.id;
      };
      container.appendChild(btn);

      if ((selectId && doc.id === selectId) || (!selectId && i === snap.size - 1)) {
        btn.classList.add('selected');
        selectedFolderId = doc.id;
      }
    });
  } catch (e) {
    console.error(e);
    container.innerHTML = '<div class="error">Error loading folders</div>';
  }
}

/**
 * Process URL parameters and prefill fields
 */
async function processUrlParams() {
  let data = {};
  try {
    const params = new URLSearchParams(location.search);
    data = {
      title: params.get('title') ?? '',
      text: params.get('text') ?? '',
      url: params.get('url') ?? ''
    };
  } catch {
    data = {};
  }

  if ((!data.url || data.url.trim() === '') && data.text) {
    const m = data.text.match(/https?:\/\/[^\s]+/);
    if (m) {
      data.url = m[0];
      data.text = data.text.replace(m[0], '').trim();
    }
  }

  document.getElementById('url').value = data.url ?? '';

  let meta = { title: '', description: '', image: '' };
  if (data.url) {
    meta = await fetchPageMeta(data.url);
    if (!(data.title ?? '').trim()) data.title = meta.title;
  }

  document.getElementById('title').value = data.title ?? '';
  document.getElementById('desc').value = data.text || meta.description || '';

  let ph = data.url ? `<a href="${data.url}" target="_blank">${data.url}</a>` : '';
  if (meta.image) ph = `<img src="${meta.image}">` + ph;
  document.getElementById('linkPreview').innerHTML = ph;
}

/**
 * Fetch page metadata
 */
async function fetchPageMeta(url) {
  try {
    const resp = await fetch(url, { mode: 'cors' });
    const html = await resp.text();
    const titleTag = (html.match(/<title.*?>(.*?)<\/title>/is) || ['', ''])[1].trim();
    const ogTitle = (html.match(/property=["']og:title["'] content=["']([^"']+)/i) || ['', ''])[1];
    const ogDesc = (html.match(/property=["']og:description["'] content=["']([^"']+)/i) || ['', ''])[1];
    const ogImg = (html.match(/property=["']og:image["'] content=["']([^"']+)/i) || ['', ''])[1];
    return { title: ogTitle || titleTag, description: ogDesc, image: ogImg };
  } catch {
    return { title: '', description: '', image: '' };
  }
}

/**
 * Save bookmark under selected folder (per-user)
 */
async function saveBookmark(e) {
  e.preventDefault();

  if (!currentUser) {
    alert('Sign in to save bookmarks');
    return;
  }

  if (!selectedFolderId) {
    alert('Select a folder');
    return;
  }

  const url = document.getElementById('url').value.trim();
  const title = document.getElementById('title').value.trim();
  const desc = document.getElementById('desc').value.trim();

  try {
    const meta = await fetchPageMeta(url);

    await userCol('bookmark_secret').doc(selectedFolderId).collection('links').add({
      url,
      title: title || meta.title || url,
      description: desc || meta.description || '',
      thumbnail: meta.image || '',
      createdAt: new Date()
    });

    alert('Bookmark saved!');
    window.location.href = '/';
  } catch (e) {
    console.error('Error saving bookmark:', e);
    alert('Error saving bookmark');
  }
}
