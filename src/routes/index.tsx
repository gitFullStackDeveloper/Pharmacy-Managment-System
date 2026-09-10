import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { Pill } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    navigate({ to: user ? "/dashboard" : "/login" });
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--gradient-soft)" }}>
      <div className="flex items-center gap-3 text-foreground">
        <Pill className="h-6 w-6 text-primary animate-pulse" />
        <span className="font-medium">PharmaCare</span>
      </div>
    </div>
  );
}
