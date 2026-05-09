import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const navigateMock = vi.fn();
const signOutMock = vi.fn();
let authState: { user: any; loading: boolean } = { user: { id: "u1" }, loading: false };

vi.mock("react-router-dom", async () => {
  const actual: any = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ ...authState, signOut: signOutMock }),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const mockTables: Record<string, any> = {};
function builder(table: string) {
  const result = mockTables[table];
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    maybeSingle: async () => ({ data: result?.single ?? null, error: null }),
    then: (resolve: any) => resolve({ data: result?.list ?? [], error: null }),
  };
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => builder(table),
    storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "" } }) }) },
  },
}));

import GuestPortal from "../GuestPortal";

const renderPortal = () =>
  render(
    <MemoryRouter>
      <GuestPortal />
    </MemoryRouter>
  );

describe("GuestPortal access control", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    signOutMock.mockReset();
    for (const k of Object.keys(mockTables)) delete mockTables[k];
    authState = { user: { id: "u1" }, loading: false };
  });

  it("redirects unauthenticated users to /auth", async () => {
    authState = { user: null, loading: false };
    renderPortal();
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/auth"));
  });

  it("redirects non-guest users to /", async () => {
    mockTables.user_roles = { list: [{ role: "admin" }] };
    renderPortal();
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/", { replace: true })
    );
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("signs out guest with no guest_account (deleted after 3 days)", async () => {
    mockTables.user_roles = { list: [{ role: "guest" }] };
    mockTables.guest_accounts = { single: null };
    renderPortal();
    await waitFor(() => expect(signOutMock).toHaveBeenCalled());
    expect(navigateMock).toHaveBeenCalledWith("/auth", { replace: true });
  });

  it("allows guest with valid guest_account", async () => {
    mockTables.user_roles = { list: [{ role: "guest" }] };
    mockTables.guest_accounts = {
      single: {
        id: "ga1",
        organization_id: "org1",
        property_id: null,
        reservation_id: null,
        full_name: "Jane",
        email: "j@x.com",
        phone: null,
        language: "fr",
        marketing_consent: false,
      },
    };
    renderPortal();
    await waitFor(() => {
      expect(signOutMock).not.toHaveBeenCalled();
      expect(navigateMock).not.toHaveBeenCalledWith("/auth");
      expect(navigateMock).not.toHaveBeenCalledWith("/", { replace: true });
    });
  });
});
