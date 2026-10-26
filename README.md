# The Ashen Sanctum

A dark fantasy first-person shooter for the browser, built with Three.js + Vite.
All assets (textures, geometry, sound) are generated procedurally at runtime — zero media downloads.

## Play

Production build is hosted on GitHub Pages:
https://scottpendlebury.github.io/ashen-sanctum/

## Gameplay

You are a penitent knight descending into a ruined cathedral. Explore the Broken Nave,
Great Corridor, Reliquary of Bone, West Crypt and the Transept to find two sigils that
break the seal on the reliquary door. Beyond it, the Hollow Sentinel awaits. Slay it and
escape through the gate.

Weapons:
1. **Riven Crossbow** — single bolt, deliberate reload, plentiful bolts.
2. **Grave Hand-Cannon** — hitscan blast with splash, scarce powder.
3. **Soul Scourge** — slow orb that drains enemy vitality and heals you; essence regenerates.

Enemies: ghouls (lunge melee), skeletal archers (kiting ranged), corrupted knights (heavy
telegraphed smash) and the Hollow Sentinel miniboss.

## Controls

Desktop: WASD move · mouse look · LMB fire · RMB melee strike · Shift sprint ·
Space jump · Ctrl/C crouch · R reload · E interact · 1/2/3 or wheel — weapons · Esc pause.

Touch: left half of screen — move (virtual joystick), right half — look; on-screen
ATK / ALT / JMP / RLD / SWP / USE / RUN buttons and pause button. Designed for landscape.

## Development

```bash
npm install     # installs pinned three@0.185.1 and vite@5.4.20
npm run dev     # local dev server
npm run build   # production build to dist/
npm run preview # serve the production build locally
npm run budget  # size-budget check (fails over thresholds)
```

## Deployment

GitHub Actions (`.github/workflows/deploy.yml`) builds on every push to `main` and
deploys `dist/` via GitHub Pages. `vite.config.js` sets `base: './'` so all asset
paths work under the repository subpath.

## Size budget (measured at release)

See `npm run budget` output; thresholds: tracked repo ≤ 100 MB, build ≤ 50 MB,
initial download ≤ 10 MB.

## Known limitations

- Tested on desktop Chromium (Linux); no real mobile device was available — mobile
  support verified via touch-event emulation and responsive layout only.
- Enemy pathfinding is simple wall-sliding, not full pathfinding; enemies can get
  stuck on complex geometry corners.
- Headless/software-rendered environments throttle the frame loop; real GPU hardware
  is expected to run comfortably faster.
