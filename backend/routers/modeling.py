import json
import os

import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from scipy import stats
from sqlalchemy.orm import Session

from database import CvFold, ExperimentResult, News, SentiStrength
from utils.db import get_db

router = APIRouter(tags=["Modeling"])

MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "models")


# ── Dashboard & Stats ──────────────────────────────────────────────────────────

@router.get("/api/stats")
def get_stats(db: Session = Depends(get_db)):
    from database import Preprocessing

    latest = db.query(ExperimentResult).order_by(ExperimentResult.created_at.desc()).first()
    return {
        "total_news": db.query(News).count(),
        "total_preprocessed": db.query(Preprocessing).count(),
        "total_sentistrength": db.query(SentiStrength).count(),
        "accuracy": latest.proposed_accuracy if latest else 0,
        "f1_score": latest.proposed_f1 if latest else 0,
        "improvement": latest.improvement_accuracy if latest else 0,
    }


@router.get("/api/dashboard/trend")
def get_sentiment_trend(db: Session = Depends(get_db)):
    import pandas as pd

    rows = (
        db.query(News.published_at, SentiStrength.label_sentistrength)
        .join(SentiStrength, News.guid == SentiStrength.news_guid)
        .all()
    )
    if not rows:
        return {"status": "error", "message": "Tiada data"}

    df = (
        __import__("pandas").DataFrame(rows, columns=["published_at", "label"])
        .assign(date=lambda d: __import__("pandas").to_datetime(d["published_at"], errors="coerce").dt.tz_localize(None))
        .dropna(subset=["date"])
    )
    df = df[df["date"].dt.year.between(2022, 2026)]
    df["month_year"] = df["date"].dt.strftime("%b %Y")
    df["sort_key"] = df["date"].dt.strftime("%Y-%m")

    grouped = (
        df.groupby(["sort_key", "month_year", "label"])
        .size()
        .unstack(fill_value=0)
        .reset_index()
    )
    for col in ("positive", "neutral", "negative"):
        if col not in grouped.columns:
            grouped[col] = 0

    grouped = grouped.sort_values("sort_key")
    chart_data = [
        {"date": r["month_year"], "positive": int(r["positive"]), "neutral": int(r["neutral"]), "negative": int(r["negative"])}
        for _, r in grouped.iterrows()
    ]
    return {"status": "success", "data": chart_data}


# ── Experiments ────────────────────────────────────────────────────────────────

@router.get("/api/experiments/latest")
def get_latest_experiment(db: Session = Depends(get_db)):
    exp = db.query(ExperimentResult).order_by(ExperimentResult.created_at.desc()).first()
    if not exp:
        return {"status": "error", "message": "Belum ada data eksperimen"}

    folds = (
        db.query(CvFold)
        .filter(CvFold.experiment_id == exp.id)
        .order_by(CvFold.fold_number)
        .all()
    )
    return {
        "status": "success",
        "data": {
            "experiment": {
                "id": exp.id,
                "experiment_name": exp.experiment_name,
                "model_type": exp.model_type,
                "total_samples": exp.total_samples,
                "cv_folds": exp.cv_folds,
                "feature_count": exp.feature_count,
                "accuracy": exp.proposed_accuracy,
                "f1_score": exp.proposed_f1,
                "baseline_accuracy": exp.baseline_accuracy,
                "baseline_f1": exp.baseline_f1,
                "improvement_accuracy": exp.improvement_accuracy,
                "improvement_f1": exp.improvement_f1,
                "created_at": exp.created_at.isoformat() if exp.created_at else None,
            },
            "cv_folds": [
                {"fold_number": f.fold_number, "accuracy": f.accuracy, "f1_score": f.f1_score,
                 "precision": f.precision, "recall": f.recall}
                for f in folds
            ],
        },
    }


@router.get("/api/modeling/evaluation-comparison")
def get_evaluation_comparison(db: Session = Depends(get_db)):
    exp = db.query(ExperimentResult).order_by(ExperimentResult.created_at.desc()).first()
    if not exp:
        return {"status": "error", "message": "Belum ada data eksperimen"}

    return {
        "status": "success",
        "data": {
            "model_name": exp.experiment_name,
            "model_type": exp.model_type,
            "total_samples": exp.total_samples,
            "cv_folds": exp.cv_folds,
            "feature_count": exp.feature_count,
            "created_at": exp.created_at.isoformat() if exp.created_at else None,
            "baseline": {"accuracy": exp.baseline_accuracy or 0, "f1_score": exp.baseline_f1 or 0},
            "proposed": {"accuracy": exp.proposed_accuracy or 0, "f1_score": exp.proposed_f1 or 0},
            "improvement": {"accuracy": exp.improvement_accuracy or 0, "f1": exp.improvement_f1 or 0},
        },
    }


