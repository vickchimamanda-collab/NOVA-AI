/* ===== NOVA AI - script.js ===== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
function lsGet(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
let USER = lsGet("nova_name", "Master Praise");
let prefs = { style: "balanced", speak: false, lang: "English", img: "online" };
try { Object.assign(prefs, JSON.parse(lsGet("nova_prefs", "{}"))); } catch (e) {}
let wpId = lsGet("nova_wp", "nova"), wpImg = lsGet("nova_wp_img", "");
let rec = null, listening = false, fakeTimer;
let convo = [];
let chats = [], cur = null;   // saved chats and the open one               // chat memory sent to the AI
const MODEL = "claude-haiku-5-5";   // change this name to use a different model // voice state (declared early on purpose)

/* ---------- Toast ---------- */
let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
}

/* ---------- Navigation ---------- */
const NAV_SCREENS = ["home", "library", "settings"]; // screens that show the bottom bar
let navStack = [];
let current = "splash";

function go(id, push = true) {
  if (!$("#" + id)) return;
  if (push && current !== id && current !== "splash") navStack.push(current);
  $$(".screen").forEach(s => s.classList.remove("active"));
  $("#" + id).classList.add("active");
  $("#" + id).scrollTop = 0;
  current = id;
  $("#bottomnav").classList.toggle("show", NAV_SCREENS.includes(id));
  const map = { home: "home", library: "library", settings: "settings", chat: "chat" };
  $$("#bottomnav [data-nav]").forEach(b => {
    b.classList.toggle("on", b.dataset.nav === (map[id] || ""));
  });
  if (id !== "voice") stopVoice();
  if (id === "library") renderLibrary();
  if (id === "history") renderHistory();
}
function back() {
  go(navStack.pop() || "home", false);
}

document.addEventListener("click", e => {
  const el = e.target.closest("[data-go],[data-back],[data-nav],[data-tool],[data-toast]");
  if (!el) return;
  if (el.dataset.go) go(el.dataset.go);
  else if (el.hasAttribute("data-back")) back();
  else if (el.dataset.nav) {
    const n = el.dataset.nav;
    if (n === "tools") { go("home"); $("#home .grid").scrollIntoView({ behavior: "smooth" }); toast("All tools"); }
    else go(n);
  } else if (el.dataset.tool) openTool(el.dataset.tool);
  else if (el.dataset.toast) toast(el.dataset.toast);
});

/* ---------- Splash ---------- */
go("splash", false);
setTimeout(() => go("home", false), 2600);

/* ---------- Smart demo replies (works offline) ---------- */
function aiReply(q) {
  const t = q.toLowerCase();
  if (/quantum/.test(t)) return "Of course! Quantum physics is the study of the smallest particles in the universe. At that scale, particles behave like both waves and particles, and you can only predict outcomes as probabilities.";
  if (/^(hi|hello|hey)\b/.test(t)) return "Hello " + USER + "! 👋 How can I help you today?";
  if (/your name|who are you/.test(t)) return "I'm NOVA AI, your all-in-one assistant for chat, images, code, writing, translation and research.";
  if (/joke/.test(t)) return "Why do programmers prefer dark mode? Because light attracts bugs! 🐛";
  if (/code|python|javascript|html|css/.test(t)) return "I can help with that! Open the Coding Assistant from the home screen to write, explain and run code.";
  if (/image|picture|draw/.test(t)) return "Open the Image Generator and describe what you want to see. I'll create it for you.";
  if (/translate/.test(t)) return "Open the Translator and pick your languages. I'll translate instantly.";
  if (/time/.test(t)) return "It's " + new Date().toLocaleTimeString() + " right now.";
  if (/date|today/.test(t)) return "Today is " + new Date().toDateString() + ".";
  return "Great question! This demo runs offline, so my answers are limited. Connect a real AI API in script.js (see the callAI function) to get full answers to: \"" + q + "\"";
}

/* ---------- Real AI connection ---------- */
function getKey() { try { return localStorage.getItem("nova_key") || ""; } catch (e) { return ""; } }
function setKey(k) { try { k ? localStorage.setItem("nova_key", k) : localStorage.removeItem("nova_key"); } catch (e) {} }

async function callClaude(prompt, opts = {}) {
  const key = getKey();
  if (!key) {                                  // no key: offline demo answers
    await new Promise(r => setTimeout(r, 900));
    return aiReply(prompt);
  }
  const useHistory = opts.history !== false;
  const msgs = useHistory ? convo.concat([{ role: "user", content: prompt }]) : [{ role: "user", content: prompt }];
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 700,
        system: opts.system || systemPrompt(),
        messages: msgs
      })
    });
    const data = await res.json();
    if (!res.ok) return "⚠️ " + ((data.error && data.error.message) || "The AI service returned an error.");
    const text = (data.content || []).map(p => p.text || "").join("").trim() || "(empty answer)";
    if (useHistory) { convo.push({ role: "user", content: prompt }, { role: "assistant", content: text }); convo = convo.slice(-12); }
    return text;
  } catch (e) {
    return "⚠️ Couldn't reach the AI. Check your internet connection and try again.";
  }
}

const GEMINI_MODEL = "gemini-flash-latest";   // change this if Google renames the model
function systemPrompt() {
  const style = { short: "Keep answers very short (1 to 3 sentences).", balanced: "Keep answers clear and fairly short.", detailed: "Give thorough, well-structured answers." }[prefs.style];
  return "You are NOVA AI, a friendly, smart assistant inside a mobile app. The user is called " + USER + ". " + style + (prefs.lang !== "English" ? " Always reply in " + prefs.lang + "." : "");
}
function provider() { const k = getKey(); return !k ? "none" : k.startsWith("sk-ant") ? "claude" : "gemini"; }

