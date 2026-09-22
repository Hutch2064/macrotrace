import assert from "node:assert/strict";
import fredHandler from "../api/fred.js";
import marketHandler from "../api/market.js";
import searchHandler from "../api/search.js";

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

function createResponse() {
  let statusCode = 200;
  let body;
  let ended = false;
  const headers = new Map();
  const response = {
    setHeader(name, value) {
      headers.set(name, value);
      return response;
    },
    status(value) {
      statusCode = value;
      return response;
    },
    json(value) {
      body = value;
      return response;
    },
    end() {
      ended = true;
      return response;
    },
  };
  return {
    response,
    get status() {
      return statusCode;
    },
    get body() {
      return body;
    },
    get ended() {
      return ended;
    },
    headers,
  };
}

async function invoke(handler, { method = "GET", query = {} } = {}, fetchImpl) {
  const previousFetch = globalThis.fetch;
  const capture = createResponse();
  globalThis.fetch =
    fetchImpl ??
    (async () => {
      throw new Error(
        "Unexpected upstream request in deterministic API verification",
      );
    });
  try {
    await handler({ method, query }, capture.response);
    return capture;
  } finally {
    globalThis.fetch = previousFetch;
  }
}

function upstreamText(text, { ok = true, status = 200 } = {}) {
  return { ok, status, text: async () => text };
}

function upstreamJson(value, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => value };
}

function assertHeader(capture, name, value) {
  assert.equal(capture.headers.get(name), value, `${name} header mismatch`);
}

function assertNoFetch(calls) {
  assert.equal(
    calls.length,
    0,
    `expected no upstream requests, got ${calls.length}`,
  );
}

test("FRED handles CORS preflight, method restrictions, and invalid ids locally", async () => {
  const calls = [];
  const fetchImpl = async (...args) => {
    calls.push(args);
    throw new Error("invalid requests must not reach upstream");
  };

  const options = await invoke(fredHandler, { method: "OPTIONS" }, fetchImpl);
  assert.equal(options.status, 204);
  assert.equal(options.ended, true);
  assertHeader(options, "Access-Control-Allow-Origin", "*");

  const post = await invoke(
    fredHandler,
    { method: "POST", query: { id: "GDP" } },
    fetchImpl,
  );
  assert.equal(post.status, 405);
  assert.deepEqual(post.body, { error: "Method not allowed" });

  for (const id of ["", "bad id", "A".repeat(65), "CPI/US"]) {
    const invalid = await invoke(fredHandler, { query: { id } }, fetchImpl);
    assert.equal(invalid.status, 400);
    assert.deepEqual(invalid.body, { error: "Invalid FRED series" });
    assertHeader(invalid, "Access-Control-Allow-Origin", "*");
  }
  assertNoFetch(calls);
});

