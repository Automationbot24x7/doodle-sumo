#!/usr/bin/env bash
# Prints durations of media files: tools/durs.sh <dir>
cd "$1" || exit 1
for f in *.mp4 *.wav; do
  [ -e "$f" ] || continue
  printf '%s %s\n' "$f" "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")"
done
