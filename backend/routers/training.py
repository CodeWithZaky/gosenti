# routers/training.py

import os
import sys
import subprocess

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import CvFold, ExperimentResult
from utils.db import get_db

router = APIRouter(tags=["Training"])


def _run_script(script_path: str, step_name: str) -> dict:
    if not os.path.exists(script_path):
        raise HTTPException(status_code=404, detail=f"Skrip {step_name}.py tidak ditemukan!")

    env = {**os.environ, "PYTHONIOENCODING": "utf-8"}
    try:
        proc = subprocess.run(
            [sys.executable, script_path],
            capture_output=True,
            text=True,
            encoding="utf-8",
            check=True,
            cwd=os.getcwd(),
            env=env,
        )
        return {"status": "success", "message": f"Tahap {step_name} berhasil!", "output": proc.stdout}
    except subprocess.CalledProcessError as e:
        return {"status": "error", "message": f"Error pada tahap {step_name}", "error_detail": e.stderr}


# ── Pipeline ───────────────────────────────────────────────────────────────────

@router.post("/api/pipeline/{step_name}")
async def run_pipeline_step(step_name: str):
    return _run_script(os.path.join("scripts", "pipeline", f"{step_name}.py"), step_name)


@router.post("/api/pipeline/cnb_classification")
async def run_cnb_classification():
    return _run_script(os.path.join("src", "05_cnb_classification.py"), "cnb_classification")


# ── Experiments & history ──────────────────────────────────────────────────────

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
                {
                    "fold_number": f.fold_number,
                    "accuracy": f.accuracy,
                    "f1_score": f.f1_score,
                    "precision": f.precision,
                    "recall": f.recall,
                }
                for f in folds
            ],
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
