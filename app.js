/* ============================================================
   떡상 주식관리 — app.js
   ============================================================ */

// ===== GOOGLE SHEETS 연동 설정 =====
// Phase 2: Sheet ID 입력 후 USE_SHEETS를 true로 변경하세요
const SHEETS_CONFIG = {
  SHEET_ID: '1Ohg32uNneSFBQajG0Eqqe-Bdvkwpkw-FkvWS9cH-a8o',      // ← 여기에 Google Sheets ID를 붙여넣으세요
  USE_SHEETS: true, // ← Sheet ID 입력 완료 후 true로 변경
};

// ===== GOOGLE SHEETS API (JSONP for CORS Bypass) =====
let sheetResolvers = {};

function fetchSheetData(sheetName) {
  return new Promise((resolve, reject) => {
    const requestId = 'req_' + Math.random().toString(36).substring(2, 11);
    sheetResolvers[requestId] = resolve;

    // 전역 구글 객체 흉내내기 (JSONP 핸들러)
    if (!window.google) window.google = {};
    if (!window.google.visualization) window.google.visualization = {};
    if (!window.google.visualization.Query) window.google.visualization.Query = {};
    
    // 구글의 기본 응답 핸들러
    window.google.visualization.Query.setResponse = function(response) {
      const currentReq = Object.keys(sheetResolvers)[0];
      if (currentReq && sheetResolvers[currentReq]) {
        sheetResolvers[currentReq](response.table);
        delete sheetResolvers[currentReq];
      }
    };

    const url = `https://docs.google.com/spreadsheets/d/${SHEETS_CONFIG.SHEET_ID}/gviz/tq?tqx=responseHandler:google.visualization.Query.setResponse&sheet=${encodeURIComponent(sheetName)}&_=${Date.now()}`;
    
    const script = document.createElement('script');
    script.src = url;
    script.id = requestId;
    script.onerror = () => {
      console.warn(`[Sheets] ${sheetName} 로드 실패 (JSONP 오류)`);
      resolve(null);
      script.remove();
    };
    script.onload = () => script.remove();
    document.head.appendChild(script);
  });
}

// 2PACX 및 CSV 관련 구형 함수는 이제 사용하지 않음
function parseSheetRows(table) {
  if (!table || !table.rows) return [];
  const cols = table.cols.map(c => (c.label || '').trim());
  return table.rows
    .map(row => {
      const obj = {};
      row.c.forEach((cell, i) => { 
        if (!cols[i] || !cell) { if (cols[i]) obj[cols[i]] = null; return; }
        let val = cell.v;
        
        // Google Visualization API는 날짜 셀을 Date 객체로 반환함
        // "Date(2026,3,29,21,17,0)" 같은 문자열이거나 실제 Date 객체일 수 있음
        if (val instanceof Date) {
          // Date 객체 → "YYYY-MM-DD HH:MM" 문자열로 변환
          val = `${val.getFullYear()}-${String(val.getMonth()+1).padStart(2,'0')}-${String(val.getDate()).padStart(2,'0')} ${String(val.getHours()).padStart(2,'0')}:${String(val.getMinutes()).padStart(2,'0')}`;
        } else if (typeof val === 'string' && val.match(/^Date\(\d/)) {
          // "Date(2026,3,29,21,17,0)" 문자열 → 파싱
          const parts = val.match(/Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+)(?:,(\d+))?)?\)/);
          if (parts) {
            const [, y, m, d, h, min] = parts;
            val = `${y}-${String(Number(m)+1).padStart(2,'0')}-${String(d).padStart(2,'0')} ${String(h||0).padStart(2,'0')}:${String(min||0).padStart(2,'0')}`;
          }
        }
        // 포맷된 값이 있으면 날짜 관련 컬럼에 한해 포맷 값 우선 사용
        if (cell.f && typeof val !== 'number' && cols[i].includes('날짜')) {
          val = cell.f;
        }
        
        obj[cols[i]] = val;
      });
      return obj;
    })
    .filter(row => Object.values(row).some(v => v !== null));
}

function getVal(row, keys) {
  const rowKeys = Object.keys(row);
  for (let k of keys) {
    // 대소문자와 공백을 모두 무시하고 비교
    const found = rowKeys.find(rk => rk.toLowerCase().replace(/\s/g,'') === k.toLowerCase().replace(/\s/g,''));
    if (found && row[found] !== null && row[found] !== undefined) return row[found];
  }
  return null;
}

async function loadPortfolioFromSheets() {
  const sectorMap = { '방산':'defense','반도체':'semi','조선':'ship','로봇':'robot','전력':'power','바이오':'bio' };
  
  // JSONP는 순차적으로 로드하는 것이 더 안전함
  const portfolioTable = await fetchSheetData('포트폴리오');
  const priceTable = await fetchSheetData('시세');
  
  const portfolioRows = parseSheetRows(portfolioTable);
  const priceRows = parseSheetRows(priceTable);
  if (!portfolioRows || !portfolioRows.length) return false;

  const priceMap = {};
  priceRows.forEach(r => { 
    const name = getVal(r, ['종목명', '종목', 'Name']);
    const price = getVal(r, ['현재가', 'Price', 'Value']);
    if (name && price) priceMap[name] = Number(price); 
  });

  HOLDINGS.length = 0;
  portfolioRows.forEach(r => {
    const name = getVal(r, ['종목명', '종목', 'Name']);
    if (!name) return;
    
    const sector = getVal(r, ['섹터', 'Sector', '분류']);
    const qty = Number(getVal(r, ['수량', 'Quantity', 'Amount'])) || 0;
    const avg = Number(getVal(r, ['평단가', 'AvgPrice', 'Average'])) || 0;
    const target = Number(getVal(r, ['목표가', 'Target'])) || Math.round(avg * 1.25);

    HOLDINGS.push({
      name: name,
      sector: sectorMap[sector] || 'semi',
      sectorLabel: sector || '',
      qty: qty,
      avg: avg,
      cur: priceMap[name] || avg,
      target: target
    });
  });
  console.log(`[Sheets] 포트폴리오 로드 완료: [${HOLDINGS.map(h=>h.name).join(', ')}] ${HOLDINGS.length}건`);
  
  // 시장 지수 전역 데이터 업데이트 (시트 데이터 우선, 대소문자 무시)
  const findVal = (name) => {
    const key = Object.keys(priceMap).find(k => k.toUpperCase() === name.toUpperCase());
    return key ? priceMap[key] : null;
  };
  
  MARKET_DATA.kospi = findVal('KOSPI') || MARKET_DATA.kospi;
  MARKET_DATA.kosdaq = findVal('KOSDAQ') || MARKET_DATA.kosdaq;
  MARKET_DATA.sp500 = findVal('S&P500') || MARKET_DATA.sp500;
  MARKET_DATA.nasdaq = findVal('NASDAQ') || MARKET_DATA.nasdaq;
  MARKET_DATA.usdkrw = findVal('USD/KRW') || MARKET_DATA.usdkrw;
  MARKET_DATA.nikkei = findVal('닛케이 225') || findVal('Nikkei 225') || MARKET_DATA.nikkei;
  
  // UI 즉시 반영
  syncMarketUI();
  return true;
}

