# Sponsor integration map

Resolve's demo path remains usable when every sponsor key is blank. Each adapter fails closed or becomes a no-op; only the PayPal and database variables are required for the core path.

For exact dashboard paths, secret generation, Render wiring, and a first end-to-end checklist, use [sponsor-setup.md](sponsor-setup.md).

| Sponsor | Demo surface | Configuration |
| --- | --- | --- |
| AG Grid / AG Charts | Filterable case grid, approval queue, results charts for refund spend, daily cap, and dispute fees avoided | Built in; no key |
| Render | `render.yaml`, web service, Postgres, and 15-minute maintenance cron | `APP_URL`, `CRON_SECRET` |
| Zapier | `case.needs_approval`, `refund.issued`, and `dispute.opened` outbound events with console approval links | `ZAPIER_WEBHOOK_URL` |
| Postman | `postman/Resolve.postman_collection.json` demo script plus environment and mock instructions | None |
| Elastic | Case/policy indexing, hybrid policy retrieval, and the agent's read-only `find_similar_cases` tool | `ELASTIC_URL`, `ELASTIC_API_KEY`, `ELASTIC_INDEX` |
| Bryntum | Operations timeline data/API for approval SLAs, parcel checks, and dispute deadlines; the view is dependency-free for the hackathon demo | None |
| APIMatic | Typed `PayPalDisputesClient` boundary for get dispute, provide evidence, and accept claim; routes are in `/api/console/disputes/:disputeId` | PayPal variables |
| PayPal tooling | Agent `get_order`, `get_shipment`, and `get_buyer_history` read live PayPal facts while refund authority stays in the executor | PayPal variables |

## Demo order

1. Import the Postman collection and environment.
2. Run a buyer complaint, then open `/console` and show the case grid and approval queue.
3. Show the Results charts and Timeline tab.
4. Approve the case from the console; Zapier receives `refund.issued` if configured.
5. Call the Render cron request to show shipment rechecks and stale approval expiry.
6. For the sponsor deep dive, set Elastic variables and repeat a complaint so the agent trace shows similar-case grounding.
