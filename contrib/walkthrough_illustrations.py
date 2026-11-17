"""Draw the walkthrough's pencil illustrations.

Run with Pillow installed: python contrib/walkthrough_illustrations.py
"""

import itertools
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw

SIZE = 1200
ROOT = Path(__file__).resolve().parents[1]
TEMPLATES = ROOT / "src/aniflow/templates"


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


def branching_paths():
    p = Pencil(1904)
    p.curve((295, 972), (336, 820), (410, 657), (566, 566), width=5)
    p.curve((566, 566), (663, 508), (719, 394), (777, 255), width=5)
    p.curve((566, 566), (683, 584), (794, 652), (927, 712), width=5)
    p.curve((331, 993), (380, 820), (453, 688), (583, 605), width=2, strength=75)
    p.curve((583, 605), (708, 628), (810, 690), (919, 742), width=2, strength=75)
    for x, y, r in ((295, 972, 25), (566, 566, 32), (777, 255, 25), (927, 712, 25)):
        p.ring(x, y, r, width=3, strength=135)
    p.arrow((758, 303), (777, 255), 28)
    p.arrow((875, 688), (927, 712), 28)
    p.stroke([(602, 240), (632, 224), (651, 244)], width=2, strength=75)
    p.stroke([(908, 537), (940, 529), (959, 550)], width=2, strength=75)
    p.hatch((338, 822), 14, 8, -14, -22, -12, 35)
    p.hatch((657, 609), 15, 14, 6, -10, 25, 35)
    return p.finish()


def playback_keys():
    p = Pencil(1905)
    p.stroke([(193, 484), (924, 363), (1007, 724), (280, 854), (193, 484)], width=5)
    p.stroke([(205, 503), (287, 838), (995, 710)], width=2, strength=75)
    p.stroke([(278, 563), (439, 537), (467, 657), (307, 683), (278, 563)], width=3)
    p.stroke([(350, 602), (385, 577), (393, 620), (350, 602)], width=3)
    p.stroke([(504, 526), (856, 468), (881, 590), (530, 650), (504, 526)], width=3)
    p.stroke([(544, 584), (828, 536)], width=2, strength=80)
    p.stroke([(390, 735), (807, 665)], width=3, strength=90)
    p.hatch((294, 854), 35, 19, -3.4, 15, 22, 36)
    p.stroke([(435, 353), (420, 313)], width=2, strength=80)
    p.stroke([(501, 335), (499, 288)], width=2, strength=80)
    p.stroke([(568, 327), (580, 285)], width=2, strength=80)
    return p.finish()


def conversation():
    p = Pencil(1906)
    p.curve((231, 310), (302, 216), (642, 211), (727, 302), width=4)
    p.curve((727, 302), (805, 382), (741, 506), (630, 529), width=4)
    p.stroke([(630, 529), (570, 612), (559, 535)], width=4)
    p.curve((559, 535), (384, 555), (243, 528), (211, 450), width=4)
    p.curve((211, 450), (192, 408), (197, 353), (231, 310), width=4)
    p.curve((598, 639), (667, 584), (883, 591), (940, 653), width=4)
    p.curve((940, 653), (999, 719), (958, 811), (883, 830), width=4)
    p.stroke([(883, 830), (858, 909), (811, 834)], width=4)
    p.curve((811, 834), (673, 847), (575, 811), (563, 741), width=4)
    p.curve((563, 741), (554, 699), (567, 666), (598, 639), width=4)
    for x in (361, 461, 561):
        p.ring(x, 385, 17, width=3, strength=120)
    for x in (678, 758, 838):
        p.ring(x, 716, 13, width=3, strength=120)
    p.hatch((258, 480), 16, 12, 2, 18, -25, 32)
    p.hatch((617, 791), 14, 12, 2, 17, -22, 32)
    return p.finish()


def presentation():
    p = Pencil(1907)
    p.stroke([(240, 252), (966, 252), (966, 708), (240, 708), (240, 252)], width=5)
    p.stroke(
        [(255, 269), (950, 269), (950, 690), (255, 690), (255, 269)],
        width=2,
        strength=80,
    )
    p.stroke([(217, 231), (990, 231)], width=5)
    p.stroke([(603, 710), (603, 891)], width=4)
    p.stroke([(604, 830), (473, 969)], width=4)
    p.stroke([(604, 830), (739, 969)], width=4)
    p.stroke([(456, 976), (490, 976)], width=3, strength=95)
    p.stroke([(723, 976), (757, 976)], width=3, strength=95)
    for x, y in ((392, 466), (570, 405), (762, 505)):
        p.ring(x, y, 30, width=3, strength=130)
    p.curve((423, 457), (460, 441), (502, 420), (537, 411), width=3)
    p.arrow((511, 418), (537, 411), 20)
    p.curve((601, 412), (657, 422), (688, 470), (728, 493), width=3)
    p.arrow((705, 479), (728, 493), 20)
    p.hatch((258, 702), 34, 20, 0, 15, 21, 35)
    p.hatch((278, 286), 20, 0, 18, 19, -25, 28)
    return p.finish()


def node_tag():
    p = Pencil(1908)
    p.stroke(
        [(304, 419), (610, 238), (930, 563), (627, 873), (304, 549), (304, 419)],
        width=5,
    )
    p.stroke([(319, 432), (605, 257), (910, 563), (625, 854)], width=2, strength=75)
    p.ring(403, 468, 25, width=3, strength=120)
    p.curve((400, 467), (301, 469), (234, 354), (299, 289), width=3, strength=100)
    p.curve((299, 289), (357, 231), (444, 278), (423, 352), width=3, strength=100)
    p.stroke([(558, 439), (680, 563)], width=5)
    p.stroke([(611, 386), (733, 510)], width=5)
    p.stroke([(545, 510), (695, 360)], width=5)
    p.stroke([(604, 570), (754, 420)], width=5)
    p.hatch((640, 848), 17, 15, -15, 23, 14, 35)
    return p.finish()


