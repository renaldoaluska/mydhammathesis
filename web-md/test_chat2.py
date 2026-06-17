import requests
import json
import sys

resp = requests.post(
    'http://127.0.0.1:5002/api/chat',
    json={"message":"@Dt","history":[],"mentions":["dt"]},
    stream=True
)

print(f"Status Code: {resp.status_code}")
print(f"Headers: {resp.headers}")

for line in resp.iter_lines():
    if line:
        print("RAW:", line.decode('utf-8'))
