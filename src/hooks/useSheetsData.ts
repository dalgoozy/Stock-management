import { useState, useEffect } from 'react';

const SHEETS_CONFIG = {
  SHEET_ID: '1Ohg32uNneSFBQajG0Eqqe-Bdvkwpkw-FkvWS9cH-a8o',
};

export function useSheetsData() {
  const [data, setData] = useState<any>({
    portfolio: [],
    marketIndices: {},
    news: [],
    predictions: [],
    loading: true,
    error: null
  });

  const fetchSheet = async (sheetName: string) => {
    return new Promise((resolve) => {
      const requestId = 'req_' + Math.random().toString(36).substring(2, 11);
      (window as any).google = (window as any).google || {};
      (window as any).google.visualization = (window as any).google.visualization || {};
      (window as any).google.visualization.Query = (window as any).google.visualization.Query || {};
      
      const originalHandler = (window as any).google.visualization.Query.setResponse;
      (window as any).google.visualization.Query.setResponse = (response: any) => {
        resolve(response.table);
        (window as any).google.visualization.Query.setResponse = originalHandler;
      };

      const url = `https://docs.google.com/spreadsheets/d/${SHEETS_CONFIG.SHEET_ID}/gviz/tq?tqx=responseHandler:google.visualization.Query.setResponse&sheet=${encodeURIComponent(sheetName)}&_=${Date.now()}`;
      const script = document.createElement('script');
      script.src = url;
      script.id = requestId;
      script.onerror = () => {
        resolve(null);
        script.remove();
      };
      script.onload = () => script.remove();
      document.head.appendChild(script);
    });
  };

  const parseRows = (table: any) => {
    if (!table || !table.rows) return [];
    const cols = table.cols.map((c: any) => (c.label || '').trim());
    return table.rows.map((row: any) => {
      const obj: any = {};
      row.c.forEach((cell: any, i: number) => {
        if (!cols[i] || !cell) { if (cols[i]) obj[cols[i]] = null; return; }
        let val = cell.v;
        if (val instanceof Date) {
          val = `${val.getFullYear()}-${String(val.getMonth()+1).padStart(2,'0')}-${String(val.getDate()).padStart(2,'0')} ${String(val.getHours()).padStart(2,'0')}:${String(val.getMinutes()).padStart(2,'0')}`;
        }
        obj[cols[i]] = val;
      });
      return obj;
    }).filter((row: any) => Object.values(row).some(v => v !== null));
  };

  const getVal = (row: any, keys: string[]) => {
    if (!row) return null;
    const rowKeys = Object.keys(row);
    
    // 1st pass: exact or case-insensitive match (ignoring spaces)
    for (let k of keys) {
      const target = k.toLowerCase().replace(/[\s_]/g, '');
      const found = rowKeys.find(rk => rk.toLowerCase().replace(/[\s_]/g, '') === target);
      if (found) return row[found];
    }
    
    // 2nd pass: fuzzy match (contains)
    for (let k of keys) {
      const target = k.toLowerCase().replace(/[\s_]/g, '');
      const found = rowKeys.find(rk => rk.toLowerCase().replace(/[\s_]/g, '').includes(target));
      if (found) return row[found];
    }
    
    return null;
  };

  useEffect(() => {
    async function loadAll() {
      try {
        const [pTable, prTable, aTable] = await Promise.all([
          fetchSheet('포트폴리오'),
          fetchSheet('시세'),
          fetchSheet('AI예측')
        ]);

        const pRows = parseRows(pTable);
        const prRows = parseRows(prTable);
        const aRows = parseRows(aTable);

        // Price Map
        const priceMap: any = {};
        prRows.forEach((r: any) => {
          const name = getVal(r, ['종목명', '종목', '항목', 'Name']);
          const price = getVal(r, ['현재가', 'Price', 'Value', '시세']);
          if (name) {
            const cleanName = String(name).trim();
            priceMap[cleanName] = typeof price === 'number' ? price : Number(String(price || '0').replace(/,/g, ''));
          }
        });

        // Market Indices
        const marketIndices: any = {};
        const findPrice = (names: string[]) => {
            for (const name of names) {
                const target = name.toUpperCase().replace(/\s/g,'');
                const key = Object.keys(priceMap).find(k => k.toUpperCase().replace(/\s/g,'') === target);
                if (key) return priceMap[key];
            }
            return 0;
        };
        
        marketIndices['KOSPI'] = findPrice(['KOSPI', '코스피']);
        marketIndices['KOSDAQ'] = findPrice(['KOSDAQ', '코스닥']);
        marketIndices['S&P 500'] = findPrice(['S&P 500', 'S&P500', 'SNP500']);
        marketIndices['NASDAQ'] = findPrice(['NASDAQ', '나스닥']);
        marketIndices['USD/KRW'] = findPrice(['USD/KRW', '원달러', '환율']);
        marketIndices['닛케이 225'] = findPrice(['닛케이 225', 'NIKKEI', '닛케이']);

        // Portfolio
        const portfolio = pRows
          .map((r: any) => {
            const name = getVal(r, ['종목명', '종목', 'Name']);
            if (!name) return null;
            
            const qty = Number(String(getVal(r, ['수량', 'Quantity', 'Amount']) || '0').replace(/,/g, '')) || 0;
            const avg = Number(String(getVal(r, ['평단가', 'AvgPrice', 'Average']) || '0').replace(/,/g, '')) || 0;
            const cur = priceMap[name] || 0;
            
            return {
              name: String(name),
              sector: String(getVal(r, ['섹터', 'Sector', '분류', '분야']) || '기타'),
              qty,
              avg,
              cur,
              target: Number(String(getVal(r, ['목표가', 'Target']) || '0').replace(/,/g, '')) || 0
            };
          })
          .filter((h: any) => h !== null && h.qty > 0);

        // Analysis Summary
        let latestAnalysisTime = '데이터 없음';
        if (aRows.length > 0) {
            const times = aRows.map((r: any) => getVal(r, ['날짜', 'Date', 'Time', 'ai_analysis 날짜'])).filter(Boolean);
            if (times.length > 0) {
                latestAnalysisTime = String(times.sort().reverse()[0]);
            }
        }

        setData({
          portfolio,
          marketIndices,
          predictions: aRows.map(r => ({
            ...r,
            '섹터': getVal(r, ['섹터', 'Sector']),
            '점수': Number(getVal(r, ['점수', 'Score', 'Rating'])) || 75,
            '신호': getVal(r, ['신호', 'Signal', 'Action']) || '관망',
            'ai_analysis': getVal(r, ['ai_analysis', '분석', 'Analysis']) || '분석 데이터 로드 중...'
          })),
          latestAnalysisTime,
          loading: false,
          error: null
        });
      } catch (err) {
        console.error('Load Error:', err);
        setData((prev: any) => ({ ...prev, loading: false, error: err }));
      }
    }
    loadAll();
    const interval = setInterval(loadAll, 60000);
    return () => clearInterval(interval);
  }, []);

  return data;
}
