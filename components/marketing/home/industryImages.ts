import type { StaticImageData } from "next/image";

import retail from "./images/industries/retail.jpg";
import realEstate from "./images/industries/real-estate.jpg";
import education from "./images/industries/education.jpg";
import healthcare from "./images/industries/healthcare.jpg";
import services from "./images/industries/services.jpg";
import ecommerce from "./images/industries/ecommerce.jpg";

/**
 * Photography for the homepage industry cards, keyed by industry id
 * (components/marketing/industries.ts).
 *
 * STATIC IMPORTS, NOT /public. Next fingerprints these into /_next/static/media,
 * which the site proxy never intercepts, and next/image resizes them to the card —
 * a file under /public would be redirected to /login for signed-out visitors by
 * proxy.ts. No external host is involved at runtime.
 *
 * SOURCES. Every photo is from StockSnap.io under CC0 1.0 (public domain dedication:
 * free for commercial use, no attribution required), downloaded at 960px wide via the
 * Openverse catalogue. Credits are kept here for provenance:
 *
 *   retail       "Clothes Store"   — Pavlo Luchkovski  https://stocksnap.io/photo/clothes-store-Q2WKRAM2O4
 *   real-estate  "House Home"      — Binyamin Mellish  https://stocksnap.io/photo/house-home-LJ515CPAKI
 *   education    "People Girls"    — Brodie Vissers    https://stocksnap.io/photo/people-girls-N444PJYUP9
 *   healthcare   "Doctor Patient"  — Direct Media      https://stocksnap.io/photo/doctor-patient-7NQJS4WWQW
 *   services     "Writing Papers"  — Helloquence       https://stocksnap.io/photo/writing-papers-Y01VDYAX63
 *   ecommerce    "Woman Mobile"    — Bruce Mars        https://stocksnap.io/photo/woman-mobile-Q93BUD2Z3Z
 *
 * An industry without an entry (Finance, Automotive) renders its card without a photo.
 */
export const INDUSTRY_IMAGES: Partial<Record<string, StaticImageData>> = {
  retail,
  "real-estate": realEstate,
  education,
  healthcare,
  services,
  ecommerce,
};
