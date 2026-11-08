DELETE FROM "shipments"
WHERE "id" IN (
  SELECT "id"
  FROM (
    SELECT "id", row_number() OVER (PARTITION BY "order_id" ORDER BY "created_at", "id") AS "n"
    FROM "shipments"
  ) AS "duplicates"
  WHERE "n" > 1
);
--> statement-breakpoint
CREATE UNIQUE INDEX "shipments_one_per_order" ON "shipments" USING btree ("order_id");
