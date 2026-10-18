import { initializeApp, getApps } from 'firebase/app'
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth'
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}
export const firebaseConfigured = Boolean(config.apiKey && config.authDomain && config.projectId && config.appId)
const app = firebaseConfigured ? (getApps().length ? getApps()[0] : initializeApp(config)) : null
export const firebaseAuth = app ? getAuth(app) : null
export const firestore = app ? getFirestore(app) : null

export async function loginWithGoogleFirebase() {
  if (!firebaseAuth || !firestore) throw new Error('Konfigurasi Firebase belum lengkap. Periksa variabel VITE_FIREBASE_* di file .env.')
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  const result = await signInWithPopup(firebaseAuth, provider)
  const fbUser = result.user
  const profileRef = doc(firestore, 'profiles', fbUser.uid)
  const snapshot = await getDoc(profileRef)
  const saved = snapshot.exists() ? snapshot.data() : {}
  const displayName = String(saved.displayName || fbUser.displayName || '').trim().slice(0, 40)
  await setDoc(profileRef, {
    uid: fbUser.uid,
    email: fbUser.email || '',
    displayName,
    photoURL: saved.photoURL || fbUser.photoURL || '',
    createdAt: saved.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true })
  return { idToken: await fbUser.getIdToken(), profile: { name: displayName, avatar: saved.photoURL || fbUser.photoURL || '' } }
}

export async function saveFirestoreProfile({ name, avatar } = {}) {
  const fbUser = firebaseAuth?.currentUser
  if (!fbUser || !firestore) throw new Error('Sesi Firebase tidak ditemukan. Silakan masuk kembali dengan Google.')
  const patch = { uid: fbUser.uid, email: fbUser.email || '', updatedAt: serverTimestamp() }
  if (name !== undefined) patch.displayName = String(name).trim().slice(0, 40)
  if (avatar !== undefined) patch.photoURL = String(avatar || '').slice(0, 600)
  await setDoc(doc(firestore, 'profiles', fbUser.uid), patch, { merge: true })
}

export async function logoutFirebase() {
  if (firebaseAuth?.currentUser) await signOut(firebaseAuth)
}
