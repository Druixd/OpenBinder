let db;
let auth;
let currentUser = null;
let currentFolderId = null;
let isArchiveMode = false;


document.addEventListener('DOMContentLoaded', () => {
  console.log('[index] DOMContentLoaded');
  // Remove legacy master-code gate and rely on Firebase Auth instead
  initFirebase();
  setupEventListeners();
  registerServiceWorker();
  // loadFolders() will be called after auth state becomes ready
});

/**
 * Firebase init + Auth state
 */
function initFirebase() {
  if (!window.firebase) {
    console.error('[index] Firebase SDK not loaded');
    alert('Firebase SDK failed to load. Check network/dev server.');
    return;
  }
  if (!window.projectConfig || !window.projectConfig.apiKey) {
    console.error('[index] Missing window.projectConfig');
    alert('Missing Firebase config (public/config.js). Update window.projectConfig.');
    return;
  }

  if (!firebase.apps || firebase.apps.length === 0) {
    console.log('[index] Initializing Firebase app');
    firebase.initializeApp(window.projectConfig);
  } else {
    console.log('[index] Reusing existing Firebase app');
  }

  db = firebase.firestore();
  auth = firebase.auth();

  auth.onAuthStateChanged((user) => {
    currentUser = user;
    console.log('Auth state:', user ? `signed in as ${user.email || user.uid}` : 'signed out');
    updateAuthUI(!!user);

    if (user) {
      // When signed in, load folders for this user
      document.body.classList.add('signed-in');
      loadFolders();
    } else {
      // Clear content when signed out
      document.body.classList.remove('signed-in');
      const foldersCont = document.getElementById('folders');
      const bookmarksCont = document.getElementById('bookmarks');
      const folderTitle = document.getElementById('folderTitle');
      if (foldersCont) foldersCont.innerHTML = '<div class="empty-state">Sign in to view folders</div>';
      if (bookmarksCont) bookmarksCont.innerHTML = '<div class="empty-state">Sign in to view bookmarks</div>';
      if (folderTitle) folderTitle.textContent = '';
      currentFolderId = null;
    }
  });

  // Surface any redirect-based sign-in result/errors
  auth.getRedirectResult()
    .then((res) => {
      if (res && res.user) {
        console.log('Redirect sign-in success for', res.user.email || res.user.uid);
      }
    })
    .catch((err) => {
      if (err) {
        console.error('Redirect sign-in error:', err);
        alert('Sign-in failed: ' + (err.message || err.code || 'Unknown error'));
      }
    });
}

/**
 * UI helpers for auth
 */
function updateAuthUI(isSignedIn) {
  const logoutBtn = document.getElementById('logoutBtn');
  const addFolderBtn = document.getElementById('addFolderBtn');
  const addNewBtn = document.getElementById('addNewBtn');
  const backupBtn = document.getElementById('backupBtn');
  const restoreBtn = document.getElementById('restoreBtn');
  const archiveBtn = document.getElementById('archiveBtn');
  const userInfo = document.getElementById('userInfo');
  const signInBtn = document.getElementById('googleSignInBtn');

  // Update body class for CSS styling
  if (isSignedIn) {
    document.body.classList.add('signed-in');
  } else {
    document.body.classList.remove('signed-in');
  }

  // Show/hide sign-in button
  if (signInBtn) {
    signInBtn.style.display = isSignedIn ? 'none' : 'flex';
  }

  if (logoutBtn) {
    logoutBtn.style.display = isSignedIn ? 'block' : 'none';
  }

  // Hide actions that require a user
  const onOff = isSignedIn ? 'block' : 'none';
  if (addFolderBtn) addFolderBtn.style.display = onOff;
  if (addNewBtn) addNewBtn.style.display = onOff;
  if (backupBtn) backupBtn.style.display = onOff;
  if (restoreBtn) restoreBtn.style.display = onOff;
  if (archiveBtn) archiveBtn.style.display = onOff;

  // Show who is signed in
  if (userInfo) {
    if (isSignedIn && auth && auth.currentUser) {
      const u = auth.currentUser;
      const email = u.email || u.uid;
      // Extract username from email (part before @)
      const username = email.includes('@') ? email.split('@')[0] : email;
      const photo = u.photoURL ? `<img src="${u.photoURL}" alt="" style="width:18px;height:18px;border-radius:50%;vertical-align:middle;margin-right:6px">` : '';
      userInfo.innerHTML = `${photo}<span>${escapeHtml(username)}</span>`;
      userInfo.style.display = 'block';
    } else {
      userInfo.textContent = '';
      userInfo.style.display = 'none';
    }
  }
}

