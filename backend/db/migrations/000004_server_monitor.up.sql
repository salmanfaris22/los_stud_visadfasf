-- Server monitor: per-minute API timings, one machine sample per minute and the slow / failed
-- requests. Written by the API itself (internal/service/server.go); rows older than 30 days are
-- deleted every hour.

-- One row per API process, minute and endpoint. Several processes may write the same minute,
-- so readers always SUM.
CREATE TABLE server_request_stats (
    id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    minute    timestamptz NOT NULL,
    procedure text NOT NULL,
    count     int NOT NULL,
    err_4xx   int NOT NULL DEFAULT 0,
    err_5xx   int NOT NULL DEFAULT 0,
    sum_ms    double precision NOT NULL,
    max_ms    double precision NOT NULL,
    -- latency histogram, bucket upper bounds in ms: 5 10 25 50 100 250 500 1000 2500 5000 +inf
    buckets   int[] NOT NULL
);
CREATE INDEX server_request_stats_minute_idx ON server_request_stats (minute);

-- One row per API process per minute: the machine, the Go process and the database.
CREATE TABLE server_samples (
    at           timestamptz NOT NULL,
    host         text NOT NULL,
    cpu_pct      real NOT NULL,
    load1        real NOT NULL,
    mem_total    bigint NOT NULL,
    mem_used     bigint NOT NULL,
    swap_total   bigint NOT NULL,
    swap_used    bigint NOT NULL,
    disk_total   bigint NOT NULL,
    disk_used    bigint NOT NULL,
    net_rx       bigint NOT NULL, -- bytes per second, averaged over the minute
    net_tx       bigint NOT NULL,
    proc_rss     bigint NOT NULL,
    go_heap      bigint NOT NULL,
    goroutines   int NOT NULL,
    open_streams int NOT NULL,
    online_users int NOT NULL,
    db_size      bigint NOT NULL,
    db_conns     int NOT NULL,
    PRIMARY KEY (at, host)
);

-- Requests that took 1 s or more, or failed with a 5xx.
CREATE TABLE server_slow_requests (
    id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    at        timestamptz NOT NULL,
    procedure text NOT NULL,
    status    int NOT NULL,
    code      text NOT NULL DEFAULT '',
    ms        double precision NOT NULL,
    user_id   uuid REFERENCES users (id) ON DELETE SET NULL,
    ip        text NOT NULL DEFAULT ''
);
CREATE INDEX server_slow_requests_at_idx ON server_slow_requests (at DESC);