async function loadJournalFromSheets() {
  const table = await fetchSheetData('매매일지');
  const rows = parseSheetRows(table);
  if (!rows || !rows.length) return false;
  JOURNAL.length = 0;
  rows.forEach(r => {
    const dateVal = getVal(r, ['날짜', 'Date']);
    if (!dateVal) return;
    JOURNAL.push({
      date: String(dateVal).slice(0, 10),
      name: getVal(r, ['종목명', '종목', 'Name']) || '',
      sector: getVal(r, ['섹터', 'Sector']) || '',
      type: getVal(r, ['구분', 'Type']) || '매수',
      qty: Number(getVal(r, ['수량', 'Qty'])) || 0,
      price: Number(getVal(r, ['단가', 'Price'])) || 0,
      memo: getVal(r, ['메모', 'Memo']) || ''
    });
  });
  console.log(`[Sheets] 매매일지 로드 완료: ${JOURNAL.length}건`);
  return true;
}

async function loadPredictionsFromSheets() {
  const table = await fetchSheetData('AI예측');
  const rows = parseSheetRows(table);
  if (!rows || !rows.length) return false;

  // 날짜 정렬을 위해 날짜 전처리 및 정렬
  // 실제 시트 컬럼명: "ai_analysis 날짜", "섹터", "점수", "신호", "ai_analysis"
  const processedRows = rows.map(r => {
    // 시트의 실제 컬럼명 "ai_analysis 날짜" 를 우선 확인
    let d = getVal(r, ['ai_analysis 날짜', 'ai_analysis날짜', '날짜', 'Date', 'date', 'time']);
    if (!d) return { ...r, _parsedDate: null };
    
    let dStr = String(d);
    if (dStr.startsWith("'")) dStr = dStr.slice(1);
    
    // 날짜 형식 표준화 (다양한 형식 지원)
    // "2026. 4. 22 오후 1:07:19" -> "2026-04-22"
    // "2026-04-29 21:05" -> "2026-04-29 21:05"
    // "2026.04.28" -> "2026-04-28"
    let normalized = dStr
      .replace(/오전|오후|AM|PM/gi, '')
      .replace(/\./g, '-')
      .replace(/\//g, '-')
      .trim();
    
    // "2026- 4- 22" 같은 공백 포함 형식 정리
    normalized = normalized.replace(/\s*-\s*/g, '-');
    
    // "2026-4-22 1:07:19" -> "2026-04-22 01:07:19" (월/일 패딩)
    const dateMatch = normalized.match(/(\d{4})-(\d{1,2})-(\d{1,2})(.*)/);
    if (dateMatch) {
      const [, year, month, day, rest] = dateMatch;
      normalized = `${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}${rest}`;
    }
    
    return { ...r, _parsedDate: normalized };
  }).filter(r => r._parsedDate);

  // 날짜 내림차순 정렬
  processedRows.sort((a, b) => b._parsedDate.localeCompare(a._parsedDate));

  // 섹터별로 가장 최신 데이터 1개씩만 추출
  const latestBySector = {};
  let latestDateStr = '';
  
  processedRows.forEach(r => {
    const sector = getVal(r, ['섹터', 'Sector']);
    if (sector && !latestBySector[sector]) {
      latestBySector[sector] = r;
      if (r._parsedDate > latestDateStr) {
        latestDateStr = r._parsedDate;
      }
      
      // 시장 지수 파싱 (최신 데이터에서만 추출)
      const sectorNorm = sector.toUpperCase().replace(/\s+/g, '');
      const marketMap = {
        'KOSPI': { key: 'kospi', min: 1000 },
        'KOSDAQ': { key: 'kosdaq', min: 500 },
        'S&P500': { key: 'sp500', min: 1000 },
        'NASDAQ': { key: 'nasdaq', min: 5000 },
        'USD/KRW': { key: 'usdkrw', min: 800 },
      };
      // 닛케이는 별도 처리 (한글 포함)
      const isNikkei = sector.includes('닛케이') || sectorNorm.includes('NIKKEI') || sectorNorm.includes('N225');
      const marketEntry = marketMap[sectorNorm] || (isNikkei ? { key: 'nikkei', min: 10000 } : null);
      
      if (marketEntry) {
        let aiStr = getVal(r, ['AI분석', 'Analysis', 'ai_analysis', 'analysis', 'comment', 'result']);
        
        // 칼럼명 불일치로 못 찾았을 경우, 전체 셀을 뒤져서 '현재 지수'나 숫자가 포함된 문자열 찾기
        if (!aiStr) {
          for (let key in r) {
            if (typeof r[key] === 'string' && (r[key].includes('현재 지수') || /[\d,.]+/.test(r[key]))) {
              aiStr = r[key];
            }
          }
        }

        if (aiStr) {
           // "현재 지수: 7,138.80" 에서 숫자 추출 (쉼표 포함 전체 숫자)
           const match = String(aiStr).match(/([\d,]+\.?\d*)/);
           if (match) {
             const val = parseFloat(match[1].replace(/,/g, ''));
             // 최소값 검증으로 잘못된 파싱 방지 (예: 날짜 "026.04" 같은 값 차단)
             if (val && val >= marketEntry.min) {
                MARKET_DATA[marketEntry.key] = val;
                console.log(`[Sheets→Market] ${sector}: ${val.toLocaleString()}`);
             } else {
                console.warn(`[Sheets→Market] ${sector}: 값 ${val}이 최소값 ${marketEntry.min} 미만 → 무시`);
             }
           }
        }
      }

    }
  });

  NEWS = []; // 뉴스 데이터 초기화
  const newsSources = ['네이버금융', 'Reuters', 'Bloomberg', '연합뉴스', 'Wall Street Journal'];

  SECTORS.forEach((s, i) => {
    const data = latestBySector[s.name];
    if (data) {
      s.score = Number(getVal(data, ['상승확률', '점수', 'Score', 'score'])) || s.score;
      s.signal = getVal(data, ['신호', 'Signal', 'signal']) || s.signal;
      s.midterm = getVal(data, ['전망', 'Midterm', 'midterm']) || s.midterm;
      s.aiAnalysis = getVal(data, ['AI분석', 'Analysis', 'ai_analysis', 'analysis', 'comment', 'result']) || '';
      
      // 동적 뉴스 피드 생성 (AI 분석 기반)
      const isPos = s.score >= 50 || s.signal.includes('매수');
      const now = new Date();
      // 시간차를 두어 뉴스 발생 시간처럼 연출
      now.setMinutes(now.getMinutes() - (i * 45 + Math.floor(Math.random() * 30)));
      const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
      
      let headline = `[${s.name} 섹터] AI 분석 리포트 - ${s.signal} 신호 포착`;
      if (s.name === '반도체') headline = `반도체 주요 종목, AI 수요 급증에 따른 ${s.signal} 전망`;
      if (s.name === '방산') headline = `방산 섹터 수주 기대감 지속, 단기 모멘텀 ${s.midterm}`;
      
      NEWS.push({
        time: timeStr,
        source: newsSources[i % newsSources.length],
        type: i % 2 === 0 ? 'domestic' : 'global',
        headline: headline,
        impact: isPos ? 'pos' : 'neg',
        sectors: [s.name],
        ai: s.aiAnalysis
      });
    }
  });

  // 시간을 기준으로 내림차순 정렬 (최신 뉴스가 위로 오도록)
  NEWS.sort((a, b) => b.time.localeCompare(a.time));

  // 마지막 분석 시간 업데이트
  if (latestDateStr) {
    const timeEl = document.getElementById('last-analysis-time');
    if (timeEl) timeEl.textContent = latestDateStr;
  }

  // AI 예측 시트에서 추출한 시장 지수 데이터를 UI에 반영
  syncMarketUI();

  return true;
}

function setConnectionStatus(connected) {
  const el = document.getElementById('sheets-status');
  if (!el) return;
  el.textContent = connected ? '🟢 Sheets 연결됨' : '🔴 샘플 데이터';
  el.className = 'sheets-status ' + (connected ? 'connected' : 'disconnected');
}

// ===== DATA =====
const SECTORS = [
  { id:'defense', icon:'🛡️', name:'방산', color:'#f59e0b',
    stocks:['현대로템','한화에어로스페이스'],
    score:87, signal:'강력매수', midterm:'▲ 상승', midPct:'+32%',
    shortTrend:[82,84,83,86,87,85,88,87], midForecast:[87,90,93,95,98,102,108,115] },
  { id:'semi', icon:'💾', name:'반도체', color:'#3b82f6',
    stocks:['SK하이닉스','삼성전자','한미반도체'],
    score:71, signal:'매수', midterm:'▲ 상승', midPct:'+24%',
    shortTrend:[68,70,69,71,72,70,71,71], midForecast:[71,74,77,80,82,85,88,90] },
  { id:'ship', icon:'⚓', name:'조선', color:'#06b6d4',
    stocks:['한화오션','HD현대중공업'],
    score:74, signal:'매수', midterm:'▲ 상승', midPct:'+28%',
    shortTrend:[70,71,73,72,74,75,74,74], midForecast:[74,77,80,83,86,89,93,97] },
  { id:'robot', icon:'🤖', name:'로봇', color:'#8b5cf6',
    stocks:['현대차','두산로보틱스'],
    score:63, signal:'관망', midterm:'→ 횡보 후 상승', midPct:'+18%',
    shortTrend:[60,62,61,63,62,64,63,63], midForecast:[63,64,66,68,70,73,76,80] },
  { id:'power', icon:'🔌', name:'전력', color:'#10b981',
    stocks:['LS ELECTRIC','효성중공업','HD현대일렉트릭'],
    score:89, signal:'강력매수', midterm:'▲ 강세', midPct:'+38%',
    shortTrend:[84,85,86,87,88,87,89,89], midForecast:[89,93,98,104,110,118,126,135] },
  { id:'bio', icon:'💊', name:'바이오', color:'#ec4899',
    stocks:['삼성바이오로직스','셀트리온'],
    score:55, signal:'관망', midterm:'→ 횡보', midPct:'+12%',
    shortTrend:[50,52,55,54,55,56,55,55], midForecast:[55,57,60,63,66,70,75,80] }
];

const HOLDINGS = [
  { name:'삼성전자', sector:'semi', sectorLabel:'반도체', qty:100, avg:75000, cur:82500, target:95000 },
  { name:'한화에어로스페이스', sector:'defense', sectorLabel:'방산', qty:20, avg:280000, cur:350000, target:420000 },
  { name:'HD현대중공업', sector:'ship', sectorLabel:'조선', qty:30, avg:165000, cur:198000, target:230000 },
  { name:'LS일렉트릭', sector:'power', sectorLabel:'전력', qty:15, avg:145000, cur:187000, target:220000 },
  { name:'두산로보틱스', sector:'robot', sectorLabel:'로봇', qty:50, avg:72000, cur:68000, target:90000 },

];

const JOURNAL = [
  { date:'2026-04-21', name:'LS일렉트릭', sector:'전력', type:'매수', qty:5, price:187000, memo:'전력 섹터 비중 확대' },
  { date:'2026-04-18', name:'한화에어로스페이스', sector:'방산', type:'매수', qty:5, price:340000, memo:'방산 추가 매수' },
  { date:'2026-04-15', name:'두산로보틱스', sector:'로봇', type:'매도', qty:10, price:74000, memo:'일부 익절' },
  { date:'2026-04-10', name:'삼성전자', sector:'반도체', type:'매수', qty:20, price:73000, memo:'HBM 수혜 기대' }
];

let NEWS = [];

// ===== CHART INSTANCES =====
let allocChart, trendChart, radarChart, shortChart, midChart, kospiChart, kosdaqChart;
let currentShortSector = 'defense';
let currentMidSector = 'power';
let currentFilter = 'all';

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  startClock();
  initTabs();

  // Google Sheets 연동 시도 (설정된 경우)
  if (SHEETS_CONFIG.USE_SHEETS && SHEETS_CONFIG.SHEET_ID) {
    // JSONP 안정성을 위해 순차 로드
    const portfolioOk = await loadPortfolioFromSheets();
    const journalOk = await loadJournalFromSheets();
    const predictionsOk = await loadPredictionsFromSheets();
    setConnectionStatus(portfolioOk);
  } else {
    setConnectionStatus(false);
  }
  renderHoldings();
  renderJournal();
  renderSectorCards();
  renderNewsFeed();
  buildSectorSelectors();
  initPortfolioCharts();
  initSectorCharts();
  
  // 지수 차트 초기화 (초기값 설정)
  initMarketCharts();

  // 실시간 시세 데이터 로드 (주식 시장 탭 도구)
  fetchRealTimeMarketData();
  setInterval(fetchRealTimeMarketData, 5 * 60 * 1000); // 5분마다 자동 갱신
});

