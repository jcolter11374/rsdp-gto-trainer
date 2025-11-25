// js/storage.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- FIREBASE CONFIG ---
export const firebaseConfig = {
    apiKey: "AIzaSyBJmt_4AOH72MVqMCz6EdrEF-XLmzwwhZs",
    authDomain: "rsdp-trainer.firebaseapp.com",
    projectId: "rsdp-trainer",
    storageBucket: "rsdp-trainer.firebasestorage.app",
    messagingSenderId: "785118381156",
    appId: "1:785118381156:web:bb62acd7337b5dc5264b71",
    measurementId: "G-2VP1L3004C"
};

// Initialize Firebase
let db, auth, userUid;
try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
} catch(e) {
    console.warn("Firebase not configured. Running in Offline Mode.");
}

/**
 * STORAGE SERVICE (Cloud + Local Hybrid)
 */
export class StorageService {
    static async init() {
        if (!auth) return false;

        // Helper to handle errors
        const handleAuthError = (error) => {
            console.error("Firebase Auth Error:", error);
            if (error.code && error.code.includes('requests-from-referer')) {
                 const match = error.message.match(/referer-(.*?)-are-blocked/);
                 const domain = match ? match[1] : "this domain";
                 
                 if (window.game && window.game.showToast) {
                     window.game.showToast(`BLOCKED: Add ${domain} to API Key`, 'error');
                 } else {
                     console.warn(`FIREBASE BLOCKED. You need to allow this domain: ${domain}`);
                 }
            }
        };
        
        return new Promise((resolve) => {
            onAuthStateChanged(auth, async (user) => {
                if (user) {
                    userUid = user.uid;
                    console.log("Logged in as:", userUid);
                    await this.pullFromCloud(); 
                    resolve(true);
                } else {
                    signInAnonymously(auth).catch(handleAuthError);
                }
            }, (error) => handleAuthError(error));
        });
    }

    // Download Cloud Data -> LocalStorage (Cloud is Truth)
    static async pullFromCloud() {
        if (!db || !userUid) return;
        try {
            const docRef = doc(db, "users", userUid);
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                const data = docSnap.data();
                console.log("Cloud Save Found. Syncing...");
                
                // Map Cloud keys back to LocalStorage
                Object.keys(data).forEach(key => {
                    if (key !== 'lastSynced' && key !== 'userId') {
                        const val = typeof data[key] === 'object' ? JSON.stringify(data[key]) : data[key];
                        localStorage.setItem(key, val);
                    }
                });
                return true;
            } else {
                console.log("New Cloud User. Uploading local data...");
                await this.pushToCloud(); // Create initial doc
            }
        } catch (e) {
            console.error("Cloud Pull Failed:", e);
        }
    }

    // Upload LocalStorage -> Cloud Data
    static async pushToCloud() {
        if (!db || !userUid) return;
        
        const payload = {
            userId: userUid,
            lastSynced: serverTimestamp(),
            // Core Stats
            poker_bankroll: parseFloat(this.get('poker_bankroll', 1000)),
            poker_xp: parseInt(this.get('poker_xp', 0)),
            poker_total_hands: parseInt(this.get('poker_total_hands', 0)),
            poker_player_name: this.get('poker_player_name', 'Grinder'),
            poker_campaign_level: parseInt(this.get('poker_campaign_level', 0)),
            // Complex Objects (Parse before sending to keep them as objects in DB)
            poker_hand_stats: JSON.parse(this.get('poker_hand_stats', '{}')),
            poker_inventory: JSON.parse(this.get('poker_inventory', '[]')),
            poker_equipped: JSON.parse(this.get('poker_equipped', '{}')),
            poker_custom_range: JSON.parse(this.get('poker_custom_range', '[]'))
        };

        // Add Save Slots
        for(let i=1; i<=3; i++) {
            const slot = this.get(`poker_save_slot_${i}`, null);
            if(slot) payload[`poker_save_slot_${i}`] = JSON.parse(slot);
        }

        try {
            await setDoc(doc(db, "users", userUid), payload, { merge: true });
            console.log("Cloud Sync Complete");
        } catch(e) {
            console.warn("Cloud Push Failed:", e);
        }
    }

    static get(key, defaultValue) {
        try {
            const val = localStorage.getItem(key);
            return val ? val : defaultValue;
        } catch (e) { return defaultValue; }
    }

    static set(key, value) {
        try {
            localStorage.setItem(key, value);
            this.debounceCloudSave(); // Trigger background sync
            return true;
        } catch (e) { return false; }
    }

    static remove(key) { try { localStorage.removeItem(key); } catch(e) {} }
    
    // Prevent hammering Firestore on every click
    static debounceCloudSave() {
        if (this.saveTimer) clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => {
            this.pushToCloud();
        }, 2000); // Wait for 2 seconds of inactivity
    }

    static isAvailable() {
        try { const test = '__storage_test__'; localStorage.setItem(test, test); localStorage.removeItem(test); return true; } 
        catch (e) { return false; }
    }
}
