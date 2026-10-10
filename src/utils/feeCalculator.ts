import { SupabaseClient } from '@supabase/supabase-js';

export interface AppliedCoupon {
  id?: string;
  code?: string;
  type?: 'zero_fee' | 'fee_rate_override' | 'flat_discount' | string;
  override_fee_rate?: number;
  discount_amount?: number;
  value?: number;
  [key: string]: any;
}

export async function calculateFee(
  grossAmount: number,
  supabaseOrCoupon?: SupabaseClient | AppliedCoupon | null,
  appliedCouponParam?: AppliedCoupon | null
) {
  let supabase: SupabaseClient | undefined;
  let appliedCoupon: AppliedCoupon | undefined;

  if (supabaseOrCoupon && typeof (supabaseOrCoupon as any).from === 'function') {
    supabase = supabaseOrCoupon as SupabaseClient;
    appliedCoupon = appliedCouponParam || undefined;
  } else if (supabaseOrCoupon && typeof supabaseOrCoupon === 'object') {
    appliedCoupon = supabaseOrCoupon as AppliedCoupon;
  }

  let config: any = null;
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('platform_fee_config')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!error && data) {
        config = data;
      }
    } catch (e) {
      console.warn("Fee config fetch warning, using standard tiered rule:", e);
    }
  }

  const threshold = (config?.threshold_amount != null && !isNaN(Number(config.threshold_amount))) ? Number(config.threshold_amount) : 20000;
  const belowRate = (config?.below_threshold_rate != null && !isNaN(Number(config.below_threshold_rate))) ? Number(config.below_threshold_rate) : 15.0;
  const aboveRate = (config?.above_threshold_rate != null && !isNaN(Number(config.above_threshold_rate))) ? Number(config.above_threshold_rate) : 5.0;

  let rate = grossAmount < threshold ? belowRate : aboveRate;

  let platformFee = Math.round((grossAmount * rate) / 100);
  let discountApplied = 0;

  // Session 36 (Ravi): "offer mode" — ₹0 platform fee + a small convenience fee (admin sets the %,
  // default 2%). Coupons do not stack on top of it. The fee a deal gets is stamped on its transaction
  // when the brand pays; payouts read that stamp (backend/stampedFee.ts), so switching the offer off
  // never changes a deal that was paid during it.
  const offerOn = config?.offer_mode === true;
  const offerPct = (config?.offer_fee_pct != null && !isNaN(Number(config.offer_fee_pct))) ? Math.max(0, Math.min(100, Number(config.offer_fee_pct))) : 2.0;
  if (offerOn) {
    const normalFee = platformFee;
    rate = offerPct;
    platformFee = Math.round((grossAmount * offerPct) / 100);
    discountApplied = Math.max(0, normalFee - platformFee);
  }

  if (!offerOn && appliedCoupon && appliedCoupon.type) {
    const couponType = appliedCoupon.type;
    if (couponType === 'zero_fee') {
      rate = 0;
      discountApplied = platformFee;
      platformFee = 0;
    } else if (couponType === 'fee_rate_override' || couponType === 'override_fee_rate') {
      const overrideRate = Number(appliedCoupon.override_fee_rate ?? appliedCoupon.value ?? 0);
      rate = overrideRate;
      const originalFee = platformFee;
      platformFee = Math.round((grossAmount * overrideRate) / 100);
      discountApplied = Math.max(0, originalFee - platformFee);
    } else if (couponType === 'flat_discount') {
      const flatDisc = Number(appliedCoupon.discount_amount ?? appliedCoupon.value ?? 0);
      discountApplied = Math.min(platformFee, flatDisc);
      platformFee = Math.max(0, platformFee - flatDisc);
    }
  }

  const isGstRegistered = Boolean(config?.platform_gst_registered);
  const gstRate = isGstRegistered ? ((Number(config?.gst_rate) || 18.0) / 100) : 0;
  const gstAmount = Math.round(platformFee * gstRate);
  const creatorNet = Math.round(grossAmount - platformFee - gstAmount);

  return {
    grossAmount,
    feePercent: rate,
    platformFee,
    gstAmount,
    creatorNet,
    discountApplied,
    appliedCoupon: offerOn ? undefined : appliedCoupon,
    feeKind: offerOn ? 'convenience' : 'platform'
  };
}
