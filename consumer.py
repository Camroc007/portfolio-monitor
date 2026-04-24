import json
from kafka import KafkaConsumer

# Our portfolio — how many shares we hold of each stock
PORTFOLIO = {
    "AAPL":  50,
    "MSFT":  30,
    "GOOGL": 20,
    "JPM":   75,
    "BLK":   10,
}

# We'll track the latest price of each asset here
latest_prices = {ticker: 0.0 for ticker in PORTFOLIO}

def calculate_portfolio_value():
    total = 0.0
    print("\n📊 Portfolio Valuation:")
    print("-" * 35)
    for ticker, shares in PORTFOLIO.items():
        price = latest_prices[ticker]
        position_value = round(price * shares, 2)
        total += position_value
        print(f"  {ticker:<6} {shares} shares @ £{price:<8} = £{position_value:>10,.2f}")
    print("-" * 35)
    print(f"  {'TOTAL':<6}                       £{total:>10,.2f}")
    print()
    return total

# Connect to Kafka and subscribe to the price-updates topic
consumer = KafkaConsumer(
    "price-updates",
    bootstrap_servers="localhost:9092",
    value_deserializer=lambda m: json.loads(m.decode("utf-8")),
    auto_offset_reset="latest",  # only read new messages, not old ones
    group_id="valuation-engine"  # identifies this consumer group
)

print("✅ Valuation engine started, waiting for price updates...\n")

for message in consumer:
    event = message.value
    ticker = event["ticker"]
    price = event["price"]

    # Update our price tracker
    latest_prices[ticker] = price

    # Only calculate a full valuation once we have prices for all assets
    if all(p > 0 for p in latest_prices.values()):
        calculate_portfolio_value()