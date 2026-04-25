// firebase-config.js
// Firebase configuration for MediVault Clinic System

// Firebase configuration object
const firebaseConfig = {
  apiKey: "AIzaSyC5G36djlzBuhNEzKzrvcJ_1-qvrTm1bOs",
  authDomain: "qr-scanner-live-5b385.firebaseapp.com",
  projectId: "qr-scanner-live-5b385",
  storageBucket: "qr-scanner-live-5b385.firebasestorage.app",
  messagingSenderId: "260207453177",
  appId: "1:260207453177:web:ea438ade7b1b56270e1328",
  measurementId: "G-WQEEHEPWG3"
};

// Initialize Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const rtdb = getDatabase(app);

export { app, db, rtdb };
