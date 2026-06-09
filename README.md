# Gosenti - Sentiment Analysis Dashboard

Gosenti adalah aplikasi analisis sentimen berita saham GOTO menggunakan Complement Naive Bayes (CNB) dengan InSet Lexicon sebagasi feature dan pelabelan otomatis SentiStrength_ID.

## Fitur Utama

### Dashboard
- Tren sentimen per bulan (Area Chart)
- Distribusi sentimen (Pie Chart)
- Perbandingan tahunan (Bar Chart)
- Statistik total berita

### Data Management
- Data Berita: Lihat data mentah hasil scraping dengan pagination
- Preprocessing: Cleaning teks (lowercase, hapus URL, mention, hashtag, angka)
- SentiStrength: Pelabelan otomatis sentimen (positive, neutral, negative)
- InSet Feature: Ekstraksi fitur leksikon dengan normalisasi MinMax
- TF-IDF: Vectorization + Tag Cloud + Word Cloud per kelas
- Deduplikasi: Deteksi berita duplikat menggunakan Jaccard Similarity

### Machine Learning
- Modeling: Training CNB dengan 10-Fold Stratified Cross Validation
- Evaluation: Baseline vs Proposed, Confusion Matrix, Classification Report
- Grid Search: Optimasi parameter alpha (0.01 - 1.00)
- Uji Statistik: Paired t-test untuk signifikansi

## Arsitektur

Frontend (Next.js 14 + shadcn/ui) -> REST API -> Backend (FastAPI) -> Database (PostgreSQL)

## Pipeline Penelitian

1. Preprocessing: Case folding, hapus noise
2. SentiStrength_ID: Pelabelan otomatis
3. InSet Lexicon: Ekstraksi fitur (2 fitur)
4. TF-IDF: Vectorization (5000 fitur)
5. CNB: Klasifikasi 3 kelas
6. Evaluasi: 10-Fold CV, Confusion Matrix

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14, shadcn/ui, Tailwind CSS, Recharts, Lucide Icons |
| Backend | FastAPI, SQLAlchemy, scikit-learn, pandas, numpy |
| Database | PostgreSQL |
| Lexicon | Inset Lexicon, SentiStrength_ID |
| ML Model | ComplementNB, TF-IDF |
| Visualisasi | Matplotlib, Seaborn, WordCloud |

## Cara Menjalankan

### Prasyarat
- Python 3.10+
- Node.js 18+
- PostgreSQL 14+
- pnpm

### Backend
```txt
cd backend
python -m venv .venv
.venv\Scripts\activate (Windows) / source .venv/bin/activate (Linux/Mac)
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```
### Frontend
```txt
cd frontend
pnpm install
pnpm dev
Buka http://localhost:3000 di browser.
```
## Struktur Project
```txt
gosenti/
├── backend/
│   ├── main.py              (FastAPI application)
│   ├── database.py          (SQLAlchemy models)
│   ├── requirements.txt
│   ├── scripts/pipeline/    (Pipeline scripts)
│   ├── models/              (ML models .pkl)
│   └── lexicons/            (InSet & SentiStrength)
├── frontend/
│   ├── src/app/             (Next.js pages)
│   ├── src/components/      (shadcn/ui components)
│   ├── src/hooks/           (Custom hooks)
│   └── package.json
└── README.md
```
## Author

Ahmad Zaky Ubaidillah - Mahasiswa Teknik Informatika

## Acknowledgments

- InSet Lexicon by Koto & Adriani (2017)
- SentiStrength_ID by masdevid
- shadcn/ui component library
- FastAPI framework
