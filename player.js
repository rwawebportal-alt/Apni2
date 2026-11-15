// =========================================================
// APNIPADHAI ULTIMATE OTT PLAYER ENGINE (player.js)
// =========================================================

const WORKER_ENDPOINTS = [
    "https://apna.tmock730.workers.dev/proxy?url=",
    "https://proplayer.allswbatch22.workers.dev/proxy?url="
];

let activeWorkerIdx = 0;
let useDirectStreamFallback = false;

function getActiveProxyPrefix() {
    if (useDirectStreamFallback) return "";
    return WORKER_ENDPOINTS[activeWorkerIdx] || WORKER_ENDPOINTS[0];
}

const v = document.getElementById("video");
const input = document.getElementById("url");
const bufferLoader = document.getElementById("bufferLoader");

let hls = null;
let cachedTokenQuery = "";
let resumeSeekTime = 0;

function showLoader(show) {
    if (!bufferLoader) return;
    if (show) bufferLoader.classList.remove("hidden");
    else bufferLoader.classList.add("hidden");
}

function valid(u) {
    try {
        return ["http:", "https:"].includes(new URL(u).protocol);
    } catch {
        return false;
    }
}

// Safely unwraps any nested .workers.dev proxy URLs to prevent 403 self-proxy loops
function unwrapOriginalUrl(u) {
    if (!u || typeof u !== "string") return "";
    let current = u.trim();
    let safety = 0;
    while (safety < 6) {
        safety++;
        try {
            const parsed = new URL(current);
            if (parsed.hostname.toLowerCase().includes("workers.dev") && parsed.searchParams.has("url")) {
                const rawInner = parsed.search.match(/[?&]url=([^&]+)/);
                if (rawInner && rawInner[1]) {
                    current = decodeURIComponent(rawInner[1]);
                } else {
                    current = parsed.searchParams.get("url") || current;
                }
                if (/^https?%3A%2F%2F/i.test(current)) {
                    current = decodeURIComponent(current);
                }
                continue;
            }
        } catch {}
        break;
    }
    return current;
}

function extractStreamAuthQuery(rawUrl) {
    if (!rawUrl) return "";
    const clean = unwrapOriginalUrl(rawUrl);
    const edgeMatch = clean.match(/(edge-cache-token=[^&]+)/);
    if (edgeMatch) return edgeMatch[1];
    const qIdx = clean.indexOf("?");
    if (qIdx !== -1) {
        return clean.slice(qIdx + 1);
    }
    return "";
}

function attachAuthTokenIfMissing(targetUrl, tokenQuery) {
    if (!tokenQuery || !targetUrl) return targetUrl;
    if (
        targetUrl.includes("edge-cache-token=") ||
        targetUrl.includes("hdnea=") ||
        targetUrl.includes("Signature=") ||
        targetUrl.includes("Policy=")
    ) {
        return targetUrl;
    }
    return targetUrl + (targetUrl.includes("?") ? "&" : "?") + tokenQuery;
}

function wrapWithActiveProxy(rawTargetUrl) {
    const cleanUrl = unwrapOriginalUrl(rawTargetUrl);
    if (useDirectStreamFallback) return cleanUrl;
    const prefix = getActiveProxyPrefix();
    return prefix ? prefix + encodeURIComponent(cleanUrl) : cleanUrl;
}

function manifest(u) {
    const rawUrl = unwrapOriginalUrl(u);
    if (useDirectStreamFallback) return rawUrl;
    try {
        const x = new URL(rawUrl);
        if (
            x.pathname.toLowerCase().includes(".m3u8") ||
            x.hostname.includes("classx.co.in") ||
            x.hostname.includes("akamai.net.in") ||
            x.hostname.includes("cloudfront.net")
        ) {
            return wrapWithActiveProxy(rawUrl);
        }
    } catch {}
    return rawUrl;
}

function isMediaSegmentOrKey(u) {
    const pathOnly = u.split("?")[0].toLowerCase();
    return /\.(ts|m4s|mp4|aac|mp3|vtt|webvtt|key)$/i.test(pathOnly);
}