async function signIn() {
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    // Try popup first for faster UX
    await auth.signInWithPopup(provider);
  } catch (err) {
    console.warn('Popup sign-in failed, falling back to redirect...', err && err.code);
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

function showFolderModal() {
  const modal = document.getElementById('folderModal');
  const folderNameInput = document.getElementById('folderName');
  const createBtn = document.getElementById('createFolderBtn');

  if (modal && folderNameInput && createBtn) {
    // Reset form
    folderNameInput.value = '';
    createBtn.disabled = true;

    // Show modal
    modal.style.display = 'flex';
  }
}

function hideFolderModal() {
  const modal = document.getElementById('folderModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

function updateCreateButton() {
  const folderNameInput = document.getElementById('folderName');
  const createBtn = document.getElementById('createFolderBtn');

  if (folderNameInput && createBtn) {
    const hasName = folderNameInput.value.trim().length > 0;
    createBtn.disabled = !hasName;
  }
}


/**
 * Event listeners
 */
function setupEventListeners() {
  const addFolderBtn = document.getElementById('addFolderBtn');
  if (addFolderBtn) addFolderBtn.onclick = addFolder;

  const addNewBtn = document.getElementById('addNewBtn');
  if (addNewBtn) addNewBtn.onclick = () => location.href = 'share.html';

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.onclick = signOut;

  const signInBtn = document.getElementById('googleSignInBtn');
  if (signInBtn) signInBtn.onclick = signIn;

  // Modal event listeners
  const closeModalBtn = document.getElementById('closeModalBtn');
  if (closeModalBtn) closeModalBtn.onclick = hideModal;

  // Backup/Restore event listeners (desktop)
  const backupBtn = document.getElementById('backupBtn');
  if (backupBtn) backupBtn.onclick = backupData;

  const restoreBtn = document.getElementById('restoreBtn');
  if (restoreBtn) restoreBtn.onclick = () => document.getElementById('restoreFileInput').click();

  // Backup/Restore (mobile popup)
  const mobileBackupBtn = document.getElementById('mobileBackupBtn');
  if (mobileBackupBtn) mobileBackupBtn.onclick = backupData;

  const mobileRestoreBtn = document.getElementById('mobileRestoreBtn');
  if (mobileRestoreBtn) mobileRestoreBtn.onclick = () => document.getElementById('restoreFileInput').click();

  const restoreFileInput = document.getElementById('restoreFileInput');
  if (restoreFileInput) restoreFileInput.onchange = handleRestoreFile;

  // Archive button event listener
  const archiveBtn = document.getElementById('archiveBtn');
  if (archiveBtn) archiveBtn.onclick = toggleArchiveMode;

  // Close modal when clicking outside
  const modalOverlay = document.getElementById('modalOverlay');
  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        hideModal();
      }
    });
  }

  // Folder modal event listeners
  const closeFolderModalBtn = document.getElementById('closeFolderModalBtn');
  if (closeFolderModalBtn) closeFolderModalBtn.onclick = hideFolderModal;

  const cancelFolderBtn = document.getElementById('cancelFolderBtn');
  if (cancelFolderBtn) cancelFolderBtn.onclick = hideFolderModal;

  const createFolderBtn = document.getElementById('createFolderBtn');
  if (createFolderBtn) createFolderBtn.onclick = createFolder;

  const folderNameInput = document.getElementById('folderName');
  if (folderNameInput) {
    folderNameInput.addEventListener('input', updateCreateButton);
    folderNameInput.addEventListener('keyup', (e) => {
      if (e.key === 'Enter' && !createFolderBtn.disabled) {
        createFolder();
      }
    });
  }

  // Close folder modal when clicking outside
  const folderModal = document.getElementById('folderModal');
  if (folderModal) {
    folderModal.addEventListener('click', (e) => {
      if (e.target === folderModal) {
        hideFolderModal();
      }
    });
  }

  // Mobile: Toggle profile actions popup when tapping username
  const userInfoEl = document.getElementById('userInfo');
  const mobileMenu = document.getElementById('mobileActionsMenu');
  if (userInfoEl && mobileMenu) {
    const isMobile = () => window.matchMedia('(max-width: 768px)').matches;

    const onUserClick = (e) => {
      if (!isMobile()) return; // disable on desktop
      e.stopPropagation();
      mobileMenu.classList.toggle('open');
    };
    const onMenuClick = (e) => e.stopPropagation();
    const onDocClick = () => mobileMenu.classList.remove('open');
    const onKey = (e) => { if (e.key === 'Escape') mobileMenu.classList.remove('open'); };

    // Bind once
    userInfoEl.addEventListener('click', onUserClick);
    mobileMenu.addEventListener('click', onMenuClick);
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKey);

    // Also ensure menu closes if switching to desktop
    window.addEventListener('resize', () => {
      if (!isMobile()) {
        mobileMenu.classList.remove('open');
      }
    });
  }

  // Mobile: small sticky add-folder button
  const addFolderFabMobile = document.getElementById('addFolderFabMobile');
  if (addFolderFabMobile) addFolderFabMobile.onclick = addFolder;
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

