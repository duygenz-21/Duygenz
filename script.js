/**
 * ==========================================================================================
 * 1. CONFIGURATION & DATABASE SETUP (OPTIMIZED & FREE)
 * ==========================================================================================
 */

const DB_CONFIG = {
    NAME: 'UltimateAIChatDB',
    VERSION: 1,
    STORES: {
        CHAT: 'chat_history'
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
            // Chỉ giữ lại store Chat, bỏ store License/Usage
            if (!db.objectStoreNames.contains(DB_CONFIG.STORES.CHAT)) {
                db.createObjectStore(DB_CONFIG.STORES.CHAT);
            }
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

// Resources
const RESOURCES = {
    tesseract: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',
    pyodide: 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js',
    pdfjs: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    pdfWorker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
};

let activeWorkers = { ocr: null };
let abortControllers = [];
let pendingVisionImages = []; 
let currentFileContent = null;
let currentFileName = null;
let pyodideReady = false;
let pyodideObj = null;

// Chat Config
const DEFAULT_URL = "https://openrouter.ai/api/v1/chat/completions";
const REQUIRED_SYSTEM_PROMPT =`Role: Clear Explainer.   
Primary: Detailed text + visual (More visual than text).                
Visuals: Use ASCII art frequently.
Format: Wrap ASCII art in text.         
FILES: Deep analysis + Tables.  
Math: Brief only. $ inline, $$ block.   
STYLE: Combine text with ASCII art.`;

const WELCOME_HTML = `
    <div class="ai-response-group">
        <div class="ai-card border-purple-500/50">
            <div class="ai-header"><span class="ai-model-name"><i class="fas fa-bolt text-yellow-400"></i> System v6.0 (Optimized)</span></div>
            <div class="ai-bubble">
                Chào sếp! <b>AI Streaming Pro v6.0</b> đã sẵn sàng! 🚀<br><br>
                ✨ <b>Fully Unlocked:</b> Không giới hạn, không License key.<br>
                ⚡ <b>Performance:</b> Tác vụ nặng chạy ngầm & tự đóng khi xong.<br>
                🎨 <b>Color & Highlight:</b> Code và Markdown rực rỡ.<br>
                👁️ <b>Vision Mode:</b> Soi ảnh siêu cấp.<br>
                🚀 <b>Squad Mode:</b> Đua nhiều model cùng lúc.<br><br>
                <i>Nhập API Key trong cài đặt để bắt đầu nhé!</i>
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
let currentSessionId = 'session_' + new Date().getTime();

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
    console.log("🚀 System initializing (OPTIMIZED MODE)...");
    
    // 1. Hiển thị màn hình Welcome
    messagesArea.innerHTML = WELCOME_HTML;
    
    // 2. Reset biến lưu trữ chat
    chatHistory = [{ role: "system", content: config.systemPrompt }];
    currentSessionId = 'session_' + new Date().getTime();

    // 3. Cấu hình hiển thị Code (Highlight)
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

    renderHeaderStatus();
}

/**
 * ==========================================================================================
 * 5. HISTORY & SESSION MANAGEMENT
 * ========================================================================================
 */

async function toggleHistoryPanel() {
    const panel = document.getElementById('historyPanel');
    const listContainer = document.getElementById('historyList');
    
    if (!panel || !listContainer) return;

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
        const sessions = request.result.filter(s => s.id !== 'current_session'); 
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
    }
}

async function deleteSession(sessionId, event) {
    event.stopPropagation();
    if(!confirm("Xóa vĩnh viễn cuộc trò chuyện này?")) return;

    await dbDelete(DB_CONFIG.STORES.CHAT, sessionId);
    
    if (sessionId === currentSessionId) {
        startNewChat();
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
    
    await dbPut(DB_CONFIG.STORES.CHAT, currentSessionId, chatData);
    await dbPut(DB_CONFIG.STORES.CHAT, 'current_session', chatData);
}    

/**
 * ==========================================================================================
 * 6. LOADERS & WORKERS (OPTIMIZED - AUTO TERMINATE)
 * ==========================================================================================
 */

const loadScript = (id, src) => {
    return new Promise((resolve, reject) => {
        if (document.getElementById(id)) { resolve(); return; }
        const script = document.createElement('script');
        script.id = id;
        script.src = src;
        script.onload = () => resolve();
        script.onerror = reject;
        document.head.appendChild(script);
    });
};

// Python Executor
async function runPython(btn) {
    const actionBar = btn.closest('.code-action-bar');
    const preElement = actionBar.previousElementSibling;
    const codeElement = preElement.querySelector('code');
    const code = codeElement ? codeElement.innerText : preElement.innerText;
    const indentedCode = code.split('\n').map(line => '    ' + line).join('\n');

    let outputDiv = actionBar.nextElementSibling;
    if (!outputDiv || !outputDiv.classList.contains('python-output')) {
        outputDiv = document.createElement('div');
        outputDiv.className = 'python-output';
        actionBar.parentNode.insertBefore(outputDiv, actionBar.nextSibling);
    }

    outputDiv.style.display = 'block'; 
    outputDiv.innerHTML = '<span class="text-yellow-400"><i class="fas fa-spinner fa-spin"></i> Loading Python Environment...</span>';

    try {
        if (!window.loadPyodide) await loadScript('pyodide-script', RESOURCES.pyodide);

        if (!pyodideReady) {
            outputDiv.innerHTML = '<span class="text-yellow-400"><i class="fas fa-box-open fa-spin"></i> Initializing Pyodide...</span>';
            pyodideObj = await loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.2/full/" });
            await pyodideObj.loadPackage(["matplotlib", "pandas", "numpy"]);
            pyodideReady = true;
        }

        outputDiv.innerHTML = '<span class="text-green-400"><i class="fas fa-terminal fa-spin"></i> Executing...</span>';

        // Cấu hình Matplotlib
        const isMobile = window.innerWidth < 768;
        const figSize = isMobile ? "[6, 6]" : "[10, 6]";
        
        const wrapperCode = `
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import io, base64, sys, json
import pandas as pd
import numpy as np

plt.style.use('dark_background')
plt.rcParams.update({
    'figure.facecolor': '#0b1121', 'axes.facecolor': '#0b1121', 
    'text.color': '#cbd5e1', 'axes.labelcolor': '#cbd5e1', 
    'xtick.color': '#cbd5e1', 'ytick.color': '#cbd5e1', 
    'grid.color': '#334155', 'font.family': 'sans-serif',
    'font.size': 10, 'figure.figsize': ${figSize}, 'figure.dpi': 144
})

sys.stdout = io.StringIO()
try:
${indentedCode}
except Exception as e:
    print(f"Runtime Error: {e}")

img_str = ""
if plt.get_fignums():
    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', pad_inches=0.1)
    buf.seek(0)
    img_str = base64.b64encode(buf.read()).decode('utf-8')
    plt.clf()

json.dumps({"text": sys.stdout.getvalue(), "image": img_str})
`;
        const resultJSON = await pyodideObj.runPythonAsync(wrapperCode);
        const result = JSON.parse(resultJSON);

        let html = "";
        if (result.text) html += `<div class="mb-3 text-slate-300 whitespace-pre-wrap font-mono text-sm border-b border-slate-700 pb-2">${result.text}</div>`;
        if (result.image) html += `<div class="flex justify-center"><img src="data:image/png;base64,${result.image}" alt="Chart" style="max-width:100%; border-radius:8px;"></div>`;
        if (!html) html = `<span class="text-slate-500 italic">✅ Code executed (No output).</span>`;

        outputDiv.innerHTML = html;

    } catch (err) {
        outputDiv.innerHTML = `<div class="text-red-400 bg-red-900/20 p-2 rounded border border-red-500/50"><strong>⚠️ Error:</strong><br>${err.message}</div>`;
    }
}

function attachRunButtons() {
    document.querySelectorAll('code.language-python').forEach(codeEl => {
        const pre = codeEl.parentElement;
        if (pre.nextElementSibling && pre.nextElementSibling.classList.contains('code-action-bar')) return;
        const actionBar = document.createElement('div');
        actionBar.className = 'code-action-bar';
        actionBar.innerHTML = `<div class="run-btn" onclick="runPython(this)"><i class="fas fa-play"></i> RUN</div>`;
        pre.parentNode.insertBefore(actionBar, pre.nextSibling);
    });
}

// OCR (Tesseract) - AUTO TERMINATE VERSION
async function runOCR(file, statusSpan) {
    if (!window.Tesseract) {
        statusSpan.innerHTML = `<i class="fas fa-download fa-spin"></i> Loading OCR Engine...`;
        await loadScript('tesseract-lib', RESOURCES.tesseract);
    }

    // Luôn tạo worker mới để đảm bảo sạch sẽ
    statusSpan.innerHTML = `<i class="fas fa-brain fa-spin"></i> Processing OCR...`;
    const worker = await Tesseract.createWorker('vie+eng');
    
    try {
        const ret = await worker.recognize(file);
        // TẮT NGAY LẬP TỨC SAU KHI DÙNG
        console.log("✅ OCR done. Terminating worker immediately.");
        await worker.terminate(); 
        return ret.data.text;
    } catch (e) {
        await worker.terminate(); // Tắt kể cả khi lỗi
        throw e;
    }
}

// PDF Helper
async function ensurePdfLib() {
    if (!window.pdfjsLib) {
        await loadScript('pdf-lib', RESOURCES.pdfjs);
        pdfjsLib.GlobalWorkerOptions.workerSrc = RESOURCES.pdfWorker;
    }
}

async function convertPdfToImages(file) {
    await ensurePdfLib();
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;    
    const images = [];
    const maxPages = Math.min(pdf.numPages, 3); // Limit 3 pages for speed

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
        return `[Error reading PDF: ${e.message}]`;
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
 * 7. MAIN CHAT LOGIC
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

    // Routing Logic
    if (window.isDebateMode) { startDebateSystem(text); return; }
    if (window.isSynthesisMode) { startSynthesisSystem(text); return; }
    
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

        try {
            renderContentToElement(statusId, "AI đang phân tích câu hỏi...");
            const directorPrompt = `Analyze prompt: "${text}". Write precise English prompt for Vision AI to extract data. Return ONLY prompt.`;
            const visionInstruction = await runSingleDebateTurn(mainModel, [{role: "user", content: directorPrompt}], statusId);
            
            renderContentToElement(statusId, "Vision đang soi ảnh...");
            const visionContent = [
                { type: "text", text: visionInstruction },
                ...pendingVisionImages.map(img => ({ type: "image_url", image_url: { url: img } }))
            ];
            const visionAnalysis = await runSingleDebateTurn(visionModel, [{role: "user", content: visionContent}], statusId);
            
            // Xóa card trạng thái
            document.getElementById(statusId).closest('.ai-card').remove();
    
            const finalPrompt = `Original Info: "${text}". Vision Data: """${visionAnalysis}""". Answer user request.`;
            await runStream(mainModel, [...chatHistory, {role: "user", content: finalPrompt}], responseGroup);
    
        } catch (e) {
            console.error(e);
            appendUserMessage("System Error", `<span class="text-red-400">Error: ${e.message}</span>`);
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
        if (e.name !== 'AbortError') renderContentToElement(bubbleId, fullText + `\n\n⚠️ Error: ${e.message}`);
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
        if (bubbleId && bubbleId !== "null" && e.name !== 'AbortError') renderContentToElement(bubbleId, `\n⚠️ Error: ${e.message}`);
        throw e;
    }
}

/**
 * ==========================================================================================
 * 8. ADVANCED MODES (Debate & Synthesis)
 * ==========================================================================================
 */

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
        if (config && config.isSquadMode) { config.isSquadMode = false; renderHeaderStatus(); }
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
    if (pendingVisionImages.length > 0) {
        try {
            const visionModel = config.visionModel || config.models[0];
            const visionPrompt = [
                { type: "text", text: "Describe these images for debate context." },
                ...pendingVisionImages.map(img => ({ type: "image_url", image_url: { url: img } }))
            ];
            const imageDesc = await runSingleDebateTurn(visionModel, [{role: "user", content: visionPrompt}], "null");
            contextData += `\n[IMAGE DATA]:\n"${imageDesc}"\n`;
        } catch (e) {}
    }
    if (currentFileContent) {
        if (currentFileContent.length > 3000) {
            const keywords = await extractSmartKeywords(userText, config.models[0]);
            const relevantText = await getRelevantContextWithStatus(keywords, currentFileContent);
            contextData += `\n[FILE DATA]: \n${relevantText}\n`;
        } else {
            contextData += `\n[FILE DATA]: \n${currentFileContent}\n`;
        }
    }
    if (contextData) return `${userText}\n\n=== ATTACHMENTS ===${contextData}\n=== END ===\n`;
    return userText;
}

async function startDebateSystem(topic) {
    if (config.models.length < 2) return alert("⚠️ Cần chọn ít nhất 2 Models để chạy debate!");
    setGeneratingState(true);
    const enrichedTopic = await processAttachmentsForContext(topic);
    
    const modelA = config.models[0];
    const modelB = config.models[1];
    document.getElementById('userInput').value = "";
    
    const directorPrompt = `Topic: "${enrichedTopic}". Analyze & Identify 2 opposing perspectives (A vs B). Output JSON ONLY: {"roleA": "...", "descA": "...", "roleB": "...", "descB": "..."}`;
    let roles = { roleA: "Pro", descA: "Agree", roleB: "Con", descB: "Disagree" };
    
    try {
        const scanResult = await runSingleDebateTurn(modelA, [{role: "user", content: directorPrompt}], "null");
        const jsonMatch = scanResult.match(/\{[\s\S]*\}/);
        if (jsonMatch) roles = JSON.parse(jsonMatch[0]);
    } catch(e) {}
    
    appendUserMessage(topic, `<div class="cinema-title" style="background:#0f172a; border:1px solid #475569; padding:10px; border-radius:5px;">
    <h3 style="color:#38bdf8">🔍 ${topic}</h3><div style="color:#94a3b8; font-size:12px;">${roles.roleA} VS ${roles.roleB}</div></div>`);
    
    const responseGroup = createResponseGroup();
    let debateTranscript = `TOPIC: ${topic}\n`;
    let lastLine = "";
    
    for (let turn = 1; turn <= 6; turn++) {
        const isTurnA = turn % 2 !== 0;
        const currentModel = isTurnA ? modelA : modelB;
        const role = isTurnA ? roles.roleA : roles.roleB;
        const bubbleId = createAiCard(responseGroup, role);
        try {
            const result = await runSingleDebateTurn(currentModel, [
                { role: "system", content: `You are ${role}. Opponent: ${isTurnA ? roles.roleB : roles.roleA}. Short, witty, Vietnamese.` },
                { role: "user", content: turn===1 ? `Start debate on ${topic}` : `Opponent said: "${lastLine}". Respond.` }
            ], bubbleId);
            lastLine = result;
            debateTranscript += `${role}: ${result}\n`;
        } catch (e) { break; }
    }
    setGeneratingState(false);
}

// Synthesis Logic
window.isSynthesisMode = false;
function toggleSynthesisMode() {
    window.isSynthesisMode = !window.isSynthesisMode;
    const btn = document.getElementById('synthesisModeToggle');
    const inputWrapper = document.querySelector('.input-wrapper');
    if (window.isSynthesisMode) {
        if (window.isDebateMode) toggleDebateMode();
        btn.classList.add('synthesis-active');
        inputWrapper.style.borderColor = "#fbbf24"; 
    } else {
        btn.classList.remove('synthesis-active');
        inputWrapper.style.borderColor = "#334155";
    }
}

async function startSynthesisSystem(query) {
    if (config.models.length < 2) return alert("⚠️ Cần ít nhất 2 Models!");
    setGeneratingState(true);
    const enrichedQuery = await processAttachmentsForContext(query);
    document.getElementById('userInput').value = "";
    
    appendUserMessage(query, `<div style="color:#fbbf24; font-weight:bold;">⚗️ SYNTHESIS ACTIVE</div>`);
    const responseGroup = createResponseGroup();
    const synthesisId = createAiCard(responseGroup, "Synthesizer");

    try {
        const results = await Promise.all(config.models.map(m => runSingleDebateTurn(m, [{role: "user", content: enrichedQuery}], "null")));
        const combined = results.map((r, i) => `[Model ${i+1}]: ${r}`).join("\n\n");
        await runStream(config.models[0], [{role: "user", content: `Synthesize these answers into one perfect Vietnamese response:\n${combined}`}], responseGroup, synthesisId);
    } catch (e) {}
    setGeneratingState(false);
}

// Smart Search with FIX (Hide on complete)
async function extractSmartKeywords(query, model) {
    const ragContainer = document.getElementById('ragStatus');
    ragContainer.classList.remove('hidden');
    document.getElementById('ragStatusText').innerHTML = `<i class="fas fa-brain fa-spin"></i> THINKING...`;
    try {
        const keywords = await runSingleDebateTurn(model, [{role: "user", content: `Extract 5 keywords from: "${query}" (comma separated)`}], "null"); 
        return keywords; 
    } catch (e) { return query; }
}

async function getRelevantContextWithStatus(keywords, content) {
    const ragBar = document.getElementById('ragProgressBar');
    const ragText = document.getElementById('ragStatusText');
    const ragPercent = document.getElementById('ragProgressPercent');
    
    const lines = content.split('\n');
    let relevantChunks = [];
    const keywordList = keywords.split(',').map(k => k.trim().toLowerCase());

    ragText.innerHTML = `<i class="fas fa-search text-blue-400"></i> SCANNING...`;
    
    for (let i = 0; i < lines.length; i++) {
        if (i % 100 === 0) {
            const percent = Math.round((i / lines.length) * 100);
            ragBar.style.width = `${percent}%`;
            ragPercent.innerText = `${percent}%`;
            await new Promise(r => setTimeout(r, 0)); 
        }
        if (keywordList.some(k => lines[i].toLowerCase().includes(k))) relevantChunks.push(lines[i]);
    }
    
    ragBar.style.width = '100%';
    ragPercent.innerText = '100%';
    
    // [FIX] Ẩn thanh trạng thái sau khi hoàn thành
    setTimeout(() => {
        document.getElementById('ragStatus').classList.add('hidden');
    }, 1000); // Đợi 1s cho người dùng thấy 100% rồi ẩn
    
    return relevantChunks.length ? relevantChunks.join('\n') : content.substring(0, 3000);
}

/**
 * ==========================================================================================
 * 9. UI HANDLERS
 * ==========================================================================================
 */

async function handleFileSelect(input) {
    const files = input.files;
    if (!files || files.length === 0) return;
    const previewDiv = document.getElementById('filePreview');
    previewDiv.classList.remove('hidden');  
    currentFileContent = "";
    pendingVisionImages = [];
    
    try {
        document.getElementById('fileName').innerHTML = `<i class="fas fa-spinner fa-spin"></i> Processing ${files.length} files...`;
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (file.type.startsWith('image/')) {
                const base64 = await readImageAsBase64(file);
                if (config.useVision) pendingVisionImages.push(base64);
                else currentFileContent += `\n[IMG-OCR]: ${await runOCR(file, document.getElementById('fileName'))}\n`;
            } else if (file.type === 'application/pdf') {
                if (config.useVision) (await convertPdfToImages(file)).forEach(img => pendingVisionImages.push(img));
                else currentFileContent += `\n[PDF]: ${await readPdfText(file)}\n`;
            } else {
                currentFileContent += `\n[TEXT]: ${await readFileAsText(file)}\n`;
            }
        }
        document.getElementById('fileName').innerHTML = `<i class="fas fa-check"></i> ${files.length} files ready`;
    } catch (e) { alert("File Error: " + e.message); }
}

function clearFile() { 
    currentFileContent=null; pendingVisionImages = []; 
    document.getElementById('fileInput').value=''; 
    document.getElementById('filePreview').classList.add('hidden'); 
}

function autoResize(t) { t.style.height='auto'; t.style.height=Math.min(t.scrollHeight,120)+'px'; }
function useSuggestion(t) { userInput.value = t; autoResize(userInput); userInput.focus(); }
function confirmClearChat() { if(confirm("Xoá sạch sẽ?")) { messagesArea.innerHTML=WELCOME_HTML; chatHistory=[{role:"system",content:config.systemPrompt}]; } }

function openSettings() {
    document.getElementById('apiKeyInput').value = config.apiKey;
    document.getElementById('customUrlInput').value = config.customUrl;
    document.getElementById('systemPromptInput').value = config.systemPrompt;
    document.getElementById('tempInput').value = config.temperature; 

document.getElementById('topPInput').value = config.topP;
    
document.getElementById('visionModelInput').value = config.visionModel;
    renderModelList();
    if(settingsModal) settingsModal.classList.add('active');
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
    const val = document.getElementById('newModelSelect').value;
    if (val && !config.models.includes(val)) { config.models.push(val); renderModelList(); }
}
function addCustomModel() {
    const val = document.getElementById('customModelInput').value.trim();
    if (val && !config.models.includes(val)) { config.models.push(val); renderModelList(); }
}
function removeModel(index) { config.models.splice(index, 1); renderModelList(); }

function saveSettings() {
    config.apiKey = document.getElementById('apiKeyInput').value.trim();
    config.customUrl = document.getElementById('customUrlInput').value.trim();
    config.systemPrompt = document.getElementById('systemPromptInput').value.trim();
    config.temperature = parseFloat(document.getElementById('tempInput').value);
    config.topP = parseFloat(document.getElementById('topPInput').value);
    config.visionModel = document.getElementById('visionModelInput').value.trim();
    
    localStorage.setItem('chat_api_key', config.apiKey);
    localStorage.setItem('chat_custom_url', config.customUrl);         
    localStorage.setItem('chat_models_list', JSON.stringify(config.models));
    localStorage.setItem('chat_temperature', config.temperature);

localStorage.setItem('chat_top_p', config.topP);
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
    squadModeToggle.classList.toggle('active', config.isSquadMode);
    renderHeaderStatus();
}

function toggleVisionSetting(el) {
    config.useVision = !config.useVision;
    const switchEl = el.querySelector('.toggle-switch');
    switchEl.style.background = config.useVision ? '#fbbf24' : '#334155';
}

function renderHeaderStatus() {
    const el = document.getElementById('headerStatus');
    const firstModel = config.models[0] ? config.models[0].split('/').pop() : 'None';
    el.innerHTML = config.isSquadMode ? `Squad Mode (${config.models.length})` : `Single: ${firstModel}`;
}

function setGeneratingState(isGen) {
    document.getElementById('sendBtn').style.display = isGen ? 'none' : 'flex';
    document.getElementById('stopBtn').style.display = isGen ? 'flex' : 'none';
    document.getElementById('typingIndicator').style.display = isGen ? 'block' : 'none';
    userInput.disabled = isGen;
}

settingsModal.addEventListener('click', (e) => { if(e.target===settingsModal) closeSettings(); });
window.onload = initChat;
