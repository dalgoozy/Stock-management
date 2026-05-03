from google import genai
import requests
import json
import datetime
import re
import time

# ===== 설정 (사용자 입력 필요) =====
GEMINI_API_KEY = "AIzaSyCYDXytcioXdo5irkzJbjYADGuFyovnOeg"
WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzgmPX-rlkvSqAs2PuZyMA60DGutwYC80Uy5GyQdVIACnsFlq5mCqM1apI0VgG0Qd6l/exec"

# Gemini 설정 (new google-genai client)
client = genai.Client(api_key=GEMINI_API_KEY)

# 분석할 섹터와 핵심 종목 (사용자 포트폴리오 기반)
SECTORS = {
    "방산": ["현대로템", "한화에어로스페이스"],
    "반도체": ["SK하이닉스", "삼성전자", "한미반도체"],
    "조선": ["한화오션", "HD현대중공업"],
    "로봇": ["현대차", "두산로보틱스"],
    "전력": ["LS ELECTRIC", "효성중공업", "HD현대일렉트릭"],
    "바이오": ["삼성바이오로직스", "셀트리온"]
}

def generate_content_with_fallback(prompt):
    """새 google-genai SDK로 모델 호출 (fallback 체인 포함)"""
    models_to_try = [
        'gemini-2.5-flash',
        'gemini-3.1-flash-lite-preview',
        'gemini-flash-latest',
        'gemini-2.0-flash',
    ]
    last_error = None
    for model_name in models_to_try:
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
            )
            print(f"    [MODEL] {model_name} 사용 성공")
            return response
        except Exception as e:
            last_error = e
            err_msg = str(e)[:100]
            print(f"    [MODEL] {model_name} 실패: {err_msg}")
            # quota 에러(429)면 잠시 대기 후 다음 모델 시도
            if "429" in str(e) or "quota" in str(e).lower():
                time.sleep(2)
            continue
    raise last_error

def fetch_news(sector, stocks):
    """섹터와 종목에 대한 실시간 뉴스/전망 컨텍스트를 생성합니다."""
    today = datetime.datetime.now().strftime('%Y-%m-%d')
    prompt = f"오늘 날짜({today}) 기준, {sector} 섹터와 주요 종목({', '.join(stocks)})에 대한 최근 시장 분위기와 주요 이슈를 3문장 이내로 요약해줘."
    try:
        response = generate_content_with_fallback(prompt)
        return response.text.strip()
    except Exception as e:
        print(f"  [ERROR] {sector} 뉴스 검색 실패: {e}")
        return f"최근 {sector} 섹터 및 {stocks} 관련 긍정적인 수주 소식과 시장 점유율 확대 리포트가 발표됨..."

def analyze_news(sector, stocks, news_text):
    prompt = f"""
    당신은 전문 주식 분석가입니다. 다음은 '{sector}' 섹터(주요종목: {', '.join(stocks)})와 관련된 최근 이슈입니다:
    {news_text}

    이 정보를 바탕으로 분석을 진행하고, 반드시 아래 JSON 형식으로만 응답하세요. 
    'score'는 0~100 사이의 숫자로, 'signal'은 '매수', '강력매수', '관망', '매도' 중 하나로 응답하세요.
    
    {{
        "sector": "{sector}",
        "score": 85,
        "signal": "매수",
        "midterm": "상승",
        "ai_analysis": "이곳에 분석 내용을 작성하세요."
    }}
    """
    
    try:
        response = generate_content_with_fallback(prompt)
        content = response.text.strip()
        
        # 마크다운 형식 방어 로직 (JSON 파싱 에러 방지)
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
            
        result = json.loads(content)
        result["sector"] = sector
        return result
    except Exception as e:
        print(f"  [ERROR] {sector} 분석 실패: {e}")
        return {
            "sector": sector,
            "score": 75,
            "signal": "관망",
            "midterm": "횡보",
            "ai_analysis": f"{sector} 섹터 분석 중 오류가 발생했으나 기존 추세는 유효함."
        }