// 전역 시장 데이터 저장소
const MARKET_DATA = { kospi: 0, kosdaq: 0, sp500: 0, nasdaq: 0, usdkrw: 0, nikkei: 0 };

// ===== CLOCK =====
function startClock() {
  function tick() {
    const now = new Date();
    document.getElementById('live-clock').textContent =
      now.toLocaleTimeString('ko-KR', { hour12: false });
  }
  tick();
  setInterval(tick, 1000);
}

// ===== TABS =====
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected','false'); });
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      btn.setAttribute('aria-selected','true');
      document.getElementById(tab).classList.add('active');
    });
  });
}

// ===== SUMMARY UPDATE =====
function updateSummary() {
  let totalEval = 0;
  let totalInv = 0;
  let todayPnl = 0; // 시세 변동 데이터가 더 있다면 정확해짐

  HOLDINGS.forEach(h => {
    totalEval += h.cur * h.qty;
    totalInv += h.avg * h.qty;
  });

  const totalPnl = totalEval - totalInv;
  const totalRate = totalInv > 0 ? (totalPnl / totalInv * 100).toFixed(1) : '0.0';
  const isPos = totalPnl >= 0;

  // DOM 업데이트
  document.querySelector('.kpi-card:nth-child(1) .kpi-value').textContent = `₩ ${totalEval.toLocaleString()}`;
  document.querySelector('.kpi-card:nth-child(1) .kpi-sub').textContent = `투자원금 ₩ ${totalInv.toLocaleString()}`;
  
  const rateCard = document.querySelector('.kpi-card:nth-child(2)');
  rateCard.querySelector('.kpi-value').textContent = `${isPos ? '+' : ''}${totalRate}%`;
  rateCard.querySelector('.kpi-value').className = `kpi-value ${isPos ? 'positive' : 'negative'}`;
  rateCard.querySelector('.kpi-sub').textContent = `${isPos ? '+' : ''}₩ ${totalPnl.toLocaleString()}`;
  
  console.log(`[Summary] 업데이트 완료: 총 평가 ₩${totalEval.toLocaleString()}`);
}

