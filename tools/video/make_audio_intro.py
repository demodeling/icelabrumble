"""Soundtrack for the menu clip (wind, footsteps, a whoosh + snow puff at the touch, two chimes, a drone under the caption).
   python3 make_audio_intro.py out.wav"""
import sys, wave
import numpy as np
SR, DUR = 44100, 20.0
n = int(SR * DUR); t = np.arange(n) / SR
rng = np.random.default_rng(5)
OUT = sys.argv[1] if len(sys.argv) > 1 else "audio_intro.wav"


def smooth(a, b, x):
    u = np.clip((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u)


def lowpass(x, cutoff):
    a = 1 - np.exp(-2 * np.pi * cutoff / SR); y = np.empty_like(x); acc = 0.0
    for i in range(len(x)):
        acc += a * (x[i] - acc); y[i] = acc
    return y


def add(mix, sig, t0):
    i = int(t0 * SR); j = min(n, i + len(sig)); mix[i:j] += sig[:j - i]


white = rng.normal(0, 1, n)
wind = lowpass(white, 350); wind /= np.abs(wind).max() + 1e-9
wind *= 0.20 * (0.55 + 0.45 * np.sin(2 * np.pi * 0.11 * t + 1.0) * np.sin(2 * np.pi * 0.07 * t))
mix = wind.copy()
# footsteps on snow (crunch = short noise bursts), while walking: 1.2-5.4 s and 8.2-12.0 s
step = lowpass(rng.normal(0, 1, int(0.09 * SR)), 1800) * np.exp(-np.arange(int(0.09 * SR)) / (0.02 * SR))
step /= np.abs(step).max() + 1e-9
for t0 in list(np.arange(1.5, 5.3, 0.36)) + list(np.arange(8.5, 11.9, 0.36)):
    add(mix, 0.16 * step * rng.uniform(0.7, 1.0), t0)
# whoosh + puff at the touch (13.6 s)
wh = lowpass(white, 900) - lowpass(white, 120); wh /= np.abs(wh).max() + 1e-9
mix += 0.32 * wh * smooth(13.3, 13.65, t) * (1 - smooth(13.7, 14.6, t))
pf = lowpass(white, 500); pf /= np.abs(pf).max() + 1e-9
mix += 0.30 * pf * smooth(13.6, 13.75, t) * (1 - smooth(13.9, 15.2, t))
# two chimes when the zebra shows (14.3, 14.55)
for f0, t0 in ((1568.0, 14.3), (2093.0, 14.55)):
    tt = np.arange(int(1.6 * SR)) / SR
    ch = (np.sin(2 * np.pi * f0 * tt) + 0.3 * np.sin(2 * np.pi * f0 * 2.01 * tt)) * np.exp(-tt * 3.2)
    add(mix, 0.22 * ch, t0)
# drone under the caption
drone = np.sin(2 * np.pi * 110 * t) + 0.5 * np.sin(2 * np.pi * 165 * t) + 0.35 * np.sin(2 * np.pi * 220.5 * t)
mix += 0.09 * drone * smooth(16.3, 17.6, t) * (1 - smooth(19.0, 20.0, t))
mix *= smooth(0, 1.2, t) * (1 - smooth(19.2, 20.0, t))
mix = np.tanh(mix * 1.2)
with wave.open(OUT, "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 30000).astype(np.int16).tobytes())
print("ok", OUT)
