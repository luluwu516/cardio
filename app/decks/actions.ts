"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Game } from "@/lib/cards/types";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

function parseGame(raw: FormDataEntryValue | null): Game | null {
  return raw === "YGO" || raw === "MTG" ? raw : null;
}

export async function createDeck(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const game = parseGame(formData.get("game"));
  if (!name || !game) return;

  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("decks")
    .insert({ user_id: user.id, name, game })
    .select("id")
    .single();
  if (error) throw error;

  revalidatePath("/decks");
  redirect(`/decks/${data.id}`);
}

export async function renameDeck(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return;

  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("decks")
    .update({ name })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw error;

  revalidatePath("/decks");
  revalidatePath(`/decks/${id}`);
}

export async function deleteDeck(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { supabase, user } = await requireUser();
  await supabase.from("decks").delete().eq("id", id).eq("user_id", user.id);

  revalidatePath("/decks");
  redirect("/decks");
}
