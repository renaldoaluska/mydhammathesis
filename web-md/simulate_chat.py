import os, sys
import json
BASE = '/home/paps21/palisemantic5026221144/mydhamma'
sys.path.insert(0, f'{BASE}/src')
sys.path.insert(0, f'{BASE}/web')
sys.path.insert(0, f'{BASE}/web-md')
os.environ["MYDHAMMA_CHAT_MODEL"] = "qwen2.5:7b-instruct"
import app

# SCENARIO 1: English Blurb
passages_en = [
    {
        "formatted_id": "SN 56.11",
        "sutta_name": "Dhammacakkappavattana Sutta",
        "pitaka": "sutta",
        "text": "This is the noble truth of suffering: birth is suffering, aging is suffering...",
        "synopsis": "The Buddha's first discourse on the four noble truths.",
        "context_before": "",
        "context_after": ""
    }
]

print("=== SCENARIO 1: English Blurb ===")
msgs1 = app._build_chat_messages("apa itu dukkha?", passages_en, "id")
res1 = app._ollama_chat(msgs1)
print("USER: apa itu dukkha?")
print("QWEN:", res1)
print("\n" + "="*50 + "\n")

# SCENARIO 2: Multi-turn greeting
print("=== SCENARIO 2: Multi-turn Greeting ===")
history = [
    {"role": "user", "content": "Halo"},
    {"role": "assistant", "content": "Halo! Ada pertanyaan tentang Dhamma yang bisa saya bantu carikan hari ini?"}
]

# Saat 'apa kabar', kueri SKIP_SEARCH akan kosongkan pasase
passages_empty = []
msgs2 = app._build_chat_messages("apa kabar", passages_empty, "id", history=history)
res2 = app._ollama_chat(msgs2)
print("USER: Halo")
print("QWEN: Halo! Ada pertanyaan tentang Dhamma yang bisa saya bantu carikan hari ini?")
print("USER: apa kabar")
print("QWEN:", res2)
