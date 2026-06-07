# scripts/pipeline/cnb_classification.py
import sys
import os
import json
import joblib
import numpy as np
from datetime import datetime
from scipy.sparse import hstack, load_npz, csr_matrix
from sklearn.naive_bayes import ComplementNB
from sklearn.model_selection import StratifiedKFold, cross_val_score, cross_val_predict
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.preprocessing import LabelEncoder, MinMaxScaler

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.append(backend_dir)

from database import SessionLocal, SentiStrength, InsetFeature, ExperimentResult, CvFold

def run_modeling_pipeline():
    def log(msg):
        print(msg)
        sys.stdout.flush()

    log("=" * 70)
    log("TAHAP 5: TRAINING & EVALUASI CNB (DATABASE MODE)")
    log("=" * 70)
    
    tfidf_path = os.path.join(backend_dir, "models", "X_tfidf.npz")
    if not os.path.exists(tfidf_path):
        log("ERROR: File X_tfidf.npz tidak ditemukan!")
        return
    
    log("Memuat data dari database...")
    session = SessionLocal()
    data = session.query(SentiStrength, InsetFeature).join(
        InsetFeature, SentiStrength.news_guid == InsetFeature.news_guid
    ).all()
    
    y = [d[0].label_sentistrength for d in data]
    inset_pos = np.array([d[1].inset_pos for d in data]).reshape(-1, 1)
    inset_neg = np.array([d[1].inset_neg for d in data]).reshape(-1, 1)
    session.close()
    log(f"Jumlah sampel: {len(y)}")

    log("Memuat matriks TF-IDF...")
    X_tfidf = load_npz(tfidf_path)
    log(f"TF-IDF shape: {X_tfidf.shape}")

    log("Membuat fitur InSet (9 fitur)...")
    le = LabelEncoder()
    y_enc = le.fit_transform(y)
    
    inset_pos_abs = np.abs(inset_pos)
    inset_neg_abs = np.abs(inset_neg)
    has_pos = (inset_pos > 0).astype(float)
    has_neg = (inset_neg < 0).astype(float)
    
    X_inset_raw = np.hstack([
        inset_pos,                           # 1. Skor positif asli
        inset_neg,                           # 2. Skor negatif asli
        inset_pos_abs,                       # 3. Absolute positif
        inset_neg_abs,                       # 4. Absolute negatif
        inset_pos + inset_neg,               # 5. Net score
        has_pos,                             # 6. Ada kata positif?
        has_neg,                             # 7. Ada kata negatif?
        has_pos * has_neg,                   # 8. Keduanya?
        inset_pos_abs / (inset_neg_abs + 1), # 9. Rasio
    ])
    
    scaler = MinMaxScaler()
    X_inset_scaled = scaler.fit_transform(X_inset_raw)
    X_combined = hstack([X_tfidf, X_inset_scaled]).tocsr()
    log(f"Dimensi gabungan: {X_combined.shape}")

    # Grid search alpha
    RANDOM_STATE = 42
    skf = StratifiedKFold(n_splits=10, shuffle=True, random_state=RANDOM_STATE)
    
    log("\nGrid Search Alpha...")
    best_acc = 0; best_alpha = 1.0; best_norm = True
    for alpha in np.arange(0.01, 1.01, 0.02):
        for norm in [True, False]:
            cnb = ComplementNB(alpha=alpha, norm=norm)
            acc = cross_val_score(cnb, X_combined, y_enc, cv=skf, scoring='accuracy').mean()
            if acc > best_acc: best_acc = acc; best_alpha = alpha; best_norm = norm
    
    log(f"Best Alpha: {best_alpha:.2f}, Norm: {best_norm}")
    
    # Final model
    cnb = ComplementNB(alpha=best_alpha, norm=best_norm)
    acc_scores = cross_val_score(cnb, X_combined, y_enc, cv=skf, scoring='accuracy')
    prec_scores = cross_val_score(cnb, X_combined, y_enc, cv=skf, scoring='precision_macro')
    rec_scores = cross_val_score(cnb, X_combined, y_enc, cv=skf, scoring='recall_macro')
    f1_scores = cross_val_score(cnb, X_combined, y_enc, cv=skf, scoring='f1_macro')
    
    skf_base = StratifiedKFold(n_splits=10, shuffle=True, random_state=RANDOM_STATE)
    cnb_default = ComplementNB()
    acc_base = cross_val_score(cnb_default, X_tfidf, y_enc, cv=skf_base, scoring='accuracy')
    prec_base = cross_val_score(cnb_default, X_tfidf, y_enc, cv=skf_base, scoring='precision_macro')
    rec_base = cross_val_score(cnb_default, X_tfidf, y_enc, cv=skf_base, scoring='recall_macro')
    f1_base = cross_val_score(cnb_default, X_tfidf, y_enc, cv=skf_base, scoring='f1_macro')
    
    improvement_acc = (acc_scores.mean() - acc_base.mean()) * 100
    improvement_f1 = (f1_scores.mean() - f1_base.mean()) * 100
    
    log(f"\nProposed: Acc={acc_scores.mean():.2%}, Prec={prec_scores.mean():.2%}, Rec={rec_scores.mean():.2%}, F1={f1_scores.mean():.2%}")
    log(f"Baseline: Acc={acc_base.mean():.2%}, F1={f1_base.mean():.2%}")
    log(f"Improvement: Acc +{improvement_acc:.2f}%, F1 +{improvement_f1:.2f}%")

    log("\nDetail per fold:")
    for i, (acc, f1) in enumerate(zip(acc_scores, f1_scores)):
        log(f"  Fold {i+1:2d}: Acc={acc:.2%}, F1={f1:.2%}")

    y_pred = cross_val_predict(cnb, X_combined, y_enc, cv=skf)
    report_text = classification_report(y_enc, y_pred, target_names=le.classes_)
    cm = confusion_matrix(y_enc, y_pred)
    log("\n" + report_text)

    # Simpan
    log("Menyimpan ke database...")
    session = SessionLocal()
    exp_name = f"CNB_TFIDF_InSet_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    
    try:
        new_exp = ExperimentResult(
            experiment_name=exp_name, model_type="ComplementNB",
            total_samples=len(y_enc), cv_folds=10,
            accuracy_mean=float(acc_scores.mean()), accuracy_std=float(acc_scores.std()),
            precision_mean=float(prec_scores.mean()), precision_std=float(prec_scores.std()),
            recall_mean=float(rec_scores.mean()), recall_std=float(rec_scores.std()),
            f1_score_mean=float(f1_scores.mean()), f1_score_std=float(f1_scores.std()),
            baseline_accuracy_mean=float(acc_base.mean()), baseline_accuracy_std=float(acc_base.std()),
            baseline_precision_mean=float(prec_base.mean()), baseline_precision_std=float(prec_base.std()),
            baseline_recall_mean=float(rec_base.mean()), baseline_recall_std=float(rec_base.std()),
            baseline_f1_mean=float(f1_base.mean()), baseline_f1_std=float(f1_base.std()),
            improvement_accuracy=float(improvement_acc), improvement_f1=float(improvement_f1),
            classification_report=report_text, confusion_matrix=json.dumps(cm.tolist()),
            feature_count=X_combined.shape[1], additional_features=f"InSet (9 fitur)"
        )
        session.add(new_exp)
        session.commit()
        exp_id = new_exp.id
        
        for i, (acc, f1) in enumerate(zip(acc_scores, f1_scores)):
            session.add(CvFold(experiment_id=exp_id, fold_number=i+1, accuracy=float(acc), f1_score=float(f1)))
        session.commit()
        log(f"Eksperimen tersimpan! ID: {exp_id}")
    except Exception as e:
        log(f"Error: {str(e)}")
        session.rollback()
    finally:
        session.close()

    os.makedirs(os.path.join(backend_dir, "models"), exist_ok=True)
    cnb.fit(X_combined, y_enc)
    joblib.dump(cnb, os.path.join(backend_dir, "models", "cnb_model.pkl"))
    joblib.dump(le, os.path.join(backend_dir, "models", "label_encoder.pkl"))
    joblib.dump(scaler, os.path.join(backend_dir, "models", "scaler_inset.pkl"))
    
    log("\nSELESAI!")

if __name__ == "__main__":
    run_modeling_pipeline()