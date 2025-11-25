// js/data.js

export const SHOP_ITEMS = {
    protectors: [
        { id: 'prot_none', name: 'None', price: 0, icon: '', color: '' },
        { id: 'prot_chip', name: 'Lucky Chip', price: 500, icon: 'ph-poker-chip', color: 'text-red-500' },
        { id: 'prot_spade', name: 'Golden Spade', price: 2000, icon: 'ph-spade', color: 'text-yellow-400' },
        { id: 'prot_skull', name: 'Dead Man\'s Hand', price: 5000, icon: 'ph-skull', color: 'text-slate-300' },
        { id: 'prot_8ball', name: 'The 8-Ball', price: 7500, icon: 'ph-number-circle-eight', color: 'text-white' },
        { id: 'prot_crown', name: 'Golden Crown', price: 10000, icon: 'ph-crown', color: 'text-yellow-400' },
        { id: 'prot_dice', name: 'High Roller Dice', price: 15000, icon: 'ph-dice-five', color: 'text-emerald-400' },
        { id: 'prot_diamond', name: 'Blue Diamond', price: 25000, icon: 'ph-diamond', color: 'text-blue-400' },
    ],
    felts: [
        { id: 'felt_emerald', name: 'Classic Emerald', price: 0, colors: ['#064e3b', '#022c22'] },
        { id: 'felt_royal', name: 'Royal Blue', price: 1000, colors: ['#1e3a8a', '#172554'] },
        { id: 'felt_crimson', name: 'Crimson Red', price: 2500, colors: ['#7f1d1d', '#450a0a'] },
        { id: 'felt_concrete', name: 'Underground', price: 5000, colors: ['#374151', '#111827'] },
        { id: 'felt_purple', name: 'Purple Haze', price: 7500, colors: ['#4c1d95', '#1e1b4b'] },
        { id: 'felt_sunset', name: 'Sunset Strip', price: 8000, colors: ['#be123c', '#431407'] },
        { id: 'felt_void', name: 'Void Black', price: 10000, colors: ['#000000', '#0f172a'] }
    ],
    decks: [
        { id: 'deck_standard', name: 'Standard White', price: 0, bg: '#ffffff', bgGrad: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', border: 'rgba(0,0,0,0.1)', text: 'default' },
        { id: 'deck_midnight', name: 'Midnight Black', price: 2000, bg: '#1e293b', bgGrad: 'linear-gradient(135deg, #334155 0%, #1e293b 100%)', border: 'rgba(255,255,255,0.1)', text: 'white' },
        { id: 'deck_ruby', name: 'Ruby Luxury', price: 5000, bg: '#7f1d1d', bgGrad: 'linear-gradient(135deg, #991b1b 0%, #450a0a 100%)', border: '#fca5a5', text: 'white' },
        { id: 'deck_stealth', name: 'Stealth Ops', price: 6000, bg: '#3f3f46', bgGrad: 'linear-gradient(135deg, #52525b 0%, #27272a 100%)', border: '#18181b', text: 'white' },
        { id: 'deck_gold', name: 'Luxury Gold', price: 7500, bg: '#fef3c7', bgGrad: 'linear-gradient(135deg, #fef3c7 0%, #d97706 100%)', border: '#b45309', text: 'dark' },
        { id: 'deck_cyber', name: 'Neon Cyber', price: 15000, bg: '#18181b', bgGrad: 'linear-gradient(135deg, #27272a 0%, #09090b 100%)', border: '#ec4899', text: 'cyber' }
    ]
};

export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
export const RANK_ORDER = { '2':0, '3':1, '4':2, '5':3, '6':4, '7':5, '8':6, '9':7, 'T':8, 'J':9, 'Q':10, 'K':11, 'A':12 };
export const SUITS = ['s', 'h', 'd', 'c'];
export const POSITIONS_6MAX = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
export const POSITIONS_9MAX = ['UTG', 'UTG+1', 'UTG+2', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'];

export const RANGES = {
    CASH_6MAX: {
        RFI: {
            'UTG': { raise: ["66+", "A2s+", "K9s+", "Q9s+", "J9s+", "T9s", "98s", "87s", "ATo+", "KJo+", "QJo"] },
            'HJ':  { raise: ["44+", "A2s+", "K9s+", "Q9s+", "J9s+", "T9s", "98s", "87s", "76s", "ATo+", "KJo+", "QJo", "JTo"] },
            'CO':  { raise: ["22+", "A2s+", "K8s+", "Q9s+", "J8s+", "T8s+", "98s", "87s", "76s", "65s", "54s", "A8o+", "KTo+", "QTo+", "JTo", "T9o"] },
            'BTN': { raise: ["22+", "A2s+", "K2s+", "Q4s+", "J6s+", "T7s+", "97s+", "86s+", "75s+", "65s", "54s", "A2o+", "K8o+", "Q9o+", "J9o+", "T9o", "98o"] },
            'SB':  { raise: ["22+", "A2s+", "K2s+", "Q4s+", "J6s+", "T7s+", "97s+", "87s", "76s", "65s", "A2o+", "K8o+", "Q9o+", "J9o+", "T9o", "98o"] },
            'BB': { raise: [] }
        },
        DEFENSE: {
             'BB_vs_UTG': { raise: ["QQ+", "AKs", "AKo", "A2s-A5s"], call: ["22-JJ", "A6s-AQs", "K9s-KQs", "Q9s-QJs", "J9s-JTs", "T8s-T9s", "98s", "87s", "76s", "65s", "ATo-AQo", "KJo-KQo", "QJo"] },
            'BB_vs_HJ': { raise: ["JJ+", "AQs+", "AKo", "A2s-A5s", "K9s", "T9s", "98s"], call: ["22-TT", "A6s-AJs", "K9s-KJs", "Q9s-QJs", "J8s+", "T8s", "87s", "76s", "65s", "54s", "ATo-AQo", "KJo-KQo", "QJo", "JTo"] },
            'BB_vs_CO': { raise: ["TT+", "AJs+", "AQo+", "A2s-A5s", "K9s", "Q9s", "J9s", "T9s", "98s", "87s"], call: ["22-99", "A6s-ATs", "K5s-KTs", "Q5s-QTs", "J7s+", "T7s+", "76s", "65s", "54s", "43s", "A8o-AJo", "KTo-KQo", "QTo-QJo", "JTo"] },
            'BB_vs_BTN': { raise: ["TT+", "AJs+", "KQs", "AQo+", "A2s-A5s", "K9s", "Q9s", "J9s", "T8s+", "98s", "87s", "76s"], call: ["22-99", "A6s-ATs", "K2s-KJs", "Q2s-QJs", "J5s+", "T6s", "96s+", "86s", "65s", "54s", "43s", "A2o-AJo", "K8o-KQo", "Q8o-QJo", "J8o-JTo", "T8o+", "98o"] },
            'BB_vs_SB': { raise: ["99+", "ATs+", "KJs+", "QJs", "AJo+", "KQo", "KJo"], call: ["22-88", "A2s-A9s", "K2s-KTs", "Q2s-QTs", "J4s+", "T6s+", "96s+", "85s+", "75s+", "64s+", "53s+", "43s", "A2o-AJo", "K2o-KTo", "Q4o-QTo", "J7o-JTo", "T7o-T9o", "97o+", "87o"] }
        },
        VS_3BET: {
            'UTG_vs_HJ': { raise: ["KK+", "AKs"], call: ["QQ-88", "AJs+", "KQs", "AQo+"] },
            'UTG_vs_CO': { raise: ["QQ+", "AKs", "AKo"], call: ["JJ-77", "AJs-ATs", "KQs-KJs", "QJs", "JTs", "AQo"] },
            'UTG_vs_BTN': { raise: ["QQ+", "AKs", "AKo", "A5s-A4s"], call: ["JJ-66", "AQs-ATs", "KQs-KTs", "QJs-QTs", "JTs", "T9s", "98s", "AQo-AJo"] },
            'UTG_vs_SB': { raise: ["KK+", "AKs", "A5s"], call: ["QQ-66", "AQs-ATs", "KQs-KTs", "QJs-QTs", "JTs", "T9s", "AQo"] },
            'UTG_vs_BB': { raise: ["KK+", "AKs"], call: ["QQ-66", "AQs-ATs", "KQs-KTs", "QJs-QTs", "JTs", "T9s", "AQo"] },
            'HJ_vs_CO': { raise: ["QQ+", "AKs", "AKo", "A5s-A4s"], call: ["JJ-66", "AQs-ATs", "KQs-KTs", "QJs-QTs", "JTs", "T9s", "AQo"] },
            'HJ_vs_BTN': { raise: ["JJ+", "AKs", "AKo", "A5s-A3s", "K9s", "Q9s"], call: ["TT-55", "AQs-ATs", "KQs-KTs", "QJs-QTs", "JTs-J9s", "T9s", "98s", "87s", "AQo-AJo"] },
            'HJ_vs_SB': { raise: ["QQ+", "AKs", "AKo", "A5s"], call: ["JJ-66", "AQs-ATs", "KQs-KTs", "QJs-QTs", "JTs", "T9s", "AQo"] },
            'HJ_vs_BB': { raise: ["QQ+", "AKs", "AKo"], call: ["JJ-66", "AQs-ATs", "KQs-KTs", "QJs-QTs", "JTs", "T9s", "AQo"] },
            'CO_vs_BTN': { raise: ["TT+", "AQs+", "AKo", "A5s-A2s", "K8s", "K7s", "Q8s", "J8s"], call: ["99-44", "AJs-A8s", "KQs-KTs", "QJs-QTs", "JTs-J9s", "T9s", "98s", "87s", "76s", "AQo-ATo", "KQo-KJo"] },
            'CO_vs_SB': { raise: ["JJ+", "AKs", "AKo", "A5s-A4s"], call: ["TT-55", "AQs-ATs", "KQs-KTs", "QJs-QTs", "JTs", "T9s", "98s", "AQo-AJo"] },
            'CO_vs_BB': { raise: ["JJ+", "AKs", "AKo", "A5s"], call: ["TT-55", "AQs-ATs", "KQs-KTs", "QJs-QTs", "JTs", "T9s", "98s", "AQo-AJo"] },
            'BTN_vs_SB': { raise: ["TT+", "AQs+", "AKo", "A5s-A2s", "K9s", "Q9s"], call: ["99-44", "AJs-A6s", "KQs-K9s", "QJs-Q9s", "JTs-J9s", "T9s-T8s", "98s", "87s", "76s", "65s", "AQo-ATo", "KQo-KTo", "QJo", "JTo"] },
            'BTN_vs_BB': { raise: ["TT+", "AQs+", "AKo", "A5s-A3s", "K9s-K8s"], call: ["99-22", "AJs-A2s", "KQs-K5s", "QJs-Q8s", "JTs-J8s", "T9s-T7s", "98s-97s", "87s-86s", "76s", "65s", "54s", "AQo-A9o", "KQo-KTo", "QJo-QTo", "JTo"] }
        }
    },
    MTT_9MAX: {
         RFI: {
            'UTG': { raise: ["77+", "AJs+", "KQs", "AQo+"] }, 'UTG+1': { raise: ["77+", "ATs+", "KJs+", "AQo+"] }, 'UTG+2': { raise: ["66+", "ATs+", "KJs+", "QJs", "AQo+"] }, 'LJ': { raise: ["55+", "A9s+", "KTs+", "QTs+", "JTs", "AJo+", "KQo"] }, 'HJ': { raise: ["44+", "A5s+", "K9s+", "Q9s+", "J9s+", "T9s", "ATo+", "KJo+", "QJo"] },
            'CO': { raise: ["22+", "A2s+", "K6s+", "Q8s+", "J8s+", "T8s+", "98s", "87s", "A9o+", "KTo+", "QTo+", "JTo"] }, 'BTN': { raise: ["22+", "A2s+", "K2s+", "Q5s+", "J7s+", "T7s+", "97s+", "87s", "76s", "65s", "A2o+", "K7o+", "Q9o+", "J9o+", "T9o"] }, 'SB': { raise: ["22+", "A2s+", "K4s+", "Q6s+", "J8s+", "T8s+", "98s", "87s", "A7o+", "K9o+", "Q9o+", "J9o+"] }, 'BB': { raise: [] }
         }
    }
};

export const LEVELS = [
    { name: "Micro Fish", xp: 0 }, { name: "Table Captain", xp: 500 }, { name: "Grinder", xp: 1500 }, { name: "Shark", xp: 3000 }, { name: "GTO Wizard", xp: 6000 }, { name: "End Boss", xp: 10000 }
];

export const CAMPAIGN_LEVELS = [
     { name: "The Rock", desc: "Early Position Discipline", target: 7, bonus: 500, config: { type: 'RFI', allowedPos: ['UTG', 'HJ'] } },
     { name: "The Thief", desc: "Steal the Blinds", target: 7, bonus: 1000, config: { type: 'RFI', allowedPos: ['CO', 'BTN'] } },
     { name: "Blind War", desc: "Small Blind Aggression", target: 7, bonus: 2000, config: { type: 'RFI', allowedPos: ['SB'] } },
     { name: "The Defender", desc: "Defend the Big Blind", target: 7, bonus: 5000, config: { type: 'DEFENSE', allowedPos: ['BB'] } },
     { name: "GTO Master", desc: "Total Mastery", target: 99999, bonus: 0, config: { type: 'MIXED', allowedPos: [] } }
];
