// js/game.js
import { StorageService, firebaseConfig } from './storage.js';
import { 
    SHOP_ITEMS, RANKS, RANK_ORDER, SUITS, 
    POSITIONS_6MAX, POSITIONS_9MAX, RANGES, 
    LEVELS, CAMPAIGN_LEVELS 
} from './data.js';

/**
 * AUDIO MANAGER
 */
class AudioManager {
    constructor() {
        this.ctx = null;
        this.enabled = true; 
        this.volume = 0.3;
    }
    init() { if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
    toggle() {
        this.enabled = !this.enabled;
        if (this.enabled) { this.init(); this.resume(); this.playTone(800, 'sine', 0.1); }
        return this.enabled;
    }
    playTone(freq, type, duration, time = 0) {
        if (!this.enabled || !this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime + time);
        gain.gain.setValueAtTime(this.volume, this.ctx.currentTime + time);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + time + duration);
        osc.connect(gain); gain.connect(this.ctx.destination);
        osc.start(this.ctx.currentTime + time); osc.stop(this.ctx.currentTime + time + duration);
    }
    playNoise(duration) {
        if (!this.enabled || !this.ctx) return;
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = this.ctx.createBufferSource(); noise.buffer = buffer;
        const gain = this.ctx.createGain(); const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass'; filter.frequency.value = 1000;
        gain.gain.setValueAtTime(0.1, this.ctx.currentTime); gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        noise.connect(filter); filter.connect(gain); gain.connect(this.ctx.destination); noise.start();
    }
    playSuccess() { this.playTone(523.25, 'sine', 0.3, 0); this.playTone(659.25, 'sine', 0.3, 0.1); this.playTone(783.99, 'sine', 0.6, 0.2); }
    playError() { this.playTone(150, 'sawtooth', 0.3, 0); this.playTone(130, 'sawtooth', 0.3, 0.1); }
    playChip() { this.playTone(2000, 'triangle', 0.05, 0); this.playTone(2500, 'sine', 0.05, 0); }
    playDeal() { this.playNoise(0.15); }
    playBuy() { this.playTone(1200, 'square', 0.1, 0); this.playTone(1600, 'square', 0.2, 0.1); }
}

/**
 * CORE APP CLASS
 */
export class HoldemTrainer {
    constructor() {
        this.audio = new AudioManager();
        
        // Default state (will be overwritten by sync if available)
        this.bankroll = 1000;
        this.xp = 0;
        this.totalHands = 0;
        this.playerName = '';
        this.campaignLevelIndex = 0;
        this.handStats = {};
        this.inventory = ["felt_emerald", "deck_standard", "prot_none"];
        this.equipped = {felt: "felt_emerald", deck: "deck_standard", protector: "prot_none"};
        this.customRange = ["AA","KK","QQ","JJ","TT","99","88","77","AKs","AQs","AJs","ATs","KQs","KJs","QJs","JTs","T9s","98s","87s","AKo","AQo"];

        this.streak = 0;
        this.campaignStreak = 0;
        this.mode = 'rfi'; 
        this.timer = null;
        this.timeLeft = 100;
        this.currentHand = null;
        this.currentScenario = null;
        this.isModalOpen = false;
        this.isPlaying = false;
        this.isPaused = false;
        this.wasAutoPaused = false;
        this.isAdaptive = false; 
        this.touchStartX = 0; this.touchStartY = 0; this.isDragging = false; this.cardContainer = null; this.hideOverlayTimer = null;

        this.init();
    }

    async init() {
        // 1. Try to Init Cloud
        if (firebaseConfig.apiKey !== "PASTE_API_KEY_HERE") {
            console.log("Connecting to Cloud...");
            await StorageService.init(); 
        }

        // 2. Load Data (From LocalStorage, which might have just been synced)
        this.loadLocalState();

        // 3. Bind & Start
        this.bindEvents();
        this.bindInputEvents(); 
        document.getElementById('modeSelect').value = this.mode;
        this.updateModeUI(); 
        
        if(this.customRange.length > 0 && document.getElementById('customRangeInput')) {
            document.getElementById('customRangeInput').value = this.customRange.join(', ');
        }
        
        this.applyTheme(); 
        this.updateGamificationUI();
        this.isPaused = false;
        
        if (this.playerName) {
            document.getElementById('splashScreen').classList.add('hidden');
            this.isPlaying = true;
            this.nextHand();
        } else {
            this.isPlaying = false;
        }

        if(!StorageService.isAvailable()) { setTimeout(() => { this.showToast("WARNING: STORAGE BLOCKED. USE FILE EXPORT.", "error"); }, 1000); }
    }

    loadLocalState() {
        this.bankroll = parseFloat(StorageService.get('poker_bankroll', '1000'));
        this.xp = parseInt(StorageService.get('poker_xp', '0'));
        this.totalHands = parseInt(StorageService.get('poker_total_hands', '0'));
        this.playerName = StorageService.get('poker_player_name', '');
        this.campaignLevelIndex = parseInt(StorageService.get('poker_campaign_level', '0'));
        this.handStats = JSON.parse(StorageService.get('poker_hand_stats', '{}'));
        this.inventory = JSON.parse(StorageService.get('poker_inventory', '["felt_emerald", "deck_standard", "prot_none"]'));
        this.equipped = JSON.parse(StorageService.get('poker_equipped', '{"felt": "felt_emerald", "deck": "deck_standard", "protector": "prot_none"}'));
        
        const rangeStr = StorageService.get('poker_custom_range', null);
        if (rangeStr) this.customRange = JSON.parse(rangeStr);
    }
    
    startGame() {
        const name = "Grinder";
        this.playerName = name;
        StorageService.set('poker_player_name', name);
        
        document.getElementById('splashScreen').classList.add('opacity-0');
        setTimeout(() => {
            document.getElementById('splashScreen').classList.add('hidden');
            this.audio.init();
            this.audio.resume();
            this.nextHand();
        }, 500);
    }

    updateModeUI() {
        const editBtn = document.getElementById('editRangeBtn');
        if(this.mode === 'custom') { editBtn.classList.remove('hidden'); } else { editBtn.classList.add('hidden'); }
    }

    triggerHaptic(pattern) { if (navigator.vibrate) navigator.vibrate(pattern); }
    togglePause(silent = false) {
        if (!this.isPlaying && !this.isPaused) return;
        this.isPaused = !this.isPaused;
        const modal = document.getElementById('pauseModal');
        if (this.isPaused) { this.stopTimer(); if (!silent) { modal.classList.remove('hidden'); modal.classList.add('flex'); } } 
        else { this.startTimer(false); modal.classList.add('hidden'); modal.classList.remove('flex'); }
    }
    exitToMenu() { this.isPlaying = false; this.isPaused = false; this.stopTimer(); StorageService.remove('poker_player_name'); document.getElementById('pauseModal').classList.add('hidden'); document.getElementById('pauseModal').classList.remove('flex'); location.reload(); }
    
    // ---------------- PERSISTENCE METHODS (RESTORED) ----------------
    
    saveProgress() {
        StorageService.set('poker_bankroll', this.bankroll);
        StorageService.set('poker_xp', this.xp);
        StorageService.set('poker_total_hands', this.totalHands);
        StorageService.set('poker_inventory', JSON.stringify(this.inventory));
        StorageService.set('poker_equipped', JSON.stringify(this.equipped));
        StorageService.set('poker_hand_stats', JSON.stringify(this.handStats));
        if(this.playerName) StorageService.set('poker_player_name', this.playerName);
        StorageService.set('poker_campaign_level', this.campaignLevelIndex);
        StorageService.set('poker_custom_range', JSON.stringify(this.customRange));
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        let bgClass = type === 'error' ? 'bg-red-600' : 'bg-emerald-600';
        let icon = type === 'error' ? 'ph-warning-circle' : 'ph-check-circle';
        toast.className = `${bgClass} text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-3 min-w-[200px] transform transition-all duration-300 toast-enter`;
        toast.innerHTML = `<i class="ph-bold ${icon} text-xl"></i><span class="text-xs font-bold uppercase tracking-wider">${message}</span>`;
        container.appendChild(toast);
        requestAnimationFrame(() => { toast.classList.remove('toast-enter'); toast.classList.add('toast-enter-active'); });
        setTimeout(() => { toast.classList.remove('toast-enter-active'); toast.classList.add('toast-exit-active'); setTimeout(() => toast.remove(), 300); }, 3000);
    }

