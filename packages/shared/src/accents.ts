const EXTRA: Record<string, string> = {
  Œ: "OE",
  œ: "oe",
  Æ: "AE",
  æ: "ae",
  ß: "ss",
  Ÿ: "Y",
  ÿ: "y",
  "€": "EUR",
  "’": "'",
  "‘": "'",
  "“": '"',
  "”": '"',
  "–": "-",
  "—": "-",
  "…": "...",
  "°": " ",
  "«": '"',
  "»": '"',
  "²": "2",
  "³": "3",
};

export function toPrinterAscii(input: string): string {
  let s = input;
  for (const [from, to] of Object.entries(EXTRA)) {
    s = s.split(from).join(to);
  }
  s = s.normalize("NFD").replace(/\p{M}/gu, "");
  return s.replace(/[^\x20-\x7E\n\r]/g, "?");
}
