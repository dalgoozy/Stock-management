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
    const rowKeys = Object.keys(row);
    for (let k of keys) {
      const found = rowKeys.find(rk => rk.toLowerCase().replace(/\s/g,'') === k.toLowerCase().replace(/\s/g,''));
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

        const priceMap: any = {};
        prRows.forEach((r: any) => {
          const name = getVal(r, ['종목명', '종목']);
          const price = getVal(r, ['현재가', 'Price']);
          if (name && price) priceMap[name] = Number(price);
        });

        const portfolio = pRows
          .map((r: any) => {
            const name = getVal(r, ['종목명', '종목', 'Name']);
            if (!name) return null;
            return {
              name,
              sector: getVal(r, ['섹터', 'Sector', '분류']),
              qty: Number(getVal(r, ['수량', 'Quantity', 'Amount'])) || 0,
              avg: Number(getVal(r, ['평단가', 'AvgPrice', 'Average'])) || 0,
              cur: priceMap[name] || 0,
              target: Number(getVal(r, ['목표가', 'Target'])) || 0
            };
          })
          .filter((h: any) => h !== null && h.qty > 0);

        const marketIndices: any = {};
        const findPrice = (name: string) => {
            const key = Object.keys(priceMap).find(k => k.toUpperCase().replace(/\s/g,'') === name.toUpperCase().replace(/\s/g,''));
            return key ? priceMap[key] : 0;
        };
        
        ['KOSPI', 'KOSDAQ', 'S&P500', 'NASDAQ', 'USD/KRW'].forEach(name => {
            marketIndices[name] = findPrice(name);
        });

        // Extract latest analysis time
        let latestAnalysisTime = '';
        if (aRows.length > 0) {
            const times = aRows.map((r: any) => getVal(r, ['ai_analysis 날짜', '날짜'])).filter(Boolean);
            if (times.length > 0) {
                latestAnalysisTime = String(times.sort().reverse()[0]);
            }
        }

        setData({
          portfolio,
          marketIndices,
          predictions: aRows,
          latestAnalysisTime,
          loading: false,
          error: null
        });
      } catch (err) {
        setData((prev: any) => ({ ...prev, loading: false, error: err }));
      }
    }
    loadAll();
    const interval = setInterval(loadAll, 60000); // 1 minute sync
    return () => clearInterval(interval);
  }, []);

  return data;
}
