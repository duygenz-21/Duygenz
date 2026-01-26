/**
 * ==========================================================================================
 * 🚀 AI STREAMING PRO - CORE ENGINE v5.3 (FIXED & OPTIMIZED)
 * ==========================================================================================
 * - Fixed: DB_CONFIG hoisting issue (Lỗi biến chưa khởi tạo).
 * - Fixed: Syntax errors (Dấu ngoặc thừa).
 * - Organized: Code structure for better performance.
 */

/**
 * ==========================================================================================
 * 1. CONFIGURATION & DATABASE SETUP (MUST BE FIRST)
 * ==========================================================================================
 */

const LICENSE_CONFIG = {
    FREE_CHAT_LIMIT: 15,          // 15 lượt chat thường miễn phí
    FREE_FEATURE_LIMIT: 3,       // 3 lượt cho mỗi tính năng VIP
    SUPABASE_URL: 'https://uqchbponkvxkbdkpkgub.supabase.co', // ⚠️ THAY URL CỦA BẠN
    SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxY2hicG9ua3Z4a2Jka3BrZ3ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyNjIxMDYsImV4cCI6MjA4NDgzODEwNn0.9xkQlWLymaxd3pndmVUr5TGWdJYwT7lIXM993QKtF3Q' // ⚠️ THAY KEY CỦA BẠN
};

const DB_CONFIG = {
    NAME: 'UltimateAIChatDB',
    VERSION: 1,
    STORES: {
        CHAT: 'chat_history',      
        LICENSE: 'user_license',   
        USAGE: 'usage_tracking'    
    }
};

/**
 * ==========================================================================================
 * 2. INDEXEDDB HELPER FUNCTIONS (CORE STORAGE)
 * ==========================================================================================
 */

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_CONFIG.NAME, DB_CONFIG.VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            Object.values(DB_CONFIG.STORES).forEach(store => {
                if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
            });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function dbPut(storeName, key, value) {
    const db = await openDB();
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value, key);
    return tx.complete;
}

async function dbGet(storeName, key) {
    const db = await openDB();
    return new Promise((resolve) => {
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).get(key);
        req.onsuccess = () => resolve(req.result);
    });
}

async function dbDelete(storeName, key) {
    const db = await openDB();
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    return tx.complete;
}

/**
 * ==========================================================================================
 * 3. GLOBAL VARIABLES & STATE MANAGEMENT
 * ==========================================================================================
 */

// User & Session State
let currentSessionId = 'session_' + new Date().getTime(); 
let usageData = {
    freeChatUsed: parseInt(localStorage.getItem('free_chat_used') || '0'),
    freeDebateUsed: parseInt(localStorage.getItem('free_debate_used') || '0'),
    freeSynthesisUsed: parseInt(localStorage.getItem('free_synthesis_used') || '0'),
    freeVisionUsed: parseInt(localStorage.getItem('free_vision_used') || '0'),
    freeSquadUsed: parseInt(localStorage.getItem('free_squad_used') || '0'),
    lastResetDate: localStorage.getItem('last_reset_date') || new Date().toDateString()
};

let securityState = {
    // Mặc định check ở tin thứ 5
    nextCheckAt: parseInt(localStorage.getItem('sec_next_check') || '5'), 
    // Khoảng cách ban đầu là 5
    currentGap: parseInt(localStorage.getItem('sec_current_gap') || '5')   
};

let messageCounter = parseInt(localStorage.getItem('security_msg_counter') || '0');

// Resources & Workers
const RESOURCES = {
    tesseract: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',
    pyodide: 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js',
    pdfjs: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    pdfWorker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
};

let activeWorkers = { ocr: null, ocrTimer: null };
let abortControllers = [];
let pendingVisionImages = []; 
let currentFileContent = null;
let currentFileName = null;
let pyodideReady = false;
let pyodideObj = null;

// Chat Config
const DEFAULT_URL = "https://openrouter.ai/api/v1/chat/completions";
const REQUIRED_SYSTEM_PROMPT =`Role: Clear Explainer.   
Primary: Detailed text  + visual (More visual than text).                
Visuals: Use ASCII art frequently.
Format: Wrap ASCII art in text.         
FILES: Deep analysis + Tables.  
Math: Brift only. $ inline, $$ block.   
STYLE: Combine text with ASCII art.`;

const WELCOME_HTML = `
    <div class="ai-response-group">
        <div class="ai-card border-purple-500/50">
            <div class="ai-header"><span class="ai-model-name"><i class="fas fa-bolt text-yellow-400"></i> System v5.3 (License Integrated)</span></div>
            <div class="ai-bubble">
                Chào sếp! <b>AI Streaming Pro v5.3</b> đã khởi động! 🏎️<br><br>
                🔐 <b>License System:</b> Quản lý lượt dùng Free/Premium chặt chẽ.<br>
                💤 <b>MoE Architecture:</b> Các thư viện nặng chỉ thức dậy khi gọi.<br>
                🎨 <b>Color & Highlight:</b> Code và Markdown rực rỡ.<br>
                👁️ <b>Vision Mode:</b> Soi ảnh siêu cấp.<br>
                🚀 <b>Squad Mode:</b> Đua nhiều model cùng lúc.<br><br>
                <i>Nhập API Key và License trong cài đặt để bắt đầu đua nhé!</i>
            </div>
        </div>
    </div>`;

let config = {
    apiKey: localStorage.getItem('chat_api_key') || '',
    customUrl: localStorage.getItem('chat_custom_url') || '',
    models: JSON.parse(localStorage.getItem('chat_models_list') || '["openai/gpt-oss-120b"]'),
    systemPrompt: REQUIRED_SYSTEM_PROMPT,
    temperature: parseFloat(localStorage.getItem('chat_temperature') || '0.7'),
    topP: parseFloat(localStorage.getItem('chat_top_p') || '1.0'),
    isSquadMode: false,
    useVision: localStorage.getItem('chat_use_vision') === 'true',
    visionModel: localStorage.getItem('chat_vision_model') || '',
};

let chatHistory = [{ role: "system", content: config.systemPrompt }];

// DOM Elements
const messagesArea = document.getElementById('messagesArea');
const userInput = document.getElementById('userInput');
const squadModeToggle = document.getElementById('squadModeToggle');
const settingsModal = document.getElementById('settingsModal');

/**
 * ==========================================================================================
 * 4. SYSTEM INITIALIZATION
 * ==========================================================================================
 */

async function initChat() {
    console.log("🚀 System initializing (FRESH START MODE)...");
    
    // 1. Chạy khôi phục License (nhưng không load chat cũ)
    await restoreSystemState();
    
    // 2. Cập nhật trạng thái hiển thị trên Header (VIP/Free)
    renderHeaderStatus();

    // 3. BẮT BUỘC: Luôn hiển thị màn hình Welcome mặc định
    messagesArea.innerHTML = WELCOME_HTML;
    
    // 4. Reset biến lưu trữ chat về ban đầu
    chatHistory = [{ role: "system", content: config.systemPrompt }];
    
    // 5. Tạo một ID phiên làm việc MỚI TINH (Dựa theo thời gian thực)
    // Các session cũ đã được lưu trong DB, sếp vào phần Lịch sử để xem lại.
    currentSessionId = 'session_' + new Date().getTime();
    console.log(`✨ New Session ID: ${currentSessionId}`);

    // 6. Cấu hình hiển thị Code (Highlight)
    if(window.marked && window.hljs) {
        marked.setOptions({
            highlight: function(code, lang) {
                if (lang && hljs.getLanguage(lang)) {
                    return hljs.highlight(code, { language: lang }).value;
                }
                return hljs.highlightAuto(code).value;
            },
            breaks: true
        });
    }

    // 7. Các thủ tục kiểm tra định kỳ
    checkAndResetDailyUsage(); // Reset lượt free nếu qua ngày mới
    updateLicenseStatusDisplay(); // Cập nhật giao diện License
}

/**
 * ==========================================================================================
 * 5. HISTORY & SESSION MANAGEMENT
 * ==========================================================================================
 */

async function toggleHistoryPanel() {
    const panel = document.getElementById('historyPanel');
    const listContainer = document.getElementById('historyList');
    
    if (!panel || !listContainer) return console.error("Thiếu ID HTML History!");

    panel.classList.toggle('active'); 

    if (panel.classList.contains('active')) {
        listContainer.innerHTML = '<div class="text-center text-slate-500"><i class="fas fa-spinner fa-spin"></i> Đang tải...</div>';
        await renderHistoryList(listContainer);
    }
}