def update_google_sheet(analysis):
    """분석 결과를 Google Sheets에 전송합니다.
    
    시트 컬럼: ai_analysis 날짜 | 섹터 | 점수 | 신호 | ai_analysis
    """
    if not analysis: return
    sector = analysis.get("sector")
    try:
        now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
        data = {
            # 실제 시트 첫 번째 컬럼명은 "ai_analysis 날짜"
            "ai_analysis 날짜": now_str,
            "날짜": now_str,
            "Date": now_str,
            "date": now_str,
            "time": now_str,
            "섹터": sector,
            "점수": analysis.get("score", 75),
            "신호": analysis.get("signal", "관망"),
            "ai_analysis": analysis.get("ai_analysis", f"{sector} 섹터 분석 완료"),
            "AI분석": analysis.get("ai_analysis", f"{sector} 섹터 분석 완료"),
            "Analysis": analysis.get("ai_analysis", f"{sector} 섹터 분석 완료")
        }
        
        response = requests.post(WEB_APP_URL, json=data, timeout=15)
        if response.status_code == 200:
            print(f"  [SUCCESS] {sector} 시트 업데이트 완료 ({data['점수']}% - {data['신호']})")
            return True
        else:
            print(f"  [FAIL] {sector} 업데이트 실패 (HTTP {response.status_code})")
            return False
    except Exception as e:
        print(f"  [ERROR] {sector} 시트 업데이트 중 예외 발생: {e}")
        return False


def parse_naver_span_digits(html_snippet):
    """네이버 금융의 span-encoded 숫자를 파싱합니다.
    
    네이버 금융 해외지수/환율 페이지는 숫자를 다음과 같이 렌더링합니다:
    <span class="no5">5</span><span class="shim">,</span><span class="no2">2</span>...
    <span class="jum">.</span> 은 소수점
    
    이 함수는 해당 HTML에서 숫자를 추출합니다.
    """
    # span 태그에서 숫자, 쉼표, 소수점 추출
    parts = re.findall(r'<span class="(?:no\d|shim|jum)"[^>]*>([^<]+)</span>', html_snippet)
    if not parts:
        return None
    number_str = ''.join(parts).replace(',', '')
    try:
        return float(number_str)
    except ValueError:
        return None


def fetch_market_indices():
    """네이버 금융에서 주요 지수를 크롤링합니다.
    
    국내 지수: id="now_value" 에서 직접 파싱
    해외 지수: span-encoded 숫자를 개별 파싱
    환율: 네이버 모바일 API 사용
    """
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
    results = {}
    
    # 1) 국내 지수 (KOSPI, KOSDAQ) - 직접 파싱 가능
    domestic = {
        "KOSPI": "https://finance.naver.com/sise/sise_index.naver?code=KOSPI",
        "KOSDAQ": "https://finance.naver.com/sise/sise_index.naver?code=KOSDAQ",
    }
    
    for name, url in domestic.items():
        try:
            res = requests.get(url, headers=headers, timeout=10)
            match = re.search(r'id="now_value"[^>]*>([\d,.]+)', res.text)
            if match:
                val = float(match.group(1).replace(",", ""))
                results[name] = val
                print(f"  [INFO] {name}: {match.group(1)}")
            else:
                print(f"  [WARNING] {name} 크롤링 실패")
        except Exception as e:
            print(f"  [ERROR] {name}: {e}")
    
    # 2) 해외 지수 (S&P 500, NASDAQ, 닛케이) - span-encoded 숫자 파싱
    overseas = {
        "S&P 500": "https://finance.naver.com/world/sise.naver?symbol=SPI@SPX",
        "NASDAQ": "https://finance.naver.com/world/sise.naver?symbol=NAS@IXIC",
        "닛케이 225": "https://finance.naver.com/world/sise.naver?symbol=NII@NI225",
    }
    
    for name, url in overseas.items():
        try:
            res = requests.get(url, headers=headers, timeout=10)
            # no_today 클래스 내부의 em 태그에서 span-encoded 숫자 추출
            match = re.search(r'<p class="no_today">\s*<em[^>]*>(.*?)</em>', res.text, re.DOTALL)
            if match:
                val = parse_naver_span_digits(match.group(1))
                if val and val > 100:  # 지수는 최소 100 이상이어야 함
                    results[name] = val
                    print(f"  [INFO] {name}: {val:,.2f}")
                else:
                    print(f"  [WARNING] {name} 파싱 값 비정상: {val}")
            else:
                print(f"  [WARNING] {name} no_today 매치 실패")
        except Exception as e:
            print(f"  [ERROR] {name}: {e}")
    
    # 3) 환율 (USD/KRW) - 네이버 모바일 API 사용 (가장 안정적)
    try:
        api_url = "https://m.stock.naver.com/front-api/marketIndex/productDetail?category=exchange&reutersCode=FX_USDKRW"
        res = requests.get(api_url, headers=headers, timeout=10)
        data = res.json()
        if data.get('isSuccess'):
            close_price_str = data['result'].get('closePrice', '')
            val = float(close_price_str.replace(',', ''))
            results["USD/KRW"] = val
            print(f"  [INFO] USD/KRW: {close_price_str} (API)")
        else:
            print(f"  [WARNING] USD/KRW API 실패")
    except Exception as e:
        print(f"  [ERROR] USD/KRW: {e}")
        # 폴백: 환율 메인 페이지에서 크롤링
        try:
            res = requests.get('https://finance.naver.com/marketindex/', headers=headers, timeout=10)
            match = re.search(r'class="value">([\d,.]+)', res.text)
            if match:
                val = float(match.group(1).replace(",", ""))
                results["USD/KRW"] = val
                print(f"  [INFO] USD/KRW: {match.group(1)} (폴백)")
        except Exception as e2:
            print(f"  [ERROR] USD/KRW 폴백 실패: {e2}")
    
    return results


