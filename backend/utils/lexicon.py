"""
Utilitas untuk membaca file lexicon SentiStrength.
Semua fungsi di sini melakukan lazy loading agar tidak membaca file
berulang kali di setiap request.
"""

import os
from functools import lru_cache

SENTI_PATH = os.path.join("lexicons", "sentistrength_id")


@lru_cache(maxsize=1)
def load_negation_words() -> frozenset:
    path = os.path.join(SENTI_PATH, "negatingword.txt")
    words = set()
    with open(path, encoding="utf-8") as f:
        for line in f:
            w = line.strip().lower()
            if w:
                words.add(w)
    return frozenset(words)


@lru_cache(maxsize=1)
def load_sentiwords() -> dict:
    path = os.path.join(SENTI_PATH, "sentiwords_id.txt")
    words = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            if ":" in line:
                parts = line.strip().split(":")
                try:
                    words[parts[0].lower()] = int(parts[1])
                except (ValueError, IndexError):
                    pass
    return words


@lru_cache(maxsize=1)
def load_booster_words() -> frozenset:
    path = os.path.join(SENTI_PATH, "boosterwords_id.txt")
    words = set()
    with open(path, encoding="utf-8") as f:
        for line in f:
            if ":" in line:
                w = line.strip().split(":")[0].lower()
                if w:
                    words.add(w)
    return frozenset(words)


def strip_punct(word: str) -> str:
    return word.strip('.,!?;:"\'()[]{}')
