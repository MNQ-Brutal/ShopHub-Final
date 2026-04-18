import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyBJQcModtVMaMs65xu-csdTy5TyDpl7cRg",
  authDomain: "shophub-8a1a2.firebaseapp.com",
  projectId: "shophub-8a1a2",
  storageBucket: "shophub-8a1a2.firebasestorage.app",
  messagingSenderId: "154529958121",
  appId: "1:154529958121:web:dc73b19c387a50a9ac4878",
  measurementId: "G-C5SYBT95Q5"
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
