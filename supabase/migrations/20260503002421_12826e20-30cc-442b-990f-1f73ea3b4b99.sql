
-- Enums
CREATE TYPE public.task_type AS ENUM ('cleaning','driving','decoration','maintenance','laundry','checkin','checkout','shopping','other');
CREATE TYPE public.task_status AS ENUM ('todo','in_progress','done','issue');
CREATE TYPE public.task_photo_kind AS ENUM ('before','during','after','issue');

-- tasks table
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE,
  assigned_to uuid,
  created_by uuid NOT NULL,
  title text NOT NULL,
  type public.task_type NOT NULL DEFAULT 'cleaning',
  status public.task_status NOT NULL DEFAULT 'todo',
  priority int NOT NULL DEFAULT 2,
  due_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  guest_name text,
  guest_rating int CHECK (guest_rating BETWEEN 1 AND 5),
  guest_comment text,
  staff_notes text,
  issue_description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tasks_org ON public.tasks(organization_id);
CREATE INDEX idx_tasks_assigned ON public.tasks(assigned_to);
CREATE INDEX idx_tasks_status ON public.tasks(status);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view tasks"
  ON public.tasks FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Admins and cohosts insert tasks"
  ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), organization_id, 'admin'::app_role)
    OR has_role(auth.uid(), organization_id, 'cohost'::app_role)
  );

CREATE POLICY "Admins, cohosts and assignee update tasks"
  ON public.tasks FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), organization_id, 'admin'::app_role)
    OR has_role(auth.uid(), organization_id, 'cohost'::app_role)
    OR assigned_to = auth.uid()
  );

CREATE POLICY "Admins and cohosts delete tasks"
  ON public.tasks FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), organization_id, 'admin'::app_role)
    OR has_role(auth.uid(), organization_id, 'cohost'::app_role)
  );

CREATE TRIGGER tasks_set_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- task_photos table
CREATE TABLE public.task_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  uploaded_by uuid NOT NULL,
  storage_path text NOT NULL,
  kind public.task_photo_kind NOT NULL DEFAULT 'after',
  caption text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_photos_task ON public.task_photos(task_id);

ALTER TABLE public.task_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view task photos"
  ON public.task_photos FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Org members insert task photos"
  ON public.task_photos FOR INSERT TO authenticated
  WITH CHECK (
    is_org_member(auth.uid(), organization_id)
    AND uploaded_by = auth.uid()
  );

CREATE POLICY "Uploader or managers delete task photos"
  ON public.task_photos FOR DELETE TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR has_role(auth.uid(), organization_id, 'admin'::app_role)
    OR has_role(auth.uid(), organization_id, 'cohost'::app_role)
  );

-- Storage bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('task-photos', 'task-photos', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies. Path convention: {organization_id}/{task_id}/{filename}
CREATE POLICY "Org members can view task photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'task-photos'
    AND is_org_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "Org members can upload task photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'task-photos'
    AND is_org_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "Uploader can delete own task photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'task-photos'
    AND owner = auth.uid()
  );
