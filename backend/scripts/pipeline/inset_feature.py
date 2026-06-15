# scripts/pipeline/inset_feature.py
import sys
import os
import pandas as pd
import numpy as np
import joblib
from pathlib import Path
from sklearn.preprocessing import MinMaxScaler

backend_dir = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(backend_dir))

from database import SessionLocal, Preprocessing, InsetFeature

def load_inset_lexicon(pos_path, neg_path):
    pos_lex = {}
    neg_lex = {}
    
    if os.path.exists(pos_path):
        try:
            df_pos = pd.read_csv(pos_path, sep='\t' if pos_path.endswith('.tsv') else ',', encoding='utf-8')
            if 'word' in df_pos.columns and 'score' in df_pos.columns:
                for _, row in df_pos.iterrows():
                    pos_lex[str(row['word']).lower().strip()] = int(row['score'])
            elif len(df_pos.columns) == 2:
                for _, row in df_pos.iterrows():
                    pos_lex[str(row.iloc[0]).lower().strip()] = int(row.iloc[1])
        except Exception as e:
            print(f"⚠️ Error reading {pos_path}: {e}")
    else:
        print(f"⚠️ WARNING: {pos_path} tidak ditemukan! Pakai default.")
        pos_lex = {'bagus': 4, 'baik': 3, 'suka': 3, 'keren': 4, 'mantap': 4, 'terbaik': 5}

    if os.path.exists(neg_path):
        try:
            df_neg = pd.read_csv(neg_path, sep='\t' if neg_path.endswith('.tsv') else ',', encoding='utf-8')
            if 'word' in df_neg.columns and 'score' in df_neg.columns:
                for _, row in df_neg.iterrows():
                    neg_lex[str(row['word']).lower().strip()] = int(row['score'])
            elif len(df_neg.columns) == 2:
                for _, row in df_neg.iterrows():
                    neg_lex[str(row.iloc[0]).lower().strip()] = int(row.iloc[1])
        except Exception as e:
            print(f"⚠️ Error reading {neg_path}: {e}")
    else:
        print(f"⚠️ WARNING: {neg_path} tidak ditemukan! Pakai default.")
        neg_lex = {'jelek': -4, 'buruk': -3, 'kecewa': -4, 'gagal': -3}
        
    return pos_lex, neg_lex

def extract_inset_features(text, pos_lex, neg_lex):
    if not isinstance(text, str): 
        return 0, 0
    
    original_text = text.lower()
    pos_score, neg_score = 0, 0
    
    pos_multi = {k: v for k, v in pos_lex.items() if len(k.split()) > 1}
    pos_single = {k: v for k, v in pos_lex.items() if len(k.split()) == 1}
    neg_multi = {k: v for k, v in neg_lex.items() if len(k.split()) > 1}
    neg_single = {k: v for k, v in neg_lex.items() if len(k.split()) == 1}
    
    all_multi = {**pos_multi, **neg_multi}
    multi_phrases = sorted(list(all_multi.keys()), key=len, reverse=True)
    
    temp_text = original_text
    for phrase in multi_phrases:
        if phrase in temp_text:
            score = pos_multi.get(phrase, neg_multi.get(phrase, 0))
            if score > 0:
                pos_score += score
            else:
                neg_score += score
            temp_text = temp_text.replace(phrase, ' ' * len(phrase))
            
    words = temp_text.split()
    for word in words:
        clean_word = word.strip('()[]{}.,!?;:"\'')
        if clean_word:
            if '_' in clean_word:
                pos_score += pos_single.get(clean_word, 0)
                neg_score += neg_single.get(clean_word, 0)
                alt_word = clean_word.replace('_', ' ')
                pos_score += pos_multi.get(alt_word, 0)
                neg_score += neg_multi.get(alt_word, 0)
            else:
                pos_score += pos_single.get(clean_word, 0)
                neg_score += neg_single.get(clean_word, 0)
                
    return pos_score, neg_score

def generate_scaler():
    """Generate MinMaxScaler dari semua data InSet"""
    print("\n🔧 Membuat scaler dari semua data InSet...")
    
    session = SessionLocal()
    all_inset = session.query(InsetFeature.inset_pos, InsetFeature.inset_neg).all()
    session.close()
    
    if len(all_inset) == 0:
        print("⚠️ Tidak ada data InSet!")
        return None
    
    pos_values = np.array([d[0] for d in all_inset if d[0] is not None]).reshape(-1, 1)
    neg_values = np.array([d[1] for d in all_inset if d[1] is not None]).reshape(-1, 1)
    
    print(f"   Positif: {len(pos_values)} sampel, range: [{pos_values.min():.0f}, {pos_values.max():.0f}]")
    print(f"   Negatif: {len(neg_values)} sampel, range: [{neg_values.min():.0f}, {neg_values.max():.0f}]")
    
    X_inset_all = np.hstack([pos_values, neg_values])
    scaler = MinMaxScaler()
    scaler.fit(X_inset_all)
    
    models_dir = os.path.join(backend_dir, "models")
    os.makedirs(models_dir, exist_ok=True)
    scaler_path = os.path.join(models_dir, "scaler_inset.pkl")
    joblib.dump(scaler, scaler_path)
    
    print(f"✅ Scaler saved: scaler_inset.pkl")
    return scaler

def run_inset_pipeline():
    print("=" * 60)
    print("TAHAP 3: EKSTRAKSI FITUR INSET")
    print("=" * 60)
    
    lexicon_dir = os.path.join(backend_dir, "lexicons", "inset")
    pos_path = os.path.join(lexicon_dir, "positive.tsv")
    neg_path = os.path.join(lexicon_dir, "negative.tsv")
    
    pos_lex, neg_lex = load_inset_lexicon(pos_path, neg_path)
    print(f"✅ Lexicon: {len(pos_lex)} positif, {len(neg_lex)} negatif")
    
    session = SessionLocal()
    prep_list = session.query(Preprocessing).all()
    total_data = len(prep_list)
    print(f"\nData preprocessing: {total_data}")
    
    count = 0
    print("\nEkstraksi InSet...")
    for prep in prep_list:
        try:
            p_score, n_score = extract_inset_features(prep.clean_title, pos_lex, neg_lex)
            
            existing = session.query(InsetFeature).filter_by(news_guid=prep.news_guid).first()
            if existing:
                existing.inset_pos = p_score
                existing.inset_neg = n_score
            else:
                session.add(InsetFeature(news_guid=prep.news_guid, inset_pos=p_score, inset_neg=n_score))
                
            count += 1
        except Exception as e:
            print(f"Error GUID {prep.news_guid}: {e}")
        
        if count % 500 == 0:
            print(f"  Progres: {count}/{total_data}")
    
    session.commit()
    session.close()
    
    print(f"\n✅ Ekstraksi InSet selesai: {count} data")
    
    # Generate scaler
    print("\n" + "=" * 60)
    generate_scaler()
    
    print("\n✅ PIPELINE INSET SELESAI")

if __name__ == "__main__":
    run_inset_pipeline()