async function callGemini(prompt, opts, key) {
  const useHistory = opts.history !== false;
  const all = (useHistory ? convo : []).concat([{ role: "user", content: prompt }]);
  const contents = all.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL + ":generateContent", {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: opts.system || systemPrompt() }] }, contents })
    });
    const data = await res.json();
    if (!res.ok) return "⚠️ " + ((data.error && data.error.message) || "The AI service returned an error.");
    const cand = data.candidates && data.candidates[0];
    const parts = (cand && cand.content && cand.content.parts) || [];
    const text = parts.map(p => p.text || "").join("").trim() || "(empty answer)";
    if (useHistory) { convo.push({ role: "user", content: prompt }, { role: "assistant", content: text }); convo = convo.slice(-12); }
    return text;
  } catch (e) {
    return "⚠️ Couldn't reach the AI. Check your internet connection and try again.";
  }
}

async function callAI(prompt, opts = {}) {
  const p = provider();
  if (p === "claude") return callClaude(prompt, opts);
  if (p === "gemini") return callGemini(prompt, opts, getKey());
  await new Promise(r => setTimeout(r, 900));     // no key: offline demo answers
  return aiReply(prompt);
}
function refreshAiStatus() {
  const on = !!getKey();
  $("#aiStatus").textContent = on ? "Connected: live AI answers (" + (provider() === "claude" ? "Claude" : "Gemini") + ")" : "Demo mode (offline answers)";
  $("#aiStatus").classList.toggle("live", on);
}
$("#keySave").onclick = () => {
  const k = $("#apiKey").value.trim();
  if (!k) return toast("Paste your key first");
  setKey(k); $("#apiKey").value = ""; convo = []; refreshAiStatus(); toast("Key saved ✨");
};
$("#keyRemove").onclick = () => { setKey(""); convo = []; refreshAiStatus(); toast("Key removed"); };
refreshAiStatus();

/* ---------- Chat ---------- */
const messages = $("#messages");
function addMsg(text, who = "ai", withActions = false, img = null) {
  const m = document.createElement("div");
  m.className = "msg " + who;
  const av = document.createElement("div");
  av.className = "av";
  if (who === "ai") av.textContent = "N"; else av.innerHTML = '<svg class="ic" style="width:18px;height:18px"><use href="#ic-user"/></svg>';
  const col = document.createElement("div");
  const b = document.createElement("div");
  b.className = "bubble";
  b.textContent = text;
  if (img) {
    const more = document.createElement("span");
    more.className = "more"; more.textContent = "Read more ⌄";
    const im = new Image(); im.src = img;
    b.append(more, im);
  }
  col.appendChild(b);
  if (withActions) {
    const a = document.createElement("div");
    a.className = "acts";
    a.innerHTML = '<button title="Copy"><svg class="ic"><use href="#ic-copy"/></svg></button><button title="Like"><svg class="ic"><use href="#ic-up"/></svg></button><button title="Dislike"><svg class="ic"><use href="#ic-down"/></svg></button><button title="Share"><svg class="ic"><use href="#ic-share"/></svg></button>';
    a.children[0].onclick = () => { copyText(text); };
    a.children[1].onclick = () => toast("Thanks for the feedback 👍");
    a.children[2].onclick = () => toast("We'll improve 👎");
    a.children[3].onclick = () => shareText(text);
    col.appendChild(a);
  }
  m.append(av, col);
  messages.appendChild(m);
  messages.scrollTop = messages.scrollHeight;
  return b;
}
function welcome() {
  addMsg("Hello " + USER + "! 👋\nI'm NOVA AI, your intelligent assistant. How can I help you today?");
}
function loadChats() { try { chats = JSON.parse(localStorage.getItem("nova_chats") || "[]"); } catch (e) { chats = []; } }
function saveChats() { try { localStorage.setItem("nova_chats", JSON.stringify(chats.slice(0, 30))); } catch (e) {} }
function newChat() {
  cur = null; convo = [];
  messages.innerHTML = "";
  welcome();
}
function renderChat() {
  messages.innerHTML = "";
  welcome();
  cur.msgs.forEach(m => addMsg(m.text, m.who, m.who === "ai", m.atom ? atomImage() : null));
}
function logMsg(who, text, atom) {
  if (!cur) { cur = { id: Date.now(), title: "New chat", ts: Date.now(), msgs: [], convo: [] }; chats.unshift(cur); }
  if (who === "user" && cur.title === "New chat") cur.title = text.slice(0, 32);
  cur.msgs.push({ who: who, text: text, atom: !!atom });
  cur.ts = Date.now();
  cur.convo = convo;
  saveChats();
}
function openChat(c) { cur = c; convo = c.convo || []; renderChat(); go("chat"); }
function renderHistory() {
  const l = $("#histList");
  l.innerHTML = chats.length ? "" : '<p class="small">No saved chats yet. Start chatting and they will appear here.</p>';
  chats.forEach(c => {
    const row = document.createElement("div"); row.className = "hrow";
    const b = document.createElement("button"); b.className = "hopen";
    b.innerHTML = "<b></b><small></small>";
    b.children[0].textContent = c.title;
    b.children[1].textContent = new Date(c.ts).toLocaleString();
    b.onclick = () => openChat(c);
    const d = document.createElement("button"); d.className = "hdel"; d.textContent = "✕";
    d.onclick = () => {
      chats = chats.filter(x => x !== c);
      if (cur === c) newChat();
      saveChats(); renderHistory();
    };
    row.append(b, d); l.appendChild(row);
  });
}
function resetChat() { newChat(); }
async function sendChat(text, shown) {
  text = (text || "").trim();
  if (!text) return;
  addMsg(shown || text, "user");
  logMsg("user", shown || text);
  const typing = addMsg("", "ai");
  typing.innerHTML = '<span class="typing"><span></span><span></span><span></span></span>';
  const reply = await callAI(text);
  typing.parentElement.parentElement.remove();
  const atom = /quantum|atom|physics/i.test(text);
  addMsg(reply, "ai", true, atom ? atomImage() : null);
  logMsg("ai", reply, atom);
  if (prefs.speak) speak(reply);
}
$("#chatSend").onclick = () => { sendChat($("#chatInput").value); $("#chatInput").value = ""; };
$("#chatInput").addEventListener("keydown", e => { if (e.key === "Enter") $("#chatSend").click(); });
$("#clearChat").onclick = () => go("history");
$("#newChatBtn").onclick = () => { newChat(); toast("New chat started"); };
$("#histNew").onclick = () => { newChat(); go("chat"); };
$("#histClear").onclick = () => {
  if (!chats.length) return toast("Nothing to delete");
  if (confirm("Delete all saved chats?")) { chats = []; saveChats(); newChat(); renderHistory(); toast("All chats deleted"); }
};
$("#homeSend").onclick = () => {
  const v = $("#homeInput").value.trim();
  if (!v) return toast("Type a question first");
  go("chat");
  $("#homeInput").value = "";
  sendChat(v);
};
$("#homeInput").addEventListener("keydown", e => { if (e.key === "Enter") $("#homeSend").click(); });
loadChats();
if (chats.length) { cur = chats[0]; convo = cur.convo || []; renderChat(); } else newChat();