test("FRED parses metadata and ignores missing/non-numeric CSV observations", async () => {
  const calls = [];
  const fetchImpl = async (address, options) => {
    const url = String(address);
    calls.push({ url, options });
    assert.equal(options.headers["User-Agent"], "Mozilla/5.0 MacroTrace/1.0");
    assert.ok(options.signal);
    if (url.includes("/graph/fredgraph.csv")) {
      return upstreamText(
        [
          "observation_date,CPIAUCSL",
          "2024-01-01,1.25",
          "2024-02-01,.",
          "2024-03-01,-3",
          "2024-04-01,NaN",
          "2024-05-01, 2.5",
        ].join("\n"),
      );
    }
    return upstreamText(
      [
        "<title>Consumer Price &amp; Inflation (CPIAUCSL) | FRED</title>",
        '<span class="series-meta-value-units">Percent</span>',
        '<span class="series-meta-value-frequency">Monthly, Seasonally Adjusted</span>',
      ].join(""),
    );
  };

  const capture = await invoke(
    fredHandler,
    { query: { id: " cpiaucsl " } },
    fetchImpl,
  );
  assert.equal(capture.status, 200);
  assertHeader(capture, "Access-Control-Allow-Origin", "*");
  assertHeader(
    capture,
    "Cache-Control",
    "s-maxage=3600, stale-while-revalidate=86400",
  );
  assert.deepEqual(capture.body, {
    id: "CPIAUCSL",
    name: "Consumer Price & Inflation",
    category: "FRED search",
    unit: "%",
    frequency: "monthly",
    source: "Federal Reserve Bank of St. Louis (FRED)",
    sourceUrl: "https://fred.stlouisfed.org/series/CPIAUCSL",
    checkedAt: capture.body.checkedAt,
    observations: [
      ["2024-01-01", 1.25],
      ["2024-03-01", -3],
      ["2024-05-01", 2.5],
    ],
  });
  assert.match(capture.body.checkedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(calls.length, 2);
});

test("FRED fails closed on unavailable metadata, upstream status, and fetch errors", async () => {
  const metadataMissing = await invoke(
    fredHandler,
    { query: { id: "UNRATE" } },
    async (address) => {
      if (String(address).includes("/graph/"))
        return upstreamText("observation_date,UNRATE\n2024-01-01,3.7");
      return upstreamText("<title>Unemployment Rate (UNRATE) | FRED</title>");
    },
  );
  assert.equal(metadataMissing.status, 502);
  assert.deepEqual(metadataMissing.body, {
    error:
      "FRED metadata unavailable; retry shortly to avoid unverified units.",
  });

  for (const [status, expected] of [
    [404, 404],
    [500, 502],
  ]) {
    const capture = await invoke(
      fredHandler,
      { query: { id: "GDP" } },
      async (address) => {
        if (String(address).includes("/graph/"))
          return upstreamText("not found", { ok: false, status });
        return upstreamText(
          '<title>Gross Domestic Product (GDP) | FRED</title><span class="series-meta-value-units">Billions</span><span class="series-meta-value-frequency">Quarterly</span>',
        );
      },
    );
    assert.equal(capture.status, expected);
    assert.deepEqual(capture.body, { error: "FRED data unavailable" });
  }

  const failed = await invoke(
    fredHandler,
    { query: { id: "FEDFUNDS" } },
    async () => {
      const timeout = new Error("simulated timeout");
      timeout.name = "TimeoutError";
      throw timeout;
    },
  );
  assert.equal(failed.status, 502);
  assert.deepEqual(failed.body, { error: "FRED data unavailable" });
});

test("market handles CORS preflight, method restrictions, and symbol validation locally", async () => {
  const calls = [];
  const fetchImpl = async (...args) => {
    calls.push(args);
    throw new Error("invalid requests must not reach upstream");
  };

  const options = await invoke(marketHandler, { method: "OPTIONS" }, fetchImpl);
  assert.equal(options.status, 204);
  assert.equal(options.ended, true);
  assertHeader(options, "Access-Control-Allow-Origin", "*");
  assertHeader(options, "Access-Control-Allow-Methods", "GET, OPTIONS");

  const post = await invoke(
    marketHandler,
    { method: "POST", query: { symbol: "SPY" } },
    fetchImpl,
  );
  assert.equal(post.status, 405);
  assert.deepEqual(post.body, { error: "Method not allowed" });

  for (const symbol of ["", "bad symbol", "A".repeat(13), "A/B", "${HOME}"]) {
    const invalid = await invoke(
      marketHandler,
      { query: { symbol } },
      fetchImpl,
    );
    assert.equal(invalid.status, 400);
    assert.deepEqual(invalid.body, { error: "Invalid symbol" });
    assertHeader(invalid, "Access-Control-Allow-Origin", "*");
    assertHeader(invalid, "Access-Control-Allow-Methods", "GET, OPTIONS");
  }
  assertNoFetch(calls);
});

test("market maps adjusted close data, filters missing values, and sets cache headers", async () => {
  const calls = [];
  const fetchImpl = async (address, options) => {
    calls.push({ url: String(address), options });
    assert.match(
      String(address),
      /query1\.finance\.yahoo\.com\/v8\/finance\/chart\/SPY\?/,
    );
    assert.equal(options.headers["User-Agent"], "Mozilla/5.0 MacroTrace/1.0");
    assert.ok(options.signal);
    return upstreamJson({
      chart: {
        result: [
          {
            meta: { longName: "SPDR S&P 500 ETF Trust", currency: "USD" },
            timestamp: [1704067200, 1704153600, 1704240000],
            indicators: {
              adjclose: [{ adjclose: [100, null, 100.123456] }],
              quote: [{ close: [99, 98, 97] }],
            },
          },
        ],
      },
    });
  };

  const capture = await invoke(
    marketHandler,
    { query: { symbol: " spy " } },
    fetchImpl,
  );
  assert.equal(capture.status, 200);
  assertHeader(capture, "Access-Control-Allow-Origin", "*");
  assertHeader(capture, "Access-Control-Allow-Methods", "GET, OPTIONS");
  assertHeader(
    capture,
    "Cache-Control",
    "s-maxage=300, stale-while-revalidate=3600",
  );
  assert.deepEqual(capture.body, {
    id: "SPY",
    name: "SPDR S&P 500 ETF Trust",
    category: "Custom ticker",
    unit: "USD",
    frequency: "daily",
    kind: "market",
    checkedAt: capture.body.checkedAt,
    valueType: "adjusted_close",
    source: "Yahoo Finance",
    sourceUrl: "https://finance.yahoo.com/quote/SPY/history",
    observations: [
      ["2024-01-01", 100],
      ["2024-01-03", 100.1235],
    ],
  });
  assert.match(capture.body.checkedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(calls.length, 1);
});

test("market falls back to close data and reports upstream failures", async () => {
  const fallback = await invoke(
    marketHandler,
    { query: { symbol: "^VIX" } },
    async (address) => {
      assert.match(String(address), /chart\/\%5EVIX\?/);
      return upstreamJson({
        chart: {
          result: [
            {
              meta: { shortName: "CBOE Volatility Index" },
              timestamp: [1704067200, 1704153600],
              indicators: { quote: [{ close: [12.34567, null] }] },
            },
          ],
        },
      });
    },
  );
  assert.equal(fallback.status, 200);
  assert.equal(fallback.body.name, "CBOE Volatility Index");
  assert.equal(fallback.body.unit, "%");
  assert.equal(fallback.body.valueType, "unadjusted_close");
  assert.deepEqual(fallback.body.observations, [["2024-01-01", 12.3457]]);

  const noTicker = await invoke(
    marketHandler,
    { query: { symbol: "MISSING" } },
    async () => upstreamJson({ chart: { result: [] } }),
  );
  assert.equal(noTicker.status, 404);
  assert.deepEqual(noTicker.body, { error: "Ticker not found" });

  for (const [status, expected] of [
    [404, 404],
    [429, 502],
  ]) {
    const capture = await invoke(
      marketHandler,
      { query: { symbol: "SPY" } },
      async () => upstreamJson({}, { ok: false, status }),
    );
    assert.equal(capture.status, expected);
    assert.deepEqual(capture.body, { error: "Market data unavailable" });
  }

  const malformed = await invoke(
    marketHandler,
    { query: { symbol: "SPY" } },
    async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("invalid JSON");
      },
    }),
  );
  assert.equal(malformed.status, 502);
  assert.deepEqual(malformed.body, { error: "Market data unavailable" });

  const timeout = await invoke(
    marketHandler,
    { query: { symbol: "SPY" } },
    async () => {
      const error = new Error("simulated timeout");
      error.name = "TimeoutError";
      throw error;
    },
  );
  assert.equal(timeout.status, 502);
  assert.deepEqual(timeout.body, { error: "Market data unavailable" });
});

