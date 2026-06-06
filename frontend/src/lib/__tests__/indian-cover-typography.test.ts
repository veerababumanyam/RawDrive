import { describe, expect, it } from "vitest";
import {
  buildCoverGoogleFontsHref,
  COVER_TEXT_LANGUAGES,
  fontFamilyForCoverText,
  getCoverFontsForLanguage,
  normalizeCoverFontForLanguage,
} from "../indian-cover-typography";

describe("Indian cover typography catalog", () => {
  it("offers at least 10 fonts for every supported cover language", () => {
    for (const language of COVER_TEXT_LANGUAGES) {
      expect(
        getCoverFontsForLanguage(language.id).length,
        `${language.label} should expose at least 10 fonts`,
      ).toBeGreaterThanOrEqual(10);
    }
  });

  it("curates creative headline fonts by Indic language", () => {
    const namesFor = (languageId: string) =>
      getCoverFontsForLanguage(languageId).map((font) => font.name);

    expect(namesFor("telugu")).toEqual(
      expect.arrayContaining([
        "Sirivennela",
        "Ravi Prakash",
        "Lakki Reddy",
        "Tenali Ramakrishna",
        "Ponnala",
      ]),
    );
    expect(namesFor("hindi")).toEqual(
      expect.arrayContaining(["Kalam", "Yatra One", "Modak", "Alkatra"]),
    );
    expect(namesFor("bengali")).toEqual(
      expect.arrayContaining(["Baloo Da 2", "Atma", "Galada", "Alkatra"]),
    );
    expect(namesFor("tamil")).toEqual(
      expect.arrayContaining(["Kavivanar", "Baloo Thambi 2", "Arima"]),
    );
    expect(namesFor("kannada")).toEqual(
      expect.arrayContaining([
        "Baloo Tamma 2",
        "Akaya Kanadaka",
        "Padyakke Expanded One",
      ]),
    );
    expect(namesFor("urdu")).toEqual(
      expect.arrayContaining([
        "Noto Kufi Arabic",
        "Baloo Bhaijaan 2",
        "Aref Ruqaa Ink",
        "Rakkas",
      ]),
    );
  });

  it("normalizes unsupported fonts to the selected language catalog", () => {
    expect(normalizeCoverFontForLanguage("Inter", "telugu")).toBe(
      "Noto Sans Telugu",
    );
    expect(normalizeCoverFontForLanguage("Inter", "urdu")).toBe(
      "Noto Nastaliq Urdu",
    );
  });

  it("builds a Google Fonts href and script-aware CSS family", () => {
    expect(buildCoverGoogleFontsHref(["Anek Telugu", "Anek Telugu"])).toContain(
      "family=Anek+Telugu:wght@400;500;600;700",
    );
    expect(fontFamilyForCoverText("Anek Telugu", "telugu")).toBe(
      "'Anek Telugu', 'Noto Sans Telugu', sans-serif",
    );
    expect(buildCoverGoogleFontsHref(["Sirivennela"])).toContain(
      "family=Sirivennela:wght@400;500;600;700",
    );
  });
});