/* ---------- Helpers: copy / share ---------- */
function copyText(t) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(t).then(() => toast("Copied"), () => fallbackCopy(t));
  } else fallbackCopy(t);
}
function fallbackCopy(t) {
  const x = document.createElement("textarea");
  x.value = t; document.body.appendChild(x); x.select();
  try { document.execCommand("copy"); toast("Copied"); } catch (e) { toast("Copy not supported"); }
  x.remove();
}
function shareText(t) {
  if (navigator.share) navigator.share({ text: t }).catch(() => {});
  else copyText(t);
}

/* ---------- Image generator (draws neon art on a canvas) ---------- */
const canvas = $("#artCanvas");
const ctx = canvas.getContext("2d");
const library = [];
try { JSON.parse(localStorage.getItem("nova_lib") || "[]").forEach(s => library.push(s)); } catch (e) {}
function saveLib() { try { localStorage.setItem("nova_lib", JSON.stringify(library.slice(0, 6))); } catch (e) {} }

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}
function drawArt(prompt) {
  const W = canvas.width, H = canvas.height, r = rng(hash(prompt));
  const p = prompt.toLowerCase();
  const hue = /beach|sea|ocean/.test(p) ? 190 : /cat|space/.test(p) ? 275 : /house/.test(p) ? 230 : 255;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, `hsl(${hue + 10},80%,12%)`);
  g.addColorStop(0.55, `hsl(${hue + 40},75%,30%)`);
  g.addColorStop(1, `hsl(${hue - 40},90%,45%)`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 90; i++) {                       // stars
    ctx.fillStyle = `rgba(255,255,255,${r() * 0.8})`;
    ctx.fillRect(r() * W, r() * H * 0.5, 2, 2);
  }
  const moon = ctx.createRadialGradient(W * 0.75, H * 0.2, 5, W * 0.75, H * 0.2, 60);   // glow
  moon.addColorStop(0, "#fff"); moon.addColorStop(0.3, "rgba(0,200,255,.6)"); moon.addColorStop(1, "rgba(0,200,255,0)");
  ctx.fillStyle = moon; ctx.beginPath(); ctx.arc(W * 0.75, H * 0.2, 60, 0, 7); ctx.fill();
  const ground = H * 0.72;
  if (/beach|sea|ocean/.test(p)) {                     // water horizon
    ctx.fillStyle = "rgba(0,200,255,.35)"; ctx.fillRect(0, H * 0.55, W, H * 0.45);
  } else {                                              // neon skyline
    let x = -10;
    while (x < W) {
      const bw = 40 + r() * 60, bh = 120 + r() * 300;
      ctx.fillStyle = `hsl(${hue + r() * 40},60%,${8 + r() * 10}%)`;
      ctx.fillRect(x, ground - bh, bw, bh);
      ctx.strokeStyle = `hsl(${180 + r() * 120},100%,60%)`; ctx.lineWidth = 2;
      ctx.strokeRect(x, ground - bh, bw, bh);
      for (let wy = ground - bh + 10; wy < ground - 8; wy += 16)
        for (let wx = x + 6; wx < x + bw - 8; wx += 12)
          if (r() > 0.5) { ctx.fillStyle = r() > 0.5 ? "#00e5ff" : "#ff5cf0"; ctx.fillRect(wx, wy, 5, 8); }
      x += bw + 4;
    }
  }
  const water = ctx.createLinearGradient(0, ground, 0, H);   // reflection
  water.addColorStop(0, "rgba(0,200,255,.45)"); water.addColorStop(1, "rgba(60,20,160,.9)");
  ctx.fillStyle = water; ctx.fillRect(0, ground, W, H - ground);
  for (let i = 0; i < 30; i++) {
    ctx.fillStyle = `rgba(${r() > 0.5 ? "0,229,255" : "255,92,240"},.5)`;
    ctx.fillRect(r() * W, ground + r() * (H - ground), 20 + r() * 50, 2);
  }
  if (/car|city|futur/.test(p) || !/beach|cat|house/.test(p)) {   // flying cars
    for (let i = 0; i < 5; i++) {
      const cx = r() * W, cy = H * 0.15 + r() * H * 0.3;
      ctx.shadowColor = "#00e5ff"; ctx.shadowBlur = 14; ctx.fillStyle = "#e8faff";
      ctx.fillRect(cx, cy, 26, 6);
      ctx.fillStyle = "#ff5cf0"; ctx.fillRect(cx - 8, cy + 1, 8, 3);
      ctx.shadowBlur = 0;
    }
  }
  if (/cat/.test(p)) { ctx.font = "120px serif"; ctx.fillText("🐱", W * 0.38, H * 0.45); ctx.fillText("🚀", W * 0.15, H * 0.3); }
  if (/house/.test(p)) { ctx.font = "150px serif"; ctx.fillText("🏠", W * 0.35, ground - 10); }
  if (/beach/.test(p)) { ctx.font = "100px serif"; ctx.fillText("🏖️", W * 0.4, ground + 40); }
}
let genToken = 0;
function drawCover(img) {
  const W = canvas.width, H = canvas.height, k = Math.max(W / img.width, H / img.height);
  const w = img.width * k, h = img.height * k;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
}
function finishImage(msg) {
  $("#genOverlay").classList.add("hidden");
  library.unshift(canvas.toDataURL("image/jpeg", 0.8));
  if (library.length > 8) library.pop();
  saveLib();
  toast(msg);
}
async function generateImage() {
  const prompt = $("#imgPrompt").value.trim();
  if (!prompt) return toast("Describe an image first");
  const my = ++genToken;
  const offline = prefs.img === "offline";
  $("#genOverlay").textContent = offline ? "Generating..." : "Creating your image... (10-30 seconds)";
  $("#genOverlay").classList.remove("hidden");
  if (offline) {
    setTimeout(() => { if (my !== genToken) return; drawArt(prompt); finishImage("Offline art ready ✨"); }, 900);
    return;
  }
  try {
    const ctl = new AbortController();
    const tm = setTimeout(() => ctl.abort(), 60000);
    const url = "https://image.pollinations.ai/prompt/" + encodeURIComponent(prompt.slice(0, 400)) +
      "?width=768&height=768&nologo=true&model=flux&seed=" + Math.floor(Math.random() * 1000000);
    const res = await fetch(url, { signal: ctl.signal });
    clearTimeout(tm);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const blob = await res.blob();
    if (!/^image\//.test(blob.type)) throw new Error("not an image");
    const pic = await new Promise((ok, bad) => { const im = new Image(); im.onload = () => ok(im); im.onerror = bad; im.src = URL.createObjectURL(blob); });
    if (my !== genToken) return;
    drawCover(pic);
    finishImage("AI image ready ✨");
  } catch (e) {
    if (my !== genToken) return;
    drawArt(prompt);
    finishImage("AI image service unavailable, showing offline art");
  }
}
$("#imgGen").onclick = generateImage;
$$(".idea").forEach(b => b.onclick = () => { $("#imgPrompt").value = b.textContent; generateImage(); });
$("#imgDownload").onclick = () => {
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = "nova-ai-image.png";
  document.body.appendChild(a); a.click(); a.remove();
  toast("Saving image...");
};
$("#imgShare").onclick = () => shareText("Check out my NOVA AI image: " + $("#imgPrompt").value);
$("#imgEdit").onclick = () => { $("#imgPrompt").focus(); toast("Edit your prompt, then press send"); };
drawArt($("#imgPrompt").value);
function renderLibrary() {
  const g = $("#gallery");
  g.innerHTML = library.length ? "" : '<p class="small">No images yet. Generate one first.</p>';
  library.forEach(src => { const i = new Image(); i.src = src; i.onclick = () => openLightbox(src); g.appendChild(i); });
}

/* ---------- Voice assistant ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
function setVoiceUI(on, hint) {
  listening = on;
  $("#micBtn").classList.toggle("live", on);
  $(".voicebody").classList.toggle("live-wave", on);
  $("#listenText").textContent = on ? "Listening..." : "Idle";
  $("#voiceTitle").textContent = on ? "Listening..." : "Tap to talk";
  if (hint) $("#voiceHint").textContent = hint;
}
function speak(text) {
  if ("speechSynthesis" in window) {
    speechSynthesis.cancel();
    speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }
}
async function handleVoice(text) {
  setVoiceUI(false, '(or say "Hey NOVA")');
  $("#voiceReply").textContent = "You: " + text;
  const reply = await callAI(text);
  $("#voiceReply").textContent = "You: " + text + "\n\nNOVA: " + reply;
  speak(reply);
}
function startVoice() {
  if (listening) return;
  setVoiceUI(true, "Speak now");
  if (SR) {
    rec = new SR();
    rec.lang = "en-US";
    rec.onresult = e => handleVoice(e.results[0][0].transcript);
    rec.onerror = () => { setVoiceUI(false); toast("Microphone not available"); };
    rec.onend = () => { if (listening) setVoiceUI(false); };
    try { rec.start(); } catch (e) { setVoiceUI(false); }
  } else {            // browser has no speech recognition: demo mode
    toast("Demo mode: voice recognition not supported here");
    fakeTimer = setTimeout(() => handleVoice("hello"), 2200);
  }
}
function stopVoice() {
  clearTimeout(fakeTimer);
  if (rec) { try { rec.abort(); } catch (e) {} }
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  if (listening) setVoiceUI(false, '(or say "Hey NOVA")');
}
$("#micBtn").onclick = () => (listening ? stopVoice() : startVoice());
$("#voiceStop").onclick = () => { stopVoice(); $("#voiceReply").textContent = ""; };

/* ---------- Coding assistant ---------- */
const CODE = {
  Python: { html: '<span class="k">def</span> <span class="f">hello_nova</span>():\n    <span class="k">print</span>(<span class="s">"Hello, Master Praise!"</span>)\n\n<span class="f">hello_nova</span>()', out: "Hello, Master Praise!" },
  JavaScript: { html: '<span class="k">function</span> <span class="f">helloNova</span>() {\n  console.<span class="f">log</span>(<span class="s">"Hello, Master Praise!"</span>);\n}\n\n<span class="f">helloNova</span>();', out: "Hello, Master Praise!" },
  "C++": { html: "#include &lt;iostream&gt;\nint main() {\n  std::cout &lt;&lt; \"Hello, Master Praise!\";\n}", out: "Hello, Master Praise!" },
  Java: { html: "public class Main {\n  public static void main(String[] a) {\n    System.out.println(\"Hello, Master Praise!\");\n  }\n}", out: "Hello, Master Praise!" },
  PHP: { html: "&lt;?php\necho \"Hello, Master Praise!\";", out: "Hello, Master Praise!" },
  Kotlin: { html: "fun main() {\n  println(\"Hello, Master Praise!\")\n}", out: "Hello, Master Praise!" },
  "C#": { html: "Console.WriteLine(\"Hello, Master Praise!\");", out: "Hello, Master Praise!" },
  HTML: { html: '&lt;<span class="k">h1</span>&gt;Hello, Master Praise!&lt;/<span class="k">h1</span>&gt;', out: "Renders a heading: Hello, Master Praise!" }
};
let lang = "Python";
function showCode() { $("#codeBox").innerHTML = CODE[lang].html; }
showCode();
function pickLang(name, tabBtn) {
  lang = name;
  $$("#langTabs button").forEach(x => x.classList.remove("on"));
  tabBtn.classList.add("on");
  showCode();
  $("#codeOut").textContent = "Output will appear here";
  $("#codeStatus").textContent = '● Click "Run Again" to run the code';
}
$$("#langTabs button").forEach(b => b.onclick = () => {
  if (b.id === "moreTab") { $("#moreLangs").classList.toggle("hidden"); return; }
  $("#moreLangs").classList.add("hidden"); $("#moreTab").textContent = "More ⌄";
  pickLang(b.textContent.trim(), b);
});
$$("#moreLangs button").forEach(b => b.onclick = () => {
  $("#moreLangs").classList.add("hidden");
  $("#moreTab").textContent = b.textContent + " ⌄";
  pickLang(b.textContent.trim(), $("#moreTab"));
});
function note(t) { const n = $("#codeNote"); n.textContent = t; n.classList.remove("hidden"); }
$("#codeRun").onclick = () => {
  $("#codeStatus").textContent = "● Running...";
  setTimeout(() => {
    $("#codeStatus").textContent = "● Code executed successfully!";
    $("#codeOut").textContent = CODE[lang].out;
  }, 500);
};
$("#codeExplain").onclick = () => note("This code defines a small function called hello_nova, and then calls it. When called, it prints a friendly greeting to the screen.");
$("#codeImprove").onclick = () => note("Tip: let the function take a name, e.g. def hello_nova(name): print(f\"Hello, {name}!\"). Then you can greet anyone.");
$("#codeSend").onclick = () => {
  const v = $("#codeInput").value.trim();
  if (!v) return toast("Ask a question first");
  $("#codeInput").value = "";
  note("Thinking...");
  callAI(v + "\n\n(Current " + lang + " code:\n" + $("#codeBox").textContent + ")", { history: false, system: "You are a concise coding assistant inside a mobile app. Answer briefly with short code when useful." }).then(r => note(r));
};

/* ---------- Writing + generic tools ---------- */
const TOOLS = {
  essay:    { t: "Essay Writer",      d: "Write essays and articles.", make: x => `${cap(x)}\n\nIntroduction\n${cap(x)} is a topic that matters in today's world. This essay explores its main ideas.\n\nMain Ideas\n1. Why it matters\n2. How it works\n3. What comes next\n\nConclusion\nIn summary, ${x} deserves careful thought and curiosity.` },
  story:    { t: "Story Generator",   d: "Create amazing stories.", make: x => `Once upon a time, in a world full of light, a curious traveler discovered something about "${x}".\n\nThe journey was long, but every step revealed a new wonder. In the end, the traveler learned that courage turns every ending into a beginning.\n\nThe End. ✨` },
  email:    { t: "Email Writer",      d: "Compose professional emails.", make: x => `Subject: ${cap(x)}\n\nDear [Name],\n\nI hope you are well. I am writing about ${x}. Please let me know a suitable time to discuss it.\n\nThank you for your time.\n\nBest regards,\n${USER}` },
  summary:  { t: "Summarizer",        d: "Paste a long text to summarize.", make: x => "Summary:\n• " + x.split(/[.!?]\s/).filter(Boolean).slice(0, 3).map(s => s.trim()).join("\n• ") },
  content:  { t: "Content Creator",   d: "Create social media posts.", make: x => `🚀 Big news: ${x}!\n\nHere's why it matters and how you can get started today.\n\n#NOVAAI #Innovation #DreamBigger` },
  video:    { t: "Video Generator",   d: "Describe a video and get a storyboard.", make: x => `Storyboard for "${x}":\nScene 1 – Wide opening shot, glowing neon colors.\nScene 2 – Close-up on the main subject.\nScene 3 – Smooth camera move through the world.\nScene 4 – Title appears: NOVA AI.\n\n(Video rendering needs a real video API.)` },
  research: { t: "Research",          d: "Ask a topic and get a research outline.", make: x => `Research outline: ${x}\n\n1. Definition and background\n2. Key facts and recent developments\n3. Main viewpoints\n4. Open questions\n5. Sources to check\n\n(Connect a real API in callAI for live research.)` },
  document: { t: "Document Analysis", d: "Paste document text to analyze.", make: x => `Analysis\n\nLength: ${x.split(/\s+/).filter(Boolean).length} words\nMain topic: ${x.split(/\s+/).slice(0, 6).join(" ")}...\nTone: neutral\n\nKey points are listed in the summary tool.` }
};
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
let activeTool = "essay";
function openTool(id) {
  activeTool = id;
  $("#toolTitle").textContent = TOOLS[id].t;
  $("#toolDesc").textContent = TOOLS[id].d;
  $("#toolInput").value = "";
  $("#toolOut").textContent = "Your result will appear here.";
  go("tool");
}
function runTool(text) {
  text = (text || "").trim();
  if (!text) return toast("Type something first");
  $("#toolOut").textContent = "Thinking...";
  if (getKey()) {
    callAI(text, { history: false, system: "You are the " + TOOLS[activeTool].t + " tool in the NOVA AI app. " + TOOLS[activeTool].d + " Produce the finished result directly, with no extra chatter." })
      .then(r => { $("#toolOut").textContent = r; });
    return;
  }
  setTimeout(() => { $("#toolOut").textContent = TOOLS[activeTool].make(text); }, 700);
}
$("#toolGo").onclick = () => runTool($("#toolInput").value);
$("#toolCopy").onclick = () => copyText($("#toolOut").textContent);
$("#toolClear").onclick = () => { $("#toolInput").value = ""; $("#toolOut").textContent = "Your result will appear here."; };
$("#writeSend").onclick = () => {
  const v = $("#writeInput").value.trim();
  if (!v) return toast("Tell me what to write");
  openTool("essay");
  $("#toolInput").value = v;
  runTool(v);
  $("#writeInput").value = "";
};

/* ---------- Translator ---------- */
const PHRASES = [
  { en: "hello, how are you?", fr: "Bonjour, comment ça va ?", es: "Hola, ¿cómo estás?", de: "Hallo, wie geht es dir?" },
  { en: "thank you", fr: "Merci", es: "Gracias", de: "Danke" },
  { en: "good morning", fr: "Bonjour", es: "Buenos días", de: "Guten Morgen" },
  { en: "good night", fr: "Bonne nuit", es: "Buenas noches", de: "Gute Nacht" },
  { en: "i love you", fr: "Je t'aime", es: "Te quiero", de: "Ich liebe dich" },
  { en: "where is the bathroom?", fr: "Où sont les toilettes ?", es: "¿Dónde está el baño?", de: "Wo ist die Toilette?" },
  { en: "welcome", fr: "Bienvenue", es: "Bienvenido", de: "Willkommen" },
  { en: "goodbye", fr: "Au revoir", es: "Adiós", de: "Auf Wiedersehen" }
];
let transTimer;
const norm = s => s.toLowerCase().replace(/\s+/g, " ").trim();
function translate() {
  const from = $("#fromLang").value, to = $("#toLang").value, txt = $("#transIn").value;
  if (!txt.trim()) { $("#transOut").textContent = ""; return; }
  if (from === to) { $("#transOut").textContent = txt; return; }
  const hit = PHRASES.find(p => norm(p[from]) === norm(txt));
  if (hit) { $("#transOut").textContent = hit[to]; return; }
  if (!getKey()) { $("#transOut").textContent = "Demo mode: this phrase isn't in the offline dictionary. Add your API key in Profile > AI Connection for full translation."; return; }
  $("#transOut").textContent = "Translating...";
  clearTimeout(transTimer);
  transTimer = setTimeout(async () => {
    const names = { en: "English", fr: "French", es: "Spanish", de: "German" };
    const r = await callAI(txt, { history: false, system: "Translate the user's text from " + names[from] + " to " + names[to] + ". Reply with only the translation." });
    if ($("#transIn").value === txt) $("#transOut").textContent = r;
  }, 700);
}
["transIn", "fromLang", "toLang"].forEach(id => $("#" + id).addEventListener("input", translate));
function swapLang() {
  const f = $("#fromLang"), t = $("#toLang"), a = f.value;
  f.value = t.value; t.value = a;
  const out = $("#transOut").textContent;
  if (!out.startsWith("Demo mode") && !out.startsWith("Translating") && !out.startsWith("⚠️")) $("#transIn").value = out;
  translate();
}
$("#swapBtn").onclick = swapLang;
$("#swapTop").onclick = swapLang;
$("#transClear").onclick = () => { $("#transIn").value = ""; $("#transOut").textContent = ""; };
$("#transCopy").onclick = () => copyText($("#transOut").textContent);
function speakTranslation() {
  const codes = { en: "en-US", fr: "fr-FR", es: "es-ES", de: "de-DE" };
  if (!("speechSynthesis" in window)) return toast("Speech not supported here");
  const u = new SpeechSynthesisUtterance($("#transOut").textContent);
  u.lang = codes[$("#toLang").value];
  speechSynthesis.cancel(); speechSynthesis.speak(u);
}
$("#transSpeak").onclick = speakTranslation;
$("#transListen").onclick = speakTranslation;
translate();

/* ---------- Settings ---------- */
$("#themeRow").onclick = () => {
  document.body.classList.toggle("light");
  $("#themeLabel").textContent = document.body.classList.contains("light") ? "Light Mode" : "Dark Mode";
  applyWallpaper();
};
let notif = true;
$("#notifRow").onclick = () => { notif = !notif; $("#notifLabel").textContent = notif ? "On" : "Off"; toast("Notifications " + (notif ? "on" : "off")); };

/* ---------- Atom picture used in the physics chat answer ---------- */
function atomImage() {
  const c = document.createElement("canvas"); c.width = 600; c.height = 300;
  const x = c.getContext("2d");
  const bg = x.createRadialGradient(300, 150, 10, 300, 150, 300);
  bg.addColorStop(0, "#1a1170"); bg.addColorStop(1, "#05030f");
  x.fillStyle = bg; x.fillRect(0, 0, 600, 300);
  x.lineWidth = 3; x.shadowBlur = 16;
  [0, 60, 120].forEach((deg, i) => {
    x.save(); x.translate(300, 150); x.rotate(deg * Math.PI / 180);
    x.strokeStyle = i === 1 ? "#c04dff" : "#00c8ff"; x.shadowColor = x.strokeStyle;
    x.beginPath(); x.ellipse(0, 0, 150, 52, 0, 0, Math.PI * 2); x.stroke();
    x.fillStyle = "#fff"; x.beginPath(); x.arc(150, 0, 6, 0, 7); x.fill();
    x.restore();
  });
  const n = x.createRadialGradient(300, 150, 0, 300, 150, 40);
  n.addColorStop(0, "#fff"); n.addColorStop(0.4, "#00c8ff"); n.addColorStop(1, "rgba(0,200,255,0)");
  x.fillStyle = n; x.beginPath(); x.arc(300, 150, 40, 0, 7); x.fill();
  return c.toDataURL("image/jpeg", 0.85);
}

/* ---------- 3D robot (Three.js, loaded from the internet; falls back to the flat SVG robot) ---------- */
function initRobot3D() {
  const box = $("#home .robot");
  if (!box) return;
  const s = document.createElement("script");
  s.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
  s.onload = () => { try { buildRobot(box); } catch (e) { /* keep flat robot */ } };
  (document.head || document.body).appendChild(s);
}

function buildRobot(box) {
  const T = THREE;
  const W = box.clientWidth || 140, H = box.clientHeight || 150;
  const renderer = new T.WebGLRenderer({ alpha: true, antialias: true });   // throws if WebGL is missing
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(W, H);

  const scene = new T.Scene();
  const cam = new T.PerspectiveCamera(35, W / H, 0.1, 50);
  cam.position.set(0, -0.9, 8.6);
  cam.lookAt(0, -0.9, 0);

  scene.add(new T.AmbientLight(0x9a96ff, 0.75));
  const sun = new T.DirectionalLight(0xffffff, 1.0); sun.position.set(2, 4, 5); scene.add(sun);
  const cyan = new T.PointLight(0x00c8ff, 1.6, 20); cyan.position.set(-4, 0, 3); scene.add(cyan);
  const purple = new T.PointLight(0xa040ff, 1.6, 20); purple.position.set(4, -3, 3); scene.add(purple);

  const white = new T.MeshStandardMaterial({ color: 0xe9ecff, metalness: 0.35, roughness: 0.28 });
  const dark = new T.MeshStandardMaterial({ color: 0x07061c, metalness: 0.8, roughness: 0.15 });
  const glow = c => new T.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.5 });
  const ball = (r, mat, sx, sy, sz) => { const m = new T.Mesh(new T.SphereGeometry(r, 32, 24), mat); m.scale.set(sx, sy, sz); return m; };

  const spinner = new T.Group();   // full-turn spin on tap
  const bot = new T.Group();       // sway + bob
  spinner.add(bot); scene.add(spinner);

  // head
  const head = new T.Group();
  head.add(ball(1, white, 1.05, 0.95, 1));
  const visor = ball(1, dark, 0.8, 0.55, 0.4); visor.position.set(0, 0.05, 0.62); head.add(visor);
  const eyes = new T.Group();
  [-0.3, 0.3].forEach(x => { const e = ball(0.1, glow(0x00e5ff), 1, 1, 0.8); e.position.set(x, 0.07, 0.98); eyes.add(e); });
  head.add(eyes);
  [-1, 1].forEach(side => {
    const ear = new T.Mesh(new T.CylinderGeometry(0.22, 0.22, 0.26, 24), glow(0x6c3bff));
    ear.rotation.z = Math.PI / 2; ear.position.set(side * 1.08, 0, 0); head.add(ear);
  });
  const ant = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 0.4, 8), white); ant.position.y = 1.15; head.add(ant);
  const tip = ball(0.09, glow(0x00e5ff), 1, 1, 1); tip.position.y = 1.4; head.add(tip);
  bot.add(head);

  // neck, body, shoulders
  const neck = new T.Mesh(new T.CylinderGeometry(0.3, 0.36, 0.35, 24), dark); neck.position.y = -1.05; bot.add(neck);
  const body = ball(1, white, 1.15, 0.95, 0.8); body.position.y = -2.0; bot.add(body);
  [-1, 1].forEach(side => {
    const sh = ball(0.32, white, 1, 1, 1); sh.position.set(side * 1.35, -1.55, 0); bot.add(sh);
    const arm = ball(0.24, white, 0.9, 1.5, 0.9); arm.position.set(side * 1.5, -2.2, 0.1); bot.add(arm);
  });

  // chest core + ring
  const core = ball(0.26, glow(0x00e5ff), 1, 1, 0.7); core.position.set(0, -1.9, 0.72); bot.add(core);
  const ring = new T.Mesh(new T.TorusGeometry(0.36, 0.05, 12, 40), glow(0x6c3bff)); ring.position.set(0, -1.9, 0.7); bot.add(ring);

  // halo behind the robot
  const halo = new T.Mesh(new T.TorusGeometry(1.7, 0.025, 12, 80), glow(0xc04dff)); halo.position.set(0, -0.6, -1);
  scene.add(halo);

  // swap the flat SVG for the 3D canvas
  const flat = box.querySelector("svg"); if (flat) flat.style.display = "none";
  box.appendChild(renderer.domElement);

  let t = 0, tx = 0, ty = 0, spin = 0, spinTarget = 0;
  window.addEventListener("pointermove", e => {
    tx = (e.clientX / window.innerWidth - 0.5) * 1.2;
    ty = (e.clientY / window.innerHeight - 0.5) * 0.5;
  });
  box.addEventListener("click", () => { spinTarget += Math.PI * 2; });

  (function tick() {
    requestAnimationFrame(tick);
    if (current !== "home" || document.hidden) return;   // save battery when not visible
    t += 0.016;
    bot.rotation.y += (tx + Math.sin(t * 0.7) * 0.25 - bot.rotation.y) * 0.06;
    head.rotation.x += (ty - head.rotation.x) * 0.06;
    bot.position.y = 0.1 + Math.sin(t * 1.6) * 0.08;
    spin += (spinTarget - spin) * 0.08; spinner.rotation.y = spin;
    ring.rotation.z += 0.03; halo.rotation.z += 0.01;
    eyes.scale.y = (Math.floor(t * 10) % 40 === 0) ? 0.1 : 1;     // blink every few seconds
    renderer.render(scene, cam);
  })();
}
initRobot3D();

