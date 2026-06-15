# Models Directory

Folder ini digunakan untuk menyimpan file model, vectorizer, scaler, dan artefak lain yang dihasilkan selama proses pelatihan (training) model machine learning.

Seluruh file pada folder ini tidak disertakan dalam repository Git karena merupakan hasil proses training dan dapat dibuat ulang kapan saja menggunakan dataset serta script yang tersedia pada repository.

Untuk menghasilkan file model:

1. Pastikan seluruh dependensi telah terinstal.
2. Jalankan proses preprocessing data.
3. Jalankan proses training model.
4. File model dan artefak pendukung akan otomatis tersimpan pada folder `models`.

Catatan:

- File dalam folder ini diperlukan agar aplikasi dapat melakukan prediksi.
- Setelah melakukan clone repository, folder `models` akan kosong kecuali file `README.md`.
- Jalankan proses training terlebih dahulu untuk menghasilkan file yang dibutuhkan aplikasi.
