import { createClient } from "@supabase/supabase-js";
export const configured = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
);
export const supabase = configured
  ? createClient(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_ANON_KEY,
      {
        auth: {
          flowType: "pkce",
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      },
    )
  : null;
export type Photo = { id: string; path: string };
export type Profile = {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  age: number;
  gender: string;
  seeking: string;
  province: string;
  city: string;
  area: string;
  intentions: string;
  interests: string[];
  languages: string[];
  photos: Photo[];
  budget_min: number;
  budget_max: number;
  availability: string;
};
export type Me = Profile & {
  dob: string;
  role: string;
  status: string;
  must_change_password: boolean;
  verified: boolean;
  complete: boolean;
  min_age: number;
  max_age: number;
  paused: boolean;
  show_area: boolean;
  low_data: boolean;
  quiet_start: number;
  quiet_end: number;
  reminders: boolean;
};
export type Match = { id: string; profile: Profile; created_at: string };
export type Message = {
  id: string;
  sender: string;
  body: string;
  created_at: string;
  client_id: string;
};
export type Plan = {
  id: string;
  match_id: string;
  proposer: string;
  venue: string;
  area: string;
  scheduled_at: string;
  budget_zar: number;
  note: string;
  status: string;
  version: number;
};
export const provinces = [
  "Gauteng",
  "Western Cape",
  "KwaZulu-Natal",
  "Eastern Cape",
  "Free State",
  "Limpopo",
  "Mpumalanga",
  "North West",
  "Northern Cape",
];
export const intentions = [
  "A lasting relationship",
  "Dating with intention",
  "Exploring connections",
];
export async function rpc<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (!supabase) throw Error("Supabase is not configured");
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw Error(error.message);
  return data as T;
}
export async function account<T>(action: string, body?: unknown): Promise<T> {
  const { data } = await supabase!.auth.getSession();
  if (!data.session) throw Error("Please log in again");
  const raw = body instanceof Blob;
  const res = await fetch(`/.netlify/functions/account?action=${action}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      "Content-Type": raw ? "application/octet-stream" : "application/json",
    },
    body: raw ? body : JSON.stringify(body || {}),
  });
  const result = await res.json();
  if (!res.ok) throw Error(result.error || "Request failed");
  return result;
}
export const dateLabel = (v: string) =>
  new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(v));
export const money = (v: number) =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(v);
export function samePage(a: Profile, b: Profile) {
  const facts: string[] = [];
  if (a.intentions === b.intentions)
    facts.push(`You both want ${a.intentions.toLowerCase()}.`);
  const shared = a.interests.filter((i) =>
    b.interests.some((j) => j.toLowerCase() === i.toLowerCase()),
  );
  if (shared.length) facts.push(`You share ${shared.join(", ")}.`);
  if (a.availability === b.availability)
    facts.push(`You both prefer ${a.availability.toLowerCase()}.`);
  if (a.budget_max >= b.budget_min && b.budget_max >= a.budget_min)
    facts.push("Your preferred date budgets overlap.");
  return facts;
}
export async function compressPhoto(file: File, lowData: boolean) {
  if (!["image/jpeg", "image/png"].includes(file.type))
    throw Error("Choose a JPEG or PNG image");
  if (file.size > 6 * 1024 * 1024)
    throw Error("Choose a photo smaller than 6 MB");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(
    1,
    (lowData ? 720 : 1200) / Math.max(bitmap.width, bitmap.height),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(Error("Image compression failed"))),
      "image/jpeg",
      lowData ? 0.65 : 0.82,
    ),
  );
}
// Translation keys are centralised; user content is never automatically translated.
export const copy = {
  en: {
    promise: "Real chemistry. Your kind of connection.",
    discover: "Discover",
    likes: "Likes",
    chats: "Chats",
    plans: "Plans",
    you: "You",
    empty: "Good connections take their time.",
  },
};
