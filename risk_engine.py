import numpy as np
from collections import deque

# --- Static ESG & PAI data (simulated from MSCI/Sustainalytics style scores) ---
ESG_DATA = {
    "AAPL": {
        "esg_score":          72,
        "esg_rating":         "AA",
        "environmental":      68,
        "social":             75,
        "governance":         73,
        "carbon_footprint":   8.2,    # tCO2e per £M invested
        "ghg_scope1":         0.05,   # MT CO2e
        "ghg_scope2":         0.12,
        "carbon_intensity":   4.1,    # tCO2e per £M revenue
        "controversy_score":  2,      # 0-5, lower is better
    },
    "MSFT": {
        "esg_score":          78,
        "esg_rating":         "AAA",
        "environmental":      82,
        "social":             76,
        "governance":         76,
        "carbon_footprint":   5.1,
        "ghg_scope1":         0.02,
        "ghg_scope2":         0.08,
        "carbon_intensity":   2.8,
        "controversy_score":  1,
    },
    "GOOGL": {
        "esg_score":          68,
        "esg_rating":         "AA",
        "environmental":      74,
        "social":             65,
        "governance":         65,
        "carbon_footprint":   9.4,
        "ghg_scope1":         0.04,
        "ghg_scope2":         0.15,
        "carbon_intensity":   5.2,
        "controversy_score":  3,
    },
    "JPM": {
        "esg_score":          55,
        "esg_rating":         "A",
        "environmental":      48,
        "social":             58,
        "governance":         59,
        "carbon_footprint":   18.7,
        "ghg_scope1":         0.08,
        "ghg_scope2":         0.21,
        "carbon_intensity":   12.4,
        "controversy_score":  3,
    },
    "BLK": {
        "esg_score":          61,
        "esg_rating":         "A",
        "environmental":      55,
        "social":             63,
        "governance":         65,
        "carbon_footprint":   14.2,
        "ghg_scope1":         0.03,
        "ghg_scope2":         0.09,
        "carbon_intensity":   8.6,
        "controversy_score":  2,
    },
}

RISK_FREE_RATE = 0.05  # 5% annualised (approx UK base rate)
TRADING_DAYS   = 252


