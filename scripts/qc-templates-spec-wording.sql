-- QC checklist templates -> the spec's exact wording (V2 Epic 5). OWNER-APPROVED.
-- Run once (or again: it is idempotent) in the Supabase SQL editor. Data only, no schema change.
--
-- WHAT IT DOES
--   Renames the four preloaded templates in place and replaces their parameters with the spec list:
--     Printing 6-Colours -> Printing Checklist        Lamination  -> Lamination Checklist
--     Lamif Flute        -> Lamif Flute Lamination    Die Cutting -> Die Cutting Checklist
--   Matching is by the old OR new name (the table has no isPreloaded column), so a second run is a no-op.
--
-- WHY UPDATE IN PLACE, NOT DELETE + RE-INSERT
--   Past checks reference the template row (template_id, ON DELETE SET NULL) and match the grid / A4 print
--   by parameter_name text. Deleting a template would detach its history (template_id -> NULL) and make it
--   vanish from the checklist. So the row (and its id) is kept, only name/parameters/sort_order change.
--
-- WHY OLD PARAMETERS WITH HISTORY ARE KEPT
--   A parameter that already has recorded checks is appended after the spec parameters, so those checks
--   stay visible on the grid and the print (the app now also refuses to rename/remove such a parameter).
--   Parameters with NO checks are dropped. At time of writing only "Printing 6-Colours" has history
--   (2 checks: "Colour shade vs approved sample", "Registration"), so Printing Checklist ends up with the
--   6 spec rows + those 2 legacy rows; the other three templates end with exactly the spec rows.
--   Deactivating a single parameter is not possible (parameters are a JSON list, no per-row flag), so
--   "keep at the end" is the safe equivalent. Remove them later from the builder once the test data is gone.
--
-- Nothing is deleted. Review the two SELECTs (before / after) in the output.

BEGIN;

SELECT 'BEFORE' AS phase, name, sort_order, jsonb_array_length(parameters) AS n_params,
       (SELECT count(*) FROM mis_qc_checks c WHERE c.template_id = t.id) AS n_checks
FROM mis_qc_templates t WHERE deleted_at IS NULL ORDER BY sort_order, name;

UPDATE mis_qc_templates t
SET name = v.new_name,
    sort_order = v.sort_order,
    parameters = v.spec || COALESCE((
      SELECT jsonb_agg(p.val ORDER BY p.ord)
      FROM jsonb_array_elements_text(t.parameters) WITH ORDINALITY AS p(val, ord)
      WHERE EXISTS (SELECT 1 FROM mis_qc_checks c WHERE c.template_id = t.id AND c.parameter_name = p.val)
        AND NOT (v.spec @> jsonb_build_array(p.val))
    ), '[]'::jsonb),
    updated_at = now()
FROM (VALUES
  ('Printing 6-Colours', 'Printing Checklist', 0,
   '["Shade Matching with Shade Card","Unwanted Marks/Blanket Punch","Front Lay & Side Lay","Scumming","Registration Out","Set-Off/Powdering"]'::jsonb),
  ('Lamination', 'Lamination Checklist', 1,
   '["Type of Lamination (Gloss/Matt)","Bubbles","Wrinkles","Powder/White Patches","Scratches on Film"]'::jsonb),
  ('Lamif Flute', 'Lamif Flute Lamination', 2,
   '["Gripper and Side Lay","Moisture","Bubbles","Fiber Tear Test","Sheets Sticking to Each Other"]'::jsonb),
  ('Die Cutting', 'Die Cutting Checklist', 3,
   '["Box Dimensions (±0.5mm)","Cracking","Burrs/Rough Edges","Clean and Easy Stripping","Punching Out & Embossing Out"]'::jsonb)
) AS v(old_name, new_name, sort_order, spec)
WHERE t.deleted_at IS NULL
  AND t.name IN (v.old_name, v.new_name)
  -- never collide with a different row that already has the new name
  AND NOT EXISTS (SELECT 1 FROM mis_qc_templates o WHERE o.name = v.new_name AND o.id <> t.id);

SELECT 'AFTER' AS phase, name, sort_order, parameters,
       (SELECT count(*) FROM mis_qc_checks c WHERE c.template_id = t.id) AS n_checks
FROM mis_qc_templates t WHERE deleted_at IS NULL ORDER BY sort_order, name;

COMMIT;
