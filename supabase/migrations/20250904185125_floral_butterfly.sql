/*
  # Create synchro game tables

  1. New Tables
    - `synchro_questions`
      - `id` (uuid, primary key)
      - `session_id` (uuid, foreign key to game_sessions)
      - `question` (text)
      - `gm_id` (uuid, foreign key to participants)
      - `created_at` (timestamp)
      - `is_active` (boolean)
    - `synchro_responses`
      - `id` (uuid, primary key)
      - `question_id` (uuid, foreign key to synchro_questions)
      - `participant_id` (uuid, foreign key to participants)
      - `answer` (text)
      - `created_at` (timestamp)
      - Unique constraint on (question_id, participant_id)

  2. Security
    - Enable RLS on both tables
    - Add policies for public access (matching existing game tables)

  3. Indexes
    - Add indexes for frequently queried columns
*/

-- Create synchro_questions table
CREATE TABLE IF NOT EXISTS synchro_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  question text NOT NULL,
  gm_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  is_active boolean DEFAULT true
);

-- Create synchro_responses table
CREATE TABLE IF NOT EXISTS synchro_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL,
  participant_id uuid NOT NULL,
  answer text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Add foreign key constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'synchro_questions_session_id_fkey'
  ) THEN
    ALTER TABLE synchro_questions 
    ADD CONSTRAINT synchro_questions_session_id_fkey 
    FOREIGN KEY (session_id) REFERENCES game_sessions(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'synchro_questions_gm_id_fkey'
  ) THEN
    ALTER TABLE synchro_questions 
    ADD CONSTRAINT synchro_questions_gm_id_fkey 
    FOREIGN KEY (gm_id) REFERENCES participants(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'synchro_responses_question_id_fkey'
  ) THEN
    ALTER TABLE synchro_responses 
    ADD CONSTRAINT synchro_responses_question_id_fkey 
    FOREIGN KEY (question_id) REFERENCES synchro_questions(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'synchro_responses_participant_id_fkey'
  ) THEN
    ALTER TABLE synchro_responses 
    ADD CONSTRAINT synchro_responses_participant_id_fkey 
    FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add unique constraint for synchro_responses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'synchro_responses_question_id_participant_id_key'
  ) THEN
    ALTER TABLE synchro_responses 
    ADD CONSTRAINT synchro_responses_question_id_participant_id_key 
    UNIQUE (question_id, participant_id);
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_synchro_questions_session_id ON synchro_questions(session_id);
CREATE INDEX IF NOT EXISTS idx_synchro_responses_question_id ON synchro_responses(question_id);

-- Enable Row Level Security
ALTER TABLE synchro_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE synchro_responses ENABLE ROW LEVEL SECURITY;

-- Create policies (matching existing game table policies)
CREATE POLICY "Anyone can manage synchro questions"
  ON synchro_questions
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can manage synchro responses"
  ON synchro_responses
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);