function toggleArchiveMode() {
  isArchiveMode = !isArchiveMode;
  const app = document.querySelector('.app');
  const archiveBtn = document.getElementById('archiveBtn');

  if (isArchiveMode) {
    app.classList.add('archive-mode');
    if (archiveBtn) {
      archiveBtn.classList.add('active');
      archiveBtn.innerHTML = '📁'; // Switch to regular folder icon
    }
    const h2 = document.querySelector('.sidebar h2');
    if (h2) h2.textContent = 'Archive Folders';
  } else {
    app.classList.remove('archive-mode');
    if (archiveBtn) {
      archiveBtn.classList.remove('active');
      archiveBtn.innerHTML = '📦'; // Archive icon
    }
    const h2 = document.querySelector('.sidebar h2');
    if (h2) h2.textContent = 'Folders';
  }

  // Save archive mode state
  localStorage.setItem('archive_mode', isArchiveMode);

  // Reload folders for the current mode
  loadFolders();
}

async function addFolder() {
  if (!currentUser) return alert('Sign in first');
  showFolderModal();
}

async function createFolder() {
  const folderNameInput = document.getElementById('folderName');
  const name = folderNameInput ? folderNameInput.value.trim() : '';

  if (!name) return;

  const colName = isArchiveMode ? 'bookmark_archive' : 'bookmark_secret';
  const docRef = await userCol(colName).add({
    name: name.trim(),
    createdAt: new Date()
  });

  // Select newly created folder
  hideFolderModal();
  saveLastOpenedFolder(docRef.id);
  loadFolders(docRef.id);
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', { scope: './' })
        .then(registration => {
          console.log('Service Worker registered successfully with scope:', registration.scope);
          registration.update();

          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            console.log('New service worker installing');

            newWorker.addEventListener('statechange', () => {
              console.log('Service worker state:', newWorker.state);
            });
          });
        })
        .catch(error => {
          console.error('Service Worker registration failed:', error);
        });

      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        console.log('New service worker controller, reloading page');
        window.location.reload();
      });
    });
  }
}

function saveLastOpenedFolder(folderId) {
  if (folderId) {
    const key = isArchiveMode ? 'last_archive_folder_id' : 'last_folder_id';
    localStorage.setItem(key, folderId);
  }
}

function getLastOpenedFolder() {
  const key = isArchiveMode ? 'last_archive_folder_id' : 'last_folder_id';
  return localStorage.getItem(key);
}

