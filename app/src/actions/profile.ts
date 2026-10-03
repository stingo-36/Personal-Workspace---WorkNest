"use server";

import { revalidatePath } from "next/cache";

import { checkOpenRouterKey, clearOpenRouterKey, getAiSettings, saveOpenRouterKey, saveOpenRouterModel } from "@/lib/ai-settings";
import { prisma } from "@/lib/prisma";
import { fail, ok, parseOrFail } from "@/lib/result";
import { requireUserId } from "@/lib/session";
import { saveOpenRouterKeySchema, saveOpenRouterModelSchema, updateProfileSchema } from "@/lib/validation";

/** Profile settings: name, sprint calendar, and whether tickets are used. */
export async function updateProfile(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(updateProfileSchema, input);
  if (!parsed.ok) return parsed;

  const { name, sprintStartDate, sprintLengthDays, ticketsEnabled } = parsed.data;
  await prisma.user.update({
    where: { id: userId },
    data: {
      name: name || null,
      sprintStartDate: sprintStartDate ? new Date(`${sprintStartDate}T00:00:00.000Z`) : null,
      sprintLengthDays,
      ticketsEnabled,
    },
  });

  // Nav, sprint calendars and ticket sections all read these settings.
  revalidatePath("/", "layout");
  return ok({ saved: true });
}

/** Store the user's OpenRouter key (encrypted) after OpenRouter confirms it. Input: { apiKey } */
export async function saveAiKey(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(saveOpenRouterKeySchema, input);
  if (!parsed.ok) return parsed;
  if ((await checkOpenRouterKey(parsed.data.apiKey)) === "invalid") {
    return fail("VALIDATION_ERROR", "OpenRouter rejected that key", { apiKey: "OpenRouter rejected that key" });
  }
  await saveOpenRouterKey(userId, parsed.data.apiKey);
  revalidatePath("/profile");
  return ok(await getAiSettings(userId));
}

export async function removeAiKey() {
  const userId = await requireUserId();
  await clearOpenRouterKey(userId);
  revalidatePath("/profile");
  return ok(await getAiSettings(userId));
}

/** Input: { model } — comma-separated ids, "" for the default. */
export async function saveAiModel(input: unknown) {
  const userId = await requireUserId();
  const parsed = parseOrFail(saveOpenRouterModelSchema, input);
  if (!parsed.ok) return parsed;
  await saveOpenRouterModel(userId, parsed.data.model);
  revalidatePath("/profile");
  return ok(await getAiSettings(userId));
}
