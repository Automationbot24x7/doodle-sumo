# Doodle Sumo

**Crayon doodles become 3D sumo toys. Shove your rivals off a giant desk.**

Play it in the browser: **https://automationbot24x7.github.io/doodle-sumo/**
How every toy was made (live 3D viewers, joint sliders, full task log): **https://automationbot24x7.github.io/doodle-sumo/lab.html**

75-second demo video: **https://automationbot24x7.github.io/doodle-sumo/assets/video/doodle-sumo-demo.mp4**

[![Doodle Sumo gameplay](assets/video/poster.jpg)](https://automationbot24x7.github.io/doodle-sumo/assets/video/doodle-sumo-demo.mp4)

Project report (PDF): **[report/doodle-sumo-report.pdf](report/doodle-sumo-report.pdf)**

Built for the **Manycore Aholo Global 3D AI Hackathon** (#Manycorehackathon).

## The game

- Pick a doodle: Big Tofu, Captain Eraser, Mugsy, Volt, Pip or Gummy. Each has its own weight, speed and power.
- Four toys drop onto a kid's desk. Shove (hold to charge) and dash-roll to push everyone else off the edge. Last toy standing wins the round; first to two rounds wins.
- The desk fights back: a stapler snaps shut, a desk fan blows gusts across the desk, and a jack-in-the-box winds up and blasts everyone nearby.
- The winner dances, and you can download that toy as a 3D-print file (.3mf / .stl).
- 1 player against three bots, or 2 players on one keyboard. Touch controls on phones.

| | Player 1 | Player 2 |
|---|---|---|
| Move | WASD (or arrows in 1-player) | Arrows |
| Shove (hold to charge) | J (or Space) | . |
| Dash roll | K (or Shift) | / |

## How Aholo Lux3D made everything

Every 3D asset in the game came out of Aholo Lux3D through its API. Nothing was modelled, rigged or animated by hand.

**Fighters** (`pipeline/fighter.mjs`):

1. **Doodle**: a flat crayon sketch (`doodles/`).
2. **Toy concept**: Lux3D multimodal image generation turns the doodle into a vinyl-toy picture with the same character.
3. **3D model**: Lux3D image-to-3D (G1, PBR textures).
4. **Skeleton**: Lux3D humanoid auto-rig.
5. **Moves**: Lux3D animation retarget. Ten clips per fighter: idle, sumo stance, run, sprint, shove, jab, dash roll, falling flail, victory dance and cheer.
6. **Print file**: Lux3D multi-format export to 3MF and STL.

**Desk traps** (`pipeline/prop.mjs`): Lux3D text-to-3D makes the object. Lux3D articulation then takes a plain-language motion prompt ("add a hinge at the back so the top arm snaps shut") and returns a URDF: separate part meshes joined by real joints with axes and limits. The game loads the URDF (`src/urdf.js`) and drives the stapler's hinge, the fan's rotor and the jack-in-the-box lid and crank directly through those joints.

**Desk props**: pencil cup, book stack, alarm clock, rubber duck, crayon box and lamp, all made with Lux3D text-to-3D.

Every Lux3D task is logged with its ID and timing; the Lab page lists them.

## Run locally

Static site, no build step:

```bash
python -m http.server 8000
```

Then open http://localhost:8000. Add `?demo` to the URL to let bots play every slot.

The demo video was recorded from the real game in Chrome (`tools/capture.mjs`); for the recording, Player 1 was driven through the normal keyboard controls by `tools/autopilot.js`.

Regenerating assets needs your own Aholo API key (from labs.aholo.ai/api-keys) in `Credentials/aholo-key.txt` or the `AHOLO_KEY` environment variable. Then run `pipeline/batch-fighters.sh` and `pipeline/batch-props.sh`, followed by `node tools/build-data.mjs`.

## Tools used

- **Aholo Lux3D** (via the Aholo API): all 3D models, toy concept images, rigging, animation, articulation and print exports.
- **three.js**: rendering. **glTF-Transform**: texture resizing and meshopt compression of the Lux3D output.
- **Claude Code**: AI coding assistant that wrote the game and pipeline code.
- Sound is synthesised live in the browser with WebAudio; there are no audio files.

## Licence

Code: MIT. The doodles are original. The 3D assets were generated with Aholo Lux3D and are subject to Aholo's terms of use.
