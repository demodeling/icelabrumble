#!/bin/sh
# Renders the 20-second menu clip ("False positive: a real sequence, the wrong label") into assets/videos/intro.mp4.
# Needs python3 + Pillow + numpy + ffmpeg (FFMPEG=/path/to/ffmpeg to override). CHAR picks the crew member (default albertas).
cd "$(dirname "$0")"
FFMPEG=${FFMPEG:-ffmpeg}
export CHAR=${CHAR:-albertas}
rm -rf frames_intro
python3 render_intro.py frames_intro 0 2 &
python3 render_intro.py frames_intro 1 2 &
wait
python3 make_audio_intro.py frames_intro/audio.wav
$FFMPEG -y -loglevel error -framerate 30 -i frames_intro/%04d.png -i frames_intro/audio.wav -c:v libx264 -preset slow -crf 30 -profile:v main -pix_fmt yuv420p -c:a aac -b:a 64k -ac 1 -shortest -movflags +faststart ../../assets/videos/intro.mp4 || { echo 'ffmpeg failed (needs libx264 + aac); frames kept in frames_intro/'; exit 1; }
rm -rf frames_intro
echo "intro done"
