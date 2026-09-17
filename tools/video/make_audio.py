import numpy as np, wave
SR = 44100
DUR = 20.0
n = int(SR * DUR)
t = np.arange(n) / SR
rng = np.random.default_rng(3)


def smooth(a, b, x):
    u = np.clip((x - a) / (b - a), 0, 1)
    return u * u * (3 - 2 * u)


def lowpass(x, cutoff):
    a = 1 - np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += a * (x[i] - acc)
        y[i] = acc
    return y


# wind: low-passed noise with slow gusts
white = rng.normal(0, 1, n)
wind = lowpass(white, 350)
wind = wind / (np.abs(wind).max() + 1e-9)
gust = 0.55 + 0.45 * np.sin(2 * np.pi * 0.11 * t + 1.0) * np.sin(2 * np.pi * 0.07 * t)
wind *= 0.20 * gust

# wing flutter: band-ish noise with 7 Hz tremolo, swelling at the burst and drifting away
flut = lowpass(white, 2500) - lowpass(white, 500)
flut /= (np.abs(flut).max() + 1e-9)
trem = 0.6 + 0.4 * np.sign(np.sin(2 * np.pi * 7.5 * t)) * (0.5 + 0.5 * np.sin(2 * np.pi * 6.3 * t))
env = smooth(13.0, 14.2, t) * (1 - smooth(16.5, 19.6, t))
flut *= 0.28 * env * trem

# whoosh at the touch
whoosh = lowpass(white, 900) - lowpass(white, 120)
whoosh /= (np.abs(whoosh).max() + 1e-9)
whoosh *= 0.35 * smooth(12.9, 13.4, t) * (1 - smooth(13.4, 15.0, t))

# soft low drone under the message
drone = (np.sin(2 * np.pi * 110 * t) + 0.5 * np.sin(2 * np.pi * 165 * t) + 0.35 * np.sin(2 * np.pi * 220.5 * t))
drone *= 0.09 * smooth(16.8, 18.5, t) * (1 - smooth(19.0, 20.0, t))

mix = wind + flut + whoosh + drone
mix *= smooth(0, 1.2, t) * (1 - smooth(19.2, 20.0, t))
mix = np.clip(mix, -1, 1)
# slight stereo width
left = mix + 0.03 * np.roll(mix, 300)
right = mix - 0.03 * np.roll(mix, 300)
st = np.stack([left, right], 1)
st = np.clip(st, -1, 1)
with wave.open("audio.wav", "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((st * 32000).astype(np.int16).tobytes())
print("ok")
