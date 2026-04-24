import { useState, useEffect, useRef } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";

const COLORS = {
  AAPL: "#60a5fa", MSFT: "#34d399",
  GOOGL: "#f59e0b", JPM: "#f87171", BLK: "#a78bfa",
};

const ESG_COLOR = (score) => {
  if (score >= 75) return "#34d399";
  if (score >= 60) return "#60a5fa";
  if (score >= 45) return "#f59e0b";
  return "#f87171";
};

const fmt    = (n) => `£${Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2 })}`;
const pColor = (n) => n >= 0 ? "#34d399" : "#f87171";
const arrow  = (n) => n >= 0 ? "▲" : "▼";
const na     = (v, suffix = "") => v == null ? "—" : `${v}${suffix}`;

export default function App() {
  const [tab, setTab]           = useState("overview");
  const [positions, setPositions] = useState([]);
  const [summary, setSummary]   = useState({});
  const [risk, setRisk]         = useState({});
  const [history, setHistory]   = useState([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);

  useEffect(() => {
    fetch("http://localhost:8000/history?limit=50")
      .then(r => r.json())
      .then(data => setHistory(data.map(d => ({
        time:  new Date(d.timestamp * 1000).toLocaleTimeString(),
        total: d.total,
        pnl:   d.pnl,
      }))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket("ws://localhost:8000/ws");
      wsRef.current = ws;
      ws.onopen  = () => setConnected(true);
      ws.onclose = () => { setConnected(false); setTimeout(connect, 2000); };
      ws.onmessage = (e) => {
        const data = JSON.parse(e.data);
        setPositions(data.positions || []);
        setSummary(data);
        setRisk(data.risk || {});
        setHistory(h => [...h, {
          time:  new Date(data.timestamp * 1000).toLocaleTimeString(),
          total: data.total,
          pnl:   data.total_pnl,
        }].slice(-60));
      };
    };
    connect();
    return () => wsRef.current?.close();
  }, []);

  const radarData = risk.esg ? [
    { metric: "Environmental", value: risk.esg.environmental },
    { metric: "Social",        value: risk.esg.social },
    { metric: "Governance",    value: risk.esg.governance },
  ] : [];

  return (
    <div style={s.page}>

      {/* Header */}
      <div style={s.header}>
        <div>
          <div style={s.title}>Church Commision Portfolio Monitor</div>
          <div style={s.sub}>Event-Driven Valuation & Risk Engine</div>
        </div>
        <div style={s.pill(connected)}>{connected ? "● LIVE" : "○ RECONNECTING"}</div>
      </div>

      {/* Summary Cards — always visible */}
      <div style={s.cards4}>
        <StatCard label="Total Value"  value={fmt(summary.total || 0)} />
        <StatCard label="Cost Basis"   value={fmt(summary.benchmark || 0)} />
        <StatCard label="Total P&L"
          value={`${arrow(summary.total_pnl)} ${fmt(Math.abs(summary.total_pnl || 0))}`}
          color={pColor(summary.total_pnl)} />
        <StatCard label="Return"
          value={`${arrow(summary.pnl_pct)} ${Math.abs(summary.pnl_pct || 0).toFixed(2)}%`}
          color={pColor(summary.pnl_pct)} />
      </div>

      {/* Tabs */}
      <div style={s.tabs}>
        {["overview", "risk", "esg"].map(t => (
          <button key={t} onClick={() => setTab(t)} style={s.tab(tab === t)}>
            {t === "overview" ? "Overview" : t === "risk" ? "Risk Analytics" : "ESG / PAI"}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {tab === "overview" && <>
        <div style={s.card}>
          <div style={s.cardTitle}>Positions</div>
          <table style={s.table}>
            <thead><tr style={s.thead}>
              {["Ticker","Shares","Purchase","Current","Cost Basis","Value","P&L","Return"].map(h => (
                <th key={h} style={s.th}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {positions.map(p => (
                <tr key={p.ticker} style={s.trow}>
                  <td style={s.td}><span style={s.dot(COLORS[p.ticker])} />{p.ticker}</td>
                  <td style={s.td}>{p.shares}</td>
                  <td style={s.td}>{fmt(p.purchase_price)}</td>
                  <td style={s.td}>{fmt(p.price)}</td>
                  <td style={s.td}>{fmt(p.cost_basis)}</td>
                  <td style={s.td}>{fmt(p.value)}</td>
                  <td style={{...s.td, color: pColor(p.pnl)}}>{arrow(p.pnl)} {fmt(Math.abs(p.pnl))}</td>
                  <td style={{...s.td, color: pColor(p.pnl_pct)}}>{arrow(p.pnl_pct)} {Math.abs(p.pnl_pct).toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={s.card}>
          <div style={s.cardTitle}>Live P&L Chart</div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={history}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="time" tick={{ fill: "#64748b", fontSize: 10 }} />
              <YAxis tick={{ fill: "#64748b", fontSize: 10 }}
                tickFormatter={v => `£${(v/1000).toFixed(0)}k`} domain={["auto","auto"]} />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b" }}
                formatter={(v, n) => [fmt(v), n === "pnl" ? "P&L" : "Total"]} />
              <ReferenceLine y={0} stroke="#475569" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="total" stroke="#60a5fa" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="pnl"   stroke="#34d399" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </>}

      {/* ── RISK TAB ── */}
      {tab === "risk" && <>
        <div style={s.cards4}>
          <StatCard label="Sharpe Ratio"
            value={na(risk.sharpe)}
            color={risk.sharpe == null ? "#64748b" : risk.sharpe >= 1 ? "#34d399" : risk.sharpe >= 0 ? "#f59e0b" : "#f87171"}
            sub="Higher is better. >1 is good" />
          <StatCard label="Sortino Ratio"
            value={na(risk.sortino)}
            color={risk.sortino == null ? "#64748b" : risk.sortino >= 1 ? "#34d399" : risk.sortino >= 0 ? "#f59e0b" : "#f87171"}
            sub="Downside risk-adjusted return" />
          <StatCard label="Max Drawdown"
            value={na(risk.drawdown?.max, "%")}
            color={risk.drawdown?.max == null ? "#64748b" : risk.drawdown.max > -5 ? "#34d399" : risk.drawdown.max > -15 ? "#f59e0b" : "#f87171"}
            sub="Worst peak-to-trough loss" />
          <StatCard label="Current Drawdown"
            value={na(risk.drawdown?.current, "%")}
            color={risk.drawdown?.current == null ? "#64748b" : risk.drawdown.current > -5 ? "#34d399" : "#f87171"}
            sub="vs all-time high" />
        </div>

        <div style={s.cards2}>
          <div style={s.card}>
            <div style={s.cardTitle}>Value at Risk (VaR)</div>
            {risk.var ? <>
              <div style={s.varRow}>
                <div>
                  <div style={s.varLabel}>95% Confidence (Parametric)</div>
                  <div style={s.varValue}>{fmt(risk.var.var_95_parametric)}</div>
                  <div style={s.varSub}>5% chance of losing more than this today</div>
                </div>
                <div>
                  <div style={s.varLabel}>99% Confidence (Parametric)</div>
                  <div style={s.varValue}>{fmt(risk.var.var_99_parametric)}</div>
                  <div style={s.varSub}>1% chance of losing more than this today</div>
                </div>
                <div>
                  <div style={s.varLabel}>95% Confidence (Historical)</div>
                  <div style={s.varValue}>{fmt(risk.var.var_95_historical)}</div>
                  <div style={s.varSub}>Based on actual observed returns</div>
                </div>
              </div>
            </> : <div style={{ color: "#64748b", fontSize: 13 }}>Accumulating data — need 10+ ticks...</div>}
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>Ratio Interpretation</div>
            <div style={s.interpretRow}>
              <InterpretRow label="Sharpe > 2.0"  meaning="Excellent risk-adjusted return"     color="#34d399" />
              <InterpretRow label="Sharpe 1-2"    meaning="Good — better than the market"      color="#60a5fa" />
              <InterpretRow label="Sharpe 0-1"    meaning="Subpar — taking risk for low reward" color="#f59e0b" />
              <InterpretRow label="Sharpe < 0"    meaning="Losing vs risk-free rate"            color="#f87171" />
              <InterpretRow label="Sortino > Sharpe" meaning="Mostly upside volatility — good"  color="#34d399" />
              <InterpretRow label="Drawdown < 10%" meaning="Well controlled downside risk"      color="#34d399" />
            </div>
          </div>
        </div>

        <div style={s.card}>
          <div style={s.cardTitle}>Portfolio Value History</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={history}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="time" tick={{ fill: "#64748b", fontSize: 10 }} />
              <YAxis tick={{ fill: "#64748b", fontSize: 10 }}
                tickFormatter={v => `£${(v/1000).toFixed(0)}k`} domain={["auto","auto"]} />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b" }}
                formatter={(v) => [fmt(v), "Value"]} />
              <Line type="monotone" dataKey="total" stroke="#60a5fa" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </>}

      {/* ── ESG / PAI TAB ── */}
      {tab === "esg" && <>
        <div style={s.cards3}>
          <StatCard label="Portfolio ESG Score"
            value={na(risk.esg?.portfolio_esg_score)}
            color={ESG_COLOR(risk.esg?.portfolio_esg_score)}
            sub={`Rating: ${risk.esg?.portfolio_rating || "—"}`} />
          <StatCard label="Environmental"
            value={na(risk.esg?.environmental)}
            color={ESG_COLOR(risk.esg?.environmental)}
            sub="Climate & resource impact" />
          <StatCard label="Social"
            value={na(risk.esg?.social)}
            color={ESG_COLOR(risk.esg?.social)}
            sub="Labour, community, supply chain" />
          <StatCard label="Governance"
            value={na(risk.esg?.governance)}
            color={ESG_COLOR(risk.esg?.governance)}
            sub="Board, transparency, ethics" />
        </div>

        <div style={s.cards2}>
          <div style={s.card}>
            <div style={s.cardTitle}>PAI — Principal Adverse Impact</div>
            {risk.esg?.pai ? <>
              <PAIRow label="Carbon Footprint"  value={`${risk.esg.pai.carbon_footprint} tCO2e / £M`}  color="#f59e0b" />
              <PAIRow label="GHG Scope 1"       value={`${risk.esg.pai.ghg_scope1} MT CO2e`}           color="#f87171" />
              <PAIRow label="GHG Scope 2"       value={`${risk.esg.pai.ghg_scope2} MT CO2e`}           color="#f87171" />
              <PAIRow label="GHG Total"         value={`${risk.esg.pai.ghg_total} MT CO2e`}            color="#f87171" />
              <PAIRow label="Carbon Intensity"  value={`${risk.esg.pai.carbon_intensity} tCO2e / £M revenue`} color="#f59e0b" />
              <div style={{ marginTop: 12, fontSize: 11, color: "#475569" }}>
                Portfolio-weighted. Required under EU SFDR Article 8/9 reporting.
              </div>
            </> : <div style={{ color: "#64748b", fontSize: 13 }}>Loading...</div>}
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>ESG Radar</div>
            <ResponsiveContainer width="100%" height={200}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#1e293b" />
                <PolarAngleAxis dataKey="metric" tick={{ fill: "#64748b", fontSize: 11 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} />
                <Radar dataKey="value" stroke="#60a5fa" fill="#60a5fa" fillOpacity={0.25} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={s.card}>
          <div style={s.cardTitle}>Position ESG Breakdown</div>
          <table style={s.table}>
            <thead><tr style={s.thead}>
              {["Ticker","Weight","ESG Score","Rating","Environmental","Social","Governance","Controversy"].map(h => (
                <th key={h} style={s.th}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {(risk.esg?.positions || []).map(p => (
                <tr key={p.ticker} style={s.trow}>
                  <td style={s.td}><span style={s.dot(COLORS[p.ticker])} />{p.ticker}</td>
                  <td style={s.td}>{p.weight}%</td>
                  <td style={{...s.td, color: ESG_COLOR(p.esg_score), fontWeight: 600}}>{p.esg_score}</td>
                  <td style={{...s.td, color: ESG_COLOR(p.esg_score)}}>{p.esg_rating}</td>
                  <td style={{...s.td, color: ESG_COLOR(p.environmental)}}>{p.environmental}</td>
                  <td style={{...s.td, color: ESG_COLOR(p.social)}}>{p.social}</td>
                  <td style={{...s.td, color: ESG_COLOR(p.governance)}}>{p.governance}</td>
                  <td style={s.td}>{"★".repeat(p.controversy)}{"☆".repeat(5 - p.controversy)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>}

    </div>
  );
}

// --- Small components ---
function StatCard({ label, value, color, sub }) {
  return (
    <div style={s.statCard}>
      <div style={s.statLabel}>{label}</div>
      <div style={{ ...s.statValue, color: color || "#f1f5f9" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function PAIRow({ label, value, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #1e293b" }}>
      <span style={{ fontSize: 13, color: "#94a3b8" }}>{label}</span>
      <span style={{ fontSize: 13, color: color, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function InterpretRow({ label, meaning, color }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "6px 0", borderBottom: "1px solid #0f172a", alignItems: "center" }}>
      <span style={{ fontSize: 12, color, fontWeight: 600, minWidth: 120 }}>{label}</span>
      <span style={{ fontSize: 12, color: "#64748b" }}>{meaning}</span>
    </div>
  );
}

// --- Styles ---
const s = {
  page:      { background: "#020817", minHeight: "100vh", padding: "24px", fontFamily: "Inter, sans-serif", color: "#e2e8f0" },
  header:    { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" },
  title:     { fontSize: "22px", fontWeight: "700", color: "#f1f5f9" },
  sub:       { fontSize: "13px", color: "#64748b", marginTop: "2px" },
  pill:      (c) => ({ background: c ? "#052e16" : "#1c1917", color: c ? "#34d399" : "#78716c", border: `1px solid ${c ? "#166534" : "#44403c"}`, borderRadius: "999px", padding: "6px 14px", fontSize: "12px", fontWeight: "600" }),
  cards4:    { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "16px" },
  cards3:    { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "16px" },
  cards2:    { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px", marginBottom: "16px" },
  statCard:  { background: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", padding: "16px 20px" },
  statLabel: { fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" },
  statValue: { fontSize: "22px", fontWeight: "700", marginTop: "6px" },
  tabs:      { display: "flex", gap: "8px", marginBottom: "16px" },
  tab:       (active) => ({ background: active ? "#1e293b" : "transparent", color: active ? "#f1f5f9" : "#64748b", border: `1px solid ${active ? "#334155" : "#1e293b"}`, borderRadius: "8px", padding: "8px 20px", fontSize: "13px", fontWeight: active ? "600" : "400", cursor: "pointer" }),
  card:      { background: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", padding: "20px", marginBottom: "16px" },
  cardTitle: { fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "16px" },
  table:     { width: "100%", borderCollapse: "collapse" },
  thead:     { borderBottom: "1px solid #1e293b" },
  th:        { textAlign: "left", padding: "8px 12px", fontSize: "11px", color: "#64748b", fontWeight: "600" },
  trow:      { borderBottom: "1px solid #0f172a" },
  td:        { padding: "10px 12px", fontSize: "13px", color: "#cbd5e1", verticalAlign: "middle" },
  dot:       (c) => ({ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: c, marginRight: "8px" }),
  varRow:    { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 },
  varLabel:  { fontSize: 12, color: "#64748b", marginBottom: 6 },
  varValue:  { fontSize: 20, fontWeight: 700, color: "#f87171" },
  varSub:    { fontSize: 11, color: "#475569", marginTop: 4 },
  interpretRow: { display: "flex", flexDirection: "column", gap: 2 },
};