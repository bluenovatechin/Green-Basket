import { asset } from "./base";

// Demo photos bundled with the app (public/images, WebP in two sizes). A photo uploaded in Admin always wins.
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

export interface ImgSet { src: string; srcSet?: string }

const bundled = (path: string): ImgSet => ({
  src: asset(`${path}.webp`),
  srcSet: `${asset(`${path}-sm.webp`)} 240w, ${asset(`${path}.webp`)} 480w`,
});

/** Old baskets saved in the browser may still point at the former .jpg demo photos. */
function upgradeLegacy(url: string): string {
  return /\/images\/(products\/)?[\w-]+\.jpg$/.test(url) ? url.replace(/\.jpg$/, ".webp") : url;
}

export function productImageSet(p: { name: string; image_url?: string | null }): ImgSet | null {
  if (p.image_url) return { src: upgradeLegacy(p.image_url) };
  const hit = BY_NAME.find(([re]) => re.test(p.name));
  return hit ? bundled(`images/products/${hit[1]}`) : null;
}

export function productImage(p: { name: string; image_url?: string | null }): string | null {
  return productImageSet(p)?.src ?? null;
}

const CATEGORY: Record<string, string> = {
  vegetables: "cat-vegetables",
  "leafy-herbs": "cat-leafy",
  fruits: "cat-fruits",
};

export function categoryImageSet(slug: string): ImgSet | null {
  return CATEGORY[slug] ? bundled(`images/${CATEGORY[slug]}`) : null;
}

export function categoryImage(slug: string): string | null {
  return categoryImageSet(slug)?.src ?? null;
}

export const heroImageSet = (): ImgSet => ({
  src: asset("images/hero.webp"),
  srcSet: `${asset("images/hero-sm.webp")} 560w, ${asset("images/hero.webp")} 960w`,
});
export const heroImage = () => heroImageSet().src;
