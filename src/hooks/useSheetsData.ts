import { useState, useEffect } from 'react';

const SHEET_ID = '1Ohg32uNneSFBQajG0Eqqe-Bdvkwpkw-FkvWS9cH-a8o';

// Fetch a sheet tab via JSONP and return raw table object
const fetchSheet = (sheetName: string): Promise<any> => {
  return new Promise((resolve) => {
    const cbName = 'cb_' + Math.random().toString(36).substring(2, 9);
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=responseHandler:${cbName}&sheet=${encodeURIComponent(sheetName)}&_=${Date.now()}`;
    
    (window as any)[cbName] = (response: any) => {
      delete (window as any)[cbName];
      resolve(response?.table || null);
    };

    const script = document.createElement('script');
    script.src = url;
    script.onerror = () => { resolve(null); script.remove(); };
    script.onload = () => script.remove();
    setTimeout(() => { resolve(null); }, 10000); // 10s timeout
    document.head.appendChild(script);
  });
};

// Parse table into array of row objects using column labels
const parseRows = (table: any): any[] => {
  if (!table?.rows?.length || !table?.cols) return [];
  const cols = table.cols.map((c: any) => (c.label || '').trim());
  
  return table.rows.map((row: any) => {
    const obj: any = {};
    if (!row?.c) return obj;
    row.c.forEach((cell: any, i: number) => {
      if (!cols[i]) return;
      let val = cell?.v ?? null;
      // Google Sheets sometimes returns dates as Date objects or "Date(y,m,d)" strings
      if (val instanceof Date) {
        val = `${val.getFullYear()}-${String(val.getMonth()+1).padStart(2,'0')}-${String(val.getDate()).padStart(2,'0')}`;
      } else if (typeof val === 'string' && val.match(/^Date\(/)) {
        const parts = val.match(/\d+/g);
        if (parts) val = `${parts[0]}-${String(Number(parts[1])+1).padStart(2,'0')}-${String(parts[2]).padStart(2,'0')}`;
      }
      obj[cols[i]] = val;
    });
    return obj;
  }).filter((r: any) => Object.values(r).some(v => v !== null && v !== ''));
};

// Parse table using column POSITION (0-based) instead of label name
// This handles cases where column labels are empty or wrong
const parseByPosition = (table: any): any[][] => {
  if (!table?.rows?.length) return [];
  return table.rows.map((row: any) =>
    (row?.c || []).map((cell: any) => {
      let val = cell?.v ?? null;
      if (val instanceof Date) {
        val = `${val.getFullYear()}-${String(val.getMonth()+1).padStart(2,'0')}-${String(val.getDate()).padStart(2,'0')}`;
      } else if (typeof val === 'string' && val.match(/^Date\(/)) {
        const parts = val.match(/\d+/g);
        if (parts) val = `${parts[0]}-${String(Number(parts[1])+1).padStart(2,'0')}-${String(parts[2]).padStart(2,'0')}`;
      }
      return val;
    })
  );
};

// Fuzzy name match for price lookup (handles typos like SK하아닉스 vs SK하이닉스)
const fuzzyMatch = (a: string, b: string): boolean => {
  const clean = (s: string) => s.toLowerCase().replace(/\s/g, '');
  const ca = clean(String(a));
  const cb = clean(String(b));
  if (ca === cb) return true;
  // Allow 1 character difference (simple edit distance)
  if (Math.abs(ca.length - cb.length) > 2) return false;
  let diffs = 0;
  const shorter = ca.length <= cb.length ? ca : cb;
  const longer = ca.length <= cb.length ? cb : ca;
  for (let i = 0; i < shorter.length; i++) {
    if (shorter[i] !== longer[i]) diffs++;
  }
  return (diffs + (longer.length - shorter.length)) <= 2;
};

export function useSheetsData() {
  const [data, setData] = useState<any>({
    portfolio: [],
    marketIndices: {},
    predictions: [],
    latestAnalysisTime: '로딩 중...',
    loading: true,
    error: null
  });

  useEffect(() => {
    async function loadAll() {
      try {
        const [pTable, prTable, aTable] = await Promise.all([
          fetchSheet('포트폴리오'),
          fetchSheet('시세'),
          fetchSheet('AI예측')
        ]);

        // ── 시세 탭 처리 ──────────────────────────────────
        // 실제 구조: 1행=헤더(종목명|현재가|변동률), 2행~=데이터
        const prRows = parseRows(prTable);
        const priceMap: Record<string, number> = {};
        prRows.forEach((r: any) => {
          const name = r['종목명'] ?? r['종목'] ?? null;
          const rawPrice = r['현재가'] ?? r['Price'] ?? null;
          if (name && rawPrice !== null) {
            priceMap[String(name).trim()] = typeof rawPrice === 'number'
              ? rawPrice
              : Number(String(rawPrice).replace(/,/g, '')) || 0;
          }
        });

        // 종목 현재가 조회 (오타 허용)
        const getPrice = (stockName: string): number => {
          const exact = priceMap[stockName];
          if (exact !== undefined) return exact;
          const key = Object.keys(priceMap).find(k => fuzzyMatch(k, stockName));
          return key ? priceMap[key] : 0;
        };

        // 시장 지수: 시세 탭에 없으면 0 (파이썬이 나중에 채워줌)
        const indexNames: Record<string, string[]> = {
          'KOSPI':    ['KOSPI', '코스피', 'KOSPI 지수'],
          'KOSDAQ':   ['KOSDAQ', '코스닥', 'KOSDAQ 지수'],
          'S&P 500':  ['S&P 500', 'S&P500', 'SNP500'],
          'NASDAQ':   ['NASDAQ', '나스닥'],
          'USD/KRW':  ['USD/KRW', '원달러', '환율', 'USDKRW'],
        };
        const marketIndices: Record<string, number> = {};
        Object.entries(indexNames).forEach(([label, aliases]) => {
          const key = Object.keys(priceMap).find(k =>
            aliases.some(a => fuzzyMatch(k, a))
          );
          marketIndices[label] = key ? priceMap[key] : 0;
        });

        // ── 포트폴리오 탭 처리 ────────────────────────────
        // 실제 구조: 1행=헤더(종목명|섹터|수량|평단가|목표가|손절가)
        const pRows = parseRows(pTable);
        const portfolio = pRows
          .map((r: any) => {
            const name = String(r['종목명'] ?? r['종목'] ?? '').trim();
            if (!name) return null;
            const qty = Number(String(r['수량'] ?? '0').replace(/,/g, '')) || 0;
            const avg = Number(String(r['평단가'] ?? '0').replace(/,/g, '')) || 0;
            if (qty === 0) return null;
            return {
              name,
              sector: String(r['섹터'] ?? r['분류'] ?? '기타'),
              qty,
              avg,
              cur: getPrice(name),
              target: Number(String(r['목표가'] ?? '0').replace(/,/g, '')) || 0,
            };
          })
          .filter(Boolean);

        // ── AI예측 탭 처리 ────────────────────────────────
        // 실제 구조(컬럼 위치 기준):
        //   0=날짜, 1=섹터, 2=점수, 3=신호, 4=ai_analysis
        // 주의: 컬럼 레이블로 읽으면 데이터가 밀려 있으므로 위치 기반으로 파싱
        const aRaw = parseByPosition(aTable);
        
        // 첫 행이 헤더인지 확인 (첫 셀이 "날짜" 또는 숫자가 아닌 문자열이면 헤더)
        let aDataRows = aRaw;
        if (aRaw.length > 0 && typeof aRaw[0][0] === 'string' && !aRaw[0][0].match(/^\d/)) {
          aDataRows = aRaw.slice(1); // 헤더 행 건너뜀
        }

        // 섹터별 최신 데이터만 추출 (같은 섹터면 가장 최근 것)
        const sectorMap: Record<string, any> = {};
        aDataRows.forEach((row: any[]) => {
          const sector = String(row[1] ?? '').trim();
          if (!sector) return;
          const score = Number(row[2]) || 75;
          const signal = String(row[3] ?? '관망').trim();
          const analysis = String(row[4] ?? '').trim();
          const date = String(row[0] ?? '').trim();
          // 나중에 나오는 행이 최신이므로 덮어쓰기
          sectorMap[sector] = {
            '섹터': sector,
            '점수': score,
            '신호': signal,
            'ai_analysis': analysis || `${sector} 섹터 분석 완료`,
            '날짜': date,
          };
        });

        const predictions = Object.values(sectorMap);

        // 가장 최근 분석 시각
        const latestAnalysisTime = aDataRows.length > 0
          ? String(aDataRows[aDataRows.length - 1][0] ?? '데이터 없음')
          : '데이터 없음';

        setData({
          portfolio,
          marketIndices,
          predictions,
          latestAnalysisTime,
          loading: false,
          error: null,
        });
      } catch (err) {
        console.error('[useSheetsData] Error:', err);
        setData((prev: any) => ({ ...prev, loading: false, error: String(err) }));
      }
    }

    loadAll();
    const interval = setInterval(loadAll, 60000);
    return () => clearInterval(interval);
  }, []);

  return data;
}
