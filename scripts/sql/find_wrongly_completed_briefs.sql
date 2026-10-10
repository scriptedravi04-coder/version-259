-- Session 24. Briefs that were auto-marked COMPLETED while slots were still open
-- (bug: "Completed · Recruited 1/2"). Read-only: review the list first.
select b.id, b.title, b.brand_id, b.max_creators, b.claimed_count, b.budget,
       count(o.id) filter (where upper(coalesce(o.status,'')) in ('COMPLETED','PAID','RELEASED')
                           or upper(coalesce(o.payment_status,'')) in ('RELEASED','PAID')) as done_orders,
       (b.max_creators - count(o.id) filter (where upper(coalesce(o.status,'')) <> 'CANCELLED')) as open_slots,
       (b.max_creators - count(o.id) filter (where upper(coalesce(o.status,'')) <> 'CANCELLED')) * b.budget as escrow_on_open_slots
from public.ugc_briefs b
left join public.ugc_orders o on o.brief_id = b.id
where upper(coalesce(b.status,'')) = 'COMPLETED'
group by b.id
having count(o.id) filter (where upper(coalesce(o.status,'')) <> 'CANCELLED') < b.max_creators
order by b.created_at desc;

-- To reopen them for creators (only after reviewing the list above):
-- update public.ugc_briefs set status = 'OPEN' where id in ( ...ids from above... );
