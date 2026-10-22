import { google } from "googleapis";
import * as fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import * as path from "node:path";
import * as http from "node:http";
import * as url from "node:url";
import open from "open";

const CREDENTIALS_PATH = path.resolve("./client_secret.json");
const TOKEN_PATH = path.resolve("./youtube-token.json");

// Expanded official scopes: upload videos, read channel/trend stats, and post top-level cheat-sheet comment
const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube.force-ssl",
];

const PILLAR_TAGS: Record<string, string> = {
  skills: "#claudecode #cursorai #codingagents #aiengineering #shorts",
  mcp: "#mcp #aiagents #claudecode #devtools #shorts",
  kb: "#localai #rag #opensourceai #llm #shorts",
  tool: "#devtools #terminal #cli #programming #shorts",
  poc: "#saas #indiehacker #boilerplate #webdev #shorts",
  codebase: "#softwarearchitecture #selfhosted #opensource #systemdesign #shorts",
  fun: "#creativecoding #coding #github #tech #shorts",
  learning: "#systemdesign #learntocode #softwareengineering #cs #shorts",
};

export async function getAuthenticatedClient() {
  let credentials;
  try {
    const content = await fs.readFile(CREDENTIALS_PATH, "utf-8");
    credentials = JSON.parse(content);
  } catch {
    throw new Error(
      "Missing client_secret.json! Please place your Google Cloud OAuth desktop client credentials in C:\\shorts-factory\\client_secret.json"
    );
  }

  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
  const rawRedirect = redirect_uris?.[0] || "http://localhost:3000";
  const parsedUrl = new url.URL(rawRedirect);
  const listenPort = parsedUrl.port ? Number(parsedUrl.port) : 80;
  const redirectUri = listenPort === 80 ? "http://localhost" : `http://localhost:${listenPort}`;

  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirectUri);

  try {
    const token = await fs.readFile(TOKEN_PATH, "utf-8");
    oAuth2Client.setCredentials(JSON.parse(token));
    return oAuth2Client;
  } catch {
    return new Promise<any>((resolve, reject) => {
      const server = http.createServer(async (req, res) => {
        try {
          const qs = new url.URL(req.url || "", redirectUri).searchParams;
          const code = qs.get("code");
          if (!code) {
            res.end("Waiting for OAuth code...");
            return;
          }
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(
            "<html><body style='background:#090d16;color:#4ade80;font-family:sans-serif;padding:40px;'><h2>✅ Authentication successful!</h2><p>You can close this tab and return to your terminal.</p></body></html>"
          );
          server.close();

          const { tokens } = await oAuth2Client.getToken(code);
          oAuth2Client.setCredentials(tokens);
          await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2), "utf-8");
          console.log("✅ OAuth token stored securely in youtube-token.json");
          resolve(oAuth2Client);
        } catch (e) {
          reject(e);
        }
      });

      server.listen(listenPort, async () => {
        const authUrl = oAuth2Client.generateAuthUrl({
          access_type: "offline",
          prompt: "consent",
          scope: SCOPES,
        });
        console.log(`\n🔐 Opening your browser to authorize @bvaibhav23 via Google OAuth (Port ${listenPort}):\n${authUrl}\n`);
        await open(authUrl);
      });
    });
  }
}

export async function uploadShortToYouTube(metaFilePath: string) {
  const metaPath = path.resolve(metaFilePath);
  const meta = JSON.parse(await fs.readFile(metaPath, "utf-8"));
  const tags = PILLAR_TAGS[meta.pillar] || "#opensource #github #devtools #ai #shorts";

  console.log(`\n🚀 Uploading Short via Official YouTube API for [${meta.repo}]...`);
  const auth = await getAuthenticatedClient();
  const youtube = google.youtube({ version: "v3", auth });

  const description = [
    `⚡ ENGINEER CHEAT-SHEET:`,
    meta.pinnedComment,
    "",
    meta.proTip ? `💡 PRO-TIP: ${meta.proTip}` : "",
    meta.verdictCatch ? `⚠️ HONEST CATCH: ${meta.verdictCatch}` : "",
    "",
    `🔗 Featured GitHub Repository: https://github.com/${meta.repo}`,
    `⭐ GitHub Stars: ${(meta.stars || 0).toLocaleString("en-US")}`,
    "",
    "🔔 Subscribe to @bvaibhav23 for 3x daily open-source & AI Agent Skill breakdowns!",
    "",
    tags,
  ]
    .filter((line) => line !== undefined)
    .join("\n");

  const res = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title: meta.youtubeTitle.slice(0, 98),
        description: description,
        tags: ["opensource", "github", "ai", "shorts", meta.pillar],
        categoryId: "28", // 28 = Science & Technology (27 = Education)
        defaultLanguage: "en",
      },
      status: {
        privacyStatus: "public",
        selfDeclaredMadeForKids: false,
      },
    },
    media: {
      body: createReadStream(meta.videoPath),
    },
  });

  const videoId = res.data.id;
  console.log(`✅ Successfully uploaded! Video ID: ${videoId} -> https://youtube.com/shorts/${videoId}`);

  // Automatically post the Pinned Comment text as a top-level comment to drive viewer engagement
  if (videoId && meta.pinnedComment) {
    try {
      await youtube.commentThreads.insert({
        part: ["snippet"],
        requestBody: {
          snippet: {
            videoId,
            topLevelComment: {
              snippet: {
                textOriginal: `🛠️ Repo & Quickstart: https://github.com/${meta.repo}\n\n${meta.pinnedComment}\n\n${meta.proTip ? `💡 Pro-Tip: ${meta.proTip}\n\n` : ""}👇 Would you use this in your stack?`,
              },
            },
          },
        },
      });
      console.log(`💬 Value Cheat-Sheet Comment automatically posted on video ${videoId}!`);
    } catch (e: any) {
      console.log(`ℹ️ Auto-comment skipped (run 'npm run yt:auth' once to enable comment scope): ${e.message}`);
    }
  }

  // Record videoId inside metadata.json so analytics-controller.ts can track it
  meta.videoId = videoId;
  meta.uploadedAt = new Date().toISOString();
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf-8");

  console.log(JSON.stringify({ status: "UPLOADED", videoId, repo: meta.repo, title: meta.youtubeTitle }));
  return videoId;
}

async function main() {
  const modeOrFile = process.argv[2];
  if (!modeOrFile) {
    console.log(
      "Usage:\n" +
        "  1. Authorize API: npx tsx auto-upload-yt.ts auth\n" +
        "  2. Upload Video:  npx tsx auto-upload-yt.ts <path-to-metadata.json>"
    );
    process.exitCode = 1;
    return;
  }

  if (modeOrFile === "auth" || modeOrFile === "login") {
    await getAuthenticatedClient();
    console.log("✅ Channel authorized successfully via Official Google API!");
    return;
  }

  await uploadShortToYouTube(modeOrFile);
}

if (process.argv[1]?.endsWith("auto-upload-yt.ts")) {
  main().catch((err) => {
    console.error(JSON.stringify({ status: "UPLOAD_ERROR", message: err.message }));
    process.exitCode = 1;
  });
}