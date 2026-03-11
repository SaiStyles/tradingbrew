# 06 — API Contracts

## Base URL
```
Development: http://localhost:3001/api
Production:  https://api.tradingbrew.com/api
```

## Authentication
All routes require Bearer token unless marked PUBLIC.
```
Authorization: Bearer <supabase_jwt_token>
```

---

## Auth Routes

### POST /auth/register (PUBLIC)
```json
Request:
{
  "email": "trader@email.com",
  "password": "securepassword",
  "name": "John"
}

Response 201:
{
  "user": { "id": "uuid", "email": "...", "name": "..." },
  "token": "jwt_token"
}
```

### POST /auth/login (PUBLIC)
```json
Request:
{
  "email": "trader@email.com",
  "password": "securepassword"
}

Response 200:
{
  "user": { "id": "uuid", "email": "...", "name": "..." },
  "token": "jwt_token"
}
```

---

## Trade Routes

### POST /trades
```json
Request:
{
  "instrument": "NQ",
  "direction": "long",
  "entry_price": 19840,
  "exit_price": 19780,
  "stop_loss": 19800,
  "pnl": -240,
  "position_size": 1,
  "opened_at": "2024-01-15T09:42:00Z",
  "closed_at": "2024-01-15T09:58:00Z",
  "emotion_tag": "hesitant",
  "execution_score": 7,
  "followed_plan": true,
  "notes": "Optional text note"
}

Response 201:
{
  "trade": { ...full trade object },
  "violations": [],
  "buddy_response": "You just closed NQ for -$240..."
}
```

### GET /trades
```json
Query params: ?limit=20&offset=0&instrument=NQ&from=date&to=date

Response 200:
{
  "trades": [...],
  "total": 150,
  "page": 1
}
```

### GET /trades/:id
```json
Response 200:
{
  "trade": { ...full trade with screenshots, emotions }
}
```

---

## Buddy Routes

### POST /buddy/message
```json
Request:
{
  "message": "Just took a loss on NQ",
  "type": "text" | "voice_transcript",
  "context": "post_trade" | "general" | "pre_trade"
}

Response 200:
{
  "reply": "How are you feeling after that trade?",
  "action": null | "log_trade" | "check_rules" | "alert",
  "data": {}
}
```

### POST /buddy/morning-checkin
```json
Response 200:
{
  "briefing": "Good morning! Here's your day...",
  "news_events": [...],
  "focus_point": "Watch your trade limit today",
  "yesterday_summary": "..."
}
```

### POST /buddy/debrief
```json
Response 200:
{
  "debrief": "Today you took 4 trades...",
  "stats": { "trades": 4, "pnl": 240, "violations": 0 },
  "tomorrow_focus": "Wait for confirmation before entry"
}
```

---

## Rules Routes

### GET /rules
```json
Response 200:
{
  "rules": [
    { "id": "uuid", "rule_type": "max_trades_day", "value": 5, "is_active": true }
  ]
}
```

### POST /rules
```json
Request:
{
  "rule_type": "max_trades_day" | "max_risk_trade" | "max_daily_loss" | "allowed_sessions",
  "value": 5
}

Response 201:
{
  "rule": { ...rule object }
}
```

### DELETE /rules/:id
```json
Response 200:
{
  "message": "Rule deleted"
}
```

---

## News Routes

### GET /news/upcoming
```json
Response 200:
{
  "events": [
    {
      "title": "CPI",
      "impact": "high",
      "scheduled_at": "2024-01-15T13:30:00Z",
      "forecast": "3.2%",
      "previous": "3.4%"
    }
  ]
}
```

---

## Performance Routes

### GET /performance/summary
```json
Query: ?period=week|month|all

Response 200:
{
  "total_trades": 47,
  "win_rate": 62.5,
  "total_pnl": 2400,
  "best_instrument": "NQ",
  "worst_session": "friday_afternoon",
  "violations": 3,
  "execution_avg": 7.2,
  "streak": 5
}
```

---

## Screenshot Routes

### POST /screenshots/capture
```json
Request:
{
  "trade_id": "uuid",
  "timeframes": ["1m", "5m", "15m"]
}

Response 200:
{
  "screenshots": [
    { "timeframe": "1m", "url": "https://..." },
    { "timeframe": "5m", "url": "https://..." }
  ]
}
```

---

## Prop Firm Routes

### POST /propfirm
```json
Request:
{
  "firm_name": "Apex",
  "account_size": 50000,
  "trailing_drawdown": 2500,
  "daily_loss_limit": 1000,
  "max_trades_day": 10
}

Response 201:
{
  "account": { ...account object }
}
```

### GET /propfirm/status
```json
Response 200:
{
  "account": { ...account },
  "current_drawdown": 800,
  "drawdown_percentage": 32,
  "daily_loss_today": 240,
  "status": "safe" | "warning" | "critical"
}
```
