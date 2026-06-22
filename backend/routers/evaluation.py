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
    """Load fold details dari JSON file"""
    path = os.path.join(MODELS_DIR, "fold_details.json")
    if not os.path.exists(path):
        raise HTTPException(
            status_code=404, 
            detail="File fold_details.json tidak ditemukan. Jalankan training terlebih dahulu."
        )
    with open(path) as f:
        return json.load(f)


def _calc_fold_stats(folds: list) -> dict:
    """
    Hitung statistik fold lengkap: best, worst, average, dan overall matrix
    
    Parameters:
    - folds: list of fold dictionaries
    
    Returns:
    - dict dengan keys: folds, best, worst, average, overall
    """
    # Gunakan F1-score untuk menentukan best/worst fold
    f1_scores = [f["f1_score"] for f in folds]
    best_idx = int(np.argmax(f1_scores))
    worst_idx = int(np.argmin(f1_scores))

    # Hitung rata-rata dan std untuk semua metrik
    metrics = ["accuracy", "precision", "recall", "f1_score"]
    average = {}
    for m in metrics:
        vals = [f[m] for f in folds]
        average[m] = round(float(np.mean(vals)), 6)
        average[f"{m}_std"] = round(float(np.std(vals, ddof=1)), 6)  # ddof=1 untuk sample std

    # ✅ PERBAIKAN: Overall matrix = RATA-RATA per fold dengan np.round()
    all_matrices = [np.array(f["matrix"]) for f in folds]
    avg_matrix = np.mean(all_matrices, axis=0)
    
    # Gunakan np.round() untuk pembulatan yang benar (bukan floor)
    overall_matrix = np.round(avg_matrix).astype(int).tolist()
    
    # Logging untuk debugging
    avg_total = np.sum(avg_matrix)
    expected_avg = sum(f["test_size"] for f in folds) / len(folds)
    print(f"[_calc_fold_stats] Folds: {len(folds)}")
    print(f"[_calc_fold_stats] Best fold: {folds[best_idx]['fold']} (F1: {folds[best_idx]['f1_score']:.4f})")
    print(f"[_calc_fold_stats] Worst fold: {folds[worst_idx]['fold']} (F1: {folds[worst_idx]['f1_score']:.4f})")
    print(f"[_calc_fold_stats] Avg matrix total: {avg_total:.1f} (Expected: {expected_avg:.1f})")
    print(f"[_calc_fold_stats] Avg matrix (rounded): {overall_matrix}")

    return {
        "folds": folds,
        "best": folds[best_idx],
        "worst": folds[worst_idx],
        "average": average,
        "overall": {
            "accuracy": average["accuracy"],
            "precision": average["precision"],
            "recall": average["recall"],
            "f1_score": average["f1_score"],
            "matrix": overall_matrix,  # ← RATA-RATA per fold (sudah di-round)
        },
    }


@router.get("/api/modeling/evaluation-comparison")
def get_evaluation_comparison(db: Session = Depends(get_db)):
    """Endpoint untuk ringkasan perbandingan evaluasi"""
    exp = db.query(ExperimentResult).order_by(
        ExperimentResult.created_at.desc()
    ).first()
    
    if not exp:
        return {
            "status": "error",
            "message": "Belum ada data eksperimen. Jalankan training terlebih dahulu."
        }

    return {
        "status": "success",
        "data": {
            "model_name": exp.experiment_name,
            "model_type": exp.model_type,
            "total_samples": exp.total_samples,
            "cv_folds": exp.cv_folds,
            "feature_count": exp.feature_count,
            "created_at": exp.created_at.isoformat() if exp.created_at else None,
            "baseline": {
                "accuracy": exp.baseline_accuracy or 0,
                "f1_score": exp.baseline_f1 or 0
            },
            "proposed": {
                "accuracy": exp.proposed_accuracy or 0,
                "f1_score": exp.proposed_f1 or 0
            },
            "improvement": {
                "accuracy": exp.improvement_accuracy or 0,
                "f1": exp.improvement_f1 or 0
            },
        },
    }


