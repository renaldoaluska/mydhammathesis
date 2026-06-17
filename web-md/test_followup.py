import requests
import json
import sys

payload = {
    "message": "Apa yang dimaksud dengan 12 landasan dalam konteks Dt?",
    "history": [
        {"role": "user", "content": "@Dt"},
        {"role": "assistant", "content": "Dt — Dhātukathā adalah bagian dari Abhidhammapiṭaka dan terdiri dari 19 teks. Ia membahas mātikā yang berkaitan dengan 5 gugusan, 12 landasan, dan 18 elemen/unsur. Teks ini disusun sesuai metode empat belas."}
    ],
    "mentions": []
}

resp = requests.post(
    'http://127.0.0.1:5002/api/chat',
    json=payload,
    stream=True
)

for line in resp.iter_lines():
    if line:
        print("RAW:", line.decode('utf-8'))
