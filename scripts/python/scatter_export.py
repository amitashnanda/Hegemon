import argparse
import json
import math
import textwrap
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
matplotlib.rcParams["svg.fonttype"] = "none"
matplotlib.rcParams["pdf.fonttype"] = 42
matplotlib.rcParams["text.usetex"] = False

from matplotlib import pyplot as plt


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    arguments = parser.parse_args()
    payload = json.loads(arguments.input.read_text())
    samples = [sample for sample in payload["samples"]
               if isinstance(sample["x"], (int, float)) and isinstance(sample["y"], (int, float))
               and math.isfinite(sample["x"]) and math.isfinite(sample["y"])]
    if not samples:
        raise ValueError("No paired numeric expression measurements")
    figure, axes = plt.subplots(figsize=(8, 6), layout="constrained")
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
    axes.set_title(title + ("\n" + caption if caption else ""), fontsize=10, pad=14)
    axes.grid(color="#e3eaee", linewidth=0.7, zorder=0)
    axes.set_axisbelow(True)
    axes.tick_params(labelsize=9)
    figure.supxlabel("{} · {} paired samples · blue/green: survival metadata available/missing".format(
        payload["dataset"]["id"], len(samples)), fontsize=8)
    figure.savefig(arguments.output, dpi=240, facecolor="white")
    plt.close(figure)


if __name__ == "__main__":
    main()