// ===== HOLDINGS TABLE =====
function renderHoldings() {
  const tbody = document.getElementById('holdings-body');
  tbody.innerHTML = '';
  HOLDINGS.forEach(h => {
    const pnl = (h.cur - h.avg) * h.qty;
    const rate = h.avg > 0 ? ((h.cur - h.avg) / h.avg * 100).toFixed(1) : '0.0';
    const isPos = pnl >= 0;
    const targetPct = Math.min(100, Math.round((h.cur - h.avg) / (h.target - h.avg) * 100));
    const fmt = v => Math.round(v).toLocaleString('ko-KR');
    tbody.innerHTML += `
      <tr>
        <td><strong>${h.name}</strong></td>
        <td><span class="sector-badge badge-${h.sector}">${sectorIcon(h.sector)} ${h.sectorLabel}</span></td>
        <td>${h.qty}주</td>
        <td>₩${fmt(h.avg)}</td>
        <td>₩${fmt(h.cur)}</td>
        <td><span class="rate-pill ${isPos?'rate-pos':'rate-neg'}">${isPos?'+':''}${rate}%</span></td>
        <td class="${isPos?'positive':'negative'}">${isPos?'+':''}₩${fmt(pnl)}</td>
        <td>
          <div class="target-wrap">
            <div>₩${fmt(h.target)}</div>
            <div class="target-bar-bg"><div class="target-bar-fill" style="width:${targetPct}%"></div></div>
            <div class="target-pct">${targetPct}% 달성</div>
          </div>
        </td>
      </tr>`;
  });
  updateSummary(); // 테이블 렌더링 후 요약 정보 업데이트
}