/* ================= NEW: menu, wallpapers, files, accounts, preferences ================= */
const WALLPAPERS = [
  { id: "nova", name: "Nova Purple", css: "radial-gradient(circle at 50% -10%,#2a0f6b 0%,#0a0620 45%,#05030f 100%)" },
  { id: "neon", name: "Neon Blue", css: "radial-gradient(circle at 80% 0%,#00679e 0%,#06143a 48%,#02040f 100%)" },
  { id: "midnight", name: "Midnight Black", css: "linear-gradient(180deg,#0d0d16,#000)" },
  { id: "aurora", name: "Aurora", css: "radial-gradient(ellipse at 20% 10%,rgba(0,255,200,.35),transparent 50%),radial-gradient(ellipse at 85% 35%,rgba(138,43,226,.6),transparent 55%),linear-gradient(180deg,#07102a,#02030a)" },
  { id: "sunset", name: "Sunset Glow", css: "linear-gradient(180deg,#2a0a5e 0%,#7b1fa2 45%,#ff4f8b 100%)" },
  { id: "galaxy", name: "Galaxy", css: "radial-gradient(circle at 30% 20%,rgba(75,29,154,.7),transparent 45%),radial-gradient(circle at 75% 70%,rgba(10,165,255,.4),transparent 45%),#05030f" },
  { id: "ocean", name: "Deep Ocean", css: "linear-gradient(180deg,#021b3a,#04415f 60%,#011018)" },
  { id: "grid", name: "Cyber Grid", css: "linear-gradient(rgba(0,200,255,.14) 1px,transparent 1px) 0 0/32px 32px,linear-gradient(90deg,rgba(138,43,226,.16) 1px,transparent 1px) 0 0/32px 32px,radial-gradient(circle at 50% 0%,#2a0f6b,#05030f 70%)" }
];
function currentWp() {
  if (wpId === "custom" && wpImg) return { name: "My photo", css: 'linear-gradient(rgba(5,3,15,.5),rgba(5,3,15,.62)),url("' + wpImg + '") center/cover no-repeat' };
  return WALLPAPERS.find(w => w.id === wpId) || WALLPAPERS[0];
}
function applyWallpaper() {
  const app = $("#app"), w = currentWp();
  app.style.background = document.body.classList.contains("light") ? "" : w.css;
  $("#wpLabel").textContent = w.name;
  $$(".wp").forEach(b => b.classList.toggle("sel", b.dataset.id === (wpId === "custom" && !wpImg ? "nova" : wpId)));
}
function buildWallpapers() {
  const g = $("#wpGrid");
  WALLPAPERS.forEach(w => {
    const b = document.createElement("button");
    b.className = "wp"; b.dataset.id = w.id; b.style.background = w.css; b.textContent = w.name;
    b.onclick = () => { wpId = w.id; lsSet("nova_wp", wpId); applyWallpaper(); toast(w.name + " applied"); };
    g.appendChild(b);
  });
}
$("#wpGallery").onclick = () => $("#wpFile").click();
$("#wpFile").onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    const im = new Image();
    im.onload = () => {
      const k = Math.min(1, 900 / Math.max(im.width, im.height));
      const c = document.createElement("canvas"); c.width = im.width * k; c.height = im.height * k;
      c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
      wpImg = c.toDataURL("image/jpeg", 0.8); wpId = "custom";
      lsSet("nova_wp_img", wpImg); lsSet("nova_wp", "custom");
      applyWallpaper(); toast("Your photo is now the wallpaper");
    };
    im.src = r.result;
  };
  r.readAsDataURL(f);
};
$("#wpReset").onclick = () => { wpId = "nova"; wpImg = ""; lsSet("nova_wp", "nova"); lsSet("nova_wp_img", ""); applyWallpaper(); toast("Wallpaper reset"); };
buildWallpapers(); applyWallpaper();

