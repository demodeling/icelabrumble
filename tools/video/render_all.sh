#!/bin/sh
# Renders the nine 20-second character clips into assets/videos/ (needs python3 + Pillow + numpy + ffmpeg).
cd "$(dirname "$0")"
[ -f audio.wav ] || python3 make_audio.py
for c in albertas bjorn bea annamia per marco jose mike daniel henrik anton; do
  rm -rf frames_$c
  CHAR=$c python3 render_cutout.py frames_$c
  ffmpeg -y -loglevel error -framerate 30 -i frames_$c/%04d.png -i audio.wav -c:v libx264 -preset slow -crf 30 -profile:v main -pix_fmt yuv420p -c:a aac -b:a 64k -ac 1 -shortest -movflags +faststart ../../assets/videos/$c.mp4
  rm -rf frames_$c
  echo "$c done"
done