async function loadFolders(selectId = null) {
  const cont = document.getElementById('folders');
  if (!cont) return;

  // Preserve the mobile Add FAB if present while showing loading state
  const existingFab = document.getElementById('addFolderFabMobile');
  cont.innerHTML = '';
  if (existingFab) cont.appendChild(existingFab);
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'loading';
  loadingDiv.textContent = 'Loading...';
  cont.appendChild(loadingDiv);

  // Restore archive mode state
  const savedArchiveMode = localStorage.getItem('archive_mode') === 'true';
  if (savedArchiveMode !== isArchiveMode) {
    isArchiveMode = savedArchiveMode;
    const app = document.querySelector('.app');
    const archiveBtn = document.getElementById('archiveBtn');

    if (isArchiveMode) {
      app.classList.add('archive-mode');
      if (archiveBtn) {
        archiveBtn.classList.add('active');
        archiveBtn.innerHTML = '📁';
      }
      const h2 = document.querySelector('.sidebar h2');
      if (h2) h2.textContent = 'Archive Folders';
    } else {
      app.classList.remove('archive-mode');
      if (archiveBtn) {
        archiveBtn.classList.remove('active');
        archiveBtn.innerHTML = '📦';
      }
      const h2 = document.querySelector('.sidebar h2');
      if (h2) h2.textContent = 'Folders';
    }
  }

  if (!selectId) {
    selectId = getLastOpenedFolder();
  }

  try {
    const colName = isArchiveMode ? 'bookmark_archive' : 'bookmark_secret';
    const snap = await userCol(colName).orderBy('createdAt').get();

    if (snap.empty) {
      const emptyMessage = isArchiveMode ? 'No archived folders' : 'No folders';
      const fab = document.getElementById('addFolderFabMobile');
      cont.innerHTML = '';
      if (fab) cont.appendChild(fab);
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = emptyMessage;
      cont.appendChild(empty);

      document.getElementById('folderTitle').textContent = '';
      document.getElementById('bookmarks').innerHTML = '<div class="empty-state">Create a folder first</div>';
      return;
    }

    // Clear but keep the mobile Add FAB at the start
    const fabForList = document.getElementById('addFolderFabMobile');
    cont.innerHTML = '';
    if (fabForList) cont.appendChild(fabForList);

    let foundSelectedFolder = false;

    snap.forEach((doc, idx) => {
      const folderData = doc.data();
      const btn = document.createElement('button');
      btn.textContent = folderData.name || 'Unnamed';

      btn.onclick = () => {
        document.querySelectorAll('.folder-strip button').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        document.getElementById('folderTitle').textContent = btn.textContent;
        currentFolderId = doc.id;
        saveLastOpenedFolder(doc.id);
        loadBookmarks(doc.id);
      };
      cont.appendChild(btn);

      if ((selectId && doc.id === selectId) || (!selectId && idx === 0)) {
        btn.classList.add('selected');
        document.getElementById('folderTitle').textContent = btn.textContent;
        currentFolderId = doc.id;
        loadBookmarks(doc.id);
        saveLastOpenedFolder(doc.id);
        foundSelectedFolder = true;
      }
    });

    if (selectId && !foundSelectedFolder && snap.size > 0) {
      const firstFolder = cont.querySelector('button');
      if (firstFolder) {
        firstFolder.classList.add('selected');
        document.getElementById('folderTitle').textContent = firstFolder.textContent;
        currentFolderId = snap.docs[0].id;
        loadBookmarks(currentFolderId);
        saveLastOpenedFolder(currentFolderId);
      }
    }
  } catch (err) {
    console.error(err);
    cont.innerHTML = '<div class="error">Error loading folders</div>';
  }
}

