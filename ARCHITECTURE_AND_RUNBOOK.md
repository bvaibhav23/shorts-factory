# ⚡ AI GitHub Shorts Factory — Architecture & Runbook

## 1. System Overview
A 100% Node.js/TypeScript autonomous pipeline that discovers trending open-source GitHub repositories across 8 content pillars, writes expressive scripts, records 4 full-bleed `1080x1920` scenes via system Google Chrome, synthesizes voiceovers and synced 2-word pop-in subtitles, verifies quality via Gemini Multimodal QA, and auto-publishes to YouTube Studio.

### Core Tech Stack (Zero-Python)
- **Orchestrator:** Self-hosted `n8n`
- **Creative Director & QA Critic:** `gemini-3.8-flash` (with automatic fallback to `gemini-2.5-flash`)
- **Visual Synthesizer:** `playwright` running system Google Chrome (`channel: "chrome"`) at native `1080x1920` (`deviceScaleFactor: 1`)
- **Voice Engine:** `kokoro-js` (`onnx-community/Kokoro-82M-v1.0-ONNX`, quantized `q8`, voice: `af_heart` @ `1.06x` speed)
- **Video Renderer:** `ffmpeg-static` & `ffprobe-static` (`-preset veryfast -crf 20 -threads 2`)

---

## 2. The 8 Content Pillars (Auto-Rotating 3x/Day)
| Pillar Key | Category Focus | Target Audience |
| :--- | :--- | :--- |
| `skills` | Agent Skills (`SKILL.md`), `.cursorrules`, Claude Code plugins | AI Builders & Claude/Cursor Devs |
| `mcp` | Model Context Protocol (`mcp-server`) integrations | Local AI Tool Builders |
| `kb` | Knowledge Bases, Local RAG, vector search | RAG & Private Data Engineers |
| `tool` | Fast Dev CLI, TUI & terminal productivity utilities | Working Software Engineers |
| `poc` | Weekend MVP starters, SaaS boilerplates | Indie Hackers & Founders |
| `codebase` | Production open-source SaaS alternatives & architecture | Enterprise & Senior Devs |
| `fun` | Creative coding, WebGL, terminal games | Tech Enthusiasts |
| `learning` | System design, AI concepts, roadmaps | Students & Career Switchers |

---

## 3. NPM Runbook Shortcuts (CLI Cheat Sheet)
- Generate Short (Auto-Pillar Rotation): `npm run short`
- Generate Short for Specific Pillar: `npm run short:skills` (or `mcp`, `kb`, `tool`, `poc`, `codebase`, `fun`, `learning`)
- Generate Specific Repo: `npm run short -- skills owner/repo`
- One-Time YouTube Login: `npm run yt:login`
- Upload Rendered Short: `npm run yt:upload "./output/<folder>/metadata.json"`

---

## 4. Key Engineering Guardrails
1. **No Grey Bars / Cropping:** Playwright `viewport` and `recordVideo.size` are both locked to `1080x1920` (`deviceScaleFactor: 1`).
2. **Zero Startup Word Clipping:** Uses `350ms` (`INTRO_EASE_SEC`) `adelay` pad at the start of `voice.wav` and `450ms` `apad` tail pad.
3. **Human Vocal Prosody:** Scripts are rendered in 2-sentence prosody blocks using rhetorical questions (`?`) and commas (`,`). Acronyms like `AI` and `API` remain single words, while letter-by-letter acronyms use hyphens (`T-D-D`, `C-L-I`, `M-C-P`) for TTS and are stripped to `TDD`, `CLI`, `MCP` in `.ASS` captions.
4. **Zero Scene 2 Drops:** Scene 2 (`02_readme_explorer`) renders a local dark-mode GitHub README UI from fetched markdown rather than waiting on live `github.com` network loads.
5. **No Premature Video Cutoff:** Added `0.8s` scene buffer + `-stream_loop -1` on the FFmpeg concat input so video never ends before the final word.
6. **Smart QA Deduplication:** Repos are only added to `published-repos.json` when Gemini Multimodal QA returns `approved: true`.
7. **Windows Clean Exit:** Uses `process.exitCode = 1` instead of `process.exit(1)` to avoid Windows `libuv` (`UV_HANDLE_CLOSING`) crashes.