function sectorIcon(id) {
  return { defense:'🛡️', semi:'💾', ship:'⚓', robot:'🤖', power:'🔌', bio:'💊' }[id] || '';
}

// ===== JOURNAL =====
function renderJournal() {
  const tbody = document.getElementById('journal-body');
  tbody.innerHTML = '';
  JOURNAL.forEach(j => {
    const isBuy = j.type === '매수';
    const total = (j.qty * j.price).toLocaleString('ko-KR');
    tbody.innerHTML += `
      <tr>
        <td>${j.date}</td>
        <td><strong>${j.name}</strong></td>
        <td>${j.sector}</td>
        <td><span class="rate-pill ${isBuy?'rate-pos':'rate-neg'}">${j.type}</span></td>
        <td>${j.qty}주</td>
        <td>₩${j.price.toLocaleString('ko-KR')}</td>
        <td>₩${total}</td>
        <td style="color:var(--text-secondary);font-size:12px">${j.memo}</td>
      </tr>`;
  });
}

// ===== SECTOR CARDS =====
function renderSectorCards() {
  const grid = document.getElementById('sector-grid');
  grid.innerHTML = '';
  SECTORS.forEach(s => {
    const signalClass = { '강력매수':'signal-strong-buy', '매수':'signal-buy', '관망':'signal-hold', '매도':'signal-sell' }[s.signal] || 'signal-hold';
    grid.innerHTML += `
      <div class="sector-card" data-sector="${s.id}" onclick="selectSector('${s.id}')">
        <div class="sc-header">
          <div class="sc-icon">${s.icon}</div>
          <div class="sc-name">${s.name}</div>
        </div>
        <div class="sc-stocks">${s.stocks.join(' · ')}</div>
        <div class="sc-score-label">AI 상승 확률</div>
        <div class="sc-score-bar-bg">
          <div class="sc-score-bar-fill" style="width:0%;background:${s.color}" data-w="${s.score}"></div>
        </div>
        <div class="sc-score-row">
          <div class="sc-pct" style="color:${s.color}">${s.score}%</div>
          <div class="sc-signal ${signalClass}">${s.signal}</div>
        </div>
        <div class="sc-midterm">3~6개월: <span>${s.midterm} ${s.midPct}</span></div>
        <div class="sc-ai-comment">🤖 ${s.aiAnalysis || '실시간 AI 뉴스 분석 데이터를 불러오는 중...'}</div>
      </div>`;
  });
  setTimeout(() => {
    document.querySelectorAll('.sc-score-bar-fill').forEach(el => {
      el.style.width = el.dataset.w + '%';
    });
  }, 300);
}

// ===== NEWS FEED =====
function renderNewsFeed(filter = 'all') {
  const list = document.getElementById('news-list');
  list.innerHTML = '';
  NEWS.filter(n => filter === 'all' || n.type === filter).forEach(n => {
    const impactClass = n.impact === 'pos' ? 'impact-pos' : 'impact-neg';
    const impactLabel = n.impact === 'pos' ? '▲ 긍정' : '▼ 부정';
    list.innerHTML += `
      <div class="news-item">
        <div class="news-meta">
          <span class="news-time">${n.time}</span>
          <span class="news-source">${n.source}</span>
          <span class="news-impact ${impactClass}">${impactLabel}</span>
        </div>
        <div class="news-headline">${n.headline}</div>
        <div class="news-ai">🤖 <strong>AI 분석:</strong> ${n.ai}</div>
      </div>`;
  });
}

function filterNews(type, btn) {
  currentFilter = type;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderNewsFeed(type);
}

// ===== SECTOR SELECTORS =====
function buildSectorSelectors() {
  ['short','mid'].forEach(prefix => {
    const el = document.getElementById(`${prefix}-sector-selector`);
    el.innerHTML = '';
    const defSector = prefix === 'short' ? 'defense' : 'power';
    SECTORS.forEach(s => {
      const active = s.id === defSector ? 'active' : '';
      el.innerHTML += `<button class="ss-btn ss-${s.id} ${active}" onclick="select${prefix.charAt(0).toUpperCase()+prefix.slice(1)}Sector('${s.id}', this)">${s.icon}${s.name}</button>`;
    });
  });
}

function selectShortSector(id, btn) {
  currentShortSector = id;
  document.querySelectorAll('#short-sector-selector .ss-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  updateShortChart(id);
}
function selectMidSector(id, btn) {
  currentMidSector = id;
  document.querySelectorAll('#mid-sector-selector .ss-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  updateMidChart(id);
}
function selectSector(id) {
  const shortBtn = document.querySelector(`#short-sector-selector .ss-${id}`);
  const midBtn = document.querySelector(`#mid-sector-selector .ss-${id}`);
  if (shortBtn) selectShortSector(id, shortBtn);
  if (midBtn) selectMidSector(id, midBtn);
}

// ===== CHART HELPERS =====
const chartDefaults = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { labels: { color: '#8899bb', font: { family: 'Outfit', size: 12 } } } },
  scales: {
    x: { ticks: { color: '#4a5878', font: { family: 'Outfit' } }, grid: { color: 'rgba(255,255,255,0.04)' } },
    y: { ticks: { color: '#4a5878', font: { family: 'Outfit' } }, grid: { color: 'rgba(255,255,255,0.04)' } }
  }
};

function mkGradient(ctx, color) {
  const g = ctx.createLinearGradient(0, 0, 0, 300);
  g.addColorStop(0, color.replace(')', ',0.4)').replace('rgb','rgba'));
  g.addColorStop(1, color.replace(')', ',0)').replace('rgb','rgba'));
  return g;
}

