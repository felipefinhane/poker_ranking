export type UUID = string;

export type Player = {
  id: UUID;
  name: string;
  email?: string | null;
};

export type Tournament = {
  id: UUID;
  name: string;
  start_at: string;
  end_at?: string | null;
};

export type Match = {
  id: UUID;
  tournament_id: UUID;
  played_at: string;
};

export type MatchParticipant = {
  match_id: UUID;
  player_id: UUID;
  position: number; // 1 = campeão
  points_awarded: number;
};

export type RankingRow = {
  player_id: UUID;
  player_name: string;
  total_points: number;
  last_update: string;
};
