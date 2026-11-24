// server.js — Express static host (Phase 1). Socket.io / auth / economy are added in later phases.
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use('/three', express.static(path.join(__dirname, 'node_modules/three')));   // pinned three.js served locally
app.use(express.static(path.join(__dirname, 'public')));
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Drive game running on http://localhost:${PORT}`));
