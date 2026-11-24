# Drive ? online 3D driving game
Run locally: `npm install && npm start` then open http://localhost:3000 (or double-click start.bat / start.command).
Test road & terrain: `npm test` (prints max grade, min radius, terrain-minus-road, slopes).

## Deploy (GitHub -> Render)
1. Push this folder to a GitHub repo.
2. Render: New > Blueprint, pick the repo (uses render.yaml). A persistent disk is mounted at /data.
3. Set env var GOOGLE_CLIENT_ID (Google Cloud Console > OAuth Web client; add your Render URL as an authorised JS origin).
4. DATA_DIR=/data keeps data.json (accounts, money) across deploys.
