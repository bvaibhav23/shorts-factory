import { google } from "googleapis";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { getAuthenticatedClient } from "./auto-upload-yt";
import { callGeminiAPI } from "./factory-worker";

const DOMAIN_QUERIES = [
  "Claude Code skills github",
  "MCP server tutorial open source",
  "Cursor AI rules workflow github",
  "open source AI coding agent github",
  "local RAG LLM github repo",
  "developer CLI tool github",
];

export async function findAndCloneTrendingIdea(customQuery?: string) {
  const auth = await getAuthenticatedClient();
  const youtube = google.youtube({ version: "v3", auth });

  const query = customQuery || DOMAIN_QUERIES[Math.floor(Math.random() * DOMAIN_QUERIES.length)];
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  console.log(`\n📡 Scanning YouTube Trends (Shorts & Long-form) for: "${query}"...`);

  const searchRes = await youtube.search.list({
    part: ["snippet"],
    q: query,
    type: ["video"],
    order: "viewCount",
    publishedAfter: sevenDaysAgo,
    maxResults: 8,
  });

  const videoIds = (searchRes.data.items || [])
    .map((i) => i.id?.videoId)
    .filter(Boolean) as string[];

  if (!videoIds.length) {
    throw new Error("No recent trending videos found for query.");
  }

  const statsRes = await youtube.videos.list({
    part: ["snippet", "statistics", "contentDetails"],
    id: videoIds,
  });

  const candidates = (statsRes.data.items || []).map((v) => ({
    videoId: v.id,
    title: v.snippet?.title,
    description: v.snippet?.description?.slice(0, 1200),
    views: Number(v.statistics?.viewCount || 0),
    likes: Number(v.statistics?.likeCount || 0),
    duration: v.contentDetails?.duration,
  }));

  const prompt = `You are a Viral Developer Content Strategist applying the 'viral-video-short-form' and 'data-storytelling' skills from skills.rest.
Analyze these trending YouTube videos (Shorts and Long-form) from the past 7 days:
${JSON.stringify(candidates, null, 2)}

Task:
1. Pick the strongest trending topic that features or relates to an open-source GitHub repository.
2. Create a 100% original "Structural Twin" angle (never copy their exact words—distill the core developer pain point, the 'Before vs. After' value, and a practical takeaway).
3. Return strict JSON:
{
  "sourceVideoTitle": "string",
  "sourceViews": number,
  "targetRepo": "owner/repo (valid GitHub repository full_name, or leave empty string if general pillar discovery is better)",
  "pillar": "skills" | "mcp" | "kb" | "tool" | "poc" | "codebase" | "fun" | "learning",
  "winningHookArchetype": "string",
  "originalHookLine": "string (punchy 6-to-10 word developer problem question ending in ?)",
  "viewerValueAngle": "string (specific engineering lesson or workflow comparison to highlight)"
}`;

  const data = await callGeminiAPI({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json" },
  });

  const blueprint = JSON.parse(data.candidates[0].content.parts[0].text);
  await fs.mkdir(path.resolve("./output"), { recursive: true });
  await fs.writeFile(
    path.resolve("./output/latest-trend-blueprint.json"),
    JSON.stringify(blueprint, null, 2),
    "utf-8"
  );

  console.log(`🎯 Trend Blueprint Locked In -> ./output/latest-trend-blueprint.json:`);
  console.log(JSON.stringify(blueprint, null, 2));
  return blueprint;
}

if (process.argv[1]?.endsWith("trend-cloner.ts")) {
  findAndCloneTrendingIdea(process.argv[2]).catch((err) => {
    console.error("❌ Trend Cloner Error:", err.message);
    process.exitCode = 1;
  });
}