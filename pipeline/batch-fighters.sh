#!/usr/bin/env bash
# Runs every fighter through the full Lux3D pipeline (one task at a time; the client waits if another task is running).
cd "$(dirname "$0")/.."
node pipeline/fighter.mjs tofu anims optimize
for f in eraser mug battery pencil gummy; do
  node pipeline/fighter.mjs "$f" upload toy model rig anims optimize || echo "FAILED $f"
  cp "doodles/$f.png" "assets/fighters/$f/doodle.png" 2>/dev/null
done
echo ALL-DONE
