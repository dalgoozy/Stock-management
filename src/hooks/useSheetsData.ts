import { useState, useEffect } from 'react';

const SHEET_ID = '1Ohg32uNneSFBQajG0Eqqe-Bdvkwpkw-FkvWS9cH-a8o';

// 시장 지수로 인식할 키워드 목록 (섹터와 구분)
const MARKET_INDEX_KEYS = ['KOSPI', 'KOSDAQ', 'S&P 500', 'S&P500', 'NASDAQ', 'USD/KRW', '닛케이 225', 'NIKKEI'];

const isMarketIndex = (name: string): boolean =>
  MARKET_INDEX_KEYS.some(k => String(name).toUpperCase().replace(/\s/g, '') === k.toUpperCase().replace(/\s/g, ''));

// JSONP 방식으로 시트 탭 데이터 요청
const fetchSheet = (sheetName: string): Promise<any> => {
  return new Promise((resolve) => {
    const cbName = 'cb_' + Math.random().toString(36).substring(2, 9);
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=responseHandler:${cbName}&sheet=${encodeURIComponent(sheetName)}&_=${Date.now()}`;

    (window as any)[cbName] = (response: any) => {
      delete (window as any)[cbName];
      script.remove();
      resolve(response?.table || null);
    };

    const script = document.createElement('script');
    script.src = url;
    script.onerror = () => { delete (window as any)[cbName]; script.remove(); resolve(null); };
    document.head.appendChild(script);
    setTimeout(() => { if ((window as any)[cbName]) { delete (window as any)[cbName]; resolve(null); } }, 12000);
  });
};

// 셀 값을 안전하게 추출 (Date 형식 처리 포함)
const extractCellValue = (cell: any): any => {
  if (!cell || cell.v === null || cell.v === undefined) return null;
  let val = cell.v;
  // Google Sheets Date 객체 처리
  if (val instanceof Date) {
    return `${val.getFullYear()}-${String(val.getMonth()+1).padStart(2,'0')}-${String(val.getDate()).padStart(2,'0')} ${String(val.getHours()).padStart(2,'0')}:${String(val.getMinutes()).padStart(2,'0')}`;
  }
  return val;
};

// 테이블을 컬럼 레이블 기반으로 파싱 (1행 = 헤더)
const parseRows = (table: any): any[] => {
  if (!table?.cols || !table?.rows?.length) return [];
  const cols = table.cols.map((c: any) => (c.label || '').trim());
  const hasLabels = cols.filter(Boolean).length > 0;
  if (!hasLabels) return [];

  return table.rows
    .map((row: any) => {
      if (!row?.c) return null;
      const obj: any = {};
      row.c.forEach((cell: any, i: number) => {
        if (!cols[i]) return;
        obj[cols[i]] = extractCellValue(cell);
      });
      return obj;
    })
    .filter((r: any) => r && Object.values(r).some(v => v !== null && v !== ''));
};

// "현재 지수: 6,598.87" 형태에서 숫자 추출
const parseIndexValue = (text: string): number => {
  if (!text) return 0;
  const match = String(text).match(/[\d,]+\.?\d*/);
  if (!match) return 0;
  return Number(match[0].replace(/,/g, '')) || 0;
};

export function useSheetsData() {
  const [data, setData] = useState<any>({
    portfolio: [],
    marketIndices: {},
    predictions: [],
    latestAnalysisTime: '로딩 중...',
    loading: true,
    error: null,
  });

  useEffect(() => {
    async function loadAll() {
      try {
        const [pTable, prTable, aTable] = await Promise.all([
          fetchSheet('포트폴리오'),
          fetchSheet('시세'),
          fetchSheet('AI예측'),
        ]);

        // ── 시세 탭: 종목별 현재가 맵 ─────────────────────
        const prRows = parseRows(prTable);
        const priceMap: Record<string, number> = {};
        prRows.forEach((r: any) => {
          const name = String(r['종목명'] ?? r['종목'] ?? '').trim();
          const rawPrice = r['현재가'] ?? r['Price'] ?? null;
          if (name && rawPrice !== null) {
            priceMap[name] = typeof rawPrice === 'number'
              ? rawPrice
              : Number(String(rawPrice).replace(/,/g, '')) || 0;
          }
        });

        // ── AI예측 탭: 섹터 예측 + 시장 지수 ──────────────
        const aRows = parseRows(aTable);
        const marketIndices: Record<string, number> = {
          'KOSPI': 0, 'KOSDAQ': 0, 'S&P 500': 0, 'NASDAQ': 0, 'USD/KRW': 0,
        };
        const sectorMap: Record<string, any> = {};

        aRows.forEach((r: any) => {
          const sector = String(r['섹터'] ?? '').trim();
          if (!sector) return;

          if (isMarketIndex(sector)) {
            // 시장 지수 행: ai_analysis 컬럼에 "현재 지수: X,XXX.XX" 형태
            const val = parseIndexValue(String(r['ai_analysis'] ?? ''));
            if (val > 0) {
              const normKey = sector.toUpperCase().replace(/\s/g, '');
              if (normKey === 'KOSPI')         marketIndices['KOSPI'] = val;
              else if (normKey === 'KOSDAQ')   marketIndices['KOSDAQ'] = val;
              else if (normKey.includes('SP') || normKey.includes('SNP')) marketIndices['S&P 500'] = val;
              else if (normKey === 'NASDAQ')   marketIndices['NASDAQ'] = val;
              else if (normKey.includes('USD') || normKey.includes('KRW')) marketIndices['USD/KRW'] = val;
              else if (normKey.includes('NIKK') || normKey.includes('닛케')) marketIndices['닛케이 225'] = val;
            }
          } else {
            // 섹터 예측 행 (같은 섹터면 최신 것으로 덮어씀)
            const score = Number(r['점수']) || 75;
            const signal = String(r['신호'] ?? '관망').trim();
            const analysis = String(r['ai_analysis'] ?? '').trim();
            const date = String(r['날짜'] ?? '').trim();
            sectorMap[sector] = {
              '섹터': sector,
              '점수': score,
              '신호': signal,
              'ai_analysis': analysis || `${sector} 섹터 분석 데이터`,
              '날짜': date,
            };
          }
        });

        const predictions = Object.values(sectorMap);

        // 최근 분석 시각
        const sectorDates = predictions.map((p: any) => p['날짜']).filter(Boolean);
        const latestAnalysisTime = sectorDates.length > 0
          ? sectorDates.sort().reverse()[0]
          : '데이터 없음';

        // ── 포트폴리오 탭 ──────────────────────────────────
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
              cur: priceMap[name] || 0,
              target: Number(String(r['목표가'] ?? '0').replace(/,/g, '')) || 0,
            };
          })
          .filter(Boolean);

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
