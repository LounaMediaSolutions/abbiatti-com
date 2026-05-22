import { supabase } from "@/integrations/supabase/client";

export const UNASSIGNED_PROPERTY_ORG_NAME = "Unassigned properties";

type SupabaseLikeError = {
  code?: string | null;
  message?: string | null;
};

const isNotNullOrgIdError = (error: SupabaseLikeError | null | undefined) =>
  error?.code === "23502" || error?.message?.toLowerCase().includes('null value in column "org_id"') === true;

export const isUnassignedPropertyOrgName = (name: string | null | undefined) =>
  name === UNASSIGNED_PROPERTY_ORG_NAME;

export async function resolveUnassignedPropertyOrgId() {
  const { data: existing, error: existingError } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("name", UNASSIGNED_PROPERTY_ORG_NAME)
    .order("created_at", { ascending: true })
    .limit(1);

  if (existingError) throw existingError;
  if (existing && existing.length > 0) return existing[0].id;

  const { data: created, error: createError } = await supabase
    .from("organizations")
    .insert([{ name: UNASSIGNED_PROPERTY_ORG_NAME }])
    .select("id")
    .single();

  if (createError) throw createError;
  return created.id;
}

export async function detachPropertyFromOrganization(propertyId: string) {
  const detachResult = await supabase
    .from("properties")
    .update({ org_id: null } as never)
    .eq("id", propertyId);

  if (!detachResult.error) {
    return { orgId: null as string | null };
  }

  if (!isNotNullOrgIdError(detachResult.error)) {
    throw detachResult.error;
  }

  const fallbackOrgId = await resolveUnassignedPropertyOrgId();
  const fallbackResult = await supabase
    .from("properties")
    .update({ org_id: fallbackOrgId } as never)
    .eq("id", propertyId);

  if (fallbackResult.error) throw fallbackResult.error;
  return { orgId: fallbackOrgId };
}