    getSaveState() {
        const data = {
            bankroll: this.bankroll,
            xp: this.xp,
            totalHands: this.totalHands,
            inventory: this.inventory,
            equipped: this.equipped,
            handStats: this.handStats,
            playerName: this.playerName,
            campaignLevel: this.campaignLevelIndex,
            customRange: this.customRange,
            timestamp: new Date().toISOString()
        };
        for(let i=1; i<=3; i++) {
            const slot = StorageService.get(`poker_save_slot_${i}`, null);
            if(slot) data[`slot_${i}`] = JSON.parse(slot);
        }
        return JSON.stringify(data);
    }

    prepareExport() {
        const boxContainer = document.getElementById('syncBoxContainer');
        const box = document.getElementById('syncStringInput');
        const btn = document.getElementById('syncActionBtn');
        boxContainer.classList.remove('hidden');
        const saveString = btoa(this.getSaveState());
        box.value = saveString;
        box.select();
        btn.textContent = "COPY TO CLIPBOARD";
        btn.className = "w-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-3 rounded-lg shadow-lg mt-2";
        btn.onclick = () => {
            box.select();
            try {
                document.execCommand('copy');
                this.showToast("COPIED TO CLIPBOARD!");
            } catch(e) {
                this.showToast("COPY FAILED - COPY MANUALLY", "error");
            }
        };
    }

