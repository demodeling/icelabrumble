import math, os, sys, random
import numpy as np
from PIL import Image, ImageDraw, ImageFont

# ---------------------------------------------------------------- config
W, H = 640, 360             # output (compact, for embedding)
BW, BH = 1408, 792          # base scene canvas (camera crops inside it)
SS = 1                      # no supersampling needed at this output size
SW, SH = BW * SS, BH * SS
FPS, DUR = 30, 20
NF = FPS * DUR
OUT = sys.argv[1] if len(sys.argv) > 1 else "frames_cut"
os.makedirs(OUT, exist_ok=True)

GROUND_Y = 640
RHINO_X, RHINO_S = 880, 110
MAN_H = 175
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

# timeline (seconds)
T_MAN_ENTER, T_MAN_STOP = 2.5, 11.0
T_REACH0, T_REACH1 = 11.2, 12.5
T_TOUCH = 13.0
T_DISSOLVE_END = 15.5
T_ARM_DOWN0, T_ARM_DOWN1 = 16.5, 18.0
T_TEXT0, T_TEXT1 = 17.0, 18.2
T_FADEOUT = 19.2

rng = np.random.default_rng(7)
random.seed(7)


def P(x, y):
    return (x * SS, y * SS)


def poly(pts):
    return [(x * SS, y * SS) for x, y in pts]


def clamp(v, a, b):
    return max(a, min(b, v))


