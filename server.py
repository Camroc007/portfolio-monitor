import json
import asyncio
import sqlite3
import threading
import time
import random
import os
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from risk_engine import RiskEngine

# --- Portfolio config ---
PORTFOLIO = {
    "AAPL":  {"shares": 50,  "purchase_price": 175.00},
    "MSFT":  {"shares": 30,  "purchase_price": 380.00},
    "GOOGL": {"shares": 20,  "purchase_price": 160.00},
    "JPM":   {"shares": 75,  "purchase_price": 185.00},
    "BLK":   {"shares": 10,  "purchase_price": 790.00},
}

# Base prices the simulator moves around
BASE_PRICES = {
    "AAPL":  189.50,
    "MSFT":  415.20,
    "GOOGL": 175.80,
    "JPM":   198.30,
    "BLK":   820.00,
}

BENCHMARK_VALUE = sum(
    v["shares"] * v["purchase_price"] for v in PORTFOLIO.values()
)

latest_prices = {ticker: base for ticker, base in BASE_PRICES.items()}
risk_engine   = RiskEngine(window=100)

# --- Database setup ---
def init_db():
    conn   = sqlite3.connect("portfolio.db")
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS valuations (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp   REAL,
            total_value REAL,
            total_pnl   REAL,
            pnl_pct     REAL
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS price_events (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp      REAL,
            ticker         TEXT,
            price          REAL,
            purchase_price REAL,
            position_pnl   REAL
        )
    """)
    conn.commit()
    conn.close()
    print("✅ Database initialised")

def save_to_db(valuation: dict):
    conn   = sqlite3.connect("portfolio.db")
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO valuations (timestamp, total_value, total_pnl, pnl_pct)
        VALUES (?, ?, ?, ?)
    """, (
        valuation["timestamp"],
        valuation["total"],
        valuation["total_pnl"],
        valuation["pnl_pct"]
    ))
    for p in valuation["positions"]:
        cursor.execute("""
            INSERT INTO price_events
            (timestamp, ticker, price, purchase_price, position_pnl)
            VALUES (?, ?, ?, ?, ?)
        """, (
            valuation["timestamp"],
            p["ticker"],
            p["price"],
            p["purchase_price"],
            p["pnl"]
        ))
    conn.commit()
    conn.close()

# --- Valuation engine ---
def calculate_valuation():
    positions   = []
    total_value = 0.0
    total_cost  = 0.0

    for ticker, config in PORTFOLIO.items():
        price          = latest_prices[ticker]
        shares         = config["shares"]
        purchase_price = config["purchase_price"]
        current_value  = round(price * shares, 2)
        cost_basis     = round(purchase_price * shares, 2)
        pnl            = round(current_value - cost_basis, 2)
        pnl_pct        = round((pnl / cost_basis) * 100, 2) if cost_basis > 0 else 0

        total_value += current_value
        total_cost  += cost_basis

        positions.append({
            "ticker":         ticker,
            "shares":         shares,
            "price":          price,
            "purchase_price": purchase_price,
            "value":          current_value,
            "cost_basis":     cost_basis,
            "pnl":            pnl,
            "pnl_pct":        pnl_pct,
        })

    total_pnl    = round(total_value - total_cost, 2)
    pnl_pct      = round((total_pnl / total_cost) * 100, 2) if total_cost > 0 else 0
    vs_benchmark = round(total_value - BENCHMARK_VALUE, 2)

    return {
        "positions":    positions,
        "total":        round(total_value, 2),
        "total_pnl":    total_pnl,
        "pnl_pct":      pnl_pct,
        "benchmark":    round(BENCHMARK_VALUE, 2),
        "vs_benchmark": vs_benchmark,
        "timestamp":    time.time(),
    }

# --- FastAPI ---
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://portfolio-monitor-alpha.vercel.app/"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

connected_clients: list[WebSocket] = []

async def broadcast(payload: str):
    disconnected = []
    for client in connected_clients:
        try:
            await client.send_text(payload)
        except:
            disconnected.append(client)
    for c in disconnected:
        connected_clients.remove(c)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    connected_clients.append(websocket)
    print(f"🔌 Client connected. Total: {len(connected_clients)}")
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        connected_clients.remove(websocket)
        print(f"❌ Client disconnected. Total: {len(connected_clients)}")

@app.get("/history")
def get_history(limit: int = 50):
    conn   = sqlite3.connect("portfolio.db")
    cursor = conn.cursor()
    cursor.execute("""
        SELECT timestamp, total_value, total_pnl, pnl_pct
        FROM valuations
        ORDER BY timestamp DESC
        LIMIT ?
    """, (limit,))
    rows = cursor.fetchall()
    conn.close()
    return [
        {"timestamp": r[0], "total": r[1], "pnl": r[2], "pnl_pct": r[3]}
        for r in reversed(rows)
    ]

@app.get("/")
def root():
    return {"status": "Portfolio Monitor running"}

# --- Internal price simulator (replaces Kafka producer) ---
async def price_simulator():
    """Simulates a market data feed internally — same logic as producer.py"""
    print("🚀 Internal price simulator started...")
    while True:
        for ticker in BASE_PRICES:
            change_pct            = random.uniform(-0.005, 0.005)
            latest_prices[ticker] = round(BASE_PRICES[ticker] * (1 + change_pct), 2)

        valuation         = calculate_valuation()
        risk              = risk_engine.full_report(valuation["total"], valuation["positions"])
        valuation["risk"] = risk

        save_to_db(valuation)

        await broadcast(json.dumps(valuation))

        await asyncio.sleep(2)

# --- Startup ---
@app.on_event("startup")
async def startup_event():
    init_db()
    asyncio.create_task(price_simulator())
    print("🚀 Server started")