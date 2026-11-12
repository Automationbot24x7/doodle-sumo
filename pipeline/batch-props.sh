#!/usr/bin/env bash
cd "$(dirname "$0")/.."
for p in fan jack pencilcup books clock duck crayons lamp; do
  node pipeline/prop.mjs "$p" || echo "FAILED $p"
done
echo ALL-DONE