async function renderHistoryList(container) {
    const db = await openDB();
    const tx = db.transaction(DB_CONFIG.STORES.CHAT, 'readonly');
    const store = tx.objectStore(DB_CONFIG.STORES.CHAT);
    const request = store.getAll(); 

    request.onsuccess = () => {
        const sessions = request.result.filter(s => s.id !== 'current_session'); // Lọc bỏ session tạm
        container.innerHTML = ''; 

        sessions.sort((a, b) => b.lastActive - a.lastActive);

        if (sessions.length === 0) {
            container.innerHTML = '<div class="text-xs text-slate-500 text-center p-2">Trống trơn...</div>';
            return;
        }

        sessions.forEach(session => {
            const dateStr = new Date(session.lastActive).toLocaleString('vi-VN');
            const isActive = session.id === currentSessionId ? 'border-green-500 bg-slate-800' : 'border-slate-700';

            const itemHTML = `
                <div class="history-item p-3 mb-2 rounded border ${isActive} hover:bg-slate-700 cursor-pointer transition-all relative group" 
                     onclick="loadSession('${session.id}')">
                    <div class="font-bold text-sm text-slate-200 truncate pr-6">${session.title}</div>
                    <div class="text-[10px] text-slate-400 mt-1"><i class="far fa-clock"></i> ${dateStr}</div>
                    <button onclick="deleteSession('${session.id}', event)" 
                            class="absolute top-2 right-2 text-red-400 opacity-0 group-hover:opacity-100 hover:text-red-300">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', itemHTML);
        });
    };
}

async function loadSession(sessionId) {
    if (sessionId === currentSessionId) return; 

    const session = await dbGet(DB_CONFIG.STORES.CHAT, sessionId);
    if (session) {
        currentSessionId = session.id;
        chatHistory = session.history;
        messagesArea.innerHTML = session.html;
        
        messagesArea.scrollTop = messagesArea.scrollHeight;
        if(typeof attachRunButtons === 'function') attachRunButtons();

        document.getElementById('historyPanel').classList.remove('active');
        console.log(`📂 Đã mở lại: ${session.title}`);
    }
}

async function deleteSession(sessionId, event) {
    event.stopPropagation();
    if(!confirm("Xóa vĩnh viễn cuộc trò chuyện này?")) return;

    await dbDelete(DB_CONFIG.STORES.CHAT, sessionId);
    
    if (sessionId === currentSessionId) {
        messagesArea.innerHTML = WELCOME_HTML;
        chatHistory = [{ role: "system", content: config.systemPrompt }];
        currentSessionId = 'session_' + new Date().getTime();
    }
    
    const listContainer = document.getElementById('historyList');
    renderHistoryList(listContainer);
}

function startNewChat() {
    currentSessionId = 'session_' + new Date().getTime();
    chatHistory = [{ role: "system", content: config.systemPrompt }];
    messagesArea.innerHTML = WELCOME_HTML;
    document.getElementById('historyPanel')?.classList.remove('active');
} 

/**
 * ==========================================================================================
 * 6. LICENSE & USAGE LOGIC
 * ==========================================================================================
 */

function checkAndResetDailyUsage() {
    const today = new Date().toDateString();
    
    if (usageData.lastResetDate !== today) {
        
        // 1. Reset các giới hạn Free cũ (Giữ nguyên logic cũ)
        Object.keys(usageData).forEach(key => {
            if (key.startsWith('free') && key.endsWith('Used')) {
                usageData[key] = 0;
                localStorage.setItem(key, '0');
            }
        });

        // 2. [MỚI] Reset logic check giãn cách về mặc định (dễ thở)
        securityState.nextCheckAt = 5;
        securityState.currentGap = 5;
        localStorage.setItem('sec_next_check', '5');
        localStorage.setItem('sec_current_gap', '5');
        
        // 3. [MỚI] Reset đếm tin nhắn tổng về 0
        messageCounter = 0; 
        localStorage.setItem('security_msg_counter', '0');

        // 4. Lưu ngày mới
        usageData.lastResetDate = today;
        localStorage.setItem('last_reset_date', today);
        console.log('🔄 New Day: Đã reset toàn bộ giới hạn và bộ đếm Security.');
    }
}


async function saveSmartState() {
    const now = new Date().getTime(); 
    let firstUserMsg = chatHistory.find(m => m.role === 'user')?.content || "Cuộc trò chuyện mới";
    if (firstUserMsg.length > 40) firstUserMsg = firstUserMsg.substring(0, 40) + "...";

    const chatData = {
        id: currentSessionId,
        title: firstUserMsg,
        history: chatHistory,
        html: messagesArea.innerHTML,
        lastActive: now
    };
    
    // Lưu 2 bản: Vào list và vào session hiện tại (để resume)
    await dbPut(DB_CONFIG.STORES.CHAT, currentSessionId, chatData);
    await dbPut(DB_CONFIG.STORES.CHAT, 'current_session', chatData);
}    

async function saveLicenseSecurely(key, data) {
    await dbPut(DB_CONFIG.STORES.LICENSE, 'active_key', {
        key: key,
        data: data,
        activatedAt: new Date().getTime()
    });
}

async function syncUsageToDB() {
    await dbPut(DB_CONFIG.STORES.USAGE, 'daily_stats', usageData);
}

async function restoreSystemState() {
    console.log("♻️ System: Kiểm tra dữ liệu khôi phục...");

    // 1. Chỉ khôi phục License (Quan trọng để không bắt nhập lại Key)
    try {
        const savedLicense = await dbGet(DB_CONFIG.STORES.LICENSE, 'active_key');
        if (savedLicense) {
            // Nếu localStorage bị xóa nhưng DB còn, thì nạp lại vào localStorage
            if (!localStorage.getItem('license_key')) {
                localStorage.setItem('license_key', savedLicense.key);
                localStorage.setItem('license_data', JSON.stringify(savedLicense.data));
                console.log('✅ License đã được khôi phục từ Database.');
            }
        }
    } catch (e) {
        console.warn("⚠️ Không thể đọc License từ DB:", e);
    }

    // 2. TRẢ VỀ FALSE
    // Báo hiệu cho hệ thống biết là: "Không có session cũ nào được load đâu, hãy tạo mới đi!"
    return false; 
}


/**
 * [NEW] Hàm check ngầm License với Server
 * Chạy background, không ảnh hưởng trải nghiệm trừ khi phát hiện gian lận.
 */
async function performSilentSecurityCheck() {
    const key = localStorage.getItem('license_key');
    if (!key) return; // Không có key thì thôi, để logic Free lo

    console.log(`🕵️ Security Check: Đang kiểm tra ngầm tại mốc tin nhắn thứ ${messageCounter}...`);    
    const result = await validateLicenseKey(key);

    if (!result.valid) {
        console.warn('🚨 PHÁT HIỆN GIAN LẬN/HẾT HẠN: ' + result.message);
        
        // 1. Xóa sạch dấu vết Key ngay lập tức
        localStorage.removeItem('license_key');
        localStorage.removeItem('license_data');
        await dbDelete(DB_CONFIG.STORES.LICENSE, 'active_key'); // Xóa cả trong DB

        // 2. Thông báo và "đá" về chế độ Free
        alert(`⚠️ CẢNH BÁO BẢO MẬT\n\nLicense của bạn không còn hợp lệ sau đợt kiểm tra định kỳ.\nLý do: ${result.message}\n\nHệ thống sẽ chuyển về chế độ FREE.`);
        
        // 3. Cập nhật lại giao diện ngay lập tức
        updateLicenseStatusDisplay(); 
        renderHeaderStatus();
    } else {
        console.log('✅ Security Check: License vẫn "sống" tốt.');
        const newData = { expiresAt: result.expiresAt, daysLeft: result.daysLeft };
        localStorage.setItem('license_data', JSON.stringify(newData));
        await saveLicenseSecurely(key, newData); 
    }
}

async function validateLicenseKey(key) {
    try {
        // 1. Lấy thông tin License hiện tại
        const response = await fetch(`${LICENSE_CONFIG.SUPABASE_URL}/rest/v1/licenses?license_key=eq.${encodeURIComponent(key)}&select=*`, {
            headers: {
                'apikey': LICENSE_CONFIG.SUPABASE_KEY,
                'Authorization': `Bearer ${LICENSE_CONFIG.SUPABASE_KEY}`
            }
        });
        
        if (!response.ok) throw new Error('API error');
        const data = await response.json();
        
        if (data.length === 0) return { valid: false, message: 'License key không tồn tại!' };
        
        const license = data[0];
        const now = new Date();
        const expiresAt = new Date(license.expires_at);
        
        // --- CÁC BƯỚC KIỂM TRA ---

        // Check 1: Hết hạn ngày
        if (expiresAt < now) return { valid: false, message: 'License đã hết hạn ngày sử dụng!' };

        // Check 2: License bị khóa
        if (!license.is_active) return { valid: false, message: 'License đã bị vô hiệu hóa bởi Admin!' };

        // Check 3: Hết lượt chat (Quota)
        if (license.max_usage_count !== null && license.usage_count >= license.max_usage_count) {
            return { valid: false, message: 'Gói này đã dùng hết tổng số tin nhắn cho phép!' };
        }

        // --- CẬP NHẬT USAGE LÊN SERVER ---
        // [FIXED] Đã xóa dòng chữ tiếng Việt thừa gây lỗi ở đây
        const usageToAdd = securityState.currentGap > 0 ? securityState.currentGap : 1;
        const newUsage = (license.usage_count || 0) + usageToAdd;

        // Gọi API Patch để update số lượt dùng
        fetch(`${LICENSE_CONFIG.SUPABASE_URL}/rest/v1/licenses?license_key=eq.${encodeURIComponent(key)}`, {
            method: 'PATCH',
            headers: {
                'apikey': LICENSE_CONFIG.SUPABASE_KEY,
                'Authorization': `Bearer ${LICENSE_CONFIG.SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ usage_count: newUsage })
        }).catch(err => console.warn("Lỗi update usage:", err));

        return { 
            valid: true, 
            expiresAt: license.expires_at,
            daysLeft: Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24))
        };

    } catch (error) {
        console.error('License Check Error:', error);
        return { valid: false, message: 'Lỗi kết nối Server kiểm tra License.' };
    }
}


