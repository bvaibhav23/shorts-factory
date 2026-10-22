@echo off
title AI GitHub Shorts Factory - Automated Run
cd /d D:\shorts-factory

echo [%DATE% %TIME%] Starting automated Short generation...
npx tsx --env-file=.env factory-worker.ts > run.log 2>&1

:: Check if the run succeeded and extract metadataPath
for /f "delims=" %%i in ('node -e "try { const fs=require('fs'); const lines=fs.readFileSync('run.log','utf8').trim().split('\n'); const last=JSON.parse(lines[lines.length-1]); if(last.status==='APPROVED') console.log(last.metadataPath); } catch(e){}"') do set "METADATA_PATH=%%i"

if not "%METADATA_PATH%"=="" (
    echo [%DATE% %TIME%] QA Approved! Uploading to YouTube Studio...
    npx tsx auto-upload-yt.ts "%METADATA_PATH%" >> run.log 2>&1
    echo [%DATE% %TIME%] Upload complete.
) else (
    echo [%DATE% %TIME%] Short generated but QA flagged or failed. Check run.log for details.
)