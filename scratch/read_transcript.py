import json

path = r'C:\Users\jclou\.gemini\antigravity\brain\c1c01b32-0294-42e0-a526-18f205e9d6d5\.system_generated\logs\transcript_full.jsonl'
with open(path, 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        if 4410 <= i <= 4445:
            obj = json.loads(line)
            src = obj.get('source')
            st = obj.get('step_index')
            typ = obj.get('type')
            th = obj.get('thinking', '')
            tc = obj.get('tool_calls', [])
            print(f"=== L{i} st={st} typ={typ} ===")
            if th:
                print("Thinking:", th[:300].replace('\n', ' '))
            for c in tc:
                print("Tool:", c['name'], c.get('args'))
            if obj.get('content') and typ == 'PLANNER_RESPONSE':
                print("Content:", obj.get('content')[:300].replace('\n', ' '))
