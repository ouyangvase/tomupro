import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Order } from '@/types/database';

interface DeliveryChargeMap {
  [area: string]: number;
}

interface ClaimPreview {
  ordersCount: number;
  grossBND: number;
  deliveryChargesBND: number;
  netBND: number;
  missingAreas: string[];
  orderBreakdown: Array<{
    orderId: string;
    orderCode: string;
    area: string | null;
    amount: number;
    deliveryCharge: number;
    netAmount: number;
  }>;
}

const NO_AREA_LABEL = 'No Area';

export function useDeliveryCharges() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['delivery-charges-approved', user?.id],
    queryFn: async () => {
      if (!user) return {};

      const { data, error } = await supabase
        .from('delivery_charges')
        .select('area, charge_amount')
        .eq('runner_id', user.id)
        .eq('status', 'APPROVED')
        .is('superseded_at', null);

      if (error) throw error;

      const chargeMap: DeliveryChargeMap = {};
      data?.forEach((c) => {
        chargeMap[c.area.toLowerCase()] = Number(c.charge_amount);
      });

      return chargeMap;
    },
    enabled: !!user,
  });
}

export function useClaimPreview(orders: Order[], exchangeRate: number): ClaimPreview {
  const { data: deliveryCharges = {} } = useDeliveryCharges();

  return useMemo(() => {
    const missingAreas: string[] = [];
    const orderBreakdown: ClaimPreview['orderBreakdown'] = [];
    let grossBND = 0;
    let deliveryChargesBND = 0;

    for (const order of orders) {
      const amount = Number(order.total_amount);
      const normalizedArea = order.area?.trim() || '';
      const area = normalizedArea.toLowerCase();
      let deliveryCharge = 0;

      if (normalizedArea) {
        const charge = deliveryCharges[area];
        if (charge === undefined) {
          if (!missingAreas.includes(normalizedArea)) {
            missingAreas.push(normalizedArea);
          }
        } else {
          deliveryCharge = charge;
        }
      } else if (!missingAreas.includes(NO_AREA_LABEL)) {
        missingAreas.push(NO_AREA_LABEL);
      }

      grossBND += amount;
      deliveryChargesBND += deliveryCharge;

      orderBreakdown.push({
        orderId: order.id,
        orderCode: order.order_code,
        area: normalizedArea || null,
        amount,
        deliveryCharge,
        netAmount: amount - deliveryCharge,
      });
    }

    const netBND = grossBND - deliveryChargesBND;

    return {
      ordersCount: orders.length,
      grossBND,
      deliveryChargesBND,
      netBND,
      missingAreas,
      orderBreakdown,
    };
  }, [orders, deliveryCharges]);
}
