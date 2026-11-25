# Drive ? online 3D driving game
Run locally: `npm install && npm start` then open http://localhost:3000 (or double-click start.bat / start.command).
Test road & terrain: `npm test` (prints max grade, min radius, terrain-minus-road, slopes).

## Deploy (GitHub -> Render)
1. Push this folder to a GitHub repo.
2. Render: New > Blueprint, pick the repo (uses render.yaml).
3. Set the env vars below (GOOGLE_CLIENT_ID for Google sign-in, UPSTASH_REDIS_REST_URL / _TOKEN so progress survives restarts).

## Saving progress
Render's free plan wipes the disk on every deploy, restart and idle spin-down, so `data/data.json` alone does not last there. Create a free Redis database at upstash.com and set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN: the server then keeps all accounts under the key `drive:db` (written at most every 10 s and on shutdown; the server refuses to start if it cannot read it). Without those variables it uses the local file (`DATA_DIR`), which is fine locally or on a host with a persistent disk. The startup log says which one is in use.

## Accounts
Guests work out of the box: the save is tied to that browser (60 days after the last visit), and the "Save with Google" button moves it onto a Google account. For Google Sign-In create an OAuth *Web* client ID, add your site URL (http://localhost:3000 and your Render URL) under Authorised JavaScript origins, and set GOOGLE_CLIENT_ID. The server verifies every ID token with google-auth-library; it issues its own session token (only a hash is stored). One live session per account. Never set ALLOW_TEST_LOGIN outside tests.

## Controls
W/S gas-brake-reverse, A/D steer, Space handbrake, Shift nitro, C camera, mouse-drag orbit, R reset, E garage, ENTER join race (at a start line), X leave race, M map (click to set a GPS waypoint), T teleport to nearest garage, L leaderboard, Z next owned car, V flip car model 180 degrees.

## World and camera
Roads: the main loop (races, traffic, speed traps, drift zones, R reset) plus `SIDE_ROADS` in `public/world.js` (about 10 km of country lanes, edit `SIDE_CTRL` to add more; `node test/road-test.js` checks their slopes).
`public/foliage.js` builds trees, palms, bushes and tufts from alpha-textured leaf cards; `public/scenery.js` adds crop fields, groves, hedgerows, farmhouses, utility poles, roadside plants and beach huts (seeded, so all players see the same layout; solid things stay clear of the road). Small details are hidden far away and on Low quality. The chase camera numbers are in `public/chase-cam.js`.

## Vehicles: how it works

**Physics** (`public/physics.js`, fixed 120 Hz substeps, render-interpolated, shared by client and tests): a real rigid body (position, velocity, quaternion, angular velocity, diagonal inertia tensor, COM height) on **4 raycast suspensions** (spring, separate bump / rebound damping, bump stops, front / rear anti-roll bars). Pitch, dive, squat and body roll are not animated - they emerge from the forces applied at each contact patch. Each wheel probes its own surface (road / gravel / grass / sand / water / wooden boardwalk, blended smoothly) and has its own angular velocity integrated from drive, brake and tyre torque, so wheelspin and lock-up are real. Tyres are a brush / Pacejka-style curve with relaxation length (no creep, holds on slopes), friction ellipse and load sensitivity. Drivetrain: engine torque curve + inertia -> slipping auto clutch -> gearbox (shift time, hysteresis) -> open / LSD / locked diff -> wheels, with engine braking and a rev limiter. Aero drag + downforce, rolling resistance per surface, speed-dependent sand sinkage, shallow-water drag, deep water floats then auto-resets. Assists (F2) are a separate layer that only modulates brake / throttle / steering: ABS, traction control, stability control, counter-steer; F2 turns all of them off.
**Collisions**: the car is a rectangle hull; props (circles / boxes) and other cars are tested with SAT, the impulse is applied at the contact point (so the car spins on off-centre hits) with wall friction and mass-based car-vs-car response; collider sizes match the visible trunks and poles.
**Effects** (`public/fx.js`): pooled soft particles (flipbook smoke / dust lit by the sun, sorted, fading near the ground and the camera), ballistic sand / gravel / spray grains, sparks, backfire and nitro flames, tyre smoke, persistent ruts in sand / grass / gravel, wet tracks after water, brake-disc glow, dusty paint after sand. Every emitter reads per-wheel physics (slip speed, load, surface, speed).
**Camera** (C): chase near, chase far, hood, bumper. Spring-damped follow, speed pull-back, look-ahead, drift swing, building avoidance, shake, look back with B.
**Sound** (`public/engine-sound.js`): procedural per-engine synth driven by rpm / load / boost / shifts / limiter, blow-off valve, pops, crash scaled by impulse, wind, per-wheel tyre sounds by surface (asphalt squeal, sand hiss / crunch, gravel roar, splash, plank rumble), body scrape, sand patter; other players and one traffic car are positional (HRTF + Doppler).
**HUD** (`public/hud.js`): tachometer, speed (km/h / mph with U), gear, shift lights, nitro, ABS / TCS, help (H), debug + live tuning sliders (F3), quality (F4).
**Gamepad**: stick steer, RT gas, LT brake, A handbrake, X / RB nitro, Y camera, Back reset, rumble.

### Add a new car
1. Drop the glTF into a scratch folder, then `npx @gltf-transform/cli optimize in.gltf public/models/<id>.glb --compress meshopt --texture-compress webp --texture-size 1024 --palette false --join false --flatten false --instance false`.
2. Add an entry to `public/car-data.js` (copy a similar car): `model`, `length`, `paint.body` / `paint.rims` (regexes on the glTF *material* names; list them with `node -e` or open the glb in a viewer), optional `tire` regex if the model has stray geometry under the car, `snd` (engine kind: boxer / v8 / v8sc / v8flat / i6 / flat6 / flat6na / rotary), and `spec` (mass, wb, front, cgh, torque, redline, curve, gears, final, rw, cdA, clA, muF, muR, muX, brakeG, drive, turbo, vmax, plus the optional per-car chassis data documented at the top of `mk` in `car-data.js`: track, travel, ride frequency, damping, anti-roll, diff type, brake bias, handbrake torque, inertias).
3. Add the 0-100 / top speed to `REAL` in `test/physics-test.js`, a price tier to `TIER` in `public/catalog.js`, run `npm test`, then check orientation in the garage (V flips the model if it faces backwards).

### Test checklist (what to drive)
standstill launch and 0-100 per car (printed by `node test/physics-test.js`) - top speed - hard braking from 200 km/h (ABS on / off with F2) - fast corner - handbrake drift - sand vs asphalt - jump and landing - crash into a lamp / building at 150 km/h - R reset, V flip - nitro - second browser tab: remote car wheels, lights and engine sound - F3 FPS on Medium (F4).

