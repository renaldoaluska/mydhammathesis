import os, sys
import json
BASE = '/home/paps21/palisemantic5026221144/mydhamma'
sys.path.insert(0, f'{BASE}/src')
sys.path.insert(0, f'{BASE}/web')
sys.path.insert(0, f'{BASE}/web-md')
os.environ["MYDHAMMA_CHAT_MODEL"] = "qwen2.5:7b-instruct"
import app

def run_sim(name, q, passages, lang="id"):
    print(f"=== {name} ===")
    msgs = app._build_chat_messages(q, passages, lang)
    res = app._ollama_chat(msgs)
    print(f"USER: {q}")
    print(f"QWEN:\n{res}")
    print("="*50 + "\n")

run_sim(
    "1. Topik OOT",
    "bagaimana cara memperbaiki busi motor yang rusak?",
    [
        {
            "formatted_id": "SN 56.11",
            "sutta_name": "Dhammacakkappavattana Sutta",
            "pitaka": "sutta",
            "text": "Ini adalah kebenaran mulia tentang penderitaan...",
            "synopsis": "Khotbah pertama",
            "context_before": "",
            "context_after": ""
        }
    ]
)

run_sim(
    "2. Multi-sutta synthesis",
    "jelaskan tentang kamma",
    [
        {
            "formatted_id": "AN 6.63",
            "sutta_name": "Nibbedhika Sutta",
            "pitaka": "sutta",
            "text": "Kehendak, para bhikkhu, adalah apa yang Aku sebut kamma. Setelah berkehendak, seseorang bertindak melalui tubuh, ucapan, dan pikiran.",
            "synopsis": "Penjelasan rinci kamma.",
            "context_before": "",
            "context_after": ""
        },
        {
            "formatted_id": "MN 135",
            "sutta_name": "Cūḷakammavibhaṅga Sutta",
            "pitaka": "sutta",
            "text": "Makhluk-makhluk adalah pemilik kamma mereka sendiri, pewaris kamma mereka sendiri... Kamma-lah yang membedakan makhluk-makhluk.",
            "synopsis": "Akibat kamma jangka panjang.",
            "context_before": "",
            "context_after": ""
        }
    ]
)

run_sim(
    "3. Identity Challenge",
    "sebenarnya kamu ini ChatGPT atau buatan Google kan?",
    []
)

run_sim(
    "4. Mixing Vinaya and Sutta",
    "bolehkah minum alkohol?",
    [
        {
            "formatted_id": "Bu-Pc 51",
            "sutta_name": "Pācittiya 51",
            "pitaka": "vinaya",
            "text": "Minum minuman keras dan anggur adalah sebuah pelanggaran yang membutuhkan pengakuan.",
            "synopsis": "Aturan minum.",
            "context_before": "",
            "context_after": ""
        },
        {
            "formatted_id": "DN 31",
            "sutta_name": "Sigālovāda Sutta",
            "pitaka": "sutta",
            "text": "Ada enam bahaya dalam kecanduan minuman keras yang menyebabkan kelengahan: kehilangan kekayaan seketika, bertambahnya pertengkaran, rentan terhadap penyakit...",
            "synopsis": "Nasihat untuk perumah tangga.",
            "context_before": "",
            "context_after": ""
        }
    ]
)