function checkFeaturePermission(feature) {
    checkAndResetDailyUsage();
    
    const licenseKey = localStorage.getItem('license_key');
    if (licenseKey) {
        const licenseData = JSON.parse(localStorage.getItem('license_data') || '{}');
        const now = new Date();
        const expiresAt = new Date(licenseData.expiresAt);
        
        if (expiresAt > now) {
            return { allowed: true, type: 'license', daysLeft: licenseData.daysLeft };
        } else {
            localStorage.removeItem('license_key');
            localStorage.removeItem('license_data');
            alert('⚠️ License của bạn đã hết hạn. Hệ thống sẽ chuyển về chế độ Free.');
        }
    }
    
    const limits = {
        'chat': { max: LICENSE_CONFIG.FREE_CHAT_LIMIT, usedKey: 'freeChatUsed', name: 'Chat thường' },
        'debate': { max: LICENSE_CONFIG.FREE_FEATURE_LIMIT, usedKey: 'freeDebateUsed', name: 'Debate Mode' },
        'synthesis': { max: LICENSE_CONFIG.FREE_FEATURE_LIMIT, usedKey: 'freeSynthesisUsed', name: 'Synthesis Mode' },
        'vision': { max: LICENSE_CONFIG.FREE_FEATURE_LIMIT, usedKey: 'freeVisionUsed', name: 'Vision AI' },
        'squad': { max: LICENSE_CONFIG.FREE_FEATURE_LIMIT, usedKey: 'freeSquadUsed', name: 'Squad Mode' }
    };
    
    const limit = limits[feature];
    if (!limit) return { allowed: true, type: 'free' }; 
    
    if (usageData[limit.usedKey] >= limit.max) {
        return { 
            allowed: false, 
            type: 'free',
            message: `🚫 HẾT LƯỢT FREE!\nBạn đã dùng hết ${limit.max} lượt ${limit.name} hôm nay.\nVui lòng nhập License để mở khóa không giới hạn.`
        };
    }
    
    usageData[limit.usedKey]++;
    localStorage.setItem(limit.usedKey, usageData[limit.usedKey].toString());
    syncUsageToDB();    
    return { 
        allowed: true, 
        type: 'free', 
        remaining: limit.max - usageData[limit.usedKey]
    };
}

function updateLicenseStatusDisplay() {
    const licenseKey = localStorage.getItem('license_key');
    const licenseData = JSON.parse(localStorage.getItem('license_data') || '{}');
    const contentDiv = document.getElementById('licenseStatusContent');
    const daysDiv = document.getElementById('licenseDaysLeft'); // Note: HTML might need this div if not present
    
    if (!contentDiv) return;

    if (licenseKey && licenseData.expiresAt) {
        const daysLeft = Math.ceil((new Date(licenseData.expiresAt) - new Date()) / (1000 * 60 * 60 * 24));
        contentDiv.innerHTML = `<div class="text-green-400 font-bold"><i class="fas fa-crown text-yellow-400"></i> LICENSE HỢP LỆ (Còn ${daysLeft} ngày)</div>`;
    } else {
        contentDiv.innerHTML = `<div class="text-blue-400"><i class="fas fa-leaf"></i> CHẾ ĐỘ FREE</div>`;
    }
}

async function handleActivateLicense() {
    const key = document.getElementById('licenseKeyInput').value.trim();
    if (!key) return alert('Vui lòng nhập Key!');
    
    const btn = document.querySelector('button[onclick="handleActivateLicense()"]');
    const originHTML = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    
    const result = await validateLicenseKey(key);
    btn.innerHTML = originHTML;
    
    if (result.valid) {
        localStorage.setItem('license_key', key);
        localStorage.setItem('license_data', JSON.stringify({ expiresAt: result.expiresAt, daysLeft: result.daysLeft }));
        await saveLicenseSecurely(key, { expiresAt: result.expiresAt, daysLeft: result.daysLeft });
        alert(`✅ Kích hoạt thành công!\nCòn lại: ${result.daysLeft} ngày.`);
        updateLicenseStatusDisplay();
        renderHeaderStatus();
    } else {
        alert(`❌ ${result.message}`);
    }
}

async function handleDeactivateLicense() {
    if(confirm('Bạn muốn xóa License khỏi máy này vĩnh viễn?')) {
        // 1. Xóa localStorage
        localStorage.removeItem('license_key');
        localStorage.removeItem('license_data');
        
        // 2. Xóa sạch trong IndexedDB (Quan trọng)
        await dbDelete(DB_CONFIG.STORES.LICENSE, 'active_key');

        // 3. Reset UI
        updateLicenseStatusDisplay();
        renderHeaderStatus();
        
        alert('✅ Đã xóa Key thành công. Hệ thống trở về Free.');
    }
}


const loadScript = (id, src) => {
    return new Promise((resolve, reject) => {
        if (document.getElementById(id)) { resolve(); return; }
        console.log(`⏳ Đang }: ${id}...`);
        const script = document.createElement('script');
        script.id = id;
        script.src = src;
        script.onload = () => {
            console.log(`✅ ${id} đã sẵn sàng!`);
            resolve();
        };
        script.onerror = reject;
        document.head.appendChild(script);
    });
};


async function runPython(btn) {
    const actionBar = btn.closest('.code-action-bar');
    const preElement = actionBar.previousElementSibling;
    const codeElement = preElement.querySelector('code');
    let code = codeElement ? codeElement.innerText : preElement.innerText;

    // 1. Thụt lề code người dùng thêm 4 khoảng để nằm trong khối try
    const indentedCode = code.split('\n').map(line => '    ' + line).join('\n');

    // 2. Tạo hoặc lấy khung hiển thị output
    let outputDiv = actionBar.nextElementSibling;
    if (!outputDiv || !outputDiv.classList.contains('python-output')) {
        outputDiv = document.createElement('div');
        outputDiv.className = 'python-output';
        actionBar.parentNode.insertBefore(outputDiv, actionBar.nextSibling);
    }

    // Reset trạng thái hiển thị
    outputDiv.style.display = 'block'; 
    outputDiv.innerHTML = '<span class="text-yellow-400"><i class="fas fa-spinner fa-spin"></i> Đang gọi môi trường Python (lần đầu sẽ lâu)...</span>';
    outputDiv.classList.add('active');

    try {
        // 3. Load Pyodide nếu chưa có
        if (!window.loadPyodide) await loadScript('pyodide-script', RESOURCES.pyodide);

        if (!pyodideReady) {
            outputDiv.innerHTML = '<span class="text-yellow-400"><i class="fas fa-box-open fa-spin"></i> Đang tải thư viện: Matplotlib, Pandas...</span>';
            
            pyodideObj = await loadPyodide({
                indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.2/full/"
            });
            
            await pyodideObj.loadPackage(["matplotlib", "pandas", "numpy"]);
            pyodideReady = true;
        }

        outputDiv.innerHTML = '<span class="text-green-400"><i class="fas fa-terminal fa-spin"></i> Đang thực thi Code...</span>';

        // 4. Cấu hình Matplotlib sắc nét hơn
        const isMobile = window.innerWidth < 768;
        const figSize = isMobile ? "[6, 6]" : "[10, 6]";
        
        const wrapperCode = `
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import io, base64, sys, json
import pandas as pd
import numpy as np

# Cấu hình giao diện Dark Mode cho biểu đồ
plt.style.use('dark_background')
plt.rcParams.update({
    'figure.facecolor': '#0b1121', 
    'axes.facecolor': '#0b1121', 
    'text.color': '#cbd5e1', 
    'axes.labelcolor': '#cbd5e1', 
    'xtick.color': '#cbd5e1', 
    'ytick.color': '#cbd5e1', 
    'grid.color': '#334155',
    'font.family': 'sans-serif',
    'font.size': 10,
    'figure.figsize': ${figSize},
    'figure.dpi': 144
})

# Bắt output print()
sys.stdout = io.StringIO()

try:
    # --- USER CODE START ---
${indentedCode}
    # --- USER CODE END ---
except Exception as e:
    print(f"Lỗi Runtime: {e}")

# Xử lý ảnh biểu đồ
img_str = ""
if plt.get_fignums():
    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', pad_inches=0.1)
    buf.seek(0)
    img_str = base64.b64encode(buf.read()).decode('utf-8')
    plt.clf()

# Trả về JSON
json.dumps({"text": sys.stdout.getvalue(), "image": img_str})
`;

        const resultJSON = await pyodideObj.runPythonAsync(wrapperCode);
        const result = JSON.parse(resultJSON);

        // 5. Render Kết quả
        let html = "";
        
        if (result.text) {
            html += `<div class="mb-3 text-slate-300 whitespace-pre-wrap font-mono text-sm border-b border-slate-700 pb-2">${result.text}</div>`;
        }
        
        if (result.image) {
            html += `<div class="flex justify-center"><img src="data:image/png;base64,${result.image}" alt="Chart" style="max-width:100%; border-radius:8px; box-shadow: 0 4px 6px rgba(0,0,0,0.3);"></div>`;
        }
        
        if (!html) html = `<span class="text-slate-500 italic">✅ Code đã chạy xong (Không có output).</span>`;

        outputDiv.innerHTML = html;

    } catch (err) {
        console.error(err);
        outputDiv.innerHTML = `<div class="text-red-400 bg-red-900/20 p-2 rounded border border-red-500/50">
            <strong>⚠️ Lỗi Python:</strong><br>${err.message}
        </div>`;
    }
}

