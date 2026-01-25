// --- LICENSE SYSTEM CONFIGURATION ---
const LICENSE_CONFIG = {
  FREE_CHAT_LIMIT: 5,          // 5 lượt chat single free
  FREE_FEATURE_LIMIT: 2,       // 2 lượt mỗi tính năng đặc biệt (Debate, Synthesis, Vision, Squad)
  SUPABASE_URL: 'https://YOUR_PROJECT.supabase.co', // ⚠️ THAY BẰNG URL CỦA BẠN
  SUPABASE_KEY: 'YOUR_ANON_KEY' // ⚠️ THAY BẰNG ANON KEY CỦA BẠN
};

// --- 🛠️ DYNAMIC RESOURCE MANAGER (Lazy Load) ---
// Danh sách "Thợ" chỉ gọi khi cần, không nuôi tốn cơm
const RESOURCES = {
   tesseract: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',
   pyodide: 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js',
   pdfjs: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
   pdfWorker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
};

// --- LICENSE LOGIC & STATE ---
let usageData = {
  freeChatUsed: parseInt(localStorage.getItem('free_chat_used') || '0'),
  freeDebateUsed: parseInt(localStorage.getItem('free_debate_used') || '0'),
  freeSynthesisUsed: parseInt(localStorage.getItem('free_synthesis_used') || '0'),
  freeVisionUsed: parseInt(localStorage.getItem('free_vision_used') || '0'),
  freeSquadUsed: parseInt(localStorage.getItem('free_squad_used') || '0'),
  lastResetDate: localStorage.getItem('last_reset_date') || new Date().toDateString()
};

function checkAndResetDailyUsage() {
  const today = new Date().toDateString();
  if (usageData.lastResetDate !== today) {
    Object.keys(usageData).forEach(key => {
      if (key.startsWith('free') && key.endsWith('Used')) {
        usageData[key] = 0;
        localStorage.setItem(key, '0');
      }
    });
    usageData.lastResetDate = today;
    localStorage.setItem('last_reset_date', today);
    console.log('✅ Đã reset lượt dùng hàng ngày');
  }
}

async function validateLicenseKey(key) {
  try {
    const response = await fetch(`${LICENSE_CONFIG.SUPABASE_URL}/rest/v1/licenses?license_key=eq.${encodeURIComponent(key)}&select=*`, {
      headers: {
        'apikey': LICENSE_CONFIG.SUPABASE_KEY,
        'Authorization': `Bearer ${LICENSE_CONFIG.SUPABASE_KEY}`
      }
    });
    
    if (!response.ok) throw new Error('API error');
    
    const data = await response.json();
    if (data.length === 0) return { valid: false, message: 'License không tồn tại' };
    
    const license = data[0];
    const now = new Date();
    const expiresAt = new Date(license.expires_at);
    
    if (expiresAt < now) return { valid: false, message: 'License đã hết hạn' };
    if (license.max_usage_count !== null && license.usage_count >= license.max_usage_count) return { valid: false, message: 'Đã hết lượt sử dụng' };
    if (!license.is_active) return { valid: false, message: 'License đã bị vô hiệu hóa' };
    
    return { 
      valid: true, 
      expiresAt: license.expires_at,
      daysLeft: Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24))
    };
    
  } catch (error) {
    console.error('Lỗi kiểm tra license:', error);
    return { valid: false, message: 'Lỗi kết nối server (Kiểm tra Config)' };
  }
}

function checkFeaturePermission(feature) {
  checkAndResetDailyUsage();
  
  const licenseKey = localStorage.getItem('license_key');
  
  // 1. Kiểm tra License Premium
  if (licenseKey) {
    const licenseData = JSON.parse(localStorage.getItem('license_data') || '{}');
    const now = new Date();
    const expiresAt = new Date(licenseData.expiresAt);
    
    if (expiresAt > now) {
      return { allowed: true, type: 'license', daysLeft: licenseData.daysLeft };
    } else {
      localStorage.removeItem('license_key');
      localStorage.removeItem('license_data');
      alert('⚠️ License của bạn đã hết hạn. Vui lòng gia hạn!');
    }
  }
  
  // 2. Kiểm tra giới hạn Free
  const limits = {
    'chat': { max: LICENSE_CONFIG.FREE_CHAT_LIMIT, usedKey: 'freeChatUsed' },
    'debate': { max: LICENSE_CONFIG.FREE_FEATURE_LIMIT, usedKey: 'freeDebateUsed' },
    'synthesis': { max: LICENSE_CONFIG.FREE_FEATURE_LIMIT, usedKey: 'freeSynthesisUsed' },
    'vision': { max: LICENSE_CONFIG.FREE_FEATURE_LIMIT, usedKey: 'freeVisionUsed' },
    'squad': { max: LICENSE_CONFIG.FREE_FEATURE_LIMIT, usedKey: 'freeSquadUsed' }
  };
  
  const limit = limits[feature];
  if (!limit) return { allowed: true, type: 'free' }; // Không giới hạn tính năng lạ
  
  if (usageData[limit.usedKey] >= limit.max) {
    return { 
      allowed: false, 
      type: 'free',
      message: `🚫 HẾT LƯỢT FREE!\nBạn đã dùng hết ${limit.max} lượt ${feature} hôm nay.\nVui lòng mua License hoặc quay lại ngày mai.`
    };
  }
  
  // Tăng lượt dùng và lưu lại
  usageData[limit.usedKey]++;
  localStorage.setItem(limit.usedKey, usageData[limit.usedKey].toString());
  
  // Update UI Header ngay lập tức
  renderHeaderStatus();
  
  return { 
    allowed: true, 
    type: 'free', 
    remaining: limit.max - usageData[limit.usedKey]
  };
}

// --- STANDARD APP CODE STARTS HERE ---

