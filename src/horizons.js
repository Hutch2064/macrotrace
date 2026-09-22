export const horizons = [
  ["1", "1 day"],
  ["7", "1 week"],
  ["30", "1 month"],
  ["90", "3 months"],
  ["182", "6 months"],
  ["ytd", "Year to date"],
  ["12m", "Previous 12 months"],
  ["365", "1 year"],
  ["1095", "3 years"],
  ["1825", "5 years"],
  ["3650", "10 years"],
  ["max", "Maximum"],
];
export const horizonLabel = (value) =>
  horizons.find(([id]) => id === String(value))?.[1] ?? String(value);
export function fillHorizons(select, value = "365") {
  select.replaceChildren(
    ...horizons.map(([id, label]) => new Option(label, id)),
  );
  select.value = value;
}