async function loadBookmarks(fid) {
  const cont = document.getElementById('bookmarks');
  if (!cont) return;
  cont.innerHTML = '<div class="loading">Loading...</div>';

  try {
    const colName = isArchiveMode ? 'bookmark_archive' : 'bookmark_secret';
    const snap = await userCol(colName).doc(fid).collection('links').orderBy('createdAt', 'desc').get();

    if (snap.empty) {
      const emptyMessage = isArchiveMode ? 'No archived bookmarks in this folder yet' : 'No bookmarks in this folder yet';
      cont.innerHTML = `<div class="empty-state">${emptyMessage}</div>`;
      return;
    }

    cont.innerHTML = '';
    snap.forEach(doc => {
      const d = doc.data();
      const fallbackIcon = `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(d.url)}`;
      const img = `<img src="${d.thumbnail || fallbackIcon}" 
                     onerror="this.onerror=null;this.src='${fallbackIcon}'" alt="">`;
      const safeDesc = d.description ? escapeHtml(d.description) : '';
      const safeTitle = escapeHtml(d.title || '');
      const safeUrl = escapeAttribute(d.url || '');

      const card = document.createElement('div');
      card.className = 'row';

      // Different actions for archive vs regular mode
      const actionButtons = isArchiveMode ? 
        `<button onclick="deleteBookmark('${fid}','${doc.id}')" title="Delete permanently">
           <span class="material-symbols-outlined">delete_forever</span>
         </button>
         <button onclick="unarchiveBookmark('${fid}','${doc.id}')" class="unarchive-btn" title="Restore">
           <span class="material-symbols-outlined">unarchive</span>
         </button>` :
        `<button onclick="deleteBookmark('${fid}','${doc.id}')" title="Delete">
           <span class="material-symbols-outlined">delete</span>
         </button>
         <button onclick="archiveBookmark('${fid}','${doc.id}')" class="archive-btn" title="Archive">
           <span class="material-symbols-outlined">archive</span>
         </button>`;

      card.innerHTML = `
        <div class="row-header">
          <div class="row-left">
            ${img}
            <a href="${safeUrl}" target="_blank" class="link-title">${safeTitle || safeUrl}</a>
          </div>
          <div class="actions">
            ${actionButtons}
            <button onclick="showModal('${escapeJs(d.title)}','${escapeJs(d.description)}','${escapeJs(d.url)}')">
              <span class="material-symbols-outlined">open_in_new</span>
            </button>
          </div>
        </div>
        ${safeDesc ? `<div class="row-desc"><p>${safeDesc}</p></div>` : ''}
      `;

      card.addEventListener('click', e => {
        if(e.target.closest('button') || e.target.closest('a')) return;
        showModal(d.title, d.description, d.url);
      });
      cont.appendChild(card);
    });
  } catch (e) {
    console.error(e);
    cont.innerHTML = '<div class="error">Error loading bookmarks</div>';
  }
}

async function archiveBookmark(fid, id) {
  if(!confirm("Archive this bookmark?")) return;

  try {
    // Get the bookmark data
    const bookmarkDoc = await userCol('bookmark_secret').doc(fid).collection('links').doc(id).get();
    const bookmarkData = bookmarkDoc.data();

    // Get the folder data
    const folderDoc = await userCol('bookmark_secret').doc(fid).get();
    const folderData = folderDoc.data();

    // Create or get the archive folder with the same name
    let archiveFolderId;
    const archiveFolderQuery = await userCol('bookmark_archive')
      .where('name', '==', folderData.name)
      .limit(1)
      .get();

    if (archiveFolderQuery.empty) {
      // Create new archive folder
      const newArchiveFolder = await userCol('bookmark_archive').add({
        name: folderData.name,
        createdAt: folderData.createdAt || new Date()
      });
      archiveFolderId = newArchiveFolder.id;
    } else {
      archiveFolderId = archiveFolderQuery.docs[0].id;
    }

    // Add bookmark to archive
    await userCol('bookmark_archive').doc(archiveFolderId).collection('links').add({
      ...bookmarkData,
      archivedAt: new Date()
    });

    // Delete from original location
    await userCol('bookmark_secret').doc(fid).collection('links').doc(id).delete();

    // Reload current view
    loadBookmarks(fid);
  } catch(err) {
    console.error(err);
    alert("Error archiving bookmark");
  }
}

async function unarchiveBookmark(fid, id) {
  if(!confirm("Restore this bookmark?")) return;

  try {
    // Get the bookmark data
    const bookmarkDoc = await userCol('bookmark_archive').doc(fid).collection('links').doc(id).get();
    const bookmarkData = bookmarkDoc.data();

    // Get the archive folder data
    const folderDoc = await userCol('bookmark_archive').doc(fid).get();
    const folderData = folderDoc.data();

    // Create or get the regular folder with the same name
    let regularFolderId;
    const regularFolderQuery = await userCol('bookmark_secret')
      .where('name', '==', folderData.name)
      .limit(1)
      .get();

    if (regularFolderQuery.empty) {
      // Create new regular folder
      const newRegularFolder = await userCol('bookmark_secret').add({
        name: folderData.name,
        createdAt: folderData.createdAt || new Date()
      });
      regularFolderId = newRegularFolder.id;
    } else {
      regularFolderId = regularFolderQuery.docs[0].id;
    }

    // Remove archived timestamp and add to regular collection
    const { archivedAt, ...cleanBookmarkData } = bookmarkData;
    await userCol('bookmark_secret').doc(regularFolderId).collection('links').add(cleanBookmarkData);

    // Delete from archive
    await userCol('bookmark_archive').doc(fid).collection('links').doc(id).delete();

    // Reload current view
    loadBookmarks(fid);
  } catch(err) {
    console.error(err);
    alert("Error restoring bookmark");
  }
}

