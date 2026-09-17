"""Menu clip: "False positive - a real sequence, the wrong label".

Reuses the scene, rig and rhino from render_cutout.py. The crew member walks in, stops and looks back
for a moment, walks on, touches the rhino, and it turns out to be a zebra.

  CHAR=martin python3 render_intro.py frames_intro            # all 600 frames
  CHAR=martin python3 render_intro.py frames_intro 0 2        # every 2nd frame from 0 (for two workers)
"""
import math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from render_cutout import *            # scene, rhino, rig helpers, sprites (CHAR env)
import render_cutout as RC

OUT = sys.argv[1] if len(sys.argv) > 1 else "frames_intro"
os.makedirs(OUT, exist_ok=True)

# ---------------------------------------------------------------- timeline (seconds)
T_ENTER = 1.2
T_PAUSE0, T_PAUSE1 = 5.4, 8.2         # stands still, looks back over the left shoulder
T_LOOK0, T_LOOK1 = 5.8, 7.5
T_STOP = 12.0
T_REACH0, T_REACH1 = 12.2, 13.3
T_TOUCH = 13.6
T_MORPH0, T_MORPH1 = 13.75, 14.55     # rhino -> zebra crossfade, hidden by the snow puff
T_ARM_DOWN0, T_ARM_DOWN1 = 15.3, 16.3
T_TEXT0, T_TEXT1 = 16.4, 17.3
T_SUB0, T_SUB1 = 17.1, 18.0
T_FADEOUT = 19.2

X_PAUSE = X_START + (X_STOP - X_START) * 0.42
prng = np.random.default_rng(11)

