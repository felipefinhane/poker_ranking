import { z } from "zod";

export const CreateMatchSchema = z.object({
  request_id: z.string().uuid(),
  tournament_id: z.string().uuid(),
  played_at: z.string().datetime(),
});

export const AddParticipantsSchema = z.object({
  request_id: z.string().uuid(),
  match_id: z.string().uuid(),
  participants: z
    .array(
      z.object({
        player_id: z.string().uuid(),
        position: z.number().int().positive(),
        knockouts: z.number().int().min(0).default(0), // 👈 novo
      }),
    )
    .min(1),
});

export const PatchMatchPositionsSchema = z.object({
  request_id: z.string().uuid(),
  participants: z
    .array(
      z.object({
        player_id: z.string().uuid(),
        position: z.number().int().positive().optional(),
        knockouts: z.number().int().min(0).optional(), // 👈 permitir ajustar alma
      }),
    )
    .min(1),
});

export const GetRankingSchema = z.object({
  tournament_id: z.string().uuid(),
});
