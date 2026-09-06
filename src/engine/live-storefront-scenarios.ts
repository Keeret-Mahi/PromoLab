import type { CartFixture, Discount, Scenario } from '../domain/types.ts';
import type {
  PromoLabProduct,
  PromoLabProductVariant,
} from '../shopify/model.ts';

interface ProductVariantCandidate {
  product: PromoLabProduct;
  variant: PromoLabProductVariant;
}

function discountByCode(discounts: Discount[], code: string): Discount {
  const discount = discounts.find(
    (candidate) => candidate.code.toLowerCase() === code.toLowerCase(),
  );
  if (!discount) {
    throw new Error(
      `Live Storefront execution requires an active ${code} discount in Shopify Admin data.`,
    );
  }
  return discount;
}

function isEligible(
  discount: Discount,
  product: PromoLabProduct,
  variant: PromoLabProductVariant,
): boolean {
  const eligibility = discount.eligibility;
  if (eligibility.allProducts) return true;
  return eligibility.productIds.includes(product.id)
    || eligibility.variantIds.includes(variant.id)
    || Boolean(variant.sku && eligibility.skus.includes(variant.sku));
}

function selectEligibleVariant(
  discount: Discount,
  products: PromoLabProduct[],
): ProductVariantCandidate {
  const eligible = products
    .flatMap((product) => product.variants.map((variant) => ({ product, variant })))
    .filter(({ product, variant }) => isEligible(discount, product, variant))
    .sort((left, right) =>
      left.product.title.localeCompare(right.product.title)
      || left.variant.title.localeCompare(right.variant.title)
      || left.variant.id.localeCompare(right.variant.id),
    );
  const techNest = eligible.find(({ product, variant }) =>
    /technest/i.test(`${product.title} ${variant.title}`),
  );
  const selected = techNest ?? eligible[0];
  if (!selected) {
    const truncationNote = discount.eligibility.mayBeTruncated
      ? ' Shopify reported that the discount eligibility connection was truncated.'
      : '';
    throw new Error(
      `No fetched Shopify product variant is known to be eligible for ${discount.code}.${truncationNote}`,
    );
  }
  if (!selected.variant.id.startsWith('gid://shopify/ProductVariant/')) {
    throw new Error(`Shopify returned an invalid ProductVariant GID for ${selected.product.title}.`);
  }
  return selected;
}

function eligibleQuantity(discount: Discount, variant: PromoLabProductVariant): number {
  const minimumQuantity = Math.max(discount.eligibility.minimumQuantity ?? 1, 1);
  const minimumSubtotal = discount.eligibility.minimumSubtotal ?? 0;
  if (minimumSubtotal > 0 && variant.price <= 0) {
    throw new Error(
      `Cannot satisfy ${discount.code}'s minimum subtotal with a zero-priced Shopify variant.`,
    );
  }
  return Math.max(minimumQuantity, Math.ceil(minimumSubtotal / (variant.price || 1)));
}

/** Builds the first focused live suite from normalized Admin products and discounts. */
export function generateLiveStorefrontScenarios(
  discounts: Discount[],
  products: PromoLabProduct[],
): Scenario[] {
  const summer = discountByCode(discounts, 'SUMMER20');
  const welcome = discountByCode(discounts, 'WELCOME10');
  const { product, variant } = selectEligibleVariant(summer, products);
  const quantity = eligibleQuantity(summer, variant);
  const cart: CartFixture = {
    id: `live-${variant.id.split('/').at(-1) ?? 'variant'}`,
    name: `${product.title} · ${variant.title}`,
    description: `Live Shopify variant selected as eligible for ${summer.code}.`,
    lines: [{
      merchandiseId: variant.id,
      sku: variant.sku ?? variant.id,
      title: `${product.title} · ${variant.title}`,
      quantity,
      unitPrice: variant.price,
    }],
    shippingPrice: 0,
  };

  return [
    { id: 'live-summer20', sequence: 1, cart, discountCodes: [summer.code] },
    { id: 'live-welcome10', sequence: 2, cart, discountCodes: [welcome.code] },
    {
      id: 'live-summer20-welcome10',
      sequence: 3,
      cart,
      discountCodes: [summer.code, welcome.code],
    },
  ];
}
