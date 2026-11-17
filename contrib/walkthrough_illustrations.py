"""Draw the walkthrough's pencil illustrations and embed them in the deck.

Run with Pillow installed: python contrib/walkthrough_illustrations.py
"""

import base64
import io
import itertools
import math
import random
import re
from pathlib import Path

from PIL import Image, ImageDraw

SIZE = 1200
ROOT = Path(__file__).resolve().parents[1]
DECK = ROOT / "src/aniflow/templates/walkthrough.md"


class Pencil:
    def __init__(self, seed):
        self.random = random.Random(seed)
        self.image = Image.new("RGB", (SIZE, SIZE), "white")
        self.draw = ImageDraw.Draw(self.image, "RGBA")

    def stroke(self, points, width=3, strength=130, repeats=3):
        points = list(points)
        for attempt in range(repeats):
            jitter = 1.2 + attempt * 0.7
            offset_x = self.random.uniform(-jitter, jitter)
            offset_y = self.random.uniform(-jitter, jitter)
            rough = []
            for a, b in itertools.pairwise(points):
                distance = math.dist(a, b)
                count = max(1, round(distance / 12))
                for index in range(count):
                    t = index / count
                    rough.append(
                        (
                            a[0]
                            + (b[0] - a[0]) * t
                            + offset_x
                            + self.random.uniform(-jitter, jitter),
                            a[1]
                            + (b[1] - a[1]) * t
                            + offset_y
                            + self.random.uniform(-jitter, jitter),
                        )
                    )
            rough.append((points[-1][0] + offset_x, points[-1][1] + offset_y))
            alpha = max(10, strength - attempt * 28 + self.random.randrange(-12, 13))
            self.draw.line(
                rough,
                fill=(25, 25, 25, alpha),
                width=max(1, width - attempt),
                joint="curve",
            )

    def curve(self, p0, p1, p2, p3, **kwargs):
        points = []
        for index in range(81):
            t = index / 80
            u = 1 - t
            points.append(
                tuple(
                    u**3 * p0[axis]
                    + 3 * u**2 * t * p1[axis]
                    + 3 * u * t**2 * p2[axis]
                    + t**3 * p3[axis]
                    for axis in (0, 1)
                )
            )
        self.stroke(points, **kwargs)

    def ring(self, x, y, radius, **kwargs):
        points = [
            (
                x + radius * math.cos(i * math.tau / 100),
                y + radius * math.sin(i * math.tau / 100),
            )
            for i in range(101)
        ]
        self.stroke(points, **kwargs)

    def hatch(self, start, count, dx, dy, length, slope, strength=42):
        for index in range(count):
            x = start[0] + index * dx
            y = start[1] + index * dy
            self.stroke(
                [(x, y), (x + length, y + slope)],
                width=1,
                strength=strength + self.random.randrange(-8, 9),
                repeats=2,
            )

    def arrow(self, a, b, size=18):
        angle = math.atan2(b[1] - a[1], b[0] - a[0])
        for offset in (-0.55, 0.55):
            end = (
                b[0] - size * math.cos(angle + offset),
                b[1] - size * math.sin(angle + offset),
            )
            self.stroke([b, end], width=3, strength=125)

    def finish(self):
        grain = ImageDraw.Draw(self.image, "RGBA")
        for _ in range(18000):
            x = self.random.randrange(105, SIZE - 105)
            y = self.random.randrange(105, SIZE - 105)
            grain.point((x, y), fill=(40, 40, 40, self.random.randrange(2, 11)))
        return self.image.resize((1024, 1024), Image.Resampling.LANCZOS)


def sketch_page():
    p = Pencil(1901)
    p.stroke([(235, 258), (768, 175), (901, 851), (368, 945), (235, 258)], width=4)
    p.stroke([(253, 267), (779, 187), (910, 846)], width=1, strength=70)
    p.stroke([(702, 186), (717, 271), (788, 256)], width=2, strength=85)
    p.hatch((260, 281), 37, 4, 18, 24, -32, 30)
    p.hatch((375, 952), 30, 15, -3, 19, 22, 32)
    for x, y in ((398, 400), (584, 366), (717, 496)):
        p.ring(x, y, 35, width=3, strength=122)
        p.ring(x + 2, y - 2, 30, width=1, strength=55, repeats=2)
    p.curve((439, 391), (482, 372), (522, 371), (544, 371), width=3)
    p.arrow((522, 371), (544, 371))
    p.curve((615, 391), (651, 405), (676, 442), (694, 466), width=3)
    p.arrow((675, 441), (694, 466))
    p.curve((385, 546), (420, 607), (494, 637), (564, 607), width=2, strength=100)
    p.arrow((543, 614), (564, 607), 16)
    p.stroke([(592, 1067), (955, 629), (990, 659), (625, 1092), (592, 1067)], width=4)
    p.stroke([(955, 629), (971, 601), (990, 659)], width=3)
    p.stroke([(592, 1067), (574, 1124), (625, 1092)], width=3)
    p.stroke([(574, 1124), (589, 1114)], width=4, strength=145)
    p.stroke([(605, 1072), (968, 641)], width=2, strength=90)
    p.stroke([(613, 1080), (976, 649)], width=1, strength=75)
    p.hatch((648, 1020), 24, 12, -14.4, 14, 12, 62)
    p.stroke([(918, 673), (951, 700)], width=2, strength=80)
    p.stroke([(926, 663), (959, 690)], width=2, strength=80)
    return p.finish()


