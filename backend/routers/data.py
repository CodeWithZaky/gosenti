import os
import re
from collections import Counter, defaultdict

import numpy as np
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import InsetFeature, News, Preprocessing, SentiStrength
from utils.db import get_db, paginate_query
from utils.lexicon import (
    load_booster_words,
    load_negation_words,
    load_sentiwords,
    strip_punct,
)

router = APIRouter(prefix="/api/data", tags=["Data"])

SENTI_PATH = os.path.join("lexicons", "sentistrength_id")


# ── Preprocessing ─────────────────────────────────────────────────────────────

@router.get("/preprocessing")
def get_preprocessing_data(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    query = (
        db.query(Preprocessing, News)
        .join(News, Preprocessing.news_guid == News.guid)
        .order_by(Preprocessing.id.desc())
    )
    result = paginate_query(query, page, page_size)
    items = [
        {"guid": prep.news_guid, "original_title": news.title, "clean_title": prep.clean_title}
        for prep, news in result["items"]
    ]
    return {"items": items, "pagination": result["pagination"]}


# ── SentiStrength ──────────────────────────────────────────────────────────────

@router.get("/sentistrength")
def get_sentistrength_data(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    query = (
        db.query(SentiStrength, Preprocessing)
        .join(Preprocessing, SentiStrength.news_guid == Preprocessing.news_guid)
        .order_by(SentiStrength.id.desc())
    )
    result = paginate_query(query, page, page_size)
    items = [
        {
            "guid": s.news_guid,
            "clean_title": p.clean_title,
            "label": s.label_sentistrength,
            "pos": s.ss_max_positive,
            "neg": s.ss_max_negative,
        }
        for s, p in result["items"]
    ]
    return {"items": items, "pagination": result["pagination"]}


@router.get("/sentistrength/stats")
def get_sentistrength_stats(db: Session = Depends(get_db)):
    total = db.query(SentiStrength).count()
    counts = {
        label: db.query(SentiStrength).filter(SentiStrength.label_sentistrength == label).count()
        for label in ("positive", "neutral", "negative")
    }
    avg_pos = db.query(func.avg(SentiStrength.ss_max_positive)).scalar() or 0
    avg_neg = db.query(func.avg(SentiStrength.ss_max_negative)).scalar() or 0

    return {
        "status": "success",
        "data": {
            "total": total,
            **counts,
            "avg_positive": round(float(avg_pos), 2),
            "avg_negative": round(float(avg_neg), 2),
        },
    }


@router.get("/sentistrength/distribution")
def get_sentistrength_distribution(db: Session = Depends(get_db)):
    rows = db.query(
        SentiStrength.ss_max_positive,
        SentiStrength.ss_max_negative,
    ).all()

    pos_scores = [r[0] for r in rows if r[0] is not None]
    neg_scores = [r[1] for r in rows if r[1] is not None]

    def _stats(scores):
        if not scores:
            return {"mean": 0, "std": 0, "min": 0, "max": 0}
        return {
            "mean": round(float(np.mean(scores)), 2),
            "std": round(float(np.std(scores)), 2),
            "min": int(np.min(scores)),
            "max": int(np.max(scores)),
        }

    pos_dist = {
        "0": sum(1 for s in pos_scores if s == 0),
        "1-3": sum(1 for s in pos_scores if 1 <= s <= 3),
        "4-6": sum(1 for s in pos_scores if 4 <= s <= 6),
        "7-9": sum(1 for s in pos_scores if 7 <= s <= 9),
        "10+": sum(1 for s in pos_scores if s >= 10),
    }
    neg_dist = {
        "0": sum(1 for s in neg_scores if s == 0),
        "(-1)-(-3)": sum(1 for s in neg_scores if -3 <= s <= -1),
        "(-4)-(-6)": sum(1 for s in neg_scores if -6 <= s <= -4),
        "(-7)-(-9)": sum(1 for s in neg_scores if -9 <= s <= -7),
        "(-10)+": sum(1 for s in neg_scores if s <= -10),
    }

    return {
        "status": "success",
        "data": {
            "positive": {**_stats(pos_scores), "distribution": pos_dist},
            "negative": {**_stats(neg_scores), "distribution": neg_dist},
        },
    }


@router.get("/sentistrength/coverage")
def get_sentistrength_coverage(db: Session = Depends(get_db)):
    sentiwords = load_sentiwords()
    negation_words = load_negation_words()
    booster_words = load_booster_words()

    lexicon_positive = {w for w, s in sentiwords.items() if s > 0}
    lexicon_negative = {w for w, s in sentiwords.items() if s < 0}

    # Tambah idiom & emoticon
    for fname, sep in [("idioms_id.txt", ":"), ("emoticon_id.txt", "|")]:
        path = os.path.join(SENTI_PATH, fname)
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and sep in line:
                        parts = line.split(sep)
                        word = parts[0].lower().strip()
                        try:
                            score = int(parts[1].strip())
                            (lexicon_positive if score > 0 else lexicon_negative).add(word)
                        except (ValueError, IndexError):
                            pass

    all_lexicon = lexicon_positive | lexicon_negative
    rows = db.query(Preprocessing.clean_title).all()

    all_words, known, unknown, negation_found, booster_found = [], [], [], [], []

    for (text,) in rows:
        if not text:
            continue
        words = re.findall(r"\b\w+\b", text.lower())
        all_words.extend(words)
        for w in words:
            (known if w in all_lexicon else unknown).append(w)
            if w in negation_words:
                negation_found.append(w)
            if w in booster_words:
                booster_found.append(w)

    total = len(all_words)

    def _top(lst, n=30):
        return [{"word": w, "count": c} for w, c in Counter(lst).most_common(n)]

    def _pct(count):
        return round(count / total * 100, 1) if total else 0

    return {
        "status": "success",
        "data": {
            "total_documents": len(rows),
            "total_words": total,
            "lexicon_stats": {
                "positive_words": len(lexicon_positive),
                "negative_words": len(lexicon_negative),
                "negation_words": len(negation_words),
                "booster_words": len(booster_words),
                "total_lexicon": len(all_lexicon),
            },
            "coverage": {
                k: {"count": len(lst), "pct": _pct(len(lst))}
                for k, lst in [
                    ("known", known),
                    ("unknown", unknown),
                    ("negation", negation_found),
                    ("booster", booster_found),
                ]
            },
            "top_known": _top(known),
            "top_unknown": _top(unknown),
            "top_negation": _top(negation_found, 20),
            "top_booster": _top(booster_found, 20),
        },
    }


@router.get("/sentistrength/unknown-words")
def get_sentistrength_unknown_words(db: Session = Depends(get_db)):
    lexicon_dir = SENTI_PATH
    lexicon_words: set[str] = set()

    if os.path.exists(lexicon_dir):
        for fname in os.listdir(lexicon_dir):
            if not fname.endswith(".txt"):
                continue
            try:
                with open(os.path.join(lexicon_dir, fname), encoding="utf-8", errors="ignore") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith(("#", "//")):
                            word = line.split("\t")[0].lower().strip()
                            if len(word) > 1:
                                lexicon_words.add(word)
            except OSError:
                pass

    rows = db.query(
        SentiStrength.ss_max_positive,
        SentiStrength.ss_max_negative,
        SentiStrength.label_sentistrength,
        Preprocessing.clean_title,
    ).join(Preprocessing, SentiStrength.news_guid == Preprocessing.news_guid).all()

    unknown_counter: Counter = Counter()
    examples = []

    for pos, neg, label, text in rows:
        if not text:
            continue
        words = re.findall(r"\b\w+\b", text.lower())
        for w in words:
            if w not in lexicon_words:
                unknown_counter[w] += 1
        if not pos and not neg and len(examples) < 5:
            examples.append({
                "text": text[:150] + ("..." if len(text) > 150 else ""),
                "label": label or "unknown",
                "unknown_words": [w for w in words if w not in lexicon_words][:10],
            })

    return {
        "status": "success",
        "data": {
            "total_unknown_words": len(unknown_counter),
            "top_unknown_words": [
                {"rank": i + 1, "word": w, "frequency": c}
                for i, (w, c) in enumerate(unknown_counter.most_common(30))
            ],
            "example_documents": examples,
            "note": f"Kata-kata yang tidak ada di lexicon SentiStrength ({len(lexicon_words)} kata).",
        },
    }


@router.get("/sentistrength/negation-examples")
def get_negation_examples(db: Session = Depends(get_db)):
    negation_words = load_negation_words()
    sentiwords = load_sentiwords()
    rows = db.query(Preprocessing.clean_title).all()

    found: defaultdict = defaultdict(lambda: {"count": 0, "documents": []})

    for (text,) in rows:
        if not text:
            continue
        words = text.lower().split()
        for i, word in enumerate(words):
            clean = strip_punct(word)
            if clean in negation_words and i + 1 < len(words):
                nxt = strip_punct(words[i + 1])
                if nxt in sentiwords:
                    phrase = f"{clean}_{nxt}"
                    found[phrase]["count"] += 1
                    found[phrase]["documents"].append(text)

    sorted_items = sorted(found.items(), key=lambda x: x[1]["count"], reverse=True)
    return {
        "status": "success",
        "data": {
            "examples": [
                {"phrase": p, "count": d["count"], "samples": d["documents"]}
                for p, d in sorted_items
            ]
        },
    }


@router.get("/sentistrength/booster-examples")
def get_booster_examples(db: Session = Depends(get_db)):
    booster_words = load_booster_words()
    sentiwords = load_sentiwords()
    rows = db.query(Preprocessing.clean_title).all()

    found: defaultdict = defaultdict(lambda: {"count": 0, "documents": []})

    for (text,) in rows:
        if not text:
            continue
        words = text.lower().split()
        for i, word in enumerate(words):
            clean = strip_punct(word)
            if clean not in booster_words:
                continue
            for neighbour_idx, position in [(i - 1, "sebelum"), (i + 1, "sesudah")]:
                if 0 <= neighbour_idx < len(words):
                    neighbour = strip_punct(words[neighbour_idx])
                    if neighbour in sentiwords:
                        phrase = f"{clean}_{neighbour}"
                        found[phrase]["count"] += 1
                        found[phrase]["documents"].append({"text": text, "position": position})

    sorted_items = sorted(found.items(), key=lambda x: x[1]["count"], reverse=True)
    return {
        "status": "success",
        "data": {
            "examples": [
                {"phrase": p, "count": d["count"], "samples": d["documents"]}
                for p, d in sorted_items[:30]
            ]
        },
    }


@router.get("/sentistrength/all-negation")
def get_all_negation_data(db: Session = Depends(get_db)):
    negation_words = load_negation_words()
    sentiwords = load_sentiwords()
    rows = db.query(Preprocessing.clean_title).all()

    results = []
    for (text,) in rows:
        if not text:
            continue
        words = text.lower().split()
        for i, word in enumerate(words):
            clean = strip_punct(word)
            if clean in negation_words and i + 1 < len(words):
                nxt = strip_punct(words[i + 1])
                if nxt in sentiwords:
                    results.append({
                        "phrase": f"{clean}_{nxt}",
                        "negation_word": clean,
                        "sentiment_word": nxt,
                        "full_text": text,
                    })

    return {"status": "success", "data": {"total": len(results), "results": results}}


@router.get("/sentistrength/all-booster")
def get_all_booster_data(db: Session = Depends(get_db)):
    booster_words = load_booster_words()
    sentiwords = load_sentiwords()
    rows = db.query(Preprocessing.clean_title).all()

    results = []
    for (text,) in rows:
        if not text:
            continue
        words = text.lower().split()
        for i, word in enumerate(words):
            clean = strip_punct(word)
            if clean not in booster_words:
                continue
            for neighbour_idx, position in [(i - 1, "sebelum"), (i + 1, "sesudah")]:
                if 0 <= neighbour_idx < len(words):
                    neighbour = strip_punct(words[neighbour_idx])
                    if neighbour in sentiwords:
                        results.append({
                            "phrase": f"{clean}_{neighbour}",
                            "booster_word": clean,
                            "sentiment_word": neighbour,
                            "position": position,
                            "full_text": text,
                        })

    return {"status": "success", "data": {"total": len(results), "results": results}}


# ── InsetFeature ───────────────────────────────────────────────────────────────

@router.get("/features")
def get_features_data(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort_by: str = Query("id"),
    sort_order: str = Query("desc"),
    db: Session = Depends(get_db),
):
    all_pos = [p[0] for p in db.query(InsetFeature.inset_pos).all() if p[0] is not None]
    all_neg = [n[0] for n in db.query(InsetFeature.inset_neg).all() if n[0] is not None]

    if not all_pos or not all_neg:
        empty_page = {"page": 1, "page_size": page_size, "total": 0, "total_pages": 0, "has_more": False}
        return {"items": [], "pagination": empty_page, "stats": {}}

    min_pos, max_pos = min(all_pos), max(all_pos)
    min_neg, max_neg = min(all_neg), max(all_neg)

    stats = {
        "max_pos": max_pos, "min_pos": min_pos,
        "max_neg": max_neg, "min_neg": min_neg,
        "avg_pos": round(sum(all_pos) / len(all_pos), 2),
        "avg_neg": round(sum(all_neg) / len(all_neg), 2),
        "total": len(all_pos),
        "has_both": sum(1 for p, n in zip(all_pos, all_neg) if p > 0 and n < 0),
    }

    sort_col = {"pos": InsetFeature.inset_pos, "neg": InsetFeature.inset_neg}.get(sort_by, InsetFeature.id)
    order = sort_col.asc() if sort_order == "asc" else sort_col.desc()

    query = (
        db.query(InsetFeature, Preprocessing)
        .join(Preprocessing, InsetFeature.news_guid == Preprocessing.news_guid)
        .order_by(order)
    )
    result = paginate_query(query, page, page_size)

    def _norm(val, mn, mx):
        return round((val - mn) / (mx - mn), 4) if mx > mn else 0.0

    items = [
        {
            "guid": feat.news_guid,
            "clean_title": prep.clean_title,
            "inset_pos": feat.inset_pos or 0,
            "inset_neg": feat.inset_neg or 0,
            "inset_pos_norm": _norm(feat.inset_pos, min_pos, max_pos),
            "inset_neg_norm": _norm(feat.inset_neg, min_neg, max_neg),
        }
        for feat, prep in result["items"]
    ]
    return {"items": items, "pagination": result["pagination"], "stats": stats}
