// ================================================================
//  FIREBASE CONFIGURATION — InternTrack
// ================================================================
//  SETUP STEPS (takes ~3 minutes, completely free):
//
//  1. Go to https://console.firebase.google.com
//  2. Click "Add project" → give it a name → Continue
//  3. Click the </> (Web) icon to register a web app
//  4. Copy the firebaseConfig values below
//  5. In the left sidebar → Build → Authentication
//     → Get Started → Enable "Google" AND "Email/Password"
//  6. In Authentication → Settings → Authorized domains
//     → Add your Vercel domain (e.g. interntrack.vercel.app)
//  7. Enable Firestore: Build → Firestore Database → Create database
//     → Start in PRODUCTION mode → choose a region → Done
//  8. In Firestore → Rules tab, paste and Publish:
//
//     rules_version = '2';
//     service cloud.firestore {
//       match /databases/{database}/documents {
//         match /users/{userId} {
//           allow read, write: if request.auth != null && request.auth.uid == userId;
//         }
//       }
//     }
//
//  Firestore is free up to 1GB storage / 50k reads / 20k writes per day.
// ================================================================

const firebaseConfig = {
  apiKey:            "AIzaSyAxrB90tisUYfXlItdA_PLkURdlYmwVhkA",
  authDomain:        "interntrack-4c4d0.firebaseapp.com",
  projectId:         "interntrack-4c4d0",
  storageBucket:     "interntrack-4c4d0.firebasestorage.app",
  messagingSenderId: "1041277175766",
  appId:             "1:1041277175766:web:71facff9337727bc390677",
};

// Detect if the config has been filled in
const FIREBASE_CONFIGURED = firebaseConfig.apiKey !== "YOUR_API_KEY";

if (FIREBASE_CONFIGURED) {
  firebase.initializeApp(firebaseConfig);
}