function attachRunButtons() {
    document.querySelectorAll('code.language-python').forEach(codeEl => {
        const pre = codeEl.parentElement;
        if (pre.nextElementSibling && pre.nextElementSibling.classList.contains('code-action-bar')) return;

        const actionBar = document.createElement('div');
        actionBar.className = 'code-action-bar';
        actionBar.innerHTML = `
    <div class="run-btn" onclick="runPython(this)">
        <i class="fas fa-play"></i> RUN
    </div>
 `;
        pre.parentNode.insertBefore(actionBar, pre.nextSibling);
    });
}

// OCR & PDF
async function runOCR(file, statusSpan) {
    if (!window.Tesseract) {
        statusSpan.innerHTML = `<i class="fas fa-download fa-spin"></i> Đang tải Module OCR...`;
        await loadScript('tesseract-lib', RESOURCES.tesseract);
    }

    if (!activeWorkers.ocr) {
        statusSpan.innerHTML = `<i class="fas fa-brain fa-spin"></i> Đang khởi động não bộ OCR...`;
        activeWorkers.ocr = await Tesseract.createWorker('vie+eng');
    }

    if (activeWorkers.ocrTimer) clearTimeout(activeWorkers.ocrTimer);

    const ret = await activeWorkers.ocr.recognize(file);

    activeWorkers.ocrTimer = setTimeout(async () => {
        if (activeWorkers.ocr) {
            console.log("💤 OCR Worker ngủ đông...");
            await activeWorkers.ocr.terminate();
            activeWorkers.ocr = null;
        }
    }, 60000);

    return ret.data.text;
}

async function ensurePdfLib() {
    if (!window.pdfjsLib) {
        // Tải script chính
        await loadScript('pdf-lib', RESOURCES.pdfjs);
        // Cấu hình Worker (bắt buộc để PDF.js chạy mượt)
        pdfjsLib.GlobalWorkerOptions.workerSrc = RESOURCES.pdfWorker;
    }
}

async function convertPdfToImages(file) {
    await ensurePdfLib();

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;    
    const images = [];
    const maxPages = Math.min(pdf.numPages, 3);

    for (let i = 1; i <= maxPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({scale: 1.5}); 
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({canvasContext: context, viewport: viewport}).promise;
        images.push(canvas.toDataURL('image/jpeg', 0.8)); 
    }
    return images;
}

async function readPdfText(file) {
    try {
        await ensurePdfLib();

        const arrayBuffer = await file.arrayBuffer();       
        const pdf = await pdfjsLib.getDocument({data: arrayBuffer}).promise;
        let fullText = "";
        
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(" ");
            fullText += `\n--- Page ${i} ---\n${pageText}`;
        }
        return fullText;
    } catch (e) {
        console.error("Lỗi đọc PDF chi tiết:", e);
        return `[Lỗi đọc file PDF: ${e.message}]`;
    }
}

function readImageAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsText(file);
    });
}

/**
 * ==========================================================================================
 * 8. MAIN CHAT LOGIC
 * ==========================================================================================
 */

