"""Google Sheets 컬럼 구조 및 데이터 확인"""
import requests
import json

SHEET_ID = '1Ohg32uNneSFBQajG0Eqqe-Bdvkwpkw-FkvWS9cH-a8o'
headers = {'User-Agent': 'Mozilla/5.0'}

for sheet in ['AI예측', '포트폴리오', '시세']:
    print(f"\n{'='*50}")
    print(f"시트: {sheet}")
    print(f"{'='*50}")
    url = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq?tqx=out:csv&sheet={sheet}"
    try:
        res = requests.get(url, headers=headers, timeout=10)
        if res.status_code == 200:
            lines = res.text.strip().split('\n')
            print(f"헤더: {lines[0]}")
            print(f"총 행수: {len(lines)}")
            if len(lines) > 1:
                print(f"첫 데이터: {lines[1]}")
            if len(lines) > 2:
                print(f"마지막 데이터: {lines[-1]}")
            # AI예측 시트면 더 많은 정보 출력
            if sheet == 'AI예측':
                print(f"\n--- 마지막 20행 ---")
                for line in lines[-20:]:
                    print(f"  {line}")
        else:
            print(f"HTTP {res.status_code}")
    except Exception as e:
        print(f"Error: {e}")

# 네이버 환율 API로 환율 가져오기
print(f"\n{'='*50}")
print("네이버 모바일 API - 환율")
print(f"{'='*50}")
api_url = "https://m.stock.naver.com/front-api/marketIndex/productDetail?category=exchange&reutersCode=FX_USDKRW"
res = requests.get(api_url, headers=headers, timeout=10)
data = res.json()
if data.get('isSuccess'):
    r = data['result']
    print(f"  USD/KRW: {r.get('closePrice', 'N/A')}")
    print(f"  거래일: {r.get('localTradedAt', 'N/A')}")