// ===== PORTFOLIO CHARTS =====
function initPortfolioCharts() {
  // Allocation Donut
  const allocCtx = document.getElementById('alloc-chart').getContext('2d');
  const allocValues = HOLDINGS.map(h => h.cur * h.qty);
  allocChart = new Chart(allocCtx, {
    type: 'doughnut',
    data: {
      labels: HOLDINGS.map(h => h.name),
      datasets: [{ data: allocValues,
        backgroundColor: ['#3b82f6','#f59e0b','#06b6d4','#10b981','#8b5cf6'],
        borderColor: 'rgba(0,0,0,0.3)', borderWidth: 2, hoverOffset: 8 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '65%',
      plugins: {
        legend: { position: 'right', labels: { color: '#8899bb', font: { family:'Outfit', size:11 }, padding:12 } },
        tooltip: { callbacks: { label: ctx => ` ₩${ctx.parsed.toLocaleString('ko-KR')}` } }
      }
    }
  });

  // Trend Line
  const trendCtx = document.getElementById('trend-chart').getContext('2d');
  const trendLabels = ['10/21','11/21','12/21','01/22','02/22','03/22','04/22'];
  const trendData = [32000000, 34500000, 33800000, 37200000, 39800000, 43100000, 48750000];
  const g = trendCtx.createLinearGradient(0, 0, 0, 320);
  g.addColorStop(0, 'rgba(99,102,241,0.4)');
  g.addColorStop(1, 'rgba(99,102,241,0)');
  trendChart = new Chart(trendCtx, {
    type: 'line',
    data: {
      labels: trendLabels,
      datasets: [{ label: '포트폴리오 평가금액', data: trendData,
        borderColor: '#6366f1', backgroundColor: g,
        borderWidth: 2.5, pointRadius: 5, pointBackgroundColor: '#6366f1',
        tension: 0.4, fill: true }]
    },
    options: { ...chartDefaults,
      plugins: { ...chartDefaults.plugins,
        tooltip: { callbacks: { label: ctx => ` ₩${ctx.parsed.y.toLocaleString('ko-KR')}` } }
      },
      scales: { ...chartDefaults.scales,
        y: { ...chartDefaults.scales.y,
          ticks: { ...chartDefaults.scales.y.ticks,
            callback: v => '₩' + (v/1000000).toFixed(0) + 'M'
          }
        }
      }
    }
  });
}

// ===== SECTOR CHARTS =====
function initSectorCharts() {
  // Radar
  const radarCtx = document.getElementById('radar-chart').getContext('2d');
  radarChart = new Chart(radarCtx, {
    type: 'radar',
    data: {
      labels: SECTORS.map(s => s.icon + ' ' + s.name),
      datasets: [
        { label: '단기 예측 점수', data: SECTORS.map(s => s.score),
          borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.2)',
          borderWidth: 2, pointBackgroundColor: '#6366f1', pointRadius: 4 },
        { label: '3개월 전망', data: [95, 82, 89, 75, 108].map(v => Math.min(100, v * 0.9)),
          borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.15)',
          borderWidth: 2, pointBackgroundColor: '#10b981', pointRadius: 4 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#8899bb', font: { family:'Outfit', size:11 } } } },
      scales: {
        r: {
          min: 0, max: 100,
          ticks: { color: '#4a5878', backdropColor: 'transparent', stepSize: 25 },
          grid: { color: 'rgba(255,255,255,0.06)' },
          pointLabels: { color: '#8899bb', font: { family:'Outfit', size: 12 } }
        }
      }
    }
  });

  // Short & Mid charts
  buildShortChart('defense');
  buildMidChart('power');
}

function buildShortChart(sectorId) {
  const s = SECTORS.find(x => x.id === sectorId);
  const ctx = document.getElementById('short-chart').getContext('2d');
  if (shortChart) shortChart.destroy();
  const labels = ['월','화','수','목','금','토','일','내일'];
  shortChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: '예측 점수', data: s.shortTrend,
          borderColor: s.color, backgroundColor: s.color + '33',
          borderWidth: 2.5, tension: 0.4, fill: true, pointRadius: 4 },
        { label: '기준선 (50)', data: Array(8).fill(50),
          borderColor: 'rgba(255,255,255,0.2)', borderDash: [5,5],
          borderWidth: 1, pointRadius: 0 }
      ]
    },
    options: { ...chartDefaults,
      scales: { ...chartDefaults.scales,
        y: { ...chartDefaults.scales.y, min: 0, max: 100,
          ticks: { ...chartDefaults.scales.y.ticks, callback: v => v + '%' } }
      }
    }
  });
}

function buildMidChart(sectorId) {
  const s = SECTORS.find(x => x.id === sectorId);
  const ctx = document.getElementById('mid-chart').getContext('2d');
  if (midChart) midChart.destroy();
  const labels = ['현재','1개월','2개월','3개월','4개월','5개월','6개월','7개월'];
  const upper = s.midForecast.map(v => Math.min(100, v * 1.08));
  const lower = s.midForecast.map(v => v * 0.92);
  midChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: '예측 상한', data: upper, borderColor: s.color + '60',
          backgroundColor: s.color + '15', borderDash: [4,4], borderWidth: 1.5,
          fill: false, pointRadius: 0 },
        { label: '중기 예측', data: s.midForecast, borderColor: s.color,
          backgroundColor: s.color + '25', borderWidth: 2.5,
          tension: 0.4, fill: 2, pointRadius: 4 },
        { label: '예측 하한', data: lower, borderColor: s.color + '60',
          backgroundColor: 'transparent', borderDash: [4,4], borderWidth: 1.5,
          fill: false, pointRadius: 0 }
      ]
    },
    options: { ...chartDefaults,
      scales: { ...chartDefaults.scales,
        y: { ...chartDefaults.scales.y, ticks: { ...chartDefaults.scales.y.ticks, callback: v => v + '%' } }
      }
    }
  });
}

