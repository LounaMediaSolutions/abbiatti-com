import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getUserAccess } from "@/lib/access";
import Dashboard from "./Dashboard";
import MyAgenda from "./MyAgenda";

export default function Home() {
  const { user, loading } = useAuth();
  const [isStaff, setIsStaff] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) {
      setIsStaff(null);
      return;
    }

    setIsStaff(null);
    getUserAccess(user.id).then(({ isStaff }) => {
      setIsStaff(isStaff);
    });
  }, [user?.id]);

  if (loading || (user && isStaff === null)) {
    return <div className="p-6 text-center text-muted-foreground">...</div>;
  }
  return isStaff ? <MyAgenda /> : <Dashboard />;
}
