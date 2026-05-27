-- Cascade property deletes across all dependent tables.
--
-- Symptom from production:
--   "update or delete on table 'properties' violates foreign key constraint
--    'tasks_property_id_fkey' on table 'tasks'"
--
-- The original migration that created `tasks` declared
--   property_id uuid REFERENCES properties(id) ON DELETE CASCADE
-- but the live schema drifted — the constraint exists today without
-- ON DELETE CASCADE, so deleting a property that has tasks is blocked.
--
-- Rather than patch only `tasks`, this migration walks every FK that
-- references public.properties(id) and rewrites any that aren't already
-- ON DELETE CASCADE or ON DELETE SET NULL. That way the next time we add a
-- child table we can't accidentally lock property deletes again.
--
-- We never touch FKs that are intentionally SET NULL (maintenance_tickets,
-- guest_accounts) — those want to outlive the property.

DO $$
DECLARE
  fk RECORD;
  col_list text;
  ref_col_list text;
BEGIN
  FOR fk IN
    SELECT
      c.conname       AS constraint_name,
      n.nspname       AS schema_name,
      cls.relname     AS table_name,
      c.confdeltype   AS delete_action,
      c.conkey        AS conkey,
      c.confkey       AS confkey,
      cls.oid         AS table_oid
    FROM pg_constraint c
    JOIN pg_class      cls   ON cls.oid = c.conrelid
    JOIN pg_namespace  n     ON n.oid   = cls.relnamespace
    JOIN pg_class      rcls  ON rcls.oid = c.confrelid
    JOIN pg_namespace  rn    ON rn.oid  = rcls.relnamespace
    WHERE c.contype = 'f'
      AND rn.nspname = 'public'
      AND rcls.relname = 'properties'
      -- 'a' = NO ACTION, 'r' = RESTRICT. Both block deletes.
      -- 'c' = CASCADE (already what we want), 'n' = SET NULL (intentional).
      AND c.confdeltype IN ('a', 'r')
  LOOP
    -- Build the (col, col, ...) lists for the rebuilt constraint.
    SELECT string_agg(quote_ident(attname), ', ' ORDER BY ord)
      INTO col_list
      FROM unnest(fk.conkey) WITH ORDINALITY AS k(attnum, ord)
      JOIN pg_attribute a
        ON a.attrelid = fk.table_oid AND a.attnum = k.attnum;

    SELECT string_agg(quote_ident(attname), ', ' ORDER BY ord)
      INTO ref_col_list
      FROM unnest(fk.confkey) WITH ORDINALITY AS k(attnum, ord)
      JOIN pg_attribute a
        ON a.attrelid = 'public.properties'::regclass AND a.attnum = k.attnum;

    RAISE NOTICE 'Rewriting % on %.% with ON DELETE CASCADE',
      fk.constraint_name, fk.schema_name, fk.table_name;

    EXECUTE format(
      'ALTER TABLE %I.%I DROP CONSTRAINT %I',
      fk.schema_name, fk.table_name, fk.constraint_name
    );

    EXECUTE format(
      'ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%s) REFERENCES public.properties(%s) ON DELETE CASCADE',
      fk.schema_name, fk.table_name, fk.constraint_name, col_list, ref_col_list
    );
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