async function deleteBookmark(fid, id) {
  const confirmMessage = isArchiveMode ? 
    "Permanently delete this bookmark? This cannot be undone." : 
    "Delete this bookmark?";
    
  if(!confirm(confirmMessage)) return;

  try {
    const colName = isArchiveMode ? 'bookmark_archive' : 'bookmark_secret';
    await userCol(colName).doc(fid).collection('links').doc(id).delete();
    loadBookmarks(fid);
  } catch(err) {
    console.error(err);
    alert("Error deleting bookmark");
  }
}

function showModal(title, description, url) {
  document.getElementById('modalTitle').innerText = title || 'No Title';
  document.getElementById('modalDescription').innerText = description || 'No description';
  const link = document.getElementById('modalUrl');
  link.href = url;
  link.innerText = url;

  const embedHtml = generateEmbedCode(url);
  const previewContainer = document.getElementById('modalPreview');

  if (embedHtml) {
    previewContainer.innerHTML = embedHtml;
    previewContainer.style.display = 'block';
  } else {
    previewContainer.innerHTML = '<div class="no-preview">Preview not available</div>';
    previewContainer.style.display = 'block';
  }

  document.getElementById('modalOverlay').style.display = 'flex';
}

function hideModal() {
  document.getElementById('modalOverlay').style.display = 'none';
}

function generateEmbedCode(url) {
  const ytRegex = /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/;
  const ytShortRegex = /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]+)/;
  const igRegex = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:p|reel)\/([a-zA-Z0-9_-]+)/;
  const imgurRegex = /(?:https?:\/\/)?(?:www\.)?imgur\.com\/(?:a\/|gallery\/)?([a-zA-Z0-9]{5,})/i;

  let match;

  if ((match = url.match(ytRegex)) || (match = url.match(ytShortRegex))) {
    const videoId = match[1];
    return `<div class="embed-container youtube"><iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen></iframe></div>`;
  }
  else if ((match = url.match(igRegex))) {
    const postId = match[1];
    return `<div class="embed-container instagram"><iframe src="https://www.instagram.com/p/${postId}/embed" frameborder="0" scrolling="no" allowtransparency="true"></iframe></div>`;
  }
  else if ((match = url.match(imgurRegex))) {
    const imgurId = match[1];
    return `<div class="embed-container imgur">
      <img src="https://i.imgur.com/${imgurId}.jpg" onerror="this.onerror=null;this.src='https://i.imgur.com/${imgurId}.png';this.onerror=null;this.style.display='none';" alt="Imgur image">
      <div class="imgur-link"><a href="${url}" target="_blank">View on Imgur</a></div>
    </div>`;
  }

  return null;
}

