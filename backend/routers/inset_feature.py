# routers/inset_feature.py

import os

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import InsetFeature, Preprocessing
from utils.db import get_db, paginate_query

router = APIRouter(prefix="/api/data/features", tags=["Inset Feature"])

INSET_LEXICON_DIR = os.path.join("lexicons", "inset")


# ── Helpers ────────────────────────────────────────────────────────────────────

def load_inset_lexicon_dict(pos_path: str, neg_path: str) -> tuple[dict, dict]:
    """Load leksikon InSet sebagai dictionary {kata: skor}."""

    def _read(path: str) -> dict:
        if not os.path.exists(path):
            return {}
        sep = "\t" if path.endswith(".tsv") else ","
        df = pd.read_csv(path, sep=sep, encoding="utf-8")
        if "word" in df.columns and "score" in df.columns:
            return {str(r["word"]).lower().strip(): int(r["score"]) for _, r in df.iterrows()}
        if len(df.columns) == 2:
            return {str(r.iloc[0]).lower().strip(): int(r.iloc[1]) for _, r in df.iterrows()}
        return {}

    pos_lex = _read(pos_path) or {"bagus": 4, "baik": 3, "suka": 3, "keren": 4, "mantap": 4, "terbaik": 5}
    neg_lex = _read(neg_path) or {"jelek": -4, "buruk": -3, "kecewa": -4, "gagal": -3}
    return pos_lex, neg_lex


def extract_inset_features_with_details(text: str, pos_lex: dict, neg_lex: dict) -> dict:
    """
    Ekstraksi fitur InSet dengan detail kata yang match.
    Return dict dengan positive_words, negative_words, total_positive, total_negative.
    """
    if not isinstance(text, str):
        return {"positive_words": [], "negative_words": [], "total_positive": 0, "total_negative": 0}

    original_text = text.lower()
    pos_score, neg_score = 0, 0
    positive_words, negative_words = [], []

    pos_multi = {k: v for k, v in pos_lex.items() if len(k.split()) > 1}
    pos_single = {k: v for k, v in pos_lex.items() if len(k.split()) == 1}
    neg_multi = {k: v for k, v in neg_lex.items() if len(k.split()) > 1}
    neg_single = {k: v for k, v in neg_lex.items() if len(k.split()) == 1}

    # Match multi-word phrases (terpanjang dulu)
    temp_text = original_text
    for phrase in sorted({**pos_multi, **neg_multi}, key=len, reverse=True):
        if phrase in temp_text:
            score = pos_multi.get(phrase, neg_multi.get(phrase, 0))
            if score > 0:
                pos_score += score
                positive_words.append({"word": phrase, "score": score, "type": "phrase"})
            elif score < 0:
                neg_score += score
                negative_words.append({"word": phrase, "score": score, "type": "phrase"})
            temp_text = temp_text.replace(phrase, " " * len(phrase))

    # Match single words
    for word in temp_text.split():
        clean = word.strip("()[]{}.,!?;:\"'")
        if not clean:
            continue

        # Kata dengan underscore (hasil negasi dari pipeline)
        if "_" in clean:
            for lex_single, word_list, score_list, wtype in [
                (pos_single, positive_words, None, "negation_word"),
                (neg_single, negative_words, None, "negation_word"),
            ]:
                s = lex_single.get(clean, 0)
                if (wtype == "negation_word" and s > 0) or (wtype == "negation_word" and s < 0):
                    (positive_words if s > 0 else negative_words).append({"word": clean, "score": s, "type": wtype})
                    if s > 0:
                        pos_score += s
                    else:
                        neg_score += s

            # Coba juga versi spasi (underscore → spasi)
            alt = clean.replace("_", " ")
            for multi_lex, wtype in [(pos_multi, "negation_phrase"), (neg_multi, "negation_phrase")]:
                s = multi_lex.get(alt, 0)
                if s > 0:
                    pos_score += s
                    positive_words.append({"word": alt, "score": s, "type": wtype})
                elif s < 0:
                    neg_score += s
                    negative_words.append({"word": alt, "score": s, "type": wtype})
        else:
            ps = pos_single.get(clean, 0)
            ns = neg_single.get(clean, 0)
            if ps > 0:
                pos_score += ps
                positive_words.append({"word": clean, "score": ps, "type": "single"})
            if ns < 0:
                neg_score += ns
                negative_words.append({"word": clean, "score": ns, "type": "single"})

    positive_words.sort(key=lambda x: x["score"], reverse=True)
    negative_words.sort(key=lambda x: x["score"])

    return {
        "positive_words": positive_words,
        "negative_words": negative_words,
        "total_positive": pos_score,
        "total_negative": neg_score,
    }


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("")
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
        "max_pos": max_pos,
        "min_pos": min_pos,
        "max_neg": max_neg,
        "min_neg": min_neg,
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


@router.get("/{guid}/words")
def get_inset_word_details(guid: str, db: Session = Depends(get_db)):
    """Detail kata/frasa yang memicu skor InSet untuk satu dokumen."""
    prep = db.query(Preprocessing).filter(Preprocessing.news_guid == guid).first()
    if not prep or not prep.clean_title:
        raise HTTPException(status_code=404, detail="Data preprocessing tidak ditemukan")

    pos_lex, neg_lex = load_inset_lexicon_dict(
        os.path.join(INSET_LEXICON_DIR, "positive.tsv"),
        os.path.join(INSET_LEXICON_DIR, "negative.tsv"),
    )
    result = extract_inset_features_with_details(prep.clean_title, pos_lex, neg_lex)

    return {
        "status": "success",
        "data": {
            "guid": guid,
            "clean_title": prep.clean_title,
            "positive_words": result["positive_words"],
            "negative_words": result["negative_words"],
            "total_positive": result["total_positive"],
            "total_negative": result["total_negative"],
            "net_score": result["total_positive"] + result["total_negative"],
        },
    }