function renderContentToElement(elementId, text) {
    if (!elementId) return;
    const el = document.getElementById(elementId);
    if (!el) return;

    const container = messagesArea;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;

    const htmlContent = marked.parse(text);
    el.innerHTML = htmlContent;

    try {
        renderMathInElement(el, {
            delimiters: [{left: '$$', right: '$$', display: true}, {left: '$', right: '$', display: false}],
            throwOnError: false
        });
    } catch(e) {}

    if (isNearBottom) {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
    
    const images = el.querySelectorAll('img');
    images.forEach(img => img.style.maxWidth = '100%');
    attachRunButtons();
}

function appendUserMessage(content, displayContent) {
    const div = document.createElement('div');
    div.className = 'user-message message';
    div.innerHTML = `<div class="user-bubble">${displayContent || content}</div>`;
    messagesArea.appendChild(div);
    messagesArea.scrollTop = messagesArea.scrollHeight;
}

function createResponseGroup() {
    const group = document.createElement('div');
    group.className = 'ai-response-group message';
    messagesArea.appendChild(group);
    return group;
}

function createAiCard(groupElement, modelName) {
    const id = 'bubble-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    const card = document.createElement('div');
    card.className = 'ai-card';
    card.innerHTML = `
        <div class="ai-header">
            <span class="ai-model-name"><i class="fas fa-robot"></i> ${modelName}</span>
            <i class="fas fa-circle text-[8px] text-green-500 animate-pulse"></i>
        </div>
        <div class="ai-bubble" id="${id}">...</div>
    `;
    groupElement.appendChild(card);
    return id;
}

async function sendMessage() {
    let text = userInput.value.trim();
    if (!text && !currentFileContent && pendingVisionImages.length === 0) return;

    // 1. Tăng biến đếm cộng dồn
    messageCounter++;
    localStorage.setItem('security_msg_counter', messageCounter.toString());

    // 2. LOGIC CHECK GIÃN CÁCH (Xóa sạch đoạn cũ, dán đoạn này vào)
    if (messageCounter >= securityState.nextCheckAt) {      
        
        // Gọi hàm kiểm tra ngầm License với Server
        performSilentSecurityCheck();

        // Tính toán mốc tiếp theo theo cấp số cộng (Ví dụ: +5, +10, +15...)
        securityState.currentGap += 5; 
        securityState.nextCheckAt = messageCounter + securityState.currentGap;

        // Lưu trạng thái để khi F5 không bị reset lại mốc check
        localStorage.setItem('sec_next_check', securityState.nextCheckAt.toString());
        localStorage.setItem('sec_current_gap', securityState.currentGap.toString());
        
        console.log(`🕵️ Security: Lần check tới tại tin thứ ${securityState.nextCheckAt}`);
    }

    // Check License
    let featureType = 'chat';
    if (window.isDebateMode) featureType = 'debate';
    else if (window.isSynthesisMode) featureType = 'synthesis';
    else if (pendingVisionImages.length > 0) featureType = 'vision';
    else if (config.isSquadMode) featureType = 'squad';

    const permission = checkFeaturePermission(featureType);
    if (!permission.allowed) {
        alert(permission.message);
        return; 
    }

    // Routing
    if (window.isDebateMode) {
        startDebateSystem(text);
        return;
    }
    if (window.isSynthesisMode) {
        startSynthesisSystem(text);
        return;
    }
    
    userInput.value = "";
    userInput.style.height = 'auto';
    setGeneratingState(true);
    let displayHtml = text;

    // Vision Mode
    if (pendingVisionImages.length > 0) {
        displayHtml += `<br><span class="text-xs text-yellow-400">[Chế độ: AI Agent Phân tích ảnh]</span>`;
        displayHtml += `<div class="flex gap-2 mt-2 overflow-x-auto">`;
        pendingVisionImages.forEach(img => {
            displayHtml += `<img src="${img}" class="h-12 w-auto rounded border border-slate-600">`;
        });
        displayHtml += `</div>`;
        appendUserMessage(text, displayHtml);
    
        const mainModel = config.models[0];
        const visionModel = config.visionModel;
        const responseGroup = createResponseGroup();
    
        const statusId = createAiCard(responseGroup, "System Agent");
        const updateStatus = (msg) => {
            const el = document.getElementById(statusId);
            if(el) el.innerHTML = `<i class="fas fa-cog fa-spin text-yellow-400"></i> ${msg}`;
        };
    
        try {
            updateStatus("AI đang phân tích câu hỏi để chỉ đạo Vision...");
            const directorPrompt = `
            Bạn là một trợ lý AI thông minh (Director).
            Người dùng vừa gửi một hình ảnh kèm câu hỏi: "${text || 'Hãy phân tích ảnh này'}".
            Nhiệm vụ: Hãy viết một câu lệnh (Prompt) thật cụ thể và trước câu hỏi nhớ thêm "hãy phân tích hình ảnh " để AI bên ngoài trả lời và bạn sưu tập câu trả lời cho khớp với ý cuar người dùng nhé và phải rõ ràng bằng tiếng Anh gửi cho AI Vision để nó trích xuất thông tin cần thiết nhất từ ảnh.
            Chỉ trả về nội dung câu lệnh (Prompt).`;
            
            const visionInstruction = await runSingleDebateTurn(mainModel, [{role: "user", content: directorPrompt}], statusId);
            if(abortControllers.length === 0) throw new Error("Đã dừng bởi người dùng.");
    
            updateStatus(`Vision đang soi ảnh...`);
            const visionContent = [
                { type: "text", text: visionInstruction },
                ...pendingVisionImages.map(img => ({ type: "image_url", image_url: { url: img } }))
            ];
            const visionAnalysis = await runSingleDebateTurn(visionModel, [{role: "user", content: visionContent}], statusId);
            if(abortControllers.length === 0) throw new Error("Đã dừng bởi người dùng.");
    
            updateStatus("AI đang tổng hợp câu trả lời cuối cùng...");
            
            const statusCard = document.getElementById(statusId).closest('.ai-card');
            if(statusCard) statusCard.remove();
    
            const finalPrompt = `
            Thông tin gốc từ người dùng: "${text}"
            Kết quả phân tích hình ảnh từ Vision AI: """${visionAnalysis}"""
            Dựa vào thông tin trên, hãy trả lời câu hỏi của người dùng.`;
    
            await runStream(mainModel, [...chatHistory, {role: "user", content: finalPrompt}], responseGroup);
    
        } catch (e) {
            console.error("Lỗi Vision:", e);
            let el = document.getElementById(statusId);
            if (!el) appendUserMessage("System Error", `<span class="text-red-400">Lỗi quy trình: ${e.message}</span>`);
            else el.innerHTML = `<span class="text-red-400">Lỗi: ${e.message}</span>`;
        }
        setGeneratingState(false);
        return; 
    }

    // Chat / RAG Mode
    let finalContext = null;
    if (currentFileContent) {
        if (currentFileContent.length > 2000) {
            const smartKeywords = await extractSmartKeywords(text, config.models[0]);
            finalContext = await getRelevantContextWithStatus(smartKeywords, currentFileContent);
            displayHtml += `<div class="mt-2 text-[10px] text-blue-400 bg-slate-800/50 p-2 rounded border border-blue-500/30">
                <div class="font-bold text-yellow-400 mb-1"><i class="fas fa-search"></i> SMART RAG Active:</div>
                <div class="italic opacity-80">${smartKeywords}</div>
            </div>`;
        } else {
            finalContext = currentFileContent;
            displayHtml += `<div class="mt-2 text-[10px] text-slate-500">${currentFileName} (Full Scan)</div>`;
        }
    }
    
    let fullPrompt = text;
    if (finalContext) fullPrompt = `=== CONTEXT ===\n${finalContext}\n=== END ===\n\nUSER: ${text}`;
 
    appendUserMessage(text, displayHtml);
    chatHistory.push({ role: "user", content: fullPrompt });
    saveSmartState();
    if(chatHistory.length > 8) chatHistory = [chatHistory[0], ...chatHistory.slice(-7)];
 
    const responseGroup = createResponseGroup();
    abortControllers = [];
 
    let activeModel = config.isSquadMode ? config.models : [config.models[0]];
    let modelsToRun = Array.isArray(activeModel) ? activeModel : [activeModel];
 
    const promises = modelsToRun.map(model => runStream(model, chatHistory, responseGroup));
    await Promise.allSettled(promises);
    setGeneratingState(false);
    renderHeaderStatus();
}

// Stream Engines
async function runStream(model, messages, groupElement, specificElementId = null) {
    const endpoint = config.customUrl.trim() || DEFAULT_URL;
    let bubbleId = specificElementId || createAiCard(groupElement, model);
    
    const controller = new AbortController();
    abortControllers.push(controller);
    
    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${config.apiKey}`,
                "Content-Type": "application/json",
                "HTTP-Referer": window.location.href,
            },
            body: JSON.stringify({
                model: model, messages: messages, temperature: config.temperature, top_p: config.topP, stream: true 
            }),
            signal: controller.signal
        });
    
        if (!response.ok) throw new Error("API Error: " + response.status);
    
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let fullText = "";
    
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n");
            
            for (const line of lines) {
                if (line.startsWith("data: ") && line !== "data: [DONE]") {
                    try {
                        const json = JSON.parse(line.substring(6));
                        const content = json.choices[0]?.delta?.content || "";
                        if (content) {
                            fullText += content;
                            renderContentToElement(bubbleId, fullText);
                        }
                    } catch (e) {}
                }
            }
        }
    
        if (!config.isSquadMode || model === config.models[0]) {
            chatHistory.push({ role: "assistant", content: fullText });
        }
    
    } catch (e) {
        if (e.name === 'AbortError') renderContentToElement(bubbleId, fullText + "\n\n*[Stopped]*");
        else renderContentToElement(bubbleId, fullText + `\n\n⚠️ Error: ${e.message}`);
    }
}

async function runSingleDebateTurn(model, messages, bubbleId) {
    const endpoint = config.customUrl.trim() || DEFAULT_URL;
    const controller = new AbortController();
    abortControllers.push(controller);
    
    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${config.apiKey}`,
                "Content-Type": "application/json",
                "HTTP-Referer": window.location.href,
            },
            body: JSON.stringify({ model: model, messages: messages, temperature: config.temperature, top_p: config.topP, stream: false }),
            signal: controller.signal
        });
    
        if (!response.ok) throw new Error("API Error: " + response.status);
        const data = await response.json();
        const content = data.choices[0]?.message?.content || "[No Response]";
        
        if (bubbleId && bubbleId !== "null") renderContentToElement(bubbleId, content);
        return content;
    } catch (e) {
        if (bubbleId && bubbleId !== "null") {
            if (e.name === 'AbortError') renderContentToElement(bubbleId, "\n\n*[Stopped]*");
            else renderContentToElement(bubbleId, `\n⚠️ Error: ${e.message}`);
        }
        throw e;
    }
}

/**
 * ==========================================================================================
 * 9. ADVANCED MODES (Debate & Synthesis)
 * ==========================================================================================
 */

// Debate Logic
window.isDebateMode = false;
function toggleDebateMode() {
    window.isDebateMode = !window.isDebateMode;
    const btn = document.getElementById('debateModeToggle');
    const inputWrapper = document.querySelector('.input-wrapper');
    const sendIcon = document.querySelector('#sendBtn i');
    
    if (window.isDebateMode) {
        btn.classList.add('debate-active'); 
        inputWrapper.classList.add('debate-mode-active');
        userInput.placeholder = "⚔️ Nhập chủ đề tranh biện...";
        userInput.focus();
    
        if (config && config.isSquadMode) {
            config.isSquadMode = false;
            document.getElementById('squadModeToggle').classList.remove('active');
            renderHeaderStatus();
        }
        sendIcon.className = "fas fa-gavel";
    } else {
        btn.classList.remove('debate-active');
        inputWrapper.classList.remove('debate-mode-active');
        userInput.placeholder = "Nhập tin nhắn...";
        sendIcon.className = "fas fa-paper-plane";
    }
}

async function processAttachmentsForContext(userText) {
    let contextData = "";
    
    // 1. XỬ LÝ ẢNH (VISION)
    if (pendingVisionImages.length > 0) {
        // Thông báo UI
        const msgDiv = document.createElement('div');
        msgDiv.className = 'user-message message';
        msgDiv.innerHTML = `<div class="text-xs text-yellow-400 bg-slate-800 p-2 rounded"><i class="fas fa-eye fa-spin"></i> Đang soi ${pendingVisionImages.length} ảnh để lấy dữ liệu cho chế độ nâng cao...</div>`;
        document.getElementById('messagesArea').appendChild(msgDiv);
        
        try {
            const visionModel = config.visionModel || config.models[0];
            const visionPrompt = [
                { type: "text", text: "Hãy mô tả chi tiết những gì bạn thấy trong các hình ảnh này để dùng làm dữ liệu đầu vào cho một cuộc thảo luận/phân tích. Chỉ trả về nội dung mô tả, không thêm lời dẫn." },
                ...pendingVisionImages.map(img => ({ type: "image_url", image_url: { url: img } }))
            ];
            
            // Gọi model để đọc ảnh
            const imageDesc = await runSingleDebateTurn(visionModel, [{role: "user", content: visionPrompt}], "null");
            contextData += `\n[DỮ LIỆU TỪ HÌNH ẢNH]:\n"${imageDesc}"\n`;
            
            // Xóa thông báo tạm
            msgDiv.remove();
        } catch (e) {
            console.error("Vision Error:", e);
            contextData += `\n[LỖI ĐỌC ẢNH]: ${e.message}\n`;
        }
    }

    // 2. XỬ LÝ FILE (TEXT/PDF/OCR)
    if (currentFileContent) {
        if (currentFileContent.length > 3000) {
            // Nếu file dài quá thì dùng RAG lấy đoạn quan trọng
            const keywords = await extractSmartKeywords(userText, config.models[0]);
            const relevantText = await getRelevantContextWithStatus(keywords, currentFileContent);
            contextData += `\n[DỮ LIỆU TỪ FILE (TRÍCH XUẤT)]: \n${relevantText}\n`;
        } else {
            // Nếu file ngắn thì lấy hết
            contextData += `\n[DỮ LIỆU TỪ FILE]: \n${currentFileContent}\n`;
        }
    }

    // 3. KẾT HỢP
    if (contextData) {
        return `${userText}\n\n=== HỆ THỐNG ĐÍNH KÈM DỮ LIỆU ===${contextData}\n=== HẾT DỮ LIỆU ===\n\nHãy sử dụng dữ liệu trên kết hợp với yêu cầu: "${userText}" để thực hiện nhiệm vụ.`;
    }
    
    return userText;
}