def parallel_paths():
    p = Pencil(1909)
    p.ring(228, 584, 42, width=4, strength=135)
    p.ring(966, 584, 42, width=4, strength=135)
    p.curve((271, 565), (420, 495), (424, 350), (590, 350), width=4)
    p.curve((590, 350), (754, 350), (769, 488), (922, 565), width=4)
    p.curve((271, 603), (420, 673), (424, 819), (590, 819), width=4)
    p.curve((590, 819), (754, 819), (769, 681), (922, 603), width=4)
    p.arrow((643, 350), (683, 365), 25)
    p.arrow((643, 819), (683, 804), 25)
    p.ring(590, 350, 20, width=3, strength=120)
    p.ring(590, 819, 20, width=3, strength=120)
    p.hatch((352, 488), 10, 8, -11, -21, -12, 35)
    p.hatch((737, 738), 10, 9, -10, 19, 17, 35)
    return p.finish()


def stopwatch():
    p = Pencil(1910)
    p.ring(600, 620, 298, width=5, strength=140)
    p.ring(600, 620, 280, width=2, strength=85)
    p.stroke([(553, 324), (553, 265), (647, 265), (647, 324)], width=4)
    p.stroke([(529, 261), (671, 261), (671, 224), (529, 224), (529, 261)], width=4)
    p.stroke([(787, 383), (828, 342), (864, 377), (823, 418)], width=4)
    for angle in range(0, 360, 30):
        a = math.radians(angle)
        p.stroke(
            [
                (600 + 239 * math.cos(a), 620 + 239 * math.sin(a)),
                (600 + 259 * math.cos(a), 620 + 259 * math.sin(a)),
            ],
            width=3,
            strength=105,
        )
    p.stroke([(600, 620), (600, 439)], width=5, strength=135)
    p.stroke([(600, 620), (740, 678)], width=4, strength=125)
    p.ring(600, 620, 13, width=3, strength=130)
    p.hatch((370, 810), 23, 17, 7, 18, -20, 35)
    p.stroke([(265, 449), (228, 431)], width=2, strength=80)
    p.stroke([(253, 500), (209, 494)], width=2, strength=80)
    return p.finish()


def drawing_pencil():
    p = Pencil(1911)
    p.stroke([(489, 801), (878, 297), (930, 338), (542, 842), (489, 801)], width=5)
    p.stroke([(878, 297), (906, 264), (947, 299), (930, 338)], width=4)
    p.stroke([(489, 801), (464, 895), (542, 842)], width=4)
    p.stroke([(464, 895), (489, 881)], width=4)
    p.stroke([(505, 805), (892, 306)], width=2, strength=85)
    p.stroke([(525, 822), (913, 321)], width=2, strength=85)
    p.stroke([(830, 359), (882, 399)], width=3, strength=90)
    p.hatch((557, 800), 19, 14, -18, 19, 15, 45)
    p.curve((468, 895), (365, 955), (245, 944), (281, 846), width=3, strength=105)
    p.curve((281, 846), (313, 767), (423, 844), (391, 914), width=3, strength=105)
    p.curve((391, 914), (363, 983), (237, 1004), (193, 950), width=3, strength=95)
    p.stroke([(692, 262), (677, 222)], width=2, strength=80)
    p.stroke([(744, 246), (750, 206)], width=2, strength=80)
    p.stroke([(792, 254), (815, 220)], width=2, strength=80)
    return p.finish()


def saved_picture():
    p = Pencil(1912)
    p.stroke([(275, 321), (808, 233), (905, 805), (372, 893), (275, 321)], width=4)
    p.stroke([(314, 289), (847, 201), (944, 773)], width=3, strength=85)
    p.stroke([(342, 390), (755, 322), (819, 698), (405, 766), (342, 390)], width=4)
    p.ring(690, 418, 41, width=3, strength=115)
    p.stroke([(405, 714), (495, 579), (572, 640), (645, 532), (797, 669)], width=4)
    p.stroke([(553, 913), (666, 1015), (767, 878)], width=4)
    p.stroke([(666, 1015), (648, 823)], width=4)
    p.hatch((385, 900), 21, 19, -3, 13, 22, 35)
    p.stroke([(246, 276), (221, 244)], width=2, strength=80)
    p.stroke([(299, 250), (291, 209)], width=2, strength=80)
    return p.finish()


SLOTS = (
    ("walkthrough-pencil-page.webp", sketch_page),
    ("walkthrough-pencil-magnifier.webp", follow_path),
    ("walkthrough-pencil-plane.webp", paper_plane),
    ("walkthrough-pencil-paths.webp", branching_paths),
    ("walkthrough-pencil-keys.webp", playback_keys),
    ("walkthrough-pencil-comments.webp", conversation),
    ("walkthrough-pencil-presentation.webp", presentation),
    ("walkthrough-pencil-tag.webp", node_tag),
    ("walkthrough-pencil-parallel.webp", parallel_paths),
    ("walkthrough-pencil-stopwatch.webp", stopwatch),
    ("walkthrough-pencil-drawing.webp", drawing_pencil),
    ("walkthrough-pencil-save.webp", saved_picture),
)


def main():
    for name, draw in SLOTS:
        draw().save(TEMPLATES / name, format="WEBP", quality=78, method=6)


if __name__ == "__main__":
    main()
