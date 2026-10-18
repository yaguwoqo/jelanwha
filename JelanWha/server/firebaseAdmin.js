import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import fs from 'node:fs'

let authInstance = null
export function getFirebaseAdminAuth() {
  if (authInstance) return authInstance
  if (!getApps().length) {
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID
    if (serviceAccountPath) {
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'))
      initializeApp({ credential: cert(serviceAccount), projectId: projectId || serviceAccount.project_id })
    } else {
      initializeApp({ credential: applicationDefault(), ...(projectId ? { projectId } : {}) })
    }
  }
  authInstance = getAuth()
  return authInstance
}
