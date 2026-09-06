#!/bin/sh
# Restart the two app servers cleanly for local verification.
pkill -f "server/index.js" 2>/dev/null
node server/index.js --app admin  --port 4310 > /tmp/mm-admin.log  2>&1 &
node server/index.js --app worker --port 4320 > /tmp/mm-worker.log 2>&1 &
node -e "
const up=async()=>{try{const a=await fetch('http://localhost:4310/api/health');const b=await fetch('http://localhost:4320/api/health');return a.ok&&b.ok}catch{return false}};
(async()=>{for(let i=0;i<60;i++){if(await up()){console.log('servers ready');process.exit(0)}await new Promise(r=>setTimeout(r,200))}console.error('servers failed to start');process.exit(1)})()"
