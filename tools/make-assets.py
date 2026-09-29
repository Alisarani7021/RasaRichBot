#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Renders the post artwork with real Persian typography: an Instagram-style
   1080x1350 post, a 1080x1920 story, four collage frames and a landing hero.
   Output: /home/user/carousel/out/*.jpg (uploaded to the worker's asset KV)."""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps
import arabic_reshaper
from bidi.algorithm import get_display

SRC = "/home/user/carousel"
OUT = "/home/user/carousel/out"
FONT_B = "/home/user/fonts/Vazirmatn-Bold.ttf"
FONT_R = "/home/user/fonts/Vazirmatn-Regular.ttf"
ACCENT = (240, 180, 41)
os.makedirs(OUT, exist_ok=True)

from PIL import features as _feat
HAS_RAQM = bool(_feat.check("raqm"))

def fa(t):
    """With Raqm the shaper does bidi+ligatures itself — pre-shaping would
    reverse the line. Without it, do it by hand."""
    if HAS_RAQM:
        return t
    return get_display(arabic_reshaper.reshape(t))

def font(path, size):
    return ImageFont.truetype(path, size)

def cover(path, w, h):
    im = Image.open(path).convert("RGB")
    return ImageOps.fit(im, (w, h), method=Image.LANCZOS, centering=(0.5, 0.45))

def shade(img, top=0.10, bottom=0.86):
    """vertical dark gradient so text always reads"""
    w, h = img.size
    grad = Image.new("L", (1, h))
    for y in range(h):
        k = y / max(1, h - 1)
        grad.putpixel((0, y), int(255 * (top + (bottom - top) * (k ** 1.25))))
    grad = grad.resize((w, h))
    dark = Image.new("RGB", (w, h), (4, 8, 14))
    return Image.composite(dark, img, grad)

def brand(d, w, h, sub=None):
    d.rectangle([0, 0, w, 8], fill=ACCENT)
    f = font(FONT_B, 34)
    d.text((w - 44, h - 44), fa("رِسا"), font=f, fill=(255, 255, 255), anchor="rd")
    if sub:
        d.text((44, h - 46), fa(sub), font=font(FONT_R, 26), fill=(190, 200, 214), anchor="ld")

def render_insta(src, out, title, lines, sub):
    w, h = 1080, 1350
    img = shade(cover(src, w, h), 0.05, 0.92)
    d = ImageDraw.Draw(img)
    d.text((w - 56, 150), fa(sub), font=font(FONT_B, 40), fill=ACCENT, anchor="ra")
    d.text((w - 56, 215), fa(title), font=font(FONT_B, 88), fill=(255, 255, 255), anchor="ra")
    d.rectangle([w - 56 - 150, 340, w - 56, 348], fill=ACCENT)
    y = 420
    for ln in lines:
        d.text((w - 56, y), fa(ln), font=font(FONT_R, 44), fill=(233, 238, 245), anchor="ra")
        y += 74
    brand(d, w, h, "@rasa.studio")
    img.save(os.path.join(OUT, out), quality=93, optimize=True)

def render_story(src, out, kicker, title, tail):
    w, h = 1080, 1920
    img = shade(cover(src, w, h), 0.06, 0.90)
    d = ImageDraw.Draw(img)
    d.text((w // 2, 250), fa(kicker), font=font(FONT_B, 52), fill=ACCENT, anchor="ma")
    d.text((w // 2, 360), fa(title), font=font(FONT_B, 120), fill=(255, 255, 255), anchor="ma")
    d.text((w // 2, 1660), fa(tail), font=font(FONT_R, 44), fill=(226, 232, 240), anchor="ma")
    d.ellipse([w // 2 - 150, 1780, w // 2 + 150, 1798], outline=(255, 255, 255), width=4)
    brand(d, w, h, "@rasa.studio")
    img.save(os.path.join(OUT, out), quality=93, optimize=True)

def render_collage(src, out, label):
    w, h = 1080, 720
    img = shade(cover(src, w, h), 0.0, 0.62)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 10, h], fill=ACCENT)
    d.text((w - 40, h - 90), fa(label), font=font(FONT_B, 56), fill=(255, 255, 255), anchor="rd")
    img.save(os.path.join(OUT, out), quality=92, optimize=True)

def render_hero(src, out):
    w, h = 1200, 640
    img = shade(cover(src, w, h), 0.02, 0.75)
    img.save(os.path.join(OUT, out), quality=92, optimize=True)

render_insta(f"{SRC}/s3.jpg", "insta_post.jpg",
             "یزد؛ شهر بادگیرها",
             ["بادگیرها بدون یک وات برق،", "هوای خانه‌های کویری را خنک می‌کنند.", "میراث زندهٔ معماری ایران."],
             "پست اینستاگرام · رندر ربات")
render_story(f"{SRC}/s2.jpg", "story.jpg",
             "استوری امروز", "باغ ایرانی", "برای دیدن قاب کامل، بالا بکش ☝️")
render_collage(f"{SRC}/s1.jpg", "c1.jpg", "دماوند، بام ایران")
render_collage(f"{SRC}/s2.jpg", "c2.jpg", "باغ ایرانی؛ هندسهٔ آب")
render_collage(f"{SRC}/s3.jpg", "c3.jpg", "یزد؛ شهر بادگیرها")
render_collage(f"{SRC}/s4.jpg", "c4.jpg", "جادهٔ جنگلی شمال")
render_hero(f"{SRC}/s1.jpg", "lhero.jpg")

for f in sorted(os.listdir(OUT)):
    p = os.path.join(OUT, f)
    im = Image.open(p)
    print(f"{f:16s} {im.size[0]}x{im.size[1]}  {os.path.getsize(p)//1024} KB")
print("done")