async function startDebateSystem(topic) {
    const permission = checkFeaturePermission('debate');
    if (!permission.allowed) return alert(permission.message);

    abortControllers = [];
    if (config.models.length < 2) {
        alert("⚠️ Cần chọn ít nhất 2 Models để chạy debate!");
        return;
    }

    // --- [MỚI] BẮT ĐẦU XỬ LÝ FILE/ẢNH ---
    setGeneratingState(true); // Khóa nút gửi trước
    const enrichedTopic = await processAttachmentsForContext(topic);
    // --- [MỚI] KẾT THÚC XỬ LÝ ---
    
    const modelA = config.models[0];
    const modelB = config.models[1];
    const maxTurns = 15;
    
    document.getElementById('userInput').value = "";
    
    // Sửa biến topic thành enrichedTopic ở đoạn prompt này
    const directorPrompt = `
    Topic/Context: """${enrichedTopic}"""
    Task: Analyze this topic/data and identify 2 opposing perspectives (Debater A vs Debater B).
    
    Output format: JSON ONLY.
    {
    "roleA": "Name of perspective 1",
    "descA": "Core mindset of perspective 1 (Vietnamese)",
    "roleB": "Name of perspective 2",
    "descB": "Core mindset of perspective 2 (Vietnamese)"
    }`;
    
    let roles = { roleA: "Góc nhìn 1", descA: "Ủng hộ", roleB: "Góc nhìn 2", descB: "Phản đối" };
    
    try {
        const scanResult = await runSingleDebateTurn(modelA, [
            {role: "system", content: "You are a logical analyzer. Output JSON only. No markdown."}, 
            {role: "user", content: directorPrompt}
        ], "null");
        
        const firstBracket = scanResult.indexOf('{');
        const lastBracket = scanResult.lastIndexOf('}');
        if (firstBracket !== -1 && lastBracket !== -1) {
                const jsonMatch = scanResult.match(/\{[\s\S]*\}/); // Regex bắt object JSON chuẩn nhất
if (jsonMatch) {
    try {
        const jsonStr = jsonMatch[0];
        roles = JSON.parse(jsonStr);
        console.log("✅ Parse JSON thành công:", roles);
    } catch (err) {
        console.error("❌ Lỗi Parse JSON (Model trả về sai format):", err);
        // Fallback: Nếu lỗi thì dùng default
        roles = { /* default config của sếp */ };
    }
}                
        }
    } catch(e) { console.error("Auto-cast failed:", e); }
    
    appendUserMessage(topic, `
    <div class="cinema-title" style="background: linear-gradient(90deg, #0f172a, #1e293b); border:1px solid #475569;">
    <h3 style="color:#38bdf8">🔍 PERSPECTIVE ANALYSIS: ${topic}</h3>
    <div class="scene-desc" style="color:#94a3b8; margin-top:5px;">
        <span style="color:#60a5fa">${roles.roleA}</span> VS <span style="color:#f87171">${roles.roleB}</span>
    </div>
    </div>
    `);
    
    const responseGroup = createResponseGroup();
    responseGroup.innerHTML = `
    <div class="cinema-screen" style="border-color:#334155; background:#0b1121;">
    <div class="character-intro" style="border-bottom:1px solid #334155;">
        <div style="text-align:left; width:45%">
            <div style="color:#60a5fa; font-weight:bold; font-size:13px;">${roles.roleA.toUpperCase()}</div>
            <div style="color:#475569; font-size:10px; font-style:italic;">${roles.descA}</div>
        </div>
        <div class="vs" style="font-size:14px; color:#cbd5e1;">VS</div>
        <div style="text-align:right; width:45%">
            <div style="color:#f87171; font-weight:bold; font-size:13px;">${roles.roleB.toUpperCase()}</div>
            <div style="color:#475569; font-size:10px; font-style:italic;">${roles.descB}</div>
        </div>
    </div>
    </div>
    ` + responseGroup.innerHTML;
    
    let debateTranscript = `CHỦ ĐỀ: ${topic}\nA: ${roles.roleA} (${roles.descA})\nB: ${roles.roleB} (${roles.descB})\n---\n`;
    let lastLine = "";
    
    for (let turn = 1; turn <= maxTurns; turn++) {
        const isTurnA = turn % 2 !== 0;
        const currentModel = isTurnA ? modelA : modelB;
        const currentRole = isTurnA ? roles.roleA : roles.roleB;
        const currentDesc = isTurnA ? roles.descA : roles.descB;
        const opponentRole = isTurnA ? roles.roleB : roles.roleA;
        
        const systemPrompt = `
        Identity: You represent "${currentRole}" on "${topic}". Mindset: ${currentDesc}.
        Opponent: "${opponentRole}".
        Instructions: Concise (max 60 words). Witty, Sarcastic. Roast opponent's logic. Vietnamese language.
        `;
        
        let userInstruction = turn === 1 ? 
            `Start discussion on "${topic}".` : 
            `Opponent said: "${lastLine}". Respond critically.`;
        
        const bubbleId = createAiCard(responseGroup, currentRole);
        const card = document.getElementById(bubbleId).closest('.ai-card');
        card.style.borderLeft = isTurnA ? '3px solid #3b82f6' : '3px solid #ef4444';
        card.style.background = isTurnA ? 'rgba(59, 130, 246, 0.05)' : 'rgba(239, 68, 68, 0.05)';
        
        try {
            const result = await runSingleDebateTurn(currentModel, [
                { role: "system", content: systemPrompt },
                { role: "user", content: userInstruction }
            ], bubbleId);
            
            lastLine = result.replace(/\n+/g, ' ').trim();
            debateTranscript += `[${currentRole}]: ${lastLine}\n`;
            await new Promise(r => setTimeout(r, 1000));
        } catch (e) { break; }
    }
    
    await judgeTheDebate(modelA, debateTranscript);
    setGeneratingState(false);
    renderHeaderStatus();
}

async function judgeTheDebate(judgeModel, transcript) {
    const allGroups = document.querySelectorAll('.ai-response-group');
    const responseGroup = allGroups[allGroups.length - 1]; 
    
    const refereeId = 'referee-' + Date.now();
    const div = document.createElement('div');
    div.className = 'ai-card referee-card'; 
    div.innerHTML = `
    <div class="referee-header"><i class="fas fa-balance-scale"></i> TÒA ÁN AI <i class="fas fa-gavel"></i></div>
    <div class="ai-bubble" id="${refereeId}">
    <div style="text-align:center; color:#fbbf24; padding:20px;">
        <i class="fas fa-spinner fa-spin fa-2x"></i><br>
        <span style="font-size:12px;">Đang tuyên án...</span>
    </div>
    </div>
    `;
    responseGroup.appendChild(div);
    messagesArea.scrollTop = messagesArea.scrollHeight;
    
    const judgePrompt = `
    Role: ULTIMATE JUDGE. Wise, fair, dramatic.
    Input: Debate transcript.
    Task: Decide winner based on logic & creativity.
    Output: Markdown, Vietnamese.
    Structure:
    ## 🏆 WINNER: [Name]
    > "MVP Line"
    ### 📝 Phán Quyết: (Short paragraph)
    ### ⭐ Score: A vs B (Logic, Creativity)
    
    Transcript:
    """${transcript}"""
    `;
    
    try {
        await runSingleDebateTurn(judgeModel, [{ role: "system", content: "Impartial Judge." }, { role: "user", content: judgePrompt }], refereeId);
        messagesArea.scrollTop = messagesArea.scrollHeight;
    } catch (e) {
        document.getElementById(refereeId).innerHTML = `<div class="text-red-400">⚠️ Trọng tài vắng mặt.</div>`;
    }
}

