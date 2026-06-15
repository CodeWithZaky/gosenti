# scripts/pipeline/sentistrength.py
import sys
import os
import re
from pathlib import Path

# Naik 3 tingkat untuk mengenali folder 'backend'
backend_dir = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(backend_dir))

# Import koneksi database
from database import SessionLocal, Preprocessing, SentiStrength

# Path ke SentiStrength
SENTI_PATH = os.path.join(backend_dir, "lexicons", "sentistrength_id")
sys.path.insert(0, SENTI_PATH)


def load_sentistrength():
    try:
        from sentistrength import sentistrength
        config = {
            "negation": True, "booster": True, "ungkapan": True,
            "consecutive": True, "repeated": True, "emoticon": True,
            "question": True, "exclamation": True, "punctuation": True
        }
        return sentistrength(config)
    except Exception as e:
        print(f"❌ Error loading SentiStrength: {e}")
        return None


def run_sentistrength():
    print("=" * 60)
    print("TAHAP 2: PELABELAN SENTISTRENGTH (DATABASE MODE)")
    print("=" * 60)
    
    senti = load_sentistrength()
    if senti is None:
        print("Pastikan folder backend/lexicons/sentistrength_id/ sudah lengkap!")
        return
    
    # Debug: cek jumlah kata dalam dictionary
    print(f"  sentiwords_dict: {len(senti.sentiwords_dict)} kata")
    print(f"  emoticon_dict: {len(senti.emoticon_dict)} kata")
    print(f"  idioms_dict: {len(senti.idioms_dict)} kata")
    
    session = SessionLocal()
    
    print("Mengambil data bersih dari tabel 'preprocessing'...")
    prep_list = session.query(Preprocessing).all()
    total_data = len(prep_list)
    print(f"Ditemukan {total_data} data untuk dilabeli.")

    count_success = 0

    print("\nMelakukan pelabelan...")
    for i, prep in enumerate(prep_list):
        try:
            # 1. Eksekusi model SentiStrength
            result = senti.main(str(prep.clean_title))
            label_text = result["kelas"]
            max_pos = result["max_positive"]
            max_neg = result["max_negative"]
            
            # 2. Cek apakah GUID sudah ada (Upsert)
            existing_data = session.query(SentiStrength).filter_by(
                news_guid=prep.news_guid
            ).first()
            
            if existing_data:
                existing_data.label_sentistrength = label_text
                existing_data.ss_max_positive = max_pos
                existing_data.ss_max_negative = max_neg
            else:
                new_senti = SentiStrength(
                    news_guid=prep.news_guid,
                    label_sentistrength=label_text,
                    ss_max_positive=max_pos,
                    ss_max_negative=max_neg,
                )
                session.add(new_senti)
                
            count_success += 1
            
            # Debug: print contoh pertama
            if i == 0:
                print(f"\n  Contoh pertama:")
                print(f"  Teks: {prep.clean_title}")
                print(f"  Label: {label_text}")
                print(f"  Pos: {max_pos}, Neg: {max_neg}")
                print()
            
        except Exception as e:
            print(f"Error pada GUID {prep.news_guid}: {e}")
            import traceback
            traceback.print_exc()

        if count_success % 100 == 0:
            print(f"Progres: {count_success} / {total_data} data dilabeli...")
            session.commit()

    session.commit()
    session.close()
    
    print("\n" + "=" * 60)
    print(f"✅ PELABELAN SELESAI")
    print(f"Data berhasil dilabeli dan disimpan: {count_success}")
    print("=" * 60)


if __name__ == "__main__":
    run_sentistrength()