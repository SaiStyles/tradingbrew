# 05 — Database Schema

## Tables

### users
```sql
id              uuid PRIMARY KEY
email           text UNIQUE NOT NULL
name            text
buddy_name      text DEFAULT 'Brew'
created_at      timestamp
last_active     timestamp
subscription    text DEFAULT 'free'
timezone        text
trading_style   text
experience      text
```

### trades
```sql
id              uuid PRIMARY KEY
user_id         uuid REFERENCES users(id)
instrument      text
direction       text (long/short)
entry_price     decimal
exit_price      decimal
stop_loss       decimal
take_profit     decimal
pnl             decimal
position_size   decimal
session         text (london/ny/asia)
opened_at       timestamp
closed_at       timestamp
duration_mins   integer
emotion_tag     text
execution_score integer (1-10)
followed_plan   boolean
notes           text
voice_note_url  text
created_at      timestamp
```

### screenshots
```sql
id              uuid PRIMARY KEY
trade_id        uuid REFERENCES trades(id)
timeframe       text (1m/5m/15m/1h etc)
url             text
captured_at     timestamp
```

### rules
```sql
id              uuid PRIMARY KEY
user_id         uuid REFERENCES users(id)
rule_type       text
value           decimal
is_active       boolean DEFAULT true
created_at      timestamp
```

### rule_violations
```sql
id              uuid PRIMARY KEY
user_id         uuid REFERENCES users(id)
rule_id         uuid REFERENCES rules(id)
trade_id        uuid REFERENCES trades(id)
description     text
violated_at     timestamp
```

### prop_firm_accounts
```sql
id              uuid PRIMARY KEY
user_id         uuid REFERENCES users(id)
firm_name       text
account_size    decimal
trailing_drawdown decimal
daily_loss_limit  decimal
max_trades_day    integer
current_balance   decimal
is_active         boolean
created_at        timestamp
```

### emotions
```sql
id              uuid PRIMARY KEY
trade_id        uuid REFERENCES trades(id)
user_id         uuid REFERENCES users(id)
emotion         text
confidence      decimal
source          text (ai_inferred/user_confirmed)
created_at      timestamp
```

### goals
```sql
id              uuid PRIMARY KEY
user_id         uuid REFERENCES users(id)
week_start      date
goal_text       text
goal_type       text (process/behaviour)
is_completed    boolean DEFAULT false
created_at      timestamp
```

### streaks
```sql
id              uuid PRIMARY KEY
user_id         uuid REFERENCES users(id)
streak_type     text
current_count   integer DEFAULT 0
best_count      integer DEFAULT 0
last_updated    date
```

### milestones
```sql
id              uuid PRIMARY KEY
user_id         uuid REFERENCES users(id)
milestone_type  text
achieved_at     timestamp
acknowledged    boolean DEFAULT false
```

### memories
```sql
id              uuid PRIMARY KEY
user_id         uuid REFERENCES users(id)
content         text
category        text (personal/trading/psychology/goals)
embedding       vector(1536)
created_at      timestamp
last_accessed   timestamp
```

### news_events
```sql
id              uuid PRIMARY KEY
title           text
impact          text (high/medium/low)
currency        text
scheduled_at    timestamp
actual          text
forecast        text
previous        text
```

### content_feed
```sql
id              uuid PRIMARY KEY
source          text (twitter/x)
content         text
category        text (story/feud/achievement/market)
url             text
fetched_at      timestamp
```

### sessions
```sql
id              uuid PRIMARY KEY
user_id         uuid REFERENCES users(id)
started_at      timestamp
ended_at        timestamp
total_trades    integer
pnl             decimal
violations      integer
mood_start      text
mood_end        text
debrief_given   boolean DEFAULT false
```
