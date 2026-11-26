// cloud.js - shared live database (Firebase Firestore) for index / student / admin pages.
// 1) Paste your Firebase config below.  2) Keep this file next to the HTML files.
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDd5nuQYZJPcAA04Z5Mvj318SizYpS3q4g",
  authDomain: "kuppayam-camp.firebaseapp.com",
  projectId: "kuppayam-camp",
  storageBucket: "kuppayam-camp.firebasestorage.app",
  messagingSenderId: "897539680811",
  appId: "1:897539680811:web:afc0ceafb172a27f03586e"
};

window.Cloud = (function () {
  let db = null;
  const seen = {}; // id -> JSON last known in cloud

  const reported = {};
  function report(what, e) {
    console.error(what, e);
    const code = (e && e.code) || 'error';
    if (reported[code]) return;
    reported[code] = 1;
    if (window.showToast) window.showToast('Cloud sync problem: ' + code);
  }

  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.firestore();
  } catch (e) { console.warn('Cloud disabled:', e); }

  // Write changed students. allowDelete=true only on admin page.
  function sync(list, allowDelete) {
    if (!db) return;
    const batch = db.batch();
    let n = 0;
    const ids = {};
    list.forEach(s => {
      ids[s.id] = true;
      const j = JSON.stringify(s);
      if (seen[s.id] !== j) {
        batch.set(db.collection('students').doc(s.id), JSON.parse(j));
        seen[s.id] = j;
        n++;
      }
    });
    if (allowDelete) {
      Object.keys(seen).forEach(id => {
        if (!ids[id]) { batch.delete(db.collection('students').doc(id)); delete seen[id]; n++; }
      });
    }
    if (n) batch.commit().catch(e => report('Cloud sync failed:', e));
  }

  // Live listener. cb(list, isEmpty)
  function listen(cb) {
    if (!db) return;
    db.collection('students').onSnapshot(snap => {
      const list = snap.docs.map(d => d.data());
      list.forEach(s => { seen[s.id] = JSON.stringify(s); });
      list.sort((a, b) => (parseInt(String(b.id).replace(/\D/g, ''), 10) || 0) -
                          (parseInt(String(a.id).replace(/\D/g, ''), 10) || 0));
      cb(list, snap.empty);
    }, err => report('Cloud listen failed:', err));
  }

  // Write ONE student (merge). Used by index/student pages so they never overwrite other students.
  function upsert(stu) {
    if (!db || !stu || !stu.id) return Promise.resolve(false);
    const j = JSON.stringify(stu);
    seen[stu.id] = j;
    return db.collection('students').doc(stu.id).set(JSON.parse(j), { merge: true })
      .then(() => true)
      .catch(e => { report('Cloud upsert failed:', e); throw e; });
  }

  // Find a student by Register Number (for QR login). Resolves null if none. Rejects after 8s.
  function findByReg(reg) {
    if (!db) return Promise.reject(new Error('no db'));
    const q = db.collection('students').where('regNo', '==', String(reg).toUpperCase()).limit(1).get()
      .then(snap => (snap.empty ? null : snap.docs[0].data()));
    const t = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000));
    return Promise.race([q, t]);
  }

  return { sync, listen, upsert, findByReg };
})();