def follow_path():
    p = Pencil(1902)
    p.ring(525, 470, 265, width=5, strength=140)
    p.ring(525, 470, 251, width=2, strength=90)
    p.ring(525, 470, 277, width=1, strength=55, repeats=2)
    p.stroke([(710, 659), (758, 703), (741, 721), (695, 678)], width=4)
    p.stroke([(749, 696), (941, 895), (921, 922), (722, 719)], width=5)
    p.curve((941, 895), (968, 921), (945, 947), (921, 922), width=4)
    p.stroke([(756, 716), (927, 895)], width=2, strength=90)
    p.hatch((766, 717), 15, 10, 10.5, -17, 21, 68)
    p.curve((332, 561), (395, 557), (390, 446), (474, 442), width=4, strength=130)
    p.curve((474, 442), (538, 438), (546, 345), (635, 339), width=4, strength=130)
    p.curve((474, 442), (555, 454), (568, 550), (646, 573), width=4, strength=130)
    for x, y, radius in (
        (332, 561, 17),
        (474, 442, 22),
        (635, 339, 17),
        (646, 573, 17),
    ):
        p.ring(x, y, radius, width=3, strength=135)
    p.arrow((610, 340), (633, 339), 16)
    p.arrow((623, 567), (645, 573), 16)
    p.hatch((314, 663), 24, 9, 4, 30, -28, 28)
    for angle in (3.45, 3.75, 4.05, 4.4, 4.7):
        x = 525 + 295 * math.cos(angle)
        y = 470 + 295 * math.sin(angle)
        p.stroke(
            [(x, y), (x + 20 * math.cos(angle), y + 20 * math.sin(angle))],
            width=2,
            strength=75,
        )
    return p.finish()


def paper_plane():
    p = Pencil(1903)
    p.stroke(
        [(218, 469), (1018, 223), (728, 888), (564, 626), (218, 469)],
        width=5,
        strength=145,
    )
    p.stroke([(218, 469), (1018, 223), (564, 626), (535, 791)], width=3, strength=125)
    p.stroke([(535, 791), (625, 724)], width=3, strength=125)
    p.stroke([(564, 626), (728, 888)], width=3, strength=120)
    p.stroke([(236, 477), (994, 239)], width=1, strength=55)
    p.stroke([(580, 625), (992, 247)], width=1, strength=70)
    p.hatch((650, 697), 14, 7, 11, 45, -24, 40)
    p.hatch((425, 402), 22, 13, -4, 32, 12, 30)
    p.curve((164, 867), (184, 720), (394, 729), (408, 623), width=2, strength=90)
    p.curve((165, 866), (154, 920), (238, 954), (277, 930), width=2, strength=75)
    for x, y in ((167, 870), (254, 750), (370, 686)):
        p.ring(x, y, 9, width=2, strength=90)
    p.stroke([(784, 156), (805, 132)], width=2, strength=90)
    p.stroke([(845, 153), (856, 119)], width=2, strength=90)
    p.stroke([(890, 168), (917, 147)], width=2, strength=80)
    return p.finish()


SLOTS = (
    (
        "A dot travels along the arrows. Boxes light up. Captions explain what is happening.",
        "Pencil sketch of a diagram on paper",
        sketch_page,
    ),
    (
        "Drag, zoom or pan whenever you want to take over.",
        "Pencil sketch of a magnifying glass following a branching path",
        follow_path,
    ),
    (
        "Run `aniflow --spec` for the full syntax and icon list.",
        "Pencil sketch of a paper plane following a path",
        paper_plane,
    ),
)


def main():
    text = DECK.read_text(encoding="utf-8")
    for anchor, alt, draw in SLOTS:
        if text.count(anchor) != 1:
            raise ValueError(f"Expected one copy of {anchor!r}")
        data = io.BytesIO()
        draw().save(data, format="WEBP", quality=78, method=6)
        picture = f"![{alt}](data:image/webp;base64,{base64.b64encode(data.getvalue()).decode()})"
        pattern = (
            r"\n\n!\["
            + re.escape(alt)
            + r"\]\(data:image/webp;base64,[A-Za-z0-9+/=]+\)"
        )
        text, count = re.subn(pattern, "", text)
        if count > 1:
            raise ValueError(f"Duplicate illustration: {alt}")
        text = text.replace(anchor, anchor + "\n\n" + picture, 1)
    DECK.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()