class BackendLoader extends Hls.DefaultConfig.loader {
    load(ctx, cfg, cb) {
        let rawTarget = unwrapOriginalUrl(ctx.url);
        let mainUrl = input ? unwrapOriginalUrl(input.value.trim()) : "";

        const extracted = extractStreamAuthQuery(mainUrl);
        if (extracted) {
            cachedTokenQuery = extracted;
        }

        if (cachedTokenQuery) {
            rawTarget = attachAuthTokenIfMissing(rawTarget, cachedTokenQuery);
        }

        const pathLower = rawTarget.split("?")[0].toLowerCase();

        if (useDirectStreamFallback) {
            ctx.url = rawTarget;
        } else if (
            pathLower.endsWith(".m3u8") ||
            isMediaSegmentOrKey(rawTarget) ||
            rawTarget.includes("classx.co.in") ||
            rawTarget.includes("akamai.net.in")
        ) {
            ctx.url = wrapWithActiveProxy(rawTarget);
        } else {
            ctx.url = rawTarget;
        }

        super.load(ctx, cfg, cb);
    }
}

function stopPlayer() {
    if (hls) {
        try { hls.destroy(); } catch {}
        hls = null;
    }
    if (v) {
        v.pause();
        v.removeAttribute("src");
        v.load();
    }
    const ytFrame = document.getElementById("ytFrame");
    if (ytFrame) ytFrame.src = "";
    showLoader(false);
}

window.closePlayerBox = function() {
    stopPlayer();
    const menu = document.getElementById("settingsMenu");
    if (menu) menu.classList.remove("show");
    if (typeof closeInlinePdfAndReset === "function") {
        closeInlinePdfAndReset();
    }
    if (typeof showSlide === "function") {
        showSlide("slideExplorer");
    }
};

function start(isRetry = false) {
    let raw = input ? input.value.trim() : "";
    if (!raw) return;

    if (!isRetry) {
        activeWorkerIdx = 0;
        useDirectStreamFallback = false;
    }

    stopPlayer();
    showLoader(true);

    const cleanRaw = unwrapOriginalUrl(raw);
    const isYT =
        (!cleanRaw.startsWith("http") && cleanRaw.length >= 10 && cleanRaw.length <= 15) ||
        cleanRaw.includes("youtube.com") ||
        cleanRaw.includes("youtu.be");

    if (isYT) {
        showLoader(false);
        document.getElementById("hlsScreen").classList.add("hidden");
        document.getElementById("ytScreen").classList.remove("hidden");

        let ytId = cleanRaw;
        if (cleanRaw.includes("v=")) ytId = cleanRaw.split("v=")[1].split("&")[0];
        else if (cleanRaw.includes("youtu.be/")) ytId = cleanRaw.split("youtu.be/")[1].split("?")[0];
        else if (cleanRaw.includes("/embed/")) ytId = cleanRaw.split("/embed/")[1].split("?")[0];

        const ytFrame = document.getElementById("ytFrame");
        if (ytFrame) ytFrame.src = `https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0`;
        return;
    }

    document.getElementById("ytScreen").classList.add("hidden");
    document.getElementById("hlsScreen").classList.remove("hidden");

    if (!valid(cleanRaw)) {
        showLoader(false);
        return;
    }

    cachedTokenQuery = extractStreamAuthQuery(cleanRaw);

    if (!isRetry && typeof state !== "undefined" && state.activeKey) {
        let savedTime = localStorage.getItem("apnipadhai_vid_progress_" + state.activeKey);
        if (savedTime) {
            resumeSeekTime = parseFloat(savedTime);
        }
    }

    const pathOnly = cleanRaw.split("?")[0].toLowerCase();
    if (pathOnly.endsWith(".mp4") && !pathOnly.endsWith(".m3u8")) {
        v.src = useDirectStreamFallback ? cleanRaw : wrapWithActiveProxy(cleanRaw);
        populateQualitySettings([]);
        v.onloadedmetadata = () => {
            showLoader(false);
            if (resumeSeekTime > 0) {
                v.currentTime = resumeSeekTime;
                resumeSeekTime = 0;
            }
            v.play().catch(() => {});
        };
        v.onerror = () => {
            if (!useDirectStreamFallback) {
                useDirectStreamFallback = true;
                v.src = cleanRaw;
                v.play().catch(() => {});
            } else {
                showLoader(false);
            }
        };
        return;
    }

    let src = manifest(cleanRaw);

    if (Hls.isSupported()) {
        hls = new Hls({
            enableWorker: true,
            lowLatencyMode: false,
            backBufferLength: 30,
            maxBufferLength: 30,
            manifestLoadingTimeOut: 20000,
            manifestLoadingMaxRetry: 2,
            levelLoadingTimeOut: 20000,
            fragLoadingTimeOut: 25000,
            fragLoadingMaxRetry: 3,
            loader: BackendLoader
        });

        hls.on(Hls.Events.MEDIA_ATTACHED, () => hls.loadSource(src));

        hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
            showLoader(false);
            if (typeof hideServerError === "function") hideServerError();
            populateQualitySettings(data.levels || []);
            if (resumeSeekTime > 0) {
                v.currentTime = resumeSeekTime;
                resumeSeekTime = 0;
            }
            v.play().catch(() => {});
        });

        hls.on(Hls.Events.ERROR, (_, d) => {
            if (d.fatal) {
                if (d.type === Hls.ErrorTypes.NETWORK_ERROR) {
                    // Stage 1: Switch to backup Cloudflare Worker if primary worker gave 403/500
                    if (!useDirectStreamFallback && activeWorkerIdx < WORKER_ENDPOINTS.length - 1) {
                        activeWorkerIdx++;
                        console.warn("Switching to backup Worker proxy:", WORKER_ENDPOINTS[activeWorkerIdx]);
                        start(true);
                        return;
                    }
                    // Stage 2: Try Direct CDN stream without worker
                    if (!useDirectStreamFallback) {
                        useDirectStreamFallback = true;
                        console.warn("Switching to Direct CDN stream fallback...");
                        start(true);
                        return;
                    }
                } else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) {
                    try {
                        hls.recoverMediaError();
                        return;
                    } catch {}
                }

                showLoader(false);
                if (typeof showServerError === "function") {
                    showServerError(
                        "Video Stream Playback Error",
                        `HLS Error (${d.details || d.type}). Kripya apna Cloudflare Worker (worker.js) update karein ya doosri quality select karein.`,
                        cleanRaw.slice(0, 110) + "..."
                    );
                }
            }
        });

        hls.attachMedia(v);
    } else if (v.canPlayType("application/vnd.apple.mpegurl")) {
        v.src = src;
        v.onloadedmetadata = () => {
            showLoader(false);
            if (resumeSeekTime > 0) {
                v.currentTime = resumeSeekTime;
                resumeSeekTime = 0;
            }
            v.play().catch(() => {});
        };
    }
}

