"""Render the repository's compact AIRDROP-X vector mark as a PNG.

Uses only Python's standard library so the official SVG mark can be supplied
to services that accept PNG avatars but not SVG files.
"""

from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path


SIZE = 512
SCALE = SIZE / 64
PIXELS = bytearray(SIZE * SIZE * 4)


def lerp(first: tuple[int, int, int], second: tuple[int, int, int], amount: float) -> tuple[int, int, int]:
    amount = max(0.0, min(1.0, amount))
    return tuple(round(a + (b - a) * amount) for a, b in zip(first, second))


def ring_color(x: float, y: float) -> tuple[int, int, int]:
    stops = ((241, 217, 255), (155, 99, 255), (98, 231, 255), (117, 72, 255))
    position = max(0.0, min(1.0, ((x - 10) * 44 + (y - 8) * 48) / (44 * 44 + 48 * 48)))
    scaled = position * (len(stops) - 1)
    index = min(len(stops) - 2, int(scaled))
    return lerp(stops[index], stops[index + 1], scaled - index)


def write_pixel(x: int, y: int, color: tuple[int, int, int], alpha: float = 1.0) -> None:
    if not (0 <= x < SIZE and 0 <= y < SIZE):
        return
    index = (y * SIZE + x) * 4
    alpha = max(0.0, min(1.0, alpha))
    for channel, value in enumerate(color):
        PIXELS[index + channel] = round(PIXELS[index + channel] * (1 - alpha) + value * alpha)
    PIXELS[index + 3] = 255


def inside_polygon(x: float, y: float, points: list[tuple[float, float]]) -> bool:
    inside = False
    previous_x, previous_y = points[-1]
    for current_x, current_y in points:
        if (current_y > y) != (previous_y > y):
            intersection = (previous_x - current_x) * (y - current_y) / (previous_y - current_y) + current_x
            if x < intersection:
                inside = not inside
        previous_x, previous_y = current_x, current_y
    return inside


def fill_polygon(points: list[tuple[float, float]], color_at) -> None:
    low_x, high_x = max(0, int(min(x for x, _ in points) * SCALE)), min(SIZE - 1, int(max(x for x, _ in points) * SCALE) + 1)
    low_y, high_y = max(0, int(min(y for _, y in points) * SCALE)), min(SIZE - 1, int(max(y for _, y in points) * SCALE) + 1)
    for py in range(low_y, high_y + 1):
        for px in range(low_x, high_x + 1):
            x, y = (px + 0.5) / SCALE, (py + 0.5) / SCALE
            if inside_polygon(x, y, points):
                write_pixel(px, py, color_at(x, y))


def render() -> None:
    for py in range(SIZE):
        for px in range(SIZE):
            x, y = (px + 0.5) / SCALE, (py + 0.5) / SCALE
            distance_to_bg = math.hypot(x - 32, y - 25)
            background = lerp((29, 22, 48), (7, 6, 11), distance_to_bg / 38)
            if math.hypot(x - 32, y - 32) > 30:
                background = (7, 6, 11)
            write_pixel(px, py, background)

            radial = math.hypot(x - 32, y - 32)
            if 26.0 <= radial <= 30.0:
                write_pixel(px, py, (44, 36, 64), 0.72)
            ring_delta = abs(radial - 23)
            if ring_delta <= 1.25:
                write_pixel(px, py, ring_color(x, y), 1.0)
            elif ring_delta <= 4.4:
                write_pixel(px, py, ring_color(x, y), max(0, 0.14 * (1 - (ring_delta - 1.25) / 3.15)))
            if abs(radial - 18.5) <= 0.55:
                write_pixel(px, py, (255, 255, 255), 0.13)

    a_mark = [(17, 43), (27.6, 20), (32.8, 20), (43, 43), (37, 43), (34.9, 37.8), (25.1, 37.8), (23, 43)]
    fill_polygon(a_mark, lambda _x, _y: (255, 255, 255))
    fill_polygon([(27.1, 32.8), (30, 25.6), (32.9, 32.8)], lambda _x, _y: (18, 14, 27))

    x_mark = [(39.3, 22), (43, 27.5), (46.7, 22), (52.2, 22), (45.8, 31.5), (52.8, 42), (47.2, 42), (43, 35.7), (38.8, 42), (33.2, 42), (40.2, 31.5), (33.8, 22)]
    fill_polygon(x_mark, ring_color)


def write_png(destination: Path) -> None:
    raw = b''.join(b'\x00' + PIXELS[row * SIZE * 4:(row + 1) * SIZE * 4] for row in range(SIZE))
    def chunk(kind: bytes, payload: bytes) -> bytes:
        return struct.pack('>I', len(payload)) + kind + payload + struct.pack('>I', zlib.crc32(kind + payload) & 0xFFFFFFFF)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', SIZE, SIZE, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


if __name__ == '__main__':
    render()
    write_png(Path(__file__).resolve().parents[1] / 'brand' / 'airdrop-x-avatar-512.png')
