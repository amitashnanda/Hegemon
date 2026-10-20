# -*- coding: utf-8 -*-
from __future__ import unicode_literals

import argparse
import io
import json
import math
import textwrap
import os

import matplotlib

matplotlib.use("Agg")
matplotlib.rcParams["svg.fonttype"] = "none"
matplotlib.rcParams["pdf.fonttype"] = 42
matplotlib.rcParams["text.usetex"] = False

from matplotlib import pyplot as plt
from PIL import Image


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("output")
    arguments = parser.parse_args()
    with io.open(arguments.input, encoding="utf-8") as source:
        payload = json.load(source)
    columns = payload.get("sampleColumns")
    if columns:
        payload["samples"] = [{"x": horizontal, "y": vertical,
                               "color": "#0000FF" if survival else "#558866"}
                              for horizontal, vertical, survival in
                              zip(columns["x"], columns["y"], columns["hasSurvival"])]
    samples = [sample for sample in payload["samples"]
               if isinstance(sample["x"], (int, float)) and isinstance(sample["y"], (int, float))
               and not math.isnan(sample["x"]) and not math.isinf(sample["x"])
               and not math.isnan(sample["y"]) and not math.isinf(sample["y"])]
    if not samples:
        raise ValueError("No paired numeric expression measurements")
    figure, axes = plt.subplots(figsize=(8, 6))
    axes.scatter([sample["x"] for sample in samples], [sample["y"] for sample in samples],
                 c=[sample["color"] for sample in samples], s=14, linewidths=0, zorder=3)
    bounds = payload["bounds"] or [min(sample["x"] for sample in samples) - 0.5,
                                   max(sample["x"] for sample in samples) + 0.5,
                                   min(sample["y"] for sample in samples) - 0.5,
                                   max(sample["y"] for sample in samples) + 0.5]
    axes.set_xlim(bounds[0], bounds[1])
    axes.set_ylim(bounds[2], bounds[3])
    if payload["thresholds"]:
        for axis, draw in (("x", axes.axvline), ("y", axes.axhline)):
            threshold = float(payload["genes"][axis]["threshold"])
            draw(threshold, color="#087f8c", linestyle="--", linewidth=1, zorder=2)
            for bound in (threshold - 0.5, threshold + 0.5):
                draw(bound, color="#087f8c", linestyle=":", linewidth=0.7, alpha=0.5, zorder=2)
    for axis, setter in (("x", axes.set_xlabel), ("y", axes.set_ylabel)):
        gene = payload["genes"][axis]
        setter("{}: {}".format(gene["id"], gene["name"]), fontsize=10)
    caption = textwrap.fill(payload["caption"], width=95)
    title = textwrap.fill(payload["dataset"]["name"], width=75)
    heading = title + ("\n" + caption if caption else "")
    axes.set_title(heading, fontsize=10, y=1.04)
    axes.grid(color="#e3eaee", linewidth=0.7, zorder=0)
    axes.set_axisbelow(True)
    axes.tick_params(labelsize=9)
    figure.text(0.5, 0.025, "{} · {} paired samples · blue/green: survival metadata available/missing".format(
        payload["dataset"]["id"], len(samples)), fontsize=8, ha="center")
    figure.subplots_adjust(left=0.13, right=0.97, bottom=0.15,
                           top=max(0.55, 0.91 - 0.035 * heading.count("\n")))
    if os.path.splitext(arguments.output)[1].lower() in (".jpg", ".jpeg"):
        buffer = io.BytesIO()
        figure.savefig(buffer, format="png", dpi=240, facecolor="white")
        buffer.seek(0)
        with Image.open(buffer) as picture:
            picture.convert("RGB").save(arguments.output, format="JPEG", quality=95, dpi=(240, 240))
    else:
        figure.savefig(arguments.output, dpi=240, facecolor="white")
    plt.close(figure)


if __name__ == "__main__":
    main()
