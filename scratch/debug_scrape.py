import requests
import re

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}

# Test USD/KRW
url_usd = "https://finance.naver.com/marketindex/exchangeDetail.naver?marketindexCd=FX_USDKRW"
res_usd = requests.get(url_usd, headers=headers)
print("--- USD/KRW HTML Snippet ---")
idx = res_usd.text.find('class="value"')
if idx >= 0:
    print(res_usd.text[idx:idx+200])
else:
    print("class='value' not found")
    # Search for any value
    match = re.search(r'(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*원', res_usd.text)
    if match:
        print(f"Found something with '원': {match.group(1)}")

# Test S&P 500
url_sp = "https://finance.naver.com/world/sise.naver?symbol=SPI@SPX"
res_sp = requests.get(url_sp, headers=headers)
print("\n--- S&P 500 HTML Snippet ---")
idx = res_sp.text.find('no_today')
if idx >= 0:
    print(res_sp.text[idx:idx+500])
else:
    print("no_today not found")