// Backup functionality (updated to include archives)
async function backupData() {
  try {
    const backup = {
      folders: [],
      archives: [],
      version: '2.0',
      timestamp: new Date().toISOString()
    };

    // Backup regular folders
    const foldersSnap = await userCol('bookmark_secret').get();
    for (const folderDoc of foldersSnap.docs) {
      const folderData = folderDoc.data();
      const bookmarksSnap = await userCol('bookmark_secret').doc(folderDoc.id).collection('links').get();

      const bookmarks = [];
      bookmarksSnap.forEach(bookmarkDoc => {
        bookmarks.push({
          id: bookmarkDoc.id,
          ...bookmarkDoc.data(),
          createdAt: bookmarkDoc.data().createdAt?.toDate?.()?.toISOString() || new Date().toISOString()
        });
      });

      backup.folders.push({
        id: folderDoc.id,
        name: folderData.name,
        createdAt: folderData.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
        bookmarks
      });
    }

    // Backup archive folders
    const archivesSnap = await userCol('bookmark_archive').get();
    for (const folderDoc of archivesSnap.docs) {
      const folderData = folderDoc.data();
      const bookmarksSnap = await userCol('bookmark_archive').doc(folderDoc.id).collection('links').get();

      const bookmarks = [];
      bookmarksSnap.forEach(bookmarkDoc => {
        bookmarks.push({
          id: bookmarkDoc.id,
          ...bookmarkDoc.data(),
          createdAt: bookmarkDoc.data().createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
          archivedAt: bookmarkDoc.data().archivedAt?.toDate?.()?.toISOString() || new Date().toISOString()
        });
      });

      backup.archives.push({
        id: folderDoc.id,
        name: folderData.name,
        createdAt: folderData.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
        bookmarks
      });
    }

    const dataStr = JSON.stringify(backup, null, 2);
    const dataBlob = new Blob([dataStr], {type: 'application/json'});
    const downloadUrl = URL.createObjectURL(dataBlob);

    const downloadLink = document.createElement('a');
    downloadLink.href = downloadUrl;
    downloadLink.download = `bookmark-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);

    alert('Backup created successfully!');
  } catch (error) {
    console.error('Backup error:', error);
    alert('Error creating backup: ' + error.message);
  }
}

function handleRestoreFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const backupData = JSON.parse(e.target.result);
      if (confirmRestore()) {
        restoreData(backupData);
      }
    } catch (error) {
      console.error('Parse error:', error);
      alert('Invalid backup file format');
    }
  };
  reader.readAsText(file);

  event.target.value = '';
}

function confirmRestore() {
  return confirm(
    'WARNING: Restoring this backup will REPLACE all of your existing folders, bookmarks, and archives. ' +
    'This action cannot be undone. Are you sure you want to continue?'
  );
}

async function restoreData(backupData) {
  try {
    if (!backupData.folders || !Array.isArray(backupData.folders)) {
      throw new Error('Invalid backup data structure');
    }

    // Delete existing data
    const [existingFolders, existingArchives] = await Promise.all([
      userCol('bookmark_secret').get(),
      userCol('bookmark_archive').get()
    ]);

    const batch = db.batch();
    existingFolders.forEach(doc => batch.delete(doc.ref));
    existingArchives.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    // Restore regular folders
    for (const folder of backupData.folders) {
      const newFolderRef = userCol('bookmark_secret').doc();
      await newFolderRef.set({
        name: folder.name,
        createdAt: new Date(folder.createdAt) 
      });

      if (folder.bookmarks && Array.isArray(folder.bookmarks)) {
        for (const bookmark of folder.bookmarks) {
          const bookmarkData = {
            title: bookmark.title || '',
            url: bookmark.url || '',
            description: bookmark.description || '',
            thumbnail: bookmark.thumbnail || '',
            createdAt: new Date(bookmark.createdAt)
          };

          await newFolderRef.collection('links').add(bookmarkData);
        }
      }
    }

    // Restore archive folders (if they exist in backup)
    if (backupData.archives && Array.isArray(backupData.archives)) {
      for (const folder of backupData.archives) {
        const newFolderRef = userCol('bookmark_archive').doc();
        await newFolderRef.set({
          name: folder.name,
          createdAt: new Date(folder.createdAt) 
        });

        if (folder.bookmarks && Array.isArray(folder.bookmarks)) {
          for (const bookmark of folder.bookmarks) {
            const bookmarkData = {
              title: bookmark.title || '',
              url: bookmark.url || '',
              description: bookmark.description || '',
              thumbnail: bookmark.thumbnail || '',
              createdAt: new Date(bookmark.createdAt),
              archivedAt: new Date(bookmark.archivedAt || bookmark.createdAt)
            };

            await newFolderRef.collection('links').add(bookmarkData);
          }
        }
      }
    }

    alert('Backup restored successfully! Reloading...');
    loadFolders();
  } catch (error) {
    console.error('Restore error:', error);
    alert('Error restoring backup: ' + error.message);
  }
}

function escapeHtml(str) {
  return (str ?? '').replace(/[&<>"']/g, m => ({
    '&':'&','<':'<','>':'>','"':'"',"'":'&#x27;'
  }[m]));
}

function escapeJs(str){
  return (str ?? '').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\r?\n/g,'\\n');
}

function escapeAttribute(str){
  return (str ?? '').replace(/"/g,'"');
}