function populateQualitySettings(hlsLevels) {
    const qList = document.getElementById("qualityList");
    if (!qList) return;

    const activeInfo = (typeof state !== "undefined" && state.activeKey && state.mediaMap) ? state.mediaMap[state.activeKey] : null;
    const serverQualsObj = (activeInfo && activeInfo.qualities) ? activeInfo.qualities : {};
    const serverKeys = Object.keys(serverQualsObj);

    let html = "";

    if (serverKeys.length > 1) {
        const currentRaw = unwrapOriginalUrl(input.value);
        serverKeys.forEach((qKey, idx) => {
            const targetRaw = unwrapOriginalUrl(serverQualsObj[qKey]);
            const isAct = (currentRaw && targetRaw && currentRaw === targetRaw) || (!currentRaw && idx === 0);
            html += `<div class="q-option ${isAct ? "active" : ""}" onclick="switchServerQuality('${qKey.replace(/'/g, "")}', this)">${qKey}</div>`;
        });
    } else if (hlsLevels && hlsLevels.length > 1) {
        html += `<div class="q-option active" onclick="changeHlsLevel(-1, this)">Auto</div>`;
        const seenHeights = new Set();
        hlsLevels.forEach((lvl, idx) => {
            let label = lvl.height ? `${lvl.height}p` : `${idx + 1}p`;
            if (!seenHeights.has(label)) {
                seenHeights.add(label);
                html += `<div class="q-option" onclick="changeHlsLevel(${idx}, this)">${label}</div>`;
            }
        });
    } else {
        const singleLabel = serverKeys[0] || "720p HD";
        html = `<div class="q-option active" onclick="toggleSettingsMenu()">${singleLabel}</div>`;
    }

    qList.innerHTML = html;
}

