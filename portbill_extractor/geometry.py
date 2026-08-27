"""Word-level PDF geometry helpers.

Northport bills are digitally generated with very stable column positions, so
the whole extractor is built on x-banding words into columns and clustering
them into visual lines. Nothing here is Northport-specific.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable, Sequence

import pymupdf

# Two text objects on the same visual line can differ in `top` by a fraction of
# a point (Northport renders the SUB-TOTAL cell as a separate object nudged
# ~0.7pt from its charge row). Anything closer than this is one line.
LINE_TOLERANCE = 3.0


@dataclass
class Word:
    x0: float
    top: float
    x1: float
    bottom: float
    text: str

    @property
    def mid_y(self) -> float:
        return (self.top + self.bottom) / 2


@dataclass
class Line:
    """One visual line of a page, with its words sorted left to right."""

    top: float
    words: list[Word] = field(default_factory=list)

    @property
    def text(self) -> str:
        return " ".join(w.text for w in self.words)

    def cell(self, x_from: float, x_to: float) -> str:
        """Text of the words whose left edge falls in [x_from, x_to)."""
        return " ".join(w.text for w in self.words if x_from <= w.x0 < x_to).strip()

    def cells(self, bands: Sequence[tuple[str, float, float]]) -> dict[str, str]:
        return {name: self.cell(lo, hi) for name, lo, hi in bands}


def page_words(page: pymupdf.Page) -> list[Word]:
    return [Word(w[0], w[1], w[2], w[3], w[4]) for w in page.get_text("words")]


def group_lines(words: Iterable[Word], tolerance: float = LINE_TOLERANCE) -> list[Line]:
    """Cluster words into visual lines by vertical midpoint.

    A simple `round(top / n)` bucket splits lines that straddle a bucket edge,
    which is exactly what happens to Northport's subtotal cells. Greedy
    clustering against the running line position avoids that.
    """
    ordered = sorted(words, key=lambda w: (w.mid_y, w.x0))
    lines: list[Line] = []
    anchor: float | None = None
    for word in ordered:
        if anchor is None or word.mid_y - anchor > tolerance:
            anchor = word.mid_y
            lines.append(Line(top=word.top))
        lines[-1].words.append(word)
    for line in lines:
        line.words.sort(key=lambda w: w.x0)
    return lines


def slice_lines(
    lines: Sequence[Line],
    start_contains: str | None = None,
    end_contains: str | None = None,
) -> list[Line]:
    """The AlgoDocs 'Specify Start/End Position' filters, as a function.

    `start_contains` is exclusive (the anchor line itself is dropped, it is the
    header); `end_contains` is exclusive too (matching AlgoDocs' 'text match
    before').
    """
    start = 0
    if start_contains:
        for i, line in enumerate(lines):
            if start_contains.lower() in line.text.lower():
                start = i + 1
                break
    end = len(lines)
    if end_contains:
        for i in range(start, len(lines)):
            if end_contains.lower() in lines[i].text.lower():
                end = i
                break
    return list(lines[start:end])
