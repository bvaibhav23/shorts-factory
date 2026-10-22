import { chromium } from "playwright";
import * as fs from "node:fs/promises";
import * as path from "node:path";

async function main() {
  const outDir = path.resolve("./branding");
  await fs.mkdir(outDir, { recursive: true });

  console.log("🎨 Launching Chrome to render YouTube Channel Branding Pack...");
  const browser = await chromium.launch({ channel: "chrome", headless: true });

  try {
    // ========================================================================
    // 1. CHANNEL BANNER (2560 x 1440 px with strict 1546 x 423 Mobile Safe Zone)
    // ========================================================================
    const bannerPage = await browser.newPage({
      viewport: { width: 2560, height: 1440 },
      deviceScaleFactor: 1,
    });

    await bannerPage.setContent(
      `<!DOCTYPE html><html><head><style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          width: 2560px; height: 1440px; overflow: hidden;
          background: radial-gradient(circle at 50% 50%, #1e293b 0%, #070a12 75%);
          font-family: 'Segoe UI', system-ui, sans-serif; color: #f8fafc;
          display: flex; align-items: center; justify-content: center;
          position: relative;
        }
        /* Subtle background grid for TV / Desktop outer areas */
        .bg-grid {
          position: absolute; inset: 0;
          background-image: 
            linear-gradient(to right, rgba(56, 189, 248, 0.06) 2px, transparent 2px),
            linear-gradient(to bottom, rgba(56, 189, 248, 0.06) 2px, transparent 2px);
          background-size: 80px 80px;
        }
        .glow-orb {
          position: absolute; width: 1200px; height: 500px;
          background: radial-gradient(circle, rgba(56, 189, 248, 0.22) 0%, transparent 70%);
          filter: blur(40px);
        }
        /* STRICT YOUTUBE SAFE ZONE (1546 x 423 px) - Visible on ALL devices (Mobile, Desktop, TV) */
        .safe-zone {
          width: 1500px; height: 390px;
          background: rgba(15, 23, 42, 0.92);
          border: 4px solid #38bdf8;
          border-radius: 36px;
          padding: 36px 56px;
          display: flex; align-items: center; justify-content: space-between;
          box-shadow: 0 30px 80px rgba(0, 0, 0, 0.85), 0 0 40px rgba(56, 189, 248, 0.2);
          z-index: 10;
        }
        .left-col { display: flex; flex-direction: column; gap: 14px; }
        .top-tag {
          display: inline-flex; align-items: center; gap: 12px;
          background: linear-gradient(90deg, #ef4444, #f97316);
          color: #fff; font-size: 22px; font-weight: 900;
          padding: 8px 22px; border-radius: 99px;
          letter-spacing: 2px; text-transform: uppercase;
          align-self: flex-start;
        }
        .title {
          font-size: 62px; font-weight: 900; letter-spacing: -1px;
          color: #ffffff; line-height: 1.08;
        }
        .title span { color: #38bdf8; }
        .subtitle {
          font-size: 27px; font-weight: 700; color: #cbd5e1;
          font-family: 'Consolas', monospace;
        }
        .pills { display: flex; gap: 14px; margin-top: 6px; }
        .pill {
          background: #1e293b; border: 2px solid #334155; color: #38bdf8;
          font-size: 20px; font-weight: 800; padding: 8px 18px; border-radius: 12px;
        }
        .right-card {
          background: #090d16; border: 3px solid #334155; border-radius: 24px;
          padding: 26px 34px; width: 430px;
          font-family: 'Consolas', monospace; font-size: 22px; line-height: 1.65;
          box-shadow: inset 0 0 20px rgba(0,0,0,0.8);
        }
        .dots { display: flex; gap: 10px; margin-bottom: 14px; }
        .dot { width: 14px; height: 14px; border-radius: 50%; }
        .c-cyan { color: #38bdf8; font-weight: bold; }
        .c-green { color: #4ade80; font-weight: bold; }
        .c-yellow { color: #fbbf24; font-weight: bold; }
      </style></head><body>
        <div class="bg-grid"></div>
        <div class="glow-orb"></div>
        <div class="safe-zone">
          <div class="left-col">
            <div class="top-tag">⚡ 3X DAILY 25-SECOND TECH DROPS</div>
            <div class="title">VAIBHAV <span>| AI & OPEN-SOURCE</span></div>
            <div class="subtitle">&gt;_ Agent Skills • MCP Servers • CLI Tools • Codebases</div>
            <div class="pills">
              <span class="pill">SKILL.md</span>
              <span class="pill">Claude Code</span>
              <span class="pill">Local RAG</span>
              <span class="pill">SaaS Starters</span>
            </div>
          </div>
          <div class="right-card">
            <div class="dots">
              <span class="dot" style="background:#ef4444"></span>
              <span class="dot" style="background:#eab308"></span>
              <span class="dot" style="background:#22c55e"></span>
            </div>
            <div class="c-cyan">$ npx skills add @bvaibhav23</div>
            <div class="c-green">✓ Architecture Flow</div>
            <div class="c-green">✓ 10s CLI Quickstart</div>
            <div class="c-yellow">⚠ 1 Honest Catch</div>
          </div>
        </div>
      </body></html>`
    );

    const bannerPath = path.join(outDir, "1_channel_banner_2560x1440.png");
    await bannerPage.screenshot({ path: bannerPath, type: "png" });
    await bannerPage.close();
    console.log(`✅ Banner saved:    ${bannerPath}`);

    // ========================================================================
    // 2. PROFILE PICTURE / AVATAR (800 x 800 px)
    // ========================================================================
    const avatarPage = await browser.newPage({
      viewport: { width: 800, height: 800 },
      deviceScaleFactor: 1,
    });

    await avatarPage.setContent(
      `<!DOCTYPE html><html><head><style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          width: 800px; height: 800px; overflow: hidden;
          background: radial-gradient(circle at 50% 30%, #1e3a8a 0%, #070a12 75%);
          font-family: 'Segoe UI', system-ui, sans-serif;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          border: 24px solid #38bdf8; border-radius: 50%;
        }
        .badge {
          background: #0f172a; border: 6px solid #334155; border-radius: 48px;
          width: 580px; height: 520px;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          box-shadow: 0 30px 70px rgba(0,0,0,0.85);
          position: relative;
        }
        .dots {
          position: absolute; top: 34px; left: 42px;
          display: flex; gap: 14px;
        }
        .dot { width: 20px; height: 20px; border-radius: 50%; }
        .monogram {
          font-family: 'Consolas', monospace; font-size: 210px; font-weight: 900;
          color: #38bdf8; letter-spacing: -8px; line-height: 1;
          margin-top: 25px;
          text-shadow: 0 10px 30px rgba(56, 189, 248, 0.45);
        }
        .monogram span { color: #4ade80; }
        .sub {
          margin-top: 18px; background: linear-gradient(90deg, #2563eb, #0284c7);
          color: #fff; font-size: 36px; font-weight: 900;
          padding: 10px 36px; border-radius: 99px; letter-spacing: 3px;
          text-transform: uppercase;
        }
      </style></head><body>
        <div class="badge">
          <div class="dots">
            <span class="dot" style="background:#ef4444"></span>
            <span class="dot" style="background:#eab308"></span>
            <span class="dot" style="background:#22c55e"></span>
          </div>
          <div class="monogram"><span>&gt;</span>VB</div>
          <div class="sub">AI RADAR</div>
        </div>
      </body></html>`
    );

    const avatarPath = path.join(outDir, "2_profile_picture_800x800.png");
    await avatarPage.screenshot({ path: avatarPath, type: "png" });
    await avatarPage.close();
    console.log(`✅ Avatar saved:    ${avatarPath}`);

    // ========================================================================
    // 3. VIDEO WATERMARK (150 x 150 px)
    // ========================================================================
    const watermarkPage = await browser.newPage({
      viewport: { width: 150, height: 150 },
      deviceScaleFactor: 1,
    });

    await watermarkPage.setContent(
      `<!DOCTYPE html><html><head><style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          width: 150px; height: 150px; overflow: hidden;
          background: #090d16;
          border: 6px solid #38bdf8; border-radius: 28px;
          font-family: 'Segoe UI', system-ui, sans-serif;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
        }
        .cmd {
          font-family: 'Consolas', monospace; font-size: 46px; font-weight: 900;
          color: #4ade80; line-height: 1; margin-bottom: 6px;
        }
        .sub {
          background: #ef4444; color: #ffffff;
          font-size: 20px; font-weight: 900; padding: 4px 12px;
          border-radius: 8px; letter-spacing: 1px;
        }
      </style></head><body>
        <div class="cmd">&gt;_</div>
        <div class="sub">SUB +</div>
      </body></html>`
    );

    const watermarkPath = path.join(outDir, "3_video_watermark_150x150.png");
    await watermarkPage.screenshot({ path: watermarkPath, type: "png" });
    await watermarkPage.close();
    console.log(`✅ Watermark saved: ${watermarkPath}`);

    console.log(`\n🎉 All 3 YouTube branding images are ready inside: ${outDir}`);
  } finally {
    await browser.close();
  }
}

main();