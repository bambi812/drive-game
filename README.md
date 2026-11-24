# Drive ? online 3D driving game
Run locally: `npm install && npm start` then open http://localhost:3000 (or double-click start.bat / start.command).
Test road & terrain: `npm test` (prints max grade, min radius, terrain-minus-road, slopes).

## Deploy (GitHub -> Render)
1. Push this folder to a GitHub repo.
2. Render: New > Blueprint, pick the repo (uses render.yaml). A persistent disk is mounted at /data.
3. Set env var GOOGLE_CLIENT_ID (Google Cloud Console > OAuth Web client; add your Render URL as an authorised JS origin).
4. DATA_DIR=/data keeps data.json (accounts, money) across deploys.

## Accounts
Guests work out of the box. For Google Sign-In create an OAuth *Web* client ID, add your site URL (http://localhost:3000 and your Render URL) under Authorised JavaScript origins, and set GOOGLE_CLIENT_ID. The server verifies every ID token with google-auth-library; it issues its own session token (only a hash is stored). One live session per account. Never set ALLOW_TEST_LOGIN outside tests.

## Controls
W/S gas-brake-reverse, A/D steer, Space handbrake, Shift nitro, C camera, mouse-drag orbit, R reset, E garage, ENTER join race (at a start line), X leave race, M map (click to set a GPS waypoint), T teleport to nearest garage, L leaderboard, Z next owned car, V flip car model 180 degrees.

## Vehicles: how it works

**Physics** (`public/physics.js`, fixed 120 Hz, shared by client and tests): bicycle model with Pacejka tyres + friction ellipse, load transfer, per-car torque curve (`curve` = 7 dyno points), turbo spool (`turbo`, `lag`), RWD/AWD split, multi-gear auto box with shift cut, rev limiter, speed limiter (`vmax`), ABS / traction control (arcade assists, F2 toggles simulation mode), surfaces (road / gravel / sand / grass / water), drag + downforce, nitro, handbrake, crest jumps.
**Collisions**: lamps, signs, palms, buildings, villas, the fountain and gate pillars are solid (`solids` hash in `main.js`); hits cause a bounce, camera shake, sparks, a crash sound and gamepad rumble.
**Visuals**: wheels spin / steer (found automatically from the glTF by geometry), body pitch / roll, brake / reverse / head light glows, contact shadow, tyre-tread skid ribbons that fade, sand / grass dust, shoulders on the road edge.
**Camera** (C): chase near, chase far, hood, bumper. Spring-damped follow, speed pull-back, look-ahead, drift swing, building avoidance, shake, look back with B.
**Sound** (`public/engine-sound.js`): procedural per-engine synth driven by rpm / load / boost / shifts / limiter, blow-off valve, pops, crash, wind, road noise; other players and one traffic car are positional (HRTF + Doppler).
**HUD** (`public/hud.js`): tachometer, speed (km/h / mph with U), gear, shift lights, nitro, ABS / TCS, help (H), debug + live tuning sliders (F3), quality (F4).
**Gamepad**: stick steer, RT gas, LT brake, A handbrake, X / RB nitro, Y camera, Back reset, rumble.

### Add a new car
1. Drop the glTF into a scratch folder, then `npx @gltf-transform/cli optimize in.gltf public/models/<id>.glb --compress meshopt --texture-compress webp --texture-size 1024 --palette false --join false --flatten false --instance false`.
2. Add an entry to `public/car-data.js` (copy a similar car): `model`, `length`, `paint.body` / `paint.rims` (regexes on the glTF *material* names; list them with `node -e` or open the glb in a viewer), optional `tire` regex if the model has stray geometry under the car, `snd` (engine kind: boxer / v8 / v8sc / v8flat / i6 / flat6 / flat6na / rotary), and `spec` (mass, wb, front, cgh, torque, redline, curve, gears, final, rw, cdA, clA, muF, muR, brakeG, drive, turbo, vmax).
3. Add the 0-100 / top speed to `REAL` in `test/physics-test.js`, a price tier to `TIER` in `public/catalog.js`, run `npm test`, then check orientation in the garage (V flips the model if it faces backwards).

### Test checklist (what to drive)
standstill launch and 0-100 per car (printed by `node test/physics-test.js`) - top speed - hard braking from 200 km/h (ABS on / off with F2) - fast corner - handbrake drift - sand vs asphalt - jump and landing - crash into a lamp / building at 150 km/h - R reset, V flip - nitro - second browser tab: remote car wheels, lights and engine sound - F3 FPS on Medium (F4).
