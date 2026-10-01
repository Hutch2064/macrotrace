import assert from "node:assert/strict";
import {
  fetchEurostatMacro,
  parseJsonStat,
} from "../scripts/eurostat-macro.mjs";

const fixture = {
  version: "2.0",
  class: "dataset",
  label: "Fixture GDP",
  updated: "2026-09-30T11:00:00+0200",
  id: ["freq", "unit", "s_adj", "na_item", "geo", "time"],
  size: [1, 2, 1, 2, 1, 3],
  dimension: {
    freq: { category: { index: { Q: 0 }, label: { Q: "Quarterly" } } },
    unit: {
      category: {
        index: { CLV20_MEUR: 0, CON_PPCH_PRE: 1 },
        label: {
          CLV20_MEUR: "Chain linked volumes (2020), million euro",
          CON_PPCH_PRE:
            "Contribution to GDP growth, percentage point change on previous period",
        },
      },
    },
    s_adj: {
      category: {
        index: { SCA: 0 },
        label: { SCA: "Seasonally and calendar adjusted data" },
      },
    },
    na_item: {
      category: {
        index: { B1GQ: 0, P3: 1 },
        label: {
          B1GQ: "Gross domestic product at market prices",
          P3: "Final consumption expenditure",
        },
      },
    },
    geo: { category: { index: { DE: 0 }, label: { DE: "Germany" } } },
    time: {
      category: {
        index: { "2025-Q4": 0, "2026-Q1": 1, "2026-Q2": 2 },
        label: {
          "2025-Q4": "2025-Q4",
          "2026-Q1": "2026-Q1",
          "2026-Q2": "2026-Q2",
        },
      },
    },
  },
  // The final dimension is fastest.  The sparse value map omits a missing
  // contribution in 2026-Q1 and preserves a legitimate zero in 2026-Q2.
  value: { 0: 100, 1: 101, 2: 102, 3: 0, 4: 2.1, 5: 2.2, 7: 0 },
  status: { 7: "e" },
};

const rows = parseJsonStat(fixture, {
  frequency: "quarterly",
  now: new Date("2026-09-30T00:00:00Z"),
});
assert.equal(rows.length, 7, "sparse values and the valid zero are retained");
assert.equal(rows.find((row) => row.flatIndex === 7)?.status, "e");
assert.equal(
  rows.some((row) => row.time === "2026-Q3"),
  false,
);
assert.deepEqual(
  rows.slice(0, 3).map(({ date, value }) => [date, value]),
  [
    ["2025-10-01", 100],
    ["2026-01-01", 101],
    ["2026-04-01", 102],
  ],
  "quarterly periods use the quarter's first calendar day",
);

