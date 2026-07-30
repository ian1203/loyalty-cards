import { redirect } from "next/navigation";
import { getVerifiedSession } from "../../lib/supabase/session";
import { CreateBusinessForm } from "./CreateBusinessForm";

export default async function AdminPage() {
  const session = await getVerifiedSession();

  if (!session.authenticated) {
    redirect("/login");
  }

  if (session.kind !== "platform_admin") {
    return <p>No tienes acceso a esta página.</p>;
  }

  return (
    <main>
      <h1>Alta de negocio</h1>
      <CreateBusinessForm />
    </main>
  );
}
