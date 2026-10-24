import * as fs from "node:fs/promises";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chromium } from "playwright";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { KokoroTTS } from "kokoro-js";
import { uploadShortToYouTube } from "./auto-upload-yt";

const execFileAsync = promisify(execFile);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

function getFfmpegPath(): string {
  if (!ffmpegPath) throw new Error("Missing ffmpeg-static binary");
  return ffmpegPath;
}

const DEFAULT_VOICE_ID = (process.env.MPT_VOICE_NAME || "af_bella") as any;
const DEFAULT_VOICE_SPEED = Number(process.env.MPT_VOICE_SPEED || 1.15);
const INTRO_EASE_SEC = 0.35;

// ============================================================================
// 0. HUMAN-FRIENDLY ANSI TERMINAL LOGGER (STRICT NO-EMOJI)
// ============================================================================

const C = { reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m", cyan: "\x1b[36m", green: "\x1b[32m", yellow: "\x1b[33m", blue: "\x1b[34m", red: "\x1b[31m" };

const log = {
  banner: (title: string) => console.log(`\n${C.cyan}${C.bold}=== [SYSTEM] ${title} ===${C.reset}`),
  step: (n: number, t: number, title: string) => console.log(`\n${C.blue}${C.bold}[Step ${n}/${t}]${C.reset} ${C.bold}${title}${C.reset}`),
  info: (msg: string) => console.log(`   ${C.dim}├─${C.reset} ${msg}`),
  sub: (msg: string) => console.log(`   ${C.dim}│  ↳${C.reset} ${msg}`),
  ok: (msg: string, sec?: string) => console.log(`   ${C.green}└─ [OK] ${msg}${sec ? ` ${C.dim}(${sec}s)${C.reset}` : ""}${C.reset}`),
  err: (msg: string) => console.error(`\n${C.red}${C.bold}[ERROR]:${C.reset} ${C.red}${msg}${C.reset}\n`),
};

function elapsed(startMs: number): string { return ((Date.now() - startMs) / 1000).toFixed(1); }

export async function callGeminiAPI(payload: any): Promise<any> {
  const modelsToTry = ["gemini-2.5-flash", "gemini-2.0-flash"];
  let lastError = "";
  for (const model of modelsToTry) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (res.ok) return await res.json();
    lastError = `${model} (${res.status}): ${await res.text()}`;
    if (res.status !== 404 && res.status !== 400) break;
  }
  throw new Error(`Gemini API Error: ${lastError}`);
}

// ============================================================================
// 1. THE PILLARS (News & Tech)
// ============================================================================

export type PillarKey = "news" | "skills" | "mcp" | "kb" | "tool" | "poc" | "codebase" | "fun" | "learning";

export const PILLARS: Record<PillarKey, { label: string; query: string; fallbackQuery: string; angle: string }> = {
  news: { label: "Breaking AI & Tech News Radar", query: "trending-tech-news", fallbackQuery: "ai-release", angle: "Deliver a punchy breaking news teardown." },
  skills: { label: "Top 5 Coding Agent Skills & Prompts", query: "claude-code OR cursorrules OR opencode", fallbackQuery: "cursorrules", angle: "Give viewers an exact, copy-pasteable prompt/skill to save time." },
  mcp: { label: "MCP Servers & AI Integrations", query: "mcp-server", fallbackQuery: "mcp", angle: "Show how this MCP server gives agents live tool access." },
  kb: { label: "Local AI & RAG", query: "topic:local-ai", fallbackQuery: "rag", angle: "Replace paid AI subscriptions with free local RAG." },
  tool: { label: "10x Dev Utilities", query: "topic:cli", fallbackQuery: "cli tool", angle: "Start with a bottleneck, show the 1-line command." },
  poc: { label: "Free SaaS Replacements", query: "topic:open-source-alternative", fallbackQuery: "open-source-alternative", angle: "Stop paying $29/mo, use this." },
  codebase: { label: "Self-Hosted Architecture", query: "topic:self-hosted", fallbackQuery: "self-hosted", angle: "Deploy enterprise software locally." },
  fun: { label: "Viral Engineering", query: "topic:creative-coding", fallbackQuery: "webgl", angle: "Visual awe." },
  learning: { label: "AI System Design", query: "topic:system-design", fallbackQuery: "system-design", angle: "Free cheat-sheet to master skills." },
};

// ============================================================================
// 2. DISCOVERY
// ============================================================================

async function pickTrendingTopicOrRepo(pillarKey: PillarKey, explicitRepo?: string) {
  const t0 = Date.now();
  log.step(1, 7, `Scanning Source: [${pillarKey.toUpperCase()}]`);

  const historyPath = path.resolve("./published-repos.json");
  let published: string[] = [];
  try { published = JSON.parse(await fs.readFile(historyPath, "utf-8")); } catch {}

  if (pillarKey === "news" && !explicitRepo) {
    const rssUrl = "https://news.google.com/rss/search?q=OpenAI+OR+Anthropic+OR+Claude+OR+Cursor+OR+GitHub+OR+Developer+AI+when:1d&hl=en-US&gl=US&ceid=US:en";
    const rssText = await fetch(rssUrl).then(r => r.text()).catch(() => "");
    const itemMatches = Array.from(rssText.matchAll(/<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<pubDate>(.*?)<\/pubDate>/g))
      .map(m => ({ title: m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim(), pubDate: m[2] }));
    const unseenNews = itemMatches.find(item => !published.includes(`news:${item.title.slice(0, 50)}`));
    const headline = unseenNews?.title || "New Open-Source AI Updates Accelerate Local Dev Workflows";
    log.ok("Selected live breaking tech news story", elapsed(t0));
    return {
      repo: `news:${headline.slice(0, 50)}`, displayTitle: headline.split(" - ")[0].slice(0, 48), sourceLabel: "Tech Radar Live",
      description: headline, stars: 2026, language: "Breaking News", license: "LIVE", homepage: "",
      readmeExcerpt: `HEADLINE: ${headline}`, historyPath, published,
    };
  }

  const headers: Record<string, string> = { Accept: "application/vnd.github.v3+json", "User-Agent": "AI-Shorts-Factory" };
  if (GITHUB_TOKEN && !GITHUB_TOKEN.includes("YourGitHubToken")) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;

  let targetFullName = explicitRepo ? explicitRepo.replace(/^https?:\/\/github\.com\//i, "").replace(/\/$/, "").split("/").slice(0, 2).join("/") : undefined;

  if (!targetFullName) {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0];
    for (const rawQuery of [`${PILLARS[pillarKey].query} pushed:>${ninetyDaysAgo}`, PILLARS[pillarKey].fallbackQuery]) {
      const searchRes = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(rawQuery)}&sort=stars&order=desc&per_page=20`, { headers });
      if (!searchRes.ok) continue;
      const searchData = await searchRes.json() as any;
      const unseen = (searchData.items || []).find((i: any) => !published.includes(i.full_name));
      if (unseen) { targetFullName = unseen.full_name; break; }
    }
  }

  const [metaRes, readmeRes] = await Promise.all([
    fetch(`https://api.github.com/repos/${targetFullName}`, { headers }),
    fetch(`https://api.github.com/repos/${targetFullName}/readme`, { headers: { ...headers, Accept: "application/vnd.github.v3.raw" } }),
  ]);
  const meta = await metaRes.json() as any;
  const rawReadme = readmeRes.ok ? await readmeRes.text() : "";
  log.ok(`Selected repo ${meta.full_name}`, elapsed(t0));
  return {
    repo: meta.full_name as string, displayTitle: meta.full_name as string,
    sourceLabel: (meta.language || "Open Source") as string, description: (meta.description || "Open-source developer repository") as string,
    stars: (meta.stargazers_count || 0) as number, language: (meta.language || "Open Source") as string, license: (meta.license?.spdx_id || "MIT") as string,
    readmeExcerpt: rawReadme.replace(/<[^>]*>/g, " ").slice(0, 8000), historyPath, published,
  };
}

// ============================================================================
// 3. CREATIVE DIRECTOR + SEO METADATA + OPEN LOOP HOOKS
// ============================================================================

async function generateCreativePlan(repoData: any, pillarKey: PillarKey) {
  const t0 = Date.now();
  log.step(2, 7, "Generating SEO Package, 1:1 Kinetic Script & Developer Artifacts");

  const systemPrompt = `You are a Staff Engineer & Viral Short-Form Director.
OUR GOAL: Kinetic pacing. No static boxes. High utility.
HOOK RULE (CRITICAL): 'scene1Audio' MUST be a declarative metric/shock statement. NO QUESTIONS.
OPEN LOOP RULE: 'scene1Audio' MUST end by opening a curiosity loop referencing a catch or secret revealed in Scene 4 (e.g., "...but there is a massive catch you need to see" or "...and the runtime cost is exactly zero").

Provide an SEO package (youtubeDescription, searchTags) optimized for Google Search.
Pronunciation: Use hyphens for letter-by-letter acronyms in AUDIO ONLY ("C-L-I", "I-D-E"). Do not use slashes.`;

  const data = await callGeminiAPI({
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: `Target: ${repoData.repo} \nDesc: ${repoData.description}\nContext: ${repoData.readmeExcerpt}` }] }],
    generationConfig: {
      temperature: 0.65, responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          youtubeTitle: { type: "STRING" },
          youtubeDescription: { type: "STRING" },
          searchTags: { type: "STRING" },
          thumbnailHeadline: { type: "STRING" },
          thumbnailSubtext: { type: "STRING" },
          hookBannerText: { type: "STRING" },
          scene1Audio: { type: "STRING" },
          scene2Audio: { type: "STRING" },
          scene3Audio: { type: "STRING" },
          scene4Audio: { type: "STRING" },
          visualFlowNodes: { type: "ARRAY", items: { type: "STRING" } },
          legacyDiffLines: { type: "ARRAY", items: { type: "STRING" } },
          modernDiffLines: { type: "ARRAY", items: { type: "STRING" } },
          metricBadge: { type: "STRING" },
          cliCommand: { type: "STRING" },
          highlightedFlag: { type: "STRING" },
          streamingLogs: { type: "ARRAY", items: { type: "STRING" } },
          proTipHeadline: { type: "STRING" },
          proTipSubtext: { type: "STRING" },
          specMatrix: { type: "ARRAY", items: { type: "OBJECT", properties: { label: { type: "STRING" }, val: { type: "STRING" } } } },
          catchPill: { type: "STRING" },
          pinnedComment: { type: "STRING" },
        },
        required: ["youtubeTitle", "youtubeDescription", "searchTags", "hookBannerText", "scene1Audio", "scene2Audio", "scene3Audio", "scene4Audio", "visualFlowNodes", "legacyDiffLines", "modernDiffLines", "metricBadge", "cliCommand", "highlightedFlag", "streamingLogs", "proTipHeadline", "proTipSubtext", "specMatrix", "catchPill", "pinnedComment"],
      },
    },
  });

  const plan = JSON.parse(data.candidates[0].content.parts[0].text);

  const cleanVisual = (str: string) => String(str || "").replace(/\b([A-Z])-([A-Z])-([A-Z])-([A-Z])\b/g, "$1$2$3$4").replace(/\b([A-Z])-([A-Z])-([A-Z])\b/g, "$1$2$3").replace(/\b([A-Z])-([A-Z])\b/g, "$1$2");

  plan.youtubeTitle = cleanVisual(plan.youtubeTitle);
  plan.hookBannerText = cleanVisual(plan.hookBannerText);
  plan.metricBadge = cleanVisual(plan.metricBadge);
  plan.proTipHeadline = cleanVisual(plan.proTipHeadline);
  plan.proTipSubtext = cleanVisual(plan.proTipSubtext);
  plan.catchPill = cleanVisual(plan.catchPill);
  plan.visualFlowNodes = (plan.visualFlowNodes || []).map(cleanVisual);
  plan.streamingLogs = (plan.streamingLogs || []).map(cleanVisual);
  plan.specMatrix = (plan.specMatrix || []).map((s: any) => ({ label: cleanVisual(s.label), val: cleanVisual(s.val) }));

  plan.fullSpokenScript = [plan.scene1Audio, plan.scene2Audio, plan.scene3Audio, plan.scene4Audio].join(" ");
  log.ok("SEO Metadata + 4-Artifact plan ready & sanitized", elapsed(t0));
  return plan;
}