@router.get("/api/modeling/grid-search")
def get_grid_search_results():
    """Endpoint untuk hasil grid search"""
    path = os.path.join(MODELS_DIR, "grid_search_results.json")
    if not os.path.exists(path):
        raise HTTPException(
            status_code=404,
            detail="Grid search results belum tersedia. Jalankan training terlebih dahulu."
        )
    try:
        with open(path) as f:
            return {"status": "success", "data": json.load(f)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error membaca file: {str(e)}")


@router.get("/api/evaluation/confusion-matrix")
def get_confusion_matrix_detail():
    """Endpoint utama untuk detail confusion matrix"""
    # Load data dari JSON
    data = _load_fold_details()
    config = data.get("config", {})
    total_samples = data.get("total_samples", 0)
    class_names = data.get("class_names", [])

    # Load best params untuk alpha values
    params_path = os.path.join(MODELS_DIR, "best_params.json")
    if os.path.exists(params_path):
        with open(params_path) as f:
            params = json.load(f)
        config["alpha_baseline"] = params.get("alpha_baseline", 1.0)
        config["alpha_proposed"] = params.get("alpha_proposed", 1.0)

    # Validasi data folds
    if "baseline" not in data or "proposed" not in data:
        raise HTTPException(
            status_code=400,
            detail="Data folds tidak lengkap. Pastikan fold_details.json memiliki baseline dan proposed."
        )

    # Hitung statistik untuk baseline dan proposed
    base_stats = _calc_fold_stats(data["baseline"])
    prop_stats = _calc_fold_stats(data["proposed"])

    # Hitung improvement (dari average metrics)
    improvement = {}
    for m in ["accuracy", "f1_score", "precision", "recall"]:
        base_val = base_stats["average"][m]
        prop_val = prop_stats["average"][m]
        improvement[m] = round((prop_val - base_val) * 100, 2)

    return {
        "status": "success",
        "data": {
            "class_names": class_names,
            "total_samples": total_samples,
            "config": config,
            "baseline": base_stats,
            "proposed": prop_stats,
            "improvement": improvement,
        },
    }


@router.get("/api/evaluation/ttest")
def get_ttest_result():
    """Endpoint untuk uji statistik paired t-test"""
    data = _load_fold_details()

    def _ttest(proposed: list, baseline: list) -> dict:
        """Perform paired t-test"""
        t_stat, p_value = stats.ttest_rel(proposed, baseline)
        diff = np.array(proposed) - np.array(baseline)
        
        # Cohen's d untuk effect size
        std_diff = np.std(diff, ddof=1)
        cohens_d = float(np.mean(diff) / std_diff) if std_diff > 0 else 0.0
        
        significant = bool(p_value < 0.05)
        
        return {
            "baseline_mean": round(float(np.mean(baseline)), 4),
            "proposed_mean": round(float(np.mean(proposed)), 4),
            "mean_diff": round(float(np.mean(diff)), 4),
            "t_statistic": round(float(t_stat), 4),
            "p_value": round(float(p_value), 6),
            "significant": significant,
            "cohens_d": round(cohens_d, 4),
            "interpretation": (
                "Signifikan (p < 0.05) - H0 ditolak, ada perbedaan signifikan"
                if significant
                else "Tidak signifikan (p ≥ 0.05) - H0 diterima, tidak ada perbedaan signifikan"
            ),
        }

    # Lakukan t-test untuk setiap metrik
    metrics = ["accuracy", "precision", "recall", "f1_score"]
    ttest_results = {}
    
    for m in metrics:
        baseline_vals = [f[m] for f in data["baseline"]]
        proposed_vals = [f[m] for f in data["proposed"]]
        ttest_results[m] = _ttest(proposed_vals, baseline_vals)

    return {
        "status": "success",
        "data": {
            **ttest_results,
            "alpha": 0.05,
            "description": (
                "Paired T-Test membandingkan 10 fold Baseline (TF-IDF) vs Proposed (TF-IDF + InSet). "
                "H0: tidak ada perbedaan signifikan antara kedua model. "
                "Jika p < 0.05, H0 ditolak (ada perbedaan signifikan). "
                "Cohen's d mengukur effect size (< 0.2: kecil, 0.5: medium, > 0.8: besar)."
            ),
        },
    }