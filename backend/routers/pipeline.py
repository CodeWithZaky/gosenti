import os
import sys
import subprocess

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/pipeline", tags=["Pipeline"])


def _run_script(script_path: str, step_name: str) -> dict:
    """Jalankan script Python dan kembalikan hasilnya."""
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
        # Kembalikan detail error tanpa raise agar frontend bisa menampilkannya
        return {"status": "error", "message": f"Error pada tahap {step_name}", "error_detail": e.stderr}


@router.post("/{step_name}")
async def run_pipeline_step(step_name: str):
    script_path = os.path.join("scripts", "pipeline", f"{step_name}.py")
    return _run_script(script_path, step_name)


@router.post("/cnb_classification")
async def run_cnb_classification():
    script_path = os.path.join("src", "05_cnb_classification.py")
    return _run_script(script_path, "cnb_classification")