// ============================================================================
// 4. SCENE-LOCKED AUDIO
// ============================================================================

interface WordTiming { word: string; start: number; end: number; sceneIdx: number; }

async function probeDuration(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync(ffprobeStatic.path, ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filePath]);
  return Number.parseFloat(stdout.trim());
}

function cleanDisplayWord(raw: string): string {
  return raw.replace(/\b([A-Z])-([A-Z])-([A-Z])-([A-Z])\b/g, "$1$2$3$4").replace(/\b([A-Z])-([A-Z])-([A-Z])\b/g, "$1$2$3").replace(/\b([A-Z])-([A-Z])\b/g, "$1$2");
}

async function generateSyncedSceneVoiceAndTimings(plan: any, outDir: string, voiceId: any, voiceSpeed: number) {
  const t0 = Date.now();
  log.step(3, 7, "Synthesizing Audio & Sub-Beats");
  const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "q8" });

  const sceneTexts = [plan.scene1Audio, plan.scene2Audio, plan.scene3Audio, plan.scene4Audio].map(s => String(s || "").replace(/\bA\s+I\b/g, "AI").replace(/\s+—\s+/g, ": ").trim());
  const partWavs: string[] = [];
  const sceneDurationsSec: number[] = [];
  const sceneSubBeatMs: number[] = [];
  const words: WordTiming[] = [];
  let cumulativeTime = INTRO_EASE_SEC;

  for (let idx = 0; idx < sceneTexts.length; idx++) {
    const rawWav = path.join(outDir, `scene_audio_${idx + 1}.wav`);
    await (await tts.generate(sceneTexts[idx], { voice: voiceId, speed: voiceSpeed })).save(rawWav);
    const partDuration = await probeDuration(rawWav);
    partWavs.push(rawWav);

    const padding = idx < 3 ? 0.22 : 0.65;
    const offsetLead = idx === 0 ? INTRO_EASE_SEC : 0;
    sceneDurationsSec.push(+(partDuration + offsetLead + padding).toFixed(2));

    const rawWords = sceneTexts[idx].split(/\s+/).filter(w => w.length > 0 && !/^[—–\-:;,.?!]+$/.test(w));
    let cursor = cumulativeTime + 0.05;
    let midTime = partDuration * 0.45;
    for (let wIdx = 0; wIdx < rawWords.length; wIdx++) {
      const slice = ((rawWords[wIdx].length + 2) / rawWords.reduce((a, b) => a + b.length + 2, 0)) * (partDuration - 0.12);
      if (wIdx === Math.floor(rawWords.length * 0.48)) midTime = cursor - cumulativeTime;
      words.push({ word: cleanDisplayWord(rawWords[wIdx]), start: cursor, end: cursor + slice, sceneIdx: idx });
      cursor += slice;
    }
    sceneSubBeatMs.push(Math.round(midTime * 1000));
    cumulativeTime += partDuration;
  }

  const wavConcatList = path.join(outDir, "wav_list.txt");
  await fs.writeFile(wavConcatList, partWavs.map(w => `file '${path.resolve(w).replace(/'/g, "'\\''")}'`).join("\n"), "utf-8");
  const masterWav = path.join(outDir, "voice.wav");
  const delayMs = Math.round(INTRO_EASE_SEC * 1000);
  await execFileAsync(getFfmpegPath(), ["-y", "-f", "concat", "-safe", "0", "-i", wavConcatList, "-af", `adelay=${delayMs}|${delayMs},apad=pad_dur=0.45`, masterWav]);

  log.ok(`Audio ready (${(await probeDuration(masterWav)).toFixed(2)}s)`, elapsed(t0));
  return { masterWav, totalDuration: await probeDuration(masterWav), sceneDurationsSec, sceneSubBeatMs, words };
}

