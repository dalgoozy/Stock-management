"""Google Sheets JSONP 응답 구조 확인"""
import requests
import re
import json

SHEET_ID = '1Ohg32uNneSFBQajG0Eqqe-Bdvkwpkw-FkvWS9cH-a8o'

url = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq?tqx=out:json&sheet=AI%EC%98%88%EC%B8%A1&tq=SELECT%20*%20LIMIT%205%20OFFSET%20295"
headers = {'User-Agent': 'Mozilla/5.0'}

res = requests.get(url, headers=headers, timeout=10)
# JSONP wrapper 제거
text = res.text
# "google.visualization.Query.setResponse(" ... ")" 패턴 제거
match = re.search(r'setResponse\((.*)\);?$', text, re.DOTALL)
if match:
    json_str = match.group(1)
    data = json.loads(json_str)
    
    print("Columns:")
    for col in data['table']['cols']:
        print(f"  {col.get('id', 'N/A')} | label: '{col.get('label', '')}' | type: {col.get('type', 'N/A')}")
    
    print("\nLast rows:")
    for row in data['table']['rows']:
        cells = []
        for cell in row['c']:
            if cell:
                cells.append(f"v={cell.get('v', 'NULL')} f={cell.get('f', 'N/A')}")
            else:
                cells.append("NULL")
        print(f"  {' | '.join(cells)}")
else:
    print("Could not parse JSONP response")
    print(text[:500])
