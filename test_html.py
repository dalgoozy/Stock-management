"""네이버 금융 해외 지수 및 환율 HTML 구조 확인"""
import requests
import re

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}

# S&P 500
print("===== S&P 500 =====")
res = requests.get('https://finance.naver.com/world/sise.naver?symbol=SPI@SPX', headers=headers, timeout=10)
# no_today 주변 텍스트
idx = res.text.find('no_today')
if idx >= 0:
    snippet = res.text[max(0, idx-50):idx+300]
    print(snippet)
else:
    print("'no_today' not found")
    # 다른 패턴 시도
    for pattern in ['now_value', 'sise_home', 'today_value', 'closePrice', 'last_price', 'pArea']:
        idx2 = res.text.find(pattern)
        if idx2 >= 0:
            print(f"\nFound '{pattern}' at {idx2}:")
            print(res.text[max(0,idx2-30):idx2+200])

# NASDAQ 
print("\n\n===== NASDAQ =====")
res2 = requests.get('https://finance.naver.com/world/sise.naver?symbol=NAS@IXIC', headers=headers, timeout=10)
idx = res2.text.find('no_today')
if idx >= 0:
    snippet = res2.text[max(0, idx-50):idx+300]
    print(snippet)

# USD/KRW
print("\n\n===== USD/KRW =====")
res3 = requests.get('https://finance.naver.com/marketindex/exchangeDetail.naver?marketindexCd=FX_USDKRW', headers=headers, timeout=10)
# value 패턴 검색
for pattern in ['class="value"', 'exchangeData', 'basePrice', 'marketindex_exchange', 'current']:
    idx = res3.text.find(pattern)
    if idx >= 0:
        snippet = res3.text[max(0, idx-30):idx+200]
        print(f"\nFound '{pattern}' at {idx}:")
        print(snippet)
        break
else:
    print("No matching pattern found")
    # 숫자 패턴 검색 (1,300~1,500 범위의 환율)
    matches = re.findall(r'1[,\.]?[34]\d{2}\.?\d*', res3.text[:5000])
    print(f"Possible exchange rates in first 5000 chars: {matches[:10]}")

# 닛케이 225
print("\n\n===== 닛케이 225 =====")
res4 = requests.get('https://finance.naver.com/world/sise.naver?symbol=NII@NI225', headers=headers, timeout=10)
idx = res4.text.find('no_today')
if idx >= 0:
    snippet = res4.text[max(0, idx-50):idx+300]
    print(snippet)