function response(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function datasetFixture(code) {
  const common = (ids, categories, size, value) => ({
    version: "2.0",
    class: "dataset",
    label: `Fixture ${code}`,
    updated: "2026-09-30T11:00:00+0200",
    id: ids,
    size,
    dimension: categories,
    value,
  });
  const time = {
    category: {
      index: { "2025-Q4": 0, "2026-Q1": 1 },
      label: { "2025-Q4": "2025-Q4", "2026-Q1": "2026-Q1" },
    },
  };
  const geo = { category: { index: { DE: 0 }, label: { DE: "Germany" } } };
  if (code === "namq_10_gdp") return fixture;
  if (code === "sts_inpr_m")
    return common(
      ["freq", "indic_bt", "nace_r2", "s_adj", "unit", "geo", "time"],
      {
        freq: { category: { index: { M: 0 }, label: { M: "Monthly" } } },
        indic_bt: {
          category: {
            index: { PRD: 0 },
            label: { PRD: "Production (volume)" },
          },
        },
        nace_r2: {
          category: { index: { "B-D": 0 }, label: { "B-D": "Industry" } },
        },
        s_adj: {
          category: { index: { NSA: 0 }, label: { NSA: "Unadjusted data" } },
        },
        unit: {
          category: { index: { I21: 0 }, label: { I21: "Index, 2021=100" } },
        },
        geo,
        time: {
          category: {
            index: { "2025-10": 0, "2025-11": 1 },
            label: { "2025-10": "2025-10", "2025-11": "2025-11" },
          },
        },
      },
      [1, 1, 1, 1, 1, 1, 2],
      { 0: 99, 1: 100 },
    );
  if (code === "sts_trtu_m")
    return common(
      ["freq", "indic_bt", "nace_r2", "s_adj", "unit", "geo", "time"],
      {
        freq: { category: { index: { M: 0 }, label: { M: "Monthly" } } },
        indic_bt: {
          category: {
            index: { VOL_SLS: 0 },
            label: { VOL_SLS: "Volume of sales" },
          },
        },
        nace_r2: {
          category: { index: { G47: 0 }, label: { G47: "Retail trade" } },
        },
        s_adj: {
          category: { index: { NSA: 0 }, label: { NSA: "Unadjusted data" } },
        },
        unit: {
          category: { index: { I21: 0 }, label: { I21: "Index, 2021=100" } },
        },
        geo,
        time: {
          category: {
            index: { "2025-10": 0, "2025-11": 1 },
            label: { "2025-10": "2025-10", "2025-11": "2025-11" },
          },
        },
      },
      [1, 1, 1, 1, 1, 1, 2],
      { 0: 99, 1: 100 },
    );
  if (code === "gov_10q_ggnfa" || code === "gov_10q_ggdebt") {
    const debt = code === "gov_10q_ggdebt";
    const ids = debt
      ? ["freq", "na_item", "sector", "unit", "geo", "time"]
      : ["freq", "unit", "s_adj", "sector", "na_item", "geo", "time"];
    const dimensions = debt
      ? {
          freq: { category: { index: { Q: 0 }, label: { Q: "Quarterly" } } },
          na_item: {
            category: { index: { GD: 0 }, label: { GD: "Gross debt" } },
          },
          sector: {
            category: {
              index: { S13: 0 },
              label: { S13: "General government" },
            },
          },
          unit: {
            category: {
              index: { PC_GDP: 0 },
              label: { PC_GDP: "Percentage of gross domestic product (GDP)" },
            },
          },
          geo,
          time,
        }
      : {
          freq: { category: { index: { Q: 0 }, label: { Q: "Quarterly" } } },
          unit: {
            category: {
              index: { PC_GDP: 0 },
              label: { PC_GDP: "Percentage of gross domestic product (GDP)" },
            },
          },
          s_adj: {
            category: { index: { NSA: 0 }, label: { NSA: "Unadjusted data" } },
          },
          sector: {
            category: {
              index: { S13: 0 },
              label: { S13: "General government" },
            },
          },
          na_item: {
            category: {
              index: { B9: 0 },
              label: { B9: "Net lending (+)/net borrowing (-)" },
            },
          },
          geo,
          time,
        };
    return common(
      ids,
      dimensions,
      ids.map((id) => (id === "time" ? 2 : 1)),
      { 0: 1.2, 1: 1.1 },
    );
  }
  if (code === "bop_gdp6_q")
    return common(
      [
        "freq",
        "unit",
        "s_adj",
        "bop_item",
        "stk_flow",
        "partner",
        "geo",
        "time",
      ],
      {
        freq: { category: { index: { Q: 0 }, label: { Q: "Quarterly" } } },
        unit: {
          category: {
            index: { PC_GDP: 0 },
            label: { PC_GDP: "Percentage of gross domestic product (GDP)" },
          },
        },
        s_adj: {
          category: { index: { NSA: 0 }, label: { NSA: "Unadjusted data" } },
        },
        bop_item: {
          category: { index: { CA: 0 }, label: { CA: "Current account" } },
        },
        stk_flow: {
          category: { index: { BAL: 0 }, label: { BAL: "Balance" } },
        },
        partner: {
          category: {
            index: { WRL_REST: 0 },
            label: { WRL_REST: "Rest of the world" },
          },
        },
        geo,
        time,
      },
      [1, 1, 1, 1, 1, 1, 1, 2],
      { 0: 2.5, 1: 2.7 },
    );
  return common(
    ["freq", "s_adj", "age", "unit", "sex", "geo", "time"],
    {
      freq: { category: { index: { M: 0 }, label: { M: "Monthly" } } },
      s_adj: {
        category: { index: { NSA: 0 }, label: { NSA: "Unadjusted data" } },
      },
      age: { category: { index: { TOTAL: 0 }, label: { TOTAL: "Total" } } },
      unit: {
        category: {
          index: { PC_ACT: 0 },
          label: { PC_ACT: "Percentage of population in the labour force" },
        },
      },
      sex: { category: { index: { T: 0 }, label: { T: "Total" } } },
      geo,
      time: {
        category: {
          index: { "2025-10": 0, "2025-11": 1 },
          label: { "2025-10": "2025-10", "2025-11": "2025-11" },
        },
      },
    },
    [1, 1, 1, 1, 1, 1, 2],
    { 0: 5.3, 1: 5.2 },
  );
}

let calls = 0;
const mocked = await fetchEurostatMacro({
  countries: [{ id: "DEU", iso2Code: "DE", name: "Germany" }],
  fetchImpl: async (url) => {
    calls += 1;
    const code = new URL(url).pathname.split("/").at(-1);
    return response(datasetFixture(code));
  },
});
assert.equal(
  calls,
  7,
  "one bounded API slice is issued per configured dataset",
);
assert.ok(mocked.some((series) => series.dataset === "eurostat-macro"));
assert.ok(
  mocked.every((series) =>
    series.observations.every(([date]) => /^\d{4}-\d{2}-\d{2}$/.test(date)),
  ),
);
assert.ok(mocked.some((series) => series.indicatorKey === "GDP"));
assert.ok(
  mocked.some((series) => series.indicatorKey === "CURRENT_ACCOUNT_BALANCE"),
);
assert.deepEqual(
  new Set(mocked.map((series) => series.sourceDataset)),
  new Set([
    "namq_10_gdp",
    "sts_inpr_m",
    "sts_trtu_m",
    "gov_10q_ggnfa",
    "gov_10q_ggdebt",
    "bop_gdp6_q",
    "une_rt_m",
  ]),
  "each configured source fixture produces a source-labelled series",
);

const oldCheckedAt = "2026-01-01T00:00:00.000Z";
const retained = await fetchEurostatMacro({
  countries: [{ id: "DEU", iso2Code: "DE", name: "Germany" }],
  previousSeries: [
    {
      id: "EUROSTAT_DE_GDP",
      dataset: "eurostat-macro",
      checkedAt: oldCheckedAt,
      observations: [["2025-01-01", 100]],
    },
  ],
  fetchImpl: async () => {
    throw new Error("fixture outage");
  },
});
assert.equal(retained.length, 1);
assert.equal(retained[0].checkedAt, oldCheckedAt);
assert.equal(retained[0].refreshStatus, "upstream-unavailable");

if (process.argv.includes("--live")) {
  const live = await fetchEurostatMacro({
    countries: [
      { id: "DEU", iso2Code: "DE", name: "Germany" },
      { id: "FRA", iso2Code: "FR", name: "France" },
      { id: "ITA", iso2Code: "IT", name: "Italy" },
    ],
  });
  assert.ok(live.length, "live Eurostat run returned series");
  console.log(
    `Eurostat live check: ${live.length} series; no snapshot written.`,
  );
}

console.log(
  `Eurostat parser/fetch verification passed (${mocked.length} mocked series).`,
);