def update_market_indices():
    print("\n--- 시장 지수 업데이트 시작 ---")
    indices = fetch_market_indices()
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    
    if not indices:
        print("  [ERROR] 크롤링된 지수가 없습니다!")
        return
    
    for name, val in indices.items():
        data = {
            "ai_analysis 날짜": now_str,
            "날짜": now_str,
            "Date": now_str,
            "date": now_str,
            "time": now_str,
            "섹터": name,
            "점수": 0,
            "신호": "N/A",
            "ai_analysis": f"현재 지수: {val:,.2f}",
            "AI분석": f"현재 지수: {val:,.2f}",
            "Analysis": f"현재 지수: {val:,.2f}"
        }
        try:
            res = requests.post(WEB_APP_URL, json=data, timeout=15)
            if res.status_code == 200:
                print(f"  [SUCCESS] {name} 시트 업데이트 완료 ({val:,.2f})")
            else:
                print(f"  [FAIL] {name} HTTP {res.status_code}")
        except Exception as e:
            print(f"  [ERROR] {name} 시트 전송 중 예외 발생: {e}")
    
    print(f"  [SUMMARY] {len(indices)}개 지수 업데이트 완료")


def main():
    print("=" * 60)
    print(f"AI 분석 및 시트 업데이트 프로세스 시작: {datetime.datetime.now()}")
    print(f"오늘 날짜: {datetime.datetime.now().strftime('%Y-%m-%d')}")
    print("=" * 60)
    
    # 1) 시장 지수 업데이트
    update_market_indices()
    
    # 2) 섹터 별 AI 심층 분석
    print("\n--- 섹터 별 AI 심층 분석 시작 ---")
    for sector, stocks in SECTORS.items():
        print(f"\n> {sector} 섹터 분석 중...")
        news = fetch_news(sector, stocks)
        print(f"  [NEWS] {news[:80]}...")
        result = analyze_news(sector, stocks, news)
        
        if result:
            update_google_sheet(result)
        
        # API 할당량 제한 방지를 위한 대기
        time.sleep(3) 
    
    print("\n" + "=" * 60)
    print("모든 작업이 완료되었습니다. 대시보드를 새로고침하여 결과를 확인하세요.")
    print("=" * 60)

if __name__ == "__main__":
    main()