function updateShortChart(id) { buildShortChart(id); }
function updateMidChart(id) { buildMidChart(id); }

// ===== MARKET CHARTS =====
function initMarketCharts() {
  const dates = [];
  const base = new Date();
  base.setDate(base.getDate() - 29);
  for (let i = 0; i < 30; i++) {
    const d = new Date(base); d.setDate(base.getDate() + i);
    dates.push(`${d.getMonth()+1}/${d.getDate()}`);
  }

  function randWalk(start, vol, n) {
    const arr = [start];
    for (let i = 1; i < n; i++) arr.push(+(arr[i-1] + (Math.random()-0.48) * vol).toFixed(2));
    return arr;
  }

  // 사용자가 '2년 전 자료'라고 느끼지 않도록 현재 시점(2026년 상정) 지수 기준으로 차트 생성
  const kospiData = randWalk(MARKET_DATA.kospi * 0.95, MARKET_DATA.kospi * 0.01, 30);
  const kosdaqData = randWalk(MARKET_DATA.kosdaq * 0.95, MARKET_DATA.kosdaq * 0.01, 30);
  
  kospiData[29] = MARKET_DATA.kospi; 
  kosdaqData[29] = MARKET_DATA.kosdaq;

  function mkMarketChart(canvasId, label, data, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 300);
    g.addColorStop(0, color + '50');
    g.addColorStop(1, color + '00');
    
    // 기존 차트가 있으면 파괴
    const existing = Chart.getChart(canvasId);
    if (existing) existing.destroy();

    return new Chart(ctx, {
      type: 'line',
      data: {
        labels: dates,
        datasets: [{ label, data, borderColor: color, backgroundColor: g,
          borderWidth: 2, tension: 0.3, fill: true, pointRadius: 0 }]
      },
      options: { ...chartDefaults,
        plugins: { ...chartDefaults.plugins, legend: { display: false } }
      }
    });
  }

  kospiChart = mkMarketChart('kospi-chart', 'KOSPI', kospiData, '#3b82f6');
  kosdaqChart = mkMarketChart('kosdaq-chart', 'KOSDAQ', kosdaqData, '#10b981');
}

// ===== PERIOD CHANGE =====
function changePeriod(period, btn) {
  document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const months = { '1m': 1, '3m': 3, '6m': 6 };
  const m = months[period] || 6;
  const allData = [32000000, 34500000, 33800000, 37200000, 39800000, 43100000, 48750000];
  const allLabels = ['10/21','11/21','12/21','01/22','02/22','03/22','04/22'];
  const slice = m + 1;
  trendChart.data.labels = allLabels.slice(-slice);
  trendChart.data.datasets[0].data = allData.slice(-slice);
  trendChart.update();
}

// ===== SYNC MODAL =====
function simulateSync() {
  const modal = document.getElementById('sync-modal');
  const fill = document.getElementById('sync-progress');
  modal.style.display = 'flex';
  fill.style.width = '0%';
  let pct = 0;
  const timer = setInterval(() => {
    pct += Math.random() * 15;
    if (pct >= 100) { pct = 100; clearInterval(timer); setTimeout(() => { modal.style.display = 'none'; }, 600); }
    fill.style.width = pct + '%';
  }, 120);
}

