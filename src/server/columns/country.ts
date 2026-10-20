import { ValidationError } from "../../lib/errors";
import { TEXT_OPS, testText } from "./ops";
import type { ColumnLogic } from "./types";
import { isObj } from "./util";

/** country: `{ countryCode, countryName }` (API shape, ISO 3166-1 alpha-2). */
export type CountryValue = { countryCode: string; countryName: string };

export const COUNTRY_CODES = ("AF AX AL DZ AS AD AO AI AQ AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BQ BA BW BV BR IO BN BG BF BI CV KH CM CA KY CF TD CL CN CX CC CO KM CG CD CK CR CI HR CU CW CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF PF TF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT HM VA HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NL NC NZ NI NE NG NU NF MK MP NO OM PK PW PS PA PG PY PE PH PN PL PT PR QA RE RO RU RW BL SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA GS SS ES LK SD SR SJ SE CH SY TW TJ TZ TH TL TG TK TO TT TN TR TM TC TV UG UA AE GB US UM UY UZ VU VE VN VG VI WF EH YE ZM ZW").split(" ");

const names = new Map<string, Intl.DisplayNames>();
export function countryName(code: string, locale = "en"): string {
  let dn = names.get(locale);
  if (!dn) names.set(locale, (dn = new Intl.DisplayNames([locale], { type: "region" })));
  try {
    return dn.of(code) ?? code;
  } catch {
    return code;
  }
}

export const flagEmoji = (code: string): string => String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)));

/** Find a country from a code or an English/Dutch name. */
export function findCountry(input: string): string | null {
  const s = input.trim();
  if (/^[A-Za-z]{2}$/.test(s) && COUNTRY_CODES.includes(s.toUpperCase())) return s.toUpperCase();
  const low = s.toLowerCase();
  return COUNTRY_CODES.find((c) => countryName(c, "en").toLowerCase() === low || countryName(c, "nl").toLowerCase() === low) ?? null;
}

export const countryColumn: ColumnLogic<CountryValue> = {
  type: "country",
  label: "Country",
  category: "advanced",
  icon: "Location",
  defaultSettings: () => ({}),
  validate(input) {
    if (input === null || input === undefined || input === "") return null;
    const raw = isObj(input) ? String(input.countryCode ?? input.countryName ?? "") : String(input);
    const code = findCountry(raw);
    if (!code) throw new ValidationError(`Unknown country: ${JSON.stringify(input)}`);
    return { countryCode: code, countryName: countryName(code, "en") };
  },
  serialize: (v) => v,
  format: (v) => (v ? v.countryName : ""),
  filter: {
    operators: [{ id: "any_of", label: "Is any of", needsOperand: true }, { id: "none_of", label: "Is none of", needsOperand: true }, ...TEXT_OPS.filter((o) => o.id === "contains" || o.id.startsWith("is_"))],
    test(v, op, operand) {
      if (op === "any_of" || op === "none_of") {
        const w = (Array.isArray(operand) ? operand : [operand]).map((x) => String(x).toUpperCase());
        const hit = !!v && w.includes(v.countryCode);
        return op === "any_of" ? hit : !hit;
      }
      return testText(v?.countryName ?? "", op, operand);
    },
  },
  sortKey: (v) => (v ? v.countryName.toLowerCase() : null),
  summarize(vals) {
    const counts = new Map<string, number>();
    for (const v of vals) if (v) counts.set(v.countryName, (counts.get(v.countryName) ?? 0) + 1);
    return counts.size ? { segments: [...counts].map(([label, count]) => ({ label, color: "#579bfc", count })) } : null;
  },
};