@router.get("/api/modeling/history")
def get_modeling_history(db: Session = Depends(get_db)):
    experiments = (
        db.query(ExperimentResult)
        .order_by(ExperimentResult.created_at.desc())
        .limit(5)
        .all()
    )
    return {
        "status": "success",
        "data": [
            {
                "id": e.id,
                "experiment_name": e.experiment_name,
                "model_type": e.model_type,
                "total_samples": e.total_samples,
                "cv_folds": e.cv_folds,
                "feature_count": e.feature_count,
                "baseline_accuracy": e.baseline_accuracy,
                "baseline_f1": e.baseline_f1,
                "proposed_accuracy": e.proposed_accuracy,
                "proposed_f1": e.proposed_f1,
                "improvement_accuracy": e.improvement_accuracy,
                "improvement_f1": e.improvement_f1,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in experiments
        ],
    }


@router.get("/api/modeling/grid-search")
def get_grid_search_results():
    path = os.path.join(MODELS_DIR, "grid_search_results.json")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Grid search results belum tersedia.")
    try:
        with open(path) as f:
            return {"status": "success", "data": json.load(f)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Evaluation ─────────────────────────────────────────────────────────────────

def _load_fold_details() -> dict:
    path = os.path.join(MODELS_DIR, "fold_details.json")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Jalankan training dulu")
    with open(path) as f:
        return json.load(f)


def _calc_fold_stats(folds: list) -> dict:
    accs = [f["accuracy"] for f in folds]
    best_idx = int(np.argmax(accs))
    worst_idx = int(np.argmin(accs))

    def _metric_stats(key):
        vals = [f[key] for f in folds]
        return round(float(np.mean(vals)), 6), round(float(np.std(vals)), 6)

    metrics = ["accuracy", "precision", "recall", "f1_score"]
    average = {}
    for m in metrics:
        mean, std = _metric_stats(m)
        average[m] = mean
        average[f"{m}_std"] = std

    return {
        "folds": folds,
        "best": folds[best_idx],
        "worst": folds[worst_idx],
        "average": average,
        "overall": {
            **{m: average[m] for m in metrics},
            "matrix": np.sum([np.array(f["matrix"]) for f in folds], axis=0).tolist(),
        },
    }


@router.get("/api/evaluation/confusion-matrix")
def get_confusion_matrix_detail():
    data = _load_fold_details()
    config = data.get("config", {})

    params_path = os.path.join(MODELS_DIR, "best_params.json")
    if os.path.exists(params_path):
        with open(params_path) as f:
            params = json.load(f)
        config["alpha_baseline"] = params.get("alpha_baseline", 1.0)
        config["alpha_proposed"] = params.get("alpha_proposed", 1.0)

    base_stats = _calc_fold_stats(data["baseline"])
    prop_stats = _calc_fold_stats(data["proposed"])
    improvement = {
        "accuracy": round((prop_stats["average"]["accuracy"] - base_stats["average"]["accuracy"]) * 100, 2),
        "f1_score": round((prop_stats["average"]["f1_score"] - base_stats["average"]["f1_score"]) * 100, 2),
    }

    return {
        "status": "success",
        "data": {
            "class_names": data["class_names"],
            "config": config,
            "baseline": base_stats,
            "proposed": prop_stats,
            "improvement": improvement,
        },
    }


@router.get("/api/evaluation/ttest")
def get_ttest_result():
    data = _load_fold_details()

    def _ttest(proposed: list, baseline: list) -> dict:
        t_stat, p_value = stats.ttest_rel(proposed, baseline)
        diff = np.array(proposed) - np.array(baseline)
        cohens_d = float(np.mean(diff) / np.std(diff, ddof=1))
        significant = bool(p_value < 0.05)
        return {
            "baseline_mean": round(float(np.mean(baseline)), 4),
            "proposed_mean": round(float(np.mean(proposed)), 4),
            "mean_diff": round(float(np.mean(diff)), 4),
            "t_statistic": round(float(t_stat), 4),
            "p_value": round(float(p_value), 6),
            "significant": significant,
            "cohens_d": round(cohens_d, 4),
            "interpretation": "Signifikan (p < 0.05)" if significant else "Tidak signifikan (p ≥ 0.05)",
        }

    metrics = ["accuracy", "precision", "recall", "f1_score"]
    return {
        "status": "success",
        "data": {
            m: _ttest(
                [f[m] for f in data["proposed"]],
                [f[m] for f in data["baseline"]],
            )
            for m in metrics
        }
        | {
            "alpha": 0.05,
            "description": "Paired T-Test membandingkan 10 fold Baseline vs Proposed. H0: tidak ada perbedaan signifikan. Jika p < 0.05, H0 ditolak.",
        },
    }