    exportSaveToFile(slotIndex = null) {
        let dataStr = "";
        let fileName = "rsdp_gto_save.json";
        if (slotIndex) {
            const slotData = StorageService.get(`poker_save_slot_${slotIndex}`, null);
            if (!slotData) { this.showToast("EMPTY SLOT", "error"); return; }
            dataStr = slotData;
            fileName = `rsdp_gto_slot${slotIndex}.json`;
        } else { dataStr = this.getSaveState(); }
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob); const a = document.createElement('a');
        a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        this.showToast("SAVE FILE DOWNLOADED!");
    }

    triggerFileImport() { document.getElementById('fileImportInput').click(); }
    
    importSaveFromFile(input) {
        const file = input.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const json = e.target.result;
                const data = JSON.parse(json);
                if (data.slot_1 || data.slot_2 || data.slot_3) { this.applySaveData(data); } else { this.applySaveData(data); }
                input.value = ''; 
            } catch (err) { console.error(err); this.showToast("INVALID SAVE FILE", "error"); }
        };
        reader.readAsText(file);
    }

    applySaveData(data) {
        if(typeof data.bankroll === 'undefined') throw new Error("Invalid Data");
        StorageService.set('poker_bankroll', data.bankroll); StorageService.set('poker_xp', data.xp); StorageService.set('poker_total_hands', data.totalHands);
        StorageService.set('poker_inventory', JSON.stringify(data.inventory)); StorageService.set('poker_equipped', JSON.stringify(data.equipped));
        StorageService.set('poker_hand_stats', JSON.stringify(data.handStats)); if (data.playerName) StorageService.set('poker_player_name', data.playerName);
        StorageService.set('poker_campaign_level', data.campaignLevel); if (data.customRange) StorageService.set('poker_custom_range', JSON.stringify(data.customRange));
        for(let i=1; i<=3; i++) { if(data[`slot_${i}`]) StorageService.set(`poker_save_slot_${i}`, JSON.stringify(data[`slot_${i}`])); }
        this.showToast("DATA LOADED! RESTARTING..."); setTimeout(() => location.reload(), 1000);
    }

    saveGame(slotIndex, slotName) {
        const name = slotName || (this.playerName || "Grinder");
        const data = {
            bankroll: this.bankroll, xp: this.xp, totalHands: this.totalHands, inventory: this.inventory, equipped: this.equipped, handStats: this.handStats, playerName: name, timestamp: new Date().toISOString()
        };
        StorageService.set(`poker_save_slot_${slotIndex}`, JSON.stringify(data)); this.triggerHaptic(20); this.renderSaveSlots(); this.triggerConfetti(); this.showToast(`SAVED TO SLOT ${slotIndex}`);
    }

    initiateSave(slotIndex, overwrite = false) {
        const nameInput = document.getElementById(`slot-name-${slotIndex}`); let name = this.playerName;
        if (nameInput && nameInput.value.trim() !== "") name = nameInput.value.trim();
        this.saveGame(slotIndex, name);
    }

    renderSaveSlots() {
        const container = document.getElementById('saveSlotContainer'); container.innerHTML = '';
        for (let i = 1; i <= 3; i++) {
            const slotKey = `poker_save_slot_${i}`; const savedData = StorageService.get(slotKey, null); let content = '';
            if (savedData) {
                try {
                    const data = JSON.parse(savedData); const date = new Date(data.timestamp).toLocaleDateString(); const rank = this.getLevelData(data.xp).name; const saverName = data.playerName || "Unknown Grinder"; 
                    content = `<div class="flex justify-between items-center mb-2"><div><div class="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2"><i class="ph-fill ph-floppy-disk text-purple-400"></i> SLOT ${i}</div><div class="text-xs font-bold text-emerald-400 mt-0.5">${saverName}</div><div class="text-[10px] text-slate-400 font-mono">${date} • ${rank}</div></div><div class="text-right"><div class="text-xs font-bold text-white">$${Math.floor(data.bankroll).toLocaleString()}</div></div></div><div class="flex gap-2 items-center"><button onclick="game.loadGame(${i})" class="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-2 rounded transition-colors shadow-lg">LOAD</button><button onclick="game.initiateSave(${i}, true)" class="bg-slate-700 hover:bg-blue-600 text-white text-[10px] font-bold py-2 px-4 rounded transition-colors">UPDATE</button><button onclick="game.exportSaveToFile(${i})" class="bg-slate-800 hover:bg-slate-700 text-blue-400 p-2 rounded border border-white/10" title="Download Save File"><i class="ph-bold ph-download-simple"></i></button><button onclick="game.deleteSave(${i})" class="text-red-500 hover:text-red-400 p-2"><i class="ph-bold ph-trash"></i></button></div>`;
                } catch(e) { content = "Corrupt Slot"; }
            } else {
                content = `<div class="flex justify-between items-center mb-2"><div class="text-sm font-black text-slate-500 uppercase tracking-wider flex items-center gap-2"><i class="ph-bold ph-floppy-disk"></i> SLOT ${i}</div><div class="text-[10px] text-slate-600 font-bold uppercase">EMPTY</div></div><div class="flex gap-2"><input type="text" id="slot-name-${i}" placeholder="Profile Name" class="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-purple-500 placeholder-slate-600"><button onclick="game.initiateSave(${i})" class="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-4 py-2 rounded transition-colors shadow-lg">SAVE</button></div>`;
            }
            const slotDiv = document.createElement('div'); slotDiv.className = `save-slot p-4 rounded-xl bg-slate-900/50 border border-white/5 ${!savedData ? 'border-dashed border-slate-700' : ''}`; slotDiv.innerHTML = content; container.appendChild(slotDiv);
        }
    }

    // ---------------- VISUAL RANGE EDITOR LOGIC ----------------
    
    openCustomRangeModal() {
        if(this.isPlaying && !this.isPaused) { this.togglePause(true); this.wasAutoPaused=true; }
        const modal = document.getElementById('customRangeModal');
        this.explodeCustomRange();
        this.renderRangeGrid();
        this.updateRangeInputDisplay();
        modal.classList.remove('hidden'); modal.classList.add('flex'); this.isModalOpen = true;
    }

    explodeCustomRange() {
        const explicitRange = [];
        for (let i = 0; i < 13; i++) {
            for (let j = 0; j < 13; j++) {
                const r1 = RANKS[12-i], r2 = RANKS[12-j];
                let hand = '';
                if (i === j) hand = `${r1}${r2}`;
                else if (i < j) hand = `${r1}${r2}s`;
                else hand = `${r2}${r1}o`;
                if (this.checkAction(hand, this.customRange, 'raise')) { explicitRange.push(hand); }
            }
        }
        this.customRange = explicitRange;
    }

    renderRangeGrid() {
        const grid = document.getElementById('rangeGrid');
        grid.innerHTML = '';
        for (let i = 0; i < 13; i++) {
            for (let j = 0; j < 13; j++) {
                const r1 = RANKS[12-i], r2 = RANKS[12-j];
                let handLabel = '', type = '';
                if (i === j) { handLabel = `${r1}${r2}`; type = 'pair'; }
                else if (i < j) { handLabel = `${r1}${r2}s`; type = 's'; }
                else { handLabel = `${r2}${r1}o`; type = 'o'; }
                const isSelected = this.customRange.includes(handLabel);
                const cell = document.createElement('div');
                cell.className = `range-cell cursor-pointer ${isSelected ? 'selected' : ''}`;
                cell.textContent = handLabel;
                cell.onclick = () => {
                    if (this.customRange.includes(handLabel)) {
                        this.customRange = this.customRange.filter(h => h !== handLabel);
                        cell.classList.remove('selected');
                    } else {
                        this.customRange.push(handLabel);
                        cell.classList.add('selected');
                    }
                    this.updateRangeInputDisplay();
                };
                grid.appendChild(cell);
            }
        }
    }
    
    rangeAction(action) {
        if (action === 'clear') { this.customRange = []; } 
        else if (action === 'fill') {
             this.customRange = [];
             for(let i=0;i<13;i++) for(let j=0;j<13;j++) {
                const r1 = RANKS[12-i], r2 = RANKS[12-j];
                if(i===j) this.customRange.push(`${r1}${r2}`);
                else if(i<j) this.customRange.push(`${r1}${r2}s`);
                else this.customRange.push(`${r2}${r1}o`);
             }
        } else if (action === 'pairs') {
            for(let i=0;i<13;i++) {
                const h = `${RANKS[i]}${RANKS[i]}`;
                if(!this.customRange.includes(h)) this.customRange.push(h);
            }
        } else if (action === 'suited') {
            for(let i=0;i<13;i++) for(let j=0;j<13;j++) {
                 if(i<j) { const h = `${RANKS[12-i]}${RANKS[12-j]}s`; if(!this.customRange.includes(h)) this.customRange.push(h); }
            }
        } else if (action === 'offsuit') {
             for(let i=0;i<13;i++) for(let j=0;j<13;j++) {
                 if(i>j) { const h = `${RANKS[12-j]}${RANKS[12-i]}o`; if(!this.customRange.includes(h)) this.customRange.push(h); }
            }
        } else if (action === 'broadway') {
             for(let i=0;i<13;i++) for(let j=0;j<13;j++) {
                 const r1 = RANKS[12-i], r2 = RANKS[12-j];
                 if("AKQJT".includes(r1) && "AKQJT".includes(r2)) {
                     let h = '';
                     if (i === j) h = `${r1}${r2}`;
                     else if (i < j) h = `${r1}${r2}s`;
                     else h = `${r2}${r1}o`;
                     if(!this.customRange.includes(h)) this.customRange.push(h);
                 }
             }
        }
        this.renderRangeGrid();
        this.updateRangeInputDisplay();
    }

    loadGTOPreset(position) {
        const preset = RANGES.CASH_6MAX.RFI[position];
        if (!preset || !preset.raise) return;
        const compactRange = preset.raise;
        this.customRange = []; 
        for(let i=0;i<13;i++) {
            for(let j=0;j<13;j++) {
                const r1 = RANKS[12-i], r2 = RANKS[12-j];
                let hand = '';
                if (i === j) hand = `${r1}${r2}`;
                else if (i < j) hand = `${r1}${r2}s`;
                else hand = `${r2}${r1}o`;
                if (this.checkAction(hand, compactRange, 'raise')) { this.customRange.push(hand); }
            }
        }
        this.renderRangeGrid();
        this.updateRangeInputDisplay();
        this.audio.playBuy(); 
    }

    updateRangeInputDisplay() {
        const ta = document.getElementById('customRangeInput');
        ta.value = this.customRange.join(', ');
    }

    closeCustomRangeModal() {
        const modal = document.getElementById('customRangeModal');
        modal.classList.add('hidden'); modal.classList.remove('flex'); this.isModalOpen = false;
        if(this.wasAutoPaused) { this.togglePause(); this.wasAutoPaused=false; }
    }

    saveCustomRange() {
        StorageService.set('poker_custom_range', JSON.stringify(this.customRange));
        this.closeCustomRangeModal();
        this.streak = 0; 
        this.updateGamificationUI();
        this.nextHand(); 
        this.audio.playSuccess();
    }
    
    // ---------------- CORE GAME LOGIC ----------------

    bindEvents() {
        document.body.addEventListener('click', () => { this.audio.resume(); }, { once: true });
        
        document.getElementById('modeSelect').addEventListener('change', (e) => {
            this.mode = e.target.value;
            this.updateModeUI(); 
            this.streak = 0;
            this.campaignStreak = 0; 
            this.updateGamificationUI();
            this.nextHand();
        });

        const edgeToggle = document.getElementById('edgeCaseToggle');
        edgeToggle.addEventListener('change', (e) => {
            this.isAdaptive = e.target.checked;
            this.updateGamificationUI();
            if(this.isPlaying && !this.isPaused) this.nextHand(); 
        });
        
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                if (this.isPaused && !this.isModalOpen) { this.togglePause(); return; }
                const feedback = document.getElementById('feedbackModal');
                if (!feedback.classList.contains('hidden')) { this.nextHand(); return; }
                if (this.isModalOpen) return;
                if (this.isPlaying || this.isPaused) { this.togglePause(); return; }
            }
            if (!this.isPlaying || this.isPaused) return; 
            const key = e.key.toLowerCase();
            if (key === 'f') this.handleInput('fold');
            if (key === 'c') this.handleInput('call');
            if (key === 'r') this.handleInput('raise');
        });
    }

    bindInputEvents() {
        this.cardContainer = document.getElementById('holeCardsArea'); this.cardContainer.style.cursor = 'grab'; this.cardContainer.style.touchAction = 'none'; 
        this.cardContainer.addEventListener('touchstart', (e) => { this.handleDragStart(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
        this.cardContainer.addEventListener('touchmove', (e) => { if (e.cancelable) e.preventDefault(); this.handleDragMove(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
        this.cardContainer.addEventListener('touchend', (e) => { this.handleDragEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY); });
        this.cardContainer.addEventListener('mousedown', (e) => { this.isDragging = true; this.cardContainer.style.cursor = 'grabbing'; document.body.classList.add('dragging'); this.handleDragStart(e.clientX, e.clientY); });
        window.addEventListener('mousemove', (e) => { if (!this.isDragging) return; this.handleDragMove(e.clientX, e.clientY); });
        window.addEventListener('mouseup', (e) => { if (!this.isDragging) return; this.isDragging = false; this.cardContainer.style.cursor = 'grab'; document.body.classList.remove('dragging'); this.handleDragEnd(e.clientX, e.clientY); });
    }
    handleDragStart(x, y) { if (!this.isPlaying || this.isPaused) return; this.touchStartX = x; this.touchStartY = y; this.triggerHaptic(10); const overlay = document.getElementById('swipeOverlay'); if(this.hideOverlayTimer) clearTimeout(this.hideOverlayTimer); overlay.classList.remove('hidden'); setTimeout(() => overlay.classList.remove('opacity-0'), 10); this.cardContainer.style.transition = 'none'; }
    handleDragMove(x, y) { if (!this.isPlaying || this.isPaused) return; const deltaX = x - this.touchStartX; const deltaY = y - this.touchStartY; const rotate = deltaX * 0.05; this.cardContainer.style.transform = `translate(${deltaX}px, ${deltaY}px) rotate(${rotate}deg)`; const hintRaise = document.getElementById('hintRaise'); const hintCall = document.getElementById('hintCall'); const hintFold = document.getElementById('hintFold'); const highlightThreshold = 80; hintRaise.style.opacity = '0.3'; hintRaise.style.transform = 'translateX(-50%) scale(0.9)'; hintCall.style.opacity = '0.3'; hintCall.style.transform = 'translateY(-50%) scale(0.9)'; hintFold.style.opacity = '0.3'; hintFold.style.transform = 'translateY(-50%) scale(0.9)'; if (Math.abs(deltaY) > Math.abs(deltaX)) { if (deltaY < -highlightThreshold) { hintRaise.style.opacity = '1'; hintRaise.style.transform = 'translateX(-50%) scale(1.2)'; } } else { if (deltaX > highlightThreshold) { hintCall.style.opacity = '1'; hintCall.style.transform = 'translateY(-50%) scale(1.2)'; } else if (deltaX < -highlightThreshold) { hintFold.style.opacity = '1'; hintFold.style.transform = 'translateY(-50%) scale(1.2)'; } } }
    handleDragEnd(x, y) { if (!this.isPlaying || this.isPaused) return; const deltaX = x - this.touchStartX; const deltaY = y - this.touchStartY; const threshold = 80; const overlay = document.getElementById('swipeOverlay'); overlay.classList.add('opacity-0'); this.hideOverlayTimer = setTimeout(() => overlay.classList.add('hidden'), 300); this.cardContainer.style.transition = 'transform 0.3s ease-out'; if (Math.abs(deltaY) > Math.abs(deltaX)) { if (deltaY < -threshold) { this.cardContainer.style.transform = `translate(0px, -${window.innerHeight}px)`; setTimeout(() => this.handleInput('raise'), 200); return; } } else { if (deltaX > threshold) { this.cardContainer.style.transform = `translate(${window.innerWidth}px, ${deltaY}px) rotate(45deg)`; setTimeout(() => this.handleInput('call'), 200); return; } else if (deltaX < -threshold) { this.cardContainer.style.transform = `translate(-${window.innerWidth}px, ${deltaY}px) rotate(-45deg)`; setTimeout(() => this.handleInput('fold'), 200); return; } } this.cardContainer.style.transform = 'translate(0px, 0px) rotate(0deg)'; }
    toggleSound() { this.audio.toggle(); }
    toggleSaves() { const modal = document.getElementById('saveModal'); const shop = document.getElementById('shopModal'); const stats = document.getElementById('statsModal'); const custom = document.getElementById('customRangeModal'); shop.classList.add('hidden'); shop.classList.remove('flex'); stats.classList.add('hidden'); stats.classList.remove('flex'); custom.classList.add('hidden'); custom.classList.remove('flex'); if(modal.classList.contains('hidden')) { if(this.isPlaying && !this.isPaused) { this.togglePause(true); this.wasAutoPaused=true; } this.renderSaveSlots(); modal.classList.remove('hidden'); modal.classList.add('flex'); this.isModalOpen=true; } else { modal.classList.add('hidden'); modal.classList.remove('flex'); this.isModalOpen=false; if(this.wasAutoPaused) { this.togglePause(); this.wasAutoPaused=false; } } }
    toggleStats() { const modal = document.getElementById('statsModal'); const shop = document.getElementById('shopModal'); const saves = document.getElementById('saveModal'); const custom = document.getElementById('customRangeModal'); shop.classList.add('hidden'); shop.classList.remove('flex'); saves.classList.add('hidden'); saves.classList.remove('flex'); custom.classList.add('hidden'); custom.classList.remove('flex'); if(modal.classList.contains('hidden')) { if(this.isPlaying && !this.isPaused) { this.togglePause(true); this.wasAutoPaused=true; } this.renderStats(); modal.classList.remove('hidden'); modal.classList.add('flex'); this.isModalOpen=true; } else { modal.classList.add('hidden'); modal.classList.remove('flex'); this.isModalOpen=false; if(this.wasAutoPaused) { this.togglePause(); this.wasAutoPaused=false; } } }
    toggleShop() { const modal = document.getElementById('shopModal'); const stats = document.getElementById('statsModal'); const saves = document.getElementById('saveModal'); const custom = document.getElementById('customRangeModal'); stats.classList.add('hidden'); stats.classList.remove('flex'); saves.classList.add('hidden'); saves.classList.remove('flex'); custom.classList.add('hidden'); custom.classList.remove('flex'); if(modal.classList.contains('hidden')) { if(this.isPlaying && !this.isPaused) { this.togglePause(true); this.wasAutoPaused=true; } this.renderShop(); modal.classList.remove('hidden'); modal.classList.add('flex'); this.isModalOpen=true; } else { modal.classList.add('hidden'); modal.classList.remove('flex'); this.isModalOpen=false; if(this.wasAutoPaused) { this.togglePause(); this.wasAutoPaused=false; } } }
    setupScenario() { if (this.mode === 'campaign') { const level = CAMPAIGN_LEVELS[this.campaignLevelIndex]; const config = level.config; if (config.type === 'RFI') { const pos = config.allowedPos[Math.floor(Math.random() * config.allowedPos.length)]; return { type: 'RFI', heroPos: pos, villainPos: null, villainAction: null, rangeKey: pos }; } else if (config.type === 'DEFENSE') { const pos = 'BB'; let vilPos; do { vilPos = POSITIONS_6MAX[Math.floor(Math.random() * 5)]; } while (vilPos === 'BB'); return { type: 'DEFENSE', heroPos: 'BB', villainPos: vilPos, villainAction: 'raise', rangeKey: `BB_vs_${vilPos}` }; } else { if (Math.random() > 0.4) { const posIdx = Math.floor(Math.random() * 5); return { type: 'RFI', heroPos: POSITIONS_6MAX[posIdx], villainPos: null, villainAction: null, rangeKey: POSITIONS_6MAX[posIdx] }; } else { const villainIdx = Math.floor(Math.random() * 5); return { type: 'DEFENSE', heroPos: 'BB', villainPos: POSITIONS_6MAX[villainIdx], villainAction: 'raise', rangeKey: `BB_vs_${POSITIONS_6MAX[villainIdx]}` }; } } } else if (this.mode === 'rfi') { const posIdx = Math.floor(Math.random() * 5); return { type: 'RFI', heroPos: POSITIONS_6MAX[posIdx], villainPos: null, villainAction: null, rangeKey: POSITIONS_6MAX[posIdx] }; } else if (this.mode === 'mtt_rfi') { const posIdx = Math.floor(Math.random() * 8); return { type: 'RFI', heroPos: POSITIONS_9MAX[posIdx], villainPos: null, villainAction: null, rangeKey: POSITIONS_9MAX[posIdx] }; } else if (this.mode === 'custom') { const posIdx = Math.floor(Math.random() * 5); return { type: 'CUSTOM', heroPos: POSITIONS_6MAX[posIdx], villainPos: null, villainAction: null }; } else if (this.mode === 'vs_3bet') { const posIdx = Math.floor(Math.random() * 5); const heroPos = POSITIONS_6MAX[posIdx]; if(heroPos === 'BB') return { type: 'RFI', heroPos: 'BTN', villainPos: null, villainAction: null, rangeKey: 'BTN' }; const villainIdx = Math.min(5, posIdx + 1 + Math.floor(Math.random() * (5 - posIdx))); const villainPos = POSITIONS_6MAX[villainIdx]; return { type: 'VS_3BET', heroPos: heroPos, villainPos: villainPos, villainAction: '3bet', rangeKey: `${heroPos}_vs_${villainPos}` }; } else { const villainIdx = Math.floor(Math.random() * 5); return { type: 'DEFENSE', heroPos: 'BB', villainPos: POSITIONS_6MAX[villainIdx], villainAction: 'raise', rangeKey: `BB_vs_${POSITIONS_6MAX[villainIdx]}` }; } }
    updateGamificationUI() { document.getElementById('bankrollDisplay').textContent = Math.floor(this.bankroll).toLocaleString(); const desktopStreakEl = document.getElementById('desktopStreak'); if (desktopStreakEl) desktopStreakEl.textContent = this.streak; const levelInd = document.getElementById('levelIndicator'); const edgeLabel = document.getElementById('edgeCaseLabel'); const edgeInput = document.getElementById('edgeCaseToggle'); const adaptiveContainer = document.getElementById('adaptiveMeterContainer'); const adaptiveFill = document.getElementById('adaptiveHeatBar'); if (this.mode === 'rfi' || this.mode === 'def') { edgeLabel.classList.remove('opacity-50', 'pointer-events-none'); edgeInput.disabled = false; } else { edgeLabel.classList.add('opacity-50', 'pointer-events-none'); edgeInput.disabled = true; if(this.isAdaptive) { this.isAdaptive = false; edgeInput.checked = false; } } if ((this.mode === 'rfi' || this.mode === 'def') && this.isAdaptive) { adaptiveContainer.classList.remove('hidden'); adaptiveFill.className = "h-full transition-all duration-500"; if (this.streak === 0) { adaptiveFill.style.width = "0%"; } else if (this.streak >= 15) { adaptiveFill.style.width = "100%"; adaptiveFill.classList.add('bg-gradient-to-r', 'from-red-500', 'to-purple-600', 'heat-glow-high'); } else if (this.streak >= 5) { const percent = 33 + ((this.streak - 5) * 6); adaptiveFill.style.width = `${Math.min(95, percent)}%`; adaptiveFill.classList.add('bg-yellow-400', 'heat-glow-med'); } else { const percent = this.streak * 8; adaptiveFill.style.width = `${percent}%`; adaptiveFill.classList.add('bg-cyan-500', 'heat-glow-low'); } } else { adaptiveContainer.classList.add('hidden'); } if (this.mode === 'campaign') { const lvl = CAMPAIGN_LEVELS[this.campaignLevelIndex]; levelInd.classList.remove('hidden'); levelInd.textContent = `Lvl ${this.campaignLevelIndex + 1}: ${lvl.name} (${this.campaignStreak}/${lvl.target})`; levelInd.className = "hidden md:block text-[9px] font-mono text-yellow-400 font-bold uppercase tracking-wider bg-yellow-900/50 px-2 py-1 rounded border border-yellow-500/30"; } else { levelInd.className = "hidden md:block text-[9px] font-mono text-slate-500 font-bold uppercase tracking-wider bg-slate-800/50 px-2 py-1 rounded border border-white/5"; levelInd.textContent = this.mode === 'custom' ? "Custom Range" : "100BB Deep"; } const levelInfo = this.getCurrentLevel(); document.getElementById('rankTitle').textContent = levelInfo.data.name; document.getElementById('levelBadge').textContent = levelInfo.index; const progress = ((this.xp - levelInfo.data.xp) / (levelInfo.next ? (levelInfo.next.xp - levelInfo.data.xp) : levelInfo.data.xp)) * 100; document.getElementById('xpBar').style.width = `${Math.min(100, Math.max(0, progress))}%`; document.getElementById('xpText').textContent = `${Math.floor(this.xp)} / ${Math.floor(levelInfo.next ? levelInfo.next.xp : 'MAX')} XP`; document.getElementById('multiplierBadge').textContent = `${this.getMultiplier()}x`; document.getElementById('handCounter').textContent = `Hand #${this.totalHands + 1}`; }
    handleInput(action) { if (this.isDragging) return; if (!this.isPlaying || this.isPaused) return; this.stopTimer(); this.isPlaying = false; this.triggerHaptic(15); if (action === 'fold') this.audio.playDeal(); if (action === 'call' || action === 'raise') this.audio.playChip(); const correctAction = this.getCorrectAction(); let isCorrect = (action === correctAction); if (action === 'timeout') isCorrect = false; this.totalHands++; const genericHand = this.getGenericHand(this.currentHand); if (!this.handStats[genericHand]) this.handStats[genericHand] = { w: 0, l: 0 }; this.previousHandData = { hand: this.currentHand, scenario: this.currentScenario, isCorrect: isCorrect, correctAction: correctAction, userAction: action }; let earnedCash = 0, earnedXp = 0; if (isCorrect) { this.triggerHaptic([50, 50, 50]); this.handStats[genericHand].w++; const baseCash = this.mode === 'def' ? 20 : 10; const baseXp = 25; this.streak++; if (this.mode === 'campaign') { this.campaignStreak++; const currentLvl = CAMPAIGN_LEVELS[this.campaignLevelIndex]; if (this.campaignStreak >= currentLvl.target && this.campaignLevelIndex < 4) { this.showLevelUp(currentLvl); this.campaignLevelIndex++; this.campaignStreak = 0; StorageService.set('poker_campaign_level', this.campaignLevelIndex); } } const multiplier = this.getMultiplier(); const timeBonus = this.timeLeft > 50 ? 1.5 : 1; earnedCash = Math.floor(baseCash * multiplier * timeBonus); earnedXp = Math.floor(baseXp * multiplier); this.bankroll += earnedCash; this.xp += earnedXp; if (this.streak % 5 === 0) this.triggerConfetti(); this.showFloatingText(earnedCash); setTimeout(() => this.audio.playSuccess(), 100); } else { this.triggerHaptic(300); this.handStats[genericHand].l++; this.streak = 0; if(this.mode === 'campaign') this.campaignStreak = 0; const penalty = 50; this.bankroll -= penalty; const xpPenalty = 25; this.xp = Math.max(0, this.xp - xpPenalty); this.showFloatingText(-penalty); setTimeout(() => this.audio.playError(), 100); } this.saveProgress(); this.updateGamificationUI(); this.flashResult(isCorrect, correctAction, earnedCash, earnedXp); this.autoNextTimer = setTimeout(() => { this.nextHand(); }, 1500); }
    flashResult(isCorrect, correctAction, cash, xp) { const overlay = document.getElementById('flashOverlay'); const text = document.getElementById('flashText'); overlay.classList.remove('hidden'); text.classList.remove('scale-0'); text.classList.add('scale-100'); if (isCorrect) { text.innerHTML = `<span class="text-emerald-400 drop-shadow-[0_0_15px_rgba(52,211,153,0.8)]">CORRECT</span>`; } else { const correctText = correctAction.toUpperCase(); text.innerHTML = `<span class="text-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.8)]">MISTAKE</span><br><span class="text-2xl text-slate-300 mt-2 block">SHOULD ${correctText}</span>`; } setTimeout(() => { text.classList.remove('scale-100'); text.classList.add('scale-0'); setTimeout(() => { overlay.classList.add('hidden'); }, 300); }, 1200); }
    reviewLastHand() { if (!this.previousHandData) return; if (this.autoNextTimer) clearTimeout(this.autoNextTimer); const { hand, scenario, isCorrect, correctAction, userAction } = this.previousHandData; const tempHand = this.currentHand; const tempScenario = this.currentScenario; this.currentHand = hand; this.currentScenario = scenario; this.showFeedback(isCorrect, correctAction, userAction, 0, 0); this.currentHand = tempHand; this.currentScenario = tempScenario; }
    showLevelUp(level) { const modal = document.getElementById('levelUpModal'); const txt = document.getElementById('levelUpText'); const nextLvlName = CAMPAIGN_LEVELS[this.campaignLevelIndex + 1].name; txt.textContent = `You are now: ${nextLvlName}`; modal.classList.remove('hidden'); modal.classList.add('flex'); this.bankroll += level.bonus; this.audio.playSuccess(); this.triggerConfetti(); }
    closeLevelUp() { document.getElementById('levelUpModal').classList.add('hidden'); document.getElementById('levelUpModal').classList.remove('flex'); }
    getCorrectAction() { const generic = this.getGenericHand(this.currentHand); let rangeData; if (this.mode === 'custom') { if (this.checkAction(generic, this.customRange, 'raise')) return 'raise'; return 'fold'; } if (this.mode === 'rfi' || (this.mode === 'campaign' && this.currentScenario.type === 'RFI')) { rangeData = RANGES.CASH_6MAX.RFI[this.currentScenario.rangeKey]; if (!rangeData) return 'fold'; if (this.checkAction(generic, rangeData.raise, 'raise')) return 'raise'; return 'fold'; } else if (this.mode === 'mtt_rfi') { rangeData = RANGES.MTT_9MAX.RFI[this.currentScenario.rangeKey]; if (!rangeData) return 'fold'; if (this.checkAction(generic, rangeData.raise, 'raise')) return 'raise'; return 'fold'; } else if (this.mode === 'vs_3bet') { rangeData = RANGES.CASH_6MAX.VS_3BET[this.currentScenario.rangeKey]; if (!rangeData) return 'fold'; if (this.checkAction(generic, rangeData.raise, 'raise')) return 'raise'; if (this.checkAction(generic, rangeData.call, 'call')) return 'call'; return 'fold'; } else { rangeData = RANGES.CASH_6MAX.DEFENSE[this.currentScenario.rangeKey]; if (!rangeData) return 'fold'; if (this.checkAction(generic, rangeData.raise, 'raise')) return 'raise'; if (this.checkAction(generic, rangeData.call, 'call')) return 'call'; return 'fold'; } }
    checkAction(genericHand, range, actionType) { if (!range) return false; const idx = (r) => RANK_ORDER[r]; const type = genericHand.length === 2 ? 'pair' : genericHand.slice(2); const r1 = genericHand[0], r2 = genericHand[1]; for (let token of range) { token = token.trim(); if (token === genericHand) return true; if (token.includes('+')) { const base = token.replace('+', ''); if (base.length === 2) { if (type === 'pair' && idx(r1) >= idx(base[0])) return true; } else { const baseType = base.slice(2), baseR1 = base[0], baseR2 = base[1]; if (type === baseType && r1 === baseR1 && idx(r2) >= idx(baseR2)) return true; } } if (token.includes('-')) { const [low, high] = token.split('-'); if (low.length === 2) { if (type === 'pair' && idx(r1) >= idx(low[0]) && idx(r1) <= idx(high[0])) return true; } else { const baseType = low.slice(2); if (type === baseType && r1 === low[0] && idx(r2) >= idx(low[1]) && idx(r2) <= idx(high[1])) return true; } } } return false; }
    generateCard() { const r = RANKS[Math.floor(Math.random() * RANKS.length)]; const s = SUITS[Math.floor(Math.random() * SUITS.length)]; return { rank: r, suit: s }; }
    generateHand() { let hand; while (true) { let c1 = this.generateCard(), c2 = this.generateCard(); while (c1.rank === c2.rank && c1.suit === c2.suit) { c2 = this.generateCard(); } if (RANK_ORDER[c1.rank] < RANK_ORDER[c2.rank]) hand = [c2, c1]; else hand = [c1, c2]; const generic = this.getGenericHand(hand); const type = this.getHandType(generic); if (this.mode === 'custom') break; if (this.mode !== 'rfi' && this.mode !== 'def') break; if (!this.isAdaptive) { const felt = document.getElementById('gameFelt'); if (felt) felt.classList.remove('hard-mode-pulse'); break; } if (this.streak < 5) { const felt = document.getElementById('gameFelt'); if (felt) felt.classList.remove('hard-mode-pulse'); break; } if (this.streak < 15) { const felt = document.getElementById('gameFelt'); if (felt) felt.classList.remove('hard-mode-pulse'); if (type !== 'trash' && type !== 'monster') break; } else { if (type === 'marginal') { const felt = document.getElementById('gameFelt'); if (felt) felt.classList.add('hard-mode-pulse'); break; } } } return hand; }
    getGenericHand(cards) { const r1 = cards[0].rank, r2 = cards[1].rank; if (r1 === r2) return `${r1}${r2}`; const suited = cards[0].suit === cards[1].suit ? 's' : 'o'; return `${r1}${r2}${suited}`; }
    getHandType(generic) { const r1 = generic[0]; const r2 = generic[1]; const type = generic.length === 2 ? 'pair' : generic.slice(2); if (type === 'pair' && 'TJQKA'.includes(r1)) return 'monster'; if (r1 === 'A' && 'KQJ'.includes(r2)) return 'monster'; if (r1 === 'K' && r2 === 'Q' && type === 's') return 'monster'; if (type === 'pair' && !'TJQKA'.includes(r1)) return 'marginal'; if (r1 === 'A' && type === 's' && !'KQJT'.includes(r2)) return 'marginal'; if (type === 's') { const i1 = RANK_ORDER[r1]; const i2 = RANK_ORDER[r2]; if ((i1 - i2) <= 2 && i1 >= 3 && i1 <= 10) return 'marginal'; } if (type === 'o') { if (r1 === 'A' && 'T987'.includes(r2) === false) return 'marginal'; if (r1 === 'K' && 'TJ'.includes(r2)) return 'marginal'; if (r1 === 'Q' && r2 === 'J') return 'marginal'; } return 'trash'; }
    nextHand() { const feedback = document.getElementById('feedbackModal'); if (feedback) feedback.classList.add('hidden'); const shop = document.getElementById('shopModal'); if (shop) shop.classList.add('hidden'); const stats = document.getElementById('statsModal'); if (stats) stats.classList.add('hidden'); const save = document.getElementById('saveModal'); if (save) save.classList.add('hidden'); const felt = document.getElementById('gameFelt'); if (felt) felt.classList.remove('hard-mode-pulse'); if (this.cardContainer) { this.cardContainer.style.transition = 'none'; this.cardContainer.style.transform = 'translate(0px, 0px) rotate(0deg)'; } this.isModalOpen = false; this.isPlaying = true; this.isPaused = false; this.wasAutoPaused = false; this.currentHand = this.generateHand(); this.currentScenario = this.setupScenario(); this.drawUI(); this.audio.playDeal(); this.startTimer(true); }
    startTimer(reset = true) { if (this.timer) clearInterval(this.timer); if (reset) this.timeLeft = 100; const bars = [document.getElementById('timerBar'), document.getElementById('desktopTimerBar')]; const updateBars = (colorClass, shadowClass) => { bars.forEach(bar => { if(!bar) return; bar.style.width = `${this.timeLeft}%`; bar.className = `h-full w-full transition-all duration-200 ${colorClass} ${shadowClass}`; }); }; if (reset) updateBars('bg-cyan-500', 'shadow-[0_0_10px_rgba(6,182,212,0.5)]'); this.timer = setInterval(() => { this.timeLeft -= 1; let color = 'bg-cyan-500'; let shadow = 'shadow-[0_0_10px_rgba(6,182,212,0.5)]'; if (this.timeLeft < 50) { color = 'bg-yellow-500'; shadow = 'shadow-[0_0_10px_rgba(234,179,8,0.5)]'; } if (this.timeLeft < 20) { color = 'bg-red-600'; shadow = 'shadow-[0_0_10px_rgba(220,38,38,0.5)]'; } updateBars(color, shadow); if (this.timeLeft <= 0) this.handleInput('timeout'); }, 150); }
    stopTimer() { clearInterval(this.timer); }
    drawUI() { document.getElementById('heroPosText').textContent = this.currentScenario.heroPos; const villainDisplay = document.getElementById('villainDisplay'); if (this.currentScenario.villainPos) { villainDisplay.classList.remove('hidden'); document.getElementById('villainPosText').textContent = this.currentScenario.villainPos; } else { villainDisplay.classList.add('hidden'); } const btnCall = document.getElementById('btnCall'); const desktopBtnCall = document.getElementById('desktopBtnCall'); const raiseLabel = document.getElementById('raiseLabel'); const raiseLabelDesktop = document.getElementById('raiseLabelDesktop'); if (this.currentScenario.type === 'RFI' || this.currentScenario.type === 'CUSTOM') { btnCall.classList.add('hidden'); btnCall.parentElement.classList.remove('grid-cols-3'); btnCall.parentElement.classList.add('grid-cols-2'); if (desktopBtnCall) desktopBtnCall.classList.add('hidden'); if (raiseLabel) raiseLabel.textContent = "RAISE"; if (raiseLabelDesktop) raiseLabelDesktop.textContent = "RAISE"; } else if (this.currentScenario.type === 'VS_3BET') { btnCall.classList.remove('hidden'); btnCall.parentElement.classList.remove('grid-cols-2'); btnCall.parentElement.classList.add('grid-cols-3'); if (desktopBtnCall) desktopBtnCall.classList.remove('hidden'); if (raiseLabel) raiseLabel.textContent = "4-BET"; if (raiseLabelDesktop) raiseLabelDesktop.textContent = "4-BET"; } else { btnCall.classList.remove('hidden'); btnCall.parentElement.classList.remove('grid-cols-2'); btnCall.parentElement.classList.add('grid-cols-3'); if (desktopBtnCall) desktopBtnCall.classList.remove('hidden'); if (raiseLabel) raiseLabel.textContent = "3-BET"; if (raiseLabelDesktop) raiseLabelDesktop.textContent = "3-BET"; } const area = document.getElementById('holeCardsArea'); area.innerHTML = ''; this.currentHand.forEach(card => area.innerHTML += this.createCardHTML(card)); }
    createCardHTML(card) { let suitClass = '', suitIcon = ''; if (card.suit === 's') { suitClass = 'suit-s'; suitIcon = '♠'; } if (card.suit === 'h') { suitClass = 'suit-h'; suitIcon = '♥'; } if (card.suit === 'd') { suitClass = 'suit-d'; suitIcon = '♦'; } if (card.suit === 'c') { suitClass = 'suit-c'; suitIcon = '♣'; } return `<div class="w-28 h-36 md:w-40 md:h-56 card flex flex-col items-center justify-center relative animate-in zoom-in duration-300 slide-in-from-bottom-4"><div class="absolute top-2 left-2.5 text-2xl md:text-3xl font-black ${suitClass}">${card.rank}</div><div class="text-6xl md:text-7xl ${suitClass} drop-shadow-sm">${suitIcon}</div><div class="absolute bottom-2 right-2.5 text-2xl md:text-3xl font-black ${suitClass} rotate-180">${card.rank}</div></div>`; }
    buyItem(itemId, price, type) { if (this.inventory.includes(itemId)) { this.equipped[type] = itemId; this.saveProgress(); this.applyTheme(); this.renderShop(); } else { if (this.bankroll >= price) { this.bankroll -= price; this.inventory.push(itemId); this.equipped[type] = itemId; this.audio.playBuy(); this.saveProgress(); this.applyTheme(); this.renderShop(); this.updateGamificationUI(); this.triggerConfetti(); } else { this.audio.playError(); this.showFloatingText("NOT ENOUGH CASH"); } } this.triggerHaptic(50); }
    renderShop() { document.getElementById('shopBankroll').textContent = Math.floor(this.bankroll).toLocaleString(); const renderGrid = (items, type, containerId) => { const container = document.getElementById(containerId); container.innerHTML = ''; items.forEach(item => { const owned = this.inventory.includes(item.id); const equipped = this.equipped[type] === item.id; const locked = !owned && this.bankroll < item.price; let btnText = owned ? (equipped ? 'EQUIPPED' : 'EQUIP') : `$${item.price.toLocaleString()}`; let btnClass = owned ? (equipped ? 'bg-blue-600 text-white' : 'bg-slate-700 text-white hover:bg-slate-600') : (locked ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-500'); let previewStyle = '', previewContent = ''; if (type === 'felts') previewStyle = `background: radial-gradient(circle, ${item.colors[0]}, ${item.colors[1]})`; else if (type === 'decks') { previewStyle = `background: ${item.bgGrad}; border: 1px solid ${item.border}`; previewContent = '<div class="absolute inset-0 flex items-center justify-center text-2xl font-black opacity-50">♠</div>'; } else if (type === 'protectors') { previewStyle = 'background: #0f172a;'; previewContent = `<div class="absolute inset-0 flex items-center justify-center text-3xl ${item.color}"><i class="ph-fill ${item.icon}"></i></div>`; if (item.id === 'prot_none') previewContent = '<div class="absolute inset-0 flex items-center justify-center text-xs text-slate-500 uppercase font-bold">NONE</div>'; } const el = document.createElement('div'); el.className = `shop-item p-3 rounded-xl bg-slate-900/50 flex flex-col gap-3 ${equipped ? 'equipped' : ''} ${owned ? 'owned' : ''} ${locked ? 'locked' : ''}`; el.onclick = () => !locked ? this.buyItem(item.id, item.price, type.slice(0, -1)) : null; el.innerHTML = `<div class="h-16 w-full rounded-lg shadow-inner relative overflow-hidden flex items-center justify-center" style="${previewStyle}">${previewContent}</div><div class="flex justify-between items-center"><span class="text-xs font-bold text-slate-300 truncate mr-2">${item.name}</span><span class="text-[10px] font-bold px-2 py-1 rounded ${btnClass} whitespace-nowrap">${btnText}</span></div>`; container.appendChild(el); }); }; renderGrid(SHOP_ITEMS.protectors, 'protectors', 'shopProtectors'); renderGrid(SHOP_ITEMS.felts, 'felts', 'shopFelts'); renderGrid(SHOP_ITEMS.decks, 'decks', 'shopDecks'); }
    applyTheme() { const r = document.querySelector(':root'); const felt = SHOP_ITEMS.felts.find(f => f.id === this.equipped.felt); if (felt) { r.style.setProperty('--felt-start', felt.colors[0]); r.style.setProperty('--felt-end', felt.colors[1]); } const deck = SHOP_ITEMS.decks.find(d => d.id === this.equipped.deck); if (deck) { r.style.setProperty('--card-bg', deck.bg); r.style.setProperty('--card-bg-gradient', deck.bgGrad); r.style.setProperty('--card-border', deck.border); if (deck.text === 'white' || deck.text === 'cyber') { r.style.setProperty('--card-spade', '#e2e8f0'); r.style.setProperty('--card-club', '#4ade80'); r.style.setProperty('--card-diamond', '#60a5fa'); } else { r.style.setProperty('--card-spade', '#020617'); r.style.setProperty('--card-club', '#15803d'); r.style.setProperty('--card-diamond', '#2563eb'); } } const prot = SHOP_ITEMS.protectors.find(p => p.id === this.equipped.protector); const protEl = document.getElementById('heroProtector'); if (prot && prot.id !== 'prot_none') { protEl.className = `absolute bottom-0 -right-12 w-10 h-10 animate-float z-20 filter drop-shadow-lg transition-all duration-500 flex items-center justify-center text-3xl ${prot.color}`; protEl.innerHTML = `<i class="ph-fill ${prot.icon}"></i>`; protEl.classList.remove('hidden'); } else { protEl.classList.add('hidden'); } }
    getCurrentLevel() { for (let i = LEVELS.length - 1; i >= 0; i--) { if (this.xp >= LEVELS[i].xp) return { index: i + 1, data: LEVELS[i], next: LEVELS[i+1] }; } return { index: 1, data: LEVELS[0], next: LEVELS[1] }; }
    getLevelData(xp) { for (let i = LEVELS.length - 1; i >= 0; i--) if (xp >= LEVELS[i].xp) return LEVELS[i]; return LEVELS[0]; }
    getMultiplier() { return this.streak >= 10 ? 4 : (this.streak >= 5 ? 2 : 1); }
    loadGame(slotIndex) { const savedData = StorageService.get(`poker_save_slot_${slotIndex}`, null); if (!savedData) return; const data = JSON.parse(savedData); this.applySaveData(data); }
    deleteSave(slotIndex) { StorageService.remove(`poker_save_slot_${slotIndex}`); this.renderSaveSlots(); }
    showFloatingText(amount, isXp = false) { const floatEl = document.getElementById('floatingProfit'); let text = '', classes = ''; if (isXp) { if (typeof amount === 'string') { floatEl.textContent = amount; floatEl.className = "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-xl md:text-3xl font-black text-red-500 bg-slate-900/90 px-4 py-2 rounded-lg border border-red-500/50 shadow-xl animate-pop z-50 pointer-events-none whitespace-nowrap"; } return; } if (amount > 0) { text = `+$${amount}`; classes = "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-5xl md:text-7xl font-black text-emerald-400 drop-shadow-[0_5px_5px_rgba(0,0,0,0.8)] stroke-black animate-pop z-50 pointer-events-none"; } else { text = `-$${Math.abs(amount)}`; classes = "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-5xl md:text-7xl font-black text-red-500 drop-shadow-[0_5px_5px_rgba(0,0,0,0.8)] stroke-black animate-pop z-50 pointer-events-none"; } floatEl.textContent = text; floatEl.className = classes; setTimeout(() => { floatEl.className = "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-sm opacity-0 pointer-events-none transition-opacity duration-200"; }, 1000); }
    showFeedback(isCorrect, correctAction, userAction, earnedCash, earnedXp) { const modal = document.getElementById('feedbackModal'); const title = document.getElementById('feedbackTitle'); const sub = document.getElementById('feedbackSubtitle'); const handDisplay = document.getElementById('feedbackHand'); const rewardDetails = document.getElementById('rewardDetails'); modal.classList.remove('hidden'); modal.classList.add('flex'); this.isModalOpen = true; if (isCorrect) { title.textContent = "CORRECT!"; title.className = "text-4xl font-black italic uppercase tracking-tighter text-emerald-400 drop-shadow-lg neon-text-emerald"; rewardDetails.classList.remove('hidden'); rewardDetails.innerHTML = `<span class="text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]">+ $${earnedCash}</span><span class="text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded border border-blue-500/20 shadow-[0_0_10px_rgba(59,130,246,0.1)]">+ ${earnedXp} XP</span>`; } else { title.textContent = "MISTAKE"; title.className = "text-4xl font-black italic uppercase tracking-tighter text-red-500 drop-shadow-lg"; rewardDetails.classList.add('hidden'); } const handStr = this.getGenericHand(this.currentHand); const pos = this.currentScenario.heroPos; const vil = this.currentScenario.villainPos ? `vs ${this.currentScenario.villainPos}` : ''; const actionText = correctAction === 'raise' ? (this.mode === 'def' ? '3-Bet' : 'Raise') : correctAction.charAt(0).toUpperCase() + correctAction.slice(1); sub.textContent = `${pos} should ${actionText} ${handStr} ${vil}`; const c1 = this.currentHand[0], c2 = this.currentHand[1]; const getColor = (s) => s === 'h' || s === 'd' ? 'text-red-500' : (s === 'c' ? 'text-emerald-500' : 'text-slate-800'); handDisplay.innerHTML = `${c1.rank}<span class="${getColor(c1.suit)}">${getSuit(c1.suit)}</span>${c2.rank}<span class="${getColor(c2.suit)}">${getSuit(c2.suit)}</span>`; const callLegend = document.getElementById('feedbackLegendCall'); if (this.currentScenario.type === 'RFI' || this.currentScenario.type === 'CUSTOM') { callLegend.classList.add('hidden'); } else { callLegend.classList.remove('hidden'); } this.renderMatrix(); }
    renderMatrix() { const grid = document.getElementById('matrixGrid'); grid.innerHTML = ''; const currentGeneric = this.getGenericHand(this.currentHand); let rangeData; if (this.mode === 'custom') { rangeData = { raise: this.customRange }; } else if (this.mode === 'rfi' || (this.mode === 'campaign' && this.currentScenario.type === 'RFI')) { rangeData = RANGES.CASH_6MAX.RFI[this.currentScenario.rangeKey]; } else if (this.mode === 'mtt_rfi') { rangeData = RANGES.MTT_9MAX.RFI[this.currentScenario.rangeKey]; } else if (this.mode === 'vs_3bet') { rangeData = RANGES.CASH_6MAX.VS_3BET[this.currentScenario.rangeKey]; } else { rangeData = RANGES.CASH_6MAX.DEFENSE[this.currentScenario.rangeKey]; } if (!rangeData) return; const info = document.getElementById('matrixInfo'); info.className = "mt-2 h-8 w-[240px] rounded flex items-center justify-center text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-900 border border-white/5 info-box-transition"; info.innerHTML = "Hover for info"; for (let i = 0; i < 13; i++) { for (let j = 0; j < 13; j++) { const r1 = RANKS[12-i], r2 = RANKS[12-j]; let handLabel = '', type = ''; if (i === j) { handLabel = `${r1}${r2}`; type = 'pair'; } else if (i < j) { handLabel = `${r1}${r2}s`; type = 's'; } else { handLabel = `${r2}${r1}o`; type = 'o'; } const genericCode = handLabel; let bgClass = 'bg-slate-800 text-slate-600 border-slate-700/50'; const isRaise = this.checkAction(genericCode, rangeData?.raise, 'raise'); const isCall = this.checkAction(genericCode, rangeData?.call, 'call'); if (isRaise) bgClass = 'bg-emerald-600 text-white border-emerald-500/50 shadow-inner'; else if (isCall) bgClass = 'bg-blue-600 text-white border-blue-500/50 shadow-inner'; if (genericCode === currentGeneric) bgClass += ' ring-2 ring-white z-10 animate-pulse-fast font-black shadow-[0_0_15px_rgba(255,255,255,0.5)] scale-110'; const cell = document.createElement('div'); cell.className = `matrix-cell ${bgClass}`; cell.onmouseenter = () => { let action = "Fold"; let boxClass = "mt-2 h-8 w-[240px] rounded flex items-center justify-center text-[10px] font-black uppercase tracking-widest shadow-lg border info-box-transition "; if(isRaise) { action = "Raise"; boxClass += "bg-emerald-600 border-emerald-400 text-white"; } else if(isCall) { action = "Call"; boxClass += "bg-blue-600 border-blue-400 text-white"; } else { action = "Fold"; boxClass += "bg-slate-700 border-slate-500 text-slate-200"; } info.className = boxClass; info.innerHTML = `${handLabel}: ${action}`; }; grid.appendChild(cell); }} }
    resetStats() { this.handStats = {}; this.saveProgress(); this.renderStats(); }
    renderStats() { const grid = document.getElementById('statsGrid'); grid.innerHTML = ''; const detailEl = document.getElementById('selectedHandStats'); detailEl.className = "mt-2 bg-slate-900/80 p-3 rounded-lg w-[260px] border border-white/10 flex items-center justify-center h-12 info-box-transition text-xs font-bold text-slate-400"; detailEl.textContent = "Tap a cell for details"; for (let i = 0; i < 13; i++) { for (let j = 0; j < 13; j++) { const r1 = RANKS[12-i], r2 = RANKS[12-j]; let handLabel = '', type = ''; if (i === j) { handLabel = `${r1}${r2}`; type = 'pair'; } else if (i < j) { handLabel = `${r1}${r2}s`; type = 's'; } else { handLabel = `${r2}${r1}o`; type = 'o'; } const stats = this.handStats[handLabel] || { w: 0, l: 0 }; const total = stats.w + stats.l; let bgClass = 'bg-slate-800/50 border-slate-700/30 hover:bg-slate-700'; let style = ''; if (total > 0) { const winRate = stats.w / total; const hue = Math.floor(winRate * 120); style = `background-color: hsl(${hue}, 70%, 35%); border-color: rgba(255,255,255,0.1);`; } const cell = document.createElement('div'); cell.className = `matrix-cell transition-colors duration-100 ${total === 0 ? bgClass : ''}`; if (style) cell.style = style; cell.onclick = () => { const rate = total > 0 ? Math.round((stats.w / total) * 100) : 0; let msg = "", boxClass = "mt-2 p-3 rounded-lg w-[260px] border flex items-center justify-center h-12 info-box-transition text-xs font-bold shadow-lg "; if (total === 0) { msg = "No Data"; boxClass += "bg-slate-800 border-slate-600 text-slate-400"; } else { if (rate < 50) { msg = `${handLabel} LEAK (${rate}%)`; boxClass += "bg-red-600 border-red-400 text-white"; } else if (rate > 80) { msg = `${handLabel} MASTERED (${rate}%)`; boxClass += "bg-emerald-600 border-emerald-400 text-white"; } else { msg = `${handLabel} OK (${rate}%)`; boxClass += "bg-yellow-600 border-yellow-400 text-white"; } } detailEl.innerHTML = msg; detailEl.className = boxClass; }; grid.appendChild(cell); }} }
    triggerConfetti() { confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 }, colors: ['#10b981', '#34d399', '#6ee7b7', '#ffffff'], disableForReducedMotion: true }); }
}
