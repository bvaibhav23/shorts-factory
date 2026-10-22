import { google } from "googleapis";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { getAuthenticatedClient } from "./auto-upload-yt";
import { callGeminiAPI } from "./factory-worker";

const CONTROL_FILE = path.resolve("./output/channel-control-rules.json");

export async function syncAndOptimizeChannel() {
  const auth = await getAuthenticatedClient();
  const youtube = google.youtube({ version: "v3", auth });

  const outputDir = path.resolve("./output");
  await fs.mkdir(outputDir, { recursive: true });
  const entries = await fs.readdir(outputDir, { withFileTypes: true });
  const localRuns: any[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      try {
        const meta = JSON.parse(
          await fs.readFile(path.join(outputDir, entry.name, "metadata.json"), "utf-8")
        );
        localRuns.push({ folder: entry.name, ...meta });
      } catch {}
    }
  }

  const channelRes = await youtube.channels.list({ part: ["contentDetails"], mine: true });
  const uploadsPlaylistId =
    channelRes.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  const performanceLedger: any[] = [];

  if (uploadsPlaylistId) {
    const playlistItems = await youtube.playlistItems.list({
      part: ["contentDetails", "snippet"],
      playlistId: uploadsPlaylistId,
      maxResults: 20,
    });

    const videoIds = (playlistItems.data.items || [])
      .map((item) => item.contentDetails?.videoId)
      .filter(Boolean) as string[];

    if (videoIds.length > 0) {
      const statsRes = await youtube.videos.list({
        part: ["snippet", "statistics"],
        id: videoIds,
      });

      for (const v of statsRes.data.items || []) {
        performanceLedger.push({
          videoId: v.id,
          title: v.snippet?.title,
          publishedAt: v.snippet?.publishedAt,
          views: Number(v.statistics?.viewCount || 0),
          likes: Number(v.statistics?.likeCount || 0),
          comments: Number(v.statistics?.commentCount || 0),
        });
      }
    }
  }

  const prompt = `You are the Autonomous Growth & Viewer-Value Controller for YouTube channel @bvaibhav23.
Apply the 'analytics-learning' and 'learning-retrospective' skills from skills.rest:
1. Live YouTube Channel Metrics: ${JSON.stringify(performanceLedger, null, 2)}
2. Local Episode Metadata: ${JSON.stringify(localRuns.slice(-10), null, 2)}
3. Human Audit Baseline:
   - Video 1 (mattpocock/skills) got 38 seed views; 1.06x af_heart felt too slow/robotic.
   - Upgraded baseline is 'af_bella' at 1.15x speed with Problem-First Hooks, Before/After diffs, and 1% Engineer Pro-Tips.

Return strict JSON control rules for factory-worker.ts:
{
  "winningPillar": "skills" | "mcp" | "kb" | "tool" | "poc" | "codebase" | "fun" | "learning",
  "recommendedTtsVoice": "af_bella",
  "recommendedTtsSpeed": 1.15,
  "mandatoryScriptRules": [
    "Open with a 6-to-10 word confrontational developer pain point question ending in ? or !",
    "Deliver a clear Before vs. After comparison and 1 specific README Pro-Tip",
    "Keep sentences under 14 words so 1.15x prosody sounds punchy and natural"
  ],
  "diagnosticSummary": "string"
}`;

  const data = await callGeminiAPI({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json" },
  });

  const controlRules = JSON.parse(data.candidates[0].content.parts[0].text);
  await fs.writeFile(
    CONTROL_FILE,
    JSON.stringify({ updatedAt: new Date().toISOString(), performanceLedger, controlRules }, null, 2),
    "utf-8"
  );

  console.log(`\n📊 Analytics Synced & Control Rules Updated -> ${CONTROL_FILE}:`);
  console.log(JSON.stringify(controlRules, null, 2));
}

if (process.argv[1]?.endsWith("analytics-controller.ts")) {
  syncAndOptimizeChannel().catch((err) => {
    console.error("❌ Analytics Controller Error:", err.message);
    process.exitCode = 1;
  });
}