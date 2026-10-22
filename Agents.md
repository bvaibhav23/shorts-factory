# AI Agent Instructions for `shorts-factory`

1. **Pure Node.js Stack:** Never introduce Python or MoviePy dependencies. Use `playwright` (`channel: "chrome"`), `kokoro-js`, `ffmpeg-static`, and `ffprobe-static`.
2. **Hardware Constraints:** Target machine is a Windows 64-bit laptop with 8 GB RAM. Always close the Playwright browser (`await browser.close()`) before running FFmpeg, and keep `-threads 2` on FFmpeg encodes.
3. **Video Geometry:** All Playwright contexts and `recordVideo` sizes MUST remain `1080x1920` (`deviceScaleFactor: 1`).
4. **Audio & Subtitles:**
   - Never use `silenceremove` on TTS output (it clips initial consonants).
   - Keep the `350ms` (`INTRO_EASE_SEC`) `adelay` pad at the start of `voice.wav` and `450ms` `apad` at the end.
   - `.ASS` subtitle colors use BGR hex format (`&H00F8BD38&` for Sky Cyan `#38BDF8`).
   - Keep `console.log(JSON.stringify(resultPayload))` as the final line of `stdout` in `factory-worker.ts` so `n8n` can parse the output.
5. **Windows Exit Safety:** Always use `process.exitCode = 1` on error instead of `process.exit(1)`.