/* ---------- Side menu ---------- */
$("#menuBtn").onclick = () => $("#drawer").classList.remove("hidden");
$("#drawer").addEventListener("click", e => {
  if (e.target.id === "drawer" || e.target.closest(".ditem")) $("#drawer").classList.add("hidden");
});

/* ---------- File picking (chat + tools) ---------- */
function pickFile(cb) {
  const inp = $("#fileIn");
  inp.value = "";
  inp.onchange = () => {
    const f = inp.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => cb(f.name, String(r.result).slice(0, 8000));
    r.onerror = () => toast("Couldn't read that file");
    r.readAsText(f);
  };
  inp.click();
}
$("#chatFile").onclick = () => pickFile((name, text) => {
  sendChat("Please read this file (" + name + ") and summarize it:\n\n" + text, "📎 " + name);
});
$("#toolFile").onclick = () => pickFile((name, text) => {
  $("#toolInput").value = text; toast("Loaded " + name);
});

/* ---------- Lightbox for library images ---------- */
function openLightbox(src) { $("#lbImg").src = src; $("#lightbox").classList.remove("hidden"); }
$("#lightbox").onclick = e => { if (e.target.id !== "lbDownload") $("#lightbox").classList.add("hidden"); };
$("#lbDownload").onclick = () => {
  const a = document.createElement("a"); a.href = $("#lbImg").src; a.download = "nova-ai-image.png";
  document.body.appendChild(a); a.click(); a.remove(); toast("Saving image...");
};