test("search handles preflight, method restrictions, and bounded empty queries", async () => {
  const calls = [];
  const fetchImpl = async (...args) => {
    calls.push(args);
    throw new Error("empty or invalid queries must not reach upstream");
  };

  const options = await invoke(searchHandler, { method: "OPTIONS" }, fetchImpl);
  assert.equal(options.status, 204);
  assert.equal(options.ended, true);
  assertHeader(options, "Access-Control-Allow-Origin", "*");

  const post = await invoke(
    searchHandler,
    { method: "POST", query: { q: "GDP" } },
    fetchImpl,
  );
  assert.equal(post.status, 405);
  assert.deepEqual(post.body, { error: "Method not allowed" });

  for (const q of ["", "   ", "x".repeat(81)]) {
    const empty = await invoke(searchHandler, { query: { q } }, fetchImpl);
    assert.equal(empty.status, 200);
    assert.deepEqual(empty.body, { results: [] });
    assertHeader(empty, "Access-Control-Allow-Origin", "*");
    assert.equal(empty.headers.has("Cache-Control"), false);
  }
  assertNoFetch(calls);
});

test("market rejects an all-missing history instead of returning a broken series", async () => {
  const capture = await invoke(
    marketHandler,
    { query: { symbol: "EMPTY" } },
    async () =>
      upstreamJson({
        chart: {
          result: [
            {
              meta: {},
              timestamp: [1704067200],
              indicators: { quote: [{ close: [null] }] },
            },
          ],
        },
      }),
  );
  assert.equal(capture.status, 404);
  assert.deepEqual(capture.body, { error: "No usable price observations" });
});

