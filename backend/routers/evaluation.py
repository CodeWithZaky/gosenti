# routers/evaluation.py

import json
import os

import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from scipy import stats
from sqlalchemy.orm import Session

from database import ExperimentResult
from utils.db import get_db

router = APIRouter(tags=["Evaluation"])

MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "models")


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

    metrics = ["accuracy", "precision", "recall", "f1_score"]
    average = {}
    for m in metrics:
        vals = [f[m] for f in folds]
        average[m] = round(float(np.mean(vals)), 6)
        average[f"{m}_std"] = round(float(np.std(vals)), 6)

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

    return {
        "status": "success",
        "data": {
            "class_names": data["class_names"],
            "config": config,
            "baseline": base_stats,
            "proposed": prop_stats,
            "improvement": {
                "accuracy": round(
                    (prop_stats["average"]["accuracy"] - base_stats["average"]["accuracy"]) * 100, 2
                ),
                "f1_score": round(
                    (prop_stats["average"]["f1_score"] - base_stats["average"]["f1_score"]) * 100, 2
                ),
            },
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
            **{
                m: _ttest(
                    [f[m] for f in data["proposed"]],
                    [f[m] for f in data["baseline"]],
                )
                for m in metrics
            },
            "alpha": 0.05,
            "description": (
                "Paired T-Test membandingkan 10 fold Baseline vs Proposed. "
                "H0: tidak ada perbedaan signifikan. Jika p < 0.05, H0 ditolak."
            ),
        },
    }