/* ---------- Account, preferences, upgrade ---------- */
function applyName() { $$(".uname").forEach(e => { e.textContent = USER; }); $("#nameIn").value = USER; }
$("#nameSave").onclick = () => {
  const v = $("#nameIn").value.trim();
  if (!v) return toast("Type a name first");
  USER = v; lsSet("nova_name", USER); applyName(); toast("Name saved");
};
$("#wipeAll").onclick = () => {
  if (confirm("Erase ALL data on this phone (chats, images, wallpaper, API key)?")) {
    try { localStorage.clear(); } catch (e) {}
    location.reload();
  }
};
function savePrefs() { lsSet("nova_prefs", JSON.stringify(prefs)); }
function applyPrefsUI() {
  $("#styleSel").value = prefs.style; $("#aiLangSel").value = prefs.lang; $("#imgEngine").value = prefs.img;
  $("#speakLabel").textContent = prefs.speak ? "On" : "Off";
  $("#langLabel").textContent = prefs.lang;
}
$("#imgEngine").onchange = e => { prefs.img = e.target.value; savePrefs(); toast(prefs.img === "online" ? "Online AI images" : "Offline neon art"); };
$("#styleSel").onchange = e => { prefs.style = e.target.value; savePrefs(); toast("Answer style saved"); };
$("#aiLangSel").onchange = e => { prefs.lang = e.target.value; savePrefs(); applyPrefsUI(); toast("Answer language: " + prefs.lang); };
$("#speakRow").onclick = () => { prefs.speak = !prefs.speak; savePrefs(); applyPrefsUI(); toast(prefs.speak ? "Answers will be read aloud" : "Read aloud off"); };
$("#proBtn").onclick = () => { toast("Demo only: no payment taken"); back(); };
applyName(); applyPrefsUI();

/* PWA: offline support + install button */
let installEvt = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; });
window.addEventListener("appinstalled", () => { installEvt = null; toast("NOVA AI installed 🎉"); });
$("#installRow").onclick = () => {
  if (installEvt) { installEvt.prompt(); installEvt = null; return; }
  if (window.matchMedia("(display-mode: standalone)").matches) return toast("NOVA AI is already installed");
  toast("Open your browser menu (⋮) and tap Add to Home screen");
};
if ("serviceWorker" in navigator && /^https?:/.test(location.protocol)) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
