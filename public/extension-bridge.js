(function () {
  const BRIDGE_VERSION = 1;
  const statusEl = document.getElementById('status');
  const connections = new Map(); // origin -> Set of sources
  let auth;

  function setStatus(message) {
    if (statusEl) {
      statusEl.textContent = message;
    }
  }

  function extractUser(user) {
    if (!user) return null;
    return {
      uid: user.uid,
      email: user.email || null,
      displayName: user.displayName || null,
      photoURL: user.photoURL || null
    };
  }

  function send(source, origin, payload) {
    if (!source || !origin) return;
    try {
      source.postMessage({ ...payload, bridgeVersion: BRIDGE_VERSION }, origin);
    } catch (err) {
      console.error('[bridge] Failed to postMessage', err);
    }
  }

  function addConnection(origin, source) {
    if (!connections.has(origin)) {
      connections.set(origin, new Set());
    }
    connections.get(origin).add(source);
  }

  function broadcast(payload) {
    connections.forEach((sources, origin) => {
      sources.forEach((source) => send(source, origin, payload));
    });
  }

  function serializeError(err) {
    if (!err) return null;
    return {
      code: err.code || null,
      message: err.message || err.toString()
    };
  }

  async function ensureFirebase() {
    if (!window.firebase) {
      setStatus('Firebase SDK unavailable');
      throw new Error('Firebase SDK unavailable');
    }
    if (!window.projectConfig) {
      setStatus('Missing Firebase config');
      throw new Error('Missing Firebase config');
    }
    if (firebase.apps.length === 0) {
      firebase.initializeApp(window.projectConfig);
    }
    auth = firebase.auth();
    try {
      await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    } catch (err) {
      console.warn('[bridge] Unable to set persistence', err);
    }
    auth.onAuthStateChanged((user) => {
      setStatus(user ? `Signed in as ${user.email || user.uid}` : 'Signed out');
      broadcast({ type: 'ob:auth-state', user: extractUser(user) });
    });
    setStatus('Bridge ready');
  }

  async function handleSignIn(source, origin) {
    if (!auth) return;
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      const result = await auth.signInWithPopup(provider);
      const credential = result?.credential || null;
      send(source, origin, {
        type: 'ob:credential',
        user: extractUser(result?.user || null),
        credential: credential ? {
          providerId: credential.providerId || 'google.com',
          idToken: credential.idToken || null,
          accessToken: credential.accessToken || null
        } : null
      });
    } catch (error) {
      console.error('[bridge] sign-in error', error);
      send(source, origin, {
        type: 'ob:credential',
        error: serializeError(error)
      });
    }
  }

  async function handleSignOut(source, origin) {
    if (!auth) return;
    try {
      await auth.signOut();
      send(source, origin, { type: 'ob:signed-out' });
    } catch (error) {
      console.error('[bridge] sign-out error', error);
      send(source, origin, {
        type: 'ob:signed-out',
        error: serializeError(error)
      });
    }
  }

  window.addEventListener('message', (event) => {
    if (!event.origin.startsWith('chrome-extension://')) {
      return;
    }
    const data = event.data || {};
    if (!data || typeof data.type !== 'string') {
      return;
    }

    addConnection(event.origin, event.source);

    switch (data.type) {
      case 'ob:ping':
        send(event.source, event.origin, { type: 'ob:pong' });
        break;
      case 'ob:signin':
        handleSignIn(event.source, event.origin);
        break;
      case 'ob:signout':
        handleSignOut(event.source, event.origin);
        break;
      case 'ob:auth-request':
        send(event.source, event.origin, {
          type: 'ob:auth-state',
          user: extractUser(auth?.currentUser || null)
        });
        break;
      default:
        break;
    }
  }, false);

  ensureFirebase().catch((err) => {
    console.error('[bridge] init failed', err);
  });
})();
