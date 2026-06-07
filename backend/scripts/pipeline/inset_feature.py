import sys
import os
import pandas as pd
from pathlib import Path

# Naik 3 tingkat untuk mengenali folder 'backend'
backend_dir = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(backend_dir))

# Import koneksi database (Sesuaikan nama class InsetFeature dengan di database.py Anda)
from database import SessionLocal, Preprocessing, InsetFeature

def load_inset_lexicon(pos_path, neg_path):
    # (Kode fungsi ini SAMA PERSIS dengan milik Anda, saya persingkat di tampilan ini 
    # tapi pastikan Anda menyalin full dari kode asli Anda)
    pos_lex = {}
    neg_lex = {}
    
    if os.path.exists(pos_path):
        try:
            if pos_path.endswith('.tsv'):
                df_pos = pd.read_csv(pos_path, sep='\t', encoding='utf-8')
            else:
                df_pos = pd.read_csv(pos_path, encoding='utf-8')
            
            if 'word' in df_pos.columns and 'score' in df_pos.columns:
                for _, row in df_pos.iterrows():
                    word = str(row['word']).lower().strip()
                    try: pos_lex[word] = int(row['score'])
                    except: pass
            elif len(df_pos.columns) == 2:
                for _, row in df_pos.iterrows():
                    word = str(row.iloc[0]).lower().strip()
                    try: pos_lex[word] = int(row.iloc[1])
                    except: pass
        except Exception as e:
            print(f"⚠️ Error reading {pos_path}: {e}")
    else:
        print(f"⚠️ WARNING: File {pos_path} tidak ditemukan! Menggunakan default.")
        pos_lex = {'bagus': 4, 'baik': 3, 'suka': 3, 'keren': 4, 'mantap': 4, 'terbaik': 5}

    if os.path.exists(neg_path):
        try:
            if neg_path.endswith('.tsv'):
                df_neg = pd.read_csv(neg_path, sep='\t', encoding='utf-8')
            else:
                df_neg = pd.read_csv(neg_path, encoding='utf-8')
            
            if 'word' in df_neg.columns and 'score' in df_neg.columns:
                for _, row in df_neg.iterrows():
                    word = str(row['word']).lower().strip()
                    try: neg_lex[word] = int(row['score'])
                    except: pass
            elif len(df_neg.columns) == 2:
                for _, row in df_neg.iterrows():
                    word = str(row.iloc[0]).lower().strip()
                    try: neg_lex[word] = int(row.iloc[1])
                    except: pass
        except Exception as e:
            print(f"⚠️ Error reading {neg_path}: {e}")
    else:
        print(f"⚠️ WARNING: File {neg_path} tidak ditemukan! Menggunakan default.")
        neg_lex = {'jelek': -4, 'buruk': -3, 'kecewa': -4, 'gagal': -3}
        
    return pos_lex, neg_lex

def extract_inset_features(text, pos_lex, neg_lex):
    # (Kode fungsi ini SAMA PERSIS dengan milik Anda)
    if not isinstance(text, str): return 0, 0
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
            if score > 0: pos_score += score
            else: neg_score += score
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

def run_inset_pipeline():
    print("=" * 60)
    print("TAHAP 3: EKSTRAKSI FITUR INSET (DATABASE MODE)")
    print("=" * 60)
    
    # Resolusi path lexicon InSet
    lexicon_dir = os.path.join(backend_dir, "lexicons", "inset")
    pos_path = os.path.join(lexicon_dir, "positive.tsv")
    neg_path = os.path.join(lexicon_dir, "negative.tsv")
    
    if not os.path.exists(pos_path) or not os.path.exists(neg_path):
        print(f"Mencari lexicon di {lexicon_dir}...")
    
    pos_lex, neg_lex = load_inset_lexicon(pos_path, neg_path)
    
    session = SessionLocal()
    print("Mengambil data dari tabel 'preprocessing'...")
    prep_list = session.query(Preprocessing).all()
    total_data = len(prep_list)
    print(f"Ditemukan {total_data} data untuk diekstrak fiturnya.")

    count_success = 0

    print("\nMelakukan ekstraksi InSet...")
    for prep in prep_list:
        try:
            p_score, n_score = extract_inset_features(prep.clean_title, pos_lex, neg_lex)
            
            # Upsert ke database (Sesuaikan dengan nama model database Anda)
            existing_data = session.query(InsetFeature).filter_by(news_guid=prep.news_guid).first()
            
            if existing_data:
                existing_data.inset_pos = p_score
                existing_data.inset_neg = n_score
            else:
                new_feature = InsetFeature(
                    news_guid=prep.news_guid,
                    inset_pos=p_score,
                    inset_neg=n_score
                )
                session.add(new_feature)
                
            count_success += 1
            
        except Exception as e:
            print(f"Error pada GUID {prep.news_guid}: {e}")

        if count_success % 500 == 0:
            print(f"Progres: {count_success} / {total_data} data diekstrak...")

    session.commit()
    session.close()
    
    print("\n" + "=" * 60)
    print(f"✅ EKSTRAKSI INSET SELESAI")
    print(f"Fitur berhasil disimpan ke database: {count_success}")
    print("=" * 60)

if __name__ == "__main__":
    run_inset_pipeline()