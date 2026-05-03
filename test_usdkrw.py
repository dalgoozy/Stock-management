"""환율 페이지 HTML 구조 확인"""
import requests
import re

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}

# 환율 메인 페이지로 시도
res = requests.get('https://finance.naver.com/marketindex/', headers=headers, timeout=10)
# 1,3xx 패턴 검색 (현재 환율 범위)
matches = re.findall(r'1[,.]?[23456]\d{2}\.\d+', res.text[:15000])
print(f"Possible USD/KRW values on main page: {matches[:10]}")

# exchangeList 근처 확인
idx = res.text.find('FX_USDKRW')
if idx >= 0:
    print(f"\nFX_USDKRW context:")
    print(res.text[max(0,idx-200):idx+400])

# 환율 상세 페이지 다른 방법
res2 = requests.get('https://finance.naver.com/marketindex/exchangeDetail.naver?marketindexCd=FX_USDKRW', headers=headers, timeout=10)
# basePrice 패턴
for pattern in ['basePrice', 'base_price', 'marketPrice', 'class="value"', '<p class="no_today"', 'blind']:
    idx = res2.text.find(pattern)
    if idx >= 0:
        print(f"\n[exchangeDetail] Found '{pattern}' at {idx}:")
        print(res2.text[max(0,idx-30):idx+300])
        break

# 환율 API 직접 시도
print("\n\n===== 네이버 환율 API 시도 =====")
try:
    api_url = "https://m.stock.naver.com/front-api/marketIndex/productDetail?category=exchange&reutersCode=FX_USDKRW"
    res3 = requests.get(api_url, headers=headers, timeout=10)
    print(f"Status: {res3.status_code}")
    if res3.status_code == 200:
        print(res3.text[:500])
except Exception as e:
    print(f"Error: {e}")
