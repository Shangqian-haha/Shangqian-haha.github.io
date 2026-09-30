# -*- coding: utf-8 -*-
"""v5b-2：画布 48x48，猫 36px 下移留出顶部空间，箭头凹口对准左耳（gap 可调）。"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from collections import deque

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')

cat36_closed = Image.open(os.path.join(OUT, 'sizes', 'cat-closed-36.png')).convert('RGBA')
cat36_open = Image.open(os.path.join(OUT, 'sizes', 'cat-open-36.png')).convert('RGBA')

# ---------- 箭头（与 v5 完全同参） ----------
REF = r'C:/Users/刘宏展/.workbuddy/clipboard-images/clipboard-2026-09-29T06-48-13-349Z-714ce36e.png'
im = Image.open(REF).convert('RGB')
a = np.asarray(im).astype(np.int32)
h, w, _ = a.shape

def near_bg(p, q, tol=48):
    return abs(int(p[0])-int(q[0])) < tol and abs(int(p[1])-int(q[1])) < tol and abs(int(p[2])-int(q[2])) < tol

bg = np.zeros((h, w), bool)
corners = [(0, 0), (0, w-1), (h-1, 0), (h-1, w-1)]
dq = deque()
for y, x in corners:
    bg[y, x] = True
    dq.append((y, x))
seeds = [a[y, x] for y, x in corners]
while dq:
    y, x = dq.popleft()
    p = a[y, x]
    if not any(near_bg(p, s) for s in seeds):
        continue
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        ny, nx = y+dy, x+dx
        if 0 <= ny < h and 0 <= nx < w and not bg[ny, nx] and near_bg(a[ny, nx], p, 26):
            bg[ny, nx] = True
            dq.append((ny, nx))
shape = ~bg
FILL = (250, 246, 238); EDGE = (54, 58, 68)
F = np.array(FILL, np.float32); E = np.array(EDGE, np.float32)
L = (0.30*a[:, :, 0] + 0.59*a[:, :, 1] + 0.11*a[:, :, 2])
t = np.clip((L - 90.0) / (180.0 - 90.0), 0, 1)[..., None]
rgb = (E*(1-t) + F*t).astype(np.uint8)
arrow_im = Image.fromarray(np.dstack([rgb, (shape*255).astype(np.uint8)]), 'RGBA')

UP = 6
big = arrow_im.resize((w*UP, h*UP), Image.LANCZOS)
big = big.rotate(30, resample=Image.BICUBIC, expand=True)
big = big.crop(big.getchannel('A').getbbox())
ARROW_H = 14
aw = max(1, int(round(big.size[0] * ARROW_H / float(big.size[1]))))
arrow_s = big.resize((aw, ARROW_H), Image.LANCZOS)

aa = np.asarray(arrow_s.getchannel('A')).astype(np.int32)
ys, xs = np.mgrid[0:aa.shape[0], 0:aa.shape[1]]
m = aa > 40
tip_idx = np.argmin(ys[m] + xs[m])
tip_y, tip_x = int(ys[m][tip_idx]), int(xs[m][tip_idx])
pts = np.column_stack([xs[m], ys[m]])
cx, cy = pts.mean(axis=0)
solid = np.zeros(aa.shape, bool); solid[m] = True
boundary = []
for y0 in range(aa.shape[0]):
    for x0 in range(aa.shape[1]):
        if solid[y0, x0]:
            for dy0, dx0 in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny0, nx0 = y0+dy0, x0+dx0
                if not (0 <= ny0 < aa.shape[0] and 0 <= nx0 < aa.shape[1]) or not solid[ny0, nx0]:
                    boundary.append((x0, y0)); break
boundary = np.array(boundary, float)
sel = (boundary[:, 0] > cx) & (boundary[:, 1] > cy)
bq = boundary[sel]
d = np.hypot(bq[:, 0]-cx, bq[:, 1]-cy)
notch = bq[np.argmin(d)]
print('arrow:', arrow_s.size, 'tip:', (tip_x, tip_y), 'notch:', tuple(notch))

def ear_tip(im36):
    arr = np.asarray(im36.getchannel('A')).astype(np.int32)
    best = None
    for y0 in range(arr.shape[0]):
        for x0 in range(0, 18):
            if arr[y0, x0] > 40:
                if best is None or (x0 + y0) < (best[0] + best[1]):
                    best = (x0, y0)
    return best

EAR = ear_tip(cat36_closed)
print('ear(local36):', EAR)

CV = 48

def compose(cat_im, ox, oy, ax, ay):
    cv = Image.new('RGBA', (CV, CV), (0, 0, 0, 0))
    cv.paste(cat_im, (ox, oy), cat_im)
    cv.alpha_composite(arrow_s, (ax, ay))
    return cv

plans = []
for tag, ox, oy, gap in (('P1', 11, 12, 2), ('P2', 11, 12, 3), ('P3', 10, 11, 2), ('P4', 12, 13, 3)):
    ear_g = (EAR[0]+ox, EAR[1]+oy)
    ax = ear_g[0] - gap - int(notch[0])
    ay = ear_g[1] - gap - int(notch[1])
    plans.append((tag, ox, oy, gap, ax, ay))
    print('%s cat@(%d,%d) gap=%d -> arrow@(%d,%d) tip=(%d,%d) clipped_top=%s'
          % (tag, ox, oy, gap, ax, ay, ax+tip_x, ay+tip_y, ay < 0))

Z = 8
font = ImageFont.truetype(r'C:\Windows\Fonts\msyh.ttc', 16)
tiles = []
for tag, ox, oy, gap, ax, ay in plans:
    closed = compose(cat36_closed, ox, oy, ax, ay)
    opened = compose(cat36_open, ox, oy, ax, ay)
    row = Image.new('RGB', (CV*Z*2 + 40, CV*Z + 40), (238, 242, 247))
    d = ImageDraw.Draw(row)
    d.text((8, 4), '%s cat@(%d,%d) gap=%d arrow@(%d,%d)' % (tag, ox, oy, gap, ax, ay),
           fill=(20, 24, 34), font=font)
    b1 = closed.resize((CV*Z, CV*Z), Image.NEAREST)
    b2 = opened.resize((CV*Z, CV*Z), Image.NEAREST)
    row.paste(b1, (20, 26), b1)
    row.paste(b2, (CV*Z + 30, 26), b2)
    tiles.append(row)
W = max(t.size[0] for t in tiles)
H = sum(t.size[1] for t in tiles) + 10*(len(tiles)-1)
sheet = Image.new('RGB', (W, H), (255, 255, 255))
y = 0
for t in tiles:
    sheet.paste(t, (0, y)); y += t.size[1] + 10
sheet.save(os.path.join(HERE, 'cursor_v5b2_plans.png'))
print('plans -> cursor_v5b2_plans.png')

import json
for tag, ox, oy, gap, ax, ay in plans:
    compose(cat36_closed, ox, oy, ax, ay).save(os.path.join(OUT, 'cat-v5b2-closed-%s.png' % tag))
    compose(cat36_open, ox, oy, ax, ay).save(os.path.join(OUT, 'cat-v5b2-open-%s.png' % tag))
json.dump({'plans': [{'tag': t, 'ox': ox, 'oy': oy, 'gap': g, 'ax': ax, 'ay': ay,
                      'hotspot': [ax+tip_x, ay+tip_y]} for t, ox, oy, g, ax, ay in plans],
           'tip': [tip_x, tip_y], 'notch': [int(notch[0]), int(notch[1])]},
          open(os.path.join(OUT, 'v5b2_meta.json'), 'w'), indent=1)
print('saved cat-v5b2-*')
