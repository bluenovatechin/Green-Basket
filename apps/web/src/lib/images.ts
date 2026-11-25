import { asset } from "./base";

// Demo photos bundled with the app (public/images). A photo uploaded in Admin always wins.
const BY_NAME: [RegExp, string][] = [
  [/tomato|tamatar/i, "tomato"],
  [/onion|pyaz|dungli/i, "onion"],
  [/potato|aloo|bataka/i, "potato"],
  [/gourd|lauki|dudhi|calabash/i, "bottle-gourd"],
  [/coriander|cilantro|dhania|kothmir/i, "coriander"],
  [/spinach|palak/i, "spinach"],
  [/banana|kela/i, "banana"],
  [/apple|seb/i, "apple"],
  [/dragon|dragan|pitaya/i, "dragon-fruit"],
];

export function productImage(p: { name: string; image_url?: string | null }): string | null {
  if (p.image_url) return p.image_url;
  const hit = BY_NAME.find(([re]) => re.test(p.name));
  return hit ? asset(`images/products/${hit[1]}.jpg`) : null;
}

const CATEGORY: Record<string, string> = {
  vegetables: "cat-vegetables",
  "leafy-herbs": "cat-leafy",
  fruits: "cat-fruits",
};

export function categoryImage(slug: string): string | null {
  return CATEGORY[slug] ? asset(`images/${CATEGORY[slug]}.jpg`) : null;
}

export const heroImage = () => asset("images/hero.jpg");
