-- Only the assignee may mark a task as completed.
--
-- The existing tasks RLS already lets managers (super_admin / admin / co_admin
-- / cohost) UPDATE any task in their organization. That's fine for editing
-- fields like title, due_at, priority, assigned_to, etc. — managers should be
-- able to do all CRUD. But marking a task as "done" is the assignee's
-- workflow action: it represents the person who actually did the work
-- signing off on it. Letting a super-admin flip status to "done" undermines
-- the audit trail and the accountability the field is supposed to capture.
--
-- The UI already hides the "Finish" button from non-assignees (Tasks.tsx).
-- This trigger enforces the same rule server-side so the rule can't be
-- bypassed by hand-crafted API calls — including by super-admins, who
-- otherwise have FOR ALL access via the "Super admins manage tasks" policy.
--
-- Rule: an UPDATE that transitions tasks.status TO 'done' is only accepted
-- when auth.uid() = OLD.assigned_to. Using OLD.assigned_to (not NEW) closes
-- the obvious bypass where a manager could reassign the task to themselves
-- in the same update and then mark it done.
--
-- Edge cases:
--   • Unassigned tasks (assigned_to IS NULL) cannot be marked done by anyone.
--     This is intentional — assign first, then complete.
--   • Service-role / direct SQL connections bypass this (auth.uid() is NULL),
--     which is appropriate for admin recovery scripts.
--   • Transitions in the opposite direction (done → todo, done → issue) are
--     not restricted by this trigger — managers can reopen a wrongly-closed
--     task. The trigger only fires on transitions INTO 'done'.

CREATE OR REPLACE FUNCTION public.enforce_task_completion_assignee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- Only fire when status is transitioning TO 'done'. If the row was already
  -- 'done' and another field is being updated, leave it alone.
  IF NEW.status = 'done' AND (OLD.status IS DISTINCT FROM 'done') THEN
    -- Allow service-role / SQL admin paths where auth.uid() is unset.
    IF auth.uid() IS NULL THEN
      RETURN NEW;
    END IF;

    IF OLD.assigned_to IS NULL OR OLD.assigned_to <> auth.uid() THEN
      RAISE EXCEPTION 'Only the assignee can mark a task as completed.'
        USING ERRCODE = '42501'; -- insufficient_privilege
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_task_completion_assignee ON public.tasks;
CREATE TRIGGER trg_enforce_task_completion_assignee
  BEFORE UPDATE OF status ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_task_completion_assignee();

-- Reload PostgREST so the new function/trigger is visible without a redeploy.
NOTIFY pgrst, 'reload schema';