def smooth(a, b, x):
    t = clamp((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def ease_io(t):
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------- static background
def build_sky():
    y = np.linspace(0, 1, SH)[:, None]
    top = np.array([16, 26, 58], float)
    mid = np.array([74, 96, 150], float)
    hor = np.array([238, 176, 128], float)
    horizon = 470 / BH
    sky = np.zeros((SH, SW, 3), float)
    t1 = np.clip(y / (horizon * 0.65), 0, 1)
    t2 = np.clip((y - horizon * 0.65) / (horizon * 0.35), 0, 1)
    col = top * (1 - t1) + mid * t1
    col = col * (1 - t2) + hor * t2
    sky[:] = col[:, :, None].transpose(0, 2, 1) if False else np.broadcast_to(col[:, None, :], (SH, SW, 3))
    # sun glow
    xs = np.arange(SW)[None, :] / SS
    ys = np.arange(SH)[:, None] / SS
    sx, sy = 330, 447
    d = np.hypot(xs - sx, ys - sy)
    glow = np.exp(-(d / 260.0) ** 2) * 0.55 + np.exp(-(d / 70.0) ** 2) * 0.6
    sun = np.array([255, 214, 150], float)
    sky = sky + glow[:, :, None] * (sun - sky) * 0.9
    disc = np.clip((36 - d) / 2.0, 0, 1)
    sky = sky + disc[:, :, None] * (np.array([255, 236, 190], float) - sky)
    return np.clip(sky, 0, 255).astype(np.float32)


SKY = build_sky()
XS_B = (np.arange(SW) / SS).astype(np.float32)
AUR_ROWS = 340 * SS
YS_A = (np.arange(AUR_ROWS) / SS).astype(np.float32)[:, None]


def aurora(t):
    x = XS_B[None, :]
    y0 = 150 + 45 * np.sin(x / 320 + t * 0.25) + 22 * np.sin(x / 140 - t * 0.4 + 1.3)
    thick = 55 + 15 * np.sin(x / 200 + t * 0.2)
    band = np.exp(-((YS_A - y0) / thick) ** 2)
    curtain = 0.55 + 0.45 * np.sin(x / 38 + t * 0.9) * np.sin(x / 91 - t * 0.35)
    fade = np.clip(1 - YS_A / 340.0, 0, 1)
    inten = band * curtain * fade * 0.42
    return inten.astype(np.float32)


AUR_COL = np.array([90, 235, 150], np.float32)


def ridge(draw, pts, color, snow=None, snow_h=0):
    draw.polygon(poly(pts + [(BW + 50, BH + 50), (-50, BH + 50)]), fill=color)
    if snow:
        # snow caps: for each peak (local maxima) draw a small cap polygon
        for i in range(1, len(pts) - 1):
            x, y = pts[i]
            if y < pts[i - 1][1] and y < pts[i + 1][1]:
                xl, yl = pts[i - 1]
                xr, yr = pts[i + 1]
                fl = min(1, snow_h / max(1, yl - y))
                fr = min(1, snow_h / max(1, yr - y))
                cap = [(x, y), (x + (xr - x) * fr, y + (yr - y) * fr),
                       (x + (xr - x) * fr * 0.55, y + (yr - y) * fr * 0.8),
                       (x + (xl - x) * fl * 0.6, y + (yl - y) * fl * 0.85),
                       (x + (xl - x) * fl, y + (yl - y) * fl)]
                draw.polygon(poly(cap), fill=snow)


def draw_tree(draw, x, y, size, depth, ang=-math.pi / 2, width=None, color=(58, 44, 40)):
    if depth == 0 or size < 2:
        return
    w = width if width is not None else max(1, size * 0.09)
    x2 = x + math.cos(ang) * size
    y2 = y + math.sin(ang) * size
    draw.line([P(x, y), P(x2, y2)], fill=color, width=max(1, int(w * SS)))
    n = 2 if depth > 2 else 3
    for _ in range(n):
        a = ang + random.uniform(-0.75, 0.75)
        draw_tree(draw, x2, y2, size * random.uniform(0.55, 0.75), depth - 1, a, w * 0.65, color)


def build_mountains():
    layer = Image.new("RGBA", (SW, SH), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    # far ridge
    far = [(-50, 470), (60, 440), (150, 400), (240, 430), (330, 392), (420, 428), (520, 372), (600, 404),
           (700, 356), (790, 396), (880, 362), (960, 402), (1060, 380), (1150, 410), (1250, 370), (1340, 412), (1460, 440)]
    ridge(d, far, (146, 152, 196), snow=(214, 214, 236), snow_h=28)
    # mid ridge incl. Kiirunavaara-style terraced mine mountain on the right
    mid = [(-50, 520), (40, 500), (140, 470), (230, 500), (300, 476), (380, 512), (470, 456), (560, 498),
           (640, 470), (720, 506), (800, 488), (870, 520), (940, 512), (1010, 470), (1040, 452), (1130, 440),
           (1230, 446), (1300, 470), (1360, 500), (1460, 530)]
    ridge(d, mid, (98, 108, 152), snow=(176, 184, 214), snow_h=22)
    # terraces on the mine mountain
    for i, (yy, x0, x1) in enumerate([(458, 1055, 1215), (472, 1040, 1250), (486, 1028, 1275), (500, 1018, 1300), (514, 1008, 1330)]):
        d.line([P(x0, yy), P(x1, yy)], fill=(140, 148, 186), width=2 * SS)
        d.line([P(x0, yy + 3), P(x1, yy + 3)], fill=(76, 84, 124), width=1 * SS)
    # mist band above near hills
    mist = Image.new("RGBA", (SW, SH), (0, 0, 0, 0))
    ma = np.zeros((SH, SW, 4), np.uint8)
    ys = np.arange(SH) / SS
    a = np.clip(1 - np.abs(ys - 528) / 42.0, 0, 1) ** 1.5 * 150
    ma[:, :, :3] = 226
    ma[:, :, 3] = a[:, None].astype(np.uint8)
    layer = Image.alpha_composite(layer, Image.fromarray(ma, "RGBA"))
    d = ImageDraw.Draw(layer)
    # near snowy hills
    near = [(-50, 585), (80, 560), (200, 548), (330, 566), (450, 538), (560, 556), (690, 542), (820, 562),
            (960, 546), (1100, 566), (1230, 548), (1360, 568), (1460, 580)]
    ridge(d, near, (206, 214, 232))
    shade = [(450, 538), (560, 556), (520, 572), (400, 566)]
    d.polygon(poly(shade), fill=(186, 198, 222))
    shade = [(1230, 548), (1360, 568), (1300, 580), (1180, 572)]
    d.polygon(poly(shade), fill=(186, 198, 222))
    # ground plane (snow) with vertical gradient
    ga = np.zeros((SH, SW, 4), np.uint8)
    g0, g1 = np.array([236, 240, 247]), np.array([204, 214, 234])
    tt = np.clip((ys - 575) / (BH - 575), 0, 1)[:, None, None]
    ga[:, :, :3] = (g0 * (1 - tt) + g1 * tt).astype(np.uint8)
    ga[:, :, 3] = (np.clip((ys - 570) / 8.0, 0, 1) * 255).astype(np.uint8)[:, None]
    layer = Image.alpha_composite(layer, Image.fromarray(ga, "RGBA"))
    d = ImageDraw.Draw(layer)
    # wind-blown snow streaks
    for i in range(70):
        x = random.uniform(-50, BW + 50)
        y = random.uniform(600, BH)
        ln = random.uniform(40, 220) * (0.5 + (y - 600) / 200)
        d.line([P(x, y), P(x + ln, y + random.uniform(-2, 2))], fill=(222, 228, 242), width=1 * SS)
    for i in range(35):
        x = random.uniform(-50, BW + 50)
        y = random.uniform(600, BH)
        ln = random.uniform(20, 120)
        d.line([P(x, y), P(x + ln, y)], fill=(248, 250, 255), width=1 * SS)
    # rocks
    for (x, y, w, h) in [(180, 622, 46, 18), (1010, 612, 30, 12), (1250, 690, 70, 26), (420, 700, 40, 16), (760, 606, 24, 9)]:
        d.ellipse([P(x - w / 2, y - h), P(x + w / 2, y + h * 0.3)], fill=(92, 92, 104))
        d.ellipse([P(x - w / 2 + 3, y - h), P(x + w / 2 - 3, y - h * 0.3)], fill=(232, 236, 246))
    # dwarf birches (background small, foreground larger)
    for (x, y, s) in [(90, 598, 26), (260, 592, 22), (1120, 596, 24), (1210, 604, 30), (560, 596, 20), (1370, 600, 28)]:
        draw_tree(d, x, y, s, 4)
    draw_tree(d, 1335, 770, 78, 5, width=6)
    draw_tree(d, 60, 745, 62, 5, width=5)
    return layer


MOUNTAINS = build_mountains()


# ---------------------------------------------------------------- rhino
def rp(u, v, s=RHINO_S, ox=RHINO_X, oy=GROUND_Y):
    """rhino local units (x left-negative = front, y up-negative) -> base coords"""
    return (ox + u * s, oy + v * s)


def rpoly(pts):
    return poly([rp(u, v) for u, v in pts])


def draw_rhino_body(d):
    body = (108, 104, 108)
    dark = (78, 74, 80)
    light = (134, 130, 134)
    # back legs (far side) darker
    for lx in (0.62, -0.62):
        d.polygon(rpoly([(lx - 0.17, -0.9), (lx + 0.17, -0.9), (lx + 0.2, -0.02), (lx - 0.22, -0.02)]), fill=dark)
    # body
    d.ellipse([P(*rp(-1.35, -1.85)), P(*rp(1.3, -0.5))], fill=body)
    # hump / shoulder
    d.ellipse([P(*rp(-1.3, -1.98)), P(*rp(-0.3, -1.2))], fill=body)
    # rump
    d.ellipse([P(*rp(0.45, -1.9)), P(*rp(1.32, -1.0))], fill=body)
    # belly shade
    d.ellipse([P(*rp(-1.1, -1.1)), P(*rp(1.15, -0.5))], fill=dark)
    d.ellipse([P(*rp(-1.25, -1.72)), P(*rp(1.1, -0.9))], fill=body)
    # top highlight
    d.ellipse([P(*rp(-1.1, -1.9)), P(*rp(0.9, -1.45))], fill=light)
    d.ellipse([P(*rp(-1.05, -1.78)), P(*rp(0.95, -1.15))], fill=body)
    # near legs
    for lx in (0.92, -0.9):
        d.polygon(rpoly([(lx - 0.18, -0.95), (lx + 0.18, -0.95), (lx + 0.22, -0.02), (lx - 0.24, -0.02)]), fill=body)
        d.polygon(rpoly([(lx - 0.24, -0.14), (lx + 0.22, -0.14), (lx + 0.22, -0.02), (lx - 0.24, -0.02)]), fill=dark)
    # head + neck
    d.polygon(rpoly([(-0.85, -1.95), (-1.25, -1.9), (-1.7, -1.7), (-2.05, -1.35), (-2.3, -1.0), (-2.5, -0.72),
                     (-2.42, -0.5), (-2.1, -0.42), (-1.75, -0.5), (-1.45, -0.72), (-1.1, -1.0), (-0.9, -1.3)]), fill=body)
    # jaw / cheek shading
    d.polygon(rpoly([(-1.55, -0.62), (-2.1, -0.45), (-2.42, -0.5), (-2.38, -0.66), (-1.9, -0.72)]), fill=dark)
    # skin folds
    d.line([P(*rp(-1.0, -1.8)), P(*rp(-0.9, -1.2))], fill=dark, width=2 * SS)
    d.line([P(*rp(-0.2, -1.35)), P(*rp(-0.1, -0.75))], fill=dark, width=1 * SS)
    d.line([P(*rp(0.5, -1.75)), P(*rp(0.65, -1.1))], fill=dark, width=2 * SS)
    d.line([P(*rp(-1.35, -1.55)), P(*rp(-1.15, -1.05))], fill=dark, width=1 * SS)
    # horns
    horn = (176, 168, 156)
    d.polygon(rpoly([(-2.47, -0.88), (-2.05, -0.95), (-2.62, -1.7), (-2.6, -1.5)]), fill=horn)
    d.polygon(rpoly([(-2.02, -1.02), (-1.75, -1.15), (-2.0, -1.45)]), fill=horn)
    # ear
    d.polygon(rpoly([(-1.25, -1.88), (-1.32, -2.2), (-1.12, -2.12), (-1.05, -1.9)]), fill=body)
    d.polygon(rpoly([(-1.24, -1.92), (-1.28, -2.12), (-1.14, -2.08)]), fill=dark)
    # eye
    d.ellipse([P(*rp(-1.82, -1.32)), P(*rp(-1.72, -1.22))], fill=(30, 28, 32))
    # nostril
    d.ellipse([P(*rp(-2.42, -0.62)), P(*rp(-2.35, -0.55))], fill=(52, 50, 54))


def draw_rhino_tail(d, t):
    body = (108, 104, 108)
    sw = 0.12 * math.sin(t * 1.4) + 0.05 * math.sin(t * 3.7)
    pts = [rp(1.25, -1.6), rp(1.42 + sw, -1.2), rp(1.5 + sw * 2, -0.85)]
    d.line([P(*p) for p in pts], fill=body, width=5 * SS, joint="curve")
    d.ellipse([P(*rp(1.42 + sw * 2, -0.98)), P(*rp(1.6 + sw * 2, -0.72))], fill=(70, 66, 70))


RHINO = Image.new("RGBA", (SW, SH), (0, 0, 0, 0))
draw_rhino_body(ImageDraw.Draw(RHINO))
RHINO_ARR = np.array(RHINO)

# touch point on top of the snout / horn base
TOUCH = rp(-2.15, -0.98)

# distance map for the dissolve (base px)
_gy, _gx = np.mgrid[0:SH, 0:SW]
DIST = np.hypot(_gx / SS - TOUCH[0], _gy / SS - TOUCH[1]).astype(np.float32)
del _gx, _gy
R_MAX = 440.0


def dissolve_radius(t):
    if t < T_TOUCH:
        return -1.0
    u = clamp((t - T_TOUCH) / (T_DISSOLVE_END - T_TOUCH), 0, 1)
    return R_MAX * (u ** 1.5)


# ---------------------------------------------------------------- birds
N_BIRDS = 1000
mask = RHINO_ARR[:, :, 3] > 128
ys_m, xs_m = np.nonzero(mask)
sel = rng.choice(len(xs_m), N_BIRDS, replace=False)
B_P0 = np.stack([xs_m[sel] / SS, ys_m[sel] / SS], 1).astype(np.float32)   # spawn points (base coords)
b_d = np.hypot(B_P0[:, 0] - TOUCH[0], B_P0[:, 1] - TOUCH[1])
B_T0 = T_TOUCH + (T_DISSOLVE_END - T_TOUCH) * np.clip(b_d / R_MAX, 0, 1) ** (1 / 1.5) + rng.uniform(-0.05, 0.12, N_BIRDS)
_dir = B_P0 - np.array(TOUCH)
_dir[:, 1] -= 0.8 * b_d           # upward bias
_dir += rng.normal(0, 40, _dir.shape)
_dir /= np.linalg.norm(_dir, axis=1, keepdims=True) + 1e-6
B_DIR = _dir.astype(np.float32)
B_VB = rng.uniform(160, 330, N_BIRDS).astype(np.float32)
B_R = (70 + 190 * rng.uniform(0, 1, N_BIRDS) ** 0.6).astype(np.float32)
B_TH = rng.uniform(0, 2 * math.pi, N_BIRDS).astype(np.float32)
B_OM = rng.uniform(0.9, 1.5, N_BIRDS).astype(np.float32)
B_PH = rng.uniform(0, 2 * math.pi, N_BIRDS).astype(np.float32)
B_FQ = rng.uniform(4.5, 8.0, N_BIRDS).astype(np.float32)
B_SZ = rng.uniform(6.5, 11.0, N_BIRDS).astype(np.float32)
B_SHADE = rng.integers(18, 48, N_BIRDS)


def flock_center(t):
    u = smooth(T_TOUCH + 0.5, 19.5, t)
    x = RHINO_X - 40 + (1260 - (RHINO_X - 40)) * u ** 1.3
    y = 470 + (40 - 470) * u
    return x, y


def draw_birds(d, t):
    age = t - B_T0
    alive = age > 0
    if not alive.any():
        return
    a = age[alive]
    p0 = B_P0[alive]
    tau = 0.7
    burst = p0 + B_DIR[alive] * (B_VB[alive] * tau * (1 - np.exp(-a / tau)))[:, None]
    burst[:, 1] -= 30 * a ** 1.4
    cx, cy = flock_center(t)
    th = B_TH[alive] + B_OM[alive] * a
    orb = np.stack([cx + B_R[alive] * np.cos(th), cy + 0.55 * B_R[alive] * np.sin(th)], 1)
    w = np.clip((a - 0.7) / 1.8, 0, 1)
    w = w * w * (3 - 2 * w)
    pos = burst * (1 - w[:, None]) + orb * w[:, None]
    pos[:, 1] += 3 * np.sin(2 * math.pi * 2.5 * t + B_PH[alive])
    shrink = 1 - 0.6 * smooth(15.5, 19.8, t)
    sz = B_SZ[alive] * shrink
    flap = np.sin(2 * math.pi * B_FQ[alive] * t + B_PH[alive])
    dy = sz * 0.75 * flap
    xs, ys = pos[:, 0], pos[:, 1]
    shade = B_SHADE[alive]
    wd = max(1, int(round(2.2 * SS * shrink)))
    for i in range(len(a)):
        c = int(shade[i])
        col = (c, c, c + 8)
        x, y = xs[i], ys[i]
        d.line([P(x - sz[i], y - dy[i]), P(x, y + sz[i] * 0.15), P(x + sz[i], y - dy[i])], fill=col, width=wd, joint="curve")


# ---------------------------------------------------------------- man
SH_Y = GROUND_Y - 0.82 * MAN_H
L_ARM1, L_ARM2 = 0.22 * MAN_H, 0.20 * MAN_H
_reach_len = L_ARM1 + L_ARM2
_dy = TOUCH[1] - SH_Y
_dx = math.sqrt(max(1, _reach_len ** 2 - _dy ** 2))
X_STOP = TOUCH[0] - _dx
REACH_ANG = math.atan2(_dy, _dx)      # radians below horizontal
X_START = -90
STRIDE = 92.0

JACKET = (52, 64, 98)
JACKET_D = (36, 46, 74)
CHAR = os.environ.get('CHAR', 'albertas')
SHIRTS = {'albertas': (47, 58, 90), 'bjorn': (62, 60, 72), 'bea': (90, 94, 110), 'annamia': (233, 229, 220), 'per': (58, 58, 66), 'marco': (38, 38, 46), 'jose': (45, 51, 70), 'mike': (31, 31, 38), 'daniel': (31, 61, 52), 'henrik': (59, 95, 168), 'anton': (110, 58, 58)}
PROPS = {'anton': 'stick'}   # innebandy stick in the near hand
SPRITES = {m: Image.open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sprites', 'sprite_%s_%s.png' % (CHAR, m))).convert('RGBA') for m in ('flat', 'open', 'smile')}
IMG_REF = [None]
JACKET = SHIRTS[CHAR]
JACKET_D = tuple(max(0, c - 18) for c in JACKET)
PANTS = (38, 42, 64)
PANTS_D = (26, 30, 46)
BOOT = (30, 28, 30)
SKIN = (226, 186, 158)
HAT = (52, 64, 104)
GLOVE = (40, 40, 48)


def man_state(t):
    if t < T_MAN_ENTER:
        x, walking = X_START, 0.0
    elif t < T_MAN_STOP:
        u = (t - T_MAN_ENTER) / (T_MAN_STOP - T_MAN_ENTER)
        # constant speed, slowing down over the last stretch
        ue = u if u < 0.85 else 0.85 + 0.15 * (1 - (1 - (u - 0.85) / 0.15) ** 2)
        x = X_START + (X_STOP - X_START) * ue
        walking = 1.0
    else:
        x, walking = X_STOP, 0.0
    phase = (x - X_START) / STRIDE * 2 * math.pi
    stand = smooth(T_MAN_STOP - 0.35, T_MAN_STOP + 0.45, t)
    reach = smooth(T_REACH0, T_REACH1, t) * (1 - smooth(T_ARM_DOWN0, T_ARM_DOWN1, t))
    return x, phase, stand, reach


def seg(d, a, b, col, w):
    d.line([P(*a), P(*b)], fill=col, width=int(w * SS), joint="curve")
    r = w / 2
    for (x, y) in (a, b):
        d.ellipse([P(x - r, y - r), P(x + r, y + r)], fill=col)


def draw_man(d, t):
    x, ph, stand, reach = man_state(t)
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
        # boot
        fx = 0.09 * Hm
        d.polygon(poly([(ankle[0] - fx * 0.35, ankle[1] - 4), (ankle[0] + fx, ankle[1] - 2), (ankle[0] + fx, ankle[1] + 6), (ankle[0] - fx * 0.4, ankle[1] + 6)]), fill=BOOT)

    def arm(phase, near):
        swing = math.radians(28) * math.sin(phase) * (1 - stand)
        if near:
            # blend to reaching pose
            ang_v = swing * (1 - reach) + (math.pi / 2 - REACH_ANG) * reach   # angle from straight-down, forward positive
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
        if near and PROPS.get(CHAR) == 'stick':
            # innebandy stick hangs from the near hand, blade forward; lifts a little while reaching
            sw_a = 1.05 - 0.5 * reach
            sl = 0.5 * Hm
            tip = (hand[0] + math.cos(sw_a) * sl, hand[1] + math.sin(sw_a) * sl)
            bl = (tip[0] + 20 * math.cos(sw_a - 1.1), tip[1] + 20 * math.sin(sw_a - 1.1))
            d.line([P(*hand), P(*tip), P(*bl)], fill=(26, 20, 30), width=int(9 * SS), joint="curve")
            d.line([P(*hand), P(*tip)], fill=(244, 244, 240), width=int(4 * SS))
            d.line([P(*hand), P(hand[0] + math.cos(sw_a) * sl * .28, hand[1] + math.sin(sw_a) * sl * .28)], fill=(42, 125, 225), width=int(4 * SS))
            d.line([P(*tip), P(*bl)], fill=(28, 28, 34), width=int(5 * SS))

    # far leg, far arm, torso, near leg, head, near arm
    leg(ph + math.pi, False)
    arm(ph, False)
    tw = 0.19 * Hm
    d.polygon(poly([(sh[0] - tw / 2, sh[1] - 4), (sh[0] + tw / 2, sh[1] - 4), (hip[0] + tw * 0.42, hip[1] + 6), (hip[0] - tw * 0.42, hip[1] + 6)]), fill=JACKET)
    d.polygon(poly([(sh[0] - tw / 2, sh[1] - 4), (sh[0] - tw / 2 + 8, sh[1] - 4), (hip[0] - tw * 0.42 + 8, hip[1] + 6), (hip[0] - tw * 0.42, hip[1] + 6)]), fill=JACKET_D)
    # hood/collar
    d.ellipse([P(sh[0] - tw * 0.5, sh[1] - 16), P(sh[0] + tw * 0.5, sh[1] + 4)], fill=JACKET_D)
    leg(ph, True)
    # neck + cutout head sprite
    hr = 0.075 * Hm
    hc = (sh[0] + 3, sh[1] - 14 - hr * 1.6)
    seg(d, (sh[0], sh[1]), (hc[0], hc[1] + hr * 1.2), SKIN, hr * 0.8)
    mouth = 'flat' if t < 12.4 else ('open' if t < 17.2 else 'smile')
    spr = SPRITES[mouth]
    S = 0.27 * Hm * SS                      # head width in supersampled px
    scale = S / 480.0
    w, h = int(spr.width * scale), int(spr.height * scale)
    im = spr.resize((w, h), Image.LANCZOS)
    ox = int(hc[0] * SS - 350 * scale)
    oy = int(hc[1] * SS - 400 * scale)
    IMG_REF[0].alpha_composite(im, (ox, oy))
    d = ImageDraw.Draw(IMG_REF[0])
    arm(ph + math.pi, True)


# ---------------------------------------------------------------- snow, vignette, text
N_SNOW = 140
S_X = rng.uniform(-60, BW + 60, N_SNOW)
S_Y = rng.uniform(0, BH, N_SNOW)
S_V = rng.uniform(18, 40, N_SNOW)
S_R = rng.uniform(1.2, 3.0, N_SNOW)
S_PH = rng.uniform(0, 6.28, N_SNOW)


def draw_snow(d, t):
    for i in range(N_SNOW):
        y = (S_Y[i] + S_V[i] * t) % (BH + 20) - 10
        x = S_X[i] + 14 * math.sin(t * 0.9 + S_PH[i]) + 9 * t
        x = (x + 60) % (BW + 120) - 60
        r = S_R[i]
        d.ellipse([P(x - r, y - r), P(x + r, y + r)], fill=(246, 249, 255))


_yy, _xx = np.mgrid[0:H, 0:W]
_rr = np.hypot((_xx - W / 2) / (W / 2), (_yy - H / 2) / (H / 2))
VIGNETTE = (1 - 0.38 * np.clip(_rr / 1.25, 0, 1) ** 2.4).astype(np.float32)[:, :, None]
del _yy, _xx, _rr

FONT = ImageFont.truetype(FONT_BOLD, int(96 * W / 1280))
FONT_S = ImageFont.truetype(FONT_BOLD, 26)


def text_layer(alpha):
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    txt = "False positive"
    bb = d.textbbox((0, 0), txt, font=FONT)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    x, y = (W - tw) / 2 - bb[0], 300 * H / 720 - th / 2 - bb[1]
    a = int(255 * alpha)
    d.text((x + 2, y + 2), txt, font=FONT, fill=(10, 14, 30, int(a * 0.55)))
    d.text((x, y), txt, font=FONT, fill=(255, 252, 246, a))
    return lay


def camera(t):
    z = 1.0 + 0.16 * smooth(0.0, T_REACH1, t) - 0.16 * smooth(T_TOUCH + 0.4, 17.0, t)
    cx = 704 + (760 - 704) * smooth(0.0, T_REACH1, t) - (760 - 704) * smooth(T_TOUCH + 0.4, 17.0, t)
    cy = 420 + (450 - 420) * smooth(0.0, T_REACH1, t) - (450 - 400) * smooth(T_TOUCH + 0.4, 17.0, t)
    return z, cx, cy


def touch_glow(d, t):
    a = smooth(T_REACH1 - 0.2, T_TOUCH, t) * (1 - smooth(T_TOUCH + 0.3, T_TOUCH + 1.3, t))
    if a <= 0:
        return None
    lay = Image.new("RGBA", (SW, SH), (0, 0, 0, 0))
    dd = ImageDraw.Draw(lay)
    for k, r in enumerate((44, 30, 18, 9)):
        al = int(a * (35 + k * 40))
        dd.ellipse([P(TOUCH[0] - r, TOUCH[1] - r), P(TOUCH[0] + r, TOUCH[1] + r)], fill=(255, 240, 210, al))
    return lay


def render_frame(f):
    t = f / FPS
    # sky + aurora
    sky = SKY.copy()
    au = aurora(t)
    sky[:AUR_ROWS] += au[:, :, None] * (AUR_COL - sky[:AUR_ROWS]) * 1.0
    img = Image.fromarray(np.clip(sky, 0, 255).astype(np.uint8), "RGB").convert("RGBA")
    img = Image.alpha_composite(img, MOUNTAINS)
    d = ImageDraw.Draw(img)
    # rhino shadow
    R = dissolve_radius(t)
    shade_a = 1.0 - smooth(T_TOUCH, T_DISSOLVE_END, t)
    if shade_a > 0:
        sh = Image.new("RGBA", (SW, SH), (0, 0, 0, 0))
        ImageDraw.Draw(sh).ellipse([P(*rp(-2.3, -0.22)), P(*rp(1.55, 0.2))], fill=(70, 80, 120, int(70 * shade_a)))
        img = Image.alpha_composite(img, sh)
    # rhino
    if t < T_DISSOLVE_END + 0.3:
        rh = RHINO.copy()
        draw_rhino_tail(ImageDraw.Draw(rh), t)
        if R >= 0:
            arr = np.array(rh)
            k = np.clip((DIST - R) / 26.0, 0, 1)
            arr[:, :, 3] = (arr[:, :, 3] * k).astype(np.uint8)
            rh = Image.fromarray(arr, "RGBA")
        img = Image.alpha_composite(img, rh)
    IMG_REF[0] = img
    d = ImageDraw.Draw(img)
    draw_man(d, t)
    img = IMG_REF[0]
    g = touch_glow(d, t)
    if g is not None:
        img = Image.alpha_composite(img, g)
        d = ImageDraw.Draw(img)
    draw_birds(d, t)
    draw_snow(d, t)
    # camera crop
    z, cx, cy = camera(t)
    cw, ch = BW / z, BH / z
    x0 = clamp(cx - cw / 2, 0, BW - cw)
    y0 = clamp(cy - ch / 2, 0, BH - ch)
    box = (int(x0 * SS), int(y0 * SS), int((x0 + cw) * SS), int((y0 + ch) * SS))
    out = img.convert("RGB").resize((W, H), Image.LANCZOS, box=box)
    arr = np.asarray(out).astype(np.float32) * VIGNETTE
    # fades
    fade = smooth(0.0, 1.2, t) * (1 - smooth(T_FADEOUT, DUR - 0.05, t))
    arr *= fade
    out = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")
    ta = smooth(T_TEXT0, T_TEXT1, t) * fade
    if ta > 0:
        out = Image.alpha_composite(out.convert("RGBA"), text_layer(ta)).convert("RGB")
    out.save(os.path.join(OUT, f"{f:04d}.png"), compress_level=1)


if __name__ == "__main__":
    frames = [int(a) for a in sys.argv[2:]] if len(sys.argv) > 2 else None
    if frames and len(frames) == 3 and frames[2] == -1:
        # range with stride via multiprocessing: start step
        pass
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
