# scripts/pipeline/cnb_classification.py
import sys
import os
import json
import joblib
import numpy as np
from datetime import datetime
from scipy.sparse import hstack, load_npz
from sklearn.naive_bayes import ComplementNB
from sklearn.model_selection import StratifiedKFold, cross_val_score, cross_val_predict
from sklearn.metrics import (classification_report, confusion_matrix,
                             accuracy_score, precision_score, recall_score, f1_score)
from sklearn.preprocessing import LabelEncoder

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.append(backend_dir)

from database import SessionLocal, SentiStrength, InsetFeature, ExperimentResult, CvFold

def run_modeling_pipeline():
    def log(msg):
        print(msg)
        sys.stdout.flush()

    log("=" * 70)
    log("TAHAP 5: TRAINING & EVALUASI CNB")
    log("=" * 70)
    
    # ============================================================
    # 1. VALIDASI DATA
    # ============================================================
    models_dir = os.path.join(backend_dir, "models")
    tfidf_path = os.path.join(models_dir, "X_tfidf.npz")
    
    if not os.path.exists(tfidf_path):
        log("ERROR: X_tfidf.npz tidak ditemukan!")
        return
    
    log("Memuat data dari database...")
    session = SessionLocal()
    data = session.query(SentiStrength, InsetFeature).join(
        InsetFeature, SentiStrength.news_guid == InsetFeature.news_guid
    ).all()
    session.close()
    
    if len(data) == 0:
        log("ERROR: Tidak ada data!")
        return
    
    y = [d[0].label_sentistrength for d in data]
    log(f"Jumlah sampel: {len(y)}")
    log(f"Distribusi: { {k: y.count(k) for k in set(y)} }")
    
    # ============================================================
    # 2. PERSIAPAN DATA
    # ============================================================
    inset_pos = np.array([d[1].inset_pos for d in data]).reshape(-1, 1)
    inset_neg = np.array([d[1].inset_neg for d in data]).reshape(-1, 1)
    
    log("Memuat TF-IDF...")
    X_tfidf = load_npz(tfidf_path)
    log(f"TF-IDF shape: {X_tfidf.shape}")
    
    le = LabelEncoder()
    y_enc = le.fit_transform(y)
    
    # Load scaler dari file
    scaler_path = os.path.join(models_dir, "scaler_inset.pkl")
    X_inset_raw = np.hstack([inset_pos, inset_neg])
    
    if os.path.exists(scaler_path):
        log("✅ Load scaler_inset.pkl")
        scaler = joblib.load(scaler_path)
        X_inset_scaled = scaler.transform(X_inset_raw)
    else:
        log("⚠️ Scaler tidak ditemukan, buat baru...")
        from sklearn.preprocessing import MinMaxScaler
        scaler = MinMaxScaler()
        X_inset_scaled = scaler.fit_transform(X_inset_raw)
    
    X_combined = hstack([X_tfidf, X_inset_scaled]).tocsr()
    log(f"Dimensi gabungan: {X_combined.shape}")
    
    # ============================================================
    # 3. GRID SEARCH (F1 MACRO)
    # ============================================================
    RANDOM_STATE = 42
    skf = StratifiedKFold(n_splits=10, shuffle=True, random_state=RANDOM_STATE)
    
    log("\n" + "=" * 50)
    log("GRID SEARCH: 100 TRIALS (F1 Macro)")
    log("=" * 50)
    
    grid_search_results = {"baseline": [], "proposed": []}
    best_f1_base, best_alpha_base, best_norm_base = 0, 1.0, True
    best_f1_prop, best_alpha_prop, best_norm_prop = 0, 1.0, True
    
    # Baseline Grid Search
    log("\nBaseline (TF-IDF)...")
    for alpha in np.arange(0.01, 1.01, 0.02):
        for norm in [True, False]:
            f1 = cross_val_score(
                ComplementNB(alpha=alpha, norm=norm), 
                X_tfidf, y_enc, cv=skf, scoring='f1_macro'
            ).mean()
            grid_search_results["baseline"].append({
                "alpha": round(alpha, 2), 
                "norm": norm, 
                "f1_score": round(float(f1), 6)
            })
            if f1 > best_f1_base:
                best_f1_base, best_alpha_base, best_norm_base = f1, alpha, norm
    
    log(f"Best: alpha={best_alpha_base:.2f}, norm={best_norm_base}, f1={best_f1_base:.4f}")
    
    # Proposed Grid Search
    log("\nProposed (TF-IDF + InSet)...")
    for alpha in np.arange(0.01, 1.01, 0.02):
        for norm in [True, False]:
            f1 = cross_val_score(
                ComplementNB(alpha=alpha, norm=norm), 
                X_combined, y_enc, cv=skf, scoring='f1_macro'
            ).mean()
            grid_search_results["proposed"].append({
                "alpha": round(alpha, 2), 
                "norm": norm, 
                "f1_score": round(float(f1), 6)
            })
            if f1 > best_f1_prop:
                best_f1_prop, best_alpha_prop, best_norm_prop = f1, alpha, norm
    
    log(f"Best: alpha={best_alpha_prop:.2f}, norm={best_norm_prop}, f1={best_f1_prop:.4f}")
    
    # Simpan hasil Grid Search
    with open(os.path.join(models_dir, "grid_search_results.json"), "w") as f:
        json.dump(grid_search_results, f, indent=2)
    
    with open(os.path.join(models_dir, "best_params.json"), "w") as f:
        json.dump({
            "alpha_baseline": float(best_alpha_base), 
            "norm_baseline": best_norm_base,
            "alpha_proposed": float(best_alpha_prop), 
            "norm_proposed": best_norm_prop,
            "scoring": "f1_macro",
            "timestamp": datetime.now().isoformat()
        }, f, indent=2)
    
    log("✅ Grid search (F1 Macro) + best params saved")
    
    # ============================================================
    # 4. FINAL EVALUATION - PER FOLD
    # ============================================================
    log("\n" + "=" * 50)
    log("FINAL EVALUATION (10-Fold CV)")
    log("=" * 50)
    
    cnb_base = ComplementNB(alpha=best_alpha_base, norm=best_norm_base)
    cnb_prop = ComplementNB(alpha=best_alpha_prop, norm=best_norm_prop)
    
    baseline_folds = []
    log("\n📊 BASELINE:")
    for fold, (tr, te) in enumerate(skf.split(X_tfidf, y_enc)):
        cnb_base.fit(X_tfidf[tr], y_enc[tr])
        y_pred = cnb_base.predict(X_tfidf[te])
        
        baseline_folds.append({
            'fold': fold + 1,
            'accuracy': float(accuracy_score(y_enc[te], y_pred)),
            'precision': float(precision_score(y_enc[te], y_pred, average='macro', zero_division=0)),
            'recall': float(recall_score(y_enc[te], y_pred, average='macro', zero_division=0)),
            'f1_score': float(f1_score(y_enc[te], y_pred, average='macro', zero_division=0)),
            'matrix': confusion_matrix(y_enc[te], y_pred).tolist()
        })
        log(f"  Fold {fold+1}: Acc={baseline_folds[-1]['accuracy']:.4f}, F1={baseline_folds[-1]['f1_score']:.4f}")
    
    proposed_folds = []
    log("\n📊 PROPOSED:")
    for fold, (tr, te) in enumerate(skf.split(X_combined, y_enc)):
        cnb_prop.fit(X_combined[tr], y_enc[tr])
        y_pred = cnb_prop.predict(X_combined[te])
        
        proposed_folds.append({
            'fold': fold + 1,
            'accuracy': float(accuracy_score(y_enc[te], y_pred)),
            'precision': float(precision_score(y_enc[te], y_pred, average='macro', zero_division=0)),
            'recall': float(recall_score(y_enc[te], y_pred, average='macro', zero_division=0)),
            'f1_score': float(f1_score(y_enc[te], y_pred, average='macro', zero_division=0)),
            'matrix': confusion_matrix(y_enc[te], y_pred).tolist()
        })
        log(f"  Fold {fold+1}: Acc={proposed_folds[-1]['accuracy']:.4f}, F1={proposed_folds[-1]['f1_score']:.4f}")
    
    # Simpan fold details
    with open(os.path.join(models_dir, "fold_details.json"), "w") as f:
        json.dump({
            "baseline": baseline_folds,
            "proposed": proposed_folds,
            "class_names": le.classes_.tolist(),
            "config": {
                "alpha_baseline": float(best_alpha_base),
                "alpha_proposed": float(best_alpha_prop),
                "random_state": RANDOM_STATE,
                "cv_folds": 10,
                "grid_search_scoring": "f1_macro"
            }
        }, f, indent=2)
    log("✅ Fold details saved")
    
    # ============================================================
    # 5. METRIK RATA-RATA
    # ============================================================
    base_acc_mean = np.mean([f['accuracy'] for f in baseline_folds])
    prop_acc_mean = np.mean([f['accuracy'] for f in proposed_folds])
    base_f1_mean = np.mean([f['f1_score'] for f in baseline_folds])
    prop_f1_mean = np.mean([f['f1_score'] for f in proposed_folds])
    
    improvement_acc = (prop_acc_mean - base_acc_mean) * 100
    improvement_f1 = (prop_f1_mean - base_f1_mean) * 100
    
    log(f"\n{'='*50}")
    log(f"BASELINE:  Acc={base_acc_mean:.4f}, F1={base_f1_mean:.4f}")
    log(f"PROPOSED:  Acc={prop_acc_mean:.4f}, F1={prop_f1_mean:.4f}")
    log(f"IMPROVEMENT: Acc +{improvement_acc:.2f}%, F1 {improvement_f1:+.2f}%")
    
    # Classification report
    y_pred_all = cross_val_predict(cnb_prop, X_combined, y_enc, cv=skf)
    report_text = classification_report(y_enc, y_pred_all, target_names=le.classes_)
    log(f"\n{report_text}")
    
    # ============================================================
    # 6. SIMPAN KE DATABASE
    # ============================================================
    log("\n💾 Menyimpan ke database...")
    session = SessionLocal()
    exp_name = f"CNB_TFIDF_InSet_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    
    try:
        new_exp = ExperimentResult(
            experiment_name=exp_name,
            model_type="ComplementNB",
            total_samples=len(y_enc),
            cv_folds=10,
            feature_count=X_combined.shape[1],
            baseline_accuracy=float(base_acc_mean),
            baseline_f1=float(base_f1_mean),
            proposed_accuracy=float(prop_acc_mean),
            proposed_f1=float(prop_f1_mean),
            improvement_accuracy=float(improvement_acc),
            improvement_f1=float(improvement_f1)
        )
        session.add(new_exp)
        session.flush()
        exp_id = new_exp.id
        
        # Simpan baseline folds
        for fd in baseline_folds:
            session.add(CvFold(
                experiment_id=exp_id, fold_number=fd['fold'], model_type='baseline',
                accuracy=fd['accuracy'], precision=fd['precision'],
                recall=fd['recall'], f1_score=fd['f1_score'],
                confusion_matrix=json.dumps(fd['matrix'])
            ))
        
        # Simpan proposed folds
        for fd in proposed_folds:
            session.add(CvFold(
                experiment_id=exp_id, fold_number=fd['fold'], model_type='proposed',
                accuracy=fd['accuracy'], precision=fd['precision'],
                recall=fd['recall'], f1_score=fd['f1_score'],
                confusion_matrix=json.dumps(fd['matrix'])
            ))
        
        session.commit()
        log(f"✅ Experiment ID: {exp_id} ({len(baseline_folds) + len(proposed_folds)} folds)")
        
    except Exception as e:
        log(f"❌ Error: {e}")
        session.rollback()
    finally:
        session.close()
    
    # ============================================================
    # 7. SIMPAN MODEL FINAL
    # ============================================================
    cnb_prop.fit(X_combined, y_enc)
    joblib.dump(cnb_prop, os.path.join(models_dir, "cnb_model.pkl"))
    joblib.dump(le, os.path.join(models_dir, "label_encoder.pkl"))
    
    log("\n" + "=" * 70)
    log("✅ PIPELINE SELESAI!")
    log(f"   Experiment ID: {exp_id}")
    log(f"   Grid Search: F1 Macro scoring")
    log("=" * 70)

if __name__ == "__main__":
    run_modeling_pipeline()