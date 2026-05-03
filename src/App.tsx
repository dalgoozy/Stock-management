import React, { useState } from 'react';
import { 
  Rocket, 
  LayoutDashboard, 
  Flame, 
  Globe, 
  Shield, 
  Cpu, 
  Ship, 
  Bot, 
  Zap, 
  Pill,
  RefreshCw,
  Activity
} from 'lucide-react';
import { useSheetsData } from './hooks/useSheetsData';

const SECTOR_CONFIG: any = {
  '방산': { icon: Shield, color: '#f59e0b', id: 'defense' },
  '반도체': { icon: Cpu, color: '#3b82f6', id: 'semi' },
  '조선': { icon: Ship, color: '#06b6d4', id: 'ship' },
  '로봇': { icon: Bot, color: '#8b5cf6', id: 'robot' },
  '전력': { icon: Zap, color: '#10b981', id: 'power' },
  '바이오': { icon: Pill, color: '#ec4899', id: 'bio' }
};

const App: React.FC = () => {
  const { portfolio, marketIndices, predictions, latestAnalysisTime, loading } = useSheetsData();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [currentTime, setCurrentTime] = React.useState(new Date());

  React.useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const totalEval = portfolio.reduce((acc: number, h: any) => acc + (h.cur * h.qty), 0);
  const totalInv = portfolio.reduce((acc: number, h: any) => acc + (h.avg * h.qty), 0);
  const totalPnl = totalEval - totalInv;
  const totalRate = totalInv > 0 ? (totalPnl / totalInv * 100).toFixed(1) : '0.0';

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#070d1f] text-white">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-10 h-10 animate-spin text-blue-500" />
          <p className="text-lg font-medium">데이터 로드 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070d1f] text-[#e8edf5]">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 h-[68px] bg-[#070d1f]/85 backdrop-blur-xl border-b border-white/10 flex items-center justify-between px-6 z-50">
        <div className="flex items-center gap-3">
          <Rocket className="w-8 h-8 text-orange-500" />
          <div className="flex flex-col leading-none">
            <span className="text-xl font-extrabold bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent">떡상</span>
            <span className="text-[11px] text-[#8899bb]">주식관리</span>
          </div>
        </div>

        <nav className="flex gap-1 bg-white/5 border border-white/10 rounded-xl p-1">
          {[
            { id: 'dashboard', icon: LayoutDashboard, label: '내 포트폴리오' },
            { id: 'ai', icon: Flame, label: '섹터 AI 예측' },
            { id: 'market', icon: Globe, label: '시장 현황' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/20' : 'text-[#8899bb] hover:bg-white/5 hover:text-white'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-6">
            <div className="hidden lg:flex gap-4">
                {Object.entries(marketIndices).slice(0, 4).map(([name, val]: [string, any]) => (
                    <div key={name} className="flex flex-col items-end leading-tight border-r border-white/10 pr-4 last:border-0 last:pr-0">
                        <span className="text-[9px] text-[#4a5878] font-bold uppercase tracking-tighter">{name}</span>
                        <span className="text-xs font-bold font-mono">{(val || 0).toLocaleString()}</span>
                    </div>
                ))}
            </div>
            <div className="bg-cyan-500/10 border border-cyan-500/20 px-4 py-1.5 rounded-lg font-mono text-cyan-400 text-lg font-bold">
                {currentTime.toLocaleTimeString('ko-KR', { hour12: false })}
            </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-[92px] pb-12 px-6 max-w-[1600px] mx-auto">
        {activeTab === 'dashboard' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <KpiCard label="총 평가자산" value={`₩ ${totalEval.toLocaleString()}`} sub={`투자원금 ₩ ${totalInv.toLocaleString()}`} />
              <KpiCard label="수익률" value={`${totalPnl >= 0 ? '+' : ''}${totalRate}%`} sub={`${totalPnl >= 0 ? '+' : ''}₩ ${totalPnl.toLocaleString()}`} isPositive={totalPnl >= 0} />
              <KpiCard label="보유 종목수" value={`${portfolio.length}개`} sub="섹터별 분산 투자 중" />
              <KpiCard label="AI 예측 신호" value={predictions.length > 0 ? (predictions.sort((a:any,b:any) => (b['점수']||0)-(a['점수']||0))[0]['신호'] || '관망') : '관망'} sub={predictions.length > 0 ? `${predictions.sort((a:any,b:any)=>(b['점수']||0)-(a['점수']||0))[0]['섹터']} 섹터 유망` : '분석 중'} highlight />
            </div>

            {/* Holdings Table */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md">
                <h2 className="text-lg font-bold mb-4">보유 종목 현황</h2>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm border-collapse">
                        <thead>
                            <tr className="border-b border-white/10 text-[#8899bb] uppercase text-[11px] font-bold">
                                <th className="p-3">종목명</th>
                                <th className="p-3">섹터</th>
                                <th className="p-3">수량</th>
                                <th className="p-3">평단가</th>
                                <th className="p-3">현재가</th>
                                <th className="p-3">수익률</th>
                                <th className="p-3">평가손익</th>
                            </tr>
                        </thead>
                        <tbody>
                            {portfolio.map((h: any, i: number) => {
                                const pnl = (h.cur - h.avg) * h.qty;
                                const rate = h.avg > 0 ? ((h.cur - h.avg) / h.avg * 100).toFixed(1) : '0.0';
                                const sector = SECTOR_CONFIG[h.sector] || { id: 'semi', color: '#3b82f6' };
                                return (
                                    <tr key={i} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors">
                                        <td className="p-3 font-bold">{h.name}</td>
                                        <td className="p-3">
                                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold`} style={{ backgroundColor: `${sector.color}20`, color: sector.color }}>
                                                {h.sector}
                                            </span>
                                        </td>
                                        <td className="p-3 text-[#8899bb]">{h.qty}주</td>
                                        <td className="p-3 font-mono">₩{h.avg.toLocaleString()}</td>
                                        <td className="p-3 font-mono font-bold">₩{h.cur.toLocaleString()}</td>
                                        <td className="p-3">
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${Number(rate) >= 0 ? 'bg-emerald-500/15 text-emerald-500' : 'bg-red-500/15 text-red-500'}`}>
                                                {Number(rate) >= 0 ? '+' : ''}{rate}%
                                            </span>
                                        </td>
                                        <td className={`p-3 font-bold ${pnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                            {pnl >= 0 ? '+' : ''}₩{pnl.toLocaleString()}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
          </div>
        )}

        {activeTab === 'ai' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center gap-3 bg-violet-500/10 border border-violet-500/25 rounded-xl p-4 text-sm text-[#8899bb]">
              <div className="bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">AI</div>
              <span>Gemini 1.5 Flash + Grok 기반 뉴스 감성 분석 — 마지막 분석: {latestAnalysisTime || '데이터 없음'}</span>
              <button className="ml-auto flex items-center gap-2 px-3 py-1 bg-violet-500/15 border border-violet-500/30 rounded-lg text-violet-400 font-bold hover:bg-violet-500/25 transition-colors">
                <RefreshCw className="w-3 h-3" /> 새로고침
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(SECTOR_CONFIG).map(([name, config]: [string, any]) => {
                    const sectorPred = predictions.find((p: any) => p['섹터'] === name);
                    return (
                      <div key={name} className="bg-white/5 border border-white/10 rounded-2xl p-5 hover:translate-y-[-4px] hover:border-white/20 transition-all cursor-pointer relative overflow-hidden group">
                          <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ backgroundColor: config.color }} />
                          <div className="flex items-center gap-2 mb-4">
                              <config.icon className="w-6 h-6" style={{ color: config.color }} />
                              <h3 className="text-lg font-bold">{name}</h3>
                          </div>
                          <div className="text-[10px] text-[#8899bb] font-bold uppercase mb-1">AI 상승 확률</div>
                          <div className="h-1.5 bg-white/10 rounded-full mb-3 overflow-hidden">
                              <div className="h-full transition-all duration-1000" style={{ width: `${sectorPred?.['점수'] || 75}%`, backgroundColor: config.color }} />
                          </div>
                          <div className="flex justify-between items-center mb-4">
                              <span className="text-2xl font-black font-mono" style={{ color: config.color }}>{sectorPred?.['점수'] || 75}%</span>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-white/10 text-[#8899bb]">{sectorPred?.['신호'] || '관망'}</span>
                          </div>
                          <div className="text-[11px] text-[#8899bb] border-t border-white/10 pt-3">
                              3~6개월: <span className="text-white font-bold">{sectorPred?.['전망'] || '→ 횡보'}</span>
                          </div>
                          <div className="mt-4 p-3 bg-indigo-500/10 border-l-2 border-indigo-500 rounded text-[11px] leading-relaxed text-indigo-300">
                              🤖 {sectorPred?.['ai_analysis'] || '섹터 분석 데이터 로드 중...'}
                          </div>
                      </div>
                    );
                })}
              </div>
              
              {/* News Feed */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col h-full max-h-[600px]">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-purple-400" />
                  AI 뉴스 분석 피드
                </h2>
                <div className="space-y-4 overflow-y-auto pr-2 custom-scrollbar">
                  {predictions.filter((p: any) => p['ai_analysis'] && p['ai_analysis'].length > 20).map((news: any, i: number) => (
                    <div key={i} className="border-b border-white/5 pb-4 last:border-0 hover:bg-white/[0.02] transition-colors p-2 rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] text-[#4a5878] font-bold">{news['ai_analysis 날짜']?.slice(11, 16) || '09:00'}</span>
                        <span className="text-[10px] text-[#8899bb]">{news['섹터']}</span>
                        <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded ${Number(news['점수']) > 70 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                          {Number(news['점수']) > 70 ? '▲ 긍정' : '▼ 신중'}
                        </span>
                      </div>
                      <div className="text-xs font-medium leading-relaxed">
                        {news['ai_analysis']?.slice(0, 100)}...
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'market' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <h2 className="text-xl font-bold">글로벌 시장 현황</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {Object.entries(marketIndices).map(([name, val]: [string, any]) => (
                <div key={name} className="bg-white/5 border border-white/10 rounded-2xl p-5 hover:border-white/20 transition-all">
                  <div className="text-[11px] text-[#8899bb] font-bold uppercase tracking-wider mb-2">{name}</div>
                  <div className="text-2xl font-black font-mono text-white">
                    {name === 'USD/KRW' ? `₩${(val||0).toLocaleString()}` : (val||0).toLocaleString()}
                  </div>
                  <div className="text-[11px] text-[#4a5878] mt-1">{val > 0 ? '실시간 데이터' : '데이터 없음'}</div>
                </div>
              ))}
            </div>
            {Object.values(marketIndices).every((v:any) => !v || v === 0) && (
              <div className="text-center py-16 text-[#4a5878]">
                <Globe className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p className="text-sm">시장 지수 데이터를 불러오는 중입니다.</p>
                <p className="text-xs mt-2">Python 스크립트(ai_analysis.py)를 실행하면 자동으로 채워집니다.</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

const KpiCard = ({ label, value, sub, isPositive, highlight }: any) => (
  <div className={`relative group p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-white/20 transition-all ${highlight ? 'bg-emerald-500/5 border-emerald-500/20' : ''}`}>
    <div className={`absolute top-0 left-0 right-0 h-[3px] opacity-0 group-hover:opacity-100 transition-opacity ${highlight ? 'bg-emerald-500 opacity-100' : 'bg-gradient-to-r from-blue-500 to-indigo-600'}`} />
    <div className="text-[11px] text-[#8899bb] font-bold uppercase tracking-wider mb-2">{label}</div>
    <div className={`text-2xl font-black font-mono mb-1 ${isPositive === true ? 'text-emerald-500' : isPositive === false ? 'text-red-500' : ''}`}>{value}</div>
    <div className="text-xs text-[#4a5878]">{sub}</div>
  </div>
);

export default App;
