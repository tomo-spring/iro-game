/*
  # Add Ranking Game Support

  1. New Tables
    - `ranking_questions` - stores ranking game questions
      - `id` (uuid, primary key)
      - `session_id` (uuid, foreign key to game_sessions)
      - `question` (text, the ranking topic)
      - `questioner_id` (uuid, foreign key to participants)
      - `created_at` (timestamp)
      - `is_active` (boolean)
    
    - `ranking_responses` - stores participant ranking choices
      - `id` (uuid, primary key)
      - `question_id` (uuid, foreign key to ranking_questions)
      - `participant_id` (uuid, foreign key to participants)
      - `rank_choice` (integer, the rank they chose)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on both tables
    - Add policies for public access (matching existing game tables)

  3. Indexes
    - Add indexes for efficient querying
*/

-- Create ranking_questions table
CREATE TABLE IF NOT EXISTS ranking_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  question text NOT NULL,
  questioner_id uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  is_active boolean DEFAULT true
);

-- Create ranking_responses table
CREATE TABLE IF NOT EXISTS ranking_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES ranking_questions(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  rank_choice integer NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(question_id, participant_id)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_ranking_questions_session_id ON ranking_questions(session_id);
CREATE INDEX IF NOT EXISTS idx_ranking_responses_question_id ON ranking_responses(question_id);
CREATE INDEX IF NOT EXISTS idx_ranking_responses_rank_choice ON ranking_responses(rank_choice);

-- Enable RLS
ALTER TABLE ranking_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ranking_responses ENABLE ROW LEVEL SECURITY;

-- Add policies for public access
CREATE POLICY "Anyone can manage ranking questions"
  ON ranking_questions
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can manage ranking responses"
  ON ranking_responses
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);