# +1 Venom Escape

A multiplayer canyon escape for the browser, built with **Three.js** and **Colyseus** for Bloxity. Every second your symbiote grows (**+1 Venom**). Venom levels you up, and the higher your level the longer the **venom tentacle** you can launch. Stand on a glowing launch pad, release your venom, **steer the tentacle** across the canyon onto the next stage, then zip along it. Every stage's Wins pad pays **Wins**; Wins buy **symbiotes** (more Venom every second) in the Win Shop; train on the **Train Zone** pads to multiply your Venom; **rebirth** for a permanent multiplier. **Three worlds, 45 stages**: the Lava Canyon, the Toxic Jungle and the Crystal Void, each ending in an escape portal that unlocks the next. It clones the Roblox game *[+1 Venom Escape](https://www.roblox.com/games/101144061196135/1-Venom-Escape)* (see the video in `reference/`).

**There are no in-app purchases.** Symbiotes, Train Zone pads, passes and boosts are all bought with **Wins**.

It shares its engine with the other Legion games (server, Bloxity login and avatars, profiles, saves; forked from Troll Easy Tower). The canyons, the tentacle, the symbiote suits and statues, the lobby and hubs, the HUD and the soundtrack are new.

## Project layout

| Folder | What it is |
|---|---|
| `client/` | Vite + Three.js client: `main.js` (player physics, the tentacle's cast / grow / zip, aim assist, what the head hits, orbs and boost rings, the chase cameras, pads, checkpoints and portals, going between worlds, other players and their tentacles, network, the loading warm-up), `tentacle.js` (the tentacle: its path in a small float texture, voxel shards placed in the vertex shader, the clawed head), `venom.js` (the symbiote suit on every character, the monster form, the Win Shop statues, the HUD faces), `venomMaterial.js` (the glossy neon venom surface and the venom spreading over your outfit), `world.js` (the three world themes, the lobby, the hubs, the canyons, every stage's obstacles and platform, the escape portals, the venom orbs, animation, building a world the first time you go there), `materials.js` (the liquids, pads, venom swirls, hazard stripes, the chevron guide), `engine.js` (renderer, sky and moods, lights, studs, text), `fx.js` (quality presets, one-draw-call particles), `audio.js` (music and sounds), `ui.js` + `index.html` (HUD and panels) |
| `server/` | Colyseus 0.18 server: the `venom` room (`VenomRoom.js`: Venom every second, runs, pads, streaks, orbs, escapes and world unlocks, rebirths, the shop), profiles, leaderboards, play stats |
| `shared/` | `config.js` (levels, tentacle length and speed, the worlds and their 45 stages, symbiotes, Train Zone pads, rebirth, passes, rewards) and `course.js` (the whole map as data: lobby, hubs, pads, platforms, obstacles, each stretch's good line and its orbs; used by both sides) |

## Run it locally

Needs Node 20 or newer. Double-click `start-local.bat`, or:

```sh
npm install          # installs client and server too
npm run build        # builds the client into client/dist
npm start            # server + game on http://localhost:2641
```

For development run `npm run dev:server` and `npm run dev:client`, then open http://localhost:5211 (the client talks to the server on port 2641; `VITE_SERVER_URL` overrides that). Dev builds (or a build with `VITE_QA=1`) expose `window.__qa` for automated test runs. Restart the server after changing `shared/`.

## Gameplay

- **Venom**: +1 every second, wherever you are, times your symbiotes, the Train Zone pad you stand on, your rebirths and boosts. Venom is your level (the ring on the left), and your level is your tentacle's length (30 studs at level 1, up to 760). The first levels come every few seconds (level 5 in about two minutes even without buying anything), then the curve steepens and from level 40 on it is the long climb.
- **The tentacle**: stand on a glowing launch pad (the pad with the tornado over it) and press **Space** (or **RELEASE VENOM**). The symbiote bursts out into its monster form and the tentacle shoots forward; **A / D** steer it left and right, **W / S** up and down (or drag, or the joystick), the meter shows how much is left (`18/23`). It grabs onto any platform top it comes down on; it stops dead against walls and pillars; the liquid and moving hazards burn it. Then you're pulled along it to the head. Land on the next platform, or fall in and start again from your checkpoint. Press Space again to let go early. If it runs out above a platform you drop onto it; grab a platform's side near its top and you climb up.
- **Venom orbs**: six glowing orbs float along a good line through every stretch; fly the head through them for a few seconds' worth of Venom each (once per run, the pluck climbing a note with every orb in the same swing).
- **Boost rings**: fly the head through a ring of light for +18% length and 40% more speed for a moment.
- **Streaks**: every platform you cross to in a row adds +10% to what its Wins pads pay (up to +100%); falling in ends it. The 🔥 chip shows it.
- **Aim assist** (on by default on phones and controllers, in Settings): while you aren't steering, the head drifts gently toward the stretch's good line (through windows, round pillars and spinners, beside geysers, through the jaws and rings of rocks). It helps; it doesn't fly the hard stages for you.
- **Stages**: each world is a canyon running north from its lobby or hub. Each stage is a stretch with its obstacles, then a stone platform with the big STAGE sign and recommended level, a **Wins pad**, a **bonus pad** on a pillar beside it (2x Wins: land on it directly) and the next launch pad on its far edge. Wins pads pay once per run, and only if you crossed to them (teleporting to a platform starts a new run there).
- **Worlds**: escaping a world unlocks the next (its portal in the lobby lights up, and you're taken there). The later worlds' air drains your venom: your tentacle is 45% shorter in the Toxic Jungle and 58% shorter in the Crystal Void, so they need far more Venom, and their hubs have far bigger Train Zone pads and their own symbiotes. A world is built the first time you go there (a short loading card), so the game still loads in seconds.

  **World 1 · 🌋 Lava Canyon** (escape: +2,500 Wins, unlocks World 2)

  | # | Stage | Recommended | Obstacles | Wins pad |
  |---|---|---|---|---|
  | 1 | Lava Leap | Lv 1 | a short hop | 1 |
  | 2 | Hot Steps | Lv 2 | a step up | 3 |
  | 3 | Pillar Pass | Lv 5 | a stone pillar | 6 |
  | 4 | Side Swipe | Lv 8 | pillars, the platform off to the side | 10 |
  | 5 | Geyser Gulch | Lv 12 | three erupting lava geysers | 16 |
  | 6 | The Window | Lv 16 | a boost ring, a wall with one window | 25 |
  | 7 | Zig Zag | Lv 21 | two half walls, left then right | 38 |
  | 8 | Spinner Storm | Lv 27 | two windmills of blades, a boost ring off to the side | 56 |
  | 9 | High Ground | Lv 34 | a pillar, a beam, a boost ring, a high platform | 82 |
  | 10 | Crusher Canyon | Lv 42 | three sliding crushers | 120 |
  | 11 | Needle Eye | Lv 50 | three walls with small windows | 175 |
  | 12 | Geyser Field | Lv 60 | pillars and geysers | 250 |
  | 13 | Serpent Pass | Lv 70 | three half walls, a pillar | 360 |
  | 14 | Molten Maze | Lv 82 | windows, blades, a crusher, geysers | 520 |
  | 15 | Final Escape | Lv 95 | everything | 750 |

  **World 2 · ☣️ Toxic Jungle** (toxic goo; new: spiked logs swinging across the canyon, snapping jaws; escape: +150K Wins, unlocks World 3)

  | # | Stage | Recommended | Obstacles | Wins pad |
  |---|---|---|---|---|
  | 16 | Jungle Gate | Lv 100 | a pillar, a geyser, a boost ring | 1.2K |
  | 17 | Swinging Logs | Lv 103 | two swinging logs | 1.6K |
  | 18 | Snap Trap | Lv 106 | snapping jaws, a pillar | 2.1K |
  | 19 | Vine Windows | Lv 110 | two temple walls with windows | 2.8K |
  | 20 | Toxic Springs | Lv 114 | four goo geysers | 3.7K |
  | 21 | Log Alley | Lv 118 | three logs, three timings | 4.9K |
  | 22 | Thorn Wheels | Lv 122 | two spinners | 6.4K |
  | 23 | Jaw Gauntlet | Lv 126 | two jaws and a half wall | 8.5K |
  | 24 | Temple Climb | Lv 130 | a pillar, a beam, a high window | 11K |
  | 25 | Boulder Run | Lv 135 | three crushers | 15K |
  | 26 | Serpent Vines | Lv 140 | three half walls, a log | 20K |
  | 27 | Spore Storm | Lv 145 | geysers, logs, pillars | 26K |
  | 28 | Chomp Canyon | Lv 150 | jaws, a spinner, jaws | 34K |
  | 29 | Overgrowth | Lv 155 | windows, a log, a crusher | 45K |
  | 30 | Jungle Escape | Lv 160 | everything | 60K |

  **World 3 · 🔮 Crystal Void** (the starry void; new: lasers sweeping up and down, rings of orbiting rocks; escape: +10M Wins)

  | # | Stage | Recommended | Obstacles | Wins pad |
  |---|---|---|---|---|
  | 31 | Void Steps | Lv 166 | two pillars, a boost ring | 80K |
  | 32 | Laser Field | Lv 171 | two lasers | 105K |
  | 33 | Asteroid Belt | Lv 176 | two rings of rocks | 140K |
  | 34 | Crystal Windows | Lv 181 | two walls with windows | 185K |
  | 35 | Prism Spin | Lv 186 | two spinners, a laser | 245K |
  | 36 | Laser Grid | Lv 192 | three lasers, three rhythms | 320K |
  | 37 | Gravity Rocks | Lv 198 | pillars and rings of rocks | 420K |
  | 38 | Shard Maze | Lv 204 | three half walls | 560K |
  | 39 | Starfall | Lv 210 | five geysers of starlight | 740K |
  | 40 | Ring Run | Lv 216 | tiny windows, big boosts | 980K |
  | 41 | Event Horizon | Lv 222 | a huge ring of rocks, lasers | 1.3M |
  | 42 | Crusher Nebula | Lv 228 | crushers and a laser | 1.7M |
  | 43 | Void Serpent | Lv 234 | half walls, a ring of rocks | 2.2M |
  | 44 | Cosmic Chaos | Lv 240 | a laser, blades, rocks, a wall, a crusher | 2.9M |
  | 45 | Final Void | Lv 248 | everything | 3.8M |

- **The lobby**: the **Train Zone** down the west side (2x, 4x, 8x, 15x, 25x, 40x Venom pads unlocked by rebirths; 60x and 140x bought with Wins), the **Win Shop** down the east side (16 symbiote statues: walk up and press E to buy or wear one), the **World 2** and **World 3** portals, the **Most Wins / Most Venom / Top Rebirths** boards on the south wall, the **rebirth portal**, the "UPDATE! EVENT SOON!" board and the first launch pad on the lava's edge.
- **The hubs** (World 2 and 3): three more Train Zone pads each (300x, 700x, 1,500x; 4,000x, 10,000x, 25,000x Venom, bought with Wins), four of the world's symbiotes, the world's first launch pad and a golden portal home.
- **Symbiotes**: every one you own adds its Venom per second (+3 to +3M). Wear any one: your suit, the venom on your outfit and your tentacle take its two glow colours (Shadow, Toxic Slime, Ember Fang, Frostbite, Thunder, Sunfang, Viper, Phantom, Blood Moon, Nightshade, Antidote, Chimera, Crimson Web, Golden King, Galaxy, Rainbow Overlord; in World 2 Jungle Fang, Swamp King, Spore Lord, Emerald Hydra; in World 3 Crystal Wraith, Nebula, Void Reaper, Cosmic Emperor).
- **Rebirth** at level 15 (then 25, 35...): Venom back to zero, your multiplier up by one (x2, x3...) forever, new Train Zone pads. Wins, symbiotes, passes and unlocked worlds stay.
- **Passes and boosts** (Wins): x2 Venom, x2 Wins, Fast Tentacle (+25% speed), Long Tentacle (+15% length), x2 Jump; 15-minute x2 Venom and x2 Wins boosts.
- **Playtime gifts**: a chip under the stats counts down to the next one (at 1, 3, 5, 7 minutes, a free Thunder symbiote at 10, x2 Wins at 15, a free Viper symbiote at 30...); tap it to claim.
- Also: offline earnings ("GET VENOM OFFLINE", after the daily reward), daily rewards (they pop up once you've earned your first Win, never mid-swing) (a Frostbite symbiote on day 7), playtime gifts, codes (`VENOM`, `ESCAPE`, `SYMBIOTE`, `LEGION`, `RELEASE`), Friend Boost (+10% Venom and Wins per Bloxity friend in the server, up to +50%).
- **The guide**: when your tentacle is too short for the next stage, the top line becomes a button: buy the symbiote you can afford, or jump onto your best Train Zone pad (and, trained up, straight back to the launch pad). A launch pad won't fire a tentacle far too short for its stage (it says what to do instead, and the Train and Symbiotes buttons bounce). The line at the top always says what to do next ("Jump to the pad to earn your first Win!", "Stage 18 needs Level 106…", "Walk into the ESCAPE portal!"), and a ribbon of chevrons runs from you to it (the launch pad, the Wins pad, your best Train Zone pad).
- **HUD**: what to do next, Wins, Venom (+per second), the world and stage and your streak along the top; your level ring and tentacle length (with the world's drain) on the left; Symbiotes, Train, Rebirth and x2 Venom on the right; the menu icons top right (Shop, Daily, Gifts, Teleport, Invite, Settings). Teleport lists the worlds and every platform you've reached in each. The top-left corner is kept free for the Bloxity overlay.

## Sound

- **Music**, "Symbiote Surge": an original code-generated 128 BPM track in E minor. It creeps in (a dark pad, plucked arpeggios), drops (punchy kick and claps, trap hat rolls, a booming 808, a wobbling growl bass, a catchy saw lead), breaks down to glassy bells, builds back with a snare roll, drops again an octave up and eases out in half time; 64 bars. The deeper into a canyon you are, the more layers join in. Each world plays it in its own key with its own extra layer: jungle drums in World 2, a starry shimmer in World 3.
- All effects synthesized: the venom bursting out (a growl and a wet tear), the tentacle stretching, grabbing on, snapping, the zip, orbs, boost rings, hisses and splashes, geysers, level ups, Wins pads, rebirths, the escape fanfare, footsteps on studs, grass and stone.

## Graphics and performance

- The reference's look, richer, in three themes: studded brick canyon walls with dripping grass caps and terraces of voxel trees over glowing animated lava (World 1); mossy temple stone, jungle trees hung with vines, glowing mushrooms and bright toxic goo (World 2); dark crystal rock with glowing crystal caps, crystal spires, rock islands drifting in the sky and a starry pink void (World 3). Falls of each world's liquid pour down the walls with sparks where they land, its light glows along the walls, and each world has its own skies (golden hour and sunset in the canyon, green haze in the jungle, a deep purple night in the void). The venom tentacle is chunky glossy shards with a neon rim and glow pulses racing along it; the symbiote spreads over your own outfit with your level, with a glowing edge and neon veins; every symbiote has two glow colours. Twisted symbiote statues with swirling auras, tornadoes over the launch pads, glowing pads with rippling rings, beams of light over the Wins pads, hazard-striped spinners, crushers and jaws, spiked logs, red lasers, glowing orbs and boost rings, golden escape portals.
- **Colour on the move** (like the top games), all in the shaders and CSS, so it costs no extra draw calls: every neon edge in the world (window frames, wall caps, platform lips, spinner tips, jaws, portals, boost rings, crystals, mushrooms) has bright bands racing along it and its colour drifting round the colour wheel; LED light strips run along the tops of the walls (a rainbow round the lobby, the world's colours in the canyons and hubs); hazard stripes crawl; the tornadoes, statue auras and portal swirls cycle their colours; the venom orbs shift hue; a shine sweeps across every sign and banner; aurora curtains ripple across the jungle and void skies and their floating motes change colour; in the HUD the RELEASE VENOM button and rainbow symbiotes cycle colours, a rainbow ring turns round your level, and STAGE CLEAR, LEVEL UP, ESCAPED and the bonus pop flow through the rainbow.
- **The colour grade** is done inside the tone mapping every material already runs (more saturation, a gentle contrast curve, cool shadows and warm highlights), so it costs no extra pass.
- **Built for weak PCs and phones**: the per-frame matrix walk only visits things that move (three walks every child of everything by default: thousands of frozen pieces in every world, every frame; now render prep takes about a third less CPU); nothing past the haze is drawn (1,600 studs, 1,250 on Low); a game that starts on Low builds its shaders with no shadow code at all (about half the GPU time per pixel on a phone; switching up in Settings rebuilds them once); phones with 120 Hz screens draw a steady 60 fps (cooler, and no throttling later); labels are checked ten times a second and only in your world, and hide when the camera is right next to them. Only matte (Lambert) and unlit materials, no reflections, no environment map, no post-processing (the vignette is CSS). Static geometry is merged per zone and material (a few draw calls per group of stages), and only the world you're in is drawn; the statues are baked in; every tentacle is one draw call whose shards are placed in the vertex shader from a small texture; every particle is in one of two point clouds; all of a world's orbs are one draw call; moving hazards are a few merged meshes each. Every shadow caster also receives shadows (so three never re-picks shaders mid-frame).
- **No stutter**: World 1 is built in slices while the server join runs in parallel; every shader (including the shadow pass's, a tentacle and the suit's monster form) is compiled in the background and every texture uploaded before you spawn. Worlds 2 and 3 use the same 34 shaders: the first visit builds the world behind a loading card, uploads its textures and draws it once (so its geometry is on the GPU), and the card lifts a few frames after you arrive.
- **Quality**: Low (no shadows, no particles or vignette, 0.8 resolution, speed lines at half resolution, half the venom sparks), Medium (default on desktop) and High; phones and weak PCs start on Low; slow frame rates step down automatically (never saved).
- **Feel**: keyboard steering eases in and out (no jerky turns), the zip slows into the landing, a jump pressed while zipping doesn't fire when you land; HUD animations restart without forcing a page layout.

## Controls

| Action | Keyboard / mouse | Controller | Touch |
|---|---|---|---|
| Move | WASD / arrows | Left stick | Joystick |
| Jump / release venom on a launch pad | Space | A | JUMP / RELEASE VENOM |
| Steer the tentacle | A / D, W / S, or drag | Left stick | Joystick or the meter's arrows |
| Let go early | Space, click | A | JUMP |
| Buy / wear a symbiote, use | E | X | Tap the prompt |
| Go to another world | walk into its portal, or Teleport | | |
| Camera | Drag, wheel to zoom | Right stick, D-pad | Drag |

## Multiplayer and saves

- One shared `venom` room (up to 24 players). Movement and the tentacle are client-side and everyone sees everyone's tentacles (the head is synced); players in another world aren't drawn. Venom (counted every second), Wins pads, streaks, orbs, checkpoints, escapes and world unlocks, rebirths and every purchase are decided by the server (a checkpoint in a world you haven't unlocked doesn't count; an orb pays only on the stretch you're flying, once per run).
- Progress is saved per browser or per Bloxity account: MongoDB on Legion (`MONGODB_URI`), `server/data/profiles.json` locally; saved within 1.5 s of anything that changes it and every 10 s.
- Play stats: `GET /api/stats?key=<stats key>&days=7` (the key is in `server/STATS_KEY.local.txt`, not in the repo; locally the stats are open).

## Deploy (Bloxity hosting)

Pushing `main` (prod) or `dev` runs `.github/workflows/deploy.yml`: server image `ghcr.io/asivixlp44-cmyk/venom-escape-server`, Legion rollout, client upload. Play at https://venom-escape.play.bloxity.io once the app `venom-escape` exists on hosting.bloxity.io and the repo has the `LEGION_DEPLOY_TOKEN` secret.

## Play stats

`GET /api/stats?key=<stats key>&days=7` breaks sessions down by length, how far players got, what sent them into the liquid (a tentacle too short, a missed landing, a hazard, walking off an edge), touch vs desktop, frame rate and playtime gifts claimed. The first week live (median session 2.3 min, a fall for every launch, 65% never bought a symbiote, most stuck at stage 3 needing level 5 = 20 minutes of Venom) led to the faster early levels, the launch gate, the tappable guide, aim assist on for everyone and the gift countdown.

## QA

- An autopilot flew the tentacle along each stretch's line across all 45 stages with the game's own physics at each stage's recommended level: 45/45 (the line needs 58-94% of the tentacle). With the moving hazards on (10 levels above, five timings each, no dodging or waiting) it lands 180 of 225: the timed hazards (jaws, logs, lasers, crushers, spinners) catch a tentacle that doesn't watch them, more often the further you go. With aim assist alone and no steering at all it clears 13 of 45 (the easy ones).
- 33 server tests with Colyseus clients cover Venom ticks, the Train Zone pads, crossings, the Wins and bonus pads, teleports, symbiotes, rebirth, synced tentacles, locked worlds, orbs, streaks, and escaping World 1 into World 2. A browser run crossed World 1, escaped, saw the unlock banner and the loading card, arrived in the World 2 hub and went home and back through the portals; two players in different worlds only see each other in the same one.
- Measured on the dev PC (headless Chrome, real GPU): with the CPU slowed 4x at 1280x720, Low 79-109 FPS (was 68-87 before the matrix-walk fix); render prep 1.9-2.3 ms a frame unthrottled (was 2.6-2.9); a phone-sized Low frame in the lobby 5.6 ms of GPU without shadow code (10.9 with it); 36 shaders on Medium (32 on Low), the same in every world. Loads in about 4-6 s; a new world builds in 1-2 s behind its card.