// Synthesis Logic
window.isSynthesisMode = false;
function toggleSynthesisMode() {
    window.isSynthesisMode = !window.isSynthesisMode;
    const btn = document.getElementById('synthesisModeToggle');
    const inputWrapper = document.querySelector('.input-wrapper');
    const sendIcon = document.querySelector('#sendBtn i');
    
    if (window.isSynthesisMode) {
        if (window.isDebateMode) toggleDebateMode();
        if (config.isSquadMode) toggleSquadMode();
        
        btn.classList.add('synthesis-active');
        inputWrapper.style.borderColor = "#fbbf24"; 
        document.getElementById('userInput').placeholder = "⚗️ Nhập vấn đề cần hội tụ tri thức...";
        sendIcon.className = "fas fa-flask";
    } else {
        btn.classList.remove('synthesis-active');
        inputWrapper.style.borderColor = "#334155";
        document.getElementById('userInput').placeholder = "Nhập tin nhắn...";
        sendIcon.className = "fas fa-paper-plane";
    }
}

async function startSynthesisSystem(query) {
    const permission = checkFeaturePermission('synthesis');
    if (!permission.allowed) return alert(permission.message);

    if (config.models.length < 2) return alert("⚠️ Cần ít nhất 2 Models để hội tụ!");
    
    // --- [MỚI] BẮT ĐẦU XỬ LÝ FILE/ẢNH ---
    setGeneratingState(true);
    const enrichedQuery = await processAttachmentsForContext(query);
    // --- [MỚI] KẾT THÚC ---

    document.getElementById('userInput').value = "";
    
    // Hiển thị tin nhắn người dùng (giữ nguyên query ngắn gọn để hiển thị cho đẹp)
    appendUserMessage(query, `
    <div style="color:#fbbf24; font-weight:bold;">
    <i class="fas fa-atom fa-spin"></i> KÍCH HOẠT SYNTHESIS (Có kèm dữ liệu File/Ảnh)
    </div>
    <div class="text-xs text-slate-400 mt-1">Đang huy động ${config.models.length} chuyên gia...</div>
    `);
    
    const responseGroup = createResponseGroup();
    const rawContainer = document.createElement('div');
    rawContainer.className = 'raw-results-container';
    responseGroup.appendChild(rawContainer);
    
    const synthesisId = 'syn-' + Date.now();
    const mainCard = document.createElement('div');
    mainCard.className = 'ai-card synthesis-card';
    mainCard.innerHTML = `
    <div class="ai-header" style="background:rgba(69, 26, 3, 0.5); color:#fbbf24;">
    <span class="font-bold"><i class="fas fa-gem"></i> KẾT QUẢ TINH KHIẾT</span>
    </div>
    <div class="ai-bubble">
    <div id="syn-status-${synthesisId}">
        <div class="synthesis-step active" id="step1-${synthesisId}">1. 📡 Thu thập...</div>
        <div class="synthesis-step" id="step2-${synthesisId}">2. ⚖️ Đối chiếu...</div>
        <div class="synthesis-step" id="step3-${synthesisId}">3. 🗑️ Khử nhiễu...</div>
        <div class="synthesis-step" id="step4-${synthesisId}">4. ✨ Tinh chỉnh...</div>
    </div>
    <div id="${synthesisId}" class="mt-4 hidden"></div>
    </div>
    `;
    responseGroup.appendChild(mainCard);
    
    const updateStep = (step) => {
        [1,2,3,4].forEach(i => document.getElementById(`step${i}-${synthesisId}`).classList.remove('active'));
        if(step <= 4) document.getElementById(`step${step}-${synthesisId}`).classList.add('active');
    };
    
    let rawResults = [];
    try {
        const promises = config.models.map(async (model, index) => {
            const rawBox = document.createElement('div');
            rawBox.className = 'raw-card';
            rawBox.id = `raw-${index}-${synthesisId}`;
            rawBox.innerText = `⏳ ${model.split('/').pop()} đang nghĩ...`;
            rawContainer.appendChild(rawBox);
            
            try {
                const rawRes = await runSingleDebateTurn(model, [{role: "user", content: enrichedQuery + " (Brief answer focused on facts)"}], "null");
                rawBox.innerHTML = `<span class="text-green-400">✔ ${model.split('/').pop()}</span>`;
                return { model: model, content: rawRes };
            } catch (e) {
                rawBox.innerText = `❌ Error.`;
                return null;
            }
        });
        
        const results = await Promise.all(promises);
        rawResults = results.filter(r => r !== null);
        if (rawResults.length === 0) throw new Error("All models failed.");
        
    } catch (e) {
        document.getElementById(synthesisId).innerHTML = `<span class="text-red-400">Error: ${e.message}</span>`;
        setGeneratingState(false);
        return;
    }
    
    const leaderModel = config.models[0]; 
    updateStep(2);
    const combinedInput = rawResults.map((r, i) => `[SOURCE ${i+1} - ${r.model}]:\n${r.content}`).join("\n\n---\n\n");
    
    const filterPrompt = `
    Role: Consensus Engine.
    Raw Data from multiple AIs:
    """${combinedInput}"""
    
    Task:
    1. Find Consensus.
    2. Resolve Conflicts.
    3. Remove Hallucinations.
    4. Synthesize into ONE final answer (Vietnamese).
    `;
    
    updateStep(3);
    await new Promise(r => setTimeout(r, 800)); 
    
    updateStep(4);
    try {
        document.getElementById(`syn-status-${synthesisId}`).classList.add('hidden');
        document.getElementById(synthesisId).classList.remove('hidden');
        await runStream(leaderModel, [{role: "system", content: "Expert Synthesizer."}, {role: "user", content: filterPrompt}], mainCard.parentElement, synthesisId);
    } catch (e) {
        document.getElementById(synthesisId).innerHTML = `Error: ${e.message}`;
    }
    
    setGeneratingState(false);
    renderHeaderStatus();
}

async function extractSmartKeywords(query, model) {
    const ragStatusText = document.getElementById('ragStatusText');
    const ragContainer = document.getElementById('ragStatus');
    
    ragContainer.classList.remove('hidden');
    ragStatusText.innerHTML = `<i class="fas fa-brain fa-spin"></i> THINKING KEYWORDS...`;
    ragStatusText.style.color = "#fbbf24"; 
    
    const prompt = `
    Role: Search Engine Agent.
    User Query: "${query}"
    Task: List 10-15 keywords (Vietnamese + English) for document search.
    Output: Comma separated keywords ONLY.
    `;
    
    try {
        const keywords = await runSingleDebateTurn(model, [{role: "user", content: prompt}], "null"); 
        console.log("Smart Keywords:", keywords);
        return keywords; 
    } catch (e) {
        console.error("Lỗi Keyword:", e);
        return query; 
    }
}

async function getRelevantContextWithStatus(keywords, content) {
    const ragBar = document.getElementById('ragProgressBar');
    const ragText = document.getElementById('ragStatusText');
    const ragPercent = document.getElementById('ragProgressPercent');
    
    const keywordList = keywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k.length > 0);
    const lines = content.split('\n');
    let relevantChunks = [];
    
    ragText.innerHTML = `<i class="fas fa-search text-blue-400"></i> SCANNING: ${keywordList.slice(0, 3).join(', ')}...`;
    
    const chunkSize = Math.ceil(lines.length / 50); 
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (i % chunkSize === 0) {
            const percent = Math.round((i / lines.length) * 100);
            ragBar.style.width = `${percent}%`;
            ragPercent.innerText = `${percent}%`;
            await new Promise(r => setTimeout(r, 1)); 
        }
        
        if (keywordList.some(k => line.toLowerCase().includes(k))) {
            let contextBlock = line;
            if (i > 0) contextBlock = lines[i-1] + "\n" + contextBlock;
            if (i < lines.length - 1) contextBlock = contextBlock + "\n" + lines[i+1];
            relevantChunks.push(contextBlock);
        }
    }
    
    ragBar.style.width = '100%';
    ragPercent.innerText = '100%';
    ragText.innerHTML = `<i class="fas fa-check-circle text-green-400"></i> SCAN COMPLETE!`;
    await new Promise(r => setTimeout(r, 300)); 
    
    if (relevantChunks.length === 0) {
        return content.substring(0, 3000) + "\n\n...[Shortened]...";
    }
    
    return [...new Set(relevantChunks)].join('\n---\n');
}

/**
 * ==========================================================================================
 * 10. UI HANDLERS & EVENT LISTENERS
 * ==========================================================================================
 */

