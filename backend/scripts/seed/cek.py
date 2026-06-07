from pathlib import Path
import pandas as pd

csv_file = Path(__file__).resolve().parent / "news_data.csv"

df = pd.read_csv(csv_file)

for idx in [101, 764, 1862]:
    print("=" * 50)
    print("BARIS:", idx + 1)
    print(df.iloc[idx]["title"])