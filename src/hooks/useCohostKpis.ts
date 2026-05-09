import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CohostKpis {
  // Business
  reservationsCount: number;
  revenue: number;
  nightsSold: number;
  occupancyRate: number; // 0..1
  // Service
  avgResponseMinutes: number | null;
  tasksOnTimeRate: number | null; // 0..1
  tasksDoneCount: number;
  tasksTotalCount: number;
  ticketsResolvedCount: number;
  ticketsOpenCount: number;
  avgTicketResolutionHours: number | null;
  avgGuestRating: number | null;
  guestRatingCount: number;
}

export interface CohostKpiResult {
  total: CohostKpis;
  currentMonth: CohostKpis;
  loading: boolean;
}

const EMPTY: CohostKpis = {
  reservationsCount: 0,
  revenue: 0,
  nightsSold: 0,
  occupancyRate: 0,
  avgResponseMinutes: null,
  tasksOnTimeRate: null,
  tasksDoneCount: 0,
  tasksTotalCount: 0,
  ticketsResolvedCount: 0,
  ticketsOpenCount: 0,
  avgTicketResolutionHours: null,
  avgGuestRating: null,
  guestRatingCount: 0,
};

function nightsBetween(ci: string, co: string) {
  const a = new Date(ci).getTime();
  const b = new Date(co).getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
}

function compute(
  reservations: any[],
  tasks: any[],
  tickets: any[],
  responseDelays: number[],
  windowStart: Date,
  windowEnd: Date,
  propertyCount: number,
): CohostKpis {
  const inWindow = (d: string | null | undefined) => {
    if (!d) return false;
    const t = new Date(d).getTime();
    return t >= windowStart.getTime() && t <= windowEnd.getTime();
  };

  const res = reservations.filter(r =>
    r.status !== "cancelled" &&
    new Date(r.check_in) <= windowEnd &&
    new Date(r.check_out) >= windowStart
  );

  const nights = res.reduce((s, r) => {
    const ci = new Date(Math.max(new Date(r.check_in).getTime(), windowStart.getTime()));
    const co = new Date(Math.min(new Date(r.check_out).getTime(), windowEnd.getTime()));
    return s + Math.max(0, Math.round((co.getTime() - ci.getTime()) / 86400000));
  }, 0);

  const revenue = res.reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalAvailableNights =
    propertyCount * Math.max(1, Math.round((windowEnd.getTime() - windowStart.getTime()) / 86400000));
  const occupancy = totalAvailableNights > 0 ? nights / totalAvailableNights : 0;

  const tasksWindow = tasks.filter(t => inWindow(t.created_at) || inWindow(t.completed_at));
  const tasksDone = tasksWindow.filter(t => t.status === "done");
  const tasksOnTime = tasksDone.filter(
    t => t.due_at && t.completed_at && new Date(t.completed_at) <= new Date(t.due_at)
  );
  const onTimeRate = tasksDone.length > 0 ? tasksOnTime.length / tasksDone.length : null;

  const ticketsWindow = tickets.filter(t => inWindow(t.created_at));
  const ticketsResolved = ticketsWindow.filter(t => t.resolved_at);
  const avgResHours = ticketsResolved.length
    ? ticketsResolved.reduce(
        (s, t) => s + (new Date(t.resolved_at).getTime() - new Date(t.created_at).getTime()) / 3600000,
        0,
      ) / ticketsResolved.length
    : null;

  const ratings = tasksWindow.filter(t => t.guest_rating != null).map(t => t.guest_rating);
  const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;

  const avgResponse = responseDelays.length
    ? responseDelays.reduce((a, b) => a + b, 0) / responseDelays.length
    : null;

  return {
    reservationsCount: res.length,
    revenue,
    nightsSold: nights,
    occupancyRate: occupancy,
    avgResponseMinutes: avgResponse,
    tasksOnTimeRate: onTimeRate,
    tasksDoneCount: tasksDone.length,
    tasksTotalCount: tasksWindow.length,
    ticketsResolvedCount: ticketsResolved.length,
    ticketsOpenCount: ticketsWindow.length - ticketsResolved.length,
    avgTicketResolutionHours: avgResHours,
    avgGuestRating: avgRating,
    guestRatingCount: ratings.length,
  };
}

export function useCohostKpis(cohostUserId: string | null, propertyIds: string[]): CohostKpiResult {
  const [state, setState] = useState<CohostKpiResult>({
    total: EMPTY,
    currentMonth: EMPTY,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    if (!cohostUserId || propertyIds.length === 0) {
      setState({ total: EMPTY, currentMonth: EMPTY, loading: false });
      return;
    }

    (async () => {
      const [resR, tasksR, ticketsR, msgR] = await Promise.all([
        supabase.from("reservations").select("id,property_id,check_in,check_out,amount,status,created_at").in("property_id", propertyIds),
        supabase.from("tasks").select("id,property_id,status,due_at,completed_at,created_at,guest_rating").in("property_id", propertyIds),
        supabase.from("maintenance_tickets").select("id,property_id,created_at,resolved_at,status").in("property_id", propertyIds),
        supabase.from("guest_messages").select("id,guest_account_id,sender_role,sender_id,created_at,guest_accounts!inner(property_id)").in("guest_accounts.property_id", propertyIds).order("created_at", { ascending: true }),
      ]);

      // Compute response delays: for each guest msg, find next host msg from this cohost on same guest_account
      const messages = (msgR.data ?? []) as any[];
      const byGuest: Record<string, any[]> = {};
      for (const m of messages) byGuest[m.guest_account_id] = [...(byGuest[m.guest_account_id] ?? []), m];
      const delays: number[] = [];
      for (const list of Object.values(byGuest)) {
        for (let i = 0; i < list.length - 1; i++) {
          const cur = list[i];
          if (cur.sender_role !== "guest") continue;
          // find next host msg by this cohost
          for (let j = i + 1; j < list.length; j++) {
            if (list[j].sender_role === "host" && list[j].sender_id === cohostUserId) {
              const dt = (new Date(list[j].created_at).getTime() - new Date(cur.created_at).getTime()) / 60000;
              if (dt >= 0 && dt < 60 * 24 * 7) delays.push(dt);
              break;
            }
          }
        }
      }

      if (cancelled) return;

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      const allStart = new Date(2000, 0, 1);

      const reservations = resR.data ?? [];
      const tasks = tasksR.data ?? [];
      const tickets = ticketsR.data ?? [];

      setState({
        total: compute(reservations, tasks, tickets, delays, allStart, now, propertyIds.length),
        currentMonth: compute(reservations, tasks, tickets, delays, monthStart, monthEnd, propertyIds.length),
        loading: false,
      });
    })();

    return () => { cancelled = true; };
  }, [cohostUserId, propertyIds.join(",")]);

  return state;
}
