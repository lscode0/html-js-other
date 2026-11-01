// Lokalny AI — czat z modelami LLM liczonymi na GPU iPhone'a (WebGPU + WebLLM).
import * as webllm from "https://esm.run/@mlc-ai/web-llm@0.2.87";

// Modele dobrane pod pamięć iPhone'a. vram = szacowane MB z konfiguracji WebLLM.
const MODELS = [
  { id: "SmolLM2-360M-Instruct-q4f16_1-MLC",  name: "SmolLM2 360M",   vram: 376,  note: "najszybszy, słaby po polsku" },
  { id: "gemma3-1b-it-q4f16_1-MLC",           name: "Gemma 3 1B",     vram: 711,  note: "dobry start, zna polski", rec: true },
  { id: "Llama-3.2-1B-Instruct-q4f16_1-MLC",  name: "Llama 3.2 1B",   vram: 879,  note: "szybki, ogólny" },
  { id: "Qwen3-1.7B-q4f16_1-MLC",             name: "Qwen3 1.7B",     vram: 2037, note: "mądrzejszy, tryb myślenia", think: true },
  { id: "Llama-3.2-3B-Instruct-q4f16_1-MLC",  name: "Llama 3.2 3B",   vram: 2264, note: "najlepsza jakość — iPhone 15 Pro+" },
  { id: "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC", name: "Qwen2.5 Coder 1.5B", vram: 1630, note: "do kodu" },
  // --- bez cenzury ---
  { id: "Hermes-3-Llama-3.2-3B-q4f16_1-MLC", name: "Hermes 3 3B", vram: 2264, note: "luźny alignment, rzadko odmawia", unc: true },
  {
    id: "Llama-3.2-3B-Instruct-abliterated-q4f16_1-MLC", name: "Llama 3.2 3B abliterated", vram: 2264,
    note: "bez odmów · repo społeczności, eksperymentalny", unc: true,
    model: "https://huggingface.co/kdjunkit2/Llama-3.2-3B-Instruct-abliterated-q4f16_1-MLC",
    lib: "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_87/base/Llama-3.2-3B-Instruct-q4f16_1_cs1k-webgpu.wasm",
  },
];

// Prebuilt WebLLM + własne modele (te z polem `model`). Wagi własnego modelu muszą być
// skonwertowane do MLC q4f16_1 tą samą architekturą co `lib`.
const appConfig = {
  ...webllm.prebuiltAppConfig,
  // Safari: Cache API (cache.add) potrafi odrzucić odpowiedź z HF jako "Response is not OK" — IndexedDB pobiera przez fetch().
  cacheBackend: "indexeddb",
  model_list: [
    ...webllm.prebuiltAppConfig.model_list,
    ...MODELS.filter((m) => m.model).map((m) => ({
      model: m.model, model_id: m.id, model_lib: m.lib,
      vram_required_MB: m.vram, low_resource_required: true,
      overrides: { context_window_size: 4096 },
    })),
  ],
};

