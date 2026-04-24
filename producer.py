import json
import time
import random
from kafka import KafkaProducer

# Base price = current market price simulation
# Purchase price = what we "bought" them at (for P&L calculation)
ASSETS = {
    "AAPL":  {"base": 189.50, "purchase_price": 175.00},
    "MSFT":  {"base": 415.20, "purchase_price": 380.00},
    "GOOGL": {"base": 175.80, "purchase_price": 160.00},
    "JPM":   {"base": 198.30, "purchase_price": 185.00},
    "BLK":   {"base": 820.00, "purchase_price": 790.00},
}

producer = KafkaProducer(
    bootstrap_servers="localhost:9092",
    value_serializer=lambda v: json.dumps(v).encode("utf-8")
)

print("🚀 Market data producer started...")

while True:
    for ticker, data in ASSETS.items():
        change_pct = random.uniform(-0.005, 0.005)
        new_price = round(data["base"] * (1 + change_pct), 2)

        event = {
            "ticker": ticker,
            "price": new_price,
            "purchase_price": data["purchase_price"],
            "timestamp": time.time()
        }

        producer.send("price-updates", event)
        print(f"  → Sent: {ticker} @ £{new_price}")

    time.sleep(2)