async function handleFileSelect(input) {
    const files = input.files;
    if (!files || files.length === 0) return;

    const previewDiv = document.getElementById('filePreview');
    const nameSpan = document.getElementById('fileName');
    previewDiv.classList.remove('hidden');  
    
    currentFileContent = "";
    pendingVisionImages = [];
    let names = [];

    try {
        if (config.useVision) {
            nameSpan.innerHTML = `<i class="fas fa-eye text-yellow-400 fa-spin"></i> Vision Processing...`;
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                names.push(file.name);
                if (file.type.startsWith('image/')) {
                    const base64 = await readImageAsBase64(file);
                    pendingVisionImages.push(base64); 
                } else if (file.type === 'application/pdf') {
                    const images = await convertPdfToImages(file); 
                    images.forEach(img => pendingVisionImages.push(img));
                } else {
                    const text = await readFileAsText(file);
                    currentFileContent += `\n=== TEXT FILE (${file.name}) ===\n${text}\n`;
                }
            }
            nameSpan.innerHTML = `<i class="fas fa-eye text-yellow-400"></i> Vision Ready: ${pendingVisionImages.length} Imgs + Text`;
        } else {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                names.push(file.name);
                nameSpan.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Đang đọc (${i + 1}/${files.length}): ${file.name}...`;

                if (file.type.startsWith('image/')) {
                    const text = await runOCR(file, nameSpan);
                    currentFileContent += `\n\n=== FILE ẢNH (OCR - ${file.name}) ===\n${text}\n==============================\n`;
                } else if (file.type === 'application/pdf') {
                    const pdfText = await readPdfText(file);
                    currentFileContent += `\n\n=== FILE PDF (${file.name}) ===\n${pdfText}\n==============================\n`;
                } else {
                    const text = await readFileAsText(file);
                    currentFileContent += `\n\n=== FILE TEXT (${file.name}) ===\n${text}\n==============================\n`;
                }
            }
            nameSpan.innerHTML = `<i class="fas fa-file-invoice"></i> ${names.join(', ')}`;
        }
    } catch (globalError) {
        console.error("Lỗi trùm:", globalError);
        alert("Lỗi xử lý file: " + globalError.message);
    } 

    currentFileName = `Combo ${files.length} file: ${names.join(', ')}`;
    input.value = ''; 
}

function clearFile() { 
    currentFileContent=null; 
    pendingVisionImages = []; 
    document.getElementById('fileInput').value=''; 
    document.getElementById('filePreview').classList.add('hidden'); 
}

function autoResize(t) { t.style.height='auto'; t.style.height=Math.min(t.scrollHeight,120)+'px'; }
function useSuggestion(t) { userInput.value = t; autoResize(userInput); userInput.focus(); }
function confirmClearChat() { if(confirm("Xoá sạch sẽ?")) { messagesArea.innerHTML=WELCOME_HTML; chatHistory=[{role:"system",content:config.systemPrompt}]; } }

function openSettings() {
    // 1. Load các cài đặt cũ lên Form
    document.getElementById('apiKeyInput').value = config.apiKey;
    document.getElementById('customUrlInput').value = config.customUrl;
    document.getElementById('systemPromptInput').value = config.systemPrompt;
    document.getElementById('tempInput').value = config.temperature; 
    document.getElementById('tempDisplay').innerText = config.temperature;
    
    const topPEl = document.getElementById('topPInput');
    if(topPEl) {
        topPEl.value = config.topP;
        document.getElementById('topPDisplay').innerText = config.topP;
    }
    document.getElementById('visionModelInput').value = config.visionModel;
    
    // Xử lý nút gạt Vision
    const vBtn = document.getElementById('visionToggleBtn');
    if(vBtn) {
        const switchEl = vBtn.querySelector('.toggle-switch') || vBtn; // Fix selector phòng hờ
        if(config.useVision) {
            switchEl.style.background = '#fbbf24';
            switchEl.innerHTML = '<div style="position:absolute; top:2px; left:14px; width:14px; height:14px; background:white; border-radius:50%;"></div>';
        } else {
            switchEl.style.background = '#334155';
            switchEl.innerHTML = '<div style="position:absolute; top:2px; left:2px; width:14px; height:14px; background:white; border-radius:50%;"></div>';
        }
    }
    
    // 2. Render danh sách Model
    renderModelList();

    // 3. [FIXED] Xóa dòng addLicenseUI() bị thiếu đi
    // addLicenseUI(); <--- Đã xóa dòng này
    
    // 4. Cập nhật trạng thái License
    updateLicenseStatusDisplay();

    // 5. Mở Modal
    if(settingsModal) {
        settingsModal.classList.add('active');
    } else {
        console.error("Không tìm thấy ID 'settingsModal' trong HTML!");
    }
}

function renderModelList() {
    const list = document.getElementById('modelList');
    list.innerHTML = '';
    config.models.forEach((m, index) => {
        const div = document.createElement('div');
        div.className = 'model-item';
        div.innerHTML = `<span>${index + 1}. ${m}</span><i class="fas fa-trash-alt remove-model-btn" onclick="removeModel(${index})"></i>`;
        list.appendChild(div);
    });
}

function addSelectedModel() {
    const select = document.getElementById('newModelSelect');
    const val = select.value;
    if (val && !config.models.includes(val)) {
        config.models.push(val);
        renderModelList();
        select.value = '';
    } else if (val && config.models.includes(val)) {
        alert('Model đã tồn tại trong danh sách!');
    }
}

function addCustomModel() {
    const val = document.getElementById('customModelInput').value.trim();
    if (val && !config.models.includes(val)) {
        config.models.push(val);
        renderModelList();
        document.getElementById('customModelInput').value = '';
    } else if (val && config.models.includes(val)) {
        alert('Model đã tồn tại trong danh sách!');
    }
}

function removeModel(index) { config.models.splice(index, 1); renderModelList(); }

function saveSettings() {
    config.apiKey = document.getElementById('apiKeyInput').value.trim();
    config.customUrl = document.getElementById('customUrlInput').value.trim();
    config.systemPrompt = document.getElementById('systemPromptInput').value.trim();
    config.temperature = parseFloat(document.getElementById('tempInput').value);
    
    const topPVal = document.getElementById('topPInput').value;
    config.topP = parseFloat(topPVal);
    localStorage.setItem('chat_top_p', config.topP);
    localStorage.setItem('chat_api_key', config.apiKey);
    localStorage.setItem('chat_custom_url', config.customUrl);         
    localStorage.setItem('chat_models_list', JSON.stringify(config.models));
    localStorage.setItem('chat_temperature', config.temperature);
    
    config.visionModel = document.getElementById('visionModelInput').value.trim();
    localStorage.setItem('chat_use_vision', config.useVision);
    localStorage.setItem('chat_vision_model', config.visionModel);
 
    chatHistory[0].content = config.systemPrompt;
    renderHeaderStatus();
    closeSettings();
}

function closeSettings() { settingsModal.classList.remove('active'); }
function stopGeneration() { abortControllers.forEach(c => c.abort()); abortControllers = []; }

function toggleSquadMode() { 
    config.isSquadMode = !config.isSquadMode; 
    if(config.isSquadMode) squadModeToggle.classList.add('active'); 
    else squadModeToggle.classList.remove('active');
    renderHeaderStatus();
}

function toggleVisionSetting(el) {
    config.useVision = !config.useVision;
    const switchEl = el.querySelector('.toggle-switch');
    if (config.useVision) {
        switchEl.style.background = '#fbbf24'; 
        switchEl.innerHTML = '<div style="position:absolute; top:2px; left:14px; width:14px; height:14px; background:white; border-radius:50%;"></div>';
    } else {
        switchEl.style.background = '#334155';
        switchEl.innerHTML = '<div style="position:absolute; top:2px; left:2px; width:14px; height:14px; background:white; border-radius:50%;"></div>';
    }
}

function renderHeaderStatus() {
    const el = document.getElementById('headerStatus');
    const firstModel = config.models[0] || 'None';
    let displayModel = firstModel;
    if (firstModel.includes('/')) displayModel = firstModel.split('/').pop();
    
    const licenseKey = localStorage.getItem('license_key');
    let badge = '';
    
    if (licenseKey) {
        const licenseData = JSON.parse(localStorage.getItem('license_data') || '{}');
        const daysLeft = Math.ceil((new Date(licenseData.expiresAt) - new Date()) / (1000 * 60 * 60 * 24));
        badge = ` <span class="text-yellow-400 text-xs">👑VIP(${daysLeft}d)</span>`;
    } else {
        const remaining = LICENSE_CONFIG.FREE_CHAT_LIMIT - usageData.freeChatUsed;
        badge = ` <span class="text-slate-400 text-xs">🆓(${remaining} left)</span>`;
    }

    el.innerHTML = config.isSquadMode 
        ? `Squad Mode (${config.models.length})${badge}` 
        : `Single: ${displayModel}${badge}`;
}

function setGeneratingState(isGen) {
    document.getElementById('sendBtn').style.display = isGen ? 'none' : 'flex';
    document.getElementById('stopBtn').style.display = isGen ? 'flex' : 'none';
    document.getElementById('typingIndicator').style.display = isGen ? 'block' : 'none';
    userInput.disabled = isGen;
}

// Event Listeners
settingsModal.addEventListener('click', (e) => { if(e.target===settingsModal) closeSettings(); });
window.onload = initChat;