# ---------------------------------------------------------------- zebra (same rig units as the rhino)
def draw_zebra():
    body, dark, light, ink, hoof = (244, 240, 234), (214, 208, 198), (255, 255, 255), (42, 38, 42), (42, 38, 42)
    lay = Image.new("RGBA", (SW, SH), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    shapes = Image.new("L", (SW, SH), 0)        # body + head silhouette, for clipping the stripes
    sd = ImageDraw.Draw(shapes)
    legs = Image.new("L", (SW, SH), 0)
    ld = ImageDraw.Draw(legs)

    def leg(lx, col, near):
        pts = rpoly([(lx - 0.17, -0.9), (lx + 0.17, -0.9), (lx + 0.2, -0.02), (lx - 0.22, -0.02)])
        d.polygon(pts, fill=col); ld.polygon(pts, fill=255)
        if near:
            d.polygon(rpoly([(lx - 0.24, -0.14), (lx + 0.22, -0.14), (lx + 0.22, -0.02), (lx - 0.24, -0.02)]), fill=hoof)
        else:
            d.polygon(rpoly([(lx - 0.22, -0.14), (lx + 0.2, -0.14), (lx + 0.2, -0.02), (lx - 0.22, -0.02)]), fill=hoof)

    for lx in (0.62, -0.62):
        leg(lx, dark, False)
    for box in ([(-1.35, -1.85), (1.3, -0.5)], [(-1.3, -1.98), (-0.3, -1.2)], [(0.45, -1.9), (1.32, -1.0)]):
        d.ellipse([P(*rp(*box[0])), P(*rp(*box[1]))], fill=body); sd.ellipse([P(*rp(*box[0])), P(*rp(*box[1]))], fill=255)
    d.ellipse([P(*rp(-1.1, -1.1)), P(*rp(1.15, -0.5))], fill=dark)
    d.ellipse([P(*rp(-1.25, -1.72)), P(*rp(1.1, -0.9))], fill=body)
    d.ellipse([P(*rp(-1.1, -1.9)), P(*rp(0.9, -1.45))], fill=light)
    d.ellipse([P(*rp(-1.05, -1.78)), P(*rp(0.95, -1.15))], fill=body)
    for lx in (0.92, -0.9):
        leg(lx, body, True)
    head = [(-0.85, -1.95), (-1.25, -1.9), (-1.7, -1.7), (-2.05, -1.35), (-2.3, -1.0), (-2.5, -0.72),
            (-2.42, -0.5), (-2.1, -0.42), (-1.75, -0.5), (-1.45, -0.72), (-1.1, -1.0), (-0.9, -1.3)]
    d.polygon(rpoly(head), fill=body); sd.polygon(rpoly(head), fill=255)
    d.polygon(rpoly([(-1.55, -0.62), (-2.1, -0.45), (-2.42, -0.5), (-2.38, -0.66), (-1.9, -0.72)]), fill=dark)
    # stripes: slanted bands over body + head, horizontal bands on the legs
    st = Image.new("RGBA", (SW, SH), (0, 0, 0, 0)); td = ImageDraw.Draw(st)
    for k in range(10):
        bx = -1.3 + k * 0.29
        td.polygon(rpoly([(bx - 0.05, -2.1), (bx + 0.05, -2.1), (bx + 0.16, -0.45), (bx + 0.02, -0.45)]), fill=ink)
    for k in range(4):
        hx = -0.95 - k * 0.22
        td.polygon(rpoly([(hx - 0.04, -2.1), (hx + 0.04, -2.1), (hx - 0.45, -1.3), (hx - 0.55, -1.3)]), fill=ink)
    lay.paste(st, (0, 0), Image.fromarray(np.minimum(np.array(shapes), np.array(st)[:, :, 3]), "L"))
    lst = Image.new("RGBA", (SW, SH), (0, 0, 0, 0)); ltd = ImageDraw.Draw(lst)
    for yy in (-0.36, -0.58, -0.8):
        ltd.polygon(rpoly([(-1.3, yy), (1.3, yy), (1.3, yy + 0.045), (-1.3, yy + 0.045)]), fill=ink)
    lay.paste(lst, (0, 0), Image.fromarray(np.minimum(np.array(legs), np.array(lst)[:, :, 3]), "L"))
    d = ImageDraw.Draw(lay)
    # mane, pointed ear, eye, nostril
    d.polygon(rpoly([(-1.15, -1.86), (-0.95, -2.1), (-0.6, -2.14), (-0.25, -2.07), (0.05, -1.9), (-0.3, -1.9), (-0.7, -1.92), (-1.0, -1.86)]), fill=ink)
    d.polygon(rpoly([(-1.22, -1.9), (-1.34, -2.32), (-1.06, -2.18), (-1.0, -1.9)]), fill=body)
    d.polygon(rpoly([(-1.21, -1.94), (-1.29, -2.2), (-1.1, -2.1)]), fill=(120, 100, 110))
    d.ellipse([P(*rp(-1.82, -1.32)), P(*rp(-1.72, -1.22))], fill=(30, 28, 32))
    d.ellipse([P(*rp(-2.42, -0.62)), P(*rp(-2.35, -0.55))], fill=(52, 50, 54))
    return lay


ZEBRA = draw_zebra()


def draw_zebra_tail(d, t):
    sw = 0.12 * math.sin(t * 1.4) + 0.05 * math.sin(t * 3.7)
    pts = [rp(1.25, -1.6), rp(1.42 + sw, -1.2), rp(1.5 + sw * 2, -0.85)]
    d.line([P(*p) for p in pts], fill=(244, 240, 234), width=5 * SS, joint="curve")
    d.line([P(*rp(1.46 + sw * 2, -1.0)), P(*rp(1.62 + sw * 2, -0.62))], fill=(42, 38, 42), width=7 * SS)


# ---------------------------------------------------------------- snow puff that hides the swap
N_PUFF = 46
PUFF = [dict(x=RHINO_X + prng.uniform(-260, 190), y=GROUND_Y - prng.uniform(0, 210),
             t0=T_TOUCH + prng.uniform(0.0, 0.45), life=prng.uniform(0.9, 1.4), r=prng.uniform(28, 62), vy=prng.uniform(20, 60))
        for _ in range(N_PUFF)]


def puff_layer(t):
    if t < T_TOUCH or t > T_TOUCH + 2.0:
        return None
    lay = Image.new("RGBA", (SW, SH), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    for p in PUFF:
        u = (t - p['t0']) / p['life']
        if u < 0 or u > 1:
            continue
        r = p['r'] * (0.5 + 0.8 * u)
        y = p['y'] - p['vy'] * u
        a = int(235 * (1 - u) ** 1.3)
        d.ellipse([P(p['x'] - r, y - r * 0.9), P(p['x'] + r, y + r * 0.9)], fill=(246, 249, 255, a))
    return lay


# ---------------------------------------------------------------- man (walk, pause + look back, walk on, touch)
def man_state(t):
    walking = 0.0
    if t < T_ENTER:
        x = X_START
    elif t < T_PAUSE0:
        u = (t - T_ENTER) / (T_PAUSE0 - T_ENTER)
        ue = u if u < 0.8 else 0.8 + 0.2 * (1 - (1 - (u - 0.8) / 0.2) ** 2)
        x, walking = X_START + (X_PAUSE - X_START) * ue, 1.0
    elif t < T_PAUSE1:
        x = X_PAUSE
    elif t < T_STOP:
        u = (t - T_PAUSE1) / (T_STOP - T_PAUSE1)
        ue = u * u / 0.15 * 0.5 if u < 0.15 else (0.075 + (u - 0.15) if u < 0.85 else 0.775 + 0.15 * (1 - (1 - (u - 0.85) / 0.15) ** 2))
        ue = ue / 0.925
        x, walking = X_PAUSE + (X_STOP - X_PAUSE) * ue, 1.0
    else:
        x = X_STOP
    phase = (x - X_START) / STRIDE * 2 * math.pi
    stand1 = smooth(T_PAUSE0 - 0.35, T_PAUSE0 + 0.3, t) * (1 - smooth(T_PAUSE1 - 0.2, T_PAUSE1 + 0.4, t))
    stand2 = smooth(T_STOP - 0.35, T_STOP + 0.45, t)
    stand = max(stand1, stand2)
    reach = smooth(T_REACH0, T_REACH1, t) * (1 - smooth(T_ARM_DOWN0, T_ARM_DOWN1, t))
    look = smooth(T_LOOK0 - 0.25, T_LOOK0, t) * (1 - smooth(T_LOOK1, T_LOOK1 + 0.3, t))
    return x, phase, stand, reach, look


FONT_Q = ImageFont.truetype(FONT_BOLD, 30)


def draw_man(d, t):
    x, ph, stand, reach, look = man_state(t)
    if x < -60:
        return
    Hm = MAN_H
    bob = (1 - stand) * 3.0 * abs(math.cos(ph))
    hip = (x, GROUND_Y - 0.5 * Hm - bob)
    sh = (x, GROUND_Y - 0.82 * Hm - bob)
    L1, L2 = 0.27 * Hm, 0.25 * Hm
    legw, armw = 0.085 * Hm, 0.07 * Hm

    def leg(phase, near):
        th1 = math.radians(24) * math.sin(phase) * (1 - stand) + (math.radians(6) if near else math.radians(-6)) * stand
        bend = math.radians(46) * max(0.0, math.cos(phase)) * (1 - stand)
        knee = (hip[0] + L1 * math.sin(th1), hip[1] + L1 * math.cos(th1))
        ankle = (knee[0] + L2 * math.sin(th1 - bend), knee[1] + L2 * math.cos(th1 - bend))
        col = PANTS if near else PANTS_D
        seg(d, hip, knee, col, legw)
        seg(d, knee, ankle, col, legw * 0.9)
        fx = 0.09 * Hm
        d.polygon(poly([(ankle[0] - fx * 0.35, ankle[1] - 4), (ankle[0] + fx, ankle[1] - 2), (ankle[0] + fx, ankle[1] + 6), (ankle[0] - fx * 0.4, ankle[1] + 6)]), fill=BOOT)

    def arm(phase, near):
        swing = math.radians(28) * math.sin(phase) * (1 - stand)
        if near:
            ang_v = swing * (1 - reach) + (math.pi / 2 - REACH_ANG) * reach
            elbow = (sh[0] + L_ARM1 * math.sin(ang_v), sh[1] + L_ARM1 * math.cos(ang_v))
            fa = ang_v + math.radians(12) * (1 - reach)
            hand = (elbow[0] + L_ARM2 * math.sin(fa), elbow[1] + L_ARM2 * math.cos(fa))
        else:
            ang_v = swing
            elbow = (sh[0] + L_ARM1 * math.sin(ang_v), sh[1] + L_ARM1 * math.cos(ang_v))
            fa = ang_v + math.radians(14)
            hand = (elbow[0] + L_ARM2 * math.sin(fa), elbow[1] + L_ARM2 * math.cos(fa))
        col = JACKET if near else JACKET_D
        seg(d, sh, elbow, col, armw)
        seg(d, elbow, hand, col, armw * 0.9)
        r = 0.035 * Hm
        d.ellipse([P(hand[0] - r, hand[1] - r), P(hand[0] + r, hand[1] + r)], fill=GLOVE)

    leg(ph + math.pi, False)
    arm(ph, False)
    tw = 0.19 * Hm
    d.polygon(poly([(sh[0] - tw / 2, sh[1] - 4), (sh[0] + tw / 2, sh[1] - 4), (hip[0] + tw * 0.42, hip[1] + 6), (hip[0] - tw * 0.42, hip[1] + 6)]), fill=JACKET)
    d.polygon(poly([(sh[0] - tw / 2, sh[1] - 4), (sh[0] - tw / 2 + 8, sh[1] - 4), (hip[0] - tw * 0.42 + 8, hip[1] + 6), (hip[0] - tw * 0.42, hip[1] + 6)]), fill=JACKET_D)
    d.ellipse([P(sh[0] - tw * 0.5, sh[1] - 16), P(sh[0] + tw * 0.5, sh[1] + 4)], fill=JACKET_D)
    leg(ph, True)
    hr = 0.075 * Hm
    flip = look > 0.5
    hc = (sh[0] + 3 - 8 * look, sh[1] - 14 - hr * 1.6)
    seg(d, (sh[0], sh[1]), (hc[0], hc[1] + hr * 1.2), SKIN, hr * 0.8)
    mouth = 'flat' if t < T_REACH1 else ('open' if t < 16.0 else 'smile')
    if flip:
        mouth = 'open' if 6.2 < t < 7.2 else 'flat'
    spr = SPRITES[mouth]
    if flip:
        spr = spr.transpose(Image.FLIP_LEFT_RIGHT)
    S = 0.27 * Hm * SS
    scale = S / 480.0
    w, h = int(spr.width * scale), int(spr.height * scale)
    im = spr.resize((w, h), Image.LANCZOS)
    ox = int(hc[0] * SS - (spr.width - 350 if flip else 350) * scale)
    oy = int(hc[1] * SS - 400 * scale)
    IMG_REF[0].alpha_composite(im, (ox, oy))
    d = ImageDraw.Draw(IMG_REF[0])
    if look > 0.5:
        # a small "?" over the head while he looks back
        qa = int(255 * smooth(T_LOOK0 + 0.2, T_LOOK0 + 0.5, t) * (1 - smooth(T_LOOK1 - 0.2, T_LOOK1 + 0.1, t)))
        if qa > 0:
            qx, qy = hc[0] - 2, hc[1] - hr * 2.2 - 34 + 3 * math.sin(t * 5)
            d.text(P(qx + 2, qy + 2), "?", font=FONT_Q, fill=(10, 14, 30, int(qa * 0.55)))
            d.text(P(qx, qy), "?", font=FONT_Q, fill=(255, 226, 120, qa))
    arm(ph + math.pi, True)


# ---------------------------------------------------------------- camera, glow, text
def camera(t):
    z = 1.0 + 0.16 * smooth(T_PAUSE1, T_REACH1, t) - 0.16 * smooth(T_MORPH1 + 0.3, 17.0, t)
    cx = 704 + 56 * smooth(T_PAUSE1, T_REACH1, t) - 56 * smooth(T_MORPH1 + 0.3, 17.0, t)
    cy = 420 + 30 * smooth(T_PAUSE1, T_REACH1, t) - 50 * smooth(T_MORPH1 + 0.3, 17.0, t)
    return z, cx, cy


def touch_glow(t):
    a = smooth(T_REACH1 - 0.2, T_TOUCH, t) * (1 - smooth(T_TOUCH + 0.3, T_TOUCH + 1.1, t))
    if a <= 0:
        return None
    lay = Image.new("RGBA", (SW, SH), (0, 0, 0, 0))
    dd = ImageDraw.Draw(lay)
    for k, r in enumerate((44, 30, 18, 9)):
        dd.ellipse([P(TOUCH[0] - r, TOUCH[1] - r), P(TOUCH[0] + r, TOUCH[1] + r)], fill=(255, 240, 210, int(a * (35 + k * 40))))
    return lay


FONT_SUB = ImageFont.truetype(FONT_BOLD, 24)


def text_layer(a_big, a_sub):
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    txt = "False positive"
    bb = d.textbbox((0, 0), txt, font=FONT)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    x, y = (W - tw) / 2 - bb[0], 98 - th / 2 - bb[1]
    a = int(255 * a_big)
    d.text((x + 2, y + 2), txt, font=FONT, fill=(10, 14, 30, int(a * 0.55)))
    d.text((x, y), txt, font=FONT, fill=(255, 252, 246, a))
    sub = "a real sequence. the wrong label"
    bb = d.textbbox((0, 0), sub, font=FONT_SUB)
    tw = bb[2] - bb[0]
    x, y = (W - tw) / 2 - bb[0], 140 - bb[1]
    a = int(255 * a_sub)
    d.text((x + 1, y + 1), sub, font=FONT_SUB, fill=(10, 14, 30, int(a * 0.55)))
    d.text((x, y), sub, font=FONT_SUB, fill=(255, 226, 120, a))
    return lay


def render_frame(f):
    t = f / FPS
    sky = SKY.copy()
    au = aurora(t)
    sky[:AUR_ROWS] += au[:, :, None] * (AUR_COL - sky[:AUR_ROWS])
    img = Image.fromarray(np.clip(sky, 0, 255).astype(np.uint8), "RGB").convert("RGBA")
    img = Image.alpha_composite(img, MOUNTAINS)
    # shadow (stays: the animal stays)
    sh = Image.new("RGBA", (SW, SH), (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse([P(*rp(-2.3, -0.22)), P(*rp(1.55, 0.2))], fill=(70, 80, 120, 70))
    img = Image.alpha_composite(img, sh)
    # rhino -> zebra crossfade
    u = smooth(T_MORPH0, T_MORPH1, t)
    if u < 1:
        rh = RHINO.copy()
        draw_rhino_tail(ImageDraw.Draw(rh), t)
        if u > 0:
            arr = np.array(rh); arr[:, :, 3] = (arr[:, :, 3] * (1 - u)).astype(np.uint8); rh = Image.fromarray(arr, "RGBA")
        img = Image.alpha_composite(img, rh)
    if u > 0:
        zb = ZEBRA.copy()
        draw_zebra_tail(ImageDraw.Draw(zb), t)
        if u < 1:
            arr = np.array(zb); arr[:, :, 3] = (arr[:, :, 3] * u).astype(np.uint8); zb = Image.fromarray(arr, "RGBA")
        img = Image.alpha_composite(img, zb)
    IMG_REF[0] = img
    d = ImageDraw.Draw(img)
    draw_man(d, t)
    img = IMG_REF[0]
    g = touch_glow(t)
    if g is not None:
        img = Image.alpha_composite(img, g)
    pl = puff_layer(t)
    if pl is not None:
        img = Image.alpha_composite(img, pl)
    d = ImageDraw.Draw(img)
    draw_snow(d, t)
    z, cx, cy = camera(t)
    cw, ch = BW / z, BH / z
    x0 = clamp(cx - cw / 2, 0, BW - cw)
    y0 = clamp(cy - ch / 2, 0, BH - ch)
    box = (int(x0 * SS), int(y0 * SS), int((x0 + cw) * SS), int((y0 + ch) * SS))
    out = img.convert("RGB").resize((W, H), Image.LANCZOS, box=box)
    arr = np.asarray(out).astype(np.float32) * VIGNETTE
    flash = smooth(T_TOUCH, T_TOUCH + 0.08, t) * (1 - smooth(T_TOUCH + 0.08, T_TOUCH + 0.45, t)) * 0.85
    arr = arr * (1 - flash) + 255 * flash
    fade = smooth(0.0, 1.2, t) * (1 - smooth(T_FADEOUT, DUR - 0.05, t))
    arr *= fade
    out = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")
    ta, sa = smooth(T_TEXT0, T_TEXT1, t) * fade, smooth(T_SUB0, T_SUB1, t) * fade
    if ta > 0:
        out = Image.alpha_composite(out.convert("RGBA"), text_layer(ta, sa)).convert("RGB")
    out.save(os.path.join(OUT, f"{f:04d}.png"), compress_level=1)


if __name__ == "__main__":
    frames = [int(a) for a in sys.argv[2:]] if len(sys.argv) > 2 else None
    if frames is None:
        rng_f = range(NF)
    elif len(frames) == 2:
        rng_f = range(frames[0], NF, frames[1])
    else:
        rng_f = frames
    for f in rng_f:
        render_frame(f)
        if f % 30 == 0:
            print("frame", f, flush=True)
