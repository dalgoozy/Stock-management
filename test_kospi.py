import requests
import re
res = requests.get('https://finance.naver.com/sise/sise_index.naver?code=KOSPI', headers={'User-Agent': 'Mozilla/5.0'})
print(re.findall(r'id="now_value">([\d,.]+)', res.text))