async function generateAndMixBGM(voiceWav: string, totalDuration: number, outDir: string): Promise<string> {
  const bgmWav = path.join(outDir, "bgm.wav");
  const mixedWav = path.join(outDir, "voice_mixed.wav");
  await execFileAsync(getFfmpegPath(), ["-y", "-f", "lavfi", "-i", `aevalsrc=0.035*sin(2*PI*t*432)+0.012*sin(2*PI*t*648):s=44100:d=${totalDuration + 1.5}`, "-af", `afade=t=in:st=0:d=1.2,afade=t=out:st=${(totalDuration - 1.2).toFixed(2)}:d=1.2,volume=0.55`, bgmWav]);
  await execFileAsync(getFfmpegPath(), ["-y", "-i", voiceWav, "-i", bgmWav, "-filter_complex", "[1:a]volume=0.13[bgm];[0:a][bgm]amix=inputs=2:duration=first[out]", "-map", "[out]", "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", mixedWav]);
  return mixedWav;
}

// ============================================================================
// 5. KARAOKE SUBTITLES + IMPACT WORD DOM OVERRIDES
// ============================================================================

function buildKaraokeSubtitles(words: WordTiming[]): string {
  const ASS_HEADER = `[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Pop,Arial Black,84,&H00FFFFFF,&H00FBBF24,&H00000000,&HAA000000,-1,0,0,0,100,100,0.5,0,3,0,6,2,60,60,500,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
  const lines: string[] = [];
  const fmt = (s: number) => `${Math.floor(s/3600)}:${String(Math.floor((s%3600)/60)).padStart(2,"0")}:${String(Math.floor(s%60)).padStart(2,"0")}.${String(Math.floor((s%1)*100)).padStart(2,"0")}`;

  const impactWords = ["KILLED", "STOP", "DEAD", "ZERO", "FREE", "INSANE", "WARNING", "CATCH", "DROPPED", "FASTER", "MASSIVE"];

  for (let base = 0; base < words.length; base += 4) {
    const chunk = words.slice(base, base + 4);
    for (let active = 0; active < chunk.length; active++) {
      const text = chunk.map((w, idx) => {
        if (idx === active) {
          const isImpact = impactWords.some(iw => w.word.toUpperCase().includes(iw));
          const color = isImpact ? "&H000000FF&" : "&H00FBBF24&";
          const scale = isImpact ? "\\fscx125\\fscy125\\frz-3" : "\\fscx112\\fscy112";
          return `{\\c${color}${scale}}${w.word}{\\frz0\\c&H00FFFFFF&\\fscx100\\fscy100}`;
        }
        if (idx < active) return `{\\alpha&H66&}${w.word}{\\alpha&H00&}`;
        return w.word;
      }).join(" ");
      lines.push(`Dialogue: 0,${fmt(chunk[active].start)},${fmt(active < chunk.length - 1 ? chunk[active + 1].start : chunk[active].end)},Pop,,0,0,0,,${text}`);
    }
  }
  return ASS_HEADER + lines.join("\n") + "\n";
}

// ============================================================================
// 6. RENDER SCENES (Infinite Zoom & Clean Typographic UIs)
// ============================================================================

const TOP_5_DOCK = `<div style="display:flex;gap:10px;background:rgba(15,23,42,0.9);padding:16px 20px;border-radius:20px;border:2px solid #334155;"><span style="font-weight:900;color:#94a3b8;font-size:20px">WORKS WITH:</span><span style="background:#1e293b;border:1px solid #38bdf8;padding:4px 12px;border-radius:99px;font-weight:800;color:#e0f2fe;font-size:20px">VS Code</span><span style="background:#1e293b;border:1px solid #4ade80;padding:4px 12px;border-radius:99px;font-weight:800;color:#dcfce7;font-size:20px">OpenCode</span><span style="background:#1e293b;border:1px solid #fbbf24;padding:4px 12px;border-radius:99px;font-weight:800;color:#fef3c7;font-size:20px">Claude</span></div>`;

const INFINITE_ZOOM_CSS = `
  transform-origin: center center;
  animation: infiniteZoom 15s linear forwards;
}
@keyframes infiniteZoom {
  0% { transform: scale(1.0); }
  100% { transform: scale(1.10); }
`;

async function recordFullBleedScene(browser: any, outDir: string, name: string, targetSec: number, setupFn: (p: any) => Promise<void>) {
  const tmpDir = path.join(outDir, `tmp_${name}`);
  await fs.mkdir(tmpDir, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1080, height: 1920 }, recordVideo: { dir: tmpDir, size: { width: 1080, height: 1920 } } });
  const page = await context.newPage();
  const t0 = Date.now();
  try {
    await setupFn(page);
    await page.waitForTimeout(250);
    await page.waitForTimeout(Math.ceil((targetSec + 1.0) * 1000));
    const rawWebm = await page.video()!.path();
    await context.close();
    return { rawWebm, tmpDir, name, targetSec, captureDurationSec: (Date.now() - t0) / 1000 };
  } catch (error) {
    await context.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
    throw error;
  }
}

async function synthesizeThumbnailAndScenes(repoData: any, plan: any, outDir: string, sceneDurationsSec: number[], sceneSubBeatMs: number[]) {
  const t0 = Date.now();
  log.step(4, 7, "Rendering KINETIC Scenes (135px Safe Zone & Infinite Zoom)");
  const browser = await chromium.launch({ channel: "chrome", headless: true });

  const recordings: Awaited<ReturnType<typeof recordFullBleedScene>>[] = [];
  try {
    recordings.push(await recordFullBleedScene(browser, outDir, "01_kinetic_hook", sceneDurationsSec[0], async (page) => {
      await page.setContent(`<!DOCTYPE html><html><head><style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { width: 1080px; height: 1920px; background: radial-gradient(circle at 50% 30%, #0f172a 0%, #020617 100%); color: #f8fafc; font-family: system-ui; padding: 120px 135px 560px 56px; display: flex; flex-direction: column; justify-content: center; align-items: center; ${INFINITE_ZOOM_CSS} }
        .hero { font-size: 80px; font-weight: 900; color: #38bdf8; text-align: center; line-height: 1.1; margin-bottom: 40px; transform: scale(0.9); opacity: 0; animation: popIn 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }
        .stars { font-size: 50px; font-weight: 900; color: #fbbf24; background: rgba(251,191,36,0.1); padding: 12px 30px; border-radius: 99px; margin-bottom: 60px; }
        .nodes { display: flex; flex-direction: column; gap: 20px; width: 100%; }
        .node { background: #1e293b; border: 3px solid #334155; padding: 30px; border-radius: 20px; font-size: 36px; font-weight: 800; opacity: 0; transform: translateY(20px); }
        @keyframes popIn { to { transform: scale(1); opacity: 1; } }
      </style></head><body>
        <div class="hero">${repoData.displayTitle.toUpperCase()}</div>
        <div class="stars" id="counter">* 0</div>
        <div class="nodes">
          ${(plan.visualFlowNodes || []).map((n:string, i:number) => `<div class="node" id="n${i}">${n}</div>`).join("")}
        </div>
        <script>
          let c = 0, el = document.getElementById('counter');
          let target = ${repoData.stars};
          let int = setInterval(() => { c += target/20; if(c>=target){c=target; clearInterval(int);} el.innerText = '* ' + Math.floor(c).toLocaleString(); }, 30);
          setTimeout(()=>document.getElementById('n0').style.cssText='opacity:1;transform:translateY(0);border-color:#38bdf8;transition:all 0.4s', 800);
          setTimeout(()=>document.getElementById('n1').style.cssText='opacity:1;transform:translateY(0);border-color:#4ade80;transition:all 0.4s', 1600);
        </script>
      </body></html>`, { waitUntil: "domcontentloaded" });
    }));

    recordings.push(await recordFullBleedScene(browser, outDir, "02_diff", sceneDurationsSec[1], async (page) => {
      await page.setContent(`<!DOCTYPE html><html><head><style>
        body { width: 1080px; height: 1920px; background: #0f172a; padding: 120px 135px 560px 56px; font-family: system-ui; display: flex; flex-direction: column; justify-content: center; ${INFINITE_ZOOM_CSS} }
        .win { background: #0d1117; border: 3px solid #30363d; border-radius: 28px; flex: 1; display: flex; flex-direction: column; }
        .pane-bad { background: rgba(127,29,29,0.18); border-left: 10px solid #ef4444; padding: 36px; transition: all 0.4s; flex:1; }
        .pane-good { background: rgba(20,83,45,0.22); border-left: 10px solid #22c55e; padding: 36px; opacity: 0.2; transition: all 0.4s; flex:1; }
        .code { font-family: monospace; font-size: 32px; font-weight: 800; padding: 16px; background: #090d16; color: #f8fafc; margin-bottom: 12px; border-radius: 12px; }
      </style></head><body>
        <div class="win">
          <div id="bad" class="pane-bad"><div style="color:#fca5a5;font-size:28px;font-weight:900;margin-bottom:20px">[X] BEFORE</div><div class="code">${(plan.legacyDiffLines||[])[0]||'manual_setup'}</div></div>
          <div id="good" class="pane-good"><div style="color:#4ade80;font-size:28px;font-weight:900;margin-bottom:20px">[OK] AFTER</div><div class="code" style="color:#4ade80">${(plan.modernDiffLines||[])[0]||'npx auto_setup'}</div></div>
        </div>
        <script>setTimeout(()=>{document.getElementById('bad').style.opacity='0.2'; document.getElementById('good').style.opacity='1';}, ${sceneSubBeatMs[1]||1000});</script>
      </body></html>`, { waitUntil: "domcontentloaded" });
    }));

    recordings.push(await recordFullBleedScene(browser, outDir, "03_tui", sceneDurationsSec[2], async (page) => {
      await page.setContent(`<!DOCTYPE html><html><head><style>
        body { width: 1080px; height: 1920px; background: #0f172a; padding: 120px 135px 560px 56px; font-family: system-ui; display: flex; flex-direction: column; justify-content: center; gap: 40px; ${INFINITE_ZOOM_CSS} }
        .term { background: #090d16; border: 3px solid #38bdf8; border-radius: 28px; padding: 40px; font-family: monospace; font-size: 36px; color: #f8fafc; font-weight: 800; min-height: 400px; }
        .tip { background: linear-gradient(135deg, rgba(56,189,248,0.2), rgba(34,197,94,0.2)); border: 4px solid #38bdf8; border-radius: 28px; padding: 40px; opacity: 0; transform: translateY(30px); transition: all 0.4s; }
      </style></head><body>
        <div class="term"><div style="color:#38bdf8;margin-bottom:30px">> ${plan.cliCommand}</div><div id="l1" style="color:#4ade80;opacity:0">[OK] Execution started...</div><div id="l2" style="color:#4ade80;opacity:0;margin-top:20px">[OK] Ready in 0.8s</div></div>
        <div id="tip" class="tip"><div style="color:#fbbf24;font-size:28px;font-weight:900;margin-bottom:10px">[!] PRO-TIP</div><div style="font-size:42px;font-weight:900;color:#fff">${plan.proTipHeadline}</div></div>
        <script>setTimeout(()=>document.getElementById('l1').style.opacity='1', 400); setTimeout(()=>document.getElementById('l2').style.opacity='1', 900); setTimeout(()=>{document.getElementById('tip').style.opacity='1'; document.getElementById('tip').style.transform='translateY(0)';}, ${sceneSubBeatMs[2]||1500});</script>
      </body></html>`, { waitUntil: "domcontentloaded" });
    }));

    recordings.push(await recordFullBleedScene(browser, outDir, "04_spec", sceneDurationsSec[3], async (page) => {
      await page.setContent(`<!DOCTYPE html><html><head><style>
        body { width: 1080px; height: 1920px; background: #0f172a; padding: 120px 135px 560px 56px; font-family: system-ui; display: flex; flex-direction: column; justify-content: center; gap: 30px; ${INFINITE_ZOOM_CSS} }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
        .tile { background: #1e293b; border: 3px solid #38bdf8; border-radius: 24px; padding: 40px 30px; }
        .cta { background: linear-gradient(90deg, #2563eb, #0284c7); padding: 40px; border-radius: 28px; color: #fff; font-size: 38px; font-weight: 900; text-align: center; margin-top: 40px; }
      </style></head><body>
        <div class="grid">${(plan.specMatrix||[]).map((s:any)=>`<div class="tile"><div style="color:#94a3b8;font-size:24px;font-weight:900;margin-bottom:10px">${s.label}</div><div style="color:#4ade80;font-size:42px;font-weight:900">${s.val}</div></div>`).join("")}</div>
        <div style="background:rgba(120,53,15,0.3);border:3px solid #fbbf24;padding:40px;border-radius:26px;"><div style="color:#fbbf24;font-size:28px;font-weight:900;margin-bottom:10px">[WARNING] CATCH</div><div style="color:#fff;font-size:38px;font-weight:800">${plan.catchPill}</div></div>
        <div class="cta">-> Link in Pinned Comment!</div>
      </body></html>`, { waitUntil: "domcontentloaded" });
    }));

    log.ok("4 Kinetic Scenes rendered safely with Infinite Zoom", elapsed(t0));
  } finally { await browser.close(); }

  const clips: string[] = [];
  for (const recording of recordings) {
    const mp4 = path.join(outDir, `${recording.name}.mp4`);
    try {
      await execFileAsync(getFfmpegPath(), ["-y", "-ss", String(Math.max(0, recording.captureDurationSec - recording.targetSec - 1).toFixed(2)), "-i", recording.rawWebm, "-t", String(recording.targetSec.toFixed(2)), "-vf", "scale=1080:1920", "-c:v", "libx264", "-preset", "ultrafast", "-threads", "2", mp4]);
      clips.push(mp4);
    } finally {
      await fs.rm(recording.tmpDir, { recursive: true, force: true });
    }
  }
  return { thumbnailPath: path.join(outDir, "thumbnail.png"), clips };
}

// ============================================================================
// 7. ASSEMBLE
// ============================================================================

async function assembleFinalShort(clips: string[], masterWav: string, words: WordTiming[], totalDur: number, sceneDurs: number[], outDir: string) {
  const t0 = Date.now();
  log.step(5, 7, "Burning Karaoke Subtitles & xfade Stitch");
  const assPath = path.join(outDir, "captions.ass");
  await fs.writeFile(assPath, buildKaraokeSubtitles(words), "utf-8");

  const xfadeParts = clips.slice(0,-1).map((_, i) => `${i===0?"[0:v]":`[vx${i-1}]`}[${i+1}:v]xfade=transition=fade:duration=0.22:offset=${sceneDurs.slice(0,i+1).reduce((a,b)=>a+b,0) - (i+1)*0.22}${i<clips.length-2?`[vx${i}]`:"[vjoined]"}`);
  const finalMp4 = path.join(outDir, "final_short.mp4");

  await execFileAsync(getFfmpegPath(), ["-y", ...clips.flatMap(c=>["-i",c]), "-i", masterWav, "-filter_complex", `${xfadeParts.join(";")};[vjoined]ass='${path.resolve(assPath).replace(/\\/g,"/").replace(/:/g,"\\:")}'[vout]`, "-map", "[vout]", "-map", `${clips.length}:a`, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-threads", "2", "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-ac", "2", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-t", String((totalDur+0.15).toFixed(2)), "-pix_fmt", "yuv420p", finalMp4]);
  log.ok(`Rendered: ${finalMp4}`, elapsed(t0));
  return finalMp4;
}

// ============================================================================
// MASTER ENTRYPOINT
// ============================================================================

async function main() {
  const jobStart = Date.now();
  log.banner("EXPRESSIVE AI SHORTS FACTORY (KINETIC UI + NO EMOJIS + OPEN LOOP)");
  if (!GEMINI_API_KEY) throw new Error("Missing GEMINI_API_KEY");

  const rawArgs = process.argv.slice(2);
  const pillarKey: PillarKey = (rawArgs.find(a => !a.startsWith("--")) as PillarKey) || "news";

  const repoData = await pickTrendingTopicOrRepo(pillarKey);
  const outDir = path.resolve("./output", `${Date.now()}_${repoData.repo.replace(/[^a-zA-Z0-9]/g,"_").slice(0,40)}`);
  await fs.mkdir(outDir, { recursive: true });

  const plan = await generateCreativePlan(repoData, pillarKey);
  const { masterWav, totalDuration, sceneDurationsSec, sceneSubBeatMs, words } = await generateSyncedSceneVoiceAndTimings(plan, outDir, DEFAULT_VOICE_ID, DEFAULT_VOICE_SPEED);
  const mixedWav = await generateAndMixBGM(masterWav, totalDuration, outDir);
  const { thumbnailPath, clips } = await synthesizeThumbnailAndScenes(repoData, plan, outDir, sceneDurationsSec, sceneSubBeatMs);
  const finalMp4 = await assembleFinalShort(clips, mixedWav, words, totalDuration, sceneDurationsSec, outDir);

  const metadataPath = path.join(outDir, "metadata.json");
  const resultPayload = {
    status: "APPROVED", pillar: pillarKey, repo: repoData.repo, youtubeTitle: plan.youtubeTitle,
    youtubeDescription: plan.youtubeDescription, searchTags: plan.searchTags, videoPath: finalMp4, durationSeconds: Math.round(totalDuration),
  };
  await fs.writeFile(metadataPath, JSON.stringify(resultPayload, null, 2), "utf-8");

  if (rawArgs.includes("--auto-upload")) await uploadShortToYouTube(metadataPath);
  console.log(`\n${C.green}${C.bold}[OK] COMPLETE in ${elapsed(jobStart)}s! Video: ${finalMp4}${C.reset}`);
  console.log(JSON.stringify(resultPayload));
}

if (process.argv[1]?.endsWith("factory-worker.ts")) main().catch(e => { log.err(e.message); process.exitCode = 1; });