const DEFAULT_SYS = "Jesteś pomocnym asystentem. Odpowiadaj zwięźle, po polsku, chyba że użytkownik pisze w innym języku.";
const $ = (s) => document.querySelector(s);
const store = {
  get(k, d) { try { const v = localStorage.getItem("lai:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("lai:" + k, JSON.stringify(v)); } catch {} },
};

const state = {
  engine: null,
  loadedId: null,
  selectedId: store.get("model", MODELS.find((m) => m.rec).id),
  thinking: store.get("thinking", false),
  sys: store.get("sys", DEFAULT_SYS),
  history: store.get("history", []), // [{role, content, meta?}]
  busy: false,
};

// ---------- UI: render ----------
const chatEl = $("#chat");

function esc(s) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function md(text) {
  // minimalny markdown: bloki kodu, `kod`, **pogrubienie**
  const parts = text.split(/```(\w*)\n?([\s\S]*?)(?:```|$)/g);
  let out = "";
  for (let i = 0; i < parts.length; i++) {
    if (i % 3 === 0) {
      let t = parts[i];
      if (i > 0) t = t.replace(/^\n/, "");
      if (i < parts.length - 1) t = t.replace(/\n$/, "");
      out += esc(t)
        .replace(/`([^`\n]+)`/g, "<code>$1</code>")
        .replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>");
    } else if (i % 3 === 2) {
      out += `<pre><code>${esc(parts[i].replace(/\n$/, ""))}</code></pre>`;
    }
  }
  return out;
}
function splitThink(raw) {
  const m = raw.match(/^\s*<think>([\s\S]*?)(<\/think>|$)([\s\S]*)$/);
  if (!m) return { think: "", answer: raw, thinking: false };
  return { think: m[1].trim(), answer: m[3].trimStart(), thinking: !m[2] };
}
function bubbleHTML(msg) {
  if (msg.role === "user") return esc(msg.content);
  const { think, answer, thinking } = splitThink(msg.content);
  let h = "";
  if (think) h += `<details${thinking ? " open" : ""}><summary>${thinking ? "Myśli…" : "Tok myślenia"}</summary>${esc(think)}</details>`;
  h += md(answer || (thinking ? "" : "…"));
  if (msg.meta) h += `<span class="meta">${esc(msg.meta)}</span>`;
  return h;
}
function render() {
  chatEl.innerHTML = "";
  if (!state.history.length) {
    const m = MODELS.find((x) => x.id === state.selectedId);
    chatEl.innerHTML = `<div class="empty"><b>Prywatny czat na telefonie</b>
      Model: ${esc(m ? m.name : state.selectedId)}.<br>Napisz coś — model załaduje się automatycznie.</div>`;
    return;
  }
  for (const msg of state.history) addBubble(msg);
  scrollDown();
}
function addBubble(msg) {
  const el = document.createElement("div");
  el.className = `msg ${msg.role === "user" ? "user" : "bot"}${msg.err ? " err" : ""}`;
  el.innerHTML = bubbleHTML(msg);
  chatEl.appendChild(el);
  return el;
}
function scrollDown() { chatEl.scrollTop = chatEl.scrollHeight; }
function setStatus(text, mode) {
  $("#status").textContent = text;
  $("#dot").className = "dot" + (mode ? " " + mode : "");
}
function setProgress(text, frac) {
  const p = $("#progress");
  if (text == null) { p.classList.remove("show"); return; }
  p.classList.add("show");
  $("#progText").textContent = text;
  $("#bar i").style.width = Math.round((frac || 0) * 100) + "%";
}
function setBusy(b) {
  state.busy = b;
  const s = $("#send");
  s.classList.toggle("stop", b);
  s.textContent = b ? "■" : "↑";
  s.setAttribute("aria-label", b ? "Zatrzymaj" : "Wyślij");
}

// ---------- silnik ----------
function webgpuOK() { return !!navigator.gpu; }

let gpuInfo = null;
async function probeGPU() {
  if (gpuInfo) return gpuInfo;
  if (!webgpuOK()) throw new Error("Brak WebGPU. Wymagany iOS 26+ i Safari (albo PWA z ekranu początkowego).");
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("Safari nie dał dostępu do GPU (requestAdapter = null). Zamknij inne karty i spróbuj ponownie.");
  gpuInfo = {
    f16: adapter.features.has("shader-f16"),
    maxBuf: adapter.limits.maxStorageBufferBindingSize,
  };
  return gpuInfo;
}

// iPhone'y bez shader-f16 nie uruchomią wariantów q4f16 — przełącz na q4f32 (ok. 30% więcej RAM).
function resolveId(id, gpu) {
  if (gpu.f16 || !id.includes("q4f16_1")) return id;
  const alt = id.replace("q4f16_1", "q4f32_1");
  if (appConfig.model_list.some((r) => r.model_id === alt)) return alt;
  throw new Error("Ten model wymaga shader-f16, którego Twój GPU nie obsługuje. Wybierz Llama 3.2 1B albo SmolLM2.");
}

function explain(e) {
  const msg = String(e?.message || e);
  if (/quota|QuotaExceeded|storage/i.test(msg)) return "Brak miejsca na model w Safari. Usuń inne pobrane modele (⚙︎ → Usuń z dysku) albo zwolnij miejsce na iPhonie. [" + msg + "]";
  if (/device.*lost|out of memory|OOM|allocation/i.test(msg)) return "Model nie mieści się w pamięci GPU. Wybierz mniejszy (1B). [" + msg + "]";
  if (/fetch|network|Failed to load|NetworkError|404/i.test(msg)) return "Nie udało się pobrać plików modelu. Sprawdź internet; jeśli to model społeczności, repo może być niekompatybilne. [" + msg + "]";
  return msg;
}

async function ensureModel(wanted = state.selectedId) {
  const gpu = await probeGPU();
  const id = resolveId(wanted, gpu);
  if (state.engine && state.loadedId === id) return state.engine;
  const m = MODELS.find((x) => x.id === wanted);
  setStatus("ładowanie " + (m?.name || id), "busy");
  setProgress("Przygotowanie…", 0);
  const cb = (r) => {
    const t = (r.text || "").replace(/Loading model from cache\[/, "Z pamięci [").replace(/Fetching param cache\[/, "Pobieranie [");
    setProgress(t, r.progress);
  };
  try {
    if (!state.engine) {
      state.engine = await webllm.CreateMLCEngine(id, { initProgressCallback: cb, appConfig });
    } else {
      state.engine.setInitProgressCallback(cb);
      await state.engine.reload(id);
    }
    state.loadedId = id;
    setStatus((m?.name || id) + (id !== wanted ? " (f32)" : "") + " · gotowy", "on");
    return state.engine;
  } catch (e) {
    console.error(e);
    state.loadedId = null;
    setStatus("błąd ładowania", "");
    throw new Error(explain(e));
  } finally {
    setProgress(null);
  }
}

async function send(text) {
  state.history.push({ role: "user", content: text });
  const bot = { role: "assistant", content: "" };
  state.history.push(bot);
  if (state.history.length === 2) chatEl.innerHTML = "";
  addBubble(state.history[state.history.length - 2]);
  const el = addBubble(bot);
  scrollDown();
  setBusy(true);

  try {
    const engine = await ensureModel();
    const model = MODELS.find((x) => x.id === state.selectedId);
    const msgs = [{ role: "system", content: state.sys }]
      .concat(state.history.slice(0, -1).filter((m) => !m.err).slice(-16) // ostatnie 16 wiadomości mieści się w 4k kontekstu
      .map((m) => ({ role: m.role, content: m.role === "assistant" ? splitThink(m.content).answer : m.content })));

    const req = { messages: msgs, stream: true, stream_options: { include_usage: true }, temperature: 0.7 };
    if (model?.think) req.extra_body = { enable_thinking: state.thinking };

    const t0 = performance.now();
    let usage = null;
    const stream = await engine.chat.completions.create(req);
    for await (const chunk of stream) {
      const d = chunk.choices?.[0]?.delta?.content;
      if (d) {
        bot.content += d;
        el.innerHTML = bubbleHTML(bot);
        const nearBottom = chatEl.scrollHeight - chatEl.scrollTop - chatEl.clientHeight < 120;
        if (nearBottom) scrollDown();
      }
      if (chunk.usage) usage = chunk.usage;
    }
    const tps = usage?.extra?.decode_tokens_per_s;
    bot.meta = `${model?.name || ""} · ${tps ? tps.toFixed(1) + " tok/s" : ((performance.now() - t0) / 1000).toFixed(1) + " s"}`;
  } catch (e) {
    console.error(e);
    bot.err = true;
    bot.content = (bot.content ? bot.content + "\n\n" : "") + "⚠️ " + (e?.message || String(e));
    el.classList.add("err");
  } finally {
    if (!bot.content.trim()) bot.content = "(przerwano)";
    el.innerHTML = bubbleHTML(bot);
    setBusy(false);
    store.set("history", state.history);
    scrollDown();
  }
}

// ---------- ustawienia ----------
async function renderModels() {
  const box = $("#models");
  box.innerHTML = "";
  for (const m of MODELS) {
    let cached = false;
    try { cached = await webllm.hasModelInCache(m.id, appConfig); } catch {}
    const row = document.createElement("label");
    row.className = "model" + (m.id === state.selectedId ? " sel" : "");
    row.innerHTML = `<input type="radio" name="model" value="${m.id}" ${m.id === state.selectedId ? "checked" : ""}>
      <div>${esc(m.name)}${m.rec ? '<span class="tag">polecany</span>' : ""}${m.unc ? '<span class="tag unc">bez cenzury</span>' : ""}${cached ? '<span class="tag">pobrany</span>' : ""}
      <small>${m.vram >= 1000 ? (m.vram / 1000).toFixed(1) + " GB" : m.vram + " MB"} · ${esc(m.note)}</small></div>`;
    row.querySelector("input").onchange = () => {
      state.selectedId = m.id;
      store.set("model", m.id);
      box.querySelectorAll(".model").forEach((r) => r.classList.toggle("sel", r === row));
    };
    box.appendChild(row);
  }
}

function openSettings() {
  $("#thinking").checked = state.thinking;
  $("#sysPrompt").value = state.sys;
  $("#gpuInfo").textContent = webgpuOK() ? "WebGPU: dostępne ✓ — sprawdzam GPU…" : "WebGPU: niedostępne ✗ — zaktualizuj iOS do 26+.";
  probeGPU().then((g) => { $("#gpuInfo").textContent = `WebGPU ✓ · shader-f16: ${g.f16 ? "tak" : "nie (modele w wersji f32)"} · max bufor: ${Math.round(g.maxBuf / 1048576)} MB`; }).catch((e) => { $("#gpuInfo").textContent = e.message; });
  renderModels();
  $("#settings").showModal();
}
function saveSettings() {
  state.thinking = $("#thinking").checked;
  state.sys = $("#sysPrompt").value.trim() || DEFAULT_SYS;
  store.set("thinking", state.thinking);
  store.set("sys", state.sys);
}

$("#openSettings").onclick = openSettings;
$("#closeSettings").onclick = () => { saveSettings(); $("#settings").close(); };
$("#settings").addEventListener("close", saveSettings);
$("#loadModel").onclick = async () => {
  saveSettings();
  $("#settings").close();
  try { await ensureModel(); } catch (e) { alert(e.message || e); }
};
$("#unload").onclick = async () => {
  if (state.engine) { await state.engine.unload(); state.loadedId = null; }
  setStatus("brak modelu", "");
};
$("#deleteCache").onclick = async () => {
  const m = MODELS.find((x) => x.id === state.selectedId);
  if (!confirm(`Usunąć ${m?.name} z pamięci telefonu?`)) return;
  if (state.loadedId && state.loadedId.replace("q4f32_1", "q4f16_1") === state.selectedId) { await state.engine.unload(); state.loadedId = null; setStatus("brak modelu", ""); }
  await webllm.deleteModelAllInfoInCache(state.selectedId, appConfig);
  renderModels();
};
$("#newChat").onclick = () => {
  if (state.busy) return;
  state.history = [];
  store.set("history", state.history);
  render();
};

// ---------- composer ----------
const input = $("#input");
function autosize() { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 140) + "px"; }
input.addEventListener("input", autosize);
input.addEventListener("keydown", (e) => {
  // Enter wysyła na klawiaturze sprzętowej; na ekranowej iOS Enter = nowa linia poza przyciskiem "Wyślij"
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing && matchMedia("(pointer:fine)").matches) {
    e.preventDefault(); $("#composer").requestSubmit();
  }
});
$("#composer").addEventListener("submit", (e) => {
  e.preventDefault();
  if (state.busy) { state.engine?.interruptGenerate(); return; }
  const text = input.value.trim();
  if (!text) return;
  input.value = ""; autosize();
  send(text);
});

// ---------- start ----------
render();
if (!webgpuOK()) setStatus("brak WebGPU — iOS 26+", "");
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
// Poproś o trwałe przechowywanie, żeby iOS nie wyczyścił pobranych wag
navigator.storage?.persist?.().catch(() => {});
