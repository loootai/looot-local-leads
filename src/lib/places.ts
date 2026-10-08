/** A business read from a Google Maps search answer. */
export interface Place {
  place_key: string;
  name: string;
  category: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviews: number | null;
  maps_url: string | null;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

function first(o: Obj, keys: string[]): unknown {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== "") return o[k];
  return undefined;
}
function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[^\d.]/g, "")) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Keeps a website only when it is an http(s) address that is not a Google or social profile page. */
export function cleanWebsite(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const url = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(url);
    if (/(^|\.)(google\.[a-z.]+|goo\.gl|facebook\.com|instagram\.com|linkedin\.com|yelp\.[a-z.]+|tripadvisor\.[a-z.]+)$/i.test(u.hostname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function toPlace(o: Obj): Place | null {
  const name = str(first(o, ["title", "name", "business_name", "displayName"])) ?? (isObj(o.displayName) ? str(o.displayName.text) : null);
  const address = str(first(o, ["address", "formatted_address", "formattedAddress", "full_address", "vicinity"]));
  if (!name || (!address && !first(o, ["place_id", "placeId", "cid"]))) return null;
  const types = first(o, ["types", "categories"]);
  const category = str(first(o, ["category", "type", "categoryName", "main_category", "primaryTypeDisplayName"])) ?? (Array.isArray(types) ? str(types[0]) : null);
  const key = str(first(o, ["place_id", "placeId", "cid", "data_id", "dataId", "id"])) ?? `${name}|${address ?? ""}`.toLowerCase();
  return {
    place_key: String(key),
    name,
    category,
    address,
    phone: str(first(o, ["phone", "phoneNumber", "phone_number", "international_phone_number", "nationalPhoneNumber", "formatted_phone_number"])),
    website: cleanWebsite(first(o, ["website", "websiteUri", "site", "web", "domain"])),
    rating: num(first(o, ["rating", "stars", "totalScore", "review_rating"])),
    reviews: num(first(o, ["reviews", "ratingCount", "reviewsCount", "reviews_count", "user_ratings_total", "userRatingCount", "review_count"])),
    maps_url: str(first(o, ["link", "maps_url", "googleMapsUri", "place_link", "url"])),
  };
}

/** Finds the list of places in a provider's answer (places[], local_results[], results[], data[] ...). */
export function extractPlaces(result: unknown, maxDepth = 4): Place[] {
  const queue: { v: unknown; d: number }[] = [{ v: result, d: 0 }];
  while (queue.length) {
    const { v, d } = queue.shift()!;
    if (Array.isArray(v)) {
      const places = v.filter(isObj).map(toPlace).filter((p): p is Place => p !== null);
      if (places.length) {
        const seen = new Set<string>();
        return places.filter((p) => (seen.has(p.place_key) ? false : (seen.add(p.place_key), true)));
      }
    } else if (isObj(v) && d < maxDepth) {
      for (const c of Object.values(v)) if (typeof c === "object" && c !== null) queue.push({ v: c, d: d + 1 });
    }
  }
  return [];
}