test("search combines bundled and upstream results, filters types, deduplicates, and caches", async () => {
  const query = "api-contract-unique-query";
  const calls = [];
  const fetchImpl = async (address, options) => {
    const url = String(address);
    calls.push({ url, options });
    assert.ok(options.signal);
    if (url.includes("query1.finance.yahoo.com/v1/finance/search")) {
      assert.equal(new URL(url).searchParams.get("q"), query);
      assert.equal(options.headers.accept, "application/json");
      return upstreamJson({
        quotes: [
          {
            symbol: "TEST",
            quoteType: "EQUITY",
            longname: "Test Corp",
            exchange: "NASDAQ",
          },
          { symbol: "DROP", quoteType: "WARRANT", longname: "Dropped Warrant" },
          { symbol: "TEST", quoteType: "EQUITY", longname: "Duplicate Test" },
        ],
      });
    }
    assert.match(url, /fred\.stlouisfed\.org\/searchresults\?/);
    assert.equal(new URL(url).searchParams.get("st"), query);
    return upstreamText(
      [
        '<a href="/series/FREDTEST" aria-label="Test &amp; Series" class="series-title">Test</a>',
        '<span class="search-result-meta"><b>Monthly</b></span>',
      ].join(""),
    );
  };

  const first = await invoke(searchHandler, { query: { q: query } }, fetchImpl);
  assert.equal(first.status, 200);
  assertHeader(first, "Access-Control-Allow-Origin", "*");
  assertHeader(
    first,
    "Cache-Control",
    "s-maxage=900, stale-while-revalidate=86400",
  );
  assert.deepEqual(first.body, {
    results: [
      {
        id: "TEST",
        name: "Test Corp",
        kind: "market",
        source: "Yahoo Finance",
        meta: "EQUITY · NASDAQ",
      },
      {
        id: "FREDTEST",
        name: "Test & Series",
        kind: "fred",
        source: "FRED",
        bundled: false,
        meta: "Monthly",
      },
    ],
  });
  assert.equal(calls.length, 2);

  const cached = await invoke(
    searchHandler,
    { query: { q: query.toUpperCase() } },
    async () => {
      throw new Error("cached search must not reach upstream");
    },
  );
  assert.deepEqual(cached.body, first.body);
  assert.equal(cached.status, 200);
  assertHeader(
    cached,
    "Cache-Control",
    "s-maxage=900, stale-while-revalidate=86400",
  );
});

test("search degrades gracefully when all upstream providers fail", async () => {
  const capture = await invoke(
    searchHandler,
    { query: { q: "provider-failure-unique-query" } },
    async () => {
      throw new Error("simulated provider timeout");
    },
  );
  assert.equal(capture.status, 502);
  assert.deepEqual(capture.body, { results: [] });
  assertHeader(capture, "Access-Control-Allow-Origin", "*");
  assertHeader(capture, "Cache-Control", "no-store");
});

test("invoke always restores the caller's fetch implementation", async () => {
  const sentinel = globalThis.fetch;
  const capture = await invoke(fredHandler, { method: "OPTIONS" }, async () => {
    throw new Error("must not be called");
  });
  assert.equal(capture.status, 204);
  assert.equal(globalThis.fetch, sentinel);
});

let passed = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

if (process.exitCode) {
  console.error(
    `API verification failed: ${tests.length - passed}/${tests.length} tests failed.`,
  );
} else {
  console.log(
    `API verification passed: ${passed} deterministic endpoint tests.`,
  );
}
