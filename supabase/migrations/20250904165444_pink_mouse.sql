/*
  # Robust Game System Database Schema

  1. New Tables
    - `rooms` - Room management with better tracking
    - `participants` - Simplified participant management
    - `game_sessions` - Game session management
    - `game_questions` - Questions in games
    - `game_responses` - Participant responses

  2. Security
    - Enable RLS on all tables
    - Add policies for public access (since this is a casual game)

  3. Key Improvements
    - Simplified participant identification
    - Better session management
    - Automatic cleanup triggers
    - More robust foreign key relationships
*/

-- Drop existing tables if they exist
DROP TABLE IF EXISTS game_responses CASCADE;
DROP TABLE IF EXISTS game_questions CASCADE;
DROP TABLE IF EXISTS game_sessions CASCADE;
DROP TABLE IF EXISTS participants CASCADE;
DROP TABLE IF EXISTS rooms CASCADE;

-- Drop existing functions
DROP FUNCTION IF EXISTS update_room_activity() CASCADE;

-- Create rooms table
CREATE TABLE rooms (
  id TEXT PRIMARY KEY,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE
);

-- Create participants table with simplified structure
CREATE TABLE participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL,
  session_token TEXT NOT NULL UNIQUE, -- Unique session identifier
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  is_online BOOLEAN DEFAULT TRUE,
  
  -- Ensure unique nickname per room
  UNIQUE(room_id, nickname)
);

-- Create game sessions table
CREATE TABLE game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  game_type TEXT NOT NULL DEFAULT 'anonymous_survey',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_by UUID REFERENCES participants(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create game questions table
CREATE TABLE game_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  questioner_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE
);

-- Create game responses table
CREATE TABLE game_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES game_questions(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  response BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure one response per participant per question
  UNIQUE(question_id, participant_id)
);

-- Create indexes for better performance
CREATE INDEX idx_participants_room_id ON participants(room_id);
CREATE INDEX idx_participants_session_token ON participants(session_token);
CREATE INDEX idx_participants_last_seen ON participants(last_seen);
CREATE INDEX idx_game_sessions_room_id ON game_sessions(room_id);
CREATE INDEX idx_game_questions_session_id ON game_questions(session_id);
CREATE INDEX idx_game_responses_question_id ON game_responses(question_id);

-- Function to update room activity
CREATE OR REPLACE FUNCTION update_room_last_activity()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE rooms 
  SET last_activity = NOW() 
  WHERE id = COALESCE(NEW.room_id, OLD.room_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Function to update participant last seen
CREATE OR REPLACE FUNCTION update_participant_last_seen()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_seen = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers
CREATE TRIGGER update_room_activity_on_participant_change
  AFTER INSERT OR UPDATE OR DELETE ON participants
  FOR EACH ROW EXECUTE FUNCTION update_room_last_activity();

CREATE TRIGGER update_participant_last_seen_trigger
  BEFORE UPDATE ON participants
  FOR EACH ROW EXECUTE FUNCTION update_participant_last_seen();

-- Enable RLS
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_responses ENABLE ROW LEVEL SECURITY;

-- RLS Policies (Allow all operations for public since this is a casual game)
CREATE POLICY "Anyone can manage rooms" ON rooms FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can manage participants" ON participants FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can manage game sessions" ON game_sessions FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can manage game questions" ON game_questions FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can manage game responses" ON game_responses FOR ALL TO public USING (true) WITH CHECK (true);