// Hàm chuyên đi gọi thợ dậy
const loadScript = (id, src) => {
   return new Promise((resolve, reject) => {
       if (document.getElementById(id)) { resolve(); return; } // Đã dậy rồi thì thôi
       console.log(`⏳ Đang gọi: ${id}...`);
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

// Quản lý trạng thái ngủ đông của Worker
let activeWorkers = {
   ocr: null,
   ocrTimer: null // Hẹn giờ đi ngủ
};

// --- CONFIG & CONSTANTS ---
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
           <div class="ai-header"><span class="ai-model-name"><i class="fas fa-bolt text-yellow-400"></i> System v5.2 MoE + License</span></div>
           <div class="ai-bubble">
               Chào sếp! <b>AI Streaming Pro v5.2 (MoE Edition)</b> đã khởi động! 🏎️<br><br>
               🔑 <b>License System:</b> Quản lý lượt dùng Free/Pro thông minh.<br>
               💤 <b>Mixture of Experts:</b> Các thư viện nặng (OCR, Python, PDF) giờ sẽ "ngủ đông" và chỉ thức dậy khi sếp gọi.<br>
               🎨 <b>Color & Highlight:</b> Code và Markdown đã được tô màu rực rỡ.<br>
               👁️ <b>NEW: Vision Mode:</b> Đọc hiểu ảnh/biểu đồ siêu xịn (Bật trong cài đặt).<br>
               🚀 <b>Squad Mode:</b> Chạy nhiều model cùng lúc siêu tốc.<br><br>
               <i>Nhập API Key trong cài đặt để bắt đầu đua nhé!</i>
           </div>
       </div>
   </div>`;

let config = {
   apiKey: localStorage.getItem('chat_api_key') || '',
   customUrl: localStorage.getItem('chat_custom_url') || '',
   models: JSON.parse(localStorage.getItem('chat_models_list') || '["openai/gpt-oss-120b:free"]'),
   
   systemPrompt: REQUIRED_SYSTEM_PROMPT,

   temperature: parseFloat(localStorage.getItem('chat_temperature') || '0.7'),
   isSquadMode: false,
   // 🆕 Vision Config
   useVision: localStorage.getItem('chat_use_vision') === 'true',
   visionModel: localStorage.getItem('chat_vision_model') || 'google/gemini-2.0-flash-exp:free',
};

let abortControllers = [];
let chatHistory = [{ role: "system", content: config.systemPrompt }];

const messagesArea = document.getElementById('messagesArea');
const userInput = document.getElementById('userInput');
const squadModeToggle = document.getElementById('squadModeToggle');
const settingsModal = document.getElementById('settingsModal');

// --- INIT ---
initChat();

function initChat() {
   checkAndResetDailyUsage(); // Kiểm tra reset lượt dùng hàng ngày
   renderHeaderStatus();
   if (messagesArea.innerHTML.trim() === "") messagesArea.innerHTML = WELCOME_HTML;
   
   // Configure Marked to use Highlight.js
   marked.setOptions({
       highlight: function(code, lang) {
           if (lang && hljs.getLanguage(lang)) {
               return hljs.highlight(code, { language: lang }).value;
           }
           return hljs.highlightAuto(code).value;
       },
       breaks: true
   });

   // Inject License UI sau 1s (đợi DOM ổn định)
   setTimeout(() => {
     if (settingsModal) addLicenseUI();
   }, 1000);
}

// --- UI LICENSE HELPERS ---
// [SỬA ĐỔI] Chỉ hiển thị trạng thái, bỏ khung nhập input để tránh xung đột
function addLicenseUI() {
  if (document.getElementById('licenseStatus')) return; // Đã thêm rồi thì thôi

  // HTML đã được rút gọn: Bỏ Input và Button
  const licenseHTML = `
    <div class="settings-section" style="border-top: 1px solid #334155; margin-top: 15px; padding-top: 15px;">
      <h3 style="color: #fbbf24; margin-bottom: 10px;"><i class="fas fa-key"></i> License System</h3>
      
      <div id="licenseStatus" class="mb-3 p-3 rounded" style="background: #1e293b; border: 1px solid #334155;">
        <div id="licenseStatusContent">
          <i class="fas fa-spinner fa-spin"></i> Đang tải trạng thái...
        </div>
      </div>
      
      <div class="mt-3 text-xs text-slate-400" style="margin-top: 10px; font-size: 0.75rem; color: #94a3b8;">
        <div><i class="fas fa-sync-alt"></i> Reset Free: 00:00 hàng ngày</div>
      </div>
    </div>
  `;

  // Tìm vị trí chèn: Ưu tiên sau modelSettings
  const content = settingsModal.querySelector('.settings-content') || settingsModal;
  const modelSection = document.getElementById('modelSettings');
  
  if (modelSection && modelSection.parentNode) {
    modelSection.insertAdjacentHTML('afterend', licenseHTML);
  } else {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = licenseHTML;
    content.appendChild(tempDiv);
  }
}


function updateLicenseStatusDisplay() {
  const statusContent = document.getElementById('licenseStatusContent');
  if (!statusContent) return;

  const licenseKey = localStorage.getItem('license_key');
  
  if (licenseKey) {
    const licenseData = JSON.parse(localStorage.getItem('license_data') || '{}');
    const now = new Date();
    const expiresAt = new Date(licenseData.expiresAt);
    const daysLeft = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));
    
    if (daysLeft > 0) {
        statusContent.innerHTML = `
            <div class="text-green-400" style="color:#4ade80; font-weight:bold;">
              <i class="fas fa-check-circle"></i> Đã kích hoạt Premium
              <div style="font-size: 0.8em; color: #94a3b8; margin-top: 4px;">Còn ${daysLeft} ngày sử dụng</div>
            </div>`;
    } else {
        statusContent.innerHTML = `<div class="text-red-400" style="color:#f87171;">⚠️ License đã hết hạn</div>`;
    }
  } else {
    statusContent.innerHTML = `
        <div class="text-yellow-400" style="color:#fbbf24;">
          <i class="fas fa-info-circle"></i> Chế độ Free (Giới hạn)
        </div>
        <div style="font-size: 0.8em; color: #94a3b8; margin-top: 5px;">
           Chat: ${usageData.freeChatUsed}/${LICENSE_CONFIG.FREE_CHAT_LIMIT} | 
           Feats: ${usageData.freeDebateUsed}/${LICENSE_CONFIG.FREE_FEATURE_LIMIT}
        </div>`;
  }
}

// [SỬA ĐỔI] Hàm này giữ lại để tránh lỗi tham chiếu, nhưng thêm check an toàn
async function activateLicense() {
  const keyInput = document.getElementById('licenseKeyInput');
  // Nếu không tìm thấy input (do đã xoá UI), thì return luôn để không lỗi
  if (!keyInput) {
      console.log("License Input UI hidden (Managed externally)");
      return; 
  }
  
  // Logic cũ giữ nguyên nếu cần dùng lại sau này
  const key = keyInput.value.trim();
  if (!key) return alert('Vui lòng nhập key!');
  
  const btn = event.target || document.createElement('button'); // Fallback nếu event null
  const originalText = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking...';
  
  try {
      const result = await validateLicenseKey(key);
      if (result.valid) {
        localStorage.setItem('license_key', key);
        localStorage.setItem('license_data', JSON.stringify({
          expiresAt: result.expiresAt,
          daysLeft: result.daysLeft
        }));
        alert(`✅ Kích hoạt thành công! Còn ${result.daysLeft} ngày.`);
        updateLicenseStatusDisplay();
        renderHeaderStatus();
      } else {
        alert(`❌ ${result.message}`);
      }
  } catch(e) { console.error(e); }
  
  btn.innerHTML = originalText;
}

// [SỬA ĐỔI] Tương tự, thêm check an toàn
function deactivateLicense() {
  if(confirm('Bạn có chắc muốn xóa license key?')) {
      localStorage.removeItem('license_key');
      localStorage.removeItem('license_data');
      updateLicenseStatusDisplay();
      renderHeaderStatus();
      alert('Đã về chế độ Free.');
  }
}

// --- RENDERING & THROTTLING ---

function throttle(func, limit) {
   let lastFunc, lastRan;
   return function() {
       const context = this, args = arguments;
       if (!lastRan) {
           func.apply(context, args);
           lastRan = Date.now();
       } else {
           clearTimeout(lastFunc);
           lastFunc = setTimeout(function() {
               if ((Date.now() - lastRan) >= limit) {
                   func.apply(context, args);
                   lastRan = Date.now();
               }
           }, limit - (Date.now() - lastRan));
       }
   }
}

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

// --- 🆕 VISION UTILITIES ---
let pendingVisionImages = []; 

async function convertPdfToImages(file) {
   if (!window.pdfjsLib) {
       await loadScript('pdf-lib', RESOURCES.pdfjs);
       pdfjsLib.GlobalWorkerOptions.workerSrc = RESOURCES.pdfWorker;
   }

   const arrayBuffer = await file.arrayBuffer();
   const pdf = await pdfjsLib.getDocument({data: arrayBuffer}).promise;
   const images = [];
   const maxPages = Math.min(pdf.numPages, 3); // Giới hạn 3 trang

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

function readImageAsBase64(file) {
   return new Promise((resolve, reject) => {
       const reader = new FileReader();
       reader.onload = () => resolve(reader.result);
       reader.onerror = error => reject(error);
       reader.readAsDataURL(file);
   });
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

// --- REWRITTEN SEND MESSAGE (WITH LICENSE CHECKS) ---
async function sendMessage() {
    let text = userInput.value.trim();
    if (!text && !currentFileContent && pendingVisionImages.length === 0) return;

    // 🌟 LICENSE CHECK 1: CHUYỂN HƯỚNG SANG CÁC CHẾ ĐỘ ĐẶC BIỆT
    // (Các hàm startDebateSystem và startSynthesisSystem sẽ tự kiểm tra license của riêng nó)
    if (window.isDebateMode) {
        startDebateSystem(text);
        return;
    }
    if (window.isSynthesisMode) {
        startSynthesisSystem(text);
        return;
    }

    // 🌟 LICENSE CHECK 2: XÁC ĐỊNH LOẠI TÍNH NĂNG CƠ BẢN
    let featureType = 'chat';
    if (pendingVisionImages.length > 0) featureType = 'vision';
    else if (config.isSquadMode) featureType = 'squad';
    
    // Kiểm tra quyền (trừ tiền nếu Free)
    const permission = checkFeaturePermission(featureType);
    if (!permission.allowed) {
        alert(permission.message);
        return; // Chặn luôn
    }

   // UI Updates
   userInput.value = "";
   userInput.style.height = 'auto';
   setGeneratingState(true);
   let displayHtml = text;

   // --- TRƯỜNG HỢP 1: CÓ ẢNH -> CHẠY QUY TRÌNH AGENT ---
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

    // Tạo bong bóng trạng thái
    const statusId = createAiCard(responseGroup, "System Agent");
    const updateStatus = (msg) => {
       const el = document.getElementById(statusId);
       if(el) el.innerHTML = `<i class="fas fa-cog fa-spin text-yellow-400"></i> ${msg}`;
    };

    try {
       // --- BƯỚC 1: DIRECTOR SUY NGHĨ ---
       updateStatus("AI đang phân tích câu hỏi để chỉ đạo Vision...");
       const directorPrompt = `
       Bạn là một trợ lý AI thông minh (Director).
       Người dùng vừa gửi một hình ảnh kèm câu hỏi: "${text || 'Hãy phân tích ảnh này'}".
       Nhiệm vụ: Hãy viết một câu lệnh (Prompt) thật cụ thể, rõ ràng bằng tiếng Anh gửi cho AI Vision để nó trích xuất thông tin cần thiết nhất từ ảnh.
       Chỉ trả về nội dung câu lệnh (Prompt).`;
       
       const visionInstruction = await runSingleDebateTurn(mainModel, [{role: "user", content: directorPrompt}], statusId);

       if(abortControllers.length === 0) throw new Error("Đã dừng bởi người dùng.");

       // --- BƯỚC 2: VISION THỰC THI ---
       updateStatus(`Vision đang soi ảnh...`);
       const visionContent = [
           { type: "text", text: visionInstruction },
           ...pendingVisionImages.map(img => ({ type: "image_url", image_url: { url: img } }))
       ];
       const visionAnalysis = await runSingleDebateTurn(visionModel, [{role: "user", content: visionContent}], statusId);

       if(abortControllers.length === 0) throw new Error("Đã dừng bởi người dùng.");

       // --- BƯỚC 3: TỔNG HỢP & TRẢ LỜI ---
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
       if (!el) {
           appendUserMessage("System Error", `<span class="text-red-400">Lỗi quy trình: ${e.message}</span>`);
       } else {
           el.innerHTML = `<span class="text-red-400">Lỗi: ${e.message}</span>`;
       }
    }
    setGeneratingState(false);
    return; 
   }

   // --- TRƯỜNG HỢP 2: CHAT THƯỜNG ---
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
   if(chatHistory.length > 8) chatHistory = [chatHistory[0], ...chatHistory.slice(-7)];

   const responseGroup = createResponseGroup();
   abortControllers = [];

   let activeModel = config.isSquadMode ? config.models : [config.models[0]];
   let modelsToRun = Array.isArray(activeModel) ? activeModel : [activeModel];

   const promises = modelsToRun.map(model => runStream(model, chatHistory, responseGroup));
   await Promise.allSettled(promises);
   setGeneratingState(false);
}            

// --- SETTINGS UI ---
function openSettings() {
   // Các phần input API Key, Model giữ nguyên
   if(document.getElementById('apiKeyInput')) document.getElementById('apiKeyInput').value = config.apiKey;
   if(document.getElementById('customUrlInput')) document.getElementById('customUrlInput').value = config.customUrl;
   if(document.getElementById('systemPromptInput')) document.getElementById('systemPromptInput').value = config.systemPrompt;
   if(document.getElementById('tempInput')) document.getElementById('tempInput').value = config.temperature; 
   if(document.getElementById('tempDisplay')) document.getElementById('tempDisplay').innerText = config.temperature;

   if(document.getElementById('visionModelInput')) document.getElementById('visionModelInput').value = config.visionModel;
   
   const vBtn = document.getElementById('visionToggleBtn');
   if(vBtn && vBtn.parentElement) {
       const switchEl = vBtn.parentElement.querySelector('.toggle-switch');
       if(switchEl) {
           if(config.useVision) {
               switchEl.style.background = '#fbbf24';
               switchEl.innerHTML = '<div style="position:absolute; top:2px; left:14px; width:14px; height:14px; background:white; border-radius:50%;"></div>';
           } else {
               switchEl.style.background = '#334155';
               switchEl.innerHTML = '<div style="position:absolute; top:2px; left:2px; width:14px; height:14px; background:white; border-radius:50%;"></div>';
           }
       }
   }
   
   renderModelList();
   if(settingsModal) settingsModal.classList.add('active');

   // 🔥 LICENSE CHECK: Chỉ render UI trạng thái, không render input
   if (!document.getElementById('licenseStatus')) {
     addLicenseUI();
   }
   updateLicenseStatusDisplay();
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
       select.value = ''; // Reset selection
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

// --- UTILS ---
function stopGeneration() { abortControllers.forEach(c => c.abort()); abortControllers = []; }
function toggleSquadMode() { 
   config.isSquadMode = !config.isSquadMode; 
   if(config.isSquadMode) squadModeToggle.classList.add('active'); 
   else squadModeToggle.classList.remove('active');
   renderHeaderStatus();
}
function renderHeaderStatus() {
   const el = document.getElementById('headerStatus');
   if(!el) return;
   
   const firstModel = config.models[0] || 'None';
   let displayModel = firstModel;
   if (firstModel.includes('/')) {
       displayModel = firstModel.split('/').pop();
   }
   
   // 🔥 HIỂN THỊ LICENSE BADGE TRÊN HEADER
   const licenseKey = localStorage.getItem('license_key');
   let licenseBadge = '';
  
   if (licenseKey) {
     const licenseData = JSON.parse(localStorage.getItem('license_data') || '{}');
     const now = new Date();
     const expiresAt = new Date(licenseData.expiresAt);
    
     if (expiresAt > now) {
       const daysLeft = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));
       licenseBadge = ` <span style="color:#4ade80; font-size:0.9em;">🪪 Pro(${daysLeft}d)</span>`;
     } else {
       licenseBadge = ` <span style="color:#f87171; font-size:0.9em;">⚠️ Expired</span>`;
     }
   } else {
     const remainingChat = LICENSE_CONFIG.FREE_CHAT_LIMIT - usageData.freeChatUsed;
     licenseBadge = ` <span style="color:#fbbf24; font-size:0.9em;">🆓 Free(${remainingChat})</span>`;
   }
   
   el.innerHTML = config.isSquadMode 
       ? `Squad Mode (${config.models.length}) ${licenseBadge}` 
       : `Single: ${displayModel} ${licenseBadge}`;
}
function setGeneratingState(isGen) {
   document.getElementById('sendBtn').style.display = isGen ? 'none' : 'flex';
   document.getElementById('stopBtn').style.display = isGen ? 'flex' : 'none';
   document.getElementById('typingIndicator').style.display = isGen ? 'block' : 'none';
   userInput.disabled = isGen;
}

let currentFileContent=null,                 currentFileName=null;

   // --- 🆙 HÀM ĐỌC PDF THÔNG MINH (LAZY LOAD) ---
   async function readPdfText(file) {
   try {
       // 💤 Gọi thư viện dậy nếu đang ngủ
       if (!window.pdfjsLib) {
           await loadScript('pdf-lib', RESOURCES.pdfjs);
           pdfjsLib.GlobalWorkerOptions.workerSrc = RESOURCES.pdfWorker;
       }

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

// --- 🆙 HÀM OCR THÔNG MINH (MOE AGENT) ---
async function runOCR(file, statusSpan) {
   if (!window.Tesseract) {
       statusSpan.innerHTML = `<i class="fas fa-download fa-spin"></i> Đang tải Module OCR (Lần đầu hơi lâu)...`;
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
           console.log("💤 OCR Worker hết việc, đi ngủ thôi!");
           await activeWorkers.ocr.terminate();
           activeWorkers.ocr = null;
       }
   }, 60000); 

   return ret.data.text;
}

// -----------------------------------------------------------
// 2. REWRITTEN HANDLE FILE SELECT (DUAL MODE + MOE)
// -----------------------------------------------------------
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
               nameSpan.innerHTML = `<i class="fas fa-eye text-yellow-400 fa-spin"></i> Vision Mode Processing...`;
               
               for (let i = 0; i < files.length; i++) {
               const file = files[i];
               names.push(file.name);

               if (file.type.startsWith('image/')) {
                   const base64 = await readImageAsBase64(file);
                   pendingVisionImages.push(base64); 
               } 
               else if (file.type === 'application/pdf') {
                   const images = await convertPdfToImages(file); // Hàm này cũng đã có Lazy Load
                   images.forEach(img => pendingVisionImages.push(img));
               }
               else {
                   const text = await readFileAsText(file);
                   currentFileContent += `\n=== TEXT FILE (${file.name}) ===\n${text}\n`;
               }
               }
               nameSpan.innerHTML = `<i class="fas fa-eye text-yellow-400"></i> Vision Ready: ${pendingVisionImages.length} Imgs + Text`;
       }
       else {
           for (let i = 0; i < files.length; i++) {
               const file = files[i];
               names.push(file.name);
               nameSpan.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Đang đọc (${i + 1}/${files.length}): ${file.name}...`;

               if (file.type.startsWith('image/')) {
                   const text = await runOCR(file, nameSpan);
                   currentFileContent += `\n\n=== FILE ẢNH (OCR - ${file.name}) ===\n${text}\n==============================\n`;
               } 
               else if (file.type === 'application/pdf') {
                   const pdfText = await readPdfText(file);
                   currentFileContent += `\n\n=== FILE PDF (${file.name}) ===\n${pdfText}\n==============================\n`;
               } 
               else {
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

// Helper: Read text file as Promise
function readFileAsText(file) {
   return new Promise((resolve, reject) => {
       const reader = new FileReader();
       reader.onload = (e) => resolve(e.target.result);
       reader.onerror = (e) => reject(e);
       reader.readAsText(file);
   });
}

function clearFile() { 
   currentFileContent=null; 
   pendingVisionImages = []; 
   document.getElementById('fileInput').value=''; 
   document.getElementById('filePreview').classList.add('hidden'); 
}
function autoResize(t) { t.style.height='auto'; t.style.height=Math.min(t.scrollHeight,120)+'px'; }
function useSuggestion(t) { 
userInput.value = t; 
autoResize(userInput); 
userInput.focus();     
}
function confirmClearChat() { if(confirm("Xoá sạch sẽ?")) { messagesArea.innerHTML=WELCOME_HTML; chatHistory=[{role:"system",content:config.systemPrompt}]; } }      

// --- PYTHON ENGINE (LAZY LOAD UPDATE) ---
let pyodideReady = false;
let pyodideObj = null;     

async function runPython(btn) {
const actionBar = btn.closest('.code-action-bar');
const preElement = actionBar.previousElementSibling;
const codeElement = preElement.querySelector('code');
const code = codeElement ? codeElement.innerText : preElement.innerText;

let outputDiv = actionBar.nextElementSibling;
if (!outputDiv || !outputDiv.classList.contains('python-output')) {
outputDiv = document.createElement('div');
outputDiv.className = 'python-output';
actionBar.parentNode.insertBefore(outputDiv, actionBar.nextSibling);
}

outputDiv.innerHTML = '<span class="text-yellow-400"><i class="fas fa-spinner fa-spin"></i> Đang gọi chuyên gia Python dậy...</span>';
outputDiv.classList.add('active');

try {
if (!window.loadPyodide) {
   await loadScript('pyodide-script', RESOURCES.pyodide);
}

if (!pyodideReady) {
   outputDiv.innerHTML = '<span class="text-yellow-400"><i class="fas fa-cogs fa-spin"></i> Đang khởi tạo môi trường ảo... (Chờ xíu)</span>';
   pyodideObj = await loadPyodide();
   await pyodideObj.loadPackage(["matplotlib", "pandas", "numpy"]);
   pyodideReady = true;
}

outputDiv.innerHTML = '<span class="text-green-400"><i class="fas fa-spinner fa-spin"></i> Đang xử lý...</span>';

const isMobile = window.innerWidth < 768;
const figSize = isMobile ? "[6, 6]" : "[10, 6]"; 
const fontSize = isMobile ? "12" : "10";

const wrapperCode = `
import matplotlib.pyplot as plt
import io, base64, sys, json

# 1. Config giao diện
plt.style.use('dark_background')
plt.rcParams.update({
'figure.facecolor': '#0b1121', 
'axes.facecolor': '#0b1121', 
'text.color': '#cbd5e1', 
'axes.labelcolor': '#cbd5e1', 
'xtick.color': '#cbd5e1', 
'ytick.color': '#cbd5e1', 
'grid.color': '#334155',
'font.size': ${fontSize},
'figure.figsize': ${figSize},
'figure.dpi': 100
})

sys.stdout = io.StringIO()

# 2. Run User Code
${code}

# 3. Handle Output
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
if (result.text) html += `<div class="mb-2 text-slate-300 whitespace-pre-wrap text-sm">${result.text}</div>`;
if (result.image) html += `<img src="data:image/png;base64,${result.image}" alt="Chart">`;
if (!html) html = `<span class="text-slate-500 italic">Code chạy xong (Không có output).</span>`;

outputDiv.innerHTML = html;

} catch (err) {
outputDiv.innerHTML = `<span class="text-red-400">⚠️ Lỗi Code: ${err.message}</span>`;
console.error(err);
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

// Hệ thống điều phối vòng lặp tranh biện
window.isDebateMode = false; 

function toggleDebateMode() {
window.isDebateMode = !window.isDebateMode;

const btn = document.getElementById('debateModeToggle');
const inputWrapper = document.querySelector('.input-wrapper');
const sendIcon = document.querySelector('#sendBtn i');

if (window.isDebateMode) {
btn.classList.add('debate-active'); 
inputWrapper.classList.add('debate-mode-active');
userInput.placeholder = "⚔️ Nhập chủ đề để 2 AI tranh biện (VD: AI có thay thế con người?)...";
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

// --- 1. HÀM CHẠY DEBATE (CÓ LICENSE CHECK) ---
async function startDebateSystem(topic) {
// 🔥 CHECK LICENSE TRƯỚC
const permission = checkFeaturePermission('debate');
if (!permission.allowed) {
    alert(permission.message);
    return;
}

abortControllers = [];
if (config.models.length < 2) {
alert("⚠️ Cần chọn ít nhất 2 Models để chạy debate!");
return;
}

const modelA = config.models[0];
const modelB = config.models[1];

const maxTurns = 15;
console.log(`🎰 Random Turn: Trận này sẽ chém nhau ${maxTurns} hiệp!`);

document.getElementById('userInput').value = "";
setGeneratingState(true);

const directorPrompt = `
Topic: "${topic}".
Task: Analyze this topic and identify 2 opposing perspectives (Debater A vs Debater B).

Output format: JSON ONLY.
{
"roleA": "Name of perspective 1 (e.g. AI Enthusiast)",
"descA": "Core mindset of perspective 1 (Vietnamese)",
"roleB": "Name of perspective 2 (e.g. Traditional Humanist)",
"descB": "Core mindset of perspective 2 (Vietnamese)"
}`;

let roles = { 
roleA: "Góc nhìn 1", descA: "Ủng hộ", 
roleB: "Góc nhìn 2", descB: "Phản đối" 
};

try {
const scanResult = await runSingleDebateTurn(modelA, [
   {role: "system", content: "You are a logical analyzer. Output JSON only. No markdown."}, 
   {role: "user", content: directorPrompt}
], "null");

const firstBracket = scanResult.indexOf('{');
const lastBracket = scanResult.lastIndexOf('}');
if (firstBracket !== -1 && lastBracket !== -1) {
       const jsonStr = scanResult.substring(firstBracket, lastBracket + 1);
       roles = JSON.parse(jsonStr);
}
console.log("Auto-assigned Roles:", roles);
} catch(e) { 
console.error("Auto-cast failed, using fallback:", e);
}

appendUserMessage(topic, `
<div class="cinema-title" style="background: linear-gradient(90deg, #0f172a, #1e293b); border:1px solid #475569;">
   <h3 style="color:#38bdf8">
       🔍 PERSPECTIVE ANALYSIS: ${topic}
       <span style="font-size: 0.8em; color: #fbbf24; margin-left: 10px;">
           (🎲 ${maxTurns} Rounds)
       </span>
   </h3>
   <div class="scene-desc" style="color:#94a3b8; margin-top:5px;">
       <span style="color:#60a5fa">Draft 1: ${roles.roleA}</span> <span style="color:#64748b">|</span> <span style="color:#f87171">Draft 2: ${roles.roleB}</span>
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

let debateTranscript = `CHỦ ĐỀ TRANH BIỆN: ${topic}\n`;
debateTranscript += `BÊN A (${roles.roleA}): ${roles.descA}\n`;
debateTranscript += `BÊN B (${roles.roleB}): ${roles.descB}\n`;
debateTranscript += `-----------------------------------\n`;

let lastLine = "";
for (let turn = 1; turn <= maxTurns; turn++) {
const isTurnA = turn % 2 !== 0;
const currentModel = isTurnA ? modelA : modelB;
const currentRole = isTurnA ? roles.roleA : roles.roleB;
const currentDesc = isTurnA ? roles.descA : roles.descB;
const opponentRole = isTurnA ? roles.roleB : roles.roleA;

const systemPrompt = `
Identity: You represent the perspective of "${currentRole}" regarding "${topic}".
Core Mindset: ${currentDesc}.
Opponent: "${opponentRole}".
Instructions:
1. Be concise (max 60 words).
2. STYLE: Witty, Sarcastic, Creative, and full of Personality. Use metaphors and slang naturally.
3. Roast the opponent's logic playfully but sharply based on your mindset.
4. Don't be boring or robotic. Express emotions using emojis.
5. Use Vietnamese language strictly.
`;

let userInstruction = "";
if (turn === 1) {
   userInstruction = `Start the discussion on "${topic}" from your perspective. Point out the most critical aspect.`;
} else {
   userInstruction = `Opponent said: "${lastLine}". \nRespond critically based on your mindset. Find the flaw in their logic or provide a deeper counter-perspective.`;
}

const bubbleId = createAiCard(responseGroup, isTurnA ? roles.roleA : roles.roleB);

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
} catch (e) {
   console.error(e);
   break;
}
}

await judgeTheDebate(modelA, debateTranscript);

setGeneratingState(false);
}

// --- 2. HÀM TRỌNG TÀI ---
async function judgeTheDebate(judgeModel, transcript) {
const allGroups = document.querySelectorAll('.ai-response-group');
const responseGroup = allGroups[allGroups.length - 1]; 

const refereeId = 'referee-' + Date.now();
const div = document.createElement('div');
div.className = 'ai-card referee-card'; // Dùng class CSS mới
div.innerHTML = `
<div class="referee-header">
   <i class="fas fa-balance-scale"></i> TÒA ÁN AI TỐI CAO <i class="fas fa-gavel"></i>
</div>
<div class="ai-bubble" id="${refereeId}">
   <div style="text-align:center; color:#fbbf24; padding:20px;">
       <i class="fas fa-spinner fa-spin fa-2x"></i><br>
       <span style="font-size:12px; margin-top:10px; display:block;">Đang phân tích dữ liệu trận đấu...</span>
   </div>
</div>
`;
responseGroup.appendChild(div);

document.getElementById('messagesArea').scrollTop = document.getElementById('messagesArea').scrollHeight;

const judgePrompt = `
Role: You are the ULTIMATE JUDGE of a debate. You are wise, fair, but dramatic.
Input: The full transcript of a debate between two AI perspectives.

Transcript:
"""
${transcript}
"""

Task: Decide the winner based on logic, creativity, and persuasion (roasting skills included).

Output Format (Use Markdown, Vietnamese language):

## 🏆 WINNER: [Tên bên thắng]

> "Trích dẫn câu nói chí mạng (MVP Line) hay nhất trong trận đấu của bất kỳ bên nào"

### 📝 Phán Quyết:
(Viết 1 đoạn văn khoảng 3-4 dòng nhận xét sắc bén về thế trận. Tại sao bên thắng lại thắng? Bên thua thiếu sót gì?)

### ⭐ Bảng Điểm:
| Tiêu chí | Bên A | Bên B |
| :--- | :---: | :---: |
| Logic | ?/10 | ?/10 |
| Sáng tạo | ?/10 | ?/10 |
| **TỔNG** | **XX** | **YY** |
`;

try {
await runSingleDebateTurn(judgeModel, [
   { role: "system", content: "You are an impartial and dramatic Judge." },
   { role: "user", content: judgePrompt }
], refereeId);

document.getElementById('messagesArea').scrollTop = document.getElementById('messagesArea').scrollHeight;

} catch (e) {
document.getElementById(refereeId).innerHTML = `<div class="text-red-400 p-2">⚠️ Trọng tài đã bỏ trốn (Lỗi kết nối: ${e.message})</div>`;
}
}

// --- STREAMING ENGINE ---
async function runStream(model, messages, groupElement, specificElementId = null) {
const endpoint = config.customUrl.trim() || DEFAULT_URL;
let bubbleId;

if (specificElementId) {
bubbleId = specificElementId;
} else {
bubbleId = createAiCard(groupElement, model);
}

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
       model: model,
       messages: messages,
       temperature: config.temperature,
       stream: true 
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
           } catch (e) { /* Bỏ qua lỗi parse JSON dòng lẻ */ }
       }
   }
}

if (!config.isSquadMode || model === config.models[0]) {
       chatHistory.push({ role: "assistant", content: fullText });
}

} catch (e) {
if (e.name === 'AbortError') {
   renderContentToElement(bubbleId, fullText + "\n\n*[Đã dừng]*");
} else {
   renderContentToElement(bubbleId, fullText + `\n\n⚠️ Lỗi: ${e.message}`);
}
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
   body: JSON.stringify({
       model: model,
       messages: messages,
       temperature: config.temperature,
       stream: false
   }),
   signal: controller.signal
});