class RiskEngine:
    def __init__(self, window: int = 100):
        # Rolling window of portfolio returns
        self.returns_window = deque(maxlen=window)
        self.value_window   = deque(maxlen=window)
        self.peak_value     = 0.0

    def update(self, total_value: float):
        """Call this on every new valuation tick."""
        if self.value_window:
            prev = self.value_window[-1]
            if prev > 0:
                ret = (total_value - prev) / prev
                self.returns_window.append(ret)

        self.value_window.append(total_value)

        if total_value > self.peak_value:
            self.peak_value = total_value

    # ------------------------------------------------------------------ #
    #  SHARPE RATIO                                                        #
    # ------------------------------------------------------------------ #
    def sharpe_ratio(self) -> float | None:
        if len(self.returns_window) < 10:
            return None
        rets  = np.array(self.returns_window)
        mean  = np.mean(rets) * TRADING_DAYS
        std   = np.std(rets)  * np.sqrt(TRADING_DAYS)
        if std == 0:
            return None
        return round((mean - RISK_FREE_RATE) / std, 3)

    # ------------------------------------------------------------------ #
    #  SORTINO RATIO                                                       #
    # ------------------------------------------------------------------ #
    def sortino_ratio(self) -> float | None:
        if len(self.returns_window) < 10:
            return None
        rets          = np.array(self.returns_window)
        mean          = np.mean(rets) * TRADING_DAYS
        downside_rets = rets[rets < 0]
        if len(downside_rets) == 0:
            return None
        downside_std  = np.std(downside_rets) * np.sqrt(TRADING_DAYS)
        if downside_std == 0:
            return None
        return round((mean - RISK_FREE_RATE) / downside_std, 3)

    # ------------------------------------------------------------------ #
    #  MAXIMUM DRAWDOWN                                                    #
    # ------------------------------------------------------------------ #
    def max_drawdown(self) -> float | None:
        if len(self.value_window) < 2:
            return None
        values   = np.array(self.value_window)
        peak     = np.maximum.accumulate(values)
        drawdown = (values - peak) / peak
        return round(float(np.min(drawdown)) * 100, 2)  # as percentage

    def current_drawdown(self) -> float:
        if not self.value_window or self.peak_value == 0:
            return 0.0
        current = self.value_window[-1]
        return round(((current - self.peak_value) / self.peak_value) * 100, 2)

    # ------------------------------------------------------------------ #
    #  VALUE AT RISK  (parametric, 95% and 99% confidence)                #
    # ------------------------------------------------------------------ #
    def value_at_risk(self, portfolio_value: float) -> dict | None:
        if len(self.returns_window) < 10:
            return None
        rets     = np.array(self.returns_window)
        daily_vol = np.std(rets)

        var_95 = portfolio_value * 1.645 * daily_vol
        var_99 = portfolio_value * 2.326 * daily_vol

        # Historical VaR — just take the 5th percentile of actual returns
        hist_var_95 = abs(float(np.percentile(rets, 5))) * portfolio_value

        return {
            "var_95_parametric":  round(var_95, 2),
            "var_99_parametric":  round(var_99, 2),
            "var_95_historical":  round(hist_var_95, 2),
            "confidence_95":      "5% chance of losing more than this in one day",
            "confidence_99":      "1% chance of losing more than this in one day",
        }

    # ------------------------------------------------------------------ #
    #  ESG METRICS  (portfolio-weighted)                                  #
    # ------------------------------------------------------------------ #
    def esg_metrics(self, positions: list) -> dict:
        total_value = sum(p["value"] for p in positions)
        if total_value == 0:
            return {}

        weighted_esg   = 0.0
        weighted_env   = 0.0
        weighted_soc   = 0.0
        weighted_gov   = 0.0
        total_carbon   = 0.0
        total_ghg_s1   = 0.0
        total_ghg_s2   = 0.0
        total_intensity = 0.0
        position_esg   = []

        for p in positions:
            ticker = p["ticker"]
            weight = p["value"] / total_value
            esg    = ESG_DATA.get(ticker, {})

            weighted_esg    += weight * esg.get("esg_score",      0)
            weighted_env    += weight * esg.get("environmental",   0)
            weighted_soc    += weight * esg.get("social",          0)
            weighted_gov    += weight * esg.get("governance",      0)
            total_carbon    += weight * esg.get("carbon_footprint", 0)
            total_ghg_s1    += weight * esg.get("ghg_scope1",      0)
            total_ghg_s2    += weight * esg.get("ghg_scope2",      0)
            total_intensity += weight * esg.get("carbon_intensity", 0)

            position_esg.append({
                "ticker":        ticker,
                "weight":        round(weight * 100, 1),
                "esg_score":     esg.get("esg_score",     "N/A"),
                "esg_rating":    esg.get("esg_rating",    "N/A"),
                "environmental": esg.get("environmental", "N/A"),
                "social":        esg.get("social",        "N/A"),
                "governance":    esg.get("governance",    "N/A"),
                "controversy":   esg.get("controversy_score", "N/A"),
            })

        # Overall portfolio rating based on weighted score
        def score_to_rating(score):
            if score >= 75: return "AAA"
            if score >= 65: return "AA"
            if score >= 55: return "A"
            if score >= 45: return "BBB"
            return "BB"

        return {
            "portfolio_esg_score": round(weighted_esg, 1),
            "portfolio_rating":    score_to_rating(weighted_esg),
            "environmental":       round(weighted_env, 1),
            "social":              round(weighted_soc, 1),
            "governance":          round(weighted_gov, 1),
            "positions":           position_esg,
            "pai": {
                "carbon_footprint":   round(total_carbon, 2),
                "ghg_scope1":         round(total_ghg_s1, 4),
                "ghg_scope2":         round(total_ghg_s2, 4),
                "ghg_total":          round(total_ghg_s1 + total_ghg_s2, 4),
                "carbon_intensity":   round(total_intensity, 2),
                "unit_carbon":        "tCO2e per £M invested",
                "unit_ghg":           "MT CO2e (portfolio-weighted)",
            }
        }

    # ------------------------------------------------------------------ #
    #  FULL RISK REPORT                                                    #
    # ------------------------------------------------------------------ #
    def full_report(self, portfolio_value: float, positions: list) -> dict:
        self.update(portfolio_value)
        return {
            "sharpe":    self.sharpe_ratio(),
            "sortino":   self.sortino_ratio(),
            "drawdown": {
                "max":     self.max_drawdown(),
                "current": self.current_drawdown(),
            },
            "var":  self.value_at_risk(portfolio_value),
            "esg":  self.esg_metrics(positions),
        }