window.changeHlsLevel = function(idx, el) {
    if (hls) hls.currentLevel = idx;
    document.querySelectorAll("#qualityList .q-option").forEach(o => o.classList.remove("active"));
    if (el) el.classList.add("active");
    toggleSettingsMenu();
};

window.switchServerQuality = function(qKey, el) {
    resumeSeekTime = v ? v.currentTime : 0;
    document.querySelectorAll("#qualityList .q-option").forEach(o => o.classList.remove("active"));
    if (el) el.classList.add("active");
    toggleSettingsMenu();
    if (typeof changeLectureQuality === "function") {
        changeLectureQuality(qKey, resumeSeekTime);
    }
};

window.changeSpd = function(rate, el) {
    if (v) v.playbackRate = rate;
    document.querySelectorAll(".spd-option").forEach(o => o.classList.remove("active"));
    if (el) el.classList.add("active");
    toggleSettingsMenu();
};

window.toggleSettingsMenu = function() {
    const menu = document.getElementById("settingsMenu");
    if (menu) menu.classList.toggle("show");
};

// TAP-TO-TOGGLE CONTROLS & DOUBLE-TAP SEEK
const hlsScreen = document.getElementById("hlsScreen");
const playerControlsBar = document.getElementById("playerControlsBar");
let lastTapTime = 0;

if (hlsScreen) {
    hlsScreen.addEventListener("click", (e) => {
        if (e.target.closest("button") || e.target.closest("input") || e.target.closest("#settingsMenu")) {
            return;
        }

        const currentTime = new Date().getTime();
        const tapLength = currentTime - lastTapTime;

        if (tapLength < 300 && tapLength > 0) {
            const rect = hlsScreen.getBoundingClientRect();
            const clickX = e.clientX - rect.left;

            if (clickX > rect.width / 2) {
                v.currentTime = Math.min(v.duration || Infinity, v.currentTime + 10);
            } else {
                v.currentTime = Math.max(0, v.currentTime - 10);
            }
            e.preventDefault();
        } else {
            if (playerControlsBar) {
                playerControlsBar.classList.toggle("hidden-controls");
            }
            const menu = document.getElementById("settingsMenu");
            if (menu && menu.classList.contains("show")) {
                menu.classList.remove("show");
            }
        }
        lastTapTime = currentTime;
    });
}

async function downloadMerged() {
    const raw = input ? unwrapOriginalUrl(input.value.trim()) : "";
    if (!valid(raw) || !hls || !hls.levels || hls.levels.length === 0) return;

    const box = document.getElementById("downloadBox");
    const text = document.getElementById("downloadText");
    const bar = document.getElementById("bar");
    if (box) box.classList.add("show");
    if (bar) bar.style.width = "2%";
    if (text) text.textContent = "Preparing video segments...";

    try {
        let levelIndex = hls.currentLevel >= 0 ? hls.currentLevel : 0;
        let levelDetails = hls.levels[levelIndex].details;
        if (!levelDetails || !levelDetails.fragments) {
            throw new Error("Playlist segments abhi load nahi hue hain. Video 2 second play hone dein.");
        }

        let fragments = levelDetails.fragments;
        let downloadedBuffers = [];
        let total = fragments.length;
        let tokenStr = extractStreamAuthQuery(raw) || cachedTokenQuery;

        if (fragments[0] && fragments[0].initSegment && fragments[0].initSegment.url) {
            let initUrl = unwrapOriginalUrl(fragments[0].initSegment.url);
            initUrl = attachAuthTokenIfMissing(initUrl, tokenStr);
            let fetchInitUrl = wrapWithActiveProxy(initUrl);
            let res = await fetch(fetchInitUrl);
            if (res.ok) downloadedBuffers.push(await res.arrayBuffer());
        }

        // Batch download (10 segments per batch for faster speed)
        const batchSize = 10;
        for (let i = 0; i < total; i += batchSize) {
            const slice = fragments.slice(i, i + batchSize);
            const batchPromises = slice.map(async (frag, idx) => {
                let segUrl = unwrapOriginalUrl(frag.url);
                segUrl = attachAuthTokenIfMissing(segUrl, tokenStr);
                let fetchSegUrl = wrapWithActiveProxy(segUrl);
                let segRes = await fetch(fetchSegUrl);
                if (!segRes.ok) throw new Error(`Segment ${i + idx + 1} HTTP ${segRes.status}`);
                return await segRes.arrayBuffer();
            });

            const batchBuffers = await Promise.all(batchPromises);
            downloadedBuffers.push(...batchBuffers);

            const doneCount = Math.min(total, i + slice.length);
            const pct = Math.round((doneCount / total) * 100);
            if (text) text.textContent = `Downloading: ${doneCount} / ${total} (${pct}%)`;
            if (bar) bar.style.width = pct + "%";
        }

        if (text) text.textContent = "Merging MP4 file...";
        const blob = new Blob(downloadedBuffers, { type: "video/mp4" });
        const finalUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = finalUrl;
        a.download = `ApniPadhai_Class_${Math.floor(Math.random() * 10000)}.mp4`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(finalUrl), 60000);
        if (text) text.textContent = "✅ Download Complete!";
        setTimeout(() => { if (box) box.classList.remove("show"); }, 4000);
    } catch (e) {
        if (text) text.textContent = "⚠️ Download error: " + e.message;
    }
}

function fmt(x) {
    if (!Number.isFinite(x)) return "00:00";
    x = Math.floor(x);
    let h = Math.floor(x / 3600), m = Math.floor((x % 3600) / 60), s = x % 60;
    return h
        ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
        : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const toggleBtn = document.getElementById("toggle");
if (toggleBtn) toggleBtn.onclick = () => v.paused ? v.play() : v.pause();

v.onplay = () => { if (toggleBtn) toggleBtn.textContent = "⏸"; showLoader(false); };
v.onpause = () => { if (toggleBtn) toggleBtn.textContent = "▶"; };
v.onwaiting = () => showLoader(true);
v.onplaying = () => showLoader(false);
v.oncanplay = () => showLoader(false);

const backBtn = document.getElementById("back");
if (backBtn) backBtn.onclick = () => v.currentTime = Math.max(0, v.currentTime - 10);

const nextBtn = document.getElementById("next");
if (nextBtn) nextBtn.onclick = () => v.currentTime = Math.min(v.duration || Infinity, v.currentTime + 10);

const muteBtn = document.getElementById("mute");
if (muteBtn) muteBtn.onclick = () => {
    v.muted = !v.muted;
    muteBtn.textContent = v.muted ? "🔇" : "🔊";
};

const dlBtn = document.getElementById("download");
if (dlBtn) dlBtn.onclick = downloadMerged;

const pipBtn = document.getElementById("pip");
if (pipBtn) pipBtn.onclick = async () => {
    try {
        if (document.pictureInPictureElement) await document.exitPictureInPicture();
        else if (v.requestPictureInPicture) await v.requestPictureInPicture();
    } catch {}
};

const fsBtn = document.getElementById("fs");
const headerBar = document.getElementById("playerHeaderBar");

if (fsBtn && hlsScreen) {
    fsBtn.onclick = async () => {
        try {
            if (!document.fullscreenElement) {
                await hlsScreen.requestFullscreen();
            } else {
                await document.exitFullscreen();
            }
        } catch {}
    };
}

document.addEventListener("fullscreenchange", () => {
    if (document.fullscreenElement) {
        if (headerBar) headerBar.classList.add("hidden");
        if (fsBtn) fsBtn.textContent = "🗗";
    } else {
        if (headerBar) headerBar.classList.remove("hidden");
        if (fsBtn) fsBtn.textContent = "⛶";
    }
});

v.ontimeupdate = () => {
    let d = v.duration;
    const seekEl = document.getElementById("seek");
    const timeEl = document.getElementById("time");
    if (Number.isFinite(d) && d > 0 && seekEl) seekEl.value = (v.currentTime / d) * 1000;
    if (timeEl) timeEl.textContent = fmt(v.currentTime) + " / " + fmt(d);

    if (typeof state !== "undefined" && state.activeKey && v.currentTime > 2) {
        localStorage.setItem("apnipadhai_vid_progress_" + state.activeKey, v.currentTime);
    }
};

const seekEl = document.getElementById("seek");
if (seekEl) seekEl.oninput = e => {
    if (Number.isFinite(v.duration)) v.currentTime = (e.target.value / 1000) * v.duration;
};