if (!response.ok) throw new Error("API Error: " + response.status);

const data = await response.json();
const content = data.choices[0]?.message?.content || "[Không có phản hồi]";

if (bubbleId && bubbleId !== "null") {
       renderContentToElement(bubbleId, content);
}

return content;
} catch (e) {
if (bubbleId && bubbleId !== "null") {
       if (e.name === 'AbortError') {
       renderContentToElement(bubbleId, "\n\n*[Đã dừng debate 🛑]*");
       } else {
       renderContentToElement(bubbleId, `\n⚠️ Lỗi API: ${e.message}`);
       }
}
throw e;
}
}  
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
document.getElementById('userInput').placeholder = "⚗️ Nhập vấn đề để AI chưng cất câu trả lời tinh khiết nhất...";
sendIcon.className = "fas fa-flask"; 
} else {
btn.classList.remove('synthesis-active');
inputWrapper.style.borderColor = "#334155";
document.getElementById('userInput').placeholder = "Nhập tin nhắn...";
sendIcon.className = "fas fa-paper-plane";
}
}

// --- 🧪 SYNTHESIS ENGINE (CÓ LICENSE CHECK) ---
async function startSynthesisSystem(query) {
// 🔥 CHECK LICENSE TRƯỚC
const permission = checkFeaturePermission('synthesis');
if (!permission.allowed) {
    alert(permission.message);
    return;
}

if (config.models.length < 2) {
alert("⚠️ Cần ít nhất 2 Models trong danh sách để hội tụ thông tin!");
return;
}

document.getElementById('userInput').value = "";
setGeneratingState(true);
appendUserMessage(query, `
<div style="color:#fbbf24; font-weight:bold; font-family:'Outfit', sans-serif;">
   <i class="fas fa-atom fa-spin"></i> KÍCH HOẠT CHẾ ĐỘ HỘI TỤ (SYNTHESIS)
</div>
<div class="text-xs text-slate-400 mt-1">Đang huy động ${config.models.length} chuyên gia để chưng cất kết quả...</div>
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
   <span class="font-bold"><i class="fas fa-gem"></i> KẾT QUẢ TINH KHIẾT (Distilled Output)</span>
</div>
<div class="ai-bubble">
   <div id="syn-status-${synthesisId}">
       <div class="synthesis-step active" id="step1-${synthesisId}">1. 📡 Thu thập dữ liệu thô từ Squad...</div>
       <div class="synthesis-step" id="step2-${synthesisId}">2. ⚖️ Đối chiếu & Tìm điểm chung (Cross-Reference)...</div>
       <div class="synthesis-step" id="step3-${synthesisId}">3. 🗑️ Loại bỏ mâu thuẫn & Ảo giác (De-Hallucination)...</div>
       <div class="synthesis-step" id="step4-${synthesisId}">4. ✨ Tinh chỉnh & Trình bày (Final Polish)...</div>
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
   rawBox.innerText = `⏳ ${model.split('/').pop()} đang suy nghĩ...`;
   rawContainer.appendChild(rawBox);

   try {
       const rawRes = await runSingleDebateTurn(model, [{role: "user", content: query + " (Trả lời ngắn gọn, tập trung vào sự thật cốt lõi)"}], "null");
       
       const shortName = model.split('/').pop();
       rawBox.innerHTML = `<span class="text-green-400">✔ ${shortName}</span>`;
       
       return { model: model, content: rawRes };
   } catch (e) {
       rawBox.innerText = `❌ ${model}: Lỗi.`;
       return null;
   }
});

const results = await Promise.all(promises);
rawResults = results.filter(r => r !== null);

if (rawResults.length === 0) throw new Error("Không model nào trả lời được!");

} catch (e) {
document.getElementById(synthesisId).innerHTML = `<span class="text-red-400">Lỗi Bước 1: ${e.message}</span>`;
setGeneratingState(false);
return;
}

const leaderModel = config.models[0]; 

updateStep(2);
const combinedInput = rawResults.map((r, i) => `[NGUỒN ${i+1} - ${r.model}]:\n${r.content}`).join("\n\n----------------\n\n");

const filterPrompt = `
Nhiệm vụ: Bạn là một "Consensus Engine" (Bộ máy đồng thuận).
Dưới đây là các câu trả lời thô từ các nguồn AI khác nhau về câu hỏi: "${query}".

DỮ LIỆU THÔ:
"""
${combinedInput}
"""

HÃY THỰC HIỆN CÁC BƯỚC TƯ DUY (Chain-of-Thought) BÊN TRONG, NHƯNG CHỈ TRẢ LỜI KẾT QUẢ CUỐI CÙNG:
1. Tìm các điểm chung (Consensus): Các ý mà đa số nguồn đều đồng ý.
2. Phát hiện mâu thuẫn (Conflicts): Nếu Nguồn A nói X, Nguồn B nói Y -> Hãy dùng logic để chọn cái đúng nhất.
3. Loại bỏ nhiễu: Bỏ các câu chào hỏi, lặp lại.
4. Tổng hợp lại thành một câu trả lời duy nhất, cấu trúc rõ ràng (Markdown).

YÊU CẦU ĐẦU RA:
- Trả lời bằng Tiếng Việt.
- Văn phong chuyên gia, súc tích.
- Cuối cùng thêm mục "🔍 Độ tin cậy": Đánh giá mức độ đồng thuận (Cao/Trung bình/Thấp).
`;

updateStep(3);
await new Promise(r => setTimeout(r, 800)); 

updateStep(4);
try {
document.getElementById(`syn-status-${synthesisId}`).classList.add('hidden');
const contentDiv = document.getElementById(synthesisId);
contentDiv.classList.remove('hidden');

await runStream(leaderModel, [{role: "system", content: "You are a Helpful Expert Synthesizer."}, {role: "user", content: filterPrompt}], mainCard.parentElement, synthesisId);

} catch (e) {
document.getElementById(synthesisId).innerHTML = `Lỗi tổng hợp: ${e.message}`;
}

setGeneratingState(false);
}

// --- 🧠 SMART RAG AGENT: PHÂN TÍCH Ý ĐỊNH ---
async function extractSmartKeywords(query, model) {
const ragStatusText = document.getElementById('ragStatusText');
const ragContainer = document.getElementById('ragStatus');

ragContainer.classList.remove('hidden');
ragStatusText.innerHTML = `<i class="fas fa-brain fa-spin"></i> AI ĐANG SUY LUẬN TỪ KHÓA...`;
ragStatusText.style.color = "#fbbf24"; 

const prompt = `
Nhiệm vụ: Bạn là một công cụ tìm kiếm thông minh (Search Engine Agent).
Người dùng đang muốn tìm thông tin với câu truy vấn: "${query}"

Yêu cầu:
1. Phân tích ý định người dùng.
2. Liệt kê 10-15 từ khóa (keywords) hoặc cụm từ ngắn quan trọng nhất liên quan đến câu hỏi này để tìm kiếm trong một tài liệu văn bản.
3. Bao gồm cả từ đồng nghĩa, thuật ngữ chuyên ngành (nếu có), và cả Tiếng Anh lẫn Tiếng Việt.
4. CHỈ TRẢ VỀ CÁC TỪ KHÓA, ngăn cách bởi dấu phẩy. Không giải thích gì thêm.

Ví dụ: 
User: "Lương tháng này bao nhiêu"
Output: lương, thu nhập, salary, income, payslip, thực nhận, thưởng, tháng này
`;

try {
const keywords = await runSingleDebateTurn(model, [{role: "user", content: prompt}], "null"); 
console.log("Smart Keywords:", keywords);
return keywords; 
} catch (e) {
console.error("Lỗi Smart Keyword:", e);
return query; 
}
}

// --- 🔥 ADDED MISSING FUNCTION: RAG SCANNER ---
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
return content.substring(0, 3000) + "\n\n...[Đã cắt bớt vì quá dài]...";
}

return [...new Set(relevantChunks)].join('\n---\n');
}

settingsModal.addEventListener('click', (e) => { if(e.target===settingsModal) closeSettings(); });