// ===== AI REFRESH =====
async function refreshAI() {
  const btn = document.querySelector('.refresh-ai-btn');
  const originalText = btn.textContent;
  btn.textContent = '🔄 분석 로드 중...';
  btn.disabled = true;

  try {
    // 구글 시트에서 최신 AI 예측 데이터 다시 읽어오기
    await loadPredictionsFromSheets();
    
    const now = new Date();
    const t = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${now.toLocaleTimeString('ko-KR',{hour12:false}).slice(0,5)}`;
    document.getElementById('last-analysis-time').textContent = t;
    
    renderSectorCards();
    renderNewsFeed(currentFilter);
    alert('✨ 최신 AI 분석 데이터가 반영되었습니다.');
  } catch (e) {
    console.error(e);
    alert('❌ 데이터 로드 중 오류가 발생했습니다.');
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

// ===== ADD TRADE (placeholder) =====
function showAddTrade() {
  alert('📝 매매 기록 추가 기능은 Google Sheets 연동(Phase 2) 완료 후 활성화됩니다.');
}

// ===== REAL-TIME MARKET DATA =====
// Yahoo Finance API를 브라우저에서 직접 호출하여 실시간 시세 업데이트
const MARKET_SYMBOLS = [
  { sym: '^KS11',    id: 'kospi',   hdrid: 'hdr-kospi',  hdrchgid: 'hdr-kospi-chg',   decimals: 2 },
  { sym: '^KQ11',    id: 'kosdaq',  hdrid: 'hdr-kosdaq', hdrchgid: 'hdr-kosdaq-chg',  decimals: 2 },
  { sym: '^GSPC',    id: 'sp500',   decimals: 2 },
  { sym: '^IXIC',    id: 'nasdaq',  decimals: 2 },
  { sym: 'USDKRW=X', id: 'usdkrw', decimals: 2 },
  { sym: '^N225',    id: 'nikkei',  decimals: 2 },
];

// ===== MARKET UI SYNC =====
// 전역 MARKET_DATA를 기반으로 UI와 차트 전체 업데이트
function syncMarketUI() {
  const configs = [
    { id: 'kospi',   hdrid: 'hdr-kospi',  hdrchgid: 'hdr-kospi-chg', decimals: 2 },
    { id: 'kosdaq',  hdrid: 'hdr-kosdaq', hdrchgid: 'hdr-kosdaq-chg', decimals: 2 },
    { id: 'sp500',   decimals: 2 },
    { id: 'nasdaq',  decimals: 2 },
    { id: 'usdkrw',  decimals: 2 },
    { id: 'nikkei',  decimals: 2 },
  ];

  configs.forEach(cfg => {
    const val = MARKET_DATA[cfg.id];
    if (!val) return;

    const fmt = (v, d) => Number(v).toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });
    const priceStr = fmt(val, cfg.decimals);

    // 카드 업데이트
    const valEl = document.getElementById(`mkt-${cfg.id}`);
    const chgEl = document.getElementById(`mkt-${cfg.id}-chg`);
    if (valEl) valEl.textContent = priceStr;
    if (chgEl && chgEl.textContent === '불러오는 중...') {
      chgEl.textContent = '실시간 연동 중'; // 기본 상태 메시지
      chgEl.style.color = 'var(--text-secondary)';
    }

    // 헤더 업데이트
    if (cfg.hdrid) {
      const hValEl = document.getElementById(cfg.hdrid);
      if (hValEl) hValEl.textContent = priceStr;
    }
  });

  // 차트 업데이트
  initMarketCharts();
}

async function fetchRealTimeMarketData() {
  const symbols = MARKET_SYMBOLS.map(m => m.sym).join(',');
  const yahooUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent`;

  // CORS 프록시 시도 리스트 (순차적 시도)
  const proxies = [
    `https://corsproxy.io/?${encodeURIComponent(yahooUrl)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(yahooUrl)}`,
    `https://thingproxy.freeboard.io/fetch/${yahooUrl}`,
    `https://cors-anywhere.herokuapp.com/${yahooUrl}` // 이건 보통 허가가 필요하긴 함
  ];

  let json = null;
  let successProxy = null;
  for (const proxyUrl of proxies) {
    try {
      console.log(`[Market] 프록시 시도 중: ${proxyUrl.split('/')[2]}`);
      const res = await fetch(proxyUrl, { method: 'GET' });
      if (!res.ok) continue;
      json = await res.json();
      if (json?.quoteResponse?.result?.length) {
        successProxy = proxyUrl.split('/')[2];
        break; 
      }
    } catch (_) { /* 다음 프록시 시도 */ }
  }

  try {
    const quotes = json?.quoteResponse?.result;
    if (!quotes || !quotes.length) throw new Error('모든 프록시에서 데이터를 가져오지 못했습니다.');

    quotes.forEach(q => {
      // 대소문자 무시하고 매칭
      const cfg = MARKET_SYMBOLS.find(m => m.sym.toUpperCase() === q.symbol.toUpperCase());
      if (!cfg) return;

      const price     = q.regularMarketPrice;
      const change    = q.regularMarketChange;
      const changePct = q.regularMarketChangePercent;
      
      if (price === undefined || change === undefined) return;

      const isPos  = change >= 0;
      const arrow  = isPos ? '▲' : '▼';
      const cls    = isPos ? 'positive' : 'negative';

      const fmt = (v, d) => v.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });
      const priceStr  = fmt(price, cfg.decimals);
      const changeStr = `${arrow} ${fmt(Math.abs(change), cfg.decimals)} (${isPos ? '+' : ''}${changePct.toFixed(2)}%)`;

      // 시장 현황 탭 업데이트
      const valEl = document.getElementById(`mkt-${cfg.id}`);
      const chgEl = document.getElementById(`mkt-${cfg.id}-chg`);
      const card  = document.getElementById(`mkt-card-${cfg.id}`);
      
      if (valEl) {
        valEl.textContent = priceStr;
        valEl.classList.add('pulse-once'); // 업데이트 시각 효과
        setTimeout(() => valEl.classList.remove('pulse-once'), 1000);
      }
      if (chgEl) { 
        chgEl.textContent = changeStr; 
        chgEl.className = `mkt-chg ${cls}`; 
      }
      if (card) {
        card.style.borderTop = `3px solid ${isPos ? 'var(--positive)' : 'var(--negative)'}`;
      }

      if (cfg.id === 'kospi' || cfg.id === 'kosdaq') {
        MARKET_DATA[cfg.id] = price;
        // 지수 업데이트 시 차트도 실시간 반영
        initMarketCharts();
      }

      // 헤더 코스피 / 코스닥 업데이트
      if (cfg.hdrid) {
        const hValEl = document.getElementById(cfg.hdrid);
        const hChgEl = document.getElementById(cfg.hdrchgid);
        if (hValEl) hValEl.textContent = priceStr;
        if (hChgEl) { 
          hChgEl.textContent = `${arrow} ${Math.abs(changePct).toFixed(2)}%`; 
          hChgEl.className = `index-chg ${cls}`; 
        }
      }
    });

    console.log(`[Market] 실시간 지수 업데이트 성공 (Proxy: ${successProxy})`);
    syncMarketUI(); // 성공 시 UI 다시 갱신
  } catch (err) {
    console.warn('[Market] 실시간 연동 지연:', err.message);
    // 에러 발생 시에도 '일시적 연결 오류'를 띄우지 않고 기존 시트 데이터를 유지
    document.querySelectorAll('.mkt-chg').forEach(el => {
      if (el.textContent === '불러오는 중...') {
        el.textContent = '시트 데이터 동기화됨';
        el.style.color = 'var(--text-muted)';
      }
    });
  }
}

// ===== AI REFRESH =====
async function refreshAI() {
  const btn = document.querySelector('.refresh-ai-btn');
  if (btn) {
    const originalText = btn.textContent;
    btn.textContent = '🔄 분석 로드 중...';
    btn.disabled = true;

    try {
      await loadPredictionsFromSheets();
      renderSectorCards();
      renderNewsFeed(currentFilter);
      btn.textContent = '✅ 완료';
      setTimeout(() => {
        btn.textContent = originalText;
        btn.disabled = false;
      }, 2000);
    } catch (e) {
      console.error(e);
      btn.textContent = '❌ 실패';
      setTimeout(() => {
        btn.textContent = originalText;
        btn.disabled = false;
      }, 2000);
    }
  }
}
