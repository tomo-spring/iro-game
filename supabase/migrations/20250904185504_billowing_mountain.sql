/*
  # Create werewolf game tables

  1. New Tables
    - `werewolf_sessions`
      - `id` (uuid, primary key)
      - `room_id` (text, foreign key to rooms)
      - `citizen_topic` (text) - お題A（市民用）
      - `werewolf_topic` (text) - お題B（言狼用）
      - `phase` (text) - ゲームフェーズ
      - `talk_time_seconds` (integer) - トークタイム残り時間
      - `reverse_mode` (boolean) - 大逆転モード
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
    - `werewolf_assignments`
      - `id` (uuid, primary key)
      - `session_id` (uuid, foreign key)
      - `participant_id` (uuid, foreign key)
      - `role` (text) - 'citizen' or 'werewolf'
      - `topic` (text) - 割り当てられたお題
      - `created_at` (timestamp)
    - `werewolf_votes`
      - `id` (uuid, primary key)
      - `session_id` (uuid, foreign key)
      - `voter_id` (uuid, foreign key)
      - `target_id` (uuid, foreign key)
      - `vote_round` (integer) - 投票ラウンド
      - `created_at` (timestamp)
    - `werewolf_guesses`
      - `id` (uuid, primary key)
      - `session_id` (uuid, foreign key)
      - `werewolf_id` (uuid, foreign key)
      - `guessed_topic` (text) - 言狼が推測した市民のお題
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on all tables
    - Add policies for public access
*/

-- Werewolf Sessions Table
CREATE TABLE IF NOT EXISTS werewolf_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id text NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  citizen_topic text NOT NULL,
  werewolf_topic text NOT NULL,
  phase text NOT NULL DEFAULT 'setup' CHECK (phase IN ('setup', 'talk', 'vote', 'sudden_death', 'reverse_chance', 'finished')),
  talk_time_seconds integer DEFAULT 300,
  reverse_mode boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Werewolf Assignments Table
CREATE TABLE IF NOT EXISTS werewolf_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES werewolf_sessions(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('citizen', 'werewolf')),
  topic text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(session_id, participant_id)
);

-- Werewolf Votes Table
CREATE TABLE IF NOT EXISTS werewolf_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES werewolf_sessions(id) ON DELETE CASCADE,
  voter_id uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  vote_round integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  UNIQUE(session_id, voter_id, vote_round),
  CHECK (voter_id != target_id)
);

-- Werewolf Guesses Table
CREATE TABLE IF NOT EXISTS werewolf_guesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES werewolf_sessions(id) ON DELETE CASCADE,
  werewolf_id uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  guessed_topic text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(session_id, werewolf_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_werewolf_sessions_room_id ON werewolf_sessions(room_id);
CREATE INDEX IF NOT EXISTS idx_werewolf_assignments_session_id ON werewolf_assignments(session_id);
CREATE INDEX IF NOT EXISTS idx_werewolf_votes_session_id ON werewolf_votes(session_id);
CREATE INDEX IF NOT EXISTS idx_werewolf_votes_vote_round ON werewolf_votes(vote_round);
CREATE INDEX IF NOT EXISTS idx_werewolf_guesses_session_id ON werewolf_guesses(session_id);

-- Enable RLS
ALTER TABLE werewolf_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE werewolf_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE werewolf_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE werewolf_guesses ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Anyone can manage werewolf sessions"
  ON werewolf_sessions
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can manage werewolf assignments"
  ON werewolf_assignments
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can manage werewolf votes"
  ON werewolf_votes
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can manage werewolf guesses"
  ON werewolf_guesses
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);