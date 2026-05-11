"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function changeQuantity(formData: FormData) {
  const id = formData.get("id") as string;
  const delta = Number(formData.get("delta") ?? 0);
  if (!id || !Number.isFinite(delta) || delta === 0) return;

  const { supabase, user } = await requireUser();

  const { data: row, error } = await supabase
    .from("user_cards")
    .select("id, quantity")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (error || !row) return;

  const next = row.quantity + delta;
  if (next <= 0) {
    await supabase.from("user_cards").delete().eq("id", id);
  } else {
    await supabase.from("user_cards").update({ quantity: next }).eq("id", id);
  }
  revalidatePath("/collection");
  revalidatePath("/cards", "layout");
}

export async function removeFromCollection(formData: FormData) {
  const id = formData.get("id") as string;
  if (!id) return;
  const { supabase, user } = await requireUser();
  await supabase
    .from("user_cards")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  revalidatePath("/collection");
  revalidatePath("/cards", "layout");
}
