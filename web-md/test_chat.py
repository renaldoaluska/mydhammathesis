import requests
import json
import sys

resp = requests.post(
    'http://127.0.0.1:5002/api/chat',
    json={"message":"@Dt","history":[],"mentions":["dt"]},
    stream=True
)

for line in resp.iter_lines():
    if line:
        line_str = line.decode('utf-8')
        if line_str.startswith('data: '):
            data = line_str[6:]
            if data == '[DONE]':
                break
            try:
                chunk = json.loads(data)
                if chunk.get("type") == "chunk":
                    sys.stdout.write(chunk.get("text", ""))
                    sys.stdout.flush()
                elif chunk.get("type") == "final":
                    print("\n\n=== FINAL ===")
                    print(chunk.get("answer"))
            except json.JSONDecodeError:
                pass

print("\nDone")
