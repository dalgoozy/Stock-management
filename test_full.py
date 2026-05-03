"""전체 크롤링 + Google Sheets 업데이트 디버그 테스트"""
import requests
import re
import json
import datetime

WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzgmPX-rlkvSqAs2PuZyMA60DGutwYC80Uy5GyQdVIACnsFlq5mCqM1apI0VgG0Qd6l/exec"

# 1) 모든 지수 크롤링 테스트
indices = {
    "KOSPI": ("https://finance.naver.com/sise/sise_index.naver?code=KOSPI", "국내"),
    "KOSDAQ": ("https://finance.naver.com/sise/sise_index.naver?code=KOSDAQ", "국내"),
    "S&P 500": ("https://finance.naver.com/world/sise.naver?symbol=SPI@SPX", "해외"),
    "NASDAQ": ("https://finance.naver.com/world/sise.naver?symbol=NAS@IXIC", "해외"),
    "USD/KRW": ("https://finance.naver.com/marketindex/exchangeDetail.naver?marketindexCd=FX_USDKRW", "환율"),
    "닛케이 225": ("https://finance.naver.com/world/sise.naver?symbol=NII@NI225", "해외")
}

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
results = {}

print("=" * 50)
print(f"크롤링 테스트 시작: {datetime.datetime.now()}")
print("=" * 50)

def parse_naver_span_digits(html_snippet):
    parts = re.findall(r'<span class="(?:no\d|shim|jum)"[^>]*>([^<]+)</span>', html_snippet)
    if not parts:
        return None
    return ''.join(parts).replace(',', '')

for name, (url, category) in indices.items():
    try:
        res = requests.get(url, headers=headers, timeout=10)
        val = None
        
        if category == "국내":
            match = re.search(r'id="now_value"[^>]*>([\d,.]+)', res.text)
            if match:
                val = match.group(1).replace(",", "")
        elif category == "해외":
            # span-encoded digits parsing
            match = re.search(r'<p class="no_today">\s*<em[^>]*>(.*?)</em>', res.text, re.DOTALL)
            if match:
                val = parse_naver_span_digits(match.group(1))
        elif category == "환율":
            # API style or span-encoded
            match = re.search(r'class="value">([\d,.]+)', res.text)
            if match:
                val = match.group(1).replace(",", "")
            else:
                # detailed page might use span-encoded
                match = re.search(r'<p class="no_today">\s*<em[^>]*>(.*?)</em>', res.text, re.DOTALL)
                if match:
                    val = parse_naver_span_digits(match.group(1))
        
        if val:
            results[name] = float(val)
            print(f"  [OK] {name}: {val}")
        else:
            print(f"  [FAIL] {name}: 파싱 실패")
    except Exception as e:
        print(f"  [ERROR] {name}: {e}")

# 2) Google Sheets POST 테스트
print("\n" + "=" * 50)
print("Google Sheets 업데이트 테스트")
print("=" * 50)

now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
test_data = {
    "날짜": "'" + now_str,
    "Date": "'" + now_str,
    "date": "'" + now_str,
    "time": "'" + now_str,
    "섹터": "KOSPI",
    "점수": 0,
    "신호": "N/A",
    "ai_analysis": f"현재 지수: {results.get('KOSPI', 'N/A')}",
    "AI분석": f"현재 지수: {results.get('KOSPI', 'N/A')}",
    "Analysis": f"현재 지수: {results.get('KOSPI', 'N/A')}"
}

print(f"  전송 데이터: {json.dumps(test_data, ensure_ascii=False, indent=2)}")

try:
    res = requests.post(WEB_APP_URL, json=test_data, timeout=15)
    print(f"  HTTP 상태: {res.status_code}")
    print(f"  응답 본문: {res.text[:500]}")
    
    # 리다이렉트 확인
    if res.history:
        print(f"  리다이렉트 이력: {[r.status_code for r in res.history]}")
        print(f"  최종 URL: {res.url}")
except Exception as e:
    print(f"  [ERROR] {e}")

# 3) Google Sheets 읽기 테스트 (AI예측 시트)
print("\n" + "=" * 50)
print("Google Sheets 읽기 테스트 (AI예측)")
print("=" * 50)

SHEET_ID = '1Ohg32uNneSFBQajG0Eqqe-Bdvkwpkw-FkvWS9cH-a8o'
read_url = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq?tqx=out:csv&sheet=AI%EC%98%88%EC%B8%A1"

try:
    res = requests.get(read_url, headers=headers, timeout=10)
    print(f"  HTTP 상태: {res.status_code}")
    lines = res.text.strip().split('\n')
    print(f"  총 행 수: {len(lines)}")
    print(f"  헤더: {lines[0] if lines else 'N/A'}")
    # 마지막 5행 출력 (최신 데이터 확인)
    print(f"  --- 최근 5행 ---")
    for line in lines[-5:]:
        print(f"  {line}")
except Exception as e:
    print(f"  